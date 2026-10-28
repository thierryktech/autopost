import { and, asc, desc, eq, inArray, notInArray } from "drizzle-orm";
import { createHash } from "node:crypto";
import { getDb, type Db } from "../db/connect";
import {
  approvals,
  brandKit,
  clipEdits,
  footage,
  products,
  projects,
  publishPlans,
  renderVersions,
  type CreativeBrief,
  type EditSnapshot,
  type Project,
  type ProjectStage,
  type SubtitleCue,
} from "../db/schema";
import { newId } from "@/lib/ids";
import { approvalBlockers, contentHash, isApprovalValid } from "@/lib/domain/approval";
import { checkCopy } from "@/lib/domain/copy-guard";
import { logActivity } from "./activity";
import { enqueueJob } from "../jobs/queue";
import { ensurePublishJobsForProject } from "./plans";
import { ValidationError } from "./errors";
export { ValidationError };

export const DEFAULT_BRIEF: CreativeBrief = {
  purpose: "",
  targetDurationSec: 20,
  style: "calm",
  productId: null,
  music: { enabled: false, trackName: null, driveFileId: null, volume: 0.5 },
  notes: "",
};

export class ConflictError extends Error {
  constructor(public currentVersion: number) {
    super("This draft was changed on another device.");
  }
}

export async function listProjects(opts: { statuses?: Project["status"][] } = {}) {
  const db = await getDb();
  const rows = await db
    .select()
    .from(projects)
    .where(opts.statuses?.length ? inArray(projects.status, opts.statuses) : undefined)
    .orderBy(desc(projects.updatedAt));
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const [clips, renders, prods] = await Promise.all([
    db
      .select({ projectId: clipEdits.projectId, position: clipEdits.position, driveFileId: footage.driveFileId, inMs: clipEdits.inMs, outMs: clipEdits.outMs })
      .from(clipEdits)
      .innerJoin(footage, eq(clipEdits.footageId, footage.id))
      .where(inArray(clipEdits.projectId, ids))
      .orderBy(asc(clipEdits.position)),
    db.select().from(renderVersions).where(inArray(renderVersions.projectId, ids)),
    db.select({ id: products.id, name: products.name }).from(products),
  ]);
  return rows.map((p) => {
    const pc = clips.filter((c) => c.projectId === p.id);
    const render = renders.find((r) => r.id === p.currentRenderId) ?? null;
    return {
      ...p,
      thumbDriveFileId: pc[0]?.driveFileId ?? null,
      clipCount: pc.length,
      editDurationMs: pc.reduce((s, c) => s + (c.outMs - c.inMs), 0),
      render,
      productName: prods.find((x) => x.id === p.productId)?.name ?? null,
      approvalValid: isApprovalValid(p, { renderId: p.currentRenderId, captionTh: p.captionTh, productId: p.productId }),
    };
  });
}

export type ProjectListItem = Awaited<ReturnType<typeof listProjects>>[number];

export async function getProjectDetail(id: string) {
  const db = await getDb();
  const [project] = await db.select().from(projects).where(eq(projects.id, id));
  if (!project) return null;
  const [clips, renders, approvalRows, plans, kit] = await Promise.all([
    db
      .select({ clip: clipEdits, footage })
      .from(clipEdits)
      .innerJoin(footage, eq(clipEdits.footageId, footage.id))
      .where(eq(clipEdits.projectId, id))
      .orderBy(asc(clipEdits.position)),
    db.select().from(renderVersions).where(eq(renderVersions.projectId, id)).orderBy(desc(renderVersions.versionNo)),
    db.select().from(approvals).where(eq(approvals.projectId, id)).orderBy(desc(approvals.createdAt)),
    db.select().from(publishPlans).where(eq(publishPlans.projectId, id)).orderBy(asc(publishPlans.scheduledAt)),
    db.select().from(brandKit).limit(1),
  ]);
  const product = project.productId ? (await db.select().from(products).where(eq(products.id, project.productId)))[0] ?? null : null;
  const currentRender = renders.find((r) => r.id === project.currentRenderId) ?? null;
  const current = { renderId: project.currentRenderId, captionTh: project.captionTh, productId: project.productId };
  const blockers = approvalBlockers({ state: project, current, renderStatus: currentRender?.status ?? null });
  const brand = kit[0];
  const copyWarnings = checkCopy([project.captionTh, ...project.subtitles.map((s) => s.text)].join("\n"), {
    prohibitedClaims: brand?.prohibitedClaims ?? [],
    verifiedFacts: product?.verifiedFacts ?? [],
  });
  return {
    project,
    clips: clips.map((c) => ({ ...c.clip, footage: c.footage })),
    renders,
    currentRender,
    approvals: approvalRows,
    plans,
    product,
    approvalValid: isApprovalValid(project, current),
    blockers,
    copyWarnings,
    renderOutdated: currentRender ? currentRender.editHash !== editHashFor(await buildSnapshot(db, project)) : false,
  };
}

export type ProjectDetail = NonNullable<Awaited<ReturnType<typeof getProjectDetail>>>;

export async function createProject(input: { title?: string; footageIds?: string[] }) {
  const db = await getDb();
  const id = newId("prj");
  const now = new Date();
  const selected = input.footageIds?.length
    ? await db.select().from(footage).where(and(inArray(footage.id, input.footageIds), eq(footage.kind, "source")))
    : [];
  const ordered = (input.footageIds ?? []).map((fid) => selected.find((f) => f.id === fid)).filter(Boolean) as typeof selected;
  await db.transaction(async (tx) => {
    await tx.insert(projects).values({
      id,
      title: input.title?.trim() || `New Reel – ${now.toISOString().slice(0, 10)}`,
      stage: ordered.length ? "brief" : "footage",
      status: "draft",
      brief: DEFAULT_BRIEF,
    });
    if (ordered.length) {
      await tx.insert(clipEdits).values(
        ordered.map((f, i) => ({
          id: newId("clp"),
          projectId: id,
          footageId: f.id,
          position: i,
          inMs: 0,
          outMs: Math.min(f.durationMs ?? 5000, 6000),
        })),
      );
    }
  });
  await logActivity({ category: "editing", title: `Draft created: ${input.title?.trim() || "New Reel"}`, projectId: id });
  return id;
}

export interface DraftPatch {
  title?: string;
  stage?: ProjectStage;
  brief?: CreativeBrief;
  captionTh?: string;
  subtitles?: SubtitleCue[];
  productId?: string | null;
  clips?: { footageId: string; inMs: number; outMs: number }[];
}

/**
 * Saves a draft with optimistic concurrency. If the caption or product changes after approval,
 * the approval no longer matches and the draft returns to "needs review".
 */
export async function saveDraft(id: string, expectedVersion: number, patch: DraftPatch) {
  const db = await getDb();
  const result = await db.transaction(async (tx) => {
    const [p] = await tx.select().from(projects).where(eq(projects.id, id)).for("update");
    if (!p) throw new Error("Project not found");
    if (p.version !== expectedVersion) throw new ConflictError(p.version);
    const next: Partial<Project> = { version: p.version + 1, updatedAt: new Date() };
    if (patch.title !== undefined) next.title = patch.title.trim().slice(0, 120) || p.title;
    if (patch.stage !== undefined) next.stage = patch.stage;
    if (patch.brief !== undefined) {
      next.brief = patch.brief;
      next.productId = patch.brief.productId;
    }
    if (patch.productId !== undefined) {
      next.productId = patch.productId;
      next.brief = { ...(next.brief ?? p.brief), productId: patch.productId };
    }
    if (patch.captionTh !== undefined) next.captionTh = patch.captionTh.slice(0, 2200);
    if (patch.subtitles !== undefined) next.subtitles = sanitizeCues(patch.subtitles);
    if (patch.clips !== undefined) {
      const fids = patch.clips.map((c) => c.footageId);
      const known = fids.length ? await tx.select().from(footage).where(inArray(footage.id, fids)) : [];
      await tx.delete(clipEdits).where(eq(clipEdits.projectId, id));
      const rows = patch.clips
        .map((c, i) => {
          const f = known.find((k) => k.id === c.footageId);
          if (!f) return null;
          const dur = f.durationMs ?? Number.MAX_SAFE_INTEGER;
          const inMs = clamp(Math.round(c.inMs), 0, Math.max(0, dur - 200));
          const outMs = clamp(Math.round(c.outMs), inMs + 200, dur);
          return { id: newId("clp"), projectId: id, footageId: f.id, position: i, inMs, outMs };
        })
        .filter((r): r is NonNullable<typeof r> => !!r);
      if (rows.length) await tx.insert(clipEdits).values(rows);
    }
    const merged = { ...p, ...next } as Project;
    const wasValid = isApprovalValid(p, { renderId: p.currentRenderId, captionTh: p.captionTh, productId: p.productId });
    const stillValid = isApprovalValid(merged, { renderId: merged.currentRenderId, captionTh: merged.captionTh, productId: merged.productId });
    let invalidated = false;
    if (wasValid && !stillValid) {
      invalidated = true;
      next.status = "needs_review";
      next.approvedContentHash = null;
      next.approvedRenderId = null;
      await tx.insert(approvals).values({
        id: newId("apr"),
        projectId: id,
        renderId: p.currentRenderId,
        decision: "invalidated",
        contentHash: contentHash({ renderId: merged.currentRenderId, captionTh: merged.captionTh, productId: merged.productId }),
        note: "Caption or product changed after approval.",
      });
      await tx
        .update(publishPlans)
        .set({ status: "awaiting_approval", updatedAt: new Date() })
        .where(and(eq(publishPlans.projectId, id), inArray(publishPlans.status, ["planned"])));
    }
    await tx.update(projects).set(next).where(eq(projects.id, id));
    return { version: next.version!, invalidated, title: merged.title };
  });
  if (result.invalidated) {
    await logActivity({
      category: "approval",
      level: "warning",
      title: `Approval cleared: ${result.title}`,
      detail: "The caption or product changed after approval. Review and approve again before publishing.",
      projectId: id,
    });
  }
  return result;
}

function sanitizeCues(cues: SubtitleCue[]): SubtitleCue[] {
  return cues
    .map((c) => ({
      id: c.id || newId("sub"),
      startMs: Math.max(0, Math.round(c.startMs)),
      endMs: Math.max(Math.round(c.startMs) + 100, Math.round(c.endMs)),
      text: c.text.slice(0, 120),
    }))
    .sort((a, b) => a.startMs - b.startMs);
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export async function buildSnapshot(db: Db, project: Project): Promise<EditSnapshot> {
  const [clips, kit] = await Promise.all([
    db
      .select({ clip: clipEdits, footage })
      .from(clipEdits)
      .innerJoin(footage, eq(clipEdits.footageId, footage.id))
      .where(eq(clipEdits.projectId, project.id))
      .orderBy(asc(clipEdits.position)),
    db.select().from(brandKit).limit(1),
  ]);
  return {
    clips: clips.map((c) => ({
      footageId: c.footage.id,
      driveFileId: c.footage.driveFileId,
      name: c.footage.name,
      inMs: c.clip.inMs,
      outMs: c.clip.outMs,
    })),
    subtitles: project.subtitles,
    subtitleStyle: kit[0]!.subtitleStyle,
    music: project.brief.music,
    logoUrl: kit[0]?.logoUrl ?? null,
  };
}

export function editHashFor(s: EditSnapshot): string {
  return createHash("sha256").update(JSON.stringify(s)).digest("hex").slice(0, 24);
}


/** Queues a new render version. Re-rendering always clears any existing approval. */
export async function requestRender(id: string) {
  const db = await getDb();
  const out = await db.transaction(async (tx) => {
    const [p] = await tx.select().from(projects).where(eq(projects.id, id)).for("update");
    if (!p) throw new ValidationError("Project not found");
    const snapshot = await buildSnapshot(tx as unknown as Db, p);
    if (!snapshot.clips.length) throw new ValidationError("Add at least one clip before rendering.");
    const fids = snapshot.clips.map((c) => c.footageId);
    const unavailable = (await tx.select().from(footage).where(inArray(footage.id, fids))).filter((f) => f.availability !== "available");
    if (unavailable.length) {
      throw new ValidationError(`Some clips are unavailable in Drive: ${unavailable.map((f) => f.name).join(", ")}. Replace or remove them first.`);
    }
    const prev = await tx.select({ v: renderVersions.versionNo }).from(renderVersions).where(eq(renderVersions.projectId, id)).orderBy(desc(renderVersions.versionNo)).limit(1);
    const versionNo = (prev[0]?.v ?? 0) + 1;
    const renderId = newId("rnd");
    await tx
      .update(renderVersions)
      .set({ status: "superseded" })
      .where(and(eq(renderVersions.projectId, id), inArray(renderVersions.status, ["queued"])));
    await tx.insert(renderVersions).values({
      id: renderId,
      projectId: id,
      versionNo,
      status: "queued",
      editSnapshot: snapshot,
      editHash: editHashFor(snapshot),
    });
    const wasApproved = !!p.approvedContentHash;
    await tx
      .update(projects)
      .set({
        currentRenderId: renderId,
        status: "rendering",
        approvedRenderId: null,
        approvedContentHash: null,
        version: p.version + 1,
        updatedAt: new Date(),
      })
      .where(eq(projects.id, id));
    if (wasApproved) {
      await tx.insert(approvals).values({
        id: newId("apr"),
        projectId: id,
        renderId: p.currentRenderId,
        decision: "invalidated",
        contentHash: "re-render",
        note: `Re-rendered as v${versionNo}; approval must be given again.`,
      });
      await tx
        .update(publishPlans)
        .set({ status: "awaiting_approval", updatedAt: new Date() })
        .where(and(eq(publishPlans.projectId, id), inArray(publishPlans.status, ["planned"])));
    }
    return { renderId, versionNo, wasApproved, title: p.title, version: p.version + 1 };
  });
  await enqueueJob({ type: "render", payload: { renderId: out.renderId }, dedupeKey: `render:${out.renderId}`, maxAttempts: 2, projectId: id });
  await logActivity({ category: "rendering", title: `Render v${out.versionNo} queued: ${out.title}`, projectId: id });
  if (out.wasApproved) {
    await logActivity({
      category: "approval",
      level: "warning",
      title: `Approval cleared: ${out.title}`,
      detail: `A new render (v${out.versionNo}) replaces the approved video. Approve again before publishing.`,
      projectId: id,
    });
  }
  return out;
}

export async function requestClaudeDraft(id: string) {
  const db = await getDb();
  const [p] = await db.select().from(projects).where(eq(projects.id, id));
  if (!p) throw new ValidationError("Project not found");
  const n = await db.select({ id: clipEdits.id }).from(clipEdits).where(eq(clipEdits.projectId, id));
  if (!n.length) throw new ValidationError("Choose footage before asking for a draft.");
  const job = await enqueueJob({ type: "claude_draft", payload: { projectId: id }, dedupeKey: `claude:${id}`, maxAttempts: 2, projectId: id });
  await logActivity({ category: "editing", title: `Edit draft requested: ${p.title}`, projectId: id, jobId: job.id });
  return job.id;
}

export async function approveDraft(id: string, renderId: string) {
  const db = await getDb();
  const res = await db.transaction(async (tx) => {
    const [p] = await tx.select().from(projects).where(eq(projects.id, id)).for("update");
    if (!p) throw new ValidationError("Project not found");
    if (p.currentRenderId !== renderId) throw new ValidationError("A newer render exists. Review the latest version before approving.");
    const [r] = await tx.select().from(renderVersions).where(eq(renderVersions.id, renderId));
    if (r?.status !== "succeeded") throw new ValidationError("The render is not finished.");
    if (!p.captionTh.trim()) throw new ValidationError("Add a Thai caption before approving.");
    const hash = contentHash({ renderId, captionTh: p.captionTh, productId: p.productId });
    const approvalId = newId("apr");
    await tx.insert(approvals).values({ id: approvalId, projectId: id, renderId, decision: "approved", contentHash: hash });
    await tx
      .update(projects)
      .set({ status: "approved", approvedRenderId: renderId, approvedContentHash: hash, version: p.version + 1, updatedAt: new Date() })
      .where(eq(projects.id, id));
    await tx
      .update(publishPlans)
      .set({ status: "planned", updatedAt: new Date() })
      .where(and(eq(publishPlans.projectId, id), eq(publishPlans.status, "awaiting_approval")));
    return { title: p.title, versionNo: r.versionNo, version: p.version + 1 };
  });
  await logActivity({ category: "approval", level: "success", title: `Approved: ${res.title}`, detail: `Render v${res.versionNo}`, projectId: id });
  await ensurePublishJobsForProject(id);
  return res;
}

export async function requestChanges(id: string, note: string) {
  const db = await getDb();
  const res = await db.transaction(async (tx) => {
    const [p] = await tx.select().from(projects).where(eq(projects.id, id)).for("update");
    if (!p) throw new ValidationError("Project not found");
    await tx.insert(approvals).values({
      id: newId("apr"),
      projectId: id,
      renderId: p.currentRenderId,
      decision: "changes_requested",
      contentHash: contentHash({ renderId: p.currentRenderId, captionTh: p.captionTh, productId: p.productId }),
      note: note.trim().slice(0, 1000) || null,
    });
    await tx
      .update(projects)
      .set({ status: "changes_requested", approvedRenderId: null, approvedContentHash: null, version: p.version + 1, updatedAt: new Date() })
      .where(eq(projects.id, id));
    await tx
      .update(publishPlans)
      .set({ status: "awaiting_approval", updatedAt: new Date() })
      .where(and(eq(publishPlans.projectId, id), eq(publishPlans.status, "planned")));
    return { title: p.title, version: p.version + 1 };
  });
  await logActivity({ category: "approval", level: "warning", title: `Changes requested: ${res.title}`, detail: note || null, projectId: id });
  return res;
}

export async function deleteProject(id: string) {
  const db = await getDb();
  const live = await db
    .select({ id: publishPlans.id })
    .from(publishPlans)
    .where(and(eq(publishPlans.projectId, id), notInArray(publishPlans.status, ["planned", "awaiting_approval", "cancelled", "failed"])));
  if (live.length) throw new ValidationError("This Reel has a plan that was sent to Facebook. It can’t be deleted here.");
  await db.delete(projects).where(eq(projects.id, id));
}
