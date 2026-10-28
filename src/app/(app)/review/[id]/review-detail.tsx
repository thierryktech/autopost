"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { ArrowLeft, CheckCircle2, MessageSquareWarning, PenLine, Package, AlertTriangle, CircleCheck, CircleAlert, History, CalendarPlus, Tag, ExternalLink } from "lucide-react";
import type { NativeTagInfo, SubtitleCue } from "@/server/db/schema";
import { RenderPlayer } from "@/components/editor/player";
import { Button, ButtonLink } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/field";
import { Notice, ProgressBar } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { ProjectStatusBadge, PlanStatusBadge, RENDER_STATUS } from "@/components/status";
import { approveAction, requestChangesAction, saveDraftAction } from "@/app/actions";
import { formatInTz, formatDuration } from "@/lib/time";
import { CAPTION_MAX } from "@/lib/domain/copy-guard";
import type { ProjectStatus, PlanStatus, RenderStatus } from "@/server/db/schema";
import { cn } from "@/lib/cn";

interface Props {
  timezone: string;
  project: { id: string; title: string; status: ProjectStatus; captionTh: string; subtitles: SubtitleCue[]; version: number; currentRenderId: string | null };
  renders: { id: string; versionNo: number; status: RenderStatus; progress: number; outputDriveFileId: string | null; isSimulated: boolean; createdAt: string; durationMs: number | null; error: string | null }[];
  approvals: { id: string; decision: string; note: string | null; renderId: string | null; createdAt: string }[];
  product: { id: string; name: string; nameTh: string | null; type: "own" | "affiliate"; imageUrl: string | null; destinationUrl: string | null; nativeTag: NativeTagInfo; verifiedFacts: string[] } | null;
  plans: { id: string; status: PlanStatus; scheduledAt: string; isSimulated: boolean }[];
  approvalValid: boolean;
  blockers: string[];
  copyWarnings: string[];
  renderOutdated: boolean;
}

export const TAG_LABEL: Record<NativeTagInfo["eligibility"], { label: string; tone: "neutral" | "success" | "warning" | "danger" }> = {
  unknown: { label: "Tagging not verified", tone: "warning" },
  eligible: { label: "Eligible for native tag", tone: "success" },
  not_eligible: { label: "Not eligible for native tag", tone: "danger" },
  not_supported: { label: "Native tag not supported", tone: "neutral" },
};

export function ReviewDetail(p: Props) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const current = p.renders.find((r) => r.id === p.project.currentRenderId) ?? null;
  const [viewId, setViewId] = useState(current?.id ?? p.renders[0]?.id ?? null);
  const viewing = p.renders.find((r) => r.id === viewId) ?? null;
  const [caption, setCaption] = useState(p.project.captionTh);
  const [editing, setEditing] = useState(false);
  const [version, setVersion] = useState(p.project.version);
  const [changesOpen, setChangesOpen] = useState(false);
  const [note, setNote] = useState("");

  useEffect(() => {
    if (!editing) {
      setCaption(p.project.captionTh);
      setVersion(p.project.version);
    }
  }, [p.project.captionTh, p.project.version, editing]);

  const captionChanged = caption !== p.project.captionTh;
  const canApprove = current?.status === "succeeded" && !!caption.trim() && !captionChanged;

  const saveCaption = () =>
    start(async () => {
      const r = await saveDraftAction(p.project.id, version, { captionTh: caption });
      if (r.ok) {
        setVersion(r.data!.version);
        setEditing(false);
        toast({ tone: r.data!.invalidated ? "info" : "success", message: r.data!.invalidated ? "Caption saved. The previous approval no longer applies — approve again." : "Caption saved" });
        router.refresh();
      } else toast({ tone: "error", message: r.conflict ? "This draft changed on another device. Reload to see the latest." : r.error });
    });

  return (
    <div className="pb-28">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Link href="/review" className="inline-flex min-h-11 items-center gap-1.5 rounded-xl px-2 text-sm font-semibold text-ink-600 hover:bg-white">
          <ArrowLeft className="size-4" aria-hidden /> Back to queue
        </Link>
      </div>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight text-ink-900">{p.project.title}</h1>
        <ProjectStatusBadge status={p.project.status} />
        {p.approvalValid && <Badge tone="success" icon={<CheckCircle2 />}>Approved for this version</Badge>}
        <ButtonLink href={`/create/${p.project.id}`} variant="ghost" className="ml-auto" icon={<PenLine className="size-4" />}>Open in editor</ButtonLink>
      </div>

      <div className="grid gap-5 md:grid-cols-[minmax(220px,300px)_minmax(0,1fr)] xl:grid-cols-[minmax(280px,380px)_minmax(0,1fr)]">
        <div className="mx-auto w-full max-w-[360px] min-w-0 space-y-3 md:sticky md:top-4 md:self-start">
          {viewing && (viewing.status === "queued" || viewing.status === "rendering") ? (
            <div className="flex aspect-[9/16] w-full flex-col items-center justify-center gap-3 rounded-[22px] bg-teal-950 p-8 text-center text-teal-100">
              <p className="font-semibold">Rendering v{viewing.versionNo}…</p>
              <ProgressBar value={viewing.status === "queued" ? 3 : viewing.progress} label="Render progress" />
              <p className="text-xs text-teal-300">This page updates automatically.</p>
            </div>
          ) : (
            <RenderPlayer driveFileId={viewing?.outputDriveFileId ?? null} simulated={viewing?.isSimulated} />
          )}
          {viewing?.status === "failed" && <Notice tone="danger" title="Render failed">{viewing.error}</Notice>}
          {p.renders.length > 0 && (
            <div className="rounded-2xl border border-line bg-white p-3 shadow-[var(--shadow-card)]">
              <p className="mb-2 flex items-center gap-1.5 px-1 text-xs font-semibold text-ink-600"><History className="size-3.5" aria-hidden />Render versions</p>
              <ul className="space-y-1">
                {p.renders.map((r) => (
                  <li key={r.id}>
                    <button type="button" onClick={() => setViewId(r.id)} aria-pressed={viewId === r.id} className={cn("flex min-h-11 w-full items-center gap-2 rounded-xl px-2 text-left text-sm", viewId === r.id ? "bg-teal-50" : "hover:bg-teal-50")}>
                      <span className="font-semibold">v{r.versionNo}</span>
                      <Badge tone={RENDER_STATUS[r.status].tone}>{RENDER_STATUS[r.status].label}</Badge>
                      {r.id === p.project.currentRenderId && <Badge tone="teal">Current</Badge>}
                      {r.isSimulated && <Badge tone="demo">Demo</Badge>}
                      <span className="ml-auto text-xs tabular-nums text-ink-500">{formatInTz(r.createdAt, p.timezone, "d MMM HH:mm")}{r.durationMs ? ` · ${formatDuration(r.durationMs)}` : ""}</span>
                    </button>
                  </li>
                ))}
              </ul>
              {p.renderOutdated && <p className="mt-2 px-1 text-xs text-warning-700">The edit changed after the current render. Re-render from the editor to review the latest edit.</p>}
            </div>
          )}
        </div>

        <div className="min-w-0 space-y-4">
          <section aria-labelledby="cap" className="rounded-[var(--radius-card)] border border-line bg-white p-5 shadow-[var(--shadow-card)]">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h2 id="cap" className="text-[15px] font-semibold text-ink-900">Thai caption</h2>
              {!editing ? (
                <Button variant="ghost" size="icon" aria-label="Edit caption" onClick={() => setEditing(true)}><PenLine className="size-4" /></Button>
              ) : (
                <span className={cn("text-xs tabular-nums", caption.length > CAPTION_MAX ? "text-danger-700" : "text-ink-500")}>{caption.length}/{CAPTION_MAX}</span>
              )}
            </div>
            {editing ? (
              <>
                <label htmlFor="cap-edit" className="sr-only">Thai caption</label>
                <Textarea id="cap-edit" lang="th" rows={7} value={caption} onChange={(e) => setCaption(e.target.value)} className="font-thai text-[16px]" />
                {p.approvalValid && captionChanged && <p className="mt-2 text-xs text-warning-700">Saving a changed caption clears the current approval.</p>}
                <div className="mt-3 flex justify-end gap-2">
                  <Button variant="ghost" onClick={() => { setCaption(p.project.captionTh); setEditing(false); }}>Cancel</Button>
                  <Button variant="primary" loading={pending} disabled={!captionChanged} onClick={saveCaption}>Save caption</Button>
                </div>
              </>
            ) : (
              <p lang="th" className="font-thai whitespace-pre-line rounded-2xl bg-cream p-4 text-[15px] text-ink-900">{p.project.captionTh || <span className="text-ink-400">No caption yet.</span>}</p>
            )}
            {p.copyWarnings.length > 0 && (
              <Notice tone="warning" className="mt-3" icon={<AlertTriangle />} title="Check against verified facts">
                <ul className="list-disc pl-4">{p.copyWarnings.map((w, i) => <li key={i} lang="th">{w}</li>)}</ul>
              </Notice>
            )}
          </section>

          <section aria-labelledby="subs" className="rounded-[var(--radius-card)] border border-line bg-white p-5 shadow-[var(--shadow-card)]">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h2 id="subs" className="text-[15px] font-semibold text-ink-900">Subtitles ({p.project.subtitles.length})</h2>
              <ButtonLink href={`/create/${p.project.id}`} variant="ghost" icon={<PenLine className="size-4" />}>Edit</ButtonLink>
            </div>
            {p.project.subtitles.length ? (
              <ol className="space-y-1.5">
                {p.project.subtitles.map((s) => (
                  <li key={s.id} className="flex gap-3 text-sm">
                    <span className="w-24 shrink-0 tabular-nums text-ink-500">{(s.startMs / 1000).toFixed(1)}–{(s.endMs / 1000).toFixed(1)}s</span>
                    <span lang="th" className="font-thai text-ink-900">{s.text}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-sm text-ink-500">No subtitles.</p>
            )}
            <p className="mt-2 text-xs text-ink-500">Subtitles are burned into the video, so changes need a new render (and a new approval).</p>
          </section>

          <section aria-labelledby="prod" className="rounded-[var(--radius-card)] border border-line bg-white p-5 shadow-[var(--shadow-card)]">
            <h2 id="prod" className="mb-3 text-[15px] font-semibold text-ink-900">Product reference</h2>
            {p.product ? (
              <div className="flex gap-3">
                <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-peach-100 text-peach-700">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {p.product.imageUrl ? <img src={p.product.imageUrl} alt="" className="size-full object-cover" /> : <Package className="size-6" aria-hidden />}
                </div>
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="font-semibold text-ink-900">{p.product.name} <Badge tone={p.product.type === "own" ? "teal" : "peach"}>{p.product.type === "own" ? "Balena product" : "Affiliate"}</Badge></p>
                  {p.product.nameTh && <p lang="th" className="font-thai text-sm text-ink-600">{p.product.nameTh}</p>}
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    <Badge tone={TAG_LABEL[p.product.nativeTag.eligibility].tone} icon={<Tag />}>{TAG_LABEL[p.product.nativeTag.eligibility].label}</Badge>
                    {p.product.destinationUrl ? <Badge tone="neutral" icon={<ExternalLink />}>Link added to caption</Badge> : <Badge tone="neutral">No link</Badge>}
                  </div>
                  {p.product.destinationUrl && <p className="truncate pt-1 text-xs text-ink-500">Link appended when publishing: {p.product.destinationUrl}</p>}
                  <p className="text-xs text-ink-500">Native product tags can’t be added through the Reels publishing API. You’ll get a manual tagging checklist after publication.</p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-ink-500">No product featured.</p>
            )}
          </section>

          <section aria-labelledby="status" className="rounded-[var(--radius-card)] border border-line bg-white p-5 shadow-[var(--shadow-card)]">
            <h2 id="status" className="mb-3 text-[15px] font-semibold text-ink-900">Approval & publishing</h2>
            {p.approvalValid ? (
              <p className="flex items-center gap-2 text-sm text-success-700"><CircleCheck className="size-4" aria-hidden />Approved for render v{current?.versionNo} and this caption.</p>
            ) : (
              <ul className="space-y-1">{p.blockers.map((b) => <li key={b} className="flex items-start gap-2 text-sm text-ink-700"><CircleAlert className="mt-0.5 size-4 shrink-0 text-warning-700" aria-hidden />{b}</li>)}</ul>
            )}
            {p.plans.length > 0 && (
              <ul className="mt-3 space-y-1.5 border-t border-line pt-3">
                {p.plans.map((pl) => (
                  <li key={pl.id} className="flex flex-wrap items-center gap-2 text-sm">
                    <Link href={`/calendar?plan=${pl.id}`} className="font-medium text-teal-700 hover:underline">{formatInTz(pl.scheduledAt, p.timezone, "EEE d MMM, HH:mm")}</Link>
                    <PlanStatusBadge status={pl.status} simulated={pl.isSimulated} />
                  </li>
                ))}
              </ul>
            )}
            {p.approvals.length > 0 && (
              <details className="mt-3 border-t border-line pt-3">
                <summary className="min-h-11 cursor-pointer py-2 text-sm font-semibold text-ink-700">Approval history ({p.approvals.length})</summary>
                <ul className="space-y-2 pt-1">
                  {p.approvals.map((a) => (
                    <li key={a.id} className="text-sm">
                      <span className="font-semibold">{a.decision === "approved" ? "Approved" : a.decision === "changes_requested" ? "Changes requested" : "Approval cleared"}</span>
                      <span className="text-ink-500"> · {formatInTz(a.createdAt, p.timezone, "d MMM HH:mm")}</span>
                      {a.note && <p lang="th" className="font-thai text-ink-600">{a.note}</p>}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </section>
        </div>
      </div>

      {/* Sticky approval bar — always within thumb reach on iPad */}
      <div className="fixed inset-x-0 bottom-0 z-40 px-3 pb-3 safe-pb md:left-[100px] lg:left-[244px]">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center gap-2 rounded-2xl border border-line bg-white/95 px-4 py-3 shadow-[var(--shadow-raised)] backdrop-blur">
          <p className="mr-auto min-w-0 text-sm text-ink-600">
            {captionChanged ? "Save the caption before approving." : !current ? "Render the draft before approving." : current.status !== "succeeded" ? "Waiting for the render to finish." : p.approvalValid ? "Approved. Plan it on the calendar." : `Reviewing render v${current.versionNo}`}
          </p>
          {p.approvalValid ? (
            <ButtonLink href={`/calendar?new=${p.project.id}`} variant="primary" size="lg" icon={<CalendarPlus className="size-5" />}>Plan publishing</ButtonLink>
          ) : (
            <>
              <Button variant="peach" size="lg" icon={<MessageSquareWarning className="size-5" />} onClick={() => setChangesOpen(true)} disabled={!current}>Request changes</Button>
              <Button
                variant="primary"
                size="lg"
                loading={pending}
                disabled={!canApprove}
                icon={<CheckCircle2 className="size-5" />}
                onClick={() =>
                  start(async () => {
                    const r = await approveAction(p.project.id, current!.id);
                    if (r.ok) {
                      toast({ tone: "success", message: "Approved. You can now plan publishing." });
                      router.refresh();
                    } else toast({ tone: "error", message: r.error });
                  })
                }
              >
                Approve draft
              </Button>
            </>
          )}
        </div>
      </div>

      <Dialog
        open={changesOpen}
        onOpenChange={setChangesOpen}
        title="Request changes"
        description="Describe what should change. The draft returns to editing."
        footer={
          <>
            <Button variant="ghost" onClick={() => setChangesOpen(false)}>Cancel</Button>
            <Button
              variant="primary"
              loading={pending}
              onClick={() =>
                start(async () => {
                  const r = await requestChangesAction(p.project.id, note);
                  if (r.ok) {
                    setChangesOpen(false);
                    setNote("");
                    toast({ tone: "success", message: "Changes requested" });
                    router.refresh();
                  } else toast({ tone: "error", message: r.error });
                })
              }
            >
              Send
            </Button>
          </>
        }
      >
        <label htmlFor="changes-note" className="mb-1.5 block text-sm font-semibold text-ink-700">What should change?</label>
        <Textarea id="changes-note" lang="th" rows={4} value={note} onChange={(e) => setNote(e.target.value)} className="font-thai" placeholder="เช่น ตัดช็อตแรกให้สั้นลง" autoFocus />
      </Dialog>
    </div>
  );
}
