"use client";
import { useRef, useState, type KeyboardEvent } from "react";
import { Minus, Plus, Video, Captions } from "lucide-react";
import type { SubtitleCue } from "@/server/db/schema";
import { thumbUrl } from "../media";
import { segments, type EditorClip } from "./types";
import { cn } from "@/lib/cn";

/** Simple clip + subtitle timeline. Tap to seek or select; every action also has a button elsewhere. */
export function Timeline({
  clips,
  subtitles,
  timeMs,
  onSeek,
  selectedKey,
  onSelectClip,
  selectedCueId,
  onSelectCue,
}: {
  clips: EditorClip[];
  subtitles: SubtitleCue[];
  timeMs: number;
  onSeek: (ms: number) => void;
  selectedKey: string | null;
  onSelectClip: (key: string) => void;
  selectedCueId: string | null;
  onSelectCue: (id: string) => void;
}) {
  const [pxPerSec, setPxPerSec] = useState(28);
  const segs = segments(clips);
  const total = Math.max(1000, segs.reduce((s, x) => s + x.len, 0));
  const width = Math.max(320, (total / 1000) * pxPerSec);
  const track = useRef<HTMLDivElement>(null);

  const seekFromEvent = (clientX: number) => {
    const el = track.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = clientX - rect.left;
    onSeek(Math.max(0, Math.min(total, (x / rect.width) * total)));
  };

  const onKey = (e: KeyboardEvent) => {
    const step = e.shiftKey ? 5000 : 1000;
    if (e.key === "ArrowRight") onSeek(Math.min(total, timeMs + step));
    else if (e.key === "ArrowLeft") onSeek(Math.max(0, timeMs - step));
    else if (e.key === "Home") onSeek(0);
    else if (e.key === "End") onSeek(total - 1);
    else return;
    e.preventDefault();
  };

  const ticks = Array.from({ length: Math.floor(total / 5000) + 1 }, (_, i) => i * 5);

  return (
    <div className="rounded-[var(--radius-card)] border border-line bg-white p-3 shadow-[var(--shadow-card)]">
      <div className="mb-2 flex items-center justify-between gap-2 px-1">
        <h2 className="text-sm font-semibold text-ink-700">Timeline</h2>
        <div className="flex items-center gap-1" role="group" aria-label="Timeline zoom">
          <button type="button" className="inline-flex size-11 items-center justify-center rounded-xl text-ink-600 hover:bg-teal-50" onClick={() => setPxPerSec((p) => Math.max(10, p - 8))} aria-label="Zoom out">
            <Minus className="size-4" />
          </button>
          <input type="range" min={10} max={90} value={pxPerSec} onChange={(e) => setPxPerSec(Number(e.target.value))} className="w-24 accent-teal-700" aria-label="Zoom level" />
          <button type="button" className="inline-flex size-11 items-center justify-center rounded-xl text-ink-600 hover:bg-teal-50" onClick={() => setPxPerSec((p) => Math.min(90, p + 8))} aria-label="Zoom in">
            <Plus className="size-4" />
          </button>
        </div>
      </div>
      <div className="flex gap-2">
        <div className="flex w-16 shrink-0 flex-col gap-2 pt-6 text-[11px] font-semibold text-ink-500">
          <span className="flex h-16 items-center gap-1"><Video className="size-3.5" aria-hidden />Video</span>
          <span className="flex h-10 items-center gap-1"><Captions className="size-3.5" aria-hidden />Subs</span>
        </div>
        <div className="min-w-0 flex-1 overflow-x-auto scrollbar-thin">
          <div style={{ width }} className="relative">
            <div
              ref={track}
              role="slider"
              tabIndex={0}
              aria-label="Playhead position"
              aria-valuemin={0}
              aria-valuemax={Math.round(total / 1000)}
              aria-valuenow={Math.round(timeMs / 1000)}
              aria-valuetext={`${(timeMs / 1000).toFixed(1)} seconds`}
              onKeyDown={onKey}
              onClick={(e) => seekFromEvent(e.clientX)}
              className="relative h-6 cursor-pointer border-b border-line"
            >
              {ticks.map((s) => (
                <span key={s} className="absolute top-0 text-[10px] tabular-nums text-ink-400" style={{ left: `${((s * 1000) / total) * 100}%` }}>
                  {s}s
                </span>
              ))}
            </div>
            <div className="relative mt-2 flex h-16 gap-0.5">
              {segs.map((s) => (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => {
                    onSelectClip(s.key);
                    onSeek(s.startAt);
                  }}
                  className={cn(
                    "relative h-full overflow-hidden rounded-lg border-2 bg-teal-100 text-left",
                    selectedKey === s.key ? "border-peach-500" : "border-transparent",
                    !s.available && "bg-warning-100",
                  )}
                  style={{ width: `${(s.len / total) * 100}%` }}
                  aria-label={`${s.name}, ${(s.len / 1000).toFixed(1)} seconds${selectedKey === s.key ? ", selected" : ""}`}
                  aria-pressed={selectedKey === s.key}
                >
                  {s.available && (
                    <span className="absolute inset-0 bg-repeat-x opacity-90" style={{ backgroundImage: `url(${thumbUrl(s.driveFileId)})`, backgroundSize: "auto 100%" }} aria-hidden />
                  )}
                  <span className="absolute bottom-0.5 left-1 rounded bg-teal-950/60 px-1 text-[10px] font-semibold text-white">{(s.len / 1000).toFixed(1)}s</span>
                </button>
              ))}
            </div>
            <div className="relative mt-2 h-10 rounded-lg bg-teal-50">
              {subtitles.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    onSelectCue(c.id);
                    onSeek(c.startMs);
                  }}
                  lang="th"
                  className={cn(
                    "font-thai absolute top-1 h-8 truncate rounded-md border px-1.5 text-left text-[11px] leading-7",
                    selectedCueId === c.id ? "border-peach-500 bg-peach-100 text-peach-700" : "border-teal-200 bg-white text-ink-700",
                  )}
                  style={{ left: `${(c.startMs / total) * 100}%`, width: `${Math.max(2, ((c.endMs - c.startMs) / total) * 100)}%` }}
                  aria-label={`Subtitle: ${c.text}`}
                >
                  {c.text}
                </button>
              ))}
            </div>
            <div className="pointer-events-none absolute bottom-0 top-0 w-0.5 bg-peach-600" style={{ left: `${(timeMs / total) * 100}%` }} aria-hidden>
              <span className="absolute -left-1.5 -top-0.5 size-3.5 rounded-full border-2 border-white bg-peach-600" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
