import { and, asc, eq, gte, inArray, lte } from "drizzle-orm";
import { getDb } from "../db/connect";
import { clipEdits, footage, projects, publishPlans, settings, type PublishMode, type PublishPlan } from "../db/schema";
import { newId } from "@/lib/ids";
import { isApprovalValid } from "@/lib/domain/approval";
import { zonedToUtc } from "@/lib/time";
import { enqueueJob } from "../jobs/queue";
import { logActivity } from "./activity";
import { ValidationError } from "./errors";
import { env } from "../env";

const ACTIVE: PublishPlan["status"][] = ["planned", "awaiting_approval", "publishing", "uncertain", "scheduled_on_meta"];

export async function listPlans(range?: { from: Date; to: Date }) {
  const db = await getDb();
  const rows = await db
    .select({ plan: publishPlans, project: projects })
    .from(publishPlans)
    .innerJoin(projects, eq(publishPlans.projectId, projects.id))
    .where(range ? and(gte(publishPlans.scheduledAt, range.from), lte(publishPlans.scheduledAt, range.to)) : undefined)
    .orderBy(asc(publishPlans.scheduledAt));
  const ids = [...new Set(rows.map((r) => r.project.id))];
  const thumbs = ids.length
    ? await db
        .select({ projectId: clipEdits.projectId, driveFileId: footage.driveFileId, position: clipEdits.position })
        .from(clipEdits)
        .innerJoin(footage, eq(clipEdits.footageId, footage.id))
        .where(inArray(clipEdits.projectId, ids))
    : [];
  return rows.map(({ plan, project }) => ({
    ...plan,
    project: {
      id: project.id,
      title: project.title,
      status: project.status,
      productId: project.productId,
      approvalValid: isApprovalValid(project, { renderId: project.currentRenderId, captionTh: project.captionTh, productId: project.productId }),
    },
    thumbDriveFileId: thumbs.filter((t) => t.projectId === project.id).sort((a, b) => a.position - b.position)[0]?.driveFileId ?? null,
  }));
}

export type PlanListItem = Awaited<ReturnType<typeof listPlans>>[number];

export async function ensurePublishJob(planId: string, runAt = new Date()) {
  await enqueueJob({ type: "publish", payload: { planId }, dedupeKey: `publish:${planId}`, runAt, maxAttempts: 5 });
}

export async function ensurePublishJobsForProject(projectId: string) {
  const db = await getDb();
  const plans = await db
    .select()
    .from(publishPlans)
    .where(and(eq(publishPlans.projectId, projectId), inArray(publishPlans.status, ["planned"])));
  for (const p of plans) await ensurePublishJob(p.id);
}

export async function createPlan(input: { projectId: string; date: string; time: string; timezone?: string; mode?: PublishMode }) {
  const db = await getDb();
  const [s] = await db.select().from(settings).limit(1);
  const tz = input.timezone || s?.timezone || "Asia/Bangkok";
  const scheduledAt = zonedToUtc(input.date, input.time, tz);
  if (scheduledAt.getTime() < Date.now() - 60_000) throw new ValidationError("Choose a time in the future.");
  const [p] = await db.select().from(projects).where(eq(projects.id, input.projectId));
  if (!p) throw new ValidationError("Reel not found");
  const approved = isApprovalValid(p, { renderId: p.currentRenderId, captionTh: p.captionTh, productId: p.productId });
  const id = newId("pln");
  await db.insert(publishPlans).values({
    id,
    projectId: p.id,
    scheduledAt,
    timezone: tz,
    mode: input.mode ?? s?.defaultPublishMode ?? "balena_publisher",
    status: approved ? "planned" : "awaiting_approval",
    idempotencyKey: `plan:${id}`,
    isSimulated: env.facebookMode === "demo",
  });
  await logActivity({
    category: "publishing",
    title: `Plan created (local): ${p.title}`,
    detail: approved ? "Will be sent to Facebook by the publisher at the planned time." : "Waiting for approval before anything is sent to Facebook.",
    projectId: p.id,
    planId: id,
  });
  if (approved) await ensurePublishJob(id);
  return id;
}

async function getPlan(planId: string) {
  const db = await getDb();
  const [plan] = await db.select().from(publishPlans).where(eq(publishPlans.id, planId));
  if (!plan) throw new ValidationError("Plan not found");
  return plan;
}

export async function updatePlan(planId: string, input: { date: string; time: string; timezone?: string; mode?: PublishMode }) {
  const db = await getDb();
  const plan = await getPlan(planId);
  if (plan.finishRequestedAt || !["planned", "awaiting_approval", "failed"].includes(plan.status)) {
    throw new ValidationError("This plan was already handed to Facebook and can’t be edited here.");
  }
  const tz = input.timezone || plan.timezone;
  const scheduledAt = zonedToUtc(input.date, input.time, tz);
  if (scheduledAt.getTime() < Date.now() - 60_000) throw new ValidationError("Choose a time in the future.");
  const [p] = await db.select().from(projects).where(eq(projects.id, plan.projectId));
  const approved = !!p && isApprovalValid(p, { renderId: p.currentRenderId, captionTh: p.captionTh, productId: p.productId });
  await db
    .update(publishPlans)
    .set({
      scheduledAt,
      timezone: tz,
      mode: input.mode ?? plan.mode,
      status: approved ? "planned" : "awaiting_approval",
      lastError: null,
      updatedAt: new Date(),
    })
    .where(eq(publishPlans.id, planId));
  await logActivity({ category: "publishing", title: `Plan updated: ${p?.title ?? planId}`, projectId: plan.projectId, planId });
  if (approved) await ensurePublishJob(planId);
}

export async function cancelPlan(planId: string, opts: { confirmedRemovedOnMeta?: boolean } = {}) {
  const db = await getDb();
  const plan = await getPlan(planId);
  if (plan.status === "published") throw new ValidationError("This Reel is already published. Remove it on Facebook if needed.");
  if (plan.finishRequestedAt && !opts.confirmedRemovedOnMeta) {
    throw new ValidationError(
      "This Reel was already sent to Facebook. Cancel or delete it in Meta Business Suite first, then confirm here.",
    );
  }
  await db.update(publishPlans).set({ status: "cancelled", updatedAt: new Date() }).where(eq(publishPlans.id, planId));
  const { jobs } = await import("../db/schema");
  await db
    .update(jobs)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(and(eq(jobs.dedupeKey, `publish:${planId}`), inArray(jobs.status, ["queued", "blocked", "failed"])));
  await logActivity({ category: "publishing", title: "Plan cancelled", projectId: plan.projectId, planId });
}

/** Re-reads Facebook status now (never re-sends a publish request). */
export async function checkPlanNow(planId: string) {
  await getPlan(planId);
  await ensurePublishJob(planId);
}

/**
 * Explicit, user-confirmed retry of the finish step for an uncertain plan. The worker first
 * re-reads the status; only if Facebook shows the video was never published does it resend
 * finish — for the SAME video id, which cannot create a second Reel.
 */
export async function retryFinish(planId: string) {
  const plan = await getPlan(planId);
  if (!plan.fbVideoId || plan.status !== "uncertain") throw new ValidationError("Nothing to retry for this plan.");
  await enqueueJob({ type: "publish", payload: { planId, retryFinish: true }, dedupeKey: `publish:${planId}`, maxAttempts: 5 });
  await logActivity({ category: "publishing", title: "Retry requested after status check", projectId: plan.projectId, planId });
}

/** Start a fresh upload. Only allowed when Facebook reported the previous video failed. */
export async function startOver(planId: string) {
  const db = await getDb();
  const plan = await getPlan(planId);
  if (plan.status !== "failed" || plan.fbProcessingStatus !== "failed") {
    throw new ValidationError("Start over is only available when Facebook reported the upload as failed.");
  }
  await db
    .update(publishPlans)
    .set({
      status: "planned",
      fbVideoId: null,
      fbUploadStatus: "not_started",
      fbProcessingStatus: "not_started",
      fbScheduleStatus: "not_started",
      fbPublishStatus: "not_started",
      finishRequestedAt: null,
      lastError: null,
      updatedAt: new Date(),
    })
    .where(eq(publishPlans.id, planId));
  await ensurePublishJob(planId);
  await logActivity({ category: "publishing", title: "Starting a fresh upload", projectId: plan.projectId, planId });
}

export async function markManualTagDone(planId: string) {
  const db = await getDb();
  const plan = await getPlan(planId);
  await db.update(publishPlans).set({ manualTagStatus: "done_by_user", updatedAt: new Date() }).where(eq(publishPlans.id, planId));
  await logActivity({
    category: "publishing",
    level: "success",
    title: "Product tag marked as added (by you)",
    detail: "Recorded from your confirmation; the app cannot verify native tags.",
    projectId: plan.projectId,
    planId,
  });
}

export async function activePlanIds(): Promise<string[]> {
  const db = await getDb();
  const rows = await db.select({ id: publishPlans.id }).from(publishPlans).where(inArray(publishPlans.status, ACTIVE));
  return rows.map((r) => r.id);
}
