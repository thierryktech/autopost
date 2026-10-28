/*
 * Durable job queue backed by the `jobs` table (works on Postgres and PGlite).
 * Claiming uses SELECT … FOR UPDATE SKIP LOCKED so multiple workers never run the same job.
 */
import { and, eq, sql, inArray } from "drizzle-orm";
import { getDb } from "../db/connect";
import { jobs, type Job, type JobType } from "../db/schema";
import { newId } from "@/lib/ids";

export async function enqueueJob(input: {
  type: JobType;
  payload: Record<string, unknown>;
  runAt?: Date;
  dedupeKey?: string;
  maxAttempts?: number;
  projectId?: string | null;
}): Promise<Job> {
  const db = await getDb();
  if (input.dedupeKey) {
    const [existing] = await db.select().from(jobs).where(eq(jobs.dedupeKey, input.dedupeKey));
    if (existing) {
      // Re-arm a finished/blocked job instead of creating a duplicate. Never touch a running job.
      if (existing.status !== "running") {
        const [row] = await db
          .update(jobs)
          .set({
            status: "queued",
            runAt: input.runAt ?? new Date(),
            payload: input.payload,
            attempts: existing.status === "queued" ? existing.attempts : 0,
            lastError: null,
            updatedAt: new Date(),
          })
          .where(eq(jobs.id, existing.id))
          .returning();
        return row;
      }
      return existing;
    }
  }
  const [row] = await db
    .insert(jobs)
    .values({
      id: newId("job"),
      type: input.type,
      payload: input.payload,
      runAt: input.runAt ?? new Date(),
      dedupeKey: input.dedupeKey ?? null,
      maxAttempts: input.maxAttempts ?? 3,
      projectId: input.projectId ?? null,
    })
    .onConflictDoNothing()
    .returning();
  if (row) return row;
  const [again] = await db.select().from(jobs).where(eq(jobs.dedupeKey, input.dedupeKey!));
  return again;
}

export async function claimNextJob(workerId: string, lockMs = 15 * 60_000): Promise<Job | null> {
  const db = await getDb();
  return db.transaction(async (tx) => {
    // Recover jobs whose worker died mid-run (handlers are idempotent / state-machine driven).
    await tx
      .update(jobs)
      .set({ status: "queued", lockedBy: null, lockedUntil: null, updatedAt: new Date() })
      .where(and(eq(jobs.status, "running"), sql`${jobs.lockedUntil} < now()`));
    const rows = await tx.execute(
      sql`SELECT id FROM jobs WHERE status = 'queued' AND run_at <= now() ORDER BY run_at ASC LIMIT 1 FOR UPDATE SKIP LOCKED`,
    );
    const list = (Array.isArray(rows) ? rows : (rows as { rows: unknown[] }).rows) as { id: string }[];
    const id = list[0]?.id;
    if (!id) return null;
    const [job] = await tx
      .update(jobs)
      .set({
        status: "running",
        lockedBy: workerId,
        lockedUntil: new Date(Date.now() + lockMs),
        attempts: sql`${jobs.attempts} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(jobs.id, id))
      .returning();
    return job;
  });
}

export async function completeJob(id: string, result: Record<string, unknown> = {}) {
  const db = await getDb();
  await db.update(jobs).set({ status: "succeeded", result, lockedBy: null, lockedUntil: null, updatedAt: new Date() }).where(eq(jobs.id, id));
}

export async function rescheduleJob(id: string, runAt: Date, note?: string, resetAttempts = true, payload?: Record<string, unknown>) {
  const db = await getDb();
  await db
    .update(jobs)
    .set({
      status: "queued",
      ...(payload ? { payload } : {}),
      runAt,
      lockedBy: null,
      lockedUntil: null,
      ...(resetAttempts ? { attempts: 0 } : {}),
      lastError: note ?? null,
      updatedAt: new Date(),
    })
    .where(eq(jobs.id, id));
}

export async function blockJob(id: string, reason: string) {
  const db = await getDb();
  await db.update(jobs).set({ status: "blocked", lastError: reason, lockedBy: null, lockedUntil: null, updatedAt: new Date() }).where(eq(jobs.id, id));
}

export async function failJob(job: Job, error: string, retryable: boolean): Promise<"retrying" | "failed"> {
  const db = await getDb();
  if (retryable && job.attempts < job.maxAttempts) {
    const backoff = Math.min(15 * 60_000, 2 ** job.attempts * 15_000);
    await db
      .update(jobs)
      .set({ status: "queued", runAt: new Date(Date.now() + backoff), lastError: error, lockedBy: null, lockedUntil: null, updatedAt: new Date() })
      .where(eq(jobs.id, job.id));
    return "retrying";
  }
  await db.update(jobs).set({ status: "failed", lastError: error, lockedBy: null, lockedUntil: null, updatedAt: new Date() }).where(eq(jobs.id, job.id));
  return "failed";
}

export async function retryJob(id: string) {
  const db = await getDb();
  await db
    .update(jobs)
    .set({ status: "queued", runAt: new Date(), attempts: 0, lastError: null, updatedAt: new Date() })
    .where(and(eq(jobs.id, id), inArray(jobs.status, ["failed", "blocked", "cancelled"])));
}

export async function activeJobs(limit = 10) {
  const db = await getDb();
  return db.select().from(jobs).where(inArray(jobs.status, ["queued", "running"])).orderBy(jobs.runAt).limit(limit);
}

export async function getJob(id: string) {
  const db = await getDb();
  const [j] = await db.select().from(jobs).where(eq(jobs.id, id));
  return j ?? null;
}
