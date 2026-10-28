/*
 * Starts the embedded job runner in demo/local mode (PGlite). In production (WORKER_MODE=external)
 * the web server never runs long jobs; the separate worker process does.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { env } = await import("./server/env");
  if (env.workerMode !== "embedded" || process.env.DISABLE_EMBEDDED_WORKER === "true") return;
  const g = globalThis as unknown as { __balenaRunner?: boolean };
  if (g.__balenaRunner) return;
  g.__balenaRunner = true;
  const { getDb } = await import("./server/db/connect");
  await getDb();
  const { ensureDemoMedia } = await import("./server/demo-media");
  void ensureDemoMedia().catch((e) => console.warn("[demo-media]", e.message));
  const { startRunner } = await import("./server/jobs/runner");
  startRunner({ mode: "embedded", concurrency: 2 });
}
