"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { Check, Clapperboard } from "lucide-react";
import { Thumb } from "@/components/media";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { EmptyState } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { createReelAction } from "@/app/actions";
import type { LibraryClip } from "@/components/editor/types";
import { formatDuration } from "@/lib/time";
import { cn } from "@/lib/cn";

export function NewReelForm({ library }: { library: LibraryClip[] }) {
  const [sel, setSel] = useState<string[]>([]);
  const [title, setTitle] = useState("");
  const [pending, start] = useTransition();
  const toast = useToast();
  if (!library.length) {
    return <EmptyState icon={<Clapperboard />} title="Your library is empty" description="Connect Google Drive and add some footage first." action={<Link href="/library" className="font-semibold text-teal-700 underline">Open Drive Library</Link>} />;
  }
  return (
    <section aria-labelledby="new-reel" className="rounded-[var(--radius-card)] border border-line bg-white p-5 shadow-[var(--shadow-card)]">
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1">
          <h2 id="new-reel" className="text-[15px] font-semibold text-ink-900">New Reel</h2>
          <p className="text-sm text-ink-500">Select clips in the order you’d like them (you can reorder later).</p>
        </div>
        <div className="w-full sm:w-72">
          <label htmlFor="new-title" className="sr-only">Title</label>
          <Input id="new-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title (optional)" maxLength={120} />
        </div>
        <Button
          variant="primary"
          loading={pending}
          icon={<Clapperboard className="size-4" />}
          onClick={() =>
            start(async () => {
              const r = await createReelAction({ title, footageIds: sel });
              if (r && !r.ok) toast({ tone: "error", message: r.error });
            })
          }
        >
          {sel.length ? `Create with ${sel.length} clip${sel.length === 1 ? "" : "s"}` : "Create empty Reel"}
        </Button>
      </div>
      <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6 xl:grid-cols-8">
        {library.map((c) => {
          const idx = sel.indexOf(c.id);
          return (
            <li key={c.id}>
              <button type="button" aria-pressed={idx >= 0} onClick={() => setSel((s) => (idx >= 0 ? s.filter((x) => x !== c.id) : [...s, c.id]))} className={cn("block w-full rounded-2xl text-left", idx >= 0 && "ring-[3px] ring-peach-500 ring-offset-2")}>
                <Thumb driveFileId={c.driveFileId}>
                  <span className="absolute bottom-1.5 right-1.5 rounded bg-teal-950/70 px-1 text-[10px] font-semibold text-white">{formatDuration(c.durationMs)}</span>
                  {idx >= 0 && <span className="absolute right-1.5 top-1.5 flex size-6 items-center justify-center rounded-full bg-peach-500 text-xs font-bold text-white">{idx + 1}</span>}
                  {idx < 0 && <span className="absolute right-1.5 top-1.5 size-6 rounded-full border-2 border-white bg-teal-950/30" aria-hidden />}
                </Thumb>
                <p className="mt-1 truncate text-xs font-medium">{c.name}</p>
              </button>
            </li>
          );
        })}
      </ul>
      {sel.length > 0 && <p className="mt-3 flex items-center gap-1 text-xs text-ink-500"><Check className="size-3.5" aria-hidden /> Order: {sel.map((id) => library.find((l) => l.id === id)?.name).join(" → ")}</p>}
    </section>
  );
}
