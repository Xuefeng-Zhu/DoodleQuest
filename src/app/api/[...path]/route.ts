import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { z } from "zod";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/server/db";
import { assets, projects, gifts, jobs } from "@/server/schema";
import {
  HttpError,
  owner,
  owned,
  shared,
  sameOrigin,
  createSession,
  unlock,
  rateLimit,
} from "@/server/security";
import { env, mode } from "@/server/env";
import {
  newProject,
  projectView,
  requestGeneration,
  publish,
  activeStatuses,
} from "@/server/repository";
import { asset, storage, normalizeImage, saveAsset } from "@/server/storage";
import { GiftConfigSchema } from "@/domain/config";
import { deleteProject } from "@/server/cleanup";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
async function bounded(req: NextRequest, max: number) {
  const reader = req.body?.getReader();
  if (!reader) return Buffer.alloc(0);
  let size = 0;
  const parts: Uint8Array[] = [];
  while (true) {
    const r = await reader.read();
    if (r.done) break;
    size += r.value.length;
    if (size > max) {
      await reader.cancel();
      throw new HttpError(
        413,
        "Request too large. Please use an image under 10 MB.",
      );
    }
    parts.push(r.value);
  }
  return Buffer.concat(parts);
}
async function json(req: NextRequest) {
  try {
    return JSON.parse((await bounded(req, 16000)).toString());
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new HttpError(400, "Invalid JSON request.");
  }
}
async function handler(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  try {
    const parts = (await params).path;
    const [root, id, action] = parts;
    const method = req.method;
    if (method !== "GET") sameOrigin(req);
    if (root === "session" && method === "POST") {
      rateLimit("sessions", 100, 3600_000);
      return createSession(req);
    }
    if (root === "mode" && method === "GET")
      return NextResponse.json({
        mode: mode(),
        accessRequired: !!env.key || env.mock,
      });
    if (root === "gifts" && id && method === "GET") {
      const g = shared(id),
        s = JSON.parse(g.snapshot);
      return NextResponse.json(
        {
          config: s.config,
          source: s.source,
          version: s.version,
          modelUrl: s.modelAsset
            ? `/api/assets/${s.modelAsset}?gift=${id}`
            : undefined,
          drawingUrl: s.drawingAsset
            ? `/api/assets/${s.drawingAsset}?gift=${id}`
            : undefined,
        },
        { headers: { "Cache-Control": "private, no-store" } },
      );
    }
    if (root === "assets" && id && method === "GET") {
      const a = asset(id);
      const t = req.nextUrl.searchParams.get("gift");
      if (t) {
        const g = shared(t),
          s = JSON.parse(g.snapshot);
        if (
          g.projectId !== a.projectId ||
          ![s.modelAsset, s.drawingAsset].includes(a.id)
        )
          throw new HttpError(404, "Asset unavailable.");
      } else owned(a.projectId, owner(req).id);
      const bytes = await storage.read(a.filename);
      return new NextResponse(new Uint8Array(bytes), {
        headers: {
          "Content-Type":
            a.kind === "model" ? "model/gltf-binary" : "image/png",
          "Cache-Control": "private, no-store",
          "Content-Length": String(bytes.length),
        },
      });
    }
    const session = owner(req);
    if (root === "unlock" && method === "POST") {
      unlock(
        session.id,
        z.object({ code: z.string().max(200) }).parse(await json(req)).code,
      );
      return NextResponse.json({ unlocked: true });
    }
    if (root !== "projects") throw new HttpError(404, "Not found.");
    if (!id) {
      if (method === "GET")
        return NextResponse.json(
          db
            .select()
            .from(projects)
            .where(eq(projects.owner, session.id))
            .orderBy(desc(projects.updatedAt))
            .all()
            .map(projectView),
        );
      if (method === "POST") {
        rateLimit("drafts:" + session.id, 20, 3600_000);
        return NextResponse.json(projectView(newProject(session.id)), {
          status: 201,
        });
      }
    }
    const p = owned(id, session.id);
    if (!action && method === "GET")
      return NextResponse.json(projectView(p), {
        headers: { "Cache-Control": "no-store" },
      });
    if (!action && method === "PATCH") {
      const config = GiftConfigSchema.parse(await json(req));
      db.update(projects)
        .set({ config: JSON.stringify(config), updatedAt: Date.now() })
        .where(eq(projects.id, id))
        .run();
      return NextResponse.json(projectView(owned(id, session.id)));
    }
    if (!action && method === "DELETE") {
      await deleteProject(id);
      return NextResponse.json({ deleted: true });
    }
    if (action === "drawing" && method === "POST") {
      rateLimit("uploads:" + session.id, 20, 3600_000);
      const running = db
        .select()
        .from(jobs)
        .where(
          and(eq(jobs.projectId, id), inArray(jobs.status, activeStatuses)),
        )
        .get();
      if (running)
        throw new HttpError(
          409,
          "Let this generation finish before replacing its drawing.",
        );
      const raw = await bounded(req, 10 * 1024 * 1024 + 65536);
      const form = await new Response(new Uint8Array(raw), {
        headers: { "Content-Type": req.headers.get("content-type") || "" },
      }).formData();
      const sample = form.get("sample") === "true";
      let input: Buffer;
      if (sample) input = await readFile("public/sample-drawing.png");
      else {
        const file = form.get("file");
        if (
          !(file instanceof File) ||
          !["image/png", "image/jpeg"].includes(file.type) ||
          file.size > 10 * 1024 * 1024
        )
          throw new HttpError(
            400,
            "Choose a JPEG or PNG image smaller than 10 MB.",
          );
        input = Buffer.from(await file.arrayBuffer());
      }
      const rotation = z.coerce
        .number()
        .refine((n) => [0, 90, 180, 270].includes(n))
        .parse(form.get("rotation") || 0);
      const original = await normalizeImage(input);
      const originalId = await saveAsset(id, "original", original, {
        sample,
        metadataStripped: true,
      });
      const normalized = await normalizeImage(
        input,
        rotation,
        form.get("crop") === "true",
      );
      const inputAsset = await saveAsset(id, "drawing", normalized, {
        sample,
        originalId,
        rotation,
        crop: form.get("crop") === "true",
      });
      db.update(projects)
        .set({
          inputAsset,
          revision: p.revision + 1,
          modelAsset: null,
          approved: 0,
          source: sample ? "procedural" : "tripo",
          updatedAt: Date.now(),
        })
        .where(eq(projects.id, id))
        .run();
      return NextResponse.json(projectView(owned(id, session.id)));
    }
    if (action === "generate" && method === "POST") {
      const body = z
        .object({
          key: z.string().uuid(),
          consent: z.literal(true),
          retry: z.boolean().default(false),
        })
        .parse(await json(req));
      if (!env.key && !env.mock)
        throw new HttpError(
          503,
          "Example mode cannot turn uploads into custom models. Configure Tripo to generate, or use the clearly labeled Pip sample.",
        );
      if (!session.unlocked)
        throw new HttpError(
          403,
          "Enter the creator access code before paid generation.",
        );
      rateLimit("generate:" + session.id, 8, 3600_000);
      return NextResponse.json(requestGeneration(p, body.key, body.retry));
    }
    if (action === "approve" && method === "POST") {
      const body = z.object({ loaded: z.literal(true) }).parse(await json(req));
      if (!p.inputAsset) throw new HttpError(409, "Choose a drawing.");
      if (!p.modelAsset && p.source !== "procedural")
        throw new HttpError(409, "Your model is not ready.");
      db.update(projects)
        .set({ approved: 1, updatedAt: Date.now() })
        .where(eq(projects.id, id))
        .run();
      return NextResponse.json(projectView(owned(id, session.id)));
    }
    if (action === "publish" && method === "POST") {
      rateLimit("publish:" + session.id, 20, 3600_000);
      const g = publish(p);
      return NextResponse.json({
        token: g.token,
        version: g.version,
        url: `${env.origin}/gift/${g.token}`,
      });
    }
    if (action === "revoke" && method === "POST") {
      const { shareId } = z
        .object({ shareId: z.string().uuid() })
        .parse(await json(req));
      db.update(gifts)
        .set({ revoked: 1 })
        .where(and(eq(gifts.id, shareId), eq(gifts.projectId, id)))
        .run();
      return NextResponse.json({ revoked: true });
    }
    throw new HttpError(404, "Action not found.");
  } catch (e) {
    if (e instanceof HttpError)
      return NextResponse.json({ error: e.message }, { status: e.status });
    if (e instanceof z.ZodError)
      return NextResponse.json(
        {
          error:
            "Please check the fields. " +
            e.issues.map((i) => i.path.join(".") + ": " + i.message).join("; "),
        },
        { status: 400 },
      );
    return NextResponse.json(
      {
        error:
          "This step could not be completed. Your saved draft is still here.",
      },
      { status: 500 },
    );
  }
}
export { handler as GET, handler as POST, handler as PATCH, handler as DELETE };
