import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, inArray, lt, lte, sql } from "drizzle-orm";
import { db, query, ready, transaction } from "./db";
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
import { defaults, GiftConfigSchema } from "../domain/config";
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
  claim(jobId?: string): Promise<Job | undefined>;
  patch(job: Job, changes: Partial<Job>): Promise<boolean>;
}
export const repository: GenerationRepository = {
  claim(jobId) {
    return transaction(async () => {
      const now = Date.now();
      const [found] = await db
        .select()
        .from(jobs)
        .where(
          and(
            inArray(jobs.status, activeStatuses),
            lte(jobs.nextPoll, now),
            lt(jobs.leaseUntil, now),
            jobId === undefined ? undefined : eq(jobs.id, jobId),
          ),
        )
        .orderBy(asc(jobs.createdAt))
        .limit(1);
      if (!found) return;
      const leaseToken = token(),
        leaseUntil = now + 120_000;
      await db
        .update(jobs)
        .set({ leaseToken, leaseUntil })
        .where(eq(jobs.id, found.id));
      return { ...found, leaseToken, leaseUntil };
    });
  },
  patch(job, changes) {
    return transaction(async () => {
      const changed = await db
        .update(jobs)
        .set({ ...changes, updatedAt: Date.now() })
        .where(
          and(eq(jobs.id, job.id), eq(jobs.leaseToken, job.leaseToken || "")),
        )
        .returning({ id: jobs.id });
      return changed.length === 1;
    });
  },
};
export function newProject(owner: string): Promise<Project> {
  return transaction(async () => {
    const now = Date.now();
    const [project] = await db
      .insert(projects)
      .values({
        id: randomUUID(),
        owner,
        config: JSON.stringify(defaults),
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    return project;
  });
}

// Both generation kinds share the transaction helper's advisory lock, so the
// count and reservation are atomic even for different projects and owners.
async function checkQuota(owner: string) {
  const [usage] = await query<{ ownerCount: number; total: number }>(sql`
    SELECT COUNT(*) FILTER (WHERE owner = ${owner})::integer AS "ownerCount",
           COUNT(*)::integer AS total FROM generation_usage
  `);
  if (usage.ownerCount >= env.quota || usage.total >= env.quota)
    throw new HttpError(
      429,
      "The configured generation quota has been reached.",
    );
}
async function reserveGeneration(id: string, owner: string, createdAt: number) {
  await query(
    sql`INSERT INTO generation_usage (id, owner, "createdAt") VALUES (${id}, ${owner}, ${createdAt})`,
  );
}
export function requestGeneration(
  p: Project,
  key: string,
  explicitRetry = false,
): Promise<Job> {
  return transaction(async () => {
    p = await currentProject(p);
    await assertNoActiveMotion(p.id);
    const [existing] = await db
      .select()
      .from(jobs)
      .where(eq(jobs.idempotencyKey, `${p.id}:${key}`))
      .limit(1);
    if (existing) return existing;
    const [current] = await db
      .select()
      .from(jobs)
      .where(and(eq(jobs.projectId, p.id), eq(jobs.inputRevision, p.revision)))
      .orderBy(desc(jobs.createdAt))
      .limit(1);
    if (current && activeStatuses.includes(current.status)) return current;
    if (current && !explicitRetry)
      throw new HttpError(
        409,
        "This drawing already has an attempt. Review it or explicitly request another paid attempt.",
      );
    if (!p.inputAsset) throw new HttpError(400, "Choose a drawing first.");
    await checkQuota(p.owner);
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
    await db.insert(jobs).values(job);
    await reserveGeneration(job.id, p.owner, now);
    await db
      .update(projects)
      .set({
        approved: 0,
        modelAsset: null,
        source: env.mock ? "mock" : "tripo",
      })
      .where(eq(projects.id, p.id));
    return job;
  });
}
export async function originalAsset(p: Project): Promise<string | null> {
  if (!p.inputAsset) return null;
  await ready();
  const [a] = await db
    .select()
    .from(assets)
    .where(eq(assets.id, p.inputAsset))
    .limit(1);
  return a ? JSON.parse(a.metadata).originalId || p.inputAsset : null;
}
export function publish(p: Project) {
  return transaction(async () => {
    // Approval, content and version are read under the same mutation lock.
    p = await currentProject(p);
    if (!p.approved)
      throw new HttpError(409, "Approve your character before publishing.");
    const config = GiftConfigSchema.parse(JSON.parse(p.config));
    const [last] = await db
      .select()
      .from(gifts)
      .where(eq(gifts.projectId, p.id))
      .orderBy(desc(gifts.version))
      .limit(1);
    const snapshot = {
      config,
      modelAsset: p.modelAsset,
      drawingAsset: config.showDrawing ? await originalAsset(p) : null,
      source: p.source,
      version: (last?.version || 0) + 1,
    };
    const gift = {
      id: randomUUID(),
      projectId: p.id,
      token: token(),
      snapshot: JSON.stringify(snapshot),
      version: snapshot.version,
      revoked: 0,
      createdAt: Date.now(),
    };
    await db.insert(gifts).values(gift);
    return gift;
  });
}
export function projectView(p: Project) {
  return transaction(async () => {
    // Read the project and its jobs under the workers' commit lock so a ready
    // job cannot be paired with the caller's pre-completion model or approval.
    p = await currentProject(p);
    const [motion] = await db
      .select()
      .from(motionJobs)
      .where(eq(motionJobs.projectId, p.id))
      .orderBy(desc(motionJobs.createdAt))
      .limit(1);
    const [job] = await db
      .select()
      .from(jobs)
      .where(eq(jobs.projectId, p.id))
      .orderBy(desc(jobs.createdAt))
      .limit(1);
    const drawing = await originalAsset(p);
    const shares = await db
      .select({
        id: gifts.id,
        token: gifts.token,
        version: gifts.version,
        revoked: gifts.revoked,
      })
      .from(gifts)
      .where(eq(gifts.projectId, p.id));
    return {
      ...p,
      owner: undefined,
      config: GiftConfigSchema.parse(JSON.parse(p.config)),
      job: job
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
        : null,
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
      drawingUrl: drawing ? `/api/assets/${drawing}` : null,
      modelUrl: p.modelAsset ? `/api/assets/${p.modelAsset}` : null,
      shares,
    };
  });
}

async function currentProject(p: Project): Promise<Project> {
  const [current] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, p.id), eq(projects.owner, p.owner)))
    .limit(1);
  if (!current) throw new HttpError(404, "Draft not found.");
  return current;
}
export async function assertNoActiveMotion(projectId: string) {
  await ready();
  const [running] = await db
    .select({ id: motionJobs.id })
    .from(motionJobs)
    .where(
      and(
        eq(motionJobs.projectId, projectId),
        inArray(motionJobs.status, activeStatuses),
      ),
    )
    .limit(1);
  if (running)
    throw new HttpError(
      409,
      "Let the hero's movement finish before replacing or deleting it.",
    );
}
export function requestMotion(
  p: Project,
  key: string,
  explicitRetry = false,
): Promise<MotionJob> {
  return transaction(async () => {
    p = await currentProject(p);
    const [existing] = await db
      .select()
      .from(motionJobs)
      .where(eq(motionJobs.idempotencyKey, `${p.id}:${key}`))
      .limit(1);
    if (existing) return existing;
    const [active] = await db
      .select()
      .from(motionJobs)
      .where(
        and(
          eq(motionJobs.projectId, p.id),
          inArray(motionJobs.status, activeStatuses),
        ),
      )
      .limit(1);
    if (active) return active;
    const [generating] = await db
      .select({ id: jobs.id })
      .from(jobs)
      .where(
        and(eq(jobs.projectId, p.id), inArray(jobs.status, activeStatuses)),
      )
      .limit(1);
    if (generating)
      throw new HttpError(409, "Let generation finish before adding movement.");
    if (!p.modelAsset || !["tripo", "mock"].includes(p.source))
      throw new HttpError(
        409,
        "Generate a custom hero before adding movement.",
      );
    const [model] = await db
      .select()
      .from(assets)
      .where(
        and(
          eq(assets.id, p.modelAsset),
          eq(assets.projectId, p.id),
          eq(assets.kind, "model"),
        ),
      )
      .limit(1);
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
    const previous = (
      await db
        .select()
        .from(motionJobs)
        .where(eq(motionJobs.projectId, p.id))
        .orderBy(desc(motionJobs.createdAt))
    ).find(
      (job) =>
        job.inputAsset === p.modelAsset || job.finalAsset === p.modelAsset,
    );
    if (previous && !explicitRetry)
      throw new HttpError(
        409,
        "This hero already has a movement attempt. Review it or explicitly request another paid attempt.",
      );
    await checkQuota(p.owner);
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
    await db.insert(motionJobs).values(job);
    await reserveGeneration(job.id, p.owner, now);
    return job;
  });
}
export interface MotionRepository {
  claim(jobId?: string): Promise<MotionJob | undefined>;
  patch(job: MotionJob, changes: Partial<MotionJob>): Promise<boolean>;
}
export const motionRepository: MotionRepository = {
  claim(jobId) {
    return transaction(async () => {
      const now = Date.now();
      const [found] = await db
        .select()
        .from(motionJobs)
        .where(
          and(
            inArray(motionJobs.status, activeStatuses),
            lte(motionJobs.nextPoll, now),
            lt(motionJobs.leaseUntil, now),
            jobId === undefined ? undefined : eq(motionJobs.id, jobId),
          ),
        )
        .orderBy(asc(motionJobs.createdAt))
        .limit(1);
      if (!found) return;
      const leaseToken = token(),
        leaseUntil = now + 120_000;
      await db
        .update(motionJobs)
        .set({ leaseToken, leaseUntil })
        .where(eq(motionJobs.id, found.id));
      return { ...found, leaseToken, leaseUntil };
    });
  },
  patch(job, changes) {
    return transaction(async () => {
      const changed = await db
        .update(motionJobs)
        .set({ ...changes, updatedAt: Date.now() })
        .where(
          and(
            eq(motionJobs.id, job.id),
            eq(motionJobs.leaseToken, job.leaseToken || ""),
          ),
        )
        .returning({ id: motionJobs.id });
      return changed.length === 1;
    });
  },
};
