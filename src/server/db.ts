import { AsyncLocalStorage } from "node:async_hooks";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { sql, type SQL } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { env } from "./env";
import * as schema from "./schema";
import { postgresMigrations } from "./postgres-migrations";

export type Database = NodePgDatabase<typeof schema>;
type State = {
  database?: Database;
  initializing?: Promise<void>;
  close?: () => Promise<void>;
  transactions: AsyncLocalStorage<Database>;
};
// Next routes and Workflow steps can load separate copies of this module in
// one process. They must share one embedded database and transaction context.
const stateKey = Symbol.for("doodlequest.postgres.runtime");
const globals = globalThis as typeof globalThis & {
  [stateKey]?: Map<string, State>;
};
const states = (globals[stateKey] ??= new Map<string, State>());
const identity = env.databaseUrl || `pglite:${env.data}`;
const state =
  states.get(identity) ??
  ({
    transactions: new AsyncLocalStorage<Database>(),
  } as State);
states.set(identity, state);
const applicationLock = sql`SELECT pg_advisory_xact_lock(1845623091)`;

export function assertDatabaseConfiguration(configuration = env) {
  if (configuration.vercel && !configuration.databaseUrl)
    throw new Error(
      "DATABASE_URL is required on Vercel. Local storage is disabled.",
    );
}

export async function ready(): Promise<void> {
  if (!state.initializing) {
    state.initializing = (async () => {
      assertDatabaseConfiguration();
      if (env.databaseUrl) {
        const pool = new Pool({
          connectionString: env.databaseUrl,
          max: 3,
          idleTimeoutMillis: 10_000,
          connectionTimeoutMillis: 10_000,
          allowExitOnIdle: true,
        });
        pool.on("error", () =>
          console.error("Database idle connection interrupted."),
        );
        state.database = drizzle(pool, { schema });
        state.close = () => pool.end();
      } else {
        const [{ PGlite }, { drizzle: embeddedDrizzle }] = await Promise.all([
          import("@electric-sql/pglite"),
          import("drizzle-orm/pglite"),
        ]);
        await mkdir(env.data, { recursive: true });
        const client = new PGlite(path.join(env.data, "postgres"));
        await client.waitReady;
        state.database = embeddedDrizzle(client, {
          schema,
        }) as unknown as Database;
        state.close = () => client.close();
      }
      await state.database.transaction(async (tx) => {
        await tx.execute(applicationLock);
        for (const statement of postgresMigrations
          .split(";")
          .map((value) => value.trim())
          .filter(Boolean))
          await tx.execute(sql.raw(statement));
      });
    })().catch(async (error) => {
      await state.close?.().catch(() => {});
      state.database = undefined;
      state.close = undefined;
      state.initializing = undefined;
      throw error;
    });
  }
  await state.initializing;
}

export const db = new Proxy({} as Database, {
  get(_target, property) {
    const current = state.transactions.getStore() ?? state.database;
    if (!current)
      throw new Error("Call ready() before accessing the database.");
    const value = Reflect.get(current, property, current);
    return typeof value === "function" ? value.bind(current) : value;
  },
});

/** All former SQLite immediate transactions share this Postgres lock. */
export async function transaction<T>(
  operation: (tx: Database) => Promise<T>,
): Promise<T> {
  await ready();
  const nested = state.transactions.getStore();
  if (nested) return operation(nested);
  return state.database!.transaction(async (tx) => {
    await tx.execute(applicationLock);
    return state.transactions.run(tx as unknown as Database, () =>
      operation(db),
    );
  });
}

export async function query<T = Record<string, unknown>>(
  statement: SQL,
): Promise<T[]> {
  await ready();
  const result = await db.execute(statement);
  return result.rows as T[];
}

export const migrate = ready;

export async function closeDatabase() {
  if (state.initializing) await state.initializing;
  await state.close?.();
  state.database = undefined;
  state.close = undefined;
  state.initializing = undefined;
}
