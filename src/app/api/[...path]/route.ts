import { NextRequest, NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import { z } from "zod";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db, ready, transaction } from "@/server/db";
import { projects, gifts, jobs } from "@/server/schema";
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
  requestMotion,
  assertNoActiveMotion,
} from "@/server/repository";
import { asset, storage, normalizeImage, saveAsset } from "@/server/storage";
import { GiftConfigSchema } from "@/domain/config";
import { deleteProject } from "@/server/cleanup";
import { dispatchJob } from "@/server/dispatch";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
async function bounded(
  req: NextRequest,
  max: number,
  message = "Request too large.",
) {
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
      throw new HttpError(413, message);
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
function uploadLimitLabel() {
  return `${Math.floor((env.uploadMaxBytes / (1024 * 1024)) * 100) / 100} MB`;
}
async function dispatchActive(
  kind: "generation" | "motion",
  job: { id: string; status: string } | null,
) {
  if (!job || !activeStatuses.includes(job.status)) return;
  try {
    await dispatchJob(kind, job.id);
  } catch {
    // The accepted job is durable. An owner refresh can recover dispatch;
    // never create a second paid job because the workflow start failed.
    console.warn("A saved job is waiting for workflow dispatch.");
  }
}
async function ownerView(p: Parameters<typeof projectView>[0]) {
  const view = await projectView(p);
  await Promise.all([
    dispatchActive("generation", view.job),
    dispatchActive("motion", view.motionJob),
  ]);
  return view;
}
async function handler(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  try {
    await ready();
    const parts = (await params).path;
    const [root, id, action] = parts;
    const method = req.method;
    if (method !== "GET") sameOrigin(req);
    if (root === "session" && method === "POST") {
      await rateLimit("sessions", 100, 3600_000);
      return await createSession(req);
    }
    if (root === "mode" && method === "GET")
      return NextResponse.json({
        mode: mode(),
        accessRequired: !!env.key || env.mock,
        uploadLimitBytes: env.uploadMaxBytes,
      });
    if (root === "gifts" && id && method === "GET") {
      const g = await shared(id),
        s = JSON.parse(g.snapshot);
      return NextResponse.json(
        {
          config: GiftConfigSchema.parse(s.config),
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
      const a = await asset(id);
      const t = req.nextUrl.searchParams.get("gift");
      if (t) {
        const g = await shared(t),
          s = JSON.parse(g.snapshot);
        if (
          g.projectId !== a.projectId ||
          ![s.modelAsset, s.drawingAsset].includes(a.id)
        )
          throw new HttpError(404, "Asset unavailable.");
      } else await owned(a.projectId, (await owner(req)).id);
      const bytes = await storage.read(a.filename);
      let offset = 0;
      const stream = new ReadableStream<Uint8Array>({
        pull(controller) {
          if (offset >= bytes.length) {
            controller.close();
            return;
          }
          const end = Math.min(offset + 64 * 1024, bytes.length);
          controller.enqueue(new Uint8Array(bytes.subarray(offset, end)));
          offset = end;
        },
      });
      return new NextResponse(stream, {
        headers: {
          "Content-Type":
            a.kind === "model" ? "model/gltf-binary" : "image/png",
          "Cache-Control": "private, no-store",
        },
      });
    }
    const session = await owner(req);
    if (root === "unlock" && method === "POST") {
      await unlock(
        session.id,
        z.object({ code: z.string().max(200) }).parse(await json(req)).code,
      );
      return NextResponse.json({ unlocked: true });
    }
    if (root !== "projects") throw new HttpError(404, "Not found.");
    if (!id) {
      if (method === "GET") {
        const drafts = await db
          .select()
          .from(projects)
          .where(eq(projects.owner, session.id))
          .orderBy(desc(projects.updatedAt));
        return NextResponse.json(await Promise.all(drafts.map(ownerView)), {
          headers: { "Cache-Control": "no-store" },
        });
      }
      if (method === "POST") {
        await rateLimit("drafts:" + session.id, 20, 3600_000);
        return NextResponse.json(
          await projectView(await newProject(session.id)),
          {
            status: 201,
          },
        );
      }
    }
    const p = await owned(id, session.id);
    if (!action && method === "GET")
      return NextResponse.json(await ownerView(p), {
        headers: { "Cache-Control": "no-store" },
      });
    if (!action && method === "PATCH") {
      const config = GiftConfigSchema.parse(await json(req));
      await db
        .update(projects)
        .set({ config: JSON.stringify(config), updatedAt: Date.now() })
        .where(eq(projects.id, id));
      return NextResponse.json(await projectView(await owned(id, session.id)));
    }
    if (!action && method === "DELETE") {
      await deleteProject(id);
      return NextResponse.json({ deleted: true });
    }
    if (action === "drawing" && method === "POST") {
      await assertNoActiveMotion(id);
      await rateLimit("uploads:" + session.id, 20, 3600_000);
      const [running] = await db
        .select()
        .from(jobs)
        .where(
          and(eq(jobs.projectId, id), inArray(jobs.status, activeStatuses)),
        )
        .limit(1);
      if (running)
        throw new HttpError(
          409,
          "Let this generation finish before replacing its drawing.",
        );
      const limitMessage = `Choose a JPEG or PNG smaller than ${uploadLimitLabel()}.`;
      const raw = await bounded(req, env.uploadMaxBytes + 65536, limitMessage);
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
          file.size > env.uploadMaxBytes
        )
          throw new HttpError(400, limitMessage);
        input = Buffer.from(await file.arrayBuffer());
      }
      const rotation = z.coerce
        .number()
        .refine((n) => [0, 90, 180, 270].includes(n))
        .parse(form.get("rotation") || 0);
      const original = await normalizeImage(input);
      const normalized = await normalizeImage(
        input,
        rotation,
        form.get("crop") === "true",
      );
      await transaction(async () => {
        await assertNoActiveMotion(id);
        const [generating] = await db
          .select({ id: jobs.id })
          .from(jobs)
          .where(
            and(eq(jobs.projectId, id), inArray(jobs.status, activeStatuses)),
          )
          .limit(1);
        const latest = await owned(id, session.id);
        if (generating || latest.revision !== p.revision)
          throw new HttpError(
            409,
            "The drawing changed or generation started. Reload the draft before replacing it.",
          );
        // Both image records and the new revision commit together. Failed
        // quota checks or competing edits must not leave unused stored bytes.
        const originalId = await saveAsset(id, "original", original, {
          sample,
          metadataStripped: true,
        });
        const inputAsset = await saveAsset(id, "drawing", normalized, {
          sample,
          originalId,
          rotation,
          crop: form.get("crop") === "true",
        });
        await db
          .update(projects)
          .set({
            inputAsset,
            revision: p.revision + 1,
            modelAsset: null,
            approved: 0,
            source: sample ? "procedural" : "tripo",
            updatedAt: Date.now(),
          })
          .where(eq(projects.id, id));
      });
      return NextResponse.json(await projectView(await owned(id, session.id)));
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
      await rateLimit("generate:" + session.id, 8, 3600_000);
      const job = await requestGeneration(p, body.key, body.retry);
      await dispatchActive("generation", job);
      return NextResponse.json(job);
    }
    if (action === "approve" && method === "POST") {
      const body = z
        .object({
          loaded: z.literal(true),
          modelAsset: z.string().uuid().nullable().optional(),
        })
        .parse(await json(req));
      await transaction(async () => {
        const latest = await owned(id, session.id);
        if (
          body.modelAsset !== undefined &&
          body.modelAsset !== latest.modelAsset
        )
          throw new HttpError(
            409,
            "Your hero changed. Reload its preview before approving it.",
          );
        if (!latest.inputAsset) throw new HttpError(409, "Choose a drawing.");
        if (!latest.modelAsset && latest.source !== "procedural")
          throw new HttpError(409, "Your model is not ready.");
        await db
          .update(projects)
          .set({ approved: 1, updatedAt: Date.now() })
          .where(eq(projects.id, id));
      });
      return NextResponse.json(await projectView(await owned(id, session.id)));
    }
    if (action === "animate" && method === "POST") {
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
          "Configure Tripo to add movement to a generated hero.",
        );
      if (!session.unlocked)
        throw new HttpError(
          403,
          "Enter the creator access code before paid animation.",
        );
      await rateLimit("animate:" + session.id, 8, 3600_000);
      const job = await requestMotion(p, body.key, body.retry);
      await dispatchActive("motion", job);
      return NextResponse.json(job);
    }
    if (action === "publish" && method === "POST") {
      await rateLimit("publish:" + session.id, 20, 3600_000);
      const g = await publish(p);
      return NextResponse.json({
        id: g.id,
        token: g.token,
        version: g.version,
        url: `${env.origin}/gift/${g.token}`,
      });
    }
    if (action === "revoke" && method === "POST") {
      const { shareId } = z
        .object({ shareId: z.string().uuid() })
        .parse(await json(req));
      await db
        .update(gifts)
        .set({ revoked: 1 })
        .where(and(eq(gifts.id, shareId), eq(gifts.projectId, id)));
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
