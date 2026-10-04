import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { closeDatabase, db, ready, transaction } from "../src/server/db";
import {
  assets,
  gifts,
  jobs,
  motionJobs,
  projects,
  sessions,
} from "../src/server/schema";
import { defaults } from "../src/domain/config";
import { digest } from "../src/server/security";
import { ownerProjectViews } from "../src/server/repository";
import { dispatchJob } from "../src/server/dispatch";
import { GET } from "../src/app/api/[...path]/route";

const calls = vi.hoisted(() => ({ selects: 0, transactions: 0 }));
vi.mock("../src/server/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/server/db")>();
  return {
    ...actual,
    db: new Proxy(actual.db, {
      get(target, property) {
        const value = Reflect.get(target, property);
        if (property === "select" || property === "selectDistinctOn")
          return (...args: unknown[]) => {
            calls.selects++;
            return Reflect.apply(value, target, args);
          };
        return value;
      },
    }),
    transaction: (...args: Parameters<typeof actual.transaction>) => {
      calls.transactions++;
      return actual.transaction(...args);
    },
  };
});
vi.mock("../src/server/dispatch", () => ({
  dispatchJob: vi.fn().mockResolvedValue(undefined),
}));

beforeAll(ready, 30_000);
afterAll(closeDatabase);

async function fixture(count: number) {
  const cookie = randomUUID();
  const owner = digest(cookie);
  const now = Date.now();
  await db
    .insert(sessions)
    .values({ id: owner, createdAt: now, expiresAt: now + 600_000 });
  const drafts = Array.from({ length: count }, (_, i) => ({
    id: randomUUID(),
    owner,
    config: JSON.stringify(defaults),
    inputAsset: randomUUID(),
    modelAsset: randomUUID(),
    revision: i + 1,
    source: "tripo",
    approved: 0,
    createdAt: now + i,
    updatedAt: now + i,
  }));
  await db.insert(projects).values(drafts);
  await db.insert(assets).values(
    drafts.map((p) => ({
      id: p.inputAsset,
      projectId: p.id,
      kind: "drawing",
      filename: randomUUID(),
      bytes: 1,
      metadata: JSON.stringify({ originalId: `original-${p.id}` }),
      createdAt: now,
    })),
  );
  await db.insert(jobs).values(
    drafts.flatMap((p) =>
      [0, 1].map((version) => ({
        id: randomUUID(),
        projectId: p.id,
        owner,
        inputAsset: p.inputAsset,
        inputRevision: p.revision,
        idempotencyKey: randomUUID(),
        status: "ready",
        finalAsset: version ? `static-${p.id}` : `old-${p.id}`,
        uploadToken: "private upload",
        leaseToken: "private lease",
        model: "tripo-v3",
        nextPoll: now,
        createdAt: now + version,
        updatedAt: now + version,
      })),
    ),
  );
  await db.insert(motionJobs).values(
    drafts.flatMap((p) =>
      [0, 1].map((version) => ({
        id: randomUUID(),
        projectId: p.id,
        owner,
        inputAsset: `static-${p.id}`,
        inputRevision: p.revision,
        inputSource: "tripo",
        generationTask: "private-task",
        idempotencyKey: randomUUID(),
        stage: "retarget",
        status: "ready",
        finalAsset: version ? p.modelAsset : `old-motion-${p.id}`,
        leaseToken: "private lease",
        nextPoll: now,
        createdAt: now + version,
        updatedAt: now + version,
      })),
    ),
  );
  await db.insert(gifts).values(
    drafts.flatMap((p) =>
      [1, 2].map((version) => ({
        id: randomUUID(),
        projectId: p.id,
        token: randomUUID(),
        version,
        snapshot: "{}",
        revoked: version === 1 ? 1 : 0,
        createdAt: now + version,
      })),
    ),
  );
  return { cookie, owner, drafts };
}

describe("batched owner draft snapshots", () => {
  it("reads twenty drafts and their latest terminal state with one transaction and five queries", async () => {
    const own = await fixture(20);
    const other = await fixture(2);
    calls.selects = calls.transactions = 0;
    const views = await ownerProjectViews(own.owner);
    expect(calls).toEqual({ selects: 5, transactions: 1 });
    expect(views.map((view) => view.id)).toEqual(
      own.drafts.toReversed().map((p) => p.id),
    );
    for (const view of views) {
      expect(view.owner).toBeUndefined();
      expect(view.job).toMatchObject({
        status: "ready",
        finalAsset: `static-${view.id}`,
        inputRevision: view.revision,
      });
      expect(view.motionJob).toMatchObject({
        status: "ready",
        finalAsset: view.modelAsset,
      });
      expect(view.modelUrl).toBe(`/api/assets/${view.modelAsset}`);
      expect(view.drawingUrl).toBe(`/api/assets/original-${view.id}`);
      expect(view.shares).toHaveLength(2);
      expect(view.shares.map((share) => share.revoked).sort()).toEqual([0, 1]);
      expect(JSON.stringify(view)).not.toMatch(
        /private upload|private lease|private-task/,
      );
      expect(other.drafts.map((p) => p.id)).not.toContain(view.id);
    }
    calls.selects = calls.transactions = 0;
    expect(await ownerProjectViews(randomUUID())).toEqual([]);
    expect(calls).toEqual({ selects: 1, transactions: 1 });
  });

  it("lists only the authenticated owner's drafts and repairs only their active dispatch", async () => {
    const own = await fixture(3);
    const other = await fixture(1);
    const ownViews = await ownerProjectViews(own.owner);
    const otherViews = await ownerProjectViews(other.owner);
    const activeId = ownViews[0].job!.id;
    await db
      .update(jobs)
      .set({ status: "polling" })
      .where(eq(jobs.id, activeId));
    await db
      .update(jobs)
      .set({ status: "polling" })
      .where(eq(jobs.id, otherViews[0].job!.id));
    vi.mocked(dispatchJob).mockClear();
    calls.selects = calls.transactions = 0;
    const response = await GET(
      new NextRequest("http://localhost/api/projects", {
        headers: { cookie: `dq_owner=${own.cookie}` },
      }),
      { params: Promise.resolve({ path: ["projects"] }) },
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    const body = await response.json();
    expect(body.map((p: { id: string }) => p.id)).toEqual(
      ownViews.map((p) => p.id),
    );
    expect(calls).toEqual({ selects: 6, transactions: 1 }); // Session plus one batched snapshot.
    expect(dispatchJob).toHaveBeenCalledExactlyOnceWith("generation", activeId);
    expect(JSON.stringify(body)).not.toContain(other.drafts[0].id);
  });

  it("waits for an in-flight worker commit before exposing a terminal model", async () => {
    const own = await fixture(2);
    const before = await ownerProjectViews(own.owner);
    const target = before[0];
    let release!: () => void;
    let started!: () => void;
    const barrier = new Promise<void>((resolve) => {
      release = resolve;
    });
    const workerStarted = new Promise<void>((resolve) => {
      started = resolve;
    });
    const worker = transaction(async () => {
      await db
        .update(projects)
        .set({ modelAsset: "new-motion-model", approved: 0 })
        .where(eq(projects.id, target.id));
      started();
      await barrier;
      await db
        .update(motionJobs)
        .set({ finalAsset: "new-motion-model", status: "ready" })
        .where(eq(motionJobs.id, target.motionJob!.id));
    });
    await workerStarted;
    const reading = ownerProjectViews(own.owner);
    release();
    await worker;
    const after = (await reading).find((view) => view.id === target.id)!;
    expect(after.modelAsset).toBe("new-motion-model");
    expect(after.modelUrl).toBe("/api/assets/new-motion-model");
    expect(after.motionJob).toMatchObject({
      status: "ready",
      finalAsset: "new-motion-model",
    });
  });
});
