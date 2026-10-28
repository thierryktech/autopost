import { and, count, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import { getDb } from "../db/connect";
import { activityEvents, connections, footage, jobs, projects, publishPlans, renderVersions, settings } from "../db/schema";
import { integrationModes } from "../adapters";
import { env } from "../env";

export async function getSettings() {
  const db = await getDb();
  const [s] = await db.select().from(settings).limit(1);
  return s;
}

export async function getShellData() {
  const db = await getDb();
  const [[review], [failures], [busy], conns, s] = await Promise.all([
    db.select({ n: count() }).from(projects).where(eq(projects.status, "needs_review")),
    db.select({ n: count() }).from(activityEvents).where(and(eq(activityEvents.level, "error"), isNull(activityEvents.resolvedAt))),
    db.select({ n: count() }).from(jobs).where(and(inArray(jobs.status, ["running", "queued"]), sql`${jobs.runAt} <= now() + interval '2 minutes'`)),
    db.select().from(connections),
    getSettings(),
  ]);
  const modes = integrationModes();
  return {
    counts: { review: review.n, failures: failures.n },
    busy: busy.n > 0,
    timezone: s?.timezone ?? "Asia/Bangkok",
    onboarded: !!s?.onboardingCompletedAt,
    connections: conns,
    modes,
    anyDemo: modes.drive === "demo" || modes.claude === "demo" || modes.facebook === "demo" || modes.render === "simulated",
    workerMode: env.workerMode,
  };
}

export async function getOverview() {
  const db = await getDb();
  const now = new Date();
  const [[src], [review], [planned], [published], upcoming, running, recentRenders] = await Promise.all([
    db.select({ n: count() }).from(footage).where(and(eq(footage.kind, "source"), eq(footage.availability, "available"))),
    db.select({ n: count() }).from(projects).where(eq(projects.status, "needs_review")),
    db.select({ n: count() }).from(publishPlans).where(and(inArray(publishPlans.status, ["planned", "awaiting_approval", "scheduled_on_meta", "publishing"]), gte(publishPlans.scheduledAt, now))),
    db.select({ n: count() }).from(publishPlans).where(eq(publishPlans.status, "published")),
    db
      .select({ plan: publishPlans, title: projects.title })
      .from(publishPlans)
      .innerJoin(projects, eq(projects.id, publishPlans.projectId))
      .where(and(inArray(publishPlans.status, ["planned", "awaiting_approval", "scheduled_on_meta", "publishing", "uncertain"]), gte(publishPlans.scheduledAt, new Date(now.getTime() - 86400_000))))
      .orderBy(publishPlans.scheduledAt)
      .limit(5),
    db.select().from(jobs).where(inArray(jobs.status, ["running", "queued", "blocked", "failed"])).orderBy(sql`${jobs.updatedAt} desc`).limit(12),
    db.select({ r: renderVersions, title: projects.title }).from(renderVersions).innerJoin(projects, eq(projects.id, renderVersions.projectId)).where(inArray(renderVersions.status, ["queued", "rendering"])),
  ]);
  return {
    stats: { sourceClips: src.n, needsReview: review.n, planned: planned.n, published: published.n },
    upcoming,
    jobs: running.filter((j) => j.status === "running" || j.runAt.getTime() < now.getTime() + 5 * 60_000 || j.status === "failed").slice(0, 6),
    activeRenders: recentRenders,
  };
}
