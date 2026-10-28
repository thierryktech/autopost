"use client";
import Link from "next/link";
import { ArrowDown, ArrowUp, Trash2, Plus, Crosshair, Sparkles, AlertTriangle, ShieldCheck, Clapperboard, CircleCheck, CircleAlert, ExternalLink, CalendarPlus, Music, RotateCcw } from "lucide-react";
import * as Switch from "@radix-ui/react-switch";
import type { CreativeBrief, Product, SubtitleCue } from "@/server/db/schema";
import { Thumb } from "../media";
import { Button, ButtonLink } from "../ui/button";
import { Field, Input, Select, Textarea } from "../ui/field";
import { Badge } from "../ui/badge";
import { Notice, ProgressBar, EmptyState } from "../ui/misc";
import { TimeStepper } from "./controls";
import { editDuration, fmtSec, type EditorClip } from "./types";
import { checkCopy, CAPTION_MAX } from "@/lib/domain/copy-guard";
import { formatDuration } from "@/lib/time";
import { orientationOf, ORIENTATION_LABEL } from "@/lib/media";
import { cn } from "@/lib/cn";
import { newId } from "@/lib/ids";

// ---------------- Clip bin ----------------
export function ClipBin({
  clips,
  selectedKey,
  onSelect,
  onMove,
  onRemove,
  onAdd,
}: {
  clips: EditorClip[];
  selectedKey: string | null;
  onSelect: (k: string) => void;
  onMove: (k: string, dir: -1 | 1) => void;
  onRemove: (k: string) => void;
  onAdd: () => void;
}) {
  return (
    <section aria-labelledby="bin-title" className="rounded-[var(--radius-card)] border border-line bg-white p-4 shadow-[var(--shadow-card)]">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 id="bin-title" className="text-sm font-semibold text-ink-900">
          Source clips <span className="text-ink-400">({clips.length})</span>
        </h2>
        <Button variant="subtle" icon={<Plus className="size-4" />} onClick={onAdd}>Add clips</Button>
      </div>
      {clips.length ? (
        <ol className="space-y-2">
          {clips.map((c, i) => (
            <li key={c.key} className={cn("flex items-center gap-2 rounded-2xl border p-1.5 pr-1", selectedKey === c.key ? "border-peach-400 bg-peach-50" : "border-transparent hover:bg-teal-50")}>
              <button type="button" onClick={() => onSelect(c.key)} className="flex min-w-0 flex-1 items-center gap-3 rounded-xl text-left" aria-pressed={selectedKey === c.key}>
                <Thumb driveFileId={c.driveFileId} unavailable={!c.available} ratio="1/1" className="w-14 shrink-0 rounded-xl" />
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-medium text-ink-900">{i + 1}. {c.name}</span>
                  <span className="block text-xs tabular-nums text-ink-500">
                    {fmtSec(c.inMs)}–{fmtSec(c.outMs)}s · {formatDuration(c.outMs - c.inMs)}
                  </span>
                  {!c.available && <span className="block text-xs font-semibold text-warning-700">Unavailable in Drive</span>}
                </span>
              </button>
              <div className="flex shrink-0 flex-col">
                <button type="button" className="inline-flex size-11 items-center justify-center rounded-xl text-ink-500 hover:bg-white disabled:opacity-30" onClick={() => onMove(c.key, -1)} disabled={i === 0} aria-label={`Move ${c.name} earlier`}>
                  <ArrowUp className="size-4" />
                </button>
                <button type="button" className="inline-flex size-11 items-center justify-center rounded-xl text-ink-500 hover:bg-white disabled:opacity-30" onClick={() => onMove(c.key, 1)} disabled={i === clips.length - 1} aria-label={`Move ${c.name} later`}>
                  <ArrowDown className="size-4" />
                </button>
              </div>
              <button type="button" className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl text-ink-400 hover:bg-danger-100 hover:text-danger-700" onClick={() => onRemove(c.key)} aria-label={`Remove ${c.name} from this Reel`}>
                <Trash2 className="size-4" />
              </button>
            </li>
          ))}
        </ol>
      ) : (
        <EmptyState title="No clips yet" description="Add a few clips to start your Reel." action={<Button variant="primary" onClick={onAdd}>Add clips</Button>} />
      )}
      {clips.length > 0 && (
        <p className="mt-3 text-xs text-ink-500">
          Total {formatDuration(editDuration(clips))}. Use the arrows to reorder — no dragging needed.
        </p>
      )}
    </section>
  );
}

// ---------------- Footage stage: clip inspector ----------------
export function ClipInspector({ clip, playheadLocalMs, onChange }: { clip: EditorClip | null; playheadLocalMs: number | null; onChange: (patch: Partial<EditorClip>) => void }) {
  if (!clip) return <p className="text-sm text-ink-500">Select a clip to trim it.</p>;
  const o = orientationOf(clip.width, clip.height);
  return (
    <div className="space-y-4">
      <div>
        <p className="truncate font-semibold text-ink-900">{clip.name}</p>
        <p className="text-xs text-ink-500">
          Source length {formatDuration(clip.durationMs)} · {ORIENTATION_LABEL[o]}
          {o !== "portrait" && o !== "unknown" && " — will be centre-cropped to 9:16"}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <TimeStepper label="Start (s)" valueMs={clip.inMs} min={0} max={clip.outMs - 300} onChange={(v) => onChange({ inMs: v })} />
        <TimeStepper label="End (s)" valueMs={clip.outMs} min={clip.inMs + 300} max={clip.durationMs} onChange={(v) => onChange({ outMs: v })} />
      </div>
      <div className="space-y-2">
        <label className="block text-xs font-semibold text-ink-600" htmlFor="trim-in">Trim start</label>
        <input id="trim-in" type="range" min={0} max={clip.durationMs} step={100} value={clip.inMs} onChange={(e) => onChange({ inMs: Math.min(Number(e.target.value), clip.outMs - 300) })} className="h-11 w-full accent-teal-700" />
        <label className="block text-xs font-semibold text-ink-600" htmlFor="trim-out">Trim end</label>
        <input id="trim-out" type="range" min={0} max={clip.durationMs} step={100} value={clip.outMs} onChange={(e) => onChange({ outMs: Math.max(Number(e.target.value), clip.inMs + 300) })} className="h-11 w-full accent-peach-600" />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button icon={<Crosshair className="size-4" />} disabled={playheadLocalMs == null} onClick={() => playheadLocalMs != null && onChange({ inMs: Math.min(playheadLocalMs, clip.outMs - 300) })}>Start at playhead</Button>
        <Button icon={<Crosshair className="size-4" />} disabled={playheadLocalMs == null} onClick={() => playheadLocalMs != null && onChange({ outMs: Math.max(playheadLocalMs, clip.inMs + 300) })}>End at playhead</Button>
        <Button variant="ghost" icon={<RotateCcw className="size-4" />} onClick={() => onChange({ inMs: 0, outMs: clip.durationMs })}>Use full clip</Button>
      </div>
    </div>
  );
}

// ---------------- Brief stage ----------------
const STYLES: { value: CreativeBrief["style"]; label: string; hint: string }[] = [
  { value: "calm", label: "Calm", hint: "Slow cuts, soft music" },
  { value: "energetic", label: "Energetic", hint: "Quick cuts, upbeat" },
  { value: "cinematic", label: "Cinematic", hint: "Moody, story-led" },
  { value: "tutorial", label: "How-to", hint: "Step-by-step" },
  { value: "behind_the_scenes", label: "Behind the scenes", hint: "Real moments" },
];

export function BriefPanel({
  brief,
  productId,
  products,
  musicOptions,
  onChange,
  onProduct,
  onDraft,
  drafting,
  claudeLive,
}: {
  brief: CreativeBrief;
  productId: string | null;
  products: Product[];
  musicOptions: { id: string; name: string }[];
  onChange: (b: CreativeBrief) => void;
  onProduct: (id: string | null) => void;
  onDraft: () => void;
  drafting: boolean;
  claudeLive: boolean;
}) {
  const set = <K extends keyof CreativeBrief>(k: K, v: CreativeBrief[K]) => onChange({ ...brief, [k]: v });
  return (
    <div className="space-y-5">
      <Field label="Purpose" hint="What should viewers feel or do? Thai or English is fine.">
        {(id, d) => <Textarea id={id} aria-describedby={d} rows={3} value={brief.purpose} onChange={(e) => set("purpose", e.target.value)} placeholder="เช่น ชวนลูกค้าลองดริปกาแฟตอนเช้า" lang="th" className="font-thai" />}
      </Field>
      <fieldset>
        <legend className="mb-1.5 text-sm font-semibold text-ink-700">Target duration</legend>
        <div className="flex flex-wrap gap-2">
          {[15, 20, 30, 45, 60].map((s) => (
            <button key={s} type="button" aria-pressed={brief.targetDurationSec === s} onClick={() => set("targetDurationSec", s)} className={cn("min-h-11 min-w-14 rounded-xl border px-3 text-sm font-semibold", brief.targetDurationSec === s ? "border-teal-700 bg-teal-700 text-white" : "border-line-strong bg-white text-ink-700 hover:bg-teal-50")}>
              {s}s
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className="mb-1.5 text-sm font-semibold text-ink-700">Editing style</legend>
        <div className="grid grid-cols-2 gap-2">
          {STYLES.map((s) => (
            <label key={s.value} className={cn("flex min-h-14 cursor-pointer flex-col justify-center rounded-xl border px-3 py-2", brief.style === s.value ? "border-teal-600 bg-teal-50 ring-1 ring-teal-600" : "border-line-strong bg-white hover:bg-teal-50")}>
              <input type="radio" name="style" value={s.value} checked={brief.style === s.value} onChange={() => set("style", s.value)} className="sr-only" />
              <span className="text-sm font-semibold text-ink-900">{s.label}</span>
              <span className="text-xs text-ink-500">{s.hint}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <Field label="Featured product" hint="Only this product’s verified facts can appear in the copy.">
        {(id, d) => (
          <Select id={id} aria-describedby={d} value={productId ?? ""} onChange={(e) => onProduct(e.target.value || null)}>
            <option value="">No product</option>
            {products.filter((p) => !p.archived).map((p) => (
              <option key={p.id} value={p.id}>{p.name} · {p.type === "own" ? "Balena product" : "Affiliate"}</option>
            ))}
          </Select>
        )}
      </Field>
      <div className="rounded-2xl border border-line p-4">
        <div className="flex items-center justify-between gap-3">
          <label htmlFor="music-on" className="flex items-center gap-2 text-sm font-semibold text-ink-700"><Music className="size-4" aria-hidden />Background music (optional)</label>
          <Switch.Root id="music-on" checked={brief.music.enabled} onCheckedChange={(v) => set("music", { ...brief.music, enabled: v })} className="relative h-7 w-12 shrink-0 rounded-full bg-line-strong data-[state=checked]:bg-teal-700">
            <Switch.Thumb className="block size-6 translate-x-0.5 rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-[22px]" />
          </Switch.Root>
        </div>
        {brief.music.enabled && (
          <div className="mt-3 space-y-3">
            {musicOptions.length > 0 ? (
              <Field label="Track">
                {(id) => (
                  <Select id={id} value={brief.music.driveFileId ?? ""} onChange={(e) => set("music", { ...brief.music, driveFileId: e.target.value || null, trackName: musicOptions.find((m) => m.id === e.target.value)?.name ?? null })}>
                    <option value="">Choose a track</option>
                    {musicOptions.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </Select>
                )}
              </Field>
            ) : (
              <Field label="Music file (Google Drive file ID)" hint="Use music you have the rights to. Paste the Drive file ID of an audio file.">
                {(id, d) => <Input id={id} aria-describedby={d} value={brief.music.driveFileId ?? ""} onChange={(e) => set("music", { ...brief.music, driveFileId: e.target.value.trim() || null })} />}
              </Field>
            )}
            <Field label={`Music volume ${Math.round(brief.music.volume * 100)}%`}>
              {(id) => <input id={id} type="range" min={0} max={1} step={0.05} value={brief.music.volume} onChange={(e) => set("music", { ...brief.music, volume: Number(e.target.value) })} className="h-11 w-full accent-teal-700" />}
            </Field>
          </div>
        )}
      </div>
      <Field label="Notes for the edit (optional)">
        {(id) => <Textarea id={id} rows={2} value={brief.notes} onChange={(e) => set("notes", e.target.value)} placeholder="e.g. open on the pour, end on the bag" />}
      </Field>
      <DraftButton onDraft={onDraft} drafting={drafting} claudeLive={claudeLive} />
    </div>
  );
}

function DraftButton({ onDraft, drafting, claudeLive }: { onDraft: () => void; drafting: boolean; claudeLive: boolean }) {
  return (
    <div className="rounded-2xl bg-gradient-peach p-4">
      <p className="text-sm font-semibold text-ink-900">Prepare an edit with Claude</p>
      <p className="mt-0.5 text-xs text-ink-600">
        Suggests clip order, trims, Thai subtitles and a caption from your brief. It replaces the current edit and caption — you review everything before publishing.
        {!claudeLive && <strong className="mt-1 block text-peach-700">Demo mode: uses a fixed template, not Claude.</strong>}
      </p>
      <Button variant="primary" className="mt-3" loading={drafting} icon={<Sparkles className="size-4" />} onClick={onDraft}>
        {drafting ? "Preparing draft…" : claudeLive ? "Draft with Claude" : "Draft (demo template)"}
      </Button>
    </div>
  );
}

// ---------------- Thai copy stage ----------------
export function CopyPanel({
  caption,
  subtitles,
  product,
  prohibitedClaims,
  defaultCtas,
  timeMs,
  totalMs,
  selectedCueId,
  onSelectCue,
  onCaption,
  onSubtitles,
  onDraft,
  drafting,
  claudeLive,
  draftNote,
}: {
  caption: string;
  subtitles: SubtitleCue[];
  product: Product | null;
  prohibitedClaims: string[];
  defaultCtas: string[];
  timeMs: number;
  totalMs: number;
  selectedCueId: string | null;
  onSelectCue: (id: string | null) => void;
  onCaption: (v: string) => void;
  onSubtitles: (v: SubtitleCue[]) => void;
  onDraft: () => void;
  drafting: boolean;
  claudeLive: boolean;
  draftNote: string | null;
}) {
  const warnings = checkCopy([caption, ...subtitles.map((s) => s.text)].join("\n"), { prohibitedClaims, verifiedFacts: product?.verifiedFacts ?? [] });
  const updateCue = (id: string, patch: Partial<SubtitleCue>) => onSubtitles(subtitles.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  return (
    <div className="space-y-5">
      {draftNote && <Notice tone={draftNote.startsWith("DEMO") ? "demo" : "info"}>{draftNote}</Notice>}
      <Field label="Thai caption" aside={<span className={cn("text-xs tabular-nums", caption.length > CAPTION_MAX ? "text-danger-700" : "text-ink-500")}>{caption.length}/{CAPTION_MAX}</span>} hint="Warm, natural and clear. Only state verified product facts.">
        {(id, d) => <Textarea id={id} aria-describedby={d} lang="th" rows={6} value={caption} onChange={(e) => onCaption(e.target.value)} className="font-thai text-[16px]" placeholder="เขียนแคปชันภาษาไทย…" />}
      </Field>
      {defaultCtas.length > 0 && (
        <div>
          <p className="mb-1.5 text-xs font-semibold text-ink-600">Add a call to action</p>
          <div className="flex flex-wrap gap-2">
            {defaultCtas.map((c) => (
              <button key={c} type="button" lang="th" onClick={() => onCaption(caption.trim() ? `${caption.trim()}\n${c}` : c)} className="font-thai min-h-11 rounded-full border border-line-strong bg-white px-3 text-sm hover:bg-teal-50">+ {c}</button>
            ))}
          </div>
        </div>
      )}
      <div className="rounded-2xl border border-line bg-cream p-4">
        <p className="flex items-center gap-2 text-sm font-semibold text-ink-900"><ShieldCheck className="size-4 text-teal-700" aria-hidden />Verified facts{product ? ` · ${product.name}` : ""}</p>
        {product ? (
          product.verifiedFacts.length ? (
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {product.verifiedFacts.map((f) => <li key={f} lang="th" className="font-thai rounded-full bg-white px-2.5 py-1 text-xs text-ink-700 ring-1 ring-line">{f}</li>)}
            </ul>
          ) : (
            <p className="mt-1 text-xs text-ink-500">No verified facts saved. Don’t describe product properties in the copy.</p>
          )
        ) : (
          <p className="mt-1 text-xs text-ink-500">No featured product. Describe the moment, not product claims.</p>
        )}
      </div>
      {warnings.length > 0 && (
        <Notice tone="warning" icon={<AlertTriangle />} title="Check before approving">
          <ul className="list-disc space-y-0.5 pl-4">{warnings.map((w, i) => <li key={i} lang="th">{w.message}</li>)}</ul>
        </Notice>
      )}

      <section aria-labelledby="subs-title">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h3 id="subs-title" className="text-sm font-semibold text-ink-700">Subtitles ({subtitles.length})</h3>
          <Button
            variant="subtle"
            icon={<Plus className="size-4" />}
            onClick={() => {
              const start = Math.min(timeMs, Math.max(0, totalMs - 1000));
              const cue = { id: newId("sub"), startMs: Math.round(start / 100) * 100, endMs: Math.min(totalMs, Math.round((start + 2500) / 100) * 100), text: "" };
              onSubtitles([...subtitles, cue].sort((a, b) => a.startMs - b.startMs));
              onSelectCue(cue.id);
            }}
          >
            Add at playhead
          </Button>
        </div>
        {subtitles.length === 0 && <p className="text-sm text-ink-500">No subtitles yet. Add one at the playhead or draft with Claude.</p>}
        <ol className="space-y-2">
          {subtitles.map((c, i) => (
            <li key={c.id} className={cn("rounded-2xl border p-3", selectedCueId === c.id ? "border-peach-400 bg-peach-50" : "border-line bg-white")} onFocus={() => onSelectCue(c.id)}>
              <div className="flex items-start gap-2">
                <span className="mt-3 w-5 text-xs font-semibold text-ink-400">{i + 1}</span>
                <div className="min-w-0 flex-1 space-y-2">
                  <label className="sr-only" htmlFor={`cue-${c.id}`}>Subtitle {i + 1} text</label>
                  <Input id={`cue-${c.id}`} lang="th" className="font-thai" value={c.text} maxLength={120} onChange={(e) => updateCue(c.id, { text: e.target.value })} placeholder="ข้อความซับไตเติล" />
                  <div className="grid grid-cols-2 gap-2">
                    <TimeStepper label="From (s)" valueMs={c.startMs} min={0} max={c.endMs - 200} onChange={(v) => updateCue(c.id, { startMs: v })} />
                    <TimeStepper label="To (s)" valueMs={c.endMs} min={c.startMs + 200} max={Math.max(totalMs, c.endMs)} onChange={(v) => updateCue(c.id, { endMs: v })} />
                  </div>
                  {c.text.length > 32 && <p className="text-xs text-warning-700">Long line — consider splitting so it stays readable on a phone.</p>}
                </div>
                <button type="button" onClick={() => onSubtitles(subtitles.filter((x) => x.id !== c.id))} className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl text-ink-400 hover:bg-danger-100 hover:text-danger-700" aria-label={`Delete subtitle ${i + 1}`}>
                  <Trash2 className="size-4" />
                </button>
              </div>
            </li>
          ))}
        </ol>
      </section>
      <DraftButton onDraft={onDraft} drafting={drafting} claudeLive={claudeLive} />
    </div>
  );
}

// ---------------- Review stage ----------------
export function ReviewPanel({
  projectId,
  status,
  currentRender,
  renderOutdated,
  blockers,
  approvalValid,
  wasApproved,
  dirty,
  onRender,
  rendering,
}: {
  projectId: string;
  status: string;
  currentRender: { id: string; versionNo: number; status: string; progress: number; error: string | null; isSimulated: boolean } | null;
  renderOutdated: boolean;
  blockers: string[];
  approvalValid: boolean;
  wasApproved: boolean;
  dirty: boolean;
  onRender: () => void;
  rendering: boolean;
}) {
  const busy = currentRender && (currentRender.status === "queued" || currentRender.status === "rendering");
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-line p-4">
        <p className="text-sm font-semibold text-ink-900">Render</p>
        {currentRender ? (
          <div className="mt-2 space-y-2">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span>Version {currentRender.versionNo}</span>
              <Badge tone={currentRender.status === "succeeded" ? "success" : currentRender.status === "failed" ? "danger" : "info"}>{currentRender.status === "succeeded" ? "Ready" : currentRender.status}</Badge>
              {currentRender.isSimulated && <Badge tone="demo">Demo stand-in</Badge>}
              {renderOutdated && currentRender.status === "succeeded" && <Badge tone="warning">Edit changed since render</Badge>}
            </div>
            {busy && <ProgressBar value={currentRender.status === "queued" ? 3 : currentRender.progress} label="Render progress" />}
            {currentRender.status === "failed" && <Notice tone="danger" title="Render failed">{currentRender.error}</Notice>}
          </div>
        ) : (
          <p className="mt-1 text-sm text-ink-500">Not rendered yet.</p>
        )}
        {wasApproved && <Notice tone="warning" className="mt-3">This draft is approved. Rendering a new version clears the approval — it must be approved again before publishing.</Notice>}
        <Button variant="primary" className="mt-3 w-full" loading={rendering || !!busy} disabled={dirty} icon={<Clapperboard className="size-4" />} onClick={onRender}>
          {busy ? "Rendering on the worker…" : currentRender ? "Render new version & send for review" : "Render & send for review"}
        </Button>
        {dirty && <p className="mt-2 text-xs text-ink-500">Saving your latest changes first…</p>}
        <p className="mt-2 text-xs text-ink-500">Rendering runs on the worker. You can close this page — it continues in the background.</p>
      </div>

      <div className="rounded-2xl border border-line p-4">
        <p className="text-sm font-semibold text-ink-900">Ready to publish?</p>
        {approvalValid ? (
          <p className="mt-2 flex items-center gap-2 text-sm text-success-700"><CircleCheck className="size-4" aria-hidden />Approved for the current video and caption.</p>
        ) : (
          <ul className="mt-2 space-y-1.5">
            {blockers.map((b) => (
              <li key={b} className="flex items-start gap-2 text-sm text-ink-700"><CircleAlert className="mt-0.5 size-4 shrink-0 text-warning-700" aria-hidden />{b}</li>
            ))}
          </ul>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          <ButtonLink href={`/review/${projectId}`} icon={<ExternalLink className="size-4" />}>Open review</ButtonLink>
          {approvalValid && <ButtonLink href={`/calendar?new=${projectId}`} variant="peach" icon={<CalendarPlus className="size-4" />}>Plan publishing</ButtonLink>}
        </div>
        <p className="mt-2 text-xs text-ink-500">Status: {status.replace(/_/g, " ")}</p>
      </div>
      <Link href="/brand" className="block text-xs font-semibold text-teal-700 hover:underline">Subtitle style and logo come from your Brand Kit →</Link>
    </div>
  );
}
