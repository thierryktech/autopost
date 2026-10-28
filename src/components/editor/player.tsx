"use client";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { Pause, Play, SkipBack, Film } from "lucide-react";
import type { SubtitleCue, SubtitleStyle } from "@/server/db/schema";
import { streamUrl } from "../media";
import { segments, type EditorClip } from "./types";
import { formatDuration } from "@/lib/time";
import { cn } from "@/lib/cn";

export interface PlayerHandle {
  seek: (ms: number) => void;
  getTime: () => number;
}

/**
 * Lightweight edit preview: plays the clip list as one virtual timeline (switching sources at
 * clip boundaries) with subtitles overlaid in HTML. It is a preview, not the final render.
 */
export const EditPreview = forwardRef<PlayerHandle, {
  clips: EditorClip[];
  subtitles: SubtitleCue[];
  subtitleStyle: SubtitleStyle;
  onTime?: (ms: number) => void;
  className?: string;
}>(function EditPreview({ clips, subtitles, subtitleStyle, onTime, className }, ref) {
  const video = useRef<HTMLVideoElement>(null);
  const segs = useMemo(() => segments(clips.filter((c) => c.available)), [clips]);
  const total = segs.reduce((s, x) => s + x.len, 0);
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const segIndex = useRef(0);
  const tRef = useRef(0);

  const segAt = useCallback(
    (ms: number) => {
      const i = segs.findIndex((s) => ms >= s.startAt && ms < s.startAt + s.len);
      return i === -1 ? Math.max(0, segs.length - 1) : i;
    },
    [segs],
  );

  const load = useCallback(
    (ms: number, autoplay: boolean) => {
      const v = video.current;
      if (!v || !segs.length) return;
      const i = segAt(ms);
      const seg = segs[i];
      segIndex.current = i;
      const src = streamUrl(seg.driveFileId);
      const local = (seg.inMs + (ms - seg.startAt)) / 1000;
      const apply = () => {
        v.currentTime = Math.max(0, local);
        if (autoplay) void v.play().catch(() => setPlaying(false));
      };
      if (!v.src.endsWith(src)) {
        v.src = src;
        v.addEventListener("loadedmetadata", apply, { once: true });
        v.load();
      } else apply();
    },
    [segAt, segs],
  );

  const seek = useCallback(
    (ms: number) => {
      const clamped = Math.max(0, Math.min(total - 1, ms));
      tRef.current = clamped;
      setT(clamped);
      onTime?.(clamped);
      load(clamped, playing);
    },
    [load, onTime, playing, total],
  );

  useImperativeHandle(ref, () => ({ seek, getTime: () => tRef.current }), [seek]);

  // Reload when the edit changes (trim/reorder) so the preview reflects it.
  useEffect(() => {
    load(Math.min(tRef.current, Math.max(0, total - 1)), false);
    setPlaying(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(segs.map((s) => [s.driveFileId, s.inMs, s.outMs]))]);

  useEffect(() => {
    const v = video.current;
    if (!v) return;
    let raf = 0;
    const tick = () => {
      const seg = segs[segIndex.current];
      if (seg && !v.paused) {
        const localMs = v.currentTime * 1000;
        if (localMs >= seg.outMs - 30) {
          const next = segIndex.current + 1;
          if (next < segs.length) load(segs[next].startAt, true);
          else {
            v.pause();
            setPlaying(false);
          }
        } else {
          const now = seg.startAt + Math.max(0, localMs - seg.inMs);
          tRef.current = now;
          setT(now);
          onTime?.(now);
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [segs, load, onTime]);

  const toggle = () => {
    const v = video.current;
    if (!v || !segs.length) return;
    if (playing) {
      v.pause();
      setPlaying(false);
    } else {
      setPlaying(true);
      if (tRef.current >= total - 50) load(0, true);
      else void v.play().catch(() => setPlaying(false));
    }
  };

  const cue = subtitles.find((c) => t >= c.startMs && t <= c.endMs);

  return (
    <div className={cn("relative mx-auto w-full", className)}>
      <div className="relative aspect-[9/16] overflow-hidden rounded-[22px] bg-teal-950 shadow-[var(--shadow-raised)]">
        {segs.length ? (
          <video
            ref={video}
            className="absolute inset-0 size-full object-cover"
            playsInline
            muted
            preload="metadata"
            onError={() => setError("This clip couldn’t be loaded for preview.")}
            onLoadedData={() => setError(null)}
            aria-label="Edit preview"
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-teal-300">
            <Film className="size-8" aria-hidden />
            <p className="text-sm">Add clips to preview your Reel</p>
          </div>
        )}
        {cue && (
          <div className={cn("pointer-events-none absolute inset-x-4 text-center", subtitleStyle.position === "middle" ? "top-1/2 -translate-y-1/2" : "bottom-[16%]")}>
            <span
              lang="th"
              className="font-thai inline-block whitespace-pre-line px-2 py-0.5 text-[clamp(14px,4.2cqw,22px)] font-bold leading-snug"
              style={{
                fontFamily: subtitleStyle.fontFamily.startsWith("Prompt") ? "var(--font-prompt), var(--font-thai)" : "var(--font-thai)",
                color: subtitleStyle.textColor,
                background: subtitleStyle.boxColor ? `${subtitleStyle.boxColor}cc` : undefined,
                textShadow: subtitleStyle.boxColor ? undefined : `0 0 3px ${subtitleStyle.outlineColor}, 0 0 3px ${subtitleStyle.outlineColor}, 0 1px 2px ${subtitleStyle.outlineColor}`,
                borderRadius: 6,
              }}
            >
              {cue.text}
            </span>
          </div>
        )}
        {error && <p className="absolute inset-x-3 top-3 rounded-xl bg-danger-100 px-3 py-2 text-xs font-medium text-danger-700">{error}</p>}
        <div className="absolute inset-x-0 bottom-0 flex items-center gap-2 bg-gradient-to-t from-teal-950/80 to-transparent p-3 text-white">
          <button type="button" onClick={toggle} disabled={!segs.length} className="inline-flex size-11 items-center justify-center rounded-full bg-white/15 backdrop-blur hover:bg-white/25" aria-label={playing ? "Pause preview" : "Play preview"}>
            {playing ? <Pause className="size-5" fill="currentColor" /> : <Play className="size-5" fill="currentColor" />}
          </button>
          <button type="button" onClick={() => seek(0)} disabled={!segs.length} className="inline-flex size-11 items-center justify-center rounded-full hover:bg-white/15" aria-label="Back to start">
            <SkipBack className="size-4" />
          </button>
          <span className="ml-auto text-xs tabular-nums" aria-live="off">
            {formatDuration(t)} / {formatDuration(total)}
          </span>
          <span className="rounded-md bg-white/15 px-1.5 py-0.5 text-[10px] font-semibold">9:16</span>
        </div>
      </div>
      <p className="mt-2 text-center text-[11px] text-ink-500">Live edit preview (muted). The final render applies subtitles, music and branding.</p>
    </div>
  );
});

/** Plays a finished render file. */
export function RenderPlayer({ driveFileId, className, simulated }: { driveFileId: string | null; className?: string; simulated?: boolean }) {
  return (
    <div className={cn("relative mx-auto w-full", className)}>
      <div className="relative aspect-[9/16] overflow-hidden rounded-[22px] bg-teal-950 shadow-[var(--shadow-raised)]">
        {driveFileId ? (
          <video key={driveFileId} src={streamUrl(driveFileId)} className="absolute inset-0 size-full object-cover" controls playsInline preload="metadata" aria-label="Rendered Reel" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-teal-200">No playable render yet.</div>
        )}
        {simulated && (
          <span className="pointer-events-none absolute left-3 top-3 rounded-full border border-dashed border-peach-300 bg-teal-950/70 px-2.5 py-1 text-[11px] font-semibold text-peach-200">
            Demo stand-in — not a real render
          </span>
        )}
      </div>
    </div>
  );
}
