import { notFound } from "next/navigation";
import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/server/db/connect";
import { brandKit, footage, jobs, products } from "@/server/db/schema";
import { getProjectDetail } from "@/server/services/projects";
import { DEMO_CATALOG } from "@/server/adapters/drive/demo-catalog";
import { env } from "@/server/env";
import { Editor } from "@/components/editor/editor";
import type { EditorDraft } from "@/components/editor/types";

export const metadata = { title: "Edit Reel" };

export default async function EditReelPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = await getProjectDetail(id);
  if (!detail) notFound();
  const db = await getDb();
  const [library, productRows, [kit], draftJobs] = await Promise.all([
    db.select().from(footage).where(eq(footage.kind, "source")),
    db.select().from(products),
    db.select().from(brandKit).limit(1),
    db.select().from(jobs).where(and(eq(jobs.dedupeKey, `claude:${id}`), inArray(jobs.status, ["queued", "running"]))),
  ]);
  const p = detail.project;
  const serverDraft: EditorDraft = {
    title: p.title,
    stage: p.stage,
    brief: p.brief,
    captionTh: p.captionTh,
    subtitles: p.subtitles,
    productId: p.productId,
    clips: detail.clips.map((c) => ({
      key: c.id,
      footageId: c.footageId,
      driveFileId: c.footage.driveFileId,
      name: c.footage.name,
      durationMs: c.footage.durationMs ?? Math.max(c.outMs, 5000),
      width: c.footage.width,
      height: c.footage.height,
      available: c.footage.availability === "available",
      inMs: c.inMs,
      outMs: c.outMs,
    })),
  };
  const musicOptions = env.driveMode === "demo" ? DEMO_CATALOG.filter((n) => n.kind === "audio").map((n) => ({ id: n.id, name: `${n.name} (demo)` })) : [];
  const r = detail.currentRender;
  return (
    <Editor
      key={p.id}
      projectId={p.id}
      serverVersion={p.version}
      serverDraft={serverDraft}
      status={p.status}
      library={library.map((f) => ({ id: f.id, driveFileId: f.driveFileId, name: f.name, durationMs: f.durationMs, width: f.width, height: f.height, available: f.availability === "available" }))}
      products={productRows}
      musicOptions={musicOptions}
      subtitleStyle={kit.subtitleStyle}
      prohibitedClaims={kit.prohibitedClaims}
      defaultCtas={kit.defaultCtas}
      currentRender={r ? { id: r.id, versionNo: r.versionNo, status: r.status, progress: r.progress, error: r.error, isSimulated: r.isSimulated, outputDriveFileId: r.outputDriveFileId } : null}
      renderOutdated={detail.renderOutdated}
      blockers={detail.blockers}
      approvalValid={detail.approvalValid}
      wasApproved={detail.approvalValid}
      draftPending={draftJobs.length > 0}
      draftNote={p.claudeDraftNote}
      claudeLive={env.claudeMode === "live"}
    />
  );
}
