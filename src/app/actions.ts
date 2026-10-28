"use server";
/*
 * Server actions: the only write path from the browser. Every action authenticates, validates its
 * input with zod and calls a service. Secrets never leave the server.
 */
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { requireUser } from "@/server/auth";
import { getDb } from "@/server/db/connect";
import { brandKit, products, settings, footage } from "@/server/db/schema";
import * as projects from "@/server/services/projects";
import * as plans from "@/server/services/plans";
import { ValidationError } from "@/server/services/errors";
import { retryJob, enqueueJob } from "@/server/jobs/queue";
import { resolveActivity, logActivity } from "@/server/services/activity";
import { upsertFootageFromDrive } from "@/server/jobs/handlers/drive-sync";
import { driveAdapter } from "@/server/adapters";
import { AdapterError } from "@/server/adapters/types";
import { upsertConnection, readTokens } from "@/server/connections";
import { newId } from "@/lib/ids";

export type ActionResult<T = undefined> = { ok: true; data?: T } | { ok: false; error: string; conflict?: { currentVersion: number } };

async function run<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    await requireUser();
    const data = await fn();
    revalidatePath("/", "layout");
    return { ok: true, data };
  } catch (e) {
    if (e instanceof projects.ConflictError) return { ok: false, error: e.message, conflict: { currentVersion: e.currentVersion } };
    if (e instanceof ValidationError || e instanceof z.ZodError || e instanceof AdapterError) {
      return { ok: false, error: e instanceof z.ZodError ? e.issues.map((i) => i.message).join("; ") : e.message };
    }
    console.error(e);
    return { ok: false, error: (e as Error).message === "Not signed in" ? "Your session expired. Please sign in again." : "Something went wrong. Please try again." };
  }
}

const id = z.string().min(1).max(80);
const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date");
const timeStr = z.string().regex(/^\d{2}:\d{2}$/, "Invalid time");

// ---------- Projects / editor ----------
export async function createReelAction(input: { title?: string; footageIds?: string[] }) {
  const res = await run(() => projects.createProject({ title: input.title, footageIds: z.array(id).max(30).optional().parse(input.footageIds) }));
  if (res.ok && res.data) redirect(`/create/${res.data}`);
  return res;
}

const cue = z.object({ id: z.string().max(40), startMs: z.number().min(0), endMs: z.number().min(0), text: z.string().max(200) });
const briefSchema = z.object({
  purpose: z.string().max(500),
  targetDurationSec: z.number().int().min(5).max(90),
  style: z.enum(["calm", "energetic", "cinematic", "tutorial", "behind_the_scenes"]),
  productId: z.string().max(80).nullable(),
  music: z.object({ enabled: z.boolean(), trackName: z.string().max(200).nullable(), driveFileId: z.string().max(200).nullable(), volume: z.number().min(0).max(1) }),
  notes: z.string().max(2000),
});
const patchSchema = z.object({
  title: z.string().max(120).optional(),
  stage: z.enum(["footage", "brief", "copy", "review"]).optional(),
  brief: briefSchema.optional(),
  captionTh: z.string().max(2200).optional(),
  subtitles: z.array(cue).max(60).optional(),
  productId: z.string().max(80).nullable().optional(),
  clips: z.array(z.object({ footageId: id, inMs: z.number().min(0), outMs: z.number().min(0) })).max(30).optional(),
});

export async function saveDraftAction(projectId: string, expectedVersion: number, patch: projects.DraftPatch) {
  return run(() => projects.saveDraft(id.parse(projectId), z.number().int().parse(expectedVersion), patchSchema.parse(patch)));
}

export async function requestRenderAction(projectId: string) {
  return run(() => projects.requestRender(id.parse(projectId)));
}

export async function requestDraftAction(projectId: string) {
  return run(() => projects.requestClaudeDraft(id.parse(projectId)));
}

export async function approveAction(projectId: string, renderId: string) {
  return run(() => projects.approveDraft(id.parse(projectId), id.parse(renderId)));
}

export async function requestChangesAction(projectId: string, note: string) {
  return run(() => projects.requestChanges(id.parse(projectId), z.string().max(1000).parse(note)));
}

export async function deleteProjectAction(projectId: string) {
  const res = await run(() => projects.deleteProject(id.parse(projectId)));
  if (res.ok) redirect("/review");
  return res;
}

// ---------- Plans ----------
const planInput = z.object({
  date: dateStr,
  time: timeStr,
  timezone: z.string().max(60).optional(),
  mode: z.enum(["balena_publisher", "meta_scheduled"]).optional(),
});

export async function createPlanAction(projectId: string, input: z.infer<typeof planInput>) {
  return run(() => plans.createPlan({ projectId: id.parse(projectId), ...planInput.parse(input) }));
}
export async function updatePlanAction(planId: string, input: z.infer<typeof planInput>) {
  return run(() => plans.updatePlan(id.parse(planId), planInput.parse(input)));
}
export async function cancelPlanAction(planId: string, confirmedRemovedOnMeta = false) {
  return run(() => plans.cancelPlan(id.parse(planId), { confirmedRemovedOnMeta }));
}
export async function checkPlanAction(planId: string) {
  return run(() => plans.checkPlanNow(id.parse(planId)));
}
export async function retryFinishAction(planId: string) {
  return run(() => plans.retryFinish(id.parse(planId)));
}
export async function startOverAction(planId: string) {
  return run(() => plans.startOver(id.parse(planId)));
}
export async function markTagDoneAction(planId: string) {
  return run(() => plans.markManualTagDone(id.parse(planId)));
}

// ---------- Activity / jobs ----------
export async function retryJobAction(jobId: string, eventId?: string) {
  return run(async () => {
    await retryJob(id.parse(jobId));
    if (eventId) await resolveActivity(id.parse(eventId));
  });
}
export async function resolveEventAction(eventId: string) {
  return run(() => resolveActivity(id.parse(eventId)));
}

// ---------- Library ----------
export async function importFootageAction(driveFileIds: string[]) {
  return run(async () => {
    const ids = z.array(z.string().min(1).max(200)).min(1).max(50).parse(driveFileIds);
    const drive = driveAdapter();
    const items = [];
    for (const fid of ids) items.push(await drive.getFile(fid));
    const footageIds = await upsertFootageFromDrive(items);
    await logActivity({ category: "drive", level: "success", title: `Imported ${footageIds.length} clip(s) from Drive` });
    return footageIds;
  });
}

export async function createReelFromDriveAction(driveFileIds: string[]) {
  const imported = await importFootageAction(driveFileIds);
  if (!imported.ok) return imported;
  return createReelAction({ footageIds: imported.data });
}

export async function syncDriveAction() {
  return run(async () => {
    await enqueueJob({ type: "drive_sync", payload: {}, dedupeKey: `drive_sync:manual:${Date.now()}` });
  });
}

export async function setFolderAction(kind: "source" | "output", folderId: string, folderName: string) {
  return run(async () => {
    const db = await getDb();
    const fid = z.string().min(1).max(200).parse(folderId);
    const name = z.string().max(200).parse(folderName);
    await db
      .update(settings)
      .set(kind === "source" ? { sourceFolderId: fid, sourceFolderName: name, updatedAt: new Date() } : { outputFolderId: fid, outputFolderName: name, updatedAt: new Date() })
      .where(eq(settings.id, "default"));
    await logActivity({ category: "drive", title: `${kind === "source" ? "Source" : "Output"} folder set to “${name}”` });
    if (kind === "source") await enqueueJob({ type: "drive_sync", payload: {}, dedupeKey: `drive_sync:manual:${Date.now()}` });
  });
}

export async function removeUnavailableFootageAction(footageId: string) {
  return run(async () => {
    const db = await getDb();
    await db.update(footage).set({ availability: "unavailable" }).where(eq(footage.id, id.parse(footageId)));
  });
}

// ---------- Products ----------
const productSchema = z.object({
  name: z.string().min(1, "Name is required").max(120),
  nameTh: z.string().max(200).nullable(),
  type: z.enum(["own", "affiliate"]),
  imageUrl: z
    .string()
    .max(400_000)
    .nullable()
    .refine((v) => !v || /^(https:\/\/|data:image\/(png|jpeg|webp);base64,)/.test(v), "Image must be an https URL or an uploaded image"),
  verifiedFacts: z.array(z.string().min(1).max(300)).max(30),
  destinationUrl: z
    .string()
    .max(1000)
    .nullable()
    .refine((v) => !v || /^https:\/\//.test(v), "Link must start with https://"),
  nativeTag: z.object({
    eligibility: z.enum(["unknown", "eligible", "not_eligible", "not_supported"]),
    catalogProductId: z.string().max(100).nullable(),
    checkedAt: z.string().nullable(),
    note: z.string().max(500).nullable(),
  }),
});

export async function saveProductAction(productId: string | null, input: z.infer<typeof productSchema>) {
  return run(async () => {
    const db = await getDb();
    const v = productSchema.parse(input);
    if (productId) {
      await db.update(products).set({ ...v, updatedAt: new Date() }).where(eq(products.id, id.parse(productId)));
      return productId;
    }
    const pid = newId("prd");
    await db.insert(products).values({ id: pid, ...v });
    return pid;
  });
}

export async function archiveProductAction(productId: string, archived: boolean) {
  return run(async () => {
    const db = await getDb();
    await db.update(products).set({ archived, updatedAt: new Date() }).where(eq(products.id, id.parse(productId)));
  });
}

// ---------- Brand kit ----------
const brandSchema = z.object({
  brandName: z.string().min(1).max(60),
  logoUrl: z
    .string()
    .max(400_000)
    .nullable()
    .refine((v) => !v || /^data:image\/(png|jpeg);base64,/.test(v), "Logo must be a PNG or JPEG upload"),
  colors: z.array(z.object({ name: z.string().max(40), hex: z.string().regex(/^#[0-9a-fA-F]{6}$/) })).max(10),
  headingFont: z.string().max(60),
  bodyFont: z.string().max(60),
  subtitleStyle: z.object({
    fontFamily: z.enum(["Prompt", "Prompt Medium", "Noto Sans Thai"]),
    fontSizePx: z.number().int().min(36).max(120),
    textColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    outlineColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    boxColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable(),
    position: z.enum(["bottom", "middle"]),
  }),
  toneOfVoice: z.string().max(2000),
  defaultCtas: z.array(z.string().min(1).max(200)).max(10),
  prohibitedClaims: z.array(z.string().min(1).max(200)).max(50),
});

export async function saveBrandKitAction(input: z.infer<typeof brandSchema>) {
  return run(async () => {
    const db = await getDb();
    await db.update(brandKit).set({ ...brandSchema.parse(input), updatedAt: new Date() }).where(eq(brandKit.id, "default"));
  });
}

// ---------- Settings ----------
const settingsSchema = z.object({
  timezone: z.string().min(1).max(60).refine((tz) => {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  }, "Unknown timezone"),
  defaultPublishTime: timeStr,
  defaultPublishMode: z.enum(["balena_publisher", "meta_scheduled"]),
  notifications: z.object({ renderFinished: z.boolean(), needsReview: z.boolean(), publishConfirmed: z.boolean(), failures: z.boolean() }),
});

export async function saveSettingsAction(input: z.infer<typeof settingsSchema>) {
  return run(async () => {
    const db = await getDb();
    await db.update(settings).set({ ...settingsSchema.parse(input), updatedAt: new Date() }).where(eq(settings.id, "default"));
  });
}

export async function setCalendarViewAction(view: "week" | "month" | "agenda") {
  return run(async () => {
    const db = await getDb();
    await db.update(settings).set({ calendarView: z.enum(["week", "month", "agenda"]).parse(view) }).where(eq(settings.id, "default"));
  });
}

export async function completeOnboardingAction() {
  return run(async () => {
    const db = await getDb();
    await db.update(settings).set({ onboardingCompletedAt: new Date() }).where(eq(settings.id, "default"));
  });
}

export async function disconnectAction(provider: "google_drive" | "facebook") {
  return run(async () => {
    await upsertConnection(z.enum(["google_drive", "facebook"]).parse(provider), {
      status: "disconnected",
      tokens: null,
      accountLabel: null,
      externalId: null,
      lastError: null,
    });
    await logActivity({ category: "connection", title: `${provider === "facebook" ? "Facebook Page" : "Google Drive"} disconnected` });
  });
}

export async function selectFacebookPageAction(pageId: string) {
  return run(async () => {
    const tokens = await readTokens("facebook");
    const page = tokens?.pages?.find((p) => p.id === z.string().max(40).parse(pageId));
    if (!tokens || !page) throw new ValidationError("That Page isn’t available. Reconnect Facebook.");
    await upsertConnection("facebook", { externalId: page.id, accountLabel: page.name, tokens: { ...tokens, pageAccessToken: page.token } });
    await logActivity({ category: "connection", title: `Publishing Page set to ${page.name}` });
  });
}

export async function resetDemoDataAction() {
  return run(async () => {
    const { env } = await import("@/server/env");
    if (env.facebookMode === "live" || env.driveMode === "live") throw new ValidationError("Reset is only available when every integration runs in demo mode.");
    const { resetDemoData } = await import("@/server/seed");
    await resetDemoData(await getDb());
  });
}
