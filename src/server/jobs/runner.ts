/*
 * Job runner shared by the standalone worker (production) and the embedded demo runner.
 */
import os from "node:os";
import { and, eq, inArray, isNull, notInArray, sql } from "drizzle-orm";
import { getDb } from "../db/connect";
import { jobs, publishPlans, type Job, type JobType } from "../db/schema";
import { claimNextJob, completeJob, failJob, rescheduleJob, blockJob, enqueueJob } from "./queue";
import { AdapterError } from "../adapters/types";
import { logActivity } from "../services/activity";
import { upsertConnection, getConnection } from "../connections";
import { renderHandler } from "./handlers/render";
import { claudeDraftHandler } from "./handlers/claude";
import { driveSyncHandler } from "./handlers/drive-sync";
import { publishHandler } from "./handlers/publish";
import type { JobHandler } from "./types";

const HANDLERS: Record<JobType, JobHandler> = {
  render: renderHandler,
  claude_draft: claudeDraftHandler,
  drive_sync: driveSyncHandler,
  publish: publishHandler,
  reconcile_publish: publishHandler,
};

const LABEL: Record<JobType, string> = {
  render: "Render",
  claude_draft: "Edit draft",
  drive_sync: "Drive sync",
  publish: "Publishing",
  reconcile_publish: "Publish check",
};

export async function runJob(job: Job): Promise<void> {
  const handler = HANDLERS[job.type];
  try {
    const res = await handler(job);
    if (res.kind === "done") await completeJob(job.id, res.result);
    else if (res.kind === "reschedule") await rescheduleJob(job.id, res.at, res.note, true, job.payload);
    else await blockJob(job.id, res.reason);
  } catch (e) {
    const err = e as Error;
    const retryable = e instanceof AdapterError ? e.retryable : false;
    const outcome = await failJob(job, err.message, retryable);
    // Render & publish handlers log their own user-facing failures.
    if (outcome === "failed" && job.type !== "render") {
      await logActivity({
        category: job.type === "publish" || job.type === "reconcile_publish" ? "publishing" : job.type === "drive_sync" ? "drive" : "editing",
        level: "error",
        title: `${LABEL[job.type]} failed`,
        detail: err.message,
        projectId: job.projectId,
        planId: (job.payload.planId as string) ?? null,
        jobId: job.id,
        action:
          e instanceof AdapterError && (e.code === "auth_expired" || e.code === "permission_denied" || e.code === "not_configured")
            ? { kind: "reconnect", provider: job.type === "claude_draft" ? "claude" : job.type === "drive_sync" ? "google_drive" : "facebook" }
            : { kind: "retry_job", jobId: job.id },
      });
    }
  }
}

/** Ensures every active plan has a publish job (self-healing if a job row was lost). */
export async function sweepPlans() {
  const db = await getDb();
  const rows = await db
    .select({ id: publishPlans.id })
    .from(publishPlans)
    .leftJoin(jobs, eq(jobs.dedupeKey, sql`'publish:' || ${publishPlans.id}`))
    .where(and(inArray(publishPlans.status, ["planned", "publishing", "uncertain", "scheduled_on_meta"]), isNull(jobs.id)));
  for (const r of rows) await enqueueJob({ type: "publish", payload: { planId: r.id }, dedupeKey: `publish:${r.id}`, maxAttempts: 5 });
}

export async function maybeScheduleDriveSync() {
  const db = await getDb();
  const [pending] = await db.select({ id: jobs.id }).from(jobs).where(and(eq(jobs.type, "drive_sync"), notInArray(jobs.status, ["succeeded", "failed", "cancelled", "blocked"])));
  if (pending) return;
  const conn = await getConnection("google_drive");
  if (!conn || !["connected", "demo"].includes(conn.status)) return;
  const last = conn.lastCheckedAt?.getTime() ?? 0;
  if (Date.now() - last > 30 * 60_000) {
    await enqueueJob({ type: "drive_sync", payload: {}, dedupeKey: `drive_sync:${Math.floor(Date.now() / (30 * 60_000))}` });
  }
}

export async function heartbeat(workerId: string, mode: "embedded" | "external") {
  await upsertConnection("worker", {
    status: mode === "embedded" ? "demo" : "connected",
    accountLabel: mode === "embedded" ? "Embedded demo worker (stops when this server stops)" : `Worker ${workerId}`,
    externalId: workerId,
    lastCheckedAt: new Date(),
    lastError: null,
    meta: { mode, host: os.hostname(), heartbeatAt: new Date().toISOString() },
  });
}

export interface RunnerHandle {
  stop: () => Promise<void>;
}

export function startRunner(opts: { mode: "embedded" | "external"; concurrency?: number; pollMs?: number }): RunnerHandle {
  const workerId = `${os.hostname()}-${process.pid}`;
  const concurrency = opts.concurrency ?? 2;
  const pollMs = opts.pollMs ?? 2000;
  let stopped = false;
  let lastSweep = 0;
  const loops: Promise<void>[] = [];

  const tick = async () => {
    if (Date.now() - lastSweep > 30_000) {
      lastSweep = Date.now();
      await heartbeat(workerId, opts.mode).catch((e) => console.error("[worker] heartbeat", e));
      await sweepPlans().catch((e) => console.error("[worker] sweep", e));
      await maybeScheduleDriveSync().catch((e) => console.error("[worker] drive sync schedule", e));
    }
  };

  for (let i = 0; i < concurrency; i++) {
    loops.push(
      (async () => {
        while (!stopped) {
          try {
            if (i === 0) await tick();
            const job = await claimNextJob(workerId);
            if (job) {
              await runJob(job);
              continue;
            }
          } catch (e) {
            console.error("[worker] loop error", e);
          }
          await new Promise((r) => setTimeout(r, pollMs));
        }
      })(),
    );
  }
  console.log(`[worker] started (${opts.mode}) id=${workerId} concurrency=${concurrency}`);
  return {
    stop: async () => {
      stopped = true;
      await Promise.all(loops);
    },
  };
}
