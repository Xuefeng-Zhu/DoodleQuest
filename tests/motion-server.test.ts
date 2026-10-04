import { beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { eq, sql } from "drizzle-orm";
import { NextRequest } from "next/server";
import { db, ready, query } from "../src/server/db";
import {
  motionJobs,
  jobs,
  projects,
  sessions,
  type MotionJob,
} from "../src/server/schema";
import {
  newProject,
  requestMotion,
  requestGeneration,
  motionRepository,
  projectView,
  publish,
} from "../src/server/repository";
import { processMotionOne } from "../src/server/motion-worker";
import {
  asset,
  InvalidModelError,
  saveAsset,
  validateModel,
} from "../src/server/storage";
import { digest, owned, shared } from "../src/server/security";
import {
  LiveTripo,
  ProviderError,
  type ProviderTask,
} from "../src/server/tripo";
import { deleteProject } from "../src/server/cleanup";
import { env } from "../src/server/env";
import { dispatchJob } from "../src/server/dispatch";
import { POST } from "../src/app/api/[...path]/route";

vi.mock("../src/server/dispatch", () => ({
  dispatchJob: vi.fn().mockResolvedValue(undefined),
}));

async function hero(unlocked = 1) {
  const cookie = randomUUID(),
    owner = digest(cookie);
  await db.insert(sessions).values({
    id: owner,
    createdAt: Date.now(),
    expiresAt: Date.now() + 100_000,
    unlocked,
  });
  const p = await newProject(owner);
  const inputAsset = await saveAsset(
    p.id,
    "drawing",
    await readFile("public/sample-drawing.png"),
  );
  const modelAsset = await saveAsset(
    p.id,
    "model",
    await readFile("tests/fixtures/mock.glb"),
    { providerTask: "task_original", source: "tripo" },
  );
  await db
    .update(projects)
    .set({ inputAsset, revision: 1, modelAsset, source: "tripo", approved: 1 })
    .where(eq(projects.id, p.id));
  return { ...(await owned(p.id, owner)), cookie };
}
const get = async (id: string) =>
  (
    await db.select().from(motionJobs).where(eq(motionJobs.id, id)).limit(1)
  )[0]!;
function rewriteGlb(
  bytes: Buffer,
  edit: (doc: {
    animations: {
      name: string;
      channels: { target: { node: number; path: string } }[];
    }[];
    nodes: unknown[];
    skins: { joints: number[] }[];
  }) => void,
) {
  const len = bytes.readUInt32LE(12),
    doc = JSON.parse(bytes.toString("utf8", 20, 20 + len));
  edit(doc);
  const json = Buffer.from(JSON.stringify(doc));
  const padded = Buffer.alloc(Math.ceil(json.length / 4) * 4, 32);
  json.copy(padded);
  const binary = bytes.subarray(20 + len),
    result = Buffer.alloc(20 + padded.length + binary.length);
  bytes.copy(result, 0, 0, 20);
  result.writeUInt32LE(result.length, 8);
  result.writeUInt32LE(padded.length, 12);
  padded.copy(result, 20);
  binary.copy(result, 20 + padded.length);
  return result;
}
async function due(id: string) {
  await db
    .update(motionJobs)
    .set({ leaseUntil: 0, nextPoll: 0 })
    .where(eq(motionJobs.id, id));
}
const provider = () => ({
  upload: vi.fn(),
  create: vi.fn(),
  rigCheck: vi.fn().mockResolvedValue("task_check"),
  rig: vi.fn().mockResolvedValue("task_rig"),
  retarget: vi.fn().mockResolvedValue("task_retarget"),
  retrieve: vi.fn(async (id: string): Promise<ProviderTask> => ({
    id,
    status: "success",
    progress: 100,
    ...(id === "task_check"
      ? { riggable: true, rigType: "biped" }
      : { modelUrl: "https://cdn.tripo3d.ai/animated.glb" }),
  })),
});
async function steps(
  id: string,
  api: ReturnType<typeof provider>,
  count = 6,
  download = () => readFile("tests/fixtures/animated.glb"),
) {
  for (let i = 0; i < count; i++) {
    await due(id);
    await processMotionOne(api, motionRepository, download);
  }
}
function request(
  p: Awaited<ReturnType<typeof hero>>,
  action = "animate",
  body: unknown = { key: randomUUID(), consent: true },
  origin = env.origin,
) {
  return POST(
    new NextRequest(`${env.origin}/api/projects/${p.id}/${action}`, {
      method: "POST",
      headers: {
        origin,
        cookie: `dq_owner=${p.cookie}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ path: ["projects", p.id, action] }) },
  );
}
beforeEach(async () => {
  await ready();
  await db.update(motionJobs).set({ status: "failed", leaseUntil: 0 });
  await db.update(jobs).set({ status: "failed", leaseUntil: 0 });
  vi.mocked(dispatchJob).mockClear();
});

describe("durable hero movement", () => {
  it("shares the last quota slot atomically between generation and motion", async () => {
    const [a, b] = await Promise.all([hero(), hero()]);
    const [usage] = await query<{ count: number }>(
      sql`SELECT COUNT(*)::integer AS count FROM generation_usage`,
    );
    const previous = env.quota;
    env.quota = usage.count + 1;
    try {
      const results = await Promise.allSettled([
        requestGeneration(a, randomUUID()),
        requestMotion(b, randomUUID()),
      ]);
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      const rejected = results.find((r) => r.status === "rejected");
      expect(rejected?.reason.message).toContain("quota");
    } finally {
      env.quota = previous;
    }
  });
  it("runs all three stages once, keeps the approved hero until completion, and preserves published versions", async () => {
    const p = await hero(),
      gift = await publish(p),
      key = randomUUID(),
      api = provider();
    const [j, repeated, distinct] = await Promise.all([
      requestMotion(p, key),
      requestMotion(p, key),
      requestMotion(p, randomUUID()),
    ]);
    expect(repeated.id).toBe(j.id);
    expect(distinct.id).toBe(j.id);
    expect(await owned(p.id, p.owner)).toMatchObject({
      approved: 1,
      modelAsset: p.modelAsset,
    });
    await steps(j.id, api, 5);
    expect(await get(j.id)).toMatchObject({
      stage: "retarget",
      checkTask: "task_check",
      rigTask: "task_rig",
      retargetTask: "task_retarget",
    });
    expect((await owned(p.id, p.owner)).modelAsset).toBe(p.modelAsset);
    await steps(j.id, api, 1);
    expect((await get(j.id)).status).toBe("ready");
    const final = await owned(p.id, p.owner);
    expect(final.approved).toBe(0);
    expect(final.modelAsset).toBe((await get(j.id)).finalAsset);
    expect(final.modelAsset).not.toBe(p.modelAsset);
    expect(JSON.parse((await asset(final.modelAsset!)).metadata)).toMatchObject(
      {
        rigged: true,
        generationTask: "task_original",
        animationClips: [
          "preset:biped:idle",
          "preset:biped:walk",
          "preset:biped:cheer",
        ],
      },
    );
    expect(JSON.parse((await shared(gift.token)).snapshot).modelAsset).toBe(
      p.modelAsset,
    );
    expect(api.rigCheck).toHaveBeenCalledExactlyOnceWith("task_original");
    expect(api.rig).toHaveBeenCalledExactlyOnceWith("task_original", "biped");
    expect(api.retarget).toHaveBeenCalledExactlyOnceWith("task_rig", "biped");
    expect((await projectView(final)).motionJob).toMatchObject({
      status: "ready",
      finalAsset: final.modelAsset,
      inputAsset: p.modelAsset,
    });
  });

  it("resumes saved stages and retries only local download without repeating paid work", async () => {
    const p = await hero(),
      j = await requestMotion(p, randomUUID()),
      api = provider();
    await steps(j.id, api, 5);
    const restarted = provider();
    const download = vi
      .fn()
      .mockRejectedValueOnce(new Error("interrupted"))
      .mockResolvedValue(await readFile("tests/fixtures/animated.glb"));
    await steps(j.id, restarted, 1, download);
    expect((await get(j.id)).status).toBe("asset_retry");
    await steps(j.id, restarted, 1, download);
    expect((await get(j.id)).status).toBe("ready");
    expect(restarted.rigCheck).not.toHaveBeenCalled();
    expect(restarted.rig).not.toHaveBeenCalled();
    expect(restarted.retarget).not.toHaveBeenCalled();
  });

  it.each(["rig_check", "rig", "retarget"])(
    "does not repeat an interrupted %s submission",
    async (stage) => {
      const p = await hero(),
        j = await requestMotion(p, randomUUID()),
        api = provider();
      await db
        .update(motionJobs)
        .set({
          stage,
          status: "submitting",
          checkTask: stage !== "rig_check" ? "task_check" : null,
          rigTask: stage === "retarget" ? "task_rig" : null,
          rigType: stage !== "rig_check" ? "biped" : null,
        })
        .where(eq(motionJobs.id, j.id));
      await steps(j.id, api, 2);
      expect((await get(j.id)).status).toBe("uncertain");
      expect(api.rigCheck).not.toHaveBeenCalled();
      expect(api.rig).not.toHaveBeenCalled();
      expect(api.retarget).not.toHaveBeenCalled();
      await expect(requestMotion(p, randomUUID())).rejects.toThrow(
        "already has a movement attempt",
      );
      const retry = await requestMotion(p, randomUUID(), true);
      expect(retry.stage).toBe(stage);
      await steps(retry.id, api, 1);
      expect(
        stage === "rig_check"
          ? api.rigCheck
          : stage === "rig"
            ? api.rig
            : api.retarget,
      ).toHaveBeenCalledTimes(1);
    },
  );

  it("marks an ambiguous retarget call uncertain and an explicit retry reuses its completed rig", async () => {
    const p = await hero(),
      j = await requestMotion(p, randomUUID()),
      api = provider();
    api.retarget.mockRejectedValueOnce(new ProviderError("timeout"));
    await steps(j.id, api, 6);
    expect((await get(j.id)).status).toBe("uncertain");
    expect(api.retarget).toHaveBeenCalledTimes(1);
    const retry = await requestMotion(p, randomUUID(), true);
    await steps(retry.id, api, 2);
    expect((await get(retry.id)).status).toBe("ready");
    expect(api.rigCheck).toHaveBeenCalledTimes(1);
    expect(api.rig).toHaveBeenCalledTimes(1);
    expect(api.retarget).toHaveBeenCalledTimes(2);
  });

  it.each([
    { riggable: false, rigType: "biped" },
    { riggable: true, rigType: "avian" },
  ])(
    "falls back without paid rigging for unsupported $rigType ($riggable)",
    async (result) => {
      const p = await hero(),
        j = await requestMotion(p, randomUUID()),
        api = provider();
      api.retrieve.mockResolvedValue({
        id: "task_check",
        status: "success",
        ...result,
      });
      await steps(j.id, api, 4);
      expect((await get(j.id)).status).toBe("unsupported");
      expect(api.rig).not.toHaveBeenCalled();
      expect(await owned(p.id, p.owner)).toMatchObject({
        modelAsset: p.modelAsset,
        approved: 1,
      });
    },
  );

  it("preserves the original hero on provider failure or missing skeletal animation", async () => {
    const p = await hero(),
      j = await requestMotion(p, randomUUID()),
      api = provider();
    await steps(j.id, api, 6, () => readFile("tests/fixtures/mock.glb"));
    expect(await get(j.id)).toMatchObject({ status: "failed" });
    expect((await get(j.id)).lastError).toContain("skeletal animation");
    expect(await owned(p.id, p.owner)).toMatchObject({
      modelAsset: p.modelAsset,
      approved: 1,
    });
    await expect(requestMotion(p, randomUUID())).rejects.toThrow(
      "already has a movement attempt",
    );
    const retry = await requestMotion(p, randomUUID(), true);
    expect(retry).toMatchObject({
      stage: "retarget",
      checkTask: "task_check",
      rigTask: "task_rig",
      retargetTask: null,
    });
    api.retrieve.mockResolvedValue({ id: "task_retarget", status: "failed" });
    await steps(retry.id, api, 2);
    expect((await get(retry.id)).status).toBe("failed");
    expect(api.rigCheck).toHaveBeenCalledTimes(1);
    expect(api.rig).toHaveBeenCalledTimes(1);
    expect(api.retarget).toHaveBeenCalledTimes(2);
  });

  it("keeps the approved hero when Tripo returns unrecognized clip names", async () => {
    const p = await hero(),
      j = await requestMotion(p, randomUUID()),
      api = provider();
    const renamed = rewriteGlb(
      await readFile("tests/fixtures/animated.glb"),
      (doc) => {
        doc.animations.forEach((clip, i) => {
          clip.name = `unknown_${i}`;
        });
      },
    );
    await steps(j.id, api, 6, async () => renamed);
    expect((await get(j.id)).status).toBe("failed");
    expect((await get(j.id)).lastError).toContain("clip names");
    expect(await owned(p.id, p.owner)).toMatchObject({
      modelAsset: p.modelAsset,
      approved: 1,
    });
  });

  it("terminates malformed output without blocking replacement or deletion", async () => {
    const p = await hero(),
      j = await requestMotion(p, randomUUID()),
      api = provider();
    const download = vi.fn().mockResolvedValue(Buffer.from("not a GLB"));
    await steps(j.id, api, 8, download);
    expect((await get(j.id)).status).toBe("failed");
    expect(download).toHaveBeenCalledTimes(1);
    expect(await owned(p.id, p.owner)).toMatchObject({
      modelAsset: p.modelAsset,
      approved: 1,
    });
    const form = new FormData();
    form.set("sample", "true");
    const replaced = await POST(
      new NextRequest(`${env.origin}/api/projects/${p.id}/drawing`, {
        method: "POST",
        headers: { origin: env.origin, cookie: `dq_owner=${p.cookie}` },
        body: form,
      }),
      { params: Promise.resolve({ path: ["projects", p.id, "drawing"] }) },
    );
    expect(replaced.status).toBe(200);
    expect(await owned(p.id, p.owner)).toMatchObject({
      revision: 2,
      modelAsset: null,
    });
    await expect(deleteProject(p.id)).resolves.toBeUndefined();
    await expect(owned(p.id, p.owner)).rejects.toThrow("not found");
  });

  it("terminates an oversized streaming download instead of fetching it forever", async () => {
    const p = await hero(),
      j = await requestMotion(p, randomUUID()),
      api = provider();
    const download = vi
      .fn()
      .mockRejectedValue(new InvalidModelError("Model exceeds 25 MB."));
    await steps(j.id, api, 8, download);
    expect((await get(j.id)).status).toBe("failed");
    expect(download).toHaveBeenCalledTimes(1);
    expect(await owned(p.id, p.owner)).toMatchObject({
      modelAsset: p.modelAsset,
      approved: 1,
    });
  });

  it("cannot replace a newer hero when completion becomes stale during download", async () => {
    const p = await hero(),
      j = await requestMotion(p, randomUUID()),
      api = provider();
    await steps(j.id, api, 5);
    await steps(j.id, api, 1, async () => {
      await db
        .update(projects)
        .set({ revision: 2, source: "procedural" })
        .where(eq(projects.id, p.id));
      return readFile("tests/fixtures/animated.glb");
    });
    expect((await get(j.id)).status).toBe("failed");
    expect(await owned(p.id, p.owner)).toMatchObject({
      modelAsset: p.modelAsset,
      approved: 1,
      revision: 2,
    });
  });

  it("fences expired workers before final attachment", async () => {
    const p = await hero(),
      j = await requestMotion(p, randomUUID()),
      api = provider();
    await steps(j.id, api, 5);
    await steps(j.id, api, 1, async () => {
      await due(j.id);
      const newer = (await motionRepository.claim())!;
      expect(newer).toBeTruthy();
      return readFile("tests/fixtures/animated.glb");
    });
    expect((await get(j.id)).status).not.toBe("ready");
    expect(await owned(p.id, p.owner)).toMatchObject({
      modelAsset: p.modelAsset,
      approved: 1,
    });
  });

  it("guards replacement and deletion and retains quota history after deletion", async () => {
    const p = await hero(),
      j = await requestMotion(p, randomUUID());
    await expect(requestGeneration(p, randomUUID())).rejects.toThrow(
      "movement finish",
    );
    await expect(deleteProject(p.id)).rejects.toThrow("movement finish");
    expect((await request(p, "drawing", {})).status).toBe(409);
    await db
      .update(motionJobs)
      .set({ status: "failed" })
      .where(eq(motionJobs.id, j.id));
    await deleteProject(p.id);
    expect(
      (
        await query<{ id: string }>(
          sql`SELECT id FROM generation_usage WHERE id=${j.id}`,
        )
      )[0],
    ).toBeTruthy();
  });

  it("enforces shared generation quota and rejects procedural or unrelated-owner sources", async () => {
    const p = await hero();
    const oldQuota = env.quota;
    env.quota = 0;
    try {
      await expect(requestMotion(p, randomUUID())).rejects.toThrow("quota");
    } finally {
      env.quota = oldQuota;
    }
    await expect(
      requestMotion({ ...p, owner: "other" }, randomUUID()),
    ).rejects.toThrow("not found");
    await db
      .update(projects)
      .set({ source: "procedural" })
      .where(eq(projects.id, p.id));
    await expect(requestMotion(p, randomUUID())).rejects.toThrow("custom hero");
  });
});

describe("animation endpoint and GLB guardrails", () => {
  it("requires ownership, same-origin, consent, configured provider, and unlocked access", async () => {
    const p = await hero(0),
      oldKey = env.key,
      oldMock = env.mock;
    try {
      env.key = "";
      env.mock = false;
      expect((await request(p)).status).toBe(503);
      env.mock = true;
      expect((await request(p)).status).toBe(403);
      await db
        .update(sessions)
        .set({ unlocked: 1 })
        .where(eq(sessions.id, p.owner));
      expect(
        (await request(p, "animate", { key: randomUUID(), consent: false }))
          .status,
      ).toBe(400);
      expect(
        (await request(p, "animate", undefined, "https://evil.example")).status,
      ).toBe(403);
      expect((await request({ ...p, cookie: randomUUID() })).status).toBe(401);
      const other = await hero();
      expect((await request({ ...p, cookie: other.cookie })).status).toBe(404);
      const accepted = await request(p);
      expect(accepted.status).toBe(200);
      const job = await accepted.json();
      expect(dispatchJob).toHaveBeenCalledExactlyOnceWith("motion", job.id);
    } finally {
      env.key = oldKey;
      env.mock = oldMock;
    }
  });

  it("rejects approval of a model replaced after its preview loaded", async () => {
    const p = await hero();
    expect(
      (await request(p, "approve", { loaded: true, modelAsset: randomUUID() }))
        .status,
    ).toBe(409);
    expect(
      (await request(p, "approve", { loaded: true, modelAsset: p.modelAsset }))
        .status,
    ).toBe(200);
  });

  it("extracts actual embedded animation metadata and rejects oversized skeletons", async () => {
    const bytes = await readFile("tests/fixtures/animated.glb");
    expect(await validateModel(bytes)).toMatchObject({
      rigged: true,
      animationClips: [
        "preset:biped:idle",
        "preset:biped:walk",
        "preset:biped:cheer",
      ],
    });
    const len = bytes.readUInt32LE(12),
      doc = JSON.parse(bytes.toString("utf8", 20, 20 + len));
    doc.skins[0].joints = Array(257).fill(0);
    const json = Buffer.from(JSON.stringify(doc));
    const padded = Buffer.alloc(Math.ceil(json.length / 4) * 4, 32);
    json.copy(padded);
    const binary = bytes.subarray(20 + len),
      invalid = Buffer.alloc(20 + padded.length + binary.length);
    bytes.copy(invalid, 0, 0, 20);
    invalid.writeUInt32LE(invalid.length, 8);
    invalid.writeUInt32LE(padded.length, 12);
    padded.copy(invalid, 20);
    binary.copy(invalid, 20 + padded.length);
    await expect(validateModel(invalid)).rejects.toThrow(
      "skeleton or animation",
    );
  });

  it("rejects named clips that animate an unrelated node instead of skin joints", async () => {
    const bytes = rewriteGlb(
      await readFile("tests/fixtures/animated.glb"),
      (doc) => {
        for (const animation of doc.animations)
          for (const channel of animation.channels) {
            doc.nodes.push({ name: "Unrelated" });
            channel.target.node = doc.nodes.length - 1;
          }
      },
    );
    await expect(validateModel(bytes, true)).rejects.toThrow(
      "skeletal animation",
    );
  });
});

describe("Tripo v3 motion contract (mocked, no live provider calls)", () => {
  it("uses documented models, presets, geometry and in-place GLB options", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        Response.json({ code: 0, data: { task_id: "task_result" } }),
      );
    // Return a fresh Response for each request since fetch responses have one-use bodies.
    fetcher.mockImplementation(async () =>
      Response.json({ code: 0, data: { task_id: "task_result" } }),
    );
    vi.stubGlobal("fetch", fetcher);
    try {
      const api = new LiveTripo();
      await api.rigCheck("task_original");
      await api.rig("task_original", "biped");
      await api.retarget("task_rig", "biped");
      await api.rig("task_original", "quadruped");
      await api.retarget("task_animal_rig", "quadruped");
      expect(fetcher.mock.calls.map(([url]) => url)).toEqual(
        ["rig-check", "rig", "retarget", "rig", "retarget"].map(
          (s) => `https://openapi.tripo3d.ai/v3/animations/${s}`,
        ),
      );
      const bodies = fetcher.mock.calls.map(([, init]) =>
        JSON.parse(init.body),
      );
      expect(bodies[0]).toEqual({ input: "task_original" });
      expect(bodies[1]).toEqual({
        input: "task_original",
        model: "v1.0-20240301",
        rig_type: "biped",
        spec: "tripo",
        out_format: "glb",
      });
      expect(bodies[2]).toEqual({
        input: "task_rig",
        animations: [
          "preset:biped:idle",
          "preset:biped:walk",
          "preset:biped:cheer",
        ],
        out_format: "glb",
        bake_animation: true,
        export_with_geometry: true,
        animate_in_place: true,
      });
      expect(bodies[3].model).toBe("v2.5-20260210");
      expect(bodies[4].animations).toEqual(["preset:quadruped:walk"]);
      fetcher.mockImplementationOnce(async () =>
        Response.json({
          code: 0,
          data: {
            task_id: "task_check",
            status: "success",
            output: { riggable: true, rig_type: "biped" },
          },
        }),
      );
      expect(await api.retrieve("task_check")).toMatchObject({
        riggable: true,
        rigType: "biped",
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
