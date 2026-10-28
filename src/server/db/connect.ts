/*
 * Database connection shared by the Next.js server and the worker process.
 *
 * - DATABASE_URL=postgres://...  -> managed Postgres (production, shared between devices)
 * - DATABASE_URL unset / pglite:  -> embedded PGlite in .data/pglite (local demo only)
 *
 * PGlite is single-process, so in demo mode the job runner is embedded in the web server
 * (see src/instrumentation.ts). In production the worker runs as its own process.
 */
import path from "node:path";
import fs from "node:fs";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "./schema";

export type Db = PostgresJsDatabase<typeof schema>;

type Holder = { db?: Promise<Db>; kind?: "pglite" | "postgres" };
const g = globalThis as unknown as { __balenaDb?: Holder };
g.__balenaDb ??= {};

export function databaseKind(): "pglite" | "postgres" {
  const url = process.env.DATABASE_URL;
  return url && /^postgres(ql)?:\/\//.test(url) ? "postgres" : "pglite";
}

const migrationsFolder = path.join(process.cwd(), "drizzle");

async function connect(): Promise<Db> {
  if (databaseKind() === "postgres") {
    const { drizzle } = await import("drizzle-orm/postgres-js");
    const postgres = (await import("postgres")).default;
    const client = postgres(process.env.DATABASE_URL!, {
      max: Number(process.env.DATABASE_POOL_SIZE ?? 5),
      onnotice: () => {},
      prepare: false, // compatible with transaction-mode poolers (Supabase/Neon)
    });
    const db = drizzle(client, { schema });
    if (process.env.DB_AUTO_MIGRATE !== "false") {
      const { migrate } = await import("drizzle-orm/postgres-js/migrator");
      await migrate(db, { migrationsFolder });
    }
    return db;
  }
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const raw = process.env.DATABASE_URL?.replace(/^pglite:/, "");
  const dir = raw === "memory" ? undefined : path.resolve(/*turbopackIgnore: true*/ raw || ".data/pglite");
  if (dir) fs.mkdirSync(dir, { recursive: true });
  const client = new PGlite(dir);
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder });
  return db as unknown as Db;
}

export function getDb(): Promise<Db> {
  if (!g.__balenaDb!.db) {
    g.__balenaDb!.kind = databaseKind();
    g.__balenaDb!.db = connect().then(async (db) => {
      const { ensureSeeded } = await import("../seed");
      await ensureSeeded(db);
      return db;
    });
    g.__balenaDb!.db.catch(() => {
      g.__balenaDb!.db = undefined;
    });
  }
  return g.__balenaDb!.db;
}
