import { desc, eq, and, isNull, inArray } from "drizzle-orm";
import { getDb } from "../db/connect";
import { activityEvents, type ActivityCategory, type ActivityLevel } from "../db/schema";
import { newId } from "@/lib/ids";

export async function logActivity(e: {
  category: ActivityCategory;
  level?: ActivityLevel;
  title: string;
  detail?: string | null;
  projectId?: string | null;
  planId?: string | null;
  jobId?: string | null;
  action?: { kind: string; [k: string]: unknown } | null;
}) {
  const db = await getDb();
  await db.insert(activityEvents).values({
    id: newId("evt"),
    category: e.category,
    level: e.level ?? "info",
    title: e.title,
    detail: e.detail ?? null,
    projectId: e.projectId ?? null,
    planId: e.planId ?? null,
    jobId: e.jobId ?? null,
    action: e.action ?? null,
  });
}

export async function listActivity(opts: { category?: ActivityCategory | "all"; level?: ActivityLevel | "all"; limit?: number; projectId?: string } = {}) {
  const db = await getDb();
  const conds = [];
  if (opts.category && opts.category !== "all") conds.push(eq(activityEvents.category, opts.category));
  if (opts.level && opts.level !== "all") conds.push(eq(activityEvents.level, opts.level));
  if (opts.projectId) conds.push(eq(activityEvents.projectId, opts.projectId));
  return db
    .select()
    .from(activityEvents)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(activityEvents.at))
    .limit(opts.limit ?? 100);
}

export async function unresolvedFailures(limit = 5) {
  const db = await getDb();
  return db
    .select()
    .from(activityEvents)
    .where(and(inArray(activityEvents.level, ["error", "warning"]), isNull(activityEvents.resolvedAt)))
    .orderBy(desc(activityEvents.at))
    .limit(limit);
}

export async function resolveActivity(id: string) {
  const db = await getDb();
  await db.update(activityEvents).set({ resolvedAt: new Date() }).where(eq(activityEvents.id, id));
}
