import Link from "next/link";
import { CircleCheck, CircleAlert, Info, TriangleAlert, Activity as ActivityIcon } from "lucide-react";
import { listActivity } from "@/server/services/activity";
import { getSettings } from "@/server/services/overview";
import type { ActivityCategory, ActivityLevel } from "@/server/db/schema";
import { PageHeader, EmptyState } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { EventActions } from "./event-actions";
import { formatInTz, relativeTime, tzLabel } from "@/lib/time";
import { cn } from "@/lib/cn";

export const metadata = { title: "Activity" };

const CATS: (ActivityCategory | "all")[] = ["all", "editing", "rendering", "approval", "publishing", "drive", "connection"];
const LEVELS: (ActivityLevel | "all")[] = ["all", "error", "warning", "success", "info"];
const ICON = { success: CircleCheck, error: CircleAlert, warning: TriangleAlert, info: Info } as const;
const TONE = { success: "text-success-700 bg-success-100", error: "text-danger-700 bg-danger-100", warning: "text-warning-700 bg-warning-100", info: "text-info-700 bg-info-100" } as const;

export default async function ActivityPage({ searchParams }: { searchParams: Promise<{ category?: string; level?: string }> }) {
  const sp = await searchParams;
  const category = (CATS.includes(sp.category as ActivityCategory) ? sp.category : "all") as ActivityCategory | "all";
  const level = (LEVELS.includes(sp.level as ActivityLevel) ? sp.level : "all") as ActivityLevel | "all";
  const [events, s] = await Promise.all([listActivity({ category, level, limit: 200 }), getSettings()]);
  const tz = s?.timezone ?? "Asia/Bangkok";
  const q = (patch: Record<string, string>) => {
    const p = new URLSearchParams({ ...(category !== "all" ? { category } : {}), ...(level !== "all" ? { level } : {}), ...patch });
    for (const [k, v] of [...p.entries()]) if (v === "all") p.delete(k);
    return `/activity?${p}`;
  };
  return (
    <div>
      <PageHeader title="Activity" description={<>Editing, rendering, approval and publishing events. Times in {tzLabel(tz)}.</>} />
      <div className="mb-5 space-y-2">
        <nav aria-label="Filter by type" className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin">
          {CATS.map((c) => (
            <Link key={c} href={q({ category: c })} aria-current={category === c ? "page" : undefined} className={cn("inline-flex min-h-11 shrink-0 items-center rounded-full border px-4 text-sm font-semibold capitalize", category === c ? "border-teal-700 bg-teal-700 text-white" : "border-line-strong bg-white text-ink-700 hover:bg-teal-50")}>
              {c}
            </Link>
          ))}
        </nav>
        <nav aria-label="Filter by level" className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin">
          {LEVELS.map((l) => (
            <Link key={l} href={q({ level: l })} aria-current={level === l ? "page" : undefined} className={cn("inline-flex min-h-11 shrink-0 items-center rounded-full border px-3 text-xs font-semibold capitalize", level === l ? "border-ink-700 bg-ink-700 text-white" : "border-line bg-white text-ink-600 hover:bg-teal-50")}>
              {l === "all" ? "All levels" : l === "error" ? "Failures" : l}
            </Link>
          ))}
        </nav>
      </div>
      {events.length ? (
        <ol className="divide-y divide-line overflow-hidden rounded-[var(--radius-card)] border border-line bg-white shadow-[var(--shadow-card)]">
          {events.map((e) => {
            const Icon = ICON[e.level];
            return (
              <li key={e.id} className={cn("flex gap-3 px-4 py-3.5", e.resolvedAt && "opacity-60")}>
                <span className={cn("mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl", TONE[e.level])} aria-hidden><Icon className="size-[18px]" /></span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                    <p className="font-medium text-ink-900">{e.title}</p>
                    <Badge className="capitalize">{e.category}</Badge>
                    {e.resolvedAt && <Badge tone="success">Resolved</Badge>}
                  </div>
                  {e.detail && <p lang="th" className="mt-0.5 text-sm text-ink-600">{e.detail}</p>}
                  <p className="mt-1 text-xs text-ink-500">
                    <time dateTime={e.at.toISOString()}>{formatInTz(e.at, tz, "d MMM yyyy, HH:mm:ss")}</time> · {relativeTime(e.at)}
                    {e.projectId && <> · <Link href={`/review/${e.projectId}`} className="font-semibold text-teal-700 hover:underline">Open Reel</Link></>}
                  </p>
                  {(e.action || ((e.level === "error" || e.level === "warning") && !e.resolvedAt)) && <EventActions eventId={e.id} action={e.action} resolvable={(e.level === "error" || e.level === "warning") && !e.resolvedAt} />}
                </div>
              </li>
            );
          })}
        </ol>
      ) : (
        <EmptyState icon={<ActivityIcon />} title="No activity" description="Events appear here as you edit, render and publish." />
      )}
    </div>
  );
}
