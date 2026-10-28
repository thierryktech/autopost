/*
 * Publish handler: drives one publishing plan through Facebook's Reels flow, one step per run,
 * persisting every outcome before moving on. See src/lib/domain/publish.ts for the rules.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { getDb } from "../../db/connect";
import { products, projects, publishAttempts, publishPlans, renderVersions, type PublishPlan } from "../../db/schema";
import { driveAdapter, facebookAdapter } from "../../adapters";
import { AdapterError } from "../../adapters/types";
import { logActivity } from "../../services/activity";
import { isApprovalValid } from "@/lib/domain/approval";
import { decidePublishStep, interpretStatus, reconcileDelayMs } from "@/lib/domain/publish";
import { newId } from "@/lib/ids";
import type { HandlerResult, JobHandler } from "../types";

async function patchPlan(id: string, patch: Partial<PublishPlan>) {
  const db = await getDb();
  await db.update(publishPlans).set({ ...patch, updatedAt: new Date() }).where(eq(publishPlans.id, id));
}

async function attempt(planId: string, phase: "start" | "upload" | "finish" | "status_check", outcome: "ok" | "error" | "ambiguous", detail: Record<string, unknown> = {}) {
  const db = await getDb();
  await db.insert(publishAttempts).values({ id: newId("pat"), planId, phase, outcome, detail });
}

export function buildDescription(caption: string, destinationUrl: string | null | undefined): string {
  const c = caption.trim();
  return destinationUrl ? `${c}\n\n🔗 ${destinationUrl}` : c;
}

export const publishHandler: JobHandler = async (job): Promise<HandlerResult> => {
  const planId = String(job.payload.planId);
  const db = await getDb();
  const [plan] = await db.select().from(publishPlans).where(eq(publishPlans.id, planId));
  if (!plan) return { kind: "done", result: { skipped: "plan deleted" } };
  const [project] = await db.select().from(projects).where(eq(projects.id, plan.projectId));
  if (!project) return { kind: "done", result: { skipped: "project deleted" } };
  const fb = facebookAdapter();
  const now = new Date();

  // User-confirmed retry for an uncertain plan: re-read status first, never resend blindly.
  if (job.payload.retryFinish && plan.fbVideoId && plan.status === "uncertain") {
    const st = await fb.getStatus(plan.fbVideoId);
    await attempt(planId, "status_check", "ok", { purpose: "retry_check", status: st });
    if (st.publishing === "not_started" && st.publishStatus !== "published" && st.publishStatus !== "scheduled") {
      await patchPlan(planId, { finishRequestedAt: null, status: "publishing", lastError: null });
      plan.finishRequestedAt = null;
      plan.status = "publishing";
    }
    job.payload.retryFinish = false;
  }

  const approvalValid = isApprovalValid(project, {
    renderId: project.currentRenderId,
    captionTh: project.captionTh,
    productId: project.productId,
  });
  const decision = decidePublishStep(plan, { now, approvalValid });

  switch (decision.kind) {
    case "done":
      return { kind: "done", result: { reason: decision.reason } };

    case "blocked": {
      if (plan.status !== "awaiting_approval" && !approvalValid) await patchPlan(planId, { status: "awaiting_approval" });
      else if (approvalValid) {
        await patchPlan(planId, { status: "failed", lastError: decision.reason });
        await logActivity({ category: "publishing", level: "error", title: `Can’t publish: ${project.title}`, detail: decision.reason, projectId: project.id, planId, action: { kind: "edit_plan", planId } });
      }
      return { kind: "blocked", reason: decision.reason };
    }

    case "wait_until":
      return { kind: "reschedule", at: decision.at, note: decision.reason };

    case "start_upload": {
      // Guard against a stale render/live-Facebook mismatch.
      const [render] = await db.select().from(renderVersions).where(eq(renderVersions.id, project.currentRenderId!));
      if (!render?.outputDriveFileId || (render.isSimulated && fb.mode === "live")) {
        const reason = "The approved version is a demo stand-in or simulated render. Re-render it before publishing to a real Page.";
        await patchPlan(planId, { status: "failed", lastError: reason });
        await logActivity({ category: "publishing", level: "error", title: `Can’t publish: ${project.title}`, detail: reason, projectId: project.id, planId });
        return { kind: "blocked", reason };
      }
      await patchPlan(planId, {
        status: "publishing",
        renderId: project.currentRenderId,
        approvalId: project.approvedContentHash,
        fbUploadStatus: "in_progress",
      });
      const { videoId, uploadUrl } = await fb.startUpload();
      await attempt(planId, "start", "ok", { videoId });
      await patchPlan(planId, { fbVideoId: videoId });
      await db.update(publishPlans).set({ fbPermalink: null }).where(eq(publishPlans.id, planId));
      job.payload.uploadUrl = uploadUrl;
      await logActivity({ category: "publishing", title: `Upload started: ${project.title}`, detail: fb.mode === "demo" ? "Simulated Facebook (demo)." : null, projectId: project.id, planId });
      return { kind: "reschedule", at: new Date(), note: "upload next" };
    }

    case "upload": {
      const [render] = await db.select().from(renderVersions).where(eq(renderVersions.id, plan.renderId ?? project.currentRenderId!));
      if (!render?.outputDriveFileId) return { kind: "blocked", reason: "Rendered file is missing" };
      const work = fs.mkdtempSync(path.join(os.tmpdir(), `balena-pub-${planId}-`));
      try {
        const file = path.join(work, "reel.mp4");
        await driveAdapter().downloadTo(render.outputDriveFileId, file);
        await fb.upload(plan.fbVideoId!, String(job.payload.uploadUrl ?? ""), file);
        await attempt(planId, "upload", "ok", { bytes: fs.statSync(file).size });
        await patchPlan(planId, { fbUploadStatus: "succeeded", fbProcessingStatus: "in_progress" });
      } catch (e) {
        await attempt(planId, "upload", "error", { message: (e as Error).message });
        await patchPlan(planId, { lastError: (e as Error).message });
        throw e; // upload is safe to retry: same video id, resumable session
      } finally {
        fs.rmSync(work, { recursive: true, force: true });
      }
      return { kind: "reschedule", at: new Date(), note: "finish next" };
    }

    case "finish": {
      const product = project.productId ? (await db.select().from(products).where(eq(products.id, project.productId)))[0] : undefined;
      const description = buildDescription(project.captionTh, product?.destinationUrl);
      // Persist intent BEFORE the call (rule 2): if we crash after this line we will only reconcile.
      await patchPlan(planId, {
        finishRequestedAt: new Date(),
        captionSnapshot: description,
        status: "publishing",
        ...(decision.videoState === "SCHEDULED" ? { fbScheduleStatus: "in_progress" } : { fbPublishStatus: "in_progress" }),
      });
      try {
        await fb.finish({
          videoId: plan.fbVideoId!,
          description,
          videoState: decision.videoState,
          scheduledPublishTime: decision.videoState === "SCHEDULED" ? new Date(plan.scheduledAt) : undefined,
        });
        await attempt(planId, "finish", "ok", { videoState: decision.videoState });
      } catch (e) {
        const err = e as AdapterError;
        if (err instanceof AdapterError && !err.ambiguous) {
          // A definite rejection: Facebook processed and refused it, so nothing was published.
          await attempt(planId, "finish", "error", { code: err.code, message: err.message });
          await patchPlan(planId, {
            finishRequestedAt: null,
            status: "failed",
            lastError: err.message,
            fbPublishStatus: decision.videoState === "PUBLISHED" ? "failed" : plan.fbPublishStatus,
            fbScheduleStatus: decision.videoState === "SCHEDULED" ? "failed" : plan.fbScheduleStatus,
          });
          await logActivity({
            category: "publishing",
            level: "error",
            title: `Facebook rejected the Reel: ${project.title}`,
            detail: err.message,
            projectId: project.id,
            planId,
            action: err.code === "auth_expired" || err.code === "permission_denied" ? { kind: "reconnect", provider: "facebook" } : { kind: "retry_job", jobId: job.id },
          });
          return { kind: "blocked", reason: err.message };
        }
        // Ambiguous: it may have succeeded. Do NOT retry — reconcile by reading status.
        await attempt(planId, "finish", "ambiguous", { message: err.message });
        await patchPlan(planId, { status: "uncertain", lastError: `Unclear response from Facebook: ${err.message}. Checking status instead of retrying.` });
        await logActivity({
          category: "publishing",
          level: "warning",
          title: `Checking with Facebook: ${project.title}`,
          detail: "The publish request may have gone through. The app will confirm by reading the Reel’s status and will not send it twice.",
          projectId: project.id,
          planId,
        });
      }
      return { kind: "reschedule", at: new Date(Date.now() + reconcileDelayMs(0)), note: "reconcile" };
    }

    case "reconcile": {
      const st = await fb.getStatus(plan.fbVideoId!);
      await attempt(planId, "status_check", "ok", { status: st });
      const outcome = interpretStatus(st, { finishRequestedAt: new Date(plan.finishRequestedAt!), now, mode: plan.mode });
      const n = Number(job.payload.reconcileCount ?? 0);
      job.payload.reconcileCount = n + 1;
      switch (outcome.kind) {
        case "published": {
          const needsTag = !!project.productId;
          await patchPlan(planId, {
            status: "published",
            fbPublishStatus: "succeeded",
            fbProcessingStatus: "succeeded",
            fbScheduleStatus: plan.mode === "meta_scheduled" ? "succeeded" : plan.fbScheduleStatus,
            fbPostId: outcome.postId,
            fbPermalink: outcome.permalink,
            confirmedAt: new Date(),
            lastError: null,
            manualTagStatus: needsTag ? "pending" : "not_needed",
          });
          await logActivity({
            category: "publishing",
            level: "success",
            title: `Published (confirmed by Facebook): ${project.title}`,
            detail: [fb.mode === "demo" ? "DEMO — simulated Facebook; nothing was posted." : null, needsTag ? "Product tag must be added manually." : null].filter(Boolean).join(" ") || null,
            projectId: project.id,
            planId,
            action: needsTag ? { kind: "manual_tag", planId } : null,
          });
          return { kind: "done", result: { published: true } };
        }
        case "scheduled_on_meta":
          if (plan.status !== "scheduled_on_meta") {
            await patchPlan(planId, { status: "scheduled_on_meta", fbScheduleStatus: "succeeded", fbProcessingStatus: "succeeded", lastError: null });
            await logActivity({ category: "publishing", level: "success", title: `Scheduled on Meta: ${project.title}`, detail: "Meta confirmed the scheduled Reel. Publication will be confirmed after the scheduled time.", projectId: project.id, planId });
          }
          return { kind: "reschedule", at: new Date(Math.max(Date.now() + 60_000, new Date(plan.scheduledAt).getTime() + 60_000)) };
        case "failed":
          await patchPlan(planId, {
            status: "failed",
            lastError: outcome.message,
            fbProcessingStatus: outcome.safeToStartOver ? "failed" : plan.fbProcessingStatus,
            fbPublishStatus: "failed",
          });
          await logActivity({
            category: "publishing",
            level: "error",
            title: `Facebook reported a failure: ${project.title}`,
            detail: outcome.message,
            projectId: project.id,
            planId,
            action: outcome.safeToStartOver ? { kind: "start_over", planId } : { kind: "open_plan", planId },
          });
          return { kind: "blocked", reason: outcome.message };
        case "needs_attention":
          await patchPlan(planId, { status: "uncertain", lastError: outcome.message });
          await logActivity({ category: "publishing", level: "error", title: `Needs your attention: ${project.title}`, detail: outcome.message, projectId: project.id, planId, action: { kind: "check_plan", planId } });
          return { kind: "blocked", reason: outcome.message };
        case "pending":
          return { kind: "reschedule", at: new Date(Date.now() + reconcileDelayMs(n)), note: "waiting for Facebook confirmation" };
      }
    }
  }
};
