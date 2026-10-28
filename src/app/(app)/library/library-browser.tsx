"use client";
import Link from "next/link";
import { useState, useTransition } from "react";
import { Check, Folder, Film, Music, Download, Clapperboard, X } from "lucide-react";
import type { DriveItem } from "@/server/adapters/types";
import { Thumb } from "@/components/media";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { importFootageAction, createReelFromDriveAction } from "@/app/actions";
import { formatDuration } from "@/lib/time";
import { orientationOf, ORIENTATION_LABEL } from "@/lib/media";
import { cn } from "@/lib/cn";

type ImportedMap = Record<string, { id: string; kind: "source" | "rendered"; availability: string }>;

export function LibraryBrowser({
  mode,
  items,
  imported,
  outputFolderId,
  query,
  currentFolderId,
}: {
  mode: "folder" | "search";
  items: DriveItem[];
  breadcrumbs: { id: string; name: string }[];
  imported: ImportedMap;
  sourceFolderId: string | null;
  outputFolderId: string | null;
  query?: string;
  currentFolderId?: string;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [pending, start] = useTransition();
  const toast = useToast();
  const folders = items.filter((i) => i.kind === "folder");
  const media = items.filter((i) => i.kind === "video" || i.kind === "audio");
  const inOutput = currentFolderId && currentFolderId === outputFolderId;
  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const selectable = media.filter((m) => m.kind === "video" && imported[m.id]?.kind !== "rendered" && !inOutput);

  if (!items.length) {
    return (
      <EmptyState
        icon={mode === "search" ? <Film /> : <Folder />}
        title={mode === "search" ? `No clips match “${query}”` : "This folder is empty"}
        description={mode === "search" ? "Try a different word, or browse folders instead." : "Add videos to this folder in Google Drive, then sync."}
      />
    );
  }

  return (
    <div className={cn(selected.length > 0 && "pb-28")}>
      {mode === "search" && (
        <p className="mb-3 text-sm text-ink-600">
          {items.length} result{items.length === 1 ? "" : "s"} for “{query}” · <Link href="/library" className="font-semibold text-teal-700 underline-offset-2 hover:underline">Clear search</Link>
        </p>
      )}
      {folders.length > 0 && (
        <ul className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
          {folders.map((f) => (
            <li key={f.id}>
              <Link href={`/library?folder=${encodeURIComponent(f.id)}`} className="flex min-h-14 items-center gap-3 rounded-2xl border border-line bg-white px-4 py-3 font-medium text-ink-900 shadow-[var(--shadow-card)] hover:border-teal-300">
                <Folder className={cn("size-5 shrink-0", f.id === outputFolderId ? "text-peach-600" : "text-teal-600")} strokeWidth={1.6} aria-hidden />
                <span className="truncate text-sm">{f.name}</span>
                {f.id === outputFolderId && <Badge tone="peach" className="ml-auto">Output</Badge>}
              </Link>
            </li>
          ))}
        </ul>
      )}
      {media.length > 0 && (
        <>
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-ink-700">{inOutput ? "Rendered Reels (output)" : "Videos"}</h2>
            {selectable.length > 0 && (
              <Button variant="ghost" onClick={() => setSelected(selected.length === selectable.length ? [] : selectable.map((m) => m.id))}>
                {selected.length === selectable.length ? "Clear selection" : "Select all"}
              </Button>
            )}
          </div>
          <ul className="grid grid-cols-2 gap-4 xs:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
            {media.map((m) => {
              const imp = imported[m.id];
              const rendered = imp?.kind === "rendered" || inOutput;
              const isSel = selected.includes(m.id);
              const canSelect = m.kind === "video" && !rendered;
              const o = orientationOf(m.width, m.height);
              return (
                <li key={m.id}>
                  <button
                    type="button"
                    onClick={() => canSelect && toggle(m.id)}
                    disabled={!canSelect}
                    aria-pressed={canSelect ? isSel : undefined}
                    aria-label={`${m.name}${canSelect ? (isSel ? ", selected" : ", select") : rendered ? ", rendered output" : ""}`}
                    className={cn("group block w-full rounded-2xl text-left disabled:cursor-default", isSel && "ring-[3px] ring-peach-500 ring-offset-2 ring-offset-[#f6f8f7]")}
                  >
                    {m.kind === "audio" ? (
                      <div className="flex aspect-[9/16] items-center justify-center rounded-2xl bg-teal-50 text-teal-600"><Music className="size-8" aria-hidden /></div>
                    ) : (
                      <Thumb driveFileId={m.hasThumbnail ? m.id : null}>
                        <span className="absolute bottom-2 right-2 rounded-md bg-teal-950/70 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-white">{formatDuration(m.durationMs)}</span>
                        {canSelect && (
                          <span className={cn("absolute right-2 top-2 flex size-7 items-center justify-center rounded-full border-2 border-white shadow", isSel ? "bg-peach-500 text-white" : "bg-teal-950/30")} aria-hidden>
                            {isSel && <Check className="size-4" strokeWidth={3} />}
                          </span>
                        )}
                        {rendered && <span className="absolute left-2 top-2"><Badge tone="peach">Rendered</Badge></span>}
                        {!rendered && imp && <span className="absolute left-2 top-2"><Badge tone="teal">In library</Badge></span>}
                      </Thumb>
                    )}
                    <p className="mt-2 truncate text-[13px] font-medium text-ink-900">{m.name}</p>
                    <p className="flex flex-wrap items-center gap-1 text-xs text-ink-500">
                      {m.kind === "audio" ? "Audio" : ORIENTATION_LABEL[o]}
                      {m.width && m.height ? <span className="tabular-nums">· {m.width}×{m.height}</span> : null}
                      {o === "landscape" && <span className="text-warning-700">· will be cropped</span>}
                    </p>
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {selected.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-40 px-3 pb-3 safe-pb md:left-[100px] lg:left-[244px]">
          <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-2 rounded-2xl border border-line bg-white px-4 py-3 shadow-[var(--shadow-raised)]" role="region" aria-label="Selection actions">
            <span className="mr-auto text-sm font-semibold text-ink-900" aria-live="polite">{selected.length} selected</span>
            <Button variant="ghost" size="icon" aria-label="Clear selection" onClick={() => setSelected([])}><X className="size-5" /></Button>
            <Button
              loading={pending}
              icon={<Download className="size-4" />}
              onClick={() =>
                start(async () => {
                  const r = await importFootageAction(selected);
                  if (r.ok) {
                    toast({ tone: "success", message: `Added ${selected.length} clip(s) to your library` });
                    setSelected([]);
                  } else toast({ tone: "error", message: r.error });
                })
              }
            >
              Add to library
            </Button>
            <Button
              variant="primary"
              loading={pending}
              icon={<Clapperboard className="size-4" />}
              onClick={() =>
                start(async () => {
                  const r = await createReelFromDriveAction(selected);
                  if (r && !r.ok) toast({ tone: "error", message: r.error });
                })
              }
            >
              Create Reel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
