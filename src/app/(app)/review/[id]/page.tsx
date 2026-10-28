import { notFound } from "next/navigation";
import { getProjectDetail } from "@/server/services/projects";
import { getSettings } from "@/server/services/overview";
import { ReviewDetail } from "./review-detail";
import { BLOCKER_LABEL } from "@/lib/domain/approval-labels";

export const metadata = { title: "Review" };

export default async function ReviewDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [d, s] = await Promise.all([getProjectDetail(id), getSettings()]);
  if (!d) notFound();
  return (
    <ReviewDetail
      timezone={s?.timezone ?? "Asia/Bangkok"}
      project={{ id: d.project.id, title: d.project.title, status: d.project.status, captionTh: d.project.captionTh, subtitles: d.project.subtitles, version: d.project.version, currentRenderId: d.project.currentRenderId }}
      renders={d.renders.map((r) => ({ id: r.id, versionNo: r.versionNo, status: r.status, progress: r.progress, outputDriveFileId: r.outputDriveFileId, isSimulated: r.isSimulated, createdAt: r.createdAt.toISOString(), durationMs: r.durationMs, error: r.error }))}
      approvals={d.approvals.map((a) => ({ id: a.id, decision: a.decision, note: a.note, renderId: a.renderId, createdAt: a.createdAt.toISOString() }))}
      product={d.product ? { id: d.product.id, name: d.product.name, nameTh: d.product.nameTh, type: d.product.type, imageUrl: d.product.imageUrl, destinationUrl: d.product.destinationUrl, nativeTag: d.product.nativeTag, verifiedFacts: d.product.verifiedFacts } : null}
      plans={d.plans.map((p) => ({ id: p.id, status: p.status, scheduledAt: p.scheduledAt.toISOString(), isSimulated: p.isSimulated }))}
      approvalValid={d.approvalValid}
      blockers={d.blockers.map((b) => BLOCKER_LABEL[b])}
      copyWarnings={d.copyWarnings.map((w) => w.message)}
      renderOutdated={d.renderOutdated}
    />
  );
}
