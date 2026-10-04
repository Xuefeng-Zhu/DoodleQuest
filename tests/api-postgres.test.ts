import { beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { eq, sql } from "drizzle-orm";
import { NextRequest } from "next/server";
import { db, ready, query } from "../src/server/db";
import {
  gifts,
  jobs,
  motionJobs,
  projects,
  sessions,
} from "../src/server/schema";
import { digest, owned } from "../src/server/security";
import { newProject, publish } from "../src/server/repository";
import { normalizeImage, saveAsset } from "../src/server/storage";
import { env } from "../src/server/env";
import { dispatchJob } from "../src/server/dispatch";
import { GET, POST } from "../src/app/api/[...path]/route";
import { GET as healthGET } from "../src/app/api/health/route";

vi.mock("../src/server/dispatch", () => ({
  dispatchJob: vi.fn().mockResolvedValue(undefined),
}));

async function draft() {
  const cookie = randomUUID();
  const owner = digest(cookie);
  await db.insert(sessions).values({
    id: owner,
    createdAt: Date.now(),
    expiresAt: Date.now() + 100_000,
    unlocked: 1,
  });
  const p = await newProject(owner);
  const inputAsset = await saveAsset(
    p.id,
    "drawing",
    await readFile("public/sample-drawing.png"),
  );
  await db
    .update(projects)
    .set({ inputAsset, revision: 1 })
    .where(eq(projects.id, p.id));
  return { ...(await owned(p.id, owner)), cookie };
}
function request(
  path: string[],
  cookie?: string,
  options?: { body: BodyInit; contentType?: string },
) {
  const req = new NextRequest(`${env.origin}/api/${path.join("/")}`, {
    method: options ? "POST" : "GET",
    headers: {
      origin: env.origin,
      ...(cookie ? { cookie: `dq_owner=${cookie}` } : {}),
      ...(options?.contentType ? { "content-type": options.contentType } : {}),
    },
    ...(options ? { body: options.body } : {}),
  });
  return (options ? POST : GET)(req, { params: Promise.resolve({ path }) });
}
beforeEach(async () => {
  await ready();
  await db.update(jobs).set({ status: "failed", leaseUntil: 0 });
  await db.update(motionJobs).set({ status: "failed", leaseUntil: 0 });
  vi.mocked(dispatchJob).mockReset().mockResolvedValue(undefined);
});

describe("Postgres API delivery and workflow recovery", () => {
  it("rolls back both image records when the storage budget only fits the original", async () => {
    const p = await draft();
    const original = await normalizeImage(
      await readFile("public/sample-drawing.png"),
    );
    const [before] = await query<{ bytes: number; count: number }>(
      sql`SELECT COALESCE(SUM(bytes),0)::integer AS bytes, COUNT(*)::integer AS count FROM asset_blobs`,
    );
    const [assetsBefore] = await query<{ count: number }>(
      sql`SELECT COUNT(*)::integer AS count FROM assets WHERE "projectId"=${p.id}`,
    );
    const previous = env.assetBudget;
    env.assetBudget = before.bytes + original.length;
    try {
      const form = new FormData();
      form.set("sample", "true");
      const response = await request(["projects", p.id, "drawing"], p.cookie, {
        body: form,
      });
      expect(response.status).toBe(507);
      expect((await owned(p.id, p.owner)).inputAsset).toBe(p.inputAsset);
      expect((await owned(p.id, p.owner)).revision).toBe(p.revision);
      const [after] = await query<{ bytes: number; count: number }>(
        sql`SELECT COALESCE(SUM(bytes),0)::integer AS bytes, COUNT(*)::integer AS count FROM asset_blobs`,
      );
      expect(after).toEqual(before);
      const [assetsAfter] = await query<{ count: number }>(
        sql`SELECT COUNT(*)::integer AS count FROM assets WHERE "projectId"=${p.id}`,
      );
      expect(assetsAfter.count).toBe(assetsBefore.count);
    } finally {
      env.assetBudget = previous;
    }
  });
  it("streams every byte of a large authorized asset and keeps revocation checks", async () => {
    const p = await draft();
    // More than the buffered serverless response limit; the route streams it.
    const bytes = Buffer.alloc(5 * 1024 * 1024 + 37);
    for (let i = 0; i < bytes.length; i++) bytes[i] = i % 251;
    const modelAsset = await saveAsset(p.id, "model", bytes);
    await db
      .update(projects)
      .set({ modelAsset, approved: 1 })
      .where(eq(projects.id, p.id));
    const gift = await publish(await owned(p.id, p.owner));
    const response = await request(["assets", modelAsset], p.cookie);
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("model/gltf-binary");
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.has("Content-Length")).toBe(false);
    const chunks: Uint8Array[] = [];
    const reader = response.body!.getReader();
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      expect(part.value.length).toBeLessThanOrEqual(64 * 1024);
      chunks.push(part.value);
    }
    expect(Buffer.concat(chunks).equals(bytes)).toBe(true);
    const publicResponse = await GET(
      new NextRequest(
        `${env.origin}/api/assets/${modelAsset}?gift=${gift.token}`,
      ),
      { params: Promise.resolve({ path: ["assets", modelAsset] }) },
    );
    expect(publicResponse.status).toBe(200);
    await publicResponse.body?.cancel();
    await db.update(gifts).set({ revoked: 1 }).where(eq(gifts.id, gift.id));
    const revoked = await GET(
      new NextRequest(
        `${env.origin}/api/assets/${modelAsset}?gift=${gift.token}`,
      ),
      { params: Promise.resolve({ path: ["assets", modelAsset] }) },
    );
    expect(revoked.status).toBe(404);
    const other = await draft();
    expect((await request(["assets", modelAsset], other.cookie)).status).toBe(
      404,
    );
  });

  it("keeps an accepted job through a dispatch failure and repairs its dispatch on owner refresh", async () => {
    const p = await draft();
    const oldMock = env.mock;
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    env.mock = true;
    try {
      vi.mocked(dispatchJob).mockRejectedValueOnce(
        new Error("queue unavailable"),
      );
      const response = await request(["projects", p.id, "generate"], p.cookie, {
        body: JSON.stringify({ key: randomUUID(), consent: true }),
        contentType: "application/json",
      });
      expect(response.status).toBe(200);
      const accepted = await response.json();
      expect(
        (await db.select().from(jobs).where(eq(jobs.id, accepted.id)))[0]
          .status,
      ).toBe("pending");
      const refreshed = await request(["projects", p.id], p.cookie);
      expect((await refreshed.json()).job.id).toBe(accepted.id);
      expect(dispatchJob).toHaveBeenNthCalledWith(1, "generation", accepted.id);
      expect(dispatchJob).toHaveBeenNthCalledWith(2, "generation", accepted.id);
      const [usage] = await query<{ count: number }>(
        sql`SELECT COUNT(*)::integer AS count FROM generation_usage WHERE owner=${p.owner}`,
      );
      expect(usage.count).toBe(1);
      await db
        .update(jobs)
        .set({ status: "uncertain" })
        .where(eq(jobs.id, accepted.id));
      vi.mocked(dispatchJob).mockClear();
      expect((await request(["projects", p.id], p.cookie)).status).toBe(200);
      expect(dispatchJob).not.toHaveBeenCalled();
      expect(
        (await db.select().from(jobs).where(eq(jobs.projectId, p.id))).length,
      ).toBe(1);
    } finally {
      env.mock = oldMock;
      warning.mockRestore();
    }
  });

  it("advertises and enforces the same upload limit with multipart headroom", async () => {
    const p = await draft();
    const previous = env.uploadMaxBytes;
    env.uploadMaxBytes = 4 * 1024 * 1024 - 65536;
    try {
      expect((await (await request(["mode"])).json()).uploadLimitBytes).toBe(
        env.uploadMaxBytes,
      );
      const overRequest = await request(
        ["projects", p.id, "drawing"],
        p.cookie,
        {
          body: new Uint8Array(4 * 1024 * 1024 + 1),
          contentType: "application/octet-stream",
        },
      );
      expect(overRequest.status).toBe(413);
      expect((await overRequest.json()).error).toContain("3.93 MB");
      const form = new FormData();
      form.set(
        "file",
        new File([new Uint8Array(env.uploadMaxBytes + 1)], "drawing.png", {
          type: "image/png",
        }),
      );
      const overFile = await request(["projects", p.id, "drawing"], p.cookie, {
        body: form,
      });
      expect(overFile.status).toBe(400);
      expect((await overFile.json()).error).toContain("3.93 MB");
    } finally {
      env.uploadMaxBytes = previous;
    }
  });

  it("reports Vercel database health without requiring a local worker heartbeat", async () => {
    const previous = process.env.VERCEL;
    process.env.VERCEL = "1";
    try {
      const response = await healthGET();
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        ready: true,
        database: true,
        execution: "vercel-workflow",
      });
    } finally {
      process.env.VERCEL = previous;
    }
  });
});
