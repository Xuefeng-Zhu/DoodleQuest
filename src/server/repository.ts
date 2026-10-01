import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db, sqlite } from "./db";
import {
  jobs,
  projects,
  gifts,
  assets,
  type Job,
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
