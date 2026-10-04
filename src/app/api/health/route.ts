import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db, ready } from "@/server/db";
import { env } from "@/server/env";
import { runtimeHealth } from "@/server/health";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  let database = false;
  try {
    await ready();
    await db.execute(sql`SELECT 1`);
    database = true;
  } catch {}
  // Vercel executes durable jobs through Workflow; it has no local worker
  // heartbeat or persistent filesystem to probe. Asset bytes live in Postgres.
  const health =
    process.env.VERCEL || !process.env.DQ_RUNTIME_ID
      ? {
          ready: database,
          database,
          execution: process.env.VERCEL ? "vercel-workflow" : "local-workflow",
        }
      : runtimeHealth({
          dataDirectory: env.data,
          runtimeId: process.env.DQ_RUNTIME_ID,
          storageVerified: process.env.DQ_STORAGE_VERIFIED === "1",
          databaseCheck: () => {
            if (!database) throw new Error("Database is not ready.");
            return true;
          },
        });
  return NextResponse.json(health, {
    status: health.ready ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}
