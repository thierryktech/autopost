/*
 * Standalone worker process (production). Runs renders (FFmpeg), Claude drafts, Drive syncs and
 * publishing jobs from the durable Postgres-backed queue. Keep it running on an always-on host so
 * approved, scheduled work continues while your MacBook and iPad are off.
 *
 *   DATABASE_URL=postgres://... pnpm worker
 */
import { startRunner } from "../src/server/jobs/runner";
import { getDb, databaseKind } from "../src/server/db/connect";

async function main() {
  if (databaseKind() !== "postgres") {
    console.warn("[worker] DATABASE_URL is not Postgres. PGlite is single-process: use the embedded runner (pnpm dev) instead.");
    process.exit(1);
  }
  await getDb();
  const runner = startRunner({ mode: "external", concurrency: Number(process.env.WORKER_CONCURRENCY ?? 2) });
  const shutdown = async (sig: string) => {
    console.log(`[worker] ${sig} received, finishing current jobs…`);
    await runner.stop();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
