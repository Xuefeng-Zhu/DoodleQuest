import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
export const sessions = sqliteTable("sessions", {
  id: text().primaryKey(),
  createdAt: integer().notNull(),
  expiresAt: integer().notNull(),
  unlocked: integer().notNull().default(0),
});
export const projects = sqliteTable("projects", {
  id: text().primaryKey(),
  owner: text().notNull(),
  config: text().notNull(),
  inputAsset: text(),
  revision: integer().notNull().default(0),
  modelAsset: text(),
  source: text().notNull().default("procedural"),
  approved: integer().notNull().default(0),
  createdAt: integer().notNull(),
  updatedAt: integer().notNull(),
});
export const assets = sqliteTable("assets", {
  id: text().primaryKey(),
  projectId: text().notNull(),
  kind: text().notNull(),
  filename: text().notNull(),
  bytes: integer().notNull(),
  metadata: text().notNull(),
  createdAt: integer().notNull(),
});
export const jobs = sqliteTable("jobs", {
  id: text().primaryKey(),
  projectId: text().notNull(),
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
  nextPoll: integer().notNull(),
  leaseUntil: integer().notNull().default(0),
  leaseToken: text(),
  lastError: text(),
  finalAsset: text(),
  model: text().notNull(),
  createdAt: integer().notNull(),
  updatedAt: integer().notNull(),
});
export const gifts = sqliteTable("gifts", {
  id: text().primaryKey(),
  projectId: text().notNull(),
  token: text().notNull().unique(),
  snapshot: text().notNull(),
  version: integer().notNull(),
  revoked: integer().notNull().default(0),
  createdAt: integer().notNull(),
});
export type Project = typeof projects.$inferSelect;
export type Job = typeof jobs.$inferSelect;
