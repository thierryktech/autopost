"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { ArrowLeft, ChevronRight, Check, CloudOff, Loader2, CircleAlert, Cloud } from "lucide-react";
import type { Product, ProjectStage, SubtitleStyle } from "@/server/db/schema";
import { Button } from "../ui/button";
import { Notice } from "../ui/misc";
import { useToast } from "../ui/toast";
import { EditPreview, RenderPlayer, type PlayerHandle } from "./player";
import { Timeline } from "./timeline";
import { ClipBin, ClipInspector, BriefPanel, CopyPanel, ReviewPanel } from "./panels";
import { ClipPicker } from "./clip-picker";
import { useAutosave, type SaveState } from "./use-autosave";
import { editDuration, segments, type EditorDraft, type LibraryClip } from "./types";
import { requestDraftAction, requestRenderAction } from "@/app/actions";
import { BLOCKER_LABEL, type ApprovalBlocker } from "@/lib/domain/approval-labels";
import { cn } from "@/lib/cn";

const STAGES: { key: ProjectStage; label: string }[] = [
  { key: "footage", label: "Footage" },
  { key: "brief", label: "Creative brief" },
  { key: "copy", label: "Thai copy" },
  { key: "review", label: "Review" },
];

export interface EditorProps {
  projectId: string;
  serverVersion: number;
  serverDraft: EditorDraft;
  status: string;
  library: LibraryClip[];
  products: Product[];
  musicOptions: { id: string; name: string }[];
  subtitleStyle: SubtitleStyle;
  prohibitedClaims: string[];
  defaultCtas: string[];
  currentRender: { id: string; versionNo: number; status: string; progress: number; error: string | null; isSimulated: boolean; outputDriveFileId: string | null } | null;
  renderOutdated: boolean;
  blockers: ApprovalBlocker[];
  approvalValid: boolean;
  wasApproved: boolean;
  draftPending: boolean;
  draftNote: string | null;
  claudeLive: boolean;
}

function SaveIndicator({ state, onRetry }: { state: SaveState; onRetry: () => void }) {
  const map: Record<SaveState, { icon: React.ReactNode; text: string; cls: string }> = {
    idle: { icon: <Cloud className="size-4" />, text: "All changes saved", cls: "text-ink-500" },
    saved: { icon: <Check className="size-4" />, text: "Saved", cls: "text-success-700" },
    dirty: { icon: <Cloud className="size-4" />, text: "Unsaved changes", cls: "text-ink-500" },
    saving: { icon: <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />, text: "Saving…", cls: "text-ink-500" },
    error: { icon: <CircleAlert className="size-4" />, text: "Couldn’t save", cls: "text-danger-700" },
    offline: { icon: <CloudOff className="size-4" />, text: "Offline — kept on this device", cls: "text-warning-700" },
    conflict: { icon: <CircleAlert className="size-4" />, text: "Changed on another device", cls: "text-warning-700" },
  };
  const s = map[state];
  return (
    <span className={cn("inline-flex min-h-11 items-center gap-1.5 text-xs font-semibold", s.cls)} role="status" aria-live="polite">
      <span aria-hidden>{s.icon}</span>
      {s.text}
      {(state === "error" || state === "offline") && (
        <button type="button" onClick={onRetry} className="ml-1 inline-flex min-h-11 items-center rounded-lg px-2 underline">Retry</button>
      )}
    </span>
  );
}

export function Editor(props: EditorProps) {
  const router = useRouter();
  const toast = useToast();
  const auto = useAutosave(props.projectId, props.serverVersion, props.serverDraft);
  const { draft, setDraft } = auto;
  const player = useRef<PlayerHandle>(null);
  const [timeMs, setTimeMs] = useState(0);
  const [selectedKey, setSelectedKey] = useState<string | null>(draft.clips[0]?.key ?? null);
  const [selectedCue, setSelectedCue] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [tab, setTab] = useState<"preview" | "clips" | "panel">("preview");
  const [showRender, setShowRender] = useState(false);
  const [draftRequestedAt, setDraftRequestedAt] = useState<number | null>(null);
  const [pending, start] = useTransition();

  const total = editDuration(draft.clips);
  const selectedClip = draft.clips.find((c) => c.key === selectedKey) ?? null;
  const segs = useMemo(() => segments(draft.clips), [draft.clips]);
  const selSeg = segs.find((s) => s.key === selectedKey);
  const playheadLocal = selSeg && timeMs >= selSeg.startAt && timeMs <= selSeg.startAt + selSeg.len ? selSeg.inMs + (timeMs - selSeg.startAt) : null;
  const product = props.products.find((p) => p.id === draft.productId) ?? null;
  const dirty = auto.state === "dirty" || auto.state === "saving";
  const drafting = props.draftPending || (draftRequestedAt != null && props.serverVersion === auto.version && Date.now() - draftRequestedAt < 120_000 && !props.draftNote);

  useEffect(() => {
    if (!props.draftPending && draftRequestedAt) setDraftRequestedAt(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.draftPending, props.serverVersion]);

  const stageIdx = STAGES.findIndex((s) => s.key === draft.stage);
  const goStage = (k: ProjectStage) => setDraft((d) => ({ ...d, stage: k }));

  const doDraft = () =>
    start(async () => {
      await auto.flush();
      const r = await requestDraftAction(props.projectId);
      if (r.ok) {
        setDraftRequestedAt(Date.now());
        toast({ tone: "info", message: props.claudeLive ? "Claude is preparing a draft…" : "Preparing a demo template draft…" });
        router.refresh();
      } else toast({ tone: "error", message: r.error });
    });

  const doRender = () =>
    start(async () => {
      await auto.flush();
      const r = await requestRenderAction(props.projectId);
      if (r.ok) {
        toast({ tone: "success", message: `Render v${r.data!.versionNo} queued. You’ll find it in the Review Queue when it’s ready.` });
        router.refresh();
      } else toast({ tone: "error", message: r.error });
    });

  const unavailable = draft.clips.filter((c) => !c.available);

  const primary =
    draft.stage === "review" ? (
      <Button variant="primary" onClick={doRender} loading={pending} disabled={!draft.clips.length}>
        Send for review <ChevronRight className="size-4" aria-hidden />
      </Button>
    ) : (
      <Button variant="primary" onClick={() => goStage(STAGES[stageIdx + 1].key)}>
        Next: {STAGES[stageIdx + 1].label} <ChevronRight className="size-4" aria-hidden />
      </Button>
    );

  return (
    <div data-editing-dirty={dirty || auto.state === "conflict" ? "true" : "false"} className="pb-6">
      {/* Header */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Link href="/create" className="inline-flex size-11 items-center justify-center rounded-xl text-ink-600 hover:bg-white" aria-label="Back to drafts">
          <ArrowLeft className="size-5" />
        </Link>
        <label htmlFor="reel-title" className="sr-only">Reel title</label>
        <input
          id="reel-title"
          value={draft.title}
          onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
          className="min-h-11 min-w-0 flex-1 rounded-xl bg-transparent px-2 text-xl font-semibold text-ink-900 hover:bg-white focus:bg-white focus:outline-none focus:shadow-[var(--shadow-focus)] sm:max-w-md"
          maxLength={120}
        />
        <SaveIndicator state={auto.state} onRetry={auto.retry} />
        <div className="ml-auto flex flex-wrap gap-2">
          {dirty && <Button onClick={() => void auto.flush()}>Save now</Button>}
          {primary}
        </div>
      </div>

      {/* Stage stepper */}
      <nav aria-label="Reel stages" className="mb-4 overflow-x-auto scrollbar-thin">
        <ol className="flex min-w-max items-center gap-1 rounded-2xl bg-white p-1.5 shadow-[var(--shadow-card)]">
          {STAGES.map((s, i) => (
            <li key={s.key} className="flex items-center">
              {i > 0 && <span className="mx-1 h-px w-6 bg-line-strong md:w-10" aria-hidden />}
              <button
                type="button"
                onClick={() => goStage(s.key)}
                aria-current={draft.stage === s.key ? "step" : undefined}
                className={cn("flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-semibold", draft.stage === s.key ? "bg-teal-50 text-teal-800" : "text-ink-500 hover:bg-teal-50")}
              >
                <span className={cn("flex size-7 items-center justify-center rounded-full text-xs", draft.stage === s.key ? "bg-teal-700 text-white" : i < stageIdx ? "bg-teal-100 text-teal-800" : "border border-line-strong")}>
                  {i < stageIdx ? <Check className="size-3.5" aria-hidden /> : i + 1}
                </span>
                {s.label}
              </button>
            </li>
          ))}
        </ol>
      </nav>

      <div className="space-y-3">
        {auto.recovered && (
          <Notice tone="warning" title="Unsaved changes found on this device" action={<div className="flex gap-2"><Button variant="primary" onClick={auto.restoreRecovered}>Restore</Button><Button variant="ghost" onClick={auto.discardRecovered}>Discard</Button></div>}>
            From {new Date(auto.recovered.savedAt).toLocaleString()}. Restore them to continue where you left off.
          </Notice>
        )}
        {auto.conflictVersion != null && (
          <Notice tone="warning" title="This draft was changed on another device" action={<div className="flex flex-wrap gap-2"><Button onClick={auto.loadLatest}>Load latest</Button><Button variant="primary" onClick={() => void auto.keepMine()}>Keep my version</Button></div>}>
            Choose which version to keep. “Keep my version” overwrites the other device’s changes.
          </Notice>
        )}
        {auto.error && auto.state !== "conflict" && <Notice tone="danger">{auto.error}</Notice>}
        {unavailable.length > 0 && (
          <Notice tone="warning" title="Some clips are unavailable in Drive">
            {unavailable.map((c) => c.name).join(", ")} — restore them in Drive and sync, or remove them before rendering.
          </Notice>
        )}
      </div>

      {/* Compact layouts: tabs */}
      <div role="tablist" aria-label="Workspace panels" className="my-4 flex gap-1 rounded-2xl bg-white p-1 shadow-[var(--shadow-card)] xl:hidden">
        {(["preview", "clips", "panel"] as const).map((t) => (
          <button
            key={t}
            role="tab"
            type="button"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={cn("min-h-11 flex-1 rounded-xl text-sm font-semibold text-ink-600", tab === t && "bg-teal-700 text-white", t === "preview" && "lg:hidden")}
          >
            {t === "preview" ? "Preview" : t === "clips" ? `Clips (${draft.clips.length})` : STAGES[stageIdx].label}
          </button>
        ))}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(260px,360px)_minmax(0,1fr)] xl:grid-cols-[300px_minmax(280px,380px)_minmax(0,1fr)]">
        <div className={cn("min-w-0 xl:order-1", tab === "clips" ? "" : "max-xl:hidden")}>
          <ClipBin
            clips={draft.clips}
            selectedKey={selectedKey}
            onSelect={(k) => {
              setSelectedKey(k);
              const s = segs.find((x) => x.key === k);
              if (s) player.current?.seek(s.startAt);
            }}
            onMove={(k, dir) =>
              setDraft((d) => {
                const i = d.clips.findIndex((c) => c.key === k);
                const j = i + dir;
                if (i < 0 || j < 0 || j >= d.clips.length) return d;
                const clips = [...d.clips];
                [clips[i], clips[j]] = [clips[j], clips[i]];
                return { ...d, clips };
              })
            }
            onRemove={(k) => {
              setDraft((d) => ({ ...d, clips: d.clips.filter((c) => c.key !== k) }));
              if (selectedKey === k) setSelectedKey(null);
            }}
            onAdd={() => setPickerOpen(true)}
          />
        </div>

        <div className={cn("min-w-0 lg:row-span-2 xl:order-2 xl:row-span-1", tab === "preview" ? "" : "max-lg:hidden")}>
          <div className="mx-auto w-full max-w-[min(360px,calc((100dvh-250px)*0.5625+40px))] min-w-[220px] lg:sticky lg:top-4">
            {props.currentRender?.status === "succeeded" && (
              <div className="mb-3 flex rounded-xl bg-white p-1 shadow-[var(--shadow-card)]" role="group" aria-label="Preview source">
                <button type="button" aria-pressed={!showRender} onClick={() => setShowRender(false)} className={cn("min-h-11 flex-1 rounded-lg text-xs font-semibold", !showRender ? "bg-teal-50 text-teal-800" : "text-ink-500")}>Live edit</button>
                <button type="button" aria-pressed={showRender} onClick={() => setShowRender(true)} className={cn("min-h-11 flex-1 rounded-lg text-xs font-semibold", showRender ? "bg-teal-50 text-teal-800" : "text-ink-500")}>Render v{props.currentRender.versionNo}{props.renderOutdated ? " (outdated)" : ""}</button>
              </div>
            )}
            {showRender && props.currentRender ? (
              <RenderPlayer driveFileId={props.currentRender.outputDriveFileId} simulated={props.currentRender.isSimulated} />
            ) : (
              <EditPreview ref={player} clips={draft.clips} subtitles={draft.subtitles} subtitleStyle={props.subtitleStyle} onTime={setTimeMs} />
            )}
          </div>
        </div>

        <section
          aria-label={`${STAGES[stageIdx].label} panel`}
          className={cn(
            "min-w-0 rounded-[var(--radius-card)] border border-line bg-white p-5 shadow-[var(--shadow-card)] xl:order-3",
            tab === "panel" ? "" : tab === "preview" ? "max-lg:hidden" : "max-xl:hidden",
          )}
        >
          <h2 className="mb-4 text-base font-semibold text-ink-900">{STAGES[stageIdx].label}</h2>
          {draft.stage === "footage" && (
            <ClipInspector
              clip={selectedClip}
              playheadLocalMs={playheadLocal}
              onChange={(patch) => setDraft((d) => ({ ...d, clips: d.clips.map((c) => (c.key === selectedKey ? { ...c, ...patch } : c)) }))}
            />
          )}
          {draft.stage === "brief" && (
            <BriefPanel
              brief={draft.brief}
              productId={draft.productId}
              products={props.products}
              musicOptions={props.musicOptions}
              onChange={(b) => setDraft((d) => ({ ...d, brief: b }))}
              onProduct={(id) => setDraft((d) => ({ ...d, productId: id, brief: { ...d.brief, productId: id } }))}
              onDraft={doDraft}
              drafting={drafting}
              claudeLive={props.claudeLive}
            />
          )}
          {draft.stage === "copy" && (
            <CopyPanel
              caption={draft.captionTh}
              subtitles={draft.subtitles}
              product={product}
              prohibitedClaims={props.prohibitedClaims}
              defaultCtas={props.defaultCtas}
              timeMs={timeMs}
              totalMs={total}
              selectedCueId={selectedCue}
              onSelectCue={setSelectedCue}
              onCaption={(v) => setDraft((d) => ({ ...d, captionTh: v }))}
              onSubtitles={(v) => setDraft((d) => ({ ...d, subtitles: v }))}
              onDraft={doDraft}
              drafting={drafting}
              claudeLive={props.claudeLive}
              draftNote={props.draftNote}
            />
          )}
          {draft.stage === "review" && (
            <ReviewPanel
              projectId={props.projectId}
              status={props.status}
              currentRender={props.currentRender}
              renderOutdated={props.renderOutdated}
              blockers={props.blockers.map((b) => BLOCKER_LABEL[b])}
              approvalValid={props.approvalValid}
              wasApproved={props.wasApproved}
              dirty={dirty}
              onRender={doRender}
              rendering={pending}
            />
          )}
        </section>

        <div className="min-w-0 lg:col-span-2 xl:order-4 xl:col-span-3">
          <Timeline
            clips={draft.clips}
            subtitles={draft.subtitles}
            timeMs={timeMs}
            onSeek={(ms) => {
              setTimeMs(ms);
              player.current?.seek(ms);
            }}
            selectedKey={selectedKey}
            onSelectClip={(k) => {
              setSelectedKey(k);
              if (draft.stage !== "footage" && draft.stage !== "copy") goStage("footage");
            }}
            selectedCueId={selectedCue}
            onSelectCue={(id) => {
              setSelectedCue(id);
              if (draft.stage !== "copy") goStage("copy");
            }}
          />
        </div>
      </div>

      <ClipPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        library={props.library}
        onAdd={(clips) =>
          setDraft((d) => ({
            ...d,
            clips: [
              ...d.clips,
              ...clips.map((c) => ({
                key: `${c.id}-${Math.random().toString(36).slice(2, 7)}`,
                footageId: c.id,
                driveFileId: c.driveFileId,
                name: c.name,
                durationMs: c.durationMs ?? 5000,
                width: c.width,
                height: c.height,
                available: c.available,
                inMs: 0,
                outMs: Math.min(c.durationMs ?? 5000, 6000),
              })),
            ],
          }))
        }
      />
    </div>
  );
}
