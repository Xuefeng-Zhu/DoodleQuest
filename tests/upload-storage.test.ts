import { beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { eq, sql } from "drizzle-orm";
import { NextRequest } from "next/server";
import { db, ready, query } from "../src/server/db";
import {
  assets,
  jobs,
  projects,
  rateLimits,
  sessions,
} from "../src/server/schema";
import { digest, owned } from "../src/server/security";
import {
  newProject,
  publish,
  requestGeneration,
} from "../src/server/repository";
import { asset, normalizeImage, storage } from "../src/server/storage";
import { env } from "../src/server/env";
import { defaults } from "../src/domain/config";
import { POST } from "../src/app/api/[...path]/route";

vi.mock("../src/server/dispatch", () => ({ dispatchJob: vi.fn() }));

async function draft() {
  const cookie = randomUUID();
  const owner = digest(cookie);
  await db.insert(sessions).values({
    id: owner,
    createdAt: Date.now(),
    expiresAt: Date.now() + 100_000,
  });
  return { ...(await newProject(owner)), cookie };
}
async function upload(p: Awaited<ReturnType<typeof draft>>) {
  const form = new FormData();
  form.set("sample", "true");
  return POST(
    new NextRequest(`${env.origin}/api/projects/${p.id}/drawing`, {
      method: "POST",
      headers: { origin: env.origin, cookie: `dq_owner=${p.cookie}` },
      body: form,
    }),
    { params: Promise.resolve({ path: ["projects", p.id, "drawing"] }) },
  );
}
async function usage() {
  const [row] = await query<{ bytes: number; count: number }>(
    sql`SELECT COALESCE(SUM(bytes),0)::integer AS bytes, COUNT(*)::integer AS count FROM asset_blobs`,
  );
  return row;
}
beforeEach(async () => {
  await ready();
  await db.delete(rateLimits).where(eq(rateLimits.key, "upload-bytes-global"));
});

describe("public drawing storage", () => {
  it("reclaims replaced drawing bytes rather than accumulating every revision", async () => {
    const p = await draft();
    expect((await upload(p)).status).toBe(200);
    const initial = await usage();
    const oldInput = (await owned(p.id, p.owner)).inputAsset!;
    for (let revision = 0; revision < 3; revision++) {
      expect((await upload(p)).status).toBe(200);
      expect(await usage()).toEqual(initial);
    }
    expect(
      await db.select().from(assets).where(eq(assets.projectId, p.id)),
    ).toHaveLength(2);
    await expect(asset(oldInput)).rejects.toMatchObject({ status: 404 });
  });

  it("preserves published drawing keepsakes and saved generation inputs", async () => {
    const p = await draft();
    expect((await upload(p)).status).toBe(200);
    const originalInput = await asset((await owned(p.id, p.owner)).inputAsset!);
    const originalId = JSON.parse(originalInput.metadata).originalId;
    const original = await asset(originalId);
    const originalBytes = await storage.read(original.filename);
    await db
      .update(projects)
      .set({
        approved: 1,
        config: JSON.stringify({ ...defaults, showDrawing: true }),
      })
      .where(eq(projects.id, p.id));
    const gift = await publish(await owned(p.id, p.owner));
    expect(JSON.parse(gift.snapshot).drawingAsset).toBe(originalId);
    expect((await upload(p)).status).toBe(200);
    expect(await storage.read((await asset(originalId)).filename)).toEqual(
      originalBytes,
    );
    const jobInput = await owned(p.id, p.owner);
    const job = await requestGeneration(jobInput, randomUUID());
    await db.update(jobs).set({ status: "failed" }).where(eq(jobs.id, job.id));
    const inputBytes = await storage.read(
      (await asset(job.inputAsset)).filename,
    );
    expect((await upload(p)).status).toBe(200);
    expect(await storage.read((await asset(job.inputAsset)).filename)).toEqual(
      inputBytes,
    );
    expect(await storage.read((await asset(originalId)).filename)).toEqual(
      originalBytes,
    );
  });

  it("shares a byte budget across concurrent anonymous owners without storing rejected uploads", async () => {
    const png = await normalizeImage(
      await readFile("public/sample-drawing.png"),
    );
    const cost = png.length * 2;
    await db.insert(rateLimits).values({
      key: "upload-bytes-global",
      count: 25 * 1024 * 1024 - cost,
      untilAt: Date.now() + 3600_000,
    });
    const [a, b] = await Promise.all([draft(), draft()]);
    const before = await usage();
    const results = await Promise.all([upload(a), upload(b)]);
    expect(results.map((response) => response.status).sort()).toEqual([
      200, 429,
    ]);
    expect(await usage()).toEqual({
      bytes: before.bytes + cost,
      count: before.count + 2,
    });
    const blocked = results[0].status === 429 ? a : b;
    expect((await owned(blocked.id, blocked.owner)).inputAsset).toBeNull();
    const rotated = await draft();
    expect((await upload(rotated)).status).toBe(429);
    // Expiration opens the next window without resetting by owner/cookie.
    await db
      .update(rateLimits)
      .set({ untilAt: 0 })
      .where(eq(rateLimits.key, "upload-bytes-global"));
    expect((await upload(rotated)).status).toBe(200);
  });
});
