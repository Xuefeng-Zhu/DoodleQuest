/** Explicit compatibility check for a fresh, disposable local PostgreSQL server.
 * DQ_POSTGRES_SMOKE=1 DATABASE_URL=postgres://postgres@127.0.0.1:PORT/doodlequest_smoke
 *   node --import tsx scripts/check-postgres.ts [--verify]
 * The second form reopens the persisted gift after a database/container restart.
 * No provider, deployment, or real user database is contacted.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { eq, sql } from "drizzle-orm";
import { Pool } from "pg";

const address = new URL(process.env.DATABASE_URL || "http://invalid");
if (
  process.env.DQ_POSTGRES_SMOKE !== "1" ||
  !["postgres:", "postgresql:"].includes(address.protocol) ||
  !["127.0.0.1", "localhost"].includes(address.hostname) ||
  address.pathname !== "/doodlequest_smoke"
)
  throw new Error(
    "Use DQ_POSTGRES_SMOKE=1 and a disposable localhost doodlequest_smoke database.",
  );
// Override ignored .env files before any application module loads.
process.env.TRIPO_API_KEY = "";
process.env.CREATOR_ACCESS_CODE = "";
process.env.E2E_MOCK_PROVIDER = "";
process.env.VERCEL = "";
process.env.GENERATION_QUOTA = "100";
process.env.ASSET_STORAGE_BUDGET_BYTES = String(200 * 1024 * 1024);

const { db, ready, transaction, query, closeDatabase } =
  await import("../src/server/db");
const { sessions, projects, assets } = await import("../src/server/schema");
const { newProject, requestGeneration, publish } =
  await import("../src/server/repository");
const { saveAsset, storage, asset } = await import("../src/server/storage");
const { owned, shared } = await import("../src/server/security");
const { env } = await import("../src/server/env");
const { defaults } = await import("../src/domain/config");
const verifyOnly = process.argv.includes("--verify");
const checks: string[] = [];
const recipient = "Postgres smoke persistence check";
const drawing = await readFile("public/sample-drawing.png");
const model = await readFile("tests/fixtures/mock.glb");

async function usage() {
  return (
    await query<{ bytes: number; count: number }>(sql`
    SELECT COALESCE(SUM(bytes),0)::integer AS bytes, COUNT(*)::integer AS count
    FROM asset_blobs
  `)
  )[0];
}
async function draft() {
  const owner = randomUUID();
  await db
    .insert(sessions)
    .values({
      id: owner,
      createdAt: Date.now(),
      expiresAt: Date.now() + 60_000,
    });
  const p = await newProject(owner);
  const inputAsset = await saveAsset(p.id, "drawing", drawing);
  await db
    .update(projects)
    .set({ inputAsset, revision: 1 })
    .where(eq(projects.id, p.id));
  return owned(p.id, owner);
}
async function verifyGift() {
  const [stored] = await query<{ id: string; owner: string }>(sql`
    SELECT id, owner FROM projects WHERE config::jsonb ->> 'recipient' = ${recipient}
  `);
  assert.ok(stored, "persisted gift project survives restart");
  const p = await owned(stored.id, stored.owner);
  const [gift] = await query<{ token: string }>(
    sql`SELECT token FROM gifts WHERE "projectId"=${p.id}`,
  );
  const snapshot = JSON.parse((await shared(gift.token)).snapshot);
  assert.equal(snapshot.config.recipient, recipient);
  assert.equal(snapshot.modelAsset, p.modelAsset);
  assert.equal(
    typeof p.createdAt,
    "number",
    "bigint timestamps map back to numbers",
  );
  assert.ok(
    (await storage.read((await asset(p.inputAsset!)).filename)).equals(drawing),
  );
  assert.ok(
    (await storage.read((await asset(p.modelAsset!)).filename)).equals(model),
  );
  const [migrations] = await query<{ count: number }>(
    sql`SELECT COUNT(*)::integer AS count FROM schema_migrations`,
  );
  assert.equal(migrations.count, 1, "migration remains idempotent");
  checks.push(
    "gift snapshot, bigint timestamps, and byte-exact blobs survive reopen",
  );
}

try {
  await ready();
  const client = (db as unknown as { $client: Pool }).$client;
  assert.ok(client instanceof Pool, "the native NodePg driver is active");
  const [server] = await query<{ version: string; database: string }>(
    sql`SELECT version(), current_database() AS database`,
  );
  assert.equal(server.database, "doodlequest_smoke");
  assert.match(server.version, /^PostgreSQL 17\./);
  const connections = await Promise.all([client.connect(), client.connect()]);
  try {
    const pids = await Promise.all(
      connections.map(
        async (c) =>
          (await c.query<{ pid: number }>("SELECT pg_backend_pid() AS pid"))
            .rows[0].pid,
      ),
    );
    assert.notEqual(
      pids[0],
      pids[1],
      "concurrency uses separate server connections",
    );
  } finally {
    connections.forEach((c) => c.release());
  }
  checks.push(
    "native NodePg pool, real PostgreSQL 17, and independent connections",
  );
  if (verifyOnly) {
    await verifyGift();
    checks.push(
      "server restart and repeated schema initialization preserve data",
    );
  } else {
    assert.equal(
      (await db.select().from(projects)).length,
      0,
      "the write check requires a fresh disposable database",
    );
    const p = await draft();
    const modelAsset = await saveAsset(p.id, "model", model, {
      testFixture: true,
    });
    await db
      .update(projects)
      .set({
        modelAsset,
        approved: 1,
        config: JSON.stringify({ ...defaults, recipient }),
      })
      .where(eq(projects.id, p.id));
    await publish(await owned(p.id, p.owner));
    await closeDatabase();
    await Promise.all([ready(), ready()]);
    await verifyGift();

    const [a, b] = await Promise.all([draft(), draft()]);
    env.quota = 1;
    try {
      const attempts = await Promise.allSettled([
        requestGeneration(a, randomUUID()),
        requestGeneration(b, randomUUID()),
      ]);
      assert.equal(attempts.filter((r) => r.status === "fulfilled").length, 1);
      assert.match(
        attempts.find((r) => r.status === "rejected")?.reason.message || "",
        /quota/,
      );
      const [reserved] = await query<{ count: number }>(
        sql`SELECT COUNT(*)::integer AS count FROM generation_usage`,
      );
      assert.equal(reserved.count, 1);
      checks.push(
        "concurrent generation reservations serialize at one shared quota slot",
      );
    } finally {
      env.quota = 100;
    }

    const beforeBudget = await usage();
    const chunk = Buffer.alloc(64 * 1024, 197);
    env.assetBudget = beforeBudget.bytes + chunk.length;
    try {
      const writes = await Promise.allSettled([
        saveAsset(a.id, "original", chunk),
        saveAsset(b.id, "original", chunk),
      ]);
      assert.equal(writes.filter((r) => r.status === "fulfilled").length, 1);
      assert.equal(
        writes.find((r) => r.status === "rejected")?.reason.status,
        507,
      );
      assert.deepEqual(await usage(), {
        bytes: beforeBudget.bytes + chunk.length,
        count: beforeBudget.count + 1,
      });
      checks.push(
        "concurrent blob writes serialize at the shared storage budget",
      );
    } finally {
      env.assetBudget = 200 * 1024 * 1024;
    }

    const beforeRollback = await usage();
    const beforeAssets = (await db.select().from(assets)).length;
    const beforeConfig = (await owned(p.id, p.owner)).config;
    await assert.rejects(
      transaction(async () => {
        await saveAsset(p.id, "original", Buffer.alloc(513, 42));
        await db
          .update(projects)
          .set({
            config: JSON.stringify({
              ...defaults,
              recipient: "must roll back",
            }),
          })
          .where(eq(projects.id, p.id));
        throw new Error("intentional transaction rollback");
      }),
      /intentional transaction rollback/,
    );
    assert.deepEqual(await usage(), beforeRollback);
    assert.equal((await db.select().from(assets)).length, beforeAssets);
    assert.equal((await owned(p.id, p.owner)).config, beforeConfig);
    checks.push(
      "nested blob, metadata, and project changes roll back together",
    );
  }
  console.log(
    JSON.stringify(
      {
        status: "PASS",
        mode: verifyOnly ? "restart-verification" : "compatibility",
        server: server.version.split(" on ")[0],
        checks,
      },
      null,
      2,
    ),
  );
} finally {
  await closeDatabase();
}
