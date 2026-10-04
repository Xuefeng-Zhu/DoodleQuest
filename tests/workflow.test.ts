import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { closeDatabase, db, ready, transaction } from "../src/server/db";
import { env } from "../src/server/env";
import {
  jobs,
  motionJobs,
  sessions,
  workflowDispatch,
} from "../src/server/schema";
import { newProject } from "../src/server/repository";
import { dispatchJob } from "../src/server/dispatch";
import { advanceJob } from "../src/workflows/steps";

// These tests verify application dispatch and step behavior, not the compiled
// Workflow runtime. No Workflow service or generation provider is contacted.
const mocks = vi.hoisted(() => ({
  start: vi.fn<(...args: unknown[]) => Promise<{ runId: string }>>(),
  getRun: vi.fn(),
  generation: vi.fn().mockResolvedValue(false),
  motion: vi.fn().mockResolvedValue(false),
}));
vi.mock("workflow/api", () => ({ start: mocks.start, getRun: mocks.getRun }));
vi.mock("../src/workflows/process-job", () => ({ processJob: vi.fn() }));
vi.mock("../src/server/worker", () => ({ processOne: mocks.generation }));
vi.mock("../src/server/motion-worker", () => ({
  processMotionOne: mocks.motion,
}));

const originalMode = { key: env.key, mock: env.mock, poll: env.poll };
const now = 2_000_000_000_000;
beforeAll(ready);
afterAll(closeDatabase);
beforeEach(() => {
  vi.spyOn(Date, "now").mockReturnValue(now);
  mocks.start.mockReset().mockResolvedValue({ runId: "run-new" });
  mocks.getRun.mockReset().mockReturnValue({
    exists: Promise.resolve(true),
    status: Promise.resolve("running"),
  });
  mocks.generation.mockClear();
  mocks.motion.mockClear();
  Object.assign(env, { key: "", mock: true, poll: 5_000 });
});
afterEach(() => {
  Object.assign(env, originalMode);
  vi.restoreAllMocks();
});

function identity(kind: "generation" | "motion", jobId: string) {
  return and(
    eq(workflowDispatch.kind, kind),
    eq(workflowDispatch.jobId, jobId),
  );
}
async function dispatchRecord(
  jobId: string,
  kind: "generation" | "motion" = "generation",
) {
  return (
    await db.select().from(workflowDispatch).where(identity(kind, jobId))
  )[0];
}
async function previousRun(jobId: string, runId: string | null) {
  await transaction(async () => {
    await db.insert(workflowDispatch).values({
      kind: "generation",
      jobId,
      runId,
      dispatchUntil: 0,
      createdAt: now,
    });
  });
}
async function seedJob(
  kind: "generation" | "motion",
  changes: { status?: string; nextPoll?: number; leaseUntil?: number } = {},
) {
  return transaction(async () => {
    const owner = randomUUID();
    await db
      .insert(sessions)
      .values({ id: owner, createdAt: now, expiresAt: now + 60_000 });
    const project = await newProject(owner);
    const common = {
      id: randomUUID(),
      projectId: project.id,
      owner,
      inputAsset: "test-input",
      inputRevision: 1,
      idempotencyKey: randomUUID(),
      status: "pending",
      nextPoll: now,
      createdAt: now,
      updatedAt: now,
      ...changes,
    };
    if (kind === "generation") {
      await db.insert(jobs).values({ ...common, model: "test-model" });
    } else {
      await db.insert(motionJobs).values({
        ...common,
        stage: "check",
        inputSource: "mock",
        generationTask: "mock-test",
      });
    }
    return common.id;
  });
}

describe("durable dispatch recovery", () => {
  it("coalesces concurrent creator polls into one SDK start", async () => {
    const jobId = randomUUID();
    await Promise.all([
      dispatchJob("generation", jobId),
      dispatchJob("generation", jobId),
    ]);
    expect(mocks.start).toHaveBeenCalledTimes(1);
    expect(mocks.start).toHaveBeenCalledWith(expect.any(Function), [
      "generation",
      jobId,
    ]);
    expect(await dispatchRecord(jobId)).toMatchObject({
      runId: "run-new",
      dispatchUntil: now + 300_000,
    });
  });

  it("keeps generation and motion dispatch identities separate", async () => {
    const jobId = randomUUID();
    await dispatchJob("generation", jobId);
    await dispatchJob("motion", jobId);
    expect(mocks.start).toHaveBeenCalledTimes(2);
    expect(await dispatchRecord(jobId, "motion")).toMatchObject({
      runId: "run-new",
    });
  });

  it.each(["pending", "running"])(
    "retains an existing %s workflow after the dispatch lease expires",
    async (status) => {
      const jobId = randomUUID();
      await previousRun(jobId, "run-existing");
      mocks.getRun.mockReturnValue({
        exists: Promise.resolve(true),
        status: Promise.resolve(status),
      });
      await dispatchJob("generation", jobId);
      expect(mocks.start).not.toHaveBeenCalled();
      expect(mocks.getRun).toHaveBeenCalledWith("run-existing");
      expect(await dispatchRecord(jobId)).toMatchObject({
        runId: "run-existing",
        dispatchUntil: now + 300_000,
      });
    },
  );

  it.each(["failed", "cancelled", "completed"])(
    "restarts a retained job when its previous workflow is %s",
    async (status) => {
      const jobId = randomUUID();
      await previousRun(jobId, "run-finished");
      mocks.getRun.mockReturnValue({
        exists: Promise.resolve(true),
        status: Promise.resolve(status),
      });
      await dispatchJob("generation", jobId);
      expect(mocks.start).toHaveBeenCalledTimes(1);
      expect(await dispatchRecord(jobId)).toMatchObject({ runId: "run-new" });
    },
  );

  it("recovers a run that the workflow service no longer has", async () => {
    const jobId = randomUUID();
    await previousRun(jobId, "run-missing");
    mocks.getRun.mockReturnValue({ exists: Promise.resolve(false) });
    await dispatchJob("generation", jobId);
    expect(mocks.start).toHaveBeenCalledTimes(1);
  });

  it("retains an uncertain start for recovery without immediate repeated enqueueing", async () => {
    const jobId = randomUUID();
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.start.mockRejectedValueOnce(new Error("Queue response was lost"));
    await dispatchJob("generation", jobId);
    expect(await dispatchRecord(jobId)).toMatchObject({
      runId: null,
      dispatchUntil: now + 60_000,
    });
    await dispatchJob("generation", jobId);
    expect(mocks.start).toHaveBeenCalledTimes(1);
    vi.mocked(Date.now).mockReturnValue(now + 60_001);
    await dispatchJob("generation", jobId);
    expect(mocks.start).toHaveBeenCalledTimes(2);
    expect(await dispatchRecord(jobId)).toMatchObject({ runId: "run-new" });
  });

  it("fences a slow dispatch response from replacing a newer recovery run", async () => {
    const jobId = randomUUID();
    let resolveFirst!: (value: { runId: string }) => void;
    let firstStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      firstStarted = resolve;
    });
    mocks.start.mockImplementationOnce(() => {
      firstStarted();
      return new Promise((resolve) => {
        resolveFirst = resolve;
      });
    });
    const first = dispatchJob("generation", jobId);
    await started;
    vi.mocked(Date.now).mockReturnValue(now + 60_001);
    await dispatchJob("generation", jobId);
    resolveFirst({ runId: "run-stale" });
    await first;
    expect(await dispatchRecord(jobId)).toMatchObject({ runId: "run-new" });
  });
});

describe("workflow advancement step", () => {
  it("does no provider work when the app is in example mode", async () => {
    env.mock = false;
    expect(await advanceJob("generation", randomUUID())).toEqual({
      done: true,
      waitMs: 0,
    });
    expect(mocks.generation).not.toHaveBeenCalled();
    expect(mocks.motion).not.toHaveBeenCalled();
  });

  it.each(["generation", "motion"] as const)(
    "advances only the requested %s job and waits for its active lease",
    async (kind) => {
      const jobId = await seedJob(kind, {
        leaseUntil: now + 30_000,
        nextPoll: now + 10_000,
      });
      expect(await advanceJob(kind, jobId)).toEqual({
        done: false,
        waitMs: 30_000,
      });
      const worker = kind === "generation" ? mocks.generation : mocks.motion;
      const other = kind === "generation" ? mocks.motion : mocks.generation;
      expect(worker).toHaveBeenCalledWith(
        expect.any(Object),
        undefined,
        expect.any(Function),
        jobId,
      );
      expect(other).not.toHaveBeenCalled();
    },
  );

  it.each(["ready", "failed", "uncertain"])(
    "stops advancing a %s job",
    async (status) => {
      const jobId = await seedJob("generation", { status });
      expect(await advanceJob("generation", jobId)).toEqual({
        done: true,
        waitMs: 0,
      });
    },
  );

  it("stops a workflow whose durable job was deleted", async () => {
    expect(await advanceJob("motion", randomUUID())).toEqual({
      done: true,
      waitMs: 0,
    });
  });
});
