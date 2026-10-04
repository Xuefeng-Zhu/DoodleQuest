import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { NextRequest } from "next/server";
import {
  assertDatabaseConfiguration,
  closeDatabase,
  db,
  query,
  ready,
  transaction,
} from "../src/server/db";
import {
  assetBlobs,
  assets,
  gifts,
  projects,
  sessions,
} from "../src/server/schema";
import { asset, saveAsset, storage } from "../src/server/storage";
import {
  digest,
  owned,
  owner,
  rateLimit,
  shared,
} from "../src/server/security";
import { deleteProject } from "../src/server/cleanup";
import { env } from "../src/server/env";
import { defaults } from "../src/domain/config";

const budget = env.assetBudget;
beforeAll(ready, 30_000);
afterAll(closeDatabase);
afterEach(() => {
  env.assetBudget = budget;
});

async function fixture() {
  const rawOwner = randomUUID();
  const ownerId = digest(rawOwner);
  const id = randomUUID();
  const now = Date.now();
  await db
    .insert(sessions)
    .values({
      id: ownerId,
      createdAt: now,
      expiresAt: now + 60_000,
      unlocked: 0,
    });
  await db
    .insert(projects)
    .values({
      id,
      owner: ownerId,
      config: JSON.stringify(defaults),
      createdAt: now,
      updatedAt: now,
    });
  return { id, ownerId, rawOwner };
}

describe("Postgres foundation", () => {
  it("fails closed on Vercel without a database and permits isolated local Postgres", () => {
    expect(() =>
      assertDatabaseConfiguration({ ...env, vercel: true, databaseUrl: "" }),
    ).toThrow("DATABASE_URL is required");
    expect(() =>
      assertDatabaseConfiguration({ ...env, vercel: false, databaseUrl: "" }),
    ).not.toThrow();
  });

  it("keeps bytea drawing bytes and ownership across closing and reopening the database", async () => {
    const project = await fixture();
    const drawing = Buffer.from([0, 255, 80, 78, 71, 0, 13, 10]);
    const id = await saveAsset(project.id, "drawing", drawing, {
      proof: "bytea",
    });
    const record = await asset(id);
    await closeDatabase();
    await ready();
    expect(await storage.read(record.filename)).toEqual(drawing);
    expect((await owned(project.id, project.ownerId)).id).toBe(project.id);
    await expect(owned(project.id, randomUUID())).rejects.toMatchObject({
      status: 404,
    });
    const request = new NextRequest("http://localhost/api/projects", {
      headers: { cookie: `dq_owner=${project.rawOwner}` },
    });
    expect((await owner(request)).id).toBe(project.ownerId);
  }, 30_000);

  it("rolls back nested helper writes as part of the outer transaction", async () => {
    const project = await fixture();
    const [{ count: before }] = await db
      .select({ count: sql<number>`COUNT(*)::integer` })
      .from(assetBlobs);
    await expect(
      transaction(async () => {
        await saveAsset(project.id, "drawing", Buffer.from("rollback"));
        await transaction(async () => {
          await db
            .update(projects)
            .set({ approved: 1 })
            .where(eq(projects.id, project.id));
        });
        throw new Error("abort the complete operation");
      }),
    ).rejects.toThrow("abort the complete operation");
    expect((await owned(project.id, project.ownerId)).approved).toBe(0);
    expect(
      await db.select().from(assets).where(eq(assets.projectId, project.id)),
    ).toHaveLength(0);
    const [{ count: after }] = await db
      .select({ count: sql<number>`COUNT(*)::integer` })
      .from(assetBlobs);
    expect(after).toBe(before);
  });

  it("serializes concurrent uploads against the aggregate budget and releases bytes on deletion", async () => {
    const project = await fixture();
    const otherProject = await fixture();
    const otherBytes = Buffer.from("another owner's drawing");
    const otherAsset = await asset(
      await saveAsset(otherProject.id, "drawing", otherBytes),
    );
    const [{ bytes }] = await db
      .select({ bytes: sql<string>`COALESCE(SUM(${assetBlobs.bytes}), 0)` })
      .from(assetBlobs);
    env.assetBudget = Number(bytes) + 10;
    const uploads = await Promise.allSettled([
      saveAsset(project.id, "drawing", Buffer.alloc(8, 1)),
      saveAsset(project.id, "drawing", Buffer.alloc(8, 2)),
    ]);
    expect(uploads.filter((item) => item.status === "fulfilled")).toHaveLength(
      1,
    );
    const rejected = uploads.find(
      (item) => item.status === "rejected",
    ) as PromiseRejectedResult;
    expect(rejected.reason).toMatchObject({ status: 507 });
    const records = await db
      .select()
      .from(assets)
      .where(eq(assets.projectId, project.id));
    expect(records).toHaveLength(1);
    await deleteProject(project.id);
    await expect(storage.read(records[0].filename)).rejects.toMatchObject({
      status: 404,
    });
    const [{ bytes: after }] = await db
      .select({ bytes: sql<string>`COALESCE(SUM(${assetBlobs.bytes}), 0)` })
      .from(assetBlobs);
    expect(Number(after)).toBe(Number(bytes));
    expect((await asset(otherAsset.id)).projectId).toBe(otherProject.id);
    expect(await storage.read(otherAsset.filename)).toEqual(otherBytes);
    expect((await owned(otherProject.id, otherProject.ownerId)).id).toBe(
      otherProject.id,
    );
  });

  it("does not leave blob bytes behind when metadata ownership constraints fail", async () => {
    const [{ count: before }] = await db
      .select({ count: sql<number>`COUNT(*)::integer` })
      .from(assetBlobs);
    await expect(
      saveAsset(randomUUID(), "drawing", Buffer.from("orphan")),
    ).rejects.toThrow();
    const [{ count: after }] = await db
      .select({ count: sql<number>`COUNT(*)::integer` })
      .from(assetBlobs);
    expect(after).toBe(before);
  });

  it("serializes rate-limit reservations and cascades recipient access on project deletion", async () => {
    const key = `test-${randomUUID()}`;
    const limits = await Promise.allSettled([
      rateLimit(key, 1, 60_000),
      rateLimit(key, 1, 60_000),
    ]);
    expect(limits.filter((item) => item.status === "fulfilled")).toHaveLength(
      1,
    );
    const project = await fixture();
    const token = randomUUID();
    await db
      .insert(gifts)
      .values({
        id: randomUUID(),
        projectId: project.id,
        token,
        snapshot: "{}",
        version: 1,
        createdAt: Date.now(),
      });
    expect((await shared(token)).projectId).toBe(project.id);
    await deleteProject(project.id);
    await expect(shared(token)).rejects.toMatchObject({ status: 404 });
    expect(await query(sql`SELECT 1 AS alive`)).toEqual([{ alive: 1 }]);
  });

  it("rejects opaque-key traversal before database lookup", () => {
    expect(() => storage.read("../.env")).toThrow("Invalid asset key");
  });
});
