import {
  pgTable,
  text,
  integer,
  bigint,
  customType,
  primaryKey,
} from "drizzle-orm/pg-core";
const timestamp = () => bigint({ mode: "number" });
const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => "bytea",
  toDriver: (value) => value,
  fromDriver: (value) => Buffer.from(value),
});
export const sessions = pgTable("sessions", {
  id: text().primaryKey(),
  createdAt: timestamp().notNull(),
  expiresAt: timestamp().notNull(),
  unlocked: integer().notNull().default(0),
});
export const projects = pgTable("projects", {
  id: text().primaryKey(),
  owner: text()
    .notNull()
    .references(() => sessions.id),
  config: text().notNull(),
  inputAsset: text(),
  revision: integer().notNull().default(0),
  modelAsset: text(),
  source: text().notNull().default("procedural"),
  approved: integer().notNull().default(0),
  createdAt: timestamp().notNull(),
  updatedAt: timestamp().notNull(),
});
export const assets = pgTable("assets", {
  id: text().primaryKey(),
  projectId: text()
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  kind: text().notNull(),
  filename: text().notNull(),
  bytes: integer().notNull(),
  metadata: text().notNull(),
  createdAt: timestamp().notNull(),
});
export const jobs = pgTable("jobs", {
  id: text().primaryKey(),
  projectId: text()
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  owner: text().notNull(),
  inputAsset: text().notNull(),
  inputRevision: integer().notNull(),
  idempotencyKey: text().notNull().unique(),
  providerId: text(),
  providerStatus: text(),
  uploadToken: text(),
  status: text().notNull(),
  progress: integer(),
  attempts: integer().notNull().default(0),
  nextPoll: timestamp().notNull(),
  leaseUntil: timestamp().notNull().default(0),
  leaseToken: text(),
  lastError: text(),
  finalAsset: text(),
  model: text().notNull(),
  createdAt: timestamp().notNull(),
  updatedAt: timestamp().notNull(),
});
export const gifts = pgTable("gifts", {
  id: text().primaryKey(),
  projectId: text()
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  token: text().notNull().unique(),
  snapshot: text().notNull(),
  version: integer().notNull(),
  revoked: integer().notNull().default(0),
  createdAt: timestamp().notNull(),
});
export const motionJobs = pgTable("motion_jobs", {
  id: text().primaryKey(),
  projectId: text()
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  owner: text().notNull(),
  inputAsset: text().notNull(),
  inputRevision: integer().notNull(),
  inputSource: text().notNull(),
  generationTask: text().notNull(),
  idempotencyKey: text().notNull().unique(),
  stage: text().notNull(),
  checkTask: text(),
  rigTask: text(),
  retargetTask: text(),
  rigType: text(),
  providerStatus: text(),
  status: text().notNull(),
  progress: integer(),
  attempts: integer().notNull().default(0),
  nextPoll: timestamp().notNull(),
  leaseUntil: timestamp().notNull().default(0),
  leaseToken: text(),
  lastError: text(),
  finalAsset: text(),
  createdAt: timestamp().notNull(),
  updatedAt: timestamp().notNull(),
});
export const assetBlobs = pgTable("asset_blobs", {
  filename: text().primaryKey(),
  data: bytea().notNull(),
  bytes: integer().notNull(),
  createdAt: timestamp().notNull(),
});
export const rateLimits = pgTable("rate_limits", {
  key: text().primaryKey(),
  count: integer().notNull(),
  untilAt: timestamp().notNull(),
});
export const generationUsage = pgTable("generation_usage", {
  id: text().primaryKey(),
  owner: text().notNull(),
  createdAt: timestamp().notNull(),
});
export const storageGc = pgTable("storage_gc", {
  filename: text().primaryKey(),
});
export const workflowDispatch = pgTable(
  "workflow_dispatch",
  {
    kind: text().notNull(),
    jobId: text("job_id").notNull(),
    runId: text("run_id"),
    dispatchUntil: bigint("dispatch_until", { mode: "number" }).notNull(),
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.kind, table.jobId] })],
);
export type Project = typeof projects.$inferSelect;
export type Job = typeof jobs.$inferSelect;
export type MotionJob = typeof motionJobs.$inferSelect;
