import { NextResponse } from "next/server";
import Database from "better-sqlite3";
import path from "node:path";
import { env } from "@/server/env";
import { runtimeHealth } from "@/server/health";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  const health = runtimeHealth({
    dataDirectory: env.data,
    runtimeId: process.env.DQ_RUNTIME_ID,
    storageVerified: process.env.DQ_STORAGE_VERIFIED === "1",
    databaseCheck: () => {
      // Health checks never initialize or migrate a missing database.
      const sqlite = new Database(path.join(env.data, "doodlequest.sqlite"), {
        readonly: true,
        fileMustExist: true,
      });
      try {
        const migration = sqlite
          .prepare("SELECT version FROM schema_migrations LIMIT 1")
          .get();
        if (!migration) throw new Error("Database migrations are not ready.");
        return migration;
      } finally {
        sqlite.close();
      }
    },
  });
  return NextResponse.json(health, {
    status: health.ready ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}
