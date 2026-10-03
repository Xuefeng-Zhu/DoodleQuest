import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db, sqlite } from "./db";
import {
  jobs,
  projects,
  gifts,
  assets,
  motionJobs,
  type Job,
  type MotionJob,
  type Project,
} from "./schema";
import { env } from "./env";
import { defaults, GiftConfigSchema, type GiftConfig } from "../domain/config";
import { HttpError, token } from "./security";
export const activeStatuses = [
  "pending",
  "uploading",
  "submitting",
  "queued",
  "generating",
  "polling",
  "downloading",
  "asset_retry",
];
export interface GenerationRepository {
  claim(): Job | undefined;
  patch(job: Job, changes: Partial<Job>): boolean;
}
export const repository: GenerationRepository = {
  claim() {
    return sqlite
      .transaction(() => {
        const now = Date.now();
        const found = sqlite
          .prepare(
            `SELECT * FROM jobs WHERE status IN (${activeStatuses.map(() => "?").join(",")}) AND nextPoll<=? AND leaseUntil<? ORDER BY createdAt LIMIT 1`,
          )
          .get(...activeStatuses, now, now) as Job | undefined;
        if (!found) return;
        const leaseToken = token();
        db.update(jobs)
          .set({ leaseToken, leaseUntil: now + 120_000 })
          .where(eq(jobs.id, found.id))
          .run();
        return { ...found, leaseToken, leaseUntil: now + 120_000 };
      })
      .immediate();
  },
  patch(job, changes) {
    return (
      db
        .update(jobs)
        .set({ ...changes, updatedAt: Date.now() })
        .where(
          and(eq(jobs.id, job.id), eq(jobs.leaseToken, job.leaseToken || "")),
        )
        .run().changes === 1
    );
  },
};
export function newProject(owner: string) {
  const now = Date.now(),
    id = randomUUID();
  db.insert(projects)
    .values({
      id,
      owner,
      config: JSON.stringify(defaults),
      createdAt: now,
      updatedAt: now,
    })
    .run();
  return db.select().from(projects).where(eq(projects.id, id)).get()!;
}
export function requestGeneration(
  p: Project,
  key: string,
  explicitRetry = false,
) {
  return sqlite
    .transaction(() => {
      p = currentProject(p);
      assertNoActiveMotion(p.id);
      const existing = db
        .select()
        .from(jobs)
        .where(eq(jobs.idempotencyKey, `${p.id}:${key}`))
        .get();
      if (existing) return existing;
      const current = db
        .select()
        .from(jobs)
        .where(
          and(eq(jobs.projectId, p.id), eq(jobs.inputRevision, p.revision)),
        )
        .orderBy(desc(jobs.createdAt))
        .get();
      if (current && activeStatuses.includes(current.status)) return current;
      if (current && !explicitRetry)
        throw new HttpError(
          409,
          "This drawing already has an attempt. Review it or explicitly request another paid attempt.",
        );
      if (!p.inputAsset) throw new HttpError(400, "Choose a drawing first.");
      const count = (
        sqlite
          .prepare("SELECT COUNT(*) AS n FROM generation_usage WHERE owner=?")
          .get(p.owner) as { n: number }
      ).n;
      const global = (
        sqlite.prepare("SELECT COUNT(*) AS n FROM generation_usage").get() as {
          n: number;
        }
      ).n;
      if (count >= env.quota || global >= env.quota)
        throw new HttpError(
          429,
          "The configured generation quota has been reached.",
        );
      const now = Date.now();
      const job: Job = {
        id: randomUUID(),
        projectId: p.id,
        owner: p.owner,
        inputAsset: p.inputAsset,
        inputRevision: p.revision,
        idempotencyKey: `${p.id}:${key}`,
        providerId: null,
        providerStatus: null,
        uploadToken: null,
        status: "pending",
        progress: null,
        attempts: 0,
        nextPoll: now,
        leaseUntil: 0,
        leaseToken: null,
        lastError: null,
        finalAsset: null,
        model: env.model,
        createdAt: now,
        updatedAt: now,
      };
      db.insert(jobs).values(job).run();
      sqlite
        .prepare("INSERT INTO generation_usage VALUES(?,?,?)")
        .run(job.id, p.owner, now);
      db.update(projects)
        .set({
          approved: 0,
          modelAsset: null,
          source: env.mock ? "mock" : "tripo",
        })
        .where(eq(projects.id, p.id))
        .run();
      return job;
    })
    .immediate();
}
export function originalAsset(p: Project) {
  if (!p.inputAsset) return null;
  const a = db.select().from(assets).where(eq(assets.id, p.inputAsset)).get();
  return a ? JSON.parse(a.metadata).originalId || p.inputAsset : null;
}
export function publish(p: Project) {
  if (!p.approved)
    throw new HttpError(409, "Approve your character before publishing.");
  const config = GiftConfigSchema.parse(JSON.parse(p.config));
  return sqlite
    .transaction(() => {
      const last = db
        .select()
        .from(gifts)
        .where(eq(gifts.projectId, p.id))
        .orderBy(desc(gifts.version))
        .get();
      const snapshot = {
        config,
        modelAsset: p.modelAsset,
        drawingAsset: config.showDrawing ? originalAsset(p) : null,
        source: p.source,
        version: (last?.version || 0) + 1,
      };
      const g = {
        id: randomUUID(),
        projectId: p.id,
        token: token(),
        snapshot: JSON.stringify(snapshot),
        version: snapshot.version,
        revoked: 0,
        createdAt: Date.now(),
      };
      db.insert(gifts).values(g).run();
      return g;
    })
    .immediate();
}
export function projectView(p: Project) {
  const motion = db
    .select()
    .from(motionJobs)
    .where(eq(motionJobs.projectId, p.id))
    .orderBy(desc(motionJobs.createdAt))
    .get();
  const job = db
    .select()
    .from(jobs)
    .where(eq(jobs.projectId, p.id))
    .orderBy(desc(jobs.createdAt))
    .get();
  const publicJob = job
    ? {
        id: job.id,
        status: job.status,
        providerStatus: job.providerStatus,
        providerId: job.providerId,
        progress: job.progress,
        lastError: job.lastError,
        createdAt: job.createdAt,
        attempts: job.attempts,
        inputRevision: job.inputRevision,
        finalAsset: job.finalAsset,
        model: job.model,
      }
    : null;
  return {
    ...p,
    owner: undefined,
    config: GiftConfigSchema.parse(JSON.parse(p.config)),
    job: publicJob,
    motionJob: motion
      ? {
          id: motion.id,
          status: motion.status,
          stage: motion.stage,
          progress: motion.progress,
          lastError: motion.lastError,
          inputAsset: motion.inputAsset,
          inputRevision: motion.inputRevision,
          finalAsset: motion.finalAsset,
          rigType: motion.rigType,
          createdAt: motion.createdAt,
          attempts: motion.attempts,
        }
      : null,
    drawingUrl: originalAsset(p) ? `/api/assets/${originalAsset(p)}` : null,
    modelUrl: p.modelAsset ? `/api/assets/${p.modelAsset}` : null,
    shares: db
      .select({
        id: gifts.id,
        token: gifts.token,
        version: gifts.version,
        revoked: gifts.revoked,
      })
      .from(gifts)
      .where(eq(gifts.projectId, p.id))
      .all(),
  };
}

function currentProject(p: Project) {
  const current = db
    .select()
    .from(projects)
    .where(and(eq(projects.id, p.id), eq(projects.owner, p.owner)))
    .get();
  if (!current) throw new HttpError(404, "Draft not found.");
  return current;
}

export function assertNoActiveMotion(projectId: string) {
  const running = db
    .select({ id: motionJobs.id })
    .from(motionJobs)
    .where(
      and(
        eq(motionJobs.projectId, projectId),
        inArray(motionJobs.status, activeStatuses),
      ),
    )
    .get();
  if (running)
    throw new HttpError(
      409,
      "Let the hero's movement finish before replacing or deleting it.",
    );
}

export function requestMotion(p: Project, key: string, explicitRetry = false) {
  return sqlite
    .transaction(() => {
      p = currentProject(p);
      const existing = db
        .select()
        .from(motionJobs)
        .where(eq(motionJobs.idempotencyKey, `${p.id}:${key}`))
        .get();
      if (existing) return existing;
      const active = db
        .select()
        .from(motionJobs)
        .where(
          and(
            eq(motionJobs.projectId, p.id),
            inArray(motionJobs.status, activeStatuses),
          ),
        )
        .get();
      if (active) return active;
      const generating = db
        .select({ id: jobs.id })
        .from(jobs)
        .where(
          and(eq(jobs.projectId, p.id), inArray(jobs.status, activeStatuses)),
        )
        .get();
      if (generating)
        throw new HttpError(
          409,
          "Let generation finish before adding movement.",
        );
      if (!p.modelAsset || !["tripo", "mock"].includes(p.source))
        throw new HttpError(
          409,
          "Generate a custom hero before adding movement.",
        );
      const model = db
        .select()
        .from(assets)
        .where(
          and(
            eq(assets.id, p.modelAsset),
            eq(assets.projectId, p.id),
            eq(assets.kind, "model"),
          ),
        )
        .get();
      const metadata = model ? JSON.parse(model.metadata) : {};
      const generationTask = metadata.generationTask || metadata.providerTask;
      if (
        typeof generationTask !== "string" ||
        !generationTask ||
        metadata.source !== p.source
      )
        throw new HttpError(
          409,
          "This hero's original generation is unavailable for animation.",
        );
      const previous = db
        .select()
        .from(motionJobs)
        .where(eq(motionJobs.projectId, p.id))
        .orderBy(desc(motionJobs.createdAt))
        .all()
        .find(
          (j) => j.inputAsset === p.modelAsset || j.finalAsset === p.modelAsset,
        );
      if (previous && !explicitRetry)
        throw new HttpError(
          409,
          "This hero already has a movement attempt. Review it or explicitly request another paid attempt.",
        );
      const count = (
        sqlite
          .prepare("SELECT COUNT(*) AS n FROM generation_usage WHERE owner=?")
          .get(p.owner) as { n: number }
      ).n;
      const global = (
        sqlite.prepare("SELECT COUNT(*) AS n FROM generation_usage").get() as {
          n: number;
        }
      ).n;
      if (count >= env.quota || global >= env.quota)
        throw new HttpError(
          429,
          "The configured generation quota has been reached.",
        );
      const now = Date.now();
      const resume =
        previous &&
        previous.inputAsset === p.modelAsset &&
        ["failed", "uncertain"].includes(previous.status)
          ? previous
          : null;
      const job: MotionJob = {
        id: randomUUID(),
        projectId: p.id,
        owner: p.owner,
        inputAsset: p.modelAsset,
        inputRevision: p.revision,
        inputSource: p.source,
        generationTask,
        idempotencyKey: `${p.id}:${key}`,
        stage: resume?.stage || "rig_check",
        checkTask:
          resume && resume.stage !== "rig_check" ? resume.checkTask : null,
        rigTask: resume?.stage === "retarget" ? resume.rigTask : null,
        retargetTask: null,
        rigType: resume?.rigType || null,
        providerStatus: null,
        status: "pending",
        progress: null,
        attempts: 0,
        nextPoll: now,
        leaseUntil: 0,
        leaseToken: null,
        lastError: null,
        finalAsset: null,
        createdAt: now,
        updatedAt: now,
      };
      db.insert(motionJobs).values(job).run();
      sqlite
        .prepare("INSERT INTO generation_usage VALUES(?,?,?)")
        .run(job.id, p.owner, now);
      return job;
    })
    .immediate();
}

export interface MotionRepository {
  claim(): MotionJob | undefined;
  patch(job: MotionJob, changes: Partial<MotionJob>): boolean;
}
export const motionRepository: MotionRepository = {
  claim() {
    return sqlite
      .transaction(() => {
        const now = Date.now();
        const found = sqlite
          .prepare(
            `SELECT * FROM motion_jobs WHERE status IN (${activeStatuses.map(() => "?").join(",")}) AND nextPoll<=? AND leaseUntil<? ORDER BY createdAt LIMIT 1`,
          )
          .get(...activeStatuses, now, now) as MotionJob | undefined;
        if (!found) return;
        const leaseToken = token(),
          leaseUntil = now + 120_000;
        db.update(motionJobs)
          .set({ leaseToken, leaseUntil })
          .where(eq(motionJobs.id, found.id))
          .run();
        return { ...found, leaseToken, leaseUntil };
      })
      .immediate();
  },
  patch(job, changes) {
    return (
      db
        .update(motionJobs)
        .set({ ...changes, updatedAt: Date.now() })
        .where(
          and(
            eq(motionJobs.id, job.id),
            eq(motionJobs.leaseToken, job.leaseToken || ""),
          ),
        )
        .run().changes === 1
    );
  },
};
