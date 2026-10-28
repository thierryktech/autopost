import Link from "next/link";
import { ArrowRight, Clapperboard, ClipboardCheck, CalendarClock, Send, FolderOpen, ChevronRight, CircleAlert, Loader2, Bot, Server } from "lucide-react";
import { getOverview, getShellData } from "@/server/services/overview";
import { listProjects } from "@/server/services/projects";
import { Card, CardHeader, CardBody } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { Stat, EmptyState, ProgressBar } from "@/components/ui/misc";
import { Badge, DemoBadge } from "@/components/ui/badge";
import { PourOverIllustration } from "@/components/illustrations";
import { ReelCard } from "@/components/reel-card";
import { ConnectionBadge, PlanStatusBadge } from "@/components/status";
import { formatInTz, tzLabel } from "@/lib/time";
import { cn } from "@/lib/cn";

export const metadata = { title: "Overview" };

const JOB_LABEL = { render: "Rendering", claude_draft: "Preparing edit draft", drive_sync: "Syncing Drive", publish: "Publishing", reconcile_publish: "Checking Facebook" } as const;

export default async function OverviewPage() {
  const [ov, shell, reels] = await Promise.all([getOverview(), getShellData(), listProjects()]);
  const tz = shell.timezone;
  const conn = (p: string) => shell.connections.find((c) => c.provider === p);
  const providers = [
    { key: "google_drive", label: "Google Drive", icon: <FolderOpen className="size-5" />, href: "/settings#integrations" },
    { key: "facebook", label: "Facebook Page", icon: <Send className="size-5" />, href: "/settings#integrations" },
    { key: "claude", label: "Claude (edit & copy)", icon: <Bot className="size-5" />, href: "/settings#integrations" },
    { key: "worker", label: "Editing worker", icon: <Server className="size-5" />, href: "/settings#integrations" },
  ];
  const workerBeat = conn("worker")?.lastCheckedAt;
  const workerStale = !workerBeat || Date.now() - workerBeat.getTime() > 3 * 60_000;

  return (
    <div className="space-y-6">
      {!shell.onboarded && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-peach-200 bg-peach-50 px-4 py-3 text-sm">
          <p className="mr-auto text-ink-700"><strong className="text-ink-900">Finish setting up.</strong> Connect Drive and Facebook, start the worker and add your brand details.</p>
          <ButtonLink href="/onboarding" variant="peach">Open setup guide</ButtonLink>
        </div>
      )}
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(300px,1fr)]">
        <section aria-labelledby="hero-title" className="relative overflow-hidden rounded-[var(--radius-card)] bg-gradient-hero px-6 py-7 shadow-[var(--shadow-card)] md:px-8">
          <div className="relative z-10 max-w-[58%] max-sm:max-w-none">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-teal-600">{shell.anyDemo ? "Demo workspace" : "Balena workspace"}</p>
            <h1 id="hero-title" className="mt-2 text-[28px] font-semibold leading-tight tracking-tight text-teal-900 md:text-[34px]">
              Your next story
              <br />
              starts here
            </h1>
            <p className="mt-2 text-sm text-ink-600">Turn your coffee moments into beautiful Reels — from bean to cup.</p>
            <ButtonLink href="/create" variant="primary" size="lg" className="mt-5" icon={<Clapperboard className="size-5" strokeWidth={1.75} />}>
              Create Reel <ArrowRight className="size-4" aria-hidden />
            </ButtonLink>
          </div>
          <PourOverIllustration className="pointer-events-none absolute -bottom-2 right-0 h-[88%] max-sm:hidden" />
        </section>

        <Card className="bg-gradient-peach border-peach-200">
          <CardHeader title="Connections" description="Health of the services Balena relies on" />
          <CardBody className="space-y-2">
            {providers.map((p) => {
              const c = conn(p.key);
              const status = p.key === "worker" && c && workerStale && c.status !== "demo" ? "error" : c?.status ?? "disconnected";
              return (
                <Link key={p.key} href={p.href} className="flex min-h-12 items-center gap-3 rounded-2xl bg-white/80 px-3 py-2 transition-colors hover:bg-white">
                  <span className="flex size-9 items-center justify-center rounded-xl bg-teal-50 text-teal-700" aria-hidden>{p.icon}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-ink-900">{p.label}</p>
                    <p className="truncate text-xs text-ink-500">
                      {p.key === "worker" && workerStale && c?.status !== "demo" ? "No heartbeat in the last 3 minutes" : c?.lastError ?? c?.accountLabel ?? "Not connected"}
                    </p>
                  </div>
                  <ConnectionBadge status={status} />
                </Link>
              );
            })}
          </CardBody>
        </Card>
      </div>

      <section aria-labelledby="pipeline">
        <h2 id="pipeline" className="mb-3 text-[15px] font-semibold text-ink-900">Your Reel pipeline</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Link href="/library" className="rounded-2xl"><Stat icon={<FolderOpen />} value={ov.stats.sourceClips} label="Source clips" /></Link>
          <Link href="/review?status=needs_review" className="rounded-2xl"><Stat icon={<ClipboardCheck />} value={ov.stats.needsReview} label="Drafts to review" tone="peach" /></Link>
          <Link href="/calendar" className="rounded-2xl"><Stat icon={<CalendarClock />} value={ov.stats.planned} label="Planned posts" /></Link>
          <Link href="/calendar?view=agenda" className="rounded-2xl"><Stat icon={<Send />} value={ov.stats.published} label="Confirmed published" /></Link>
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(300px,1fr)]">
        <section aria-labelledby="recent">
          <div className="mb-3 flex items-center justify-between">
            <h2 id="recent" className="text-[15px] font-semibold text-ink-900">Recent Reels</h2>
            <Link href="/review" className="inline-flex min-h-11 items-center gap-1 rounded-xl px-2 text-sm font-semibold text-teal-700 hover:bg-white">
              View all <ChevronRight className="size-4" aria-hidden />
            </Link>
          </div>
          {reels.length ? (
            <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 2xl:grid-cols-4">
              {reels.slice(0, 6).map((r) => (
                <li key={r.id}><ReelCard reel={r} /></li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={<Clapperboard />} title="No Reels yet" description="Pick a few clips from Drive and Balena will help you shape them into a Reel." action={<ButtonLink href="/create" variant="primary">Create your first Reel</ButtonLink>} />
          )}
        </section>

        <div className="space-y-5">
          <Card>
            <CardHeader
              title="Upcoming plans"
              description={<>Times in {tzLabel(tz)}</>}
              action={<Link href="/calendar" className="inline-flex min-h-11 items-center gap-1 rounded-xl px-2 text-sm font-semibold text-teal-700 hover:bg-teal-50">View all <ChevronRight className="size-4" aria-hidden /></Link>}
            />
            <CardBody className="pt-3">
              {ov.upcoming.length ? (
                <ul className="divide-y divide-line">
                  {ov.upcoming.map(({ plan, title }) => (
                    <li key={plan.id}>
                      <Link href={`/calendar?plan=${plan.id}`} className="-mx-2 flex min-h-12 items-center gap-3 rounded-xl px-2 py-2 hover:bg-teal-50">
                        <span className="w-14 shrink-0 text-xs font-semibold text-ink-700">{formatInTz(plan.scheduledAt, tz, "d MMM")}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm text-ink-900">{title}</span>
                          <PlanStatusBadge status={plan.status} simulated={plan.isSimulated} />
                        </span>
                        <span className="text-xs tabular-nums text-ink-500">{formatInTz(plan.scheduledAt, tz, "HH:mm")}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="py-4 text-sm text-ink-500">Nothing planned yet. Approve a Reel, then plan it on the calendar.</p>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Job progress" description="Renders, drafts and publishing run on the worker, not in your browser." />
            <CardBody className="pt-3">
              {ov.jobs.length || ov.activeRenders.length ? (
                <ul className="space-y-3">
                  {ov.activeRenders.map(({ r, title }) => (
                    <li key={r.id} className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2 text-sm">
                        <Link href={`/create/${r.projectId}`} className="truncate font-medium text-ink-900 hover:underline">Render v{r.versionNo} · {title}</Link>
                        <span className="text-xs tabular-nums text-ink-500">{r.status === "queued" ? "Queued" : `${r.progress}%`}</span>
                      </div>
                      <ProgressBar value={r.status === "queued" ? 2 : r.progress} label={`Render progress for ${title}`} />
                    </li>
                  ))}
                  {ov.jobs
                    .filter((j) => j.type !== "render")
                    .map((j) => (
                      <li key={j.id} className="flex items-center gap-2 text-sm">
                        {j.status === "running" ? (
                          <Loader2 className="size-4 animate-spin text-info-700 motion-reduce:animate-none" aria-hidden />
                        ) : j.status === "failed" || j.status === "blocked" ? (
                          <CircleAlert className="size-4 text-danger-700" aria-hidden />
                        ) : (
                          <span className="size-2 rounded-full bg-teal-300" aria-hidden />
                        )}
                        <span className={cn("flex-1 truncate", j.status === "failed" && "text-danger-700")}>{JOB_LABEL[j.type]}</span>
                        <Badge tone={j.status === "failed" || j.status === "blocked" ? "danger" : j.status === "running" ? "info" : "neutral"}>{j.status}</Badge>
                      </li>
                    ))}
                </ul>
              ) : (
                <p className="py-2 text-sm text-ink-500">No jobs running right now.</p>
              )}
              {shell.workerMode === "embedded" && <p className="mt-3 text-xs text-ink-500"><DemoBadge label="Embedded worker" className="mr-1" /> Jobs stop when this local server stops.</p>}
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
