import { describe, it, expect, vi, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { eq } from "drizzle-orm";
import { db, sqlite } from "../src/server/db";
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
import { NextRequest } from "next/server";
async function draft() {
  const owner = randomUUID();
  db.insert(sessions)
    .values({
      id: owner,
      createdAt: Date.now(),
      expiresAt: Date.now() + 100000,
    })
    .run();
  const p = newProject(owner);
  const inputAsset = await saveAsset(
    p.id,
    "drawing",
    await readFile("public/sample-drawing.png"),
    { sample: true },
  );
  db.update(projects)
    .set({ inputAsset, revision: 1 })
    .where(eq(projects.id, p.id))
    .run();
  return owned(p.id, owner);
}
function due(id: string) {
  db.update(jobs)
    .set({ leaseUntil: 0, nextPoll: 0 })
    .where(eq(jobs.id, id))
    .run();
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
beforeEach(() => {
  sqlite.prepare("UPDATE jobs SET status='failed'").run();
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
    const a = requestGeneration(p, key);
    expect(requestGeneration(p, key).id).toBe(a.id);
    expect(requestGeneration(p, randomUUID()).id).toBe(a.id);
  });
  it("resumes a known provider task and retries downloads without generating again", async () => {
    const p = await draft(),
      j = requestGeneration(p, randomUUID()),
      api = provider();
    await processOne(api);
    expect(api.create).toHaveBeenCalledTimes(1);
    expect(
      db.select().from(jobs).where(eq(jobs.id, j.id)).get()?.providerId,
    ).toBe("task_test");
    due(j.id);
    const dl = vi
      .fn()
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValue(await readFile("tests/fixtures/mock.glb"));
    await processOne(api, repository, dl);
    expect(db.select().from(jobs).where(eq(jobs.id, j.id)).get()?.status).toBe(
      "asset_retry",
    );
    due(j.id);
    await processOne(api, repository, dl);
    expect(api.create).toHaveBeenCalledTimes(1);
    expect(db.select().from(jobs).where(eq(jobs.id, j.id)).get()?.status).toBe(
      "ready",
    );
    expect(owned(p.id, p.owner).modelAsset).toBeTruthy();
  });
  it("never automatically retries an uncertain paid submission", async () => {
    const p = await draft(),
      j = requestGeneration(p, randomUUID()),
      api = provider();
    api.create.mockRejectedValue(new ProviderError("timeout"));
    await processOne(api);
    expect(db.select().from(jobs).where(eq(jobs.id, j.id)).get()?.status).toBe(
      "uncertain",
    );
    due(j.id);
    await processOne(api);
    expect(api.create).toHaveBeenCalledTimes(1);
    expect(() => requestGeneration(p, randomUUID())).toThrow(
      "already has an attempt",
    );
  });
  it("an interrupted submitting lease becomes uncertain without a new request", async () => {
    const p = await draft(),
      j = requestGeneration(p, randomUUID()),
      api = provider();
    db.update(jobs)
      .set({ status: "submitting" })
      .where(eq(jobs.id, j.id))
      .run();
    await processOne(api);
    expect(api.create).not.toHaveBeenCalled();
    expect(db.select().from(jobs).where(eq(jobs.id, j.id)).get()?.status).toBe(
      "uncertain",
    );
  });
  it("fences old leases", async () => {
    const p = await draft(),
      j = requestGeneration(p, randomUUID()),
      claimed = repository.claim()!;
    due(j.id);
    const newer = repository.claim()!;
    expect(repository.patch(claimed, { status: "ready" })).toBe(false);
    expect(repository.patch(newer, { status: "failed" })).toBe(true);
  });
});
describe("ownership, sharing, and storage", () => {
  it("does not wrap an unapproved character", async () => {
    const p = await draft();
    expect(() => publish(p)).toThrow("Approve your character");
    expect(projectView(p).shares).toHaveLength(0);
  });
  it("wrapping new versions preserves old words and independently revocable links", async () => {
    const p = await draft();
    db.update(projects).set({ approved: 1 }).where(eq(projects.id, p.id)).run();
    const first = publish(owned(p.id, p.owner));
    db.update(projects)
      .set({
        config: JSON.stringify({
          ...defaults,
          recipient: "Jamie",
          message: "A new letter",
        }),
      })
      .where(eq(projects.id, p.id))
      .run();
    const second = publish(owned(p.id, p.owner));
    expect(first.version).toBe(1);
    expect(second.version).toBe(2);
    expect(second.token).not.toBe(first.token);
    expect(JSON.parse(shared(first.token).snapshot).config.message).toBe(
      defaults.message,
    );
    expect(JSON.parse(shared(second.token).snapshot).config.message).toBe(
      "A new letter",
    );
    db.update(gifts).set({ revoked: 1 }).where(eq(gifts.id, first.id)).run();
    expect(() => shared(first.token)).toThrow("no longer");
    expect(shared(second.token).id).toBe(second.id);
  });
  it("isolates published snapshots and checks ownership/revocation", async () => {
    const p = await draft();
    db.update(projects)
      .set({
        approved: 1,
        config: JSON.stringify({
          ...defaults,
          dedication: "Our Saturday adventures",
        }),
      })
      .where(eq(projects.id, p.id))
      .run();
    const g = publish(owned(p.id, p.owner));
    db.update(projects)
      .set({
        config: JSON.stringify({
          ...defaults,
          message: "Changed later",
          dedication: "Another thought",
        }),
      })
      .where(eq(projects.id, p.id))
      .run();
    expect(JSON.parse(shared(g.token).snapshot).config.message).toBe(
      defaults.message,
    );
    expect(JSON.parse(shared(g.token).snapshot).config.dedication).toBe(
      "Our Saturday adventures",
    );
    expect(() => owned(p.id, "intruder")).toThrow("not found");
    db.update(gifts).set({ revoked: 1 }).where(eq(gifts.id, g.id)).run();
    expect(() => shared(g.token)).toThrow("no longer");
  });
  it("reads legacy drafts without inventing a personal detail or rewriting storage", async () => {
    const p = await draft();
    const { dedication: _removed, ...legacy } = defaults;
    db.update(projects)
      .set({ config: JSON.stringify(legacy) })
      .where(eq(projects.id, p.id))
      .run();
    expect(projectView(owned(p.id, p.owner)).config.dedication).toBe("");
    expect(JSON.parse(owned(p.id, p.owner).config)).not.toHaveProperty(
      "dedication",
    );
  });
  it("removes files and shared access without resetting quota history", async () => {
    const p = await draft(),
      input = asset(p.inputAsset!);
    requestGeneration(p, randomUUID());
    const count = (
      sqlite.prepare("SELECT COUNT(*) n FROM generation_usage").get() as {
        n: number;
      }
    ).n;
    await deleteProject(p.id);
    await expect(storage.read(input.filename)).rejects.toThrow();
    expect(() => owned(p.id, p.owner)).toThrow();
    expect(
      (
        sqlite.prepare("SELECT COUNT(*) n FROM generation_usage").get() as {
          n: number;
        }
      ).n,
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
