import { beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { NextRequest } from "next/server";
import { db, ready } from "../src/server/db";
import {
  assets,
  assetBlobs,
  gifts,
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
import { asset, saveAsset, storage } from "../src/server/storage";
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
type Draft = Awaited<ReturnType<typeof draft>>;
async function post(
  p: Draft,
  action: string,
  body: BodyInit,
  contentType?: string,
) {
  return POST(
    new NextRequest(`${env.origin}/api/projects/${p.id}/${action}`, {
      method: "POST",
      headers: {
        origin: env.origin,
        cookie: `dq_owner=${p.cookie}`,
        ...(contentType ? { "content-type": contentType } : {}),
      },
      body,
    }),
    { params: Promise.resolve({ path: ["projects", p.id, action] }) },
  );
}
async function upload(p: Draft) {
  const form = new FormData();
  form.set("sample", "true");
  expect((await post(p, "drawing", form)).status).toBe(200);
  const drawing = await asset((await owned(p.id, p.owner)).inputAsset!);
  const original = await asset(JSON.parse(drawing.metadata).originalId);
  return { drawing, original };
}
async function gift(p: Draft) {
  await db
    .update(projects)
    .set({
      approved: 1,
      config: JSON.stringify({ ...defaults, showDrawing: true }),
    })
    .where(eq(projects.id, p.id));
  return publish(await owned(p.id, p.owner));
}
async function revoke(p: Draft, shareId: string) {
  expect(
    (await post(p, "revoke", JSON.stringify({ shareId }), "application/json"))
      .status,
  ).toBe(200);
}
async function absent(record: typeof assets.$inferSelect) {
  await expect(asset(record.id)).rejects.toMatchObject({ status: 404 });
  expect(
    await db
      .select()
      .from(assetBlobs)
      .where(eq(assetBlobs.filename, record.filename)),
  ).toHaveLength(0);
}
async function retained(record: typeof assets.$inferSelect) {
  expect((await asset(record.id)).filename).toBe(record.filename);
  expect((await storage.read(record.filename)).length).toBe(record.bytes);
}

beforeEach(async () => {
  await ready();
  await db.delete(rateLimits).where(eq(rateLimits.key, "upload-bytes-global"));
});

describe("revoked gift drawing reclamation", () => {
  it("preserves the current drawing at revoke and reclaims it when replaced afterward", async () => {
    const p = await draft();
    const old = await upload(p);
    const published = await gift(p);
    await revoke(p, published.id);
    await retained(old.drawing);
    await retained(old.original);
    const current = await upload(p);
    await absent(old.drawing);
    await absent(old.original);
    await retained(current.drawing);
    await retained(current.original);
  });

  it("reclaims an older gift's original when revoked after drawing replacement", async () => {
    const p = await draft();
    const old = await upload(p);
    const published = await gift(p);
    const current = await upload(p);
    await absent(old.drawing);
    await retained(old.original);
    await revoke(p, published.id);
    await absent(old.original);
    await retained(current.drawing);
    await retained(current.original);
  });

  it("retains shared image bytes until the last active gift is revoked", async () => {
    const p = await draft();
    const old = await upload(p);
    const first = await gift(p);
    const second = await gift(p);
    await upload(p);
    await revoke(p, first.id);
    await retained(old.original);
    await revoke(p, second.id);
    await absent(old.original);
  });

  it.each(["pending", "succeeded", "failed"])(
    "preserves %s generation inputs, their originals, and model assets",
    async (status) => {
      const p = await draft();
      const old = await upload(p);
      const published = await gift(p);
      const job = await requestGeneration(
        await owned(p.id, p.owner),
        randomUUID(),
      );
      await db
        .update(jobs)
        .set({ status: "failed" })
        .where(eq(jobs.id, job.id));
      const current = await upload(p);
      await db.update(jobs).set({ status }).where(eq(jobs.id, job.id));
      const currentModel = await asset(
        await saveAsset(p.id, "model", Buffer.from("current model")),
      );
      const archivedMotion = await asset(
        await saveAsset(p.id, "model", Buffer.from("previous motion"), {
          motion: true,
        }),
      );
      await db
        .update(projects)
        .set({ modelAsset: currentModel.id })
        .where(eq(projects.id, p.id));
      await revoke(p, published.id);
      for (const record of [
        old.drawing,
        old.original,
        current.drawing,
        current.original,
        currentModel,
        archivedMotion,
      ]) {
        await retained(record);
      }
    },
  );

  it("rolls back gift revocation and image deletion when blob deletion fails", async () => {
    const p = await draft();
    const old = await upload(p);
    const published = await gift(p);
    await upload(p);
    // A real database constraint forces failure after the image record was
    // deleted, exercising the route's own transaction rather than a mock.
    await db.execute(
      sql`CREATE TABLE revoke_blob_guard (filename text REFERENCES asset_blobs(filename))`,
    );
    try {
      await db.execute(
        sql`INSERT INTO revoke_blob_guard(filename) VALUES (${old.original.filename})`,
      );
      const response = await post(
        p,
        "revoke",
        JSON.stringify({ shareId: published.id }),
        "application/json",
      );
      expect(response.status).toBe(500);
      expect(
        (await db.select().from(gifts).where(eq(gifts.id, published.id)))[0]
          .revoked,
      ).toBe(0);
      await retained(old.original);
    } finally {
      await db.execute(sql`DROP TABLE revoke_blob_guard`);
    }
  });
});
