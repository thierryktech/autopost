import Link from "next/link";
import { AlertTriangle, Film } from "lucide-react";
import type { Footage } from "@/server/db/schema";
import { Thumb } from "@/components/media";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/misc";
import { formatDuration } from "@/lib/time";
import { orientationOf, ORIENTATION_LABEL } from "@/lib/media";

export function ImportedList({ items, kind }: { items: Footage[]; kind: "source" | "rendered" }) {
  if (!items.length) {
    return (
      <EmptyState
        icon={<Film />}
        title={kind === "rendered" ? "No rendered Reels yet" : "No footage in your library"}
        description={kind === "rendered" ? "Rendered videos are saved to your Drive output folder and listed here." : "Browse Drive and add clips, or choose a source folder to sync automatically."}
      />
    );
  }
  return (
    <ul className="divide-y divide-line overflow-hidden rounded-[var(--radius-card)] border border-line bg-white shadow-[var(--shadow-card)]">
      {items.map((f) => {
        const o = orientationOf(f.width, f.height);
        const bad = f.availability !== "available";
        return (
          <li key={f.id} className="flex items-center gap-4 px-4 py-3">
            <Thumb driveFileId={f.driveFileId} unavailable={bad} className="w-14 shrink-0 rounded-xl" />
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-ink-900">{f.name}</p>
              <p className="text-xs text-ink-500">
                {formatDuration(f.durationMs)} · {ORIENTATION_LABEL[o]} · <span className="font-mono text-[11px]" title="Stable Google Drive file ID">ID {f.driveFileId}</span>
              </p>
              {bad && (
                <p className="mt-1 flex items-start gap-1.5 text-xs text-warning-700">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                  {f.syncError ?? "Unavailable in Drive."} Restore it in Drive and sync, or replace it in affected drafts.
                </p>
              )}
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              {bad ? <Badge tone="warning">{f.availability === "permission_denied" ? "No access" : "Unavailable"}</Badge> : <Badge tone={kind === "rendered" ? "peach" : "teal"}>{kind === "rendered" ? "Rendered" : "Source"}</Badge>}
              {f.isDemo && <Badge tone="demo">Demo</Badge>}
            </div>
          </li>
        );
      })}
      <li className="px-4 py-3 text-xs text-ink-500">
        Missing a clip? <Link href="/library?tab=browse" className="font-semibold text-teal-700 hover:underline">Browse Drive</Link> to add it.
      </li>
    </ul>
  );
}
