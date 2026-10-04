import { describe, it, expect, vi, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { eq, sql } from "drizzle-orm";
import { db, ready, query } from "../src/server/db";
import { sessions, projects, jobs, gifts } from "../src/server/schema";
import {
  newProject,
  requestGeneration,
  publish,
  repository,
  projectView,
} from "../src/server/repository";
import { owned, shared, sameOrigin } from "../src/server/security";
import { processOne } from "../src/server/worker";
import { LiveTripo, ProviderError, mapStatus } from "../src/server/tripo";
import {
  saveAsset,
  normalizeImage,
  validateModel,
  downloadModel,
  storage,
  asset,
} from "../src/server/storage";
import { deleteProject } from "../src/server/cleanup";
import { defaults } from "../src/domain/config";
import { env } from "../src/server/env";
import { NextRequest } from "next/server";
async function draft() {
  const owner = randomUUID();
  await db.insert(sessions).values({
    id: owner,
    createdAt: Date.now(),
    expiresAt: Date.now() + 100000,
  });
  const p = await newProject(owner);
  const inputAsset = await saveAsset(
    p.id,
    "drawing",
    await readFile("public/sample-drawing.png"),
    { sample: true },
  );
  await db
    .update(projects)
    .set({ inputAsset, revision: 1 })
    .where(eq(projects.id, p.id));
  return await owned(p.id, owner);
}
async function due(id: string) {
  await db
    .update(jobs)
    .set({ leaseUntil: 0, nextPoll: 0 })
    .where(eq(jobs.id, id));
}
const provider = () => ({
  upload: vi.fn().mockResolvedValue("file_test"),
  create: vi.fn().mockResolvedValue("task_test"),
  retrieve: vi.fn().mockResolvedValue({
    id: "task_test",
    status: "success",
    progress: 100,
    modelUrl: "https://cdn.tripo3d.ai/model.glb",
  }),
});
beforeEach(async () => {
  await ready();
  await db.update(jobs).set({ status: "failed" });
});
describe("generation reliability", () => {
  it("maps only documented status values, retaining unknown states for polling", () => {
    expect(
      ["queued", "running", "success", "failed", "cancelled", "new"].map(
        mapStatus,
      ),
    ).toEqual([
      "queued",
      "generating",
      "downloading",
      "failed",
      "failed",
      "polling",
    ]);
  });
  it("idempotent requests and concurrent distinct keys reuse the active job", async () => {
    const p = await draft(),
      key = randomUUID();
    const [a, repeated, distinct] = await Promise.all([
      requestGeneration(p, key),
      requestGeneration(p, key),
      requestGeneration(p, randomUUID()),
    ]);
    expect(repeated.id).toBe(a.id);
    expect(distinct.id).toBe(a.id);
    const [usage] = await query<{ count: number }>(
      sql`SELECT COUNT(*)::integer AS count FROM generation_usage WHERE owner=${p.owner}`,
    );
    expect(usage.count).toBe(1);
  });
  it("reserves the final shared quota slot atomically across different projects", async () => {
    const [a, b] = await Promise.all([draft(), draft()]);
    const [usage] = await query<{ count: number }>(
      sql`SELECT COUNT(*)::integer AS count FROM generation_usage`,
    );
    const oldQuota = env.quota;
    env.quota = usage.count + 1;
    try {
      const results = await Promise.allSettled([
        requestGeneration(a, randomUUID()),
        requestGeneration(b, randomUUID()),
      ]);
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      const rejected = results.find((r) => r.status === "rejected");
      expect(rejected?.reason.message).toContain("quota");
    } finally {
      env.quota = oldQuota;
    }
  });
  it("a workflow job ID never claims an unrelated pending generation", async () => {
    const first = await requestGeneration(await draft(), randomUUID());
    const second = await requestGeneration(await draft(), randomUUID());
    const api = provider();
    await processOne(api, repository, undefined, second.id);
    expect(api.create).toHaveBeenCalledTimes(1);
    expect(
      (await db.select().from(jobs).where(eq(jobs.id, first.id)))[0].status,
    ).toBe("pending");
    expect(
      (await db.select().from(jobs).where(eq(jobs.id, second.id)))[0].status,
    ).toBe("queued");
  });
  it("does not repeat a paid submission when saving its returned task ID fails", async () => {
    const j = await requestGeneration(await draft(), randomUUID());
    const api = provider();
    let lostWrite = false;
    await processOne(api, {
      claim: repository.claim,
      async patch(job, changes) {
        if (changes.providerId && !lostWrite) {
          lostWrite = true;
          throw new Error("Task ID write interrupted");
        }
        return repository.patch(job, changes);
      },
    });
    expect(
      (await db.select().from(jobs).where(eq(jobs.id, j.id)))[0].status,
    ).toBe("uncertain");
    await due(j.id);
    await processOne(api, repository, undefined, j.id);
    expect(api.create).toHaveBeenCalledTimes(1);
  });
  it("resumes a known provider task and retries downloads without generating again", async () => {
    const p = await draft(),
      j = await requestGeneration(p, randomUUID()),
      api = provider();
    await processOne(api);
    expect(api.create).toHaveBeenCalledTimes(1);
    expect(
      (await db.select().from(jobs).where(eq(jobs.id, j.id)).limit(1))[0]
        ?.providerId,
    ).toBe("task_test");
    await due(j.id);
    const dl = vi
      .fn()
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValue(await readFile("tests/fixtures/mock.glb"));
    await processOne(api, repository, dl);
    expect(
      (await db.select().from(jobs).where(eq(jobs.id, j.id)).limit(1))[0]
        ?.status,
    ).toBe("asset_retry");
    await due(j.id);
    await processOne(api, repository, dl);
    expect(api.create).toHaveBeenCalledTimes(1);
    expect(
      (await db.select().from(jobs).where(eq(jobs.id, j.id)).limit(1))[0]
        ?.status,
    ).toBe("ready");
    expect((await owned(p.id, p.owner)).modelAsset).toBeTruthy();
  });
  it("returns the completed model with its ready job when the caller holds an older draft", async () => {
    const p = await draft(),
      j = await requestGeneration(p, randomUUID()),
      api = provider();
    expect(p.modelAsset).toBeNull();
    await processOne(api, repository, undefined, j.id);
    await due(j.id);
    await processOne(
      api,
      repository,
      () => readFile("tests/fixtures/mock.glb"),
      j.id,
    );

    const view = await projectView(p);
    expect(view.job).toMatchObject({ id: j.id, status: "ready" });
    expect(view.job?.finalAsset).toBeTruthy();
    expect(view.modelAsset).toBe(view.job?.finalAsset);
    expect(view.modelUrl).toBe(`/api/assets/${view.job?.finalAsset}`);
  });
  it("never automatically retries an uncertain paid submission", async () => {
    const p = await draft(),
      j = await requestGeneration(p, randomUUID()),
      api = provider();
    api.create.mockRejectedValue(new ProviderError("timeout"));
    await processOne(api);
    expect(
      (await db.select().from(jobs).where(eq(jobs.id, j.id)).limit(1))[0]
        ?.status,
    ).toBe("uncertain");
    await due(j.id);
    await processOne(api);
    expect(api.create).toHaveBeenCalledTimes(1);
    await expect(requestGeneration(p, randomUUID())).rejects.toThrow(
      "already has an attempt",
    );
  });
  it("an interrupted submitting lease becomes uncertain without a new request", async () => {
    const p = await draft(),
      j = await requestGeneration(p, randomUUID()),
      api = provider();
    await db
      .update(jobs)
      .set({ status: "submitting" })
      .where(eq(jobs.id, j.id));
    await processOne(api);
    expect(api.create).not.toHaveBeenCalled();
    expect(
      (await db.select().from(jobs).where(eq(jobs.id, j.id)).limit(1))[0]
        ?.status,
    ).toBe("uncertain");
  });
  it("fences old leases", async () => {
    const p = await draft(),
      j = await requestGeneration(p, randomUUID()),
      claimed = (await repository.claim())!;
    await due(j.id);
    const newer = (await repository.claim())!;
    expect(await repository.patch(claimed, { status: "ready" })).toBe(false);
    expect(await repository.patch(newer, { status: "failed" })).toBe(true);
  });
});
describe("ownership, sharing, and storage", () => {
  it("does not wrap an unapproved character", async () => {
    const p = await draft();
    await expect(publish({ ...p, approved: 1 })).rejects.toThrow(
      "Approve your character",
    );
    expect((await projectView(p)).shares).toHaveLength(0);
  });
  it("wrapping new versions preserves old words and independently revocable links", async () => {
    const p = await draft();
    await db.update(projects).set({ approved: 1 }).where(eq(projects.id, p.id));
    const first = await publish(await owned(p.id, p.owner));
    await db
      .update(projects)
      .set({
        config: JSON.stringify({
          ...defaults,
          recipient: "Jamie",
          message: "A new letter",
        }),
      })
      .where(eq(projects.id, p.id));
    const second = await publish(await owned(p.id, p.owner));
    expect(first.version).toBe(1);
    expect(second.version).toBe(2);
    expect(second.token).not.toBe(first.token);
    expect(
      JSON.parse((await shared(first.token)).snapshot).config.message,
    ).toBe(defaults.message);
    expect(
      JSON.parse((await shared(second.token)).snapshot).config.message,
    ).toBe("A new letter");
    await db.update(gifts).set({ revoked: 1 }).where(eq(gifts.id, first.id));
    await expect(shared(first.token)).rejects.toThrow("no longer");
    expect((await shared(second.token)).id).toBe(second.id);
  });
  it("isolates published snapshots and checks ownership/revocation", async () => {
    const p = await draft();
    await db
      .update(projects)
      .set({
        approved: 1,
        config: JSON.stringify({
          ...defaults,
          dedication: "Our Saturday adventures",
        }),
      })
      .where(eq(projects.id, p.id));
    const g = await publish(await owned(p.id, p.owner));
    await db
      .update(projects)
      .set({
        config: JSON.stringify({
          ...defaults,
          message: "Changed later",
          dedication: "Another thought",
        }),
      })
      .where(eq(projects.id, p.id));
    expect(JSON.parse((await shared(g.token)).snapshot).config.message).toBe(
      defaults.message,
    );
    expect(JSON.parse((await shared(g.token)).snapshot).config.dedication).toBe(
      "Our Saturday adventures",
    );
    await expect(owned(p.id, "intruder")).rejects.toThrow("not found");
    await db.update(gifts).set({ revoked: 1 }).where(eq(gifts.id, g.id));
    await expect(shared(g.token)).rejects.toThrow("no longer");
  });
  it("reads legacy drafts without inventing a personal detail or rewriting storage", async () => {
    const p = await draft();
    const { dedication: _removed, ...legacy } = defaults;
    await db
      .update(projects)
      .set({ config: JSON.stringify(legacy) })
      .where(eq(projects.id, p.id));
    expect(
      (await projectView(await owned(p.id, p.owner))).config.dedication,
    ).toBe("");
    expect(JSON.parse((await owned(p.id, p.owner)).config)).not.toHaveProperty(
      "dedication",
    );
  });
  it("removes files and shared access without resetting quota history", async () => {
    const p = await draft(),
      input = await asset(p.inputAsset!);
    await requestGeneration(p, randomUUID());
    const count = (
      await query<{ n: number }>(
        sql`SELECT COUNT(*)::integer AS n FROM generation_usage`,
      )
    )[0].n;
    await deleteProject(p.id);
    await expect(storage.read(input.filename)).rejects.toThrow();
    await expect(owned(p.id, p.owner)).rejects.toThrow();
    expect(
      (
        await query<{ n: number }>(
          sql`SELECT COUNT(*)::integer AS n FROM generation_usage`,
        )
      )[0].n,
    ).toBe(count);
  });
  it("rejects wrong content, too-small images, oversized upload, and non-GLB", async () => {
    await expect(normalizeImage(Buffer.from("not image"))).rejects.toThrow(
      "could not be read",
    );
    await expect(
      normalizeImage(Buffer.alloc(11 * 1024 * 1024)),
    ).rejects.toThrow("10 MB");
    await expect(validateModel(Buffer.from("not a glb"))).rejects.toThrow(
      "GLB",
    );
    expect(
      (await validateModel(await readFile("tests/fixtures/mock.glb")))
        .triangles,
    ).toBe(8);
  });
  it("blocks traversal and arbitrary output hosts", async () => {
    expect(() => storage.read("../.env")).toThrow("Invalid asset");
    await expect(downloadModel("http://127.0.0.1/file")).rejects.toThrow(
      "not approved",
    );
    await expect(
      downloadModel("https://evil.example/model.glb"),
    ).rejects.toThrow("not approved");
  });
  it("requires exact same-origin for mutations", () => {
    expect(() =>
      sameOrigin(
        new NextRequest("http://localhost:3000/api/projects", {
          headers: { origin: "https://evil.example" },
        }),
      ),
    ).toThrow();
    expect(() =>
      sameOrigin(
        new NextRequest("http://localhost:3000/api/projects", {
          headers: { origin: "http://localhost:3000" },
        }),
      ),
    ).not.toThrow();
  });
});
describe("documented Tripo v3 wire contract (mocked fetch, not live evidence)", () => {
  it("uses file upload, dedicated image-to-model, and output.model_url", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({ code: 0, data: { file_token: "file_one" } }),
      )
      .mockResolvedValueOnce(
        Response.json({ code: 0, data: { task_id: "task_one" } }),
      )
      .mockResolvedValueOnce(
        Response.json({
          code: 0,
          data: {
            task_id: "task_one",
            status: "success",
            progress: 100,
            output: { model_url: "https://cdn.tripo3d.ai/a.glb" },
          },
        }),
      );
    vi.stubGlobal("fetch", fetcher);
    try {
      const p = new LiveTripo();
      expect(await p.upload(Buffer.from("image"))).toBe("file_one");
      expect(await p.create("file_one", "v3.1-20260211")).toBe("task_one");
      expect((await p.retrieve("task_one")).modelUrl).toBe(
        "https://cdn.tripo3d.ai/a.glb",
      );
      expect(fetcher.mock.calls[0][0]).toContain("/v3/files");
      expect(JSON.parse(fetcher.mock.calls[1][1].body)).toMatchObject({
        input: "file_one",
        model: "v3.1-20260211",
        face_limit: 20000,
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
