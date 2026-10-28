/*
 * Publishing state machine (pure, unit-tested).
 *
 * Duplicate-prevention rules:
 *  1. A plan owns exactly one Facebook video object (fbVideoId). Once a video id exists the
 *     worker never starts a second upload session for that plan automatically.
 *  2. The "finish" call is the step that makes a Reel public/scheduled. Before sending it we
 *     persist finishRequestedAt. If the response is lost or ambiguous we NEVER resend it
 *     blindly; the plan moves to "uncertain" and is reconciled by reading the video status.
 *  3. "Published" is only shown after a status read confirms publication.
 */
import { isWithinMetaScheduleWindow } from "../time";
import type { PublishPlan } from "@/server/db/schema";

export const PRE_UPLOAD_LEAD_MS = 2 * 60 * 60 * 1000; // upload up to 2h before publish time
export const RECONCILE_GIVE_UP_MS = 6 * 60 * 60 * 1000;

export type PlanForDecision = Pick<
  PublishPlan,
  | "status"
  | "mode"
  | "scheduledAt"
  | "fbVideoId"
  | "fbUploadStatus"
  | "finishRequestedAt"
  | "fbPublishStatus"
  | "fbScheduleStatus"
>;

export type PublishDecision =
  | { kind: "done"; reason: "published" | "cancelled" | "scheduled_on_meta" }
  | { kind: "blocked"; reason: string }
  | { kind: "wait_until"; at: Date; reason: string }
  | { kind: "start_upload" }
  | { kind: "upload" }
  | { kind: "finish"; videoState: "PUBLISHED" | "SCHEDULED" }
  | { kind: "reconcile" };

export function decidePublishStep(plan: PlanForDecision, ctx: { now: Date; approvalValid: boolean }): PublishDecision {
  if (plan.status === "cancelled") return { kind: "done", reason: "cancelled" };
  if (plan.status === "published" || plan.fbPublishStatus === "succeeded") return { kind: "done", reason: "published" };

  // Once finish has been requested we only ever *read* status (rule 2).
  if (plan.finishRequestedAt) {
    if (plan.mode === "meta_scheduled" && plan.fbScheduleStatus === "succeeded") {
      // Scheduled by Meta; confirm publication after the scheduled time passes.
      if (ctx.now < plan.scheduledAt) return { kind: "wait_until", at: plan.scheduledAt, reason: "Scheduled on Meta" };
    }
    return { kind: "reconcile" };
  }

  if (!ctx.approvalValid) return { kind: "blocked", reason: "Draft is not approved for its current video and caption." };

  const scheduledAt = new Date(plan.scheduledAt);

  if (plan.mode === "meta_scheduled") {
    if (!isWithinMetaScheduleWindow(scheduledAt, ctx.now)) {
      return {
        kind: "blocked",
        reason: "Meta-native scheduling needs a publish time between 15 minutes and 28 days from now.",
      };
    }
  } else {
    const uploadFrom = new Date(scheduledAt.getTime() - PRE_UPLOAD_LEAD_MS);
    if (ctx.now < uploadFrom) return { kind: "wait_until", at: uploadFrom, reason: "Waiting for upload window" };
  }

  if (!plan.fbVideoId) return { kind: "start_upload" };
  if (plan.fbUploadStatus !== "succeeded") return { kind: "upload" };

  if (plan.mode === "meta_scheduled") return { kind: "finish", videoState: "SCHEDULED" };
  if (ctx.now < scheduledAt) return { kind: "wait_until", at: scheduledAt, reason: "Uploaded; waiting for publish time" };
  return { kind: "finish", videoState: "PUBLISHED" };
}

/** Normalised Facebook video status (adapter output). */
export interface FbVideoStatus {
  uploading: "not_started" | "in_progress" | "complete" | "error";
  processing: "not_started" | "in_progress" | "complete" | "error";
  publishing: "not_started" | "in_progress" | "complete" | "error";
  publishStatus: "published" | "scheduled" | "not_published" | "unknown";
  postId: string | null;
  permalink: string | null;
  errorMessage: string | null;
}

export type ReconcileOutcome =
  | { kind: "published"; postId: string | null; permalink: string | null }
  | { kind: "scheduled_on_meta" }
  | { kind: "failed"; message: string; safeToStartOver: boolean }
  | { kind: "pending" }
  | { kind: "needs_attention"; message: string };

export function interpretStatus(
  status: FbVideoStatus,
  ctx: { finishRequestedAt: Date; now: Date; mode: PublishPlan["mode"] },
): ReconcileOutcome {
  if (status.publishStatus === "published" && status.publishing === "complete") {
    return { kind: "published", postId: status.postId, permalink: status.permalink };
  }
  if (status.publishStatus === "scheduled") return { kind: "scheduled_on_meta" };
  if (status.processing === "error" || status.uploading === "error") {
    // Meta reports the video itself failed; it was never published, so starting over is safe.
    return { kind: "failed", message: status.errorMessage ?? "Meta reported a processing error.", safeToStartOver: true };
  }
  if (status.publishing === "error") {
    return { kind: "failed", message: status.errorMessage ?? "Meta reported a publishing error.", safeToStartOver: false };
  }
  const waited = ctx.now.getTime() - ctx.finishRequestedAt.getTime();
  if (waited > RECONCILE_GIVE_UP_MS) {
    return {
      kind: "needs_attention",
      message:
        "Facebook has not confirmed this Reel for several hours. Check the Page before retrying — the finish request is not resent automatically.",
    };
  }
  return { kind: "pending" };
}

/** Reconcile back-off: 30s, 1m, 2m, 5m, then every 10m. */
export function reconcileDelayMs(attempt: number): number {
  const steps = [30_000, 60_000, 120_000, 300_000];
  return steps[attempt] ?? 600_000;
}

export const PLAN_STATUS_LABEL: Record<PublishPlan["status"], string> = {
  planned: "Planned (local)",
  awaiting_approval: "Awaiting approval",
  publishing: "Publishing…",
  scheduled_on_meta: "Scheduled on Meta",
  published: "Published",
  uncertain: "Checking with Facebook",
  failed: "Failed",
  cancelled: "Cancelled",
};
