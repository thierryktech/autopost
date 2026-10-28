import Link from "next/link";
import { ClipboardCheck } from "lucide-react";
import { listProjects } from "@/server/services/projects";
import type { ProjectStatus } from "@/server/db/schema";
import { PageHeader, EmptyState } from "@/components/ui/misc";
import { ReelCard } from "@/components/reel-card";
import { PROJECT_STATUS } from "@/components/status";
import { cn } from "@/lib/cn";

export const metadata = { title: "Review Queue" };

const FILTERS: (ProjectStatus | "all")[] = ["all", "needs_review", "changes_requested", "rendering", "draft", "approved", "render_failed"];

export default async function ReviewQueuePage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const sp = await searchParams;
  const status = (FILTERS.includes(sp.status as ProjectStatus) ? sp.status : "all") as ProjectStatus | "all";
  const all = await listProjects();
  const items = status === "all" ? all : all.filter((p) => p.status === status);
  const count = (s: ProjectStatus | "all") => (s === "all" ? all.length : all.filter((p) => p.status === s).length);
  return (
    <div>
      <PageHeader title="Review Queue" description="Watch each render, check the Thai caption and product, then approve or request changes. Only approved drafts can be published." />
      <nav aria-label="Filter by status" className="mb-5 flex gap-2 overflow-x-auto pb-1 scrollbar-thin">
        {FILTERS.map((f) => (
          <Link
            key={f}
            href={f === "all" ? "/review" : `/review?status=${f}`}
            aria-current={status === f ? "page" : undefined}
            className={cn(
              "inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-semibold",
              status === f ? "border-teal-700 bg-teal-700 text-white" : "border-line-strong bg-white text-ink-700 hover:bg-teal-50",
            )}
          >
            {f === "all" ? "All" : PROJECT_STATUS[f].label}
            <span className={cn("rounded-full px-1.5 text-xs", status === f ? "bg-white/20" : "bg-teal-50")}>{count(f)}</span>
          </Link>
        ))}
      </nav>
      {items.length ? (
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6">
          {items.map((r) => (
            <li key={r.id}>
              <ReelCard reel={r} href={r.status === "draft" ? `/create/${r.id}` : `/review/${r.id}`} />
              <p className="mt-1.5 truncate px-1 text-xs text-ink-500">{r.productName ?? "No product"}{r.render ? ` · v${r.render.versionNo}` : ""}</p>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState icon={<ClipboardCheck />} title="Nothing here" description={status === "needs_review" ? "No drafts are waiting for review. Rendered drafts appear here automatically." : "No Reels match this filter."} />
      )}
    </div>
  );
}
