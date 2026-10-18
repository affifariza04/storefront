import { mkdirSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import { migrate as migratePostgres } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import * as schema from "./schema";

export type DB = PgDatabase<PgQueryResultHKT, typeof schema>;

const MIGRATIONS = path.join(process.cwd(), "drizzle");

/**
 * Production talks to real PostgreSQL via DATABASE_URL. Without it, the app
 * uses PGlite (Postgres compiled to WASM) persisted under .data/, so
 * `npm run dev` works with zero setup and runs the same SQL as production.
 */
export async function createDb(opts: { url?: string; dataDir?: string } = {}): Promise<DB> {
  if (opts.url) {
    const client = postgres(opts.url, { max: 10 });
    const db = drizzlePostgres(client, { schema });
    await migratePostgres(db, { migrationsFolder: MIGRATIONS });
    return db as unknown as DB;
  }
  if (opts.dataDir) mkdirSync(opts.dataDir, { recursive: true });
  const client = new PGlite(opts.dataDir);
  const db = drizzlePglite(client, { schema });
  await migratePglite(db, { migrationsFolder: MIGRATIONS });
  return db as unknown as DB;
}

// One instance per server process (survives Next.js dev hot reloads).
const globalForDb = globalThis as unknown as { dbPromise?: Promise<DB> };

export function getDb(): Promise<DB> {
  globalForDb.dbPromise ??= createDb({
    url: process.env.DATABASE_URL,
    dataDir: path.join(process.cwd(), ".data", "pglite"),
  }).then(async (db) => {
    const { seedIfEmpty } = await import("./seed");
    await seedIfEmpty(db);
    return db;
  }).catch((err) => {
    globalForDb.dbPromise = undefined; // don't cache a failed connection
    throw err;
  });
  return globalForDb.dbPromise;
}

export { schema };
