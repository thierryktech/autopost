import type { CreativeBrief, ProjectStage, SubtitleCue } from "@/server/db/schema";

export interface EditorClip {
  key: string; // client-side identity
  footageId: string;
  driveFileId: string;
  name: string;
  durationMs: number;
  width: number | null;
  height: number | null;
  available: boolean;
  inMs: number;
  outMs: number;
}

export interface EditorDraft {
  title: string;
  stage: ProjectStage;
  brief: CreativeBrief;
  captionTh: string;
  subtitles: SubtitleCue[];
  productId: string | null;
  clips: EditorClip[];
}

export interface LibraryClip {
  id: string;
  driveFileId: string;
  name: string;
  durationMs: number | null;
  width: number | null;
  height: number | null;
  available: boolean;
}

export function editDuration(clips: EditorClip[]) {
  return clips.reduce((s, c) => s + Math.max(0, c.outMs - c.inMs), 0);
}

export function segments(clips: EditorClip[]) {
  let at = 0;
  return clips.map((c) => {
    const seg = { ...c, startAt: at, len: Math.max(0, c.outMs - c.inMs) };
    at += seg.len;
    return seg;
  });
}

export function toPatch(d: EditorDraft) {
  return {
    title: d.title,
    stage: d.stage,
    brief: { ...d.brief, productId: d.productId },
    captionTh: d.captionTh,
    subtitles: d.subtitles,
    productId: d.productId,
    clips: d.clips.map((c) => ({ footageId: c.footageId, inMs: c.inMs, outMs: c.outMs })),
  };
}

export const fmtSec = (ms: number) => (ms / 1000).toFixed(1);
