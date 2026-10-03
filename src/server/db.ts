import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { env } from "./env";
import * as schema from "./schema";
mkdirSync(env.data, { recursive: true });
export const sqlite = new Database(path.join(env.data, "doodlequest.sqlite"));
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("busy_timeout = 5000");
sqlite.pragma("foreign_keys = ON");
export const db = drizzle(sqlite, { schema });
export function migrate() {
  sqlite.exec(`
 CREATE TABLE IF NOT EXISTS schema_migrations(version INTEGER PRIMARY KEY, appliedAt INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS sessions(id TEXT PRIMARY KEY, createdAt INTEGER NOT NULL, expiresAt INTEGER NOT NULL, unlocked INTEGER NOT NULL DEFAULT 0);
 CREATE TABLE IF NOT EXISTS projects(id TEXT PRIMARY KEY, owner TEXT NOT NULL REFERENCES sessions(id), config TEXT NOT NULL, inputAsset TEXT, revision INTEGER NOT NULL DEFAULT 0, modelAsset TEXT, source TEXT NOT NULL DEFAULT 'procedural', approved INTEGER NOT NULL DEFAULT 0, createdAt INTEGER NOT NULL, updatedAt INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS assets(id TEXT PRIMARY KEY, projectId TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE, kind TEXT NOT NULL, filename TEXT NOT NULL, bytes INTEGER NOT NULL, metadata TEXT NOT NULL, createdAt INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY, projectId TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE, owner TEXT NOT NULL, inputAsset TEXT NOT NULL, inputRevision INTEGER NOT NULL, idempotencyKey TEXT NOT NULL UNIQUE, providerId TEXT, providerStatus TEXT, uploadToken TEXT, status TEXT NOT NULL, progress INTEGER, attempts INTEGER NOT NULL DEFAULT 0, nextPoll INTEGER NOT NULL, leaseUntil INTEGER NOT NULL DEFAULT 0, leaseToken TEXT, lastError TEXT, finalAsset TEXT, model TEXT NOT NULL, createdAt INTEGER NOT NULL, updatedAt INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS gifts(id TEXT PRIMARY KEY, projectId TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE, token TEXT NOT NULL UNIQUE, snapshot TEXT NOT NULL, version INTEGER NOT NULL, revoked INTEGER NOT NULL DEFAULT 0, createdAt INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS rate_limits(key TEXT PRIMARY KEY, count INTEGER NOT NULL, untilAt INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS generation_usage(id TEXT PRIMARY KEY, owner TEXT NOT NULL, createdAt INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS storage_gc(filename TEXT PRIMARY KEY);
 CREATE INDEX IF NOT EXISTS jobs_due ON jobs(status,nextPoll,leaseUntil);
 CREATE INDEX IF NOT EXISTS projects_owner ON projects(owner);
 CREATE TABLE IF NOT EXISTS motion_jobs(id TEXT PRIMARY KEY, projectId TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE, owner TEXT NOT NULL, inputAsset TEXT NOT NULL, inputRevision INTEGER NOT NULL, inputSource TEXT NOT NULL, generationTask TEXT NOT NULL, idempotencyKey TEXT NOT NULL UNIQUE, stage TEXT NOT NULL, checkTask TEXT, rigTask TEXT, retargetTask TEXT, rigType TEXT, providerStatus TEXT, status TEXT NOT NULL, progress INTEGER, attempts INTEGER NOT NULL DEFAULT 0, nextPoll INTEGER NOT NULL, leaseUntil INTEGER NOT NULL DEFAULT 0, leaseToken TEXT, lastError TEXT, finalAsset TEXT, createdAt INTEGER NOT NULL, updatedAt INTEGER NOT NULL);
 CREATE INDEX IF NOT EXISTS motion_jobs_due ON motion_jobs(status,nextPoll,leaseUntil);
 INSERT OR IGNORE INTO schema_migrations VALUES(1,${Date.now()});
 INSERT OR IGNORE INTO schema_migrations VALUES(2,${Date.now()});
 `);
}
migrate();
