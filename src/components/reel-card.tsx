import Link from "next/link";
import { CheckCircle2, CircleDashed, Clock3, Loader2, PenLine, TriangleAlert } from "lucide-react";
import type { ProjectListItem } from "@/server/services/projects";
import { Thumb } from "./media";
import { PROJECT_STATUS } from "./status";
import { formatDuration } from "@/lib/time";
import { cn } from "@/lib/cn";

const ICON = {
  draft: PenLine,
  rendering: Loader2,
  needs_review: Clock3,
  changes_requested: CircleDashed,
  approved: CheckCircle2,
  render_failed: TriangleAlert,
} as const;

export function ReelCard({ reel, href }: { reel: ProjectListItem; href?: string }) {
  const s = PROJECT_STATUS[reel.status];
  const Icon = ICON[reel.status];
  const target = href ?? (reel.status === "needs_review" || reel.status === "approved" ? `/review/${reel.id}` : `/create/${reel.id}`);
  return (
    <Link href={target} className="group block rounded-2xl focus-visible:outline-offset-4">
      <Thumb driveFileId={reel.render?.outputDriveFileId ?? reel.thumbDriveFileId} className="shadow-[var(--shadow-card)] transition-transform group-hover:-translate-y-0.5">
        <div className="absolute inset-0 bg-gradient-to-t from-teal-950/75 via-teal-950/5 to-transparent" />
        <span
          className={cn(
            "absolute left-2.5 top-2.5 inline-flex items-center gap-1 rounded-full bg-white/92 px-2 py-1 text-[11px] font-semibold shadow-sm",
            reel.status === "approved" ? "text-success-700" : reel.status === "needs_review" ? "text-peach-700" : reel.status === "render_failed" ? "text-danger-700" : "text-ink-700",
          )}
        >
          <Icon className={cn("size-3.5", reel.status === "rendering" && "animate-spin motion-reduce:animate-none")} aria-hidden />
          {s.label}
        </span>
        <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 p-3 text-white">
          <span className="line-clamp-2 text-[15px] font-semibold leading-snug">{reel.title}</span>
          {reel.editDurationMs > 0 && <span className="shrink-0 text-xs tabular-nums opacity-90">{formatDuration(reel.editDurationMs)}</span>}
        </div>
      </Thumb>
    </Link>
  );
}
