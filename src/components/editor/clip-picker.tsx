"use client";
import { useState } from "react";
import { Check } from "lucide-react";
import Link from "next/link";
import { Dialog } from "../ui/dialog";
import { Button } from "../ui/button";
import { Thumb } from "../media";
import { EmptyState } from "../ui/misc";
import type { LibraryClip } from "./types";
import { formatDuration } from "@/lib/time";
import { orientationOf, ORIENTATION_LABEL } from "@/lib/media";
import { cn } from "@/lib/cn";

export function ClipPicker({ open, onOpenChange, library, onAdd }: { open: boolean; onOpenChange: (o: boolean) => void; library: LibraryClip[]; onAdd: (clips: LibraryClip[]) => void }) {
  const [sel, setSel] = useState<string[]>([]);
  const [q, setQ] = useState("");
  const list = library.filter((c) => c.available && c.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) setSel([]);
      }}
      title="Add clips"
      description="Choose source footage from your library. Add more from Drive in the Library."
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            variant="primary"
            disabled={!sel.length}
            onClick={() => {
              onAdd(sel.map((id) => library.find((c) => c.id === id)!));
              setSel([]);
              onOpenChange(false);
            }}
          >
            Add {sel.length || ""} clip{sel.length === 1 ? "" : "s"}
          </Button>
        </>
      }
    >
      <label className="sr-only" htmlFor="clip-search">Filter clips</label>
      <input id="clip-search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter by name…" className="mb-4 min-h-11 w-full rounded-full border border-line-strong px-4 text-sm focus:border-teal-500 focus:outline-none focus:shadow-[var(--shadow-focus)]" />
      {list.length ? (
        <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4">
          {list.map((c) => {
            const on = sel.includes(c.id);
            return (
              <li key={c.id}>
                <button type="button" aria-pressed={on} onClick={() => setSel((s) => (on ? s.filter((x) => x !== c.id) : [...s, c.id]))} className={cn("block w-full rounded-2xl text-left", on && "ring-[3px] ring-peach-500 ring-offset-2")}>
                  <Thumb driveFileId={c.driveFileId}>
                    <span className="absolute bottom-1.5 right-1.5 rounded bg-teal-950/70 px-1 text-[10px] font-semibold text-white">{formatDuration(c.durationMs)}</span>
                    {on && <span className="absolute right-1.5 top-1.5 flex size-6 items-center justify-center rounded-full bg-peach-500 text-white"><Check className="size-4" strokeWidth={3} aria-hidden /></span>}
                  </Thumb>
                  <p className="mt-1 truncate text-xs font-medium">{c.name}</p>
                  <p className="text-[11px] text-ink-500">{ORIENTATION_LABEL[orientationOf(c.width, c.height)]}</p>
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState title="No clips found" description="Add footage from Google Drive first." action={<Link href="/library" className="font-semibold text-teal-700 underline">Open Drive Library</Link>} />
      )}
    </Dialog>
  );
}
