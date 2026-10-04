// Postgres initialization does not import the private local SQLite database.
export const postgresMigrations = `
CREATE TABLE IF NOT EXISTS schema_migrations(version integer PRIMARY KEY, "appliedAt" bigint NOT NULL);
CREATE TABLE IF NOT EXISTS sessions(id text PRIMARY KEY, "createdAt" bigint NOT NULL, "expiresAt" bigint NOT NULL, unlocked integer NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS projects(id text PRIMARY KEY, owner text NOT NULL REFERENCES sessions(id), config text NOT NULL, "inputAsset" text, revision integer NOT NULL DEFAULT 0, "modelAsset" text, source text NOT NULL DEFAULT 'procedural', approved integer NOT NULL DEFAULT 0, "createdAt" bigint NOT NULL, "updatedAt" bigint NOT NULL);
CREATE TABLE IF NOT EXISTS asset_blobs(filename text PRIMARY KEY, data bytea NOT NULL, bytes integer NOT NULL CHECK(bytes >= 0 AND bytes = octet_length(data)), "createdAt" bigint NOT NULL);
CREATE TABLE IF NOT EXISTS assets(id text PRIMARY KEY, "projectId" text NOT NULL REFERENCES projects(id) ON DELETE CASCADE, kind text NOT NULL, filename text NOT NULL, bytes integer NOT NULL, metadata text NOT NULL, "createdAt" bigint NOT NULL);
CREATE TABLE IF NOT EXISTS jobs(id text PRIMARY KEY, "projectId" text NOT NULL REFERENCES projects(id) ON DELETE CASCADE, owner text NOT NULL, "inputAsset" text NOT NULL, "inputRevision" integer NOT NULL, "idempotencyKey" text NOT NULL UNIQUE, "providerId" text, "providerStatus" text, "uploadToken" text, status text NOT NULL, progress integer, attempts integer NOT NULL DEFAULT 0, "nextPoll" bigint NOT NULL, "leaseUntil" bigint NOT NULL DEFAULT 0, "leaseToken" text, "lastError" text, "finalAsset" text, model text NOT NULL, "createdAt" bigint NOT NULL, "updatedAt" bigint NOT NULL);
CREATE TABLE IF NOT EXISTS gifts(id text PRIMARY KEY, "projectId" text NOT NULL REFERENCES projects(id) ON DELETE CASCADE, token text NOT NULL UNIQUE, snapshot text NOT NULL, version integer NOT NULL, revoked integer NOT NULL DEFAULT 0, "createdAt" bigint NOT NULL);
CREATE TABLE IF NOT EXISTS rate_limits(key text PRIMARY KEY, count integer NOT NULL, "untilAt" bigint NOT NULL);
CREATE TABLE IF NOT EXISTS generation_usage(id text PRIMARY KEY, owner text NOT NULL, "createdAt" bigint NOT NULL);
CREATE TABLE IF NOT EXISTS storage_gc(filename text PRIMARY KEY);
CREATE TABLE IF NOT EXISTS motion_jobs(id text PRIMARY KEY, "projectId" text NOT NULL REFERENCES projects(id) ON DELETE CASCADE, owner text NOT NULL, "inputAsset" text NOT NULL, "inputRevision" integer NOT NULL, "inputSource" text NOT NULL, "generationTask" text NOT NULL, "idempotencyKey" text NOT NULL UNIQUE, stage text NOT NULL, "checkTask" text, "rigTask" text, "retargetTask" text, "rigType" text, "providerStatus" text, status text NOT NULL, progress integer, attempts integer NOT NULL DEFAULT 0, "nextPoll" bigint NOT NULL, "leaseUntil" bigint NOT NULL DEFAULT 0, "leaseToken" text, "lastError" text, "finalAsset" text, "createdAt" bigint NOT NULL, "updatedAt" bigint NOT NULL);
CREATE TABLE IF NOT EXISTS workflow_dispatch(kind text NOT NULL, job_id text NOT NULL, run_id text, dispatch_until bigint NOT NULL, created_at bigint NOT NULL, PRIMARY KEY(kind,job_id));
CREATE INDEX IF NOT EXISTS jobs_due ON jobs(status,"nextPoll","leaseUntil");
CREATE INDEX IF NOT EXISTS projects_owner ON projects(owner);
CREATE INDEX IF NOT EXISTS assets_project ON assets("projectId");
CREATE INDEX IF NOT EXISTS motion_jobs_due ON motion_jobs(status,"nextPoll","leaseUntil");
INSERT INTO schema_migrations(version,"appliedAt") VALUES(1, (extract(epoch FROM clock_timestamp()) * 1000)::bigint) ON CONFLICT(version) DO NOTHING;
`;
