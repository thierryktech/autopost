"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { ChevronLeft, ChevronRight, Globe, Plus, X, Clock, Calendar as CalIcon, Package, RefreshCw, ExternalLink, Copy, CheckCircle2, AlertTriangle, Pencil, Ban } from "lucide-react";
import type { ConnectionStatus, NativeTagInfo, PlanStatus, PublishMode } from "@/server/db/schema";
import { Button, ButtonLink } from "@/components/ui/button";
import { Badge, DemoBadge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/field";
import { Notice, EmptyState } from "@/components/ui/misc";
import { Thumb } from "@/components/media";
import { useToast } from "@/components/ui/toast";
import { PLAN_STATUS, PlanStatusBadge, ConnectionBadge } from "@/components/status";
import { createPlanAction, updatePlanAction, cancelPlanAction, checkPlanAction, retryFinishAction, startOverAction, markTagDoneAction, setCalendarViewAction } from "@/app/actions";
import { formatInTz, tzLabel, utcToZonedParts, dayKey } from "@/lib/time";
import { cn } from "@/lib/cn";

type PlanItem = { id: string; scheduledAt: string; status: PlanStatus; mode: PublishMode; isSimulated: boolean; title: string; projectId: string; thumbDriveFileId: string | null };
type Selected = {
  plan: PlanItem & {
    timezone: string;
    fbVideoId: string | null;
    fbPermalink: string | null;
    fbUploadStatus: string;
    fbProcessingStatus: string;
    fbScheduleStatus: string;
    fbPublishStatus: string;
    finishRequestedAt: string | null;
    confirmedAt: string | null;
    manualTagStatus: "not_needed" | "pending" | "done_by_user";
    lastError: string | null;
    captionSnapshot: string | null;
    project: { id: string; title: string; approvalValid: boolean };
  };
  attempts: { id: string; phase: string; outcome: string; createdAt: string }[];
  product: { name: string; destinationUrl: string | null; nativeTag: NativeTagInfo; type: string } | null;
} | null;

interface Props {
  view: "week" | "month" | "agenda";
  timezone: string;
  days: string[];
  anchorKey: string;
  todayKey: string;
  prevKey: string;
  nextKey: string;
  plans: PlanItem[];
  selected: Selected;
  approvedProjects: { id: string; title: string }[];
  allProjects: { id: string; title: string; approved: boolean }[];
  newForProjectId: string | null;
  defaults: { time: string; mode: PublishMode };
  facebook: { status: ConnectionStatus; label: string | null };
}

function useMediaQuery(q: string) {
  const [match, setMatch] = useState(false);
  useEffect(() => {
    const m = window.matchMedia(q);
    setMatch(m.matches);
    const on = () => setMatch(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, [q]);
  return match;
}

const HOURS = Array.from({ length: 17 }, (_, i) => i + 6); // 06:00–22:00

export function CalendarView(p: Props) {
  const router = useRouter();
  const sp = useSearchParams();
  const [newOpen, setNewOpen] = useState<{ date: string; time: string; projectId?: string } | null>(null);
  const tz = p.timezone;
  const isWide = useMediaQuery("(min-width: 1280px)");

  useEffect(() => {
    if (p.newForProjectId) setNewOpen({ date: p.todayKey, time: p.defaults.time, projectId: p.newForProjectId });
  }, [p.newForProjectId, p.todayKey, p.defaults.time]);

  const href = (patch: Record<string, string | null>) => {
    const q = new URLSearchParams(sp.toString());
    q.delete("new");
    for (const [k, v] of Object.entries(patch)) (v == null ? q.delete(k) : q.set(k, v));
    return `/calendar?${q.toString()}`;
  };

  const byDay = useMemo(() => {
    const m = new Map<string, PlanItem[]>();
    for (const pl of p.plans) {
      const k = dayKey(pl.scheduledAt, tz);
      m.set(k, [...(m.get(k) ?? []), pl]);
    }
    return m;
  }, [p.plans, tz]);

  const anchorMonth = p.anchorKey.slice(0, 7);
  const title =
    p.view === "month"
      ? formatInTz(`${p.anchorKey}T12:00:00Z`, "UTC", "MMMM yyyy")
      : `${formatInTz(`${p.days[0]}T12:00:00Z`, "UTC", "d MMM")} – ${formatInTz(`${p.days[p.days.length - 1]}T12:00:00Z`, "UTC", "d MMM yyyy")}`;

  const selectPlan = (id: string) => router.push(href({ plan: id }), { scroll: false });

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <h1 className="mr-2 text-2xl font-semibold tracking-tight text-ink-900">{title}</h1>
        <div className="flex items-center gap-1">
          <ButtonLink href={href({ d: p.prevKey })} size="icon" variant="ghost" aria-label="Previous"><ChevronLeft className="size-5" /></ButtonLink>
          <ButtonLink href={href({ d: p.nextKey })} size="icon" variant="ghost" aria-label="Next"><ChevronRight className="size-5" /></ButtonLink>
          <ButtonLink href={href({ d: null })} variant="ghost">Today</ButtonLink>
        </div>
        <span className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-line bg-white px-3 text-sm font-medium text-ink-700" title="All times are shown in this timezone">
          <Globe className="size-4 text-teal-600" aria-hidden /> {tzLabel(tz)}
        </span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <div role="group" aria-label="Calendar view" className="flex rounded-xl border border-line bg-white p-1">
            {(["week", "month", "agenda"] as const).map((v) => (
              <Link
                key={v}
                href={href({ view: v })}
                onClick={() => void setCalendarViewAction(v)}
                aria-current={p.view === v ? "page" : undefined}
                className={cn("inline-flex min-h-10 items-center rounded-lg px-3 text-sm font-semibold capitalize", p.view === v ? "bg-teal-700 text-white" : "text-ink-600 hover:bg-teal-50")}
              >
                {v}
              </Link>
            ))}
          </div>
          <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setNewOpen({ date: p.anchorKey < p.todayKey ? p.todayKey : p.anchorKey, time: p.defaults.time })}>New plan</Button>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0">
          {p.view === "week" && <WeekGrid days={p.days} todayKey={p.todayKey} byDay={byDay} tz={tz} selectedId={p.selected?.plan.id ?? null} onSelect={selectPlan} onNew={(date) => setNewOpen({ date, time: p.defaults.time })} />}
          {p.view === "month" && <MonthGrid days={p.days} anchorMonth={anchorMonth} todayKey={p.todayKey} byDay={byDay} tz={tz} onSelect={selectPlan} onNew={(date) => setNewOpen({ date, time: p.defaults.time })} />}
          {p.view === "agenda" && <Agenda days={p.days} byDay={byDay} tz={tz} onSelect={selectPlan} todayKey={p.todayKey} />}
          <Legend />
        </div>
        <aside className="hidden xl:block" aria-label="Plan details">
          {p.selected ? (
            <div className="sticky top-4 rounded-[var(--radius-card)] border border-line bg-white p-5 shadow-[var(--shadow-card)]">
              <PlanDetail sel={p.selected} tz={tz} facebook={p.facebook} onClose={() => router.push(href({ plan: null }), { scroll: false })} />
            </div>
          ) : (
            <div className="rounded-[var(--radius-card)] border border-dashed border-line-strong bg-cream/60 p-6 text-center text-sm text-ink-500">Select a plan to see its publishing status.</div>
          )}
        </aside>
      </div>

      {/* Plan detail as a sheet on iPad/phone */}
      <div className="xl:hidden">
        <Dialog open={!!p.selected && !isWide} onOpenChange={(o) => !o && router.push(href({ plan: null }), { scroll: false })} title={p.selected?.plan.title ?? "Plan"} size="md">
          {p.selected && <PlanDetail sel={p.selected} tz={tz} facebook={p.facebook} />}
        </Dialog>
      </div>

      <PlanFormDialog
        open={!!newOpen}
        onOpenChange={(o) => {
          if (!o) {
            setNewOpen(null);
            if (sp.get("new")) router.replace(href({}), { scroll: false });
          }
        }}
        initial={newOpen}
        tz={tz}
        projects={p.allProjects}
        defaultMode={p.defaults.mode}
      />
    </div>
  );
}

function PlanChip({ pl, tz, onSelect, selected, compact }: { pl: PlanItem; tz: string; onSelect: (id: string) => void; selected?: boolean; compact?: boolean }) {
  const s = PLAN_STATUS[pl.status];
  return (
    <button
      type="button"
      onClick={() => onSelect(pl.id)}
      aria-label={`${pl.title}, ${formatInTz(pl.scheduledAt, tz, "HH:mm")}, ${s.label}`}
      className={cn(
        "flex w-full min-h-11 items-start gap-2 rounded-xl border bg-white p-1.5 text-left shadow-sm transition-shadow hover:shadow-[var(--shadow-card)]",
        selected ? "border-teal-600 ring-1 ring-teal-600" : "border-line",
        pl.status === "cancelled" && "opacity-60",
      )}
    >
      {!compact && <Thumb driveFileId={pl.thumbDriveFileId} ratio="1/1" className="w-9 shrink-0 rounded-lg" />}
      <span className="min-w-0 flex-1">
        <span className={cn("block truncate text-[12px] font-semibold text-ink-900", pl.status === "cancelled" && "line-through")}>{pl.title}</span>
        <span className="block text-[11px] tabular-nums text-ink-500">{formatInTz(pl.scheduledAt, tz, "HH:mm")}</span>
        {!compact && <span className="mt-0.5 block"><Badge tone={s.tone} className="px-1.5 text-[10px]">{s.label}</Badge></span>}
      </span>
      {compact && <span className={cn("mt-1 size-2 shrink-0 rounded-full", { teal: "bg-teal-500", warning: "bg-warning-700", info: "bg-info-700", success: "bg-success-700", danger: "bg-danger-700", neutral: "bg-ink-400", peach: "bg-peach-500", demo: "bg-peach-500" }[s.tone])} aria-hidden />}
    </button>
  );
}

function WeekGrid({ days, todayKey, byDay, tz, selectedId, onSelect, onNew }: { days: string[]; todayKey: string; byDay: Map<string, PlanItem[]>; tz: string; selectedId: string | null; onSelect: (id: string) => void; onNew: (d: string) => void }) {
  return (
    <div className="overflow-x-auto rounded-[var(--radius-card)] border border-line bg-white shadow-[var(--shadow-card)] scrollbar-thin">
      <div className="grid min-w-[760px] grid-cols-[56px_repeat(7,minmax(0,1fr))]">
        <div className="border-b border-line" />
        {days.map((d) => (
          <div key={d} className={cn("flex items-center justify-between gap-1 border-b border-l border-line px-2 py-2", d === todayKey && "bg-teal-50")}>
            <div>
              <p className="text-[11px] font-semibold uppercase text-ink-500">{formatInTz(`${d}T12:00:00Z`, "UTC", "EEE")}</p>
              <p className={cn("whitespace-nowrap text-sm font-semibold", d === todayKey ? "text-teal-700" : "text-ink-900")}>{formatInTz(`${d}T12:00:00Z`, "UTC", "d MMM")}</p>
            </div>
            {d >= todayKey && (
              <button type="button" onClick={() => onNew(d)} className="inline-flex size-11 items-center justify-center rounded-lg text-ink-400 hover:bg-white hover:text-teal-700" aria-label={`New plan on ${d}`}>
                <Plus className="size-4" />
              </button>
            )}
          </div>
        ))}
        {HOURS.map((h) => (
          <div key={h} className="contents">
            <div className="h-16 border-b border-line pr-2 pt-1 text-right text-[11px] tabular-nums text-ink-400">{String(h).padStart(2, "0")}:00</div>
            {days.map((d) => {
              const items = (byDay.get(d) ?? []).filter((pl) => {
                const hour = Number(formatInTz(pl.scheduledAt, tz, "H"));
                return hour === h || (h === 6 && hour < 6) || (h === 22 && hour > 22);
              });
              return (
                <div key={d + h} className={cn("h-16 space-y-1 overflow-visible border-b border-l border-line p-1", d === todayKey && "bg-teal-50/40")}>
                  {items.map((pl) => <PlanChip key={pl.id} pl={pl} tz={tz} onSelect={onSelect} selected={pl.id === selectedId} compact />)}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function MonthGrid({ days, anchorMonth, todayKey, byDay, tz, onSelect, onNew }: { days: string[]; anchorMonth: string; todayKey: string; byDay: Map<string, PlanItem[]>; tz: string; onSelect: (id: string) => void; onNew: (d: string) => void }) {
  return (
    <div className="overflow-hidden rounded-[var(--radius-card)] border border-line bg-white shadow-[var(--shadow-card)]">
      <div className="grid grid-cols-7 border-b border-line bg-cream text-center text-[11px] font-semibold uppercase text-ink-500">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <div key={d} className="py-2">{d}</div>)}
      </div>
      <div className="grid grid-cols-7">
        {days.map((d) => {
          const items = byDay.get(d) ?? [];
          const inMonth = d.startsWith(anchorMonth);
          return (
            <div key={d} className={cn("min-h-28 border-b border-l border-line p-1.5 first:border-l-0 [&:nth-child(7n+1)]:border-l-0", !inMonth && "bg-cream/60", d === todayKey && "bg-teal-50")}>
              <div className="mb-1 flex items-center justify-between">
                <span className={cn("text-xs font-semibold", inMonth ? "text-ink-700" : "text-ink-400", d === todayKey && "rounded-full bg-teal-700 px-1.5 text-white")}>{Number(d.slice(8))}</span>
                {d >= todayKey && (
                  <button type="button" onClick={() => onNew(d)} className="inline-flex size-8 items-center justify-center rounded-lg text-ink-300 hover:bg-white hover:text-teal-700 max-md:size-11" aria-label={`New plan on ${d}`}>
                    <Plus className="size-3.5" />
                  </button>
                )}
              </div>
              <div className="space-y-1">
                {items.slice(0, 3).map((pl) => <PlanChip key={pl.id} pl={pl} tz={tz} onSelect={onSelect} compact />)}
                {items.length > 3 && <p className="px-1 text-[11px] text-ink-500">+{items.length - 3} more</p>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Agenda({ days, byDay, tz, onSelect, todayKey }: { days: string[]; byDay: Map<string, PlanItem[]>; tz: string; onSelect: (id: string) => void; todayKey: string }) {
  const withPlans = days.filter((d) => byDay.get(d)?.length);
  if (!withPlans.length) return <EmptyState icon={<CalIcon />} title="No plans in the next 30 days" description="Approve a Reel, then create a plan." />;
  return (
    <div className="space-y-4">
      {withPlans.map((d) => (
        <section key={d} aria-labelledby={`ag-${d}`} className="rounded-[var(--radius-card)] border border-line bg-white p-4 shadow-[var(--shadow-card)]">
          <h2 id={`ag-${d}`} className="mb-2 text-sm font-semibold text-ink-900">
            {formatInTz(`${d}T12:00:00Z`, "UTC", "EEEE d MMMM")} {d === todayKey && <Badge tone="teal">Today</Badge>}
          </h2>
          <ul className="space-y-2">
            {byDay.get(d)!.map((pl) => (
              <li key={pl.id}>
                <button type="button" onClick={() => onSelect(pl.id)} className="flex min-h-14 w-full items-center gap-3 rounded-xl p-1.5 text-left hover:bg-teal-50">
                  <Thumb driveFileId={pl.thumbDriveFileId} ratio="1/1" className="w-12 shrink-0 rounded-lg" />
                  <span className="w-12 text-sm font-semibold tabular-nums text-ink-700">{formatInTz(pl.scheduledAt, tz, "HH:mm")}</span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink-900">{pl.title}</span>
                  <PlanStatusBadge status={pl.status} simulated={pl.isSimulated} />
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function Legend() {
  return (
    <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-xs text-ink-600">
      <span className="flex items-center gap-1.5"><Badge tone="teal">Planned · local</Badge> saved in Balena only</span>
      <span className="flex items-center gap-1.5"><Badge tone="info">Scheduled by Meta</Badge> confirmed by Facebook</span>
      <span className="flex items-center gap-1.5"><Badge tone="success">Published</Badge> confirmed live</span>
    </div>
  );
}

const STEP_LABEL: Record<string, string> = { not_started: "Not started", in_progress: "In progress", succeeded: "Done", failed: "Failed", unknown: "Unknown" };

function PlanDetail({ sel, tz, facebook, onClose }: { sel: NonNullable<Selected>; tz: string; facebook: Props["facebook"]; onClose?: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [editOpen, setEditOpen] = useState(false);
  const [confirm, setConfirm] = useState<null | "cancel" | "cancel_meta" | "retry" | "start_over">(null);
  const pl = sel.plan;
  const s = PLAN_STATUS[pl.status];
  const sentToMeta = !!pl.finishRequestedAt;
  const editable = !sentToMeta && ["planned", "awaiting_approval", "failed"].includes(pl.status);
  const act = (fn: () => Promise<{ ok: boolean; error?: string }>, success: string) =>
    start(async () => {
      const r = await fn();
      if (r.ok) {
        toast({ tone: "success", message: success });
        setConfirm(null);
        router.refresh();
      } else toast({ tone: "error", message: r.error ?? "Failed" });
    });

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <Thumb driveFileId={pl.thumbDriveFileId} className="w-20 shrink-0 rounded-xl" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-ink-900">{pl.title}</p>
          <div className="mt-1 flex flex-wrap gap-1"><PlanStatusBadge status={pl.status} simulated={pl.isSimulated} /></div>
          <p className="mt-1 text-xs text-ink-500">{s.hint}</p>
        </div>
        {onClose && (
          <button type="button" onClick={onClose} className="-mr-2 -mt-2 inline-flex size-11 items-center justify-center rounded-xl text-ink-400 hover:bg-teal-50" aria-label="Close details"><X className="size-4" /></button>
        )}
      </div>

      <dl className="space-y-2 text-sm">
        <div className="flex items-center gap-2"><CalIcon className="size-4 text-ink-400" aria-hidden /><dt className="sr-only">Date</dt><dd>{formatInTz(pl.scheduledAt, tz, "EEE d MMM yyyy")}</dd></div>
        <div className="flex items-center gap-2"><Clock className="size-4 text-ink-400" aria-hidden /><dt className="sr-only">Time</dt><dd className="tabular-nums">{formatInTz(pl.scheduledAt, tz, "HH:mm")} <span className="text-ink-500">({tzLabel(tz)})</span></dd></div>
        <div className="flex items-center gap-2"><RefreshCw className="size-4 text-ink-400" aria-hidden /><dt className="sr-only">Method</dt><dd>{pl.mode === "meta_scheduled" ? "Scheduled natively by Meta" : "Published by Balena’s worker at this time"}</dd></div>
        {sel.product && <div className="flex items-center gap-2"><Package className="size-4 text-ink-400" aria-hidden /><dt className="sr-only">Product</dt><dd>{sel.product.name}</dd></div>}
      </dl>

      <div className="rounded-2xl border border-line p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="text-sm font-semibold text-ink-900">Publish to</p>
          {pl.isSimulated && <DemoBadge label="Simulated" />}
        </div>
        <div className="flex items-center gap-2 text-sm">
          <svg viewBox="0 0 24 24" className="size-6 shrink-0" aria-hidden><circle cx="12" cy="12" r="11" fill="#1877F2" /><path d="M13.3 19v-6h2l.3-2.4h-2.3V9.1c0-.7.2-1.2 1.2-1.2h1.2V5.8c-.2 0-1-.1-1.8-.1-1.8 0-3 1.1-3 3.1v1.8H9v2.4h2V19z" fill="#fff" /></svg>
          <span className="min-w-0 flex-1 truncate">{facebook.label ?? "Facebook Page"}</span>
          <ConnectionBadge status={facebook.status} />
        </div>
        <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
          <dt className="text-ink-500">Upload</dt><dd>{STEP_LABEL[pl.fbUploadStatus]}</dd>
          <dt className="text-ink-500">Processing</dt><dd>{STEP_LABEL[pl.fbProcessingStatus]}</dd>
          {pl.mode === "meta_scheduled" && (<><dt className="text-ink-500">Meta schedule</dt><dd>{STEP_LABEL[pl.fbScheduleStatus]}</dd></>)}
          <dt className="text-ink-500">Publication</dt><dd>{pl.status === "published" ? `Confirmed ${pl.confirmedAt ? formatInTz(pl.confirmedAt, tz, "d MMM HH:mm") : ""}` : STEP_LABEL[pl.fbPublishStatus]}</dd>
        </dl>
      </div>

      {pl.lastError && <Notice tone={pl.status === "uncertain" ? "warning" : "danger"} icon={<AlertTriangle />}>{pl.lastError}</Notice>}
      {pl.status === "awaiting_approval" && (
        <Notice tone="warning" title="Approval needed" action={<ButtonLink href={`/review/${pl.projectId}`} variant="primary">Review</ButtonLink>}>Nothing will be sent to Facebook until the current video and caption are approved.</Notice>
      )}

      {pl.status === "published" && pl.manualTagStatus !== "not_needed" && (
        <div className="rounded-2xl bg-gradient-peach p-4">
          <p className="text-sm font-semibold text-ink-900">Manual product tagging</p>
          <p className="mt-1 text-xs text-ink-600">The Reels publishing API can’t attach product tags{sel.product?.type === "affiliate" ? ", and marketplace affiliate items (such as Shopee) can’t be natively tagged" : ""}. If your Page is eligible, add the tag in the Facebook app:</p>
          <ol className="mt-2 list-decimal space-y-1 pl-4 text-xs text-ink-700">
            <li>Open the Reel on Facebook (link below).</li>
            <li>Choose Edit → Tag products, and pick “{sel.product?.name}”.</li>
            <li>Save, then mark it done here.</li>
          </ol>
          <div className="mt-3 flex flex-wrap gap-2">
            {pl.fbPermalink && <ButtonLink href={pl.fbPermalink} target="_blank" rel="noreferrer" icon={<ExternalLink className="size-4" />}>Open Reel</ButtonLink>}
            {sel.product?.destinationUrl && (
              <Button icon={<Copy className="size-4" />} onClick={() => void navigator.clipboard?.writeText(sel.product!.destinationUrl!).then(() => toast({ tone: "success", message: "Link copied" }))}>Copy product link</Button>
            )}
            {pl.manualTagStatus === "pending" ? (
              <Button variant="primary" loading={pending} icon={<CheckCircle2 className="size-4" />} onClick={() => act(() => markTagDoneAction(pl.id), "Marked as tagged")}>Mark tag added</Button>
            ) : (
              <Badge tone="success">Tag added (your confirmation)</Badge>
            )}
          </div>
        </div>
      )}
      {pl.status === "published" && pl.fbPermalink && pl.manualTagStatus === "not_needed" && <ButtonLink href={pl.fbPermalink} target="_blank" rel="noreferrer" icon={<ExternalLink className="size-4" />}>Open Reel on Facebook</ButtonLink>}

      <div className="flex flex-wrap gap-2 border-t border-line pt-4">
        {editable && <Button icon={<Pencil className="size-4" />} onClick={() => setEditOpen(true)}>Edit plan</Button>}
        {(pl.status === "publishing" || pl.status === "scheduled_on_meta" || pl.status === "uncertain") && (
          <Button loading={pending} icon={<RefreshCw className="size-4" />} onClick={() => act(() => checkPlanAction(pl.id), "Checking status with Facebook…")}>Check status now</Button>
        )}
        {pl.status === "uncertain" && <Button variant="peach" onClick={() => setConfirm("retry")}>Retry after status check…</Button>}
        {pl.status === "failed" && pl.fbProcessingStatus === "failed" && <Button variant="peach" onClick={() => setConfirm("start_over")}>Start a fresh upload…</Button>}
        {editable && <Button variant="danger" icon={<Ban className="size-4" />} onClick={() => setConfirm("cancel")}>Cancel plan</Button>}
        {pl.status === "scheduled_on_meta" && <Button variant="danger" icon={<Ban className="size-4" />} onClick={() => setConfirm("cancel_meta")}>Cancel…</Button>}
      </div>

      {sel.attempts.length > 0 && (
        <details>
          <summary className="min-h-11 cursor-pointer py-2 text-xs font-semibold text-ink-600">Facebook request log ({sel.attempts.length})</summary>
          <ul className="space-y-1 text-xs">
            {sel.attempts.map((a) => (
              <li key={a.id} className="flex gap-2"><span className="tabular-nums text-ink-500">{formatInTz(a.createdAt, tz, "d MMM HH:mm:ss")}</span><span className="font-medium">{a.phase}</span><span className={a.outcome === "ok" ? "text-success-700" : a.outcome === "ambiguous" ? "text-warning-700" : "text-danger-700"}>{a.outcome}</span></li>
            ))}
          </ul>
        </details>
      )}

      <PlanFormDialog open={editOpen} onOpenChange={setEditOpen} tz={tz} planId={pl.id} initial={{ ...utcToZonedParts(pl.scheduledAt, tz), projectId: pl.projectId }} projects={[{ id: pl.projectId, title: pl.title, approved: pl.project.approvalValid }]} defaultMode={pl.mode} />

      <Dialog
        open={!!confirm}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={confirm === "retry" ? "Retry publishing?" : confirm === "start_over" ? "Start a fresh upload?" : "Cancel this plan?"}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirm(null)}>Keep as is</Button>
            <Button
              variant={confirm === "cancel" || confirm === "cancel_meta" ? "danger" : "primary"}
              loading={pending}
              onClick={() => {
                if (confirm === "retry") act(() => retryFinishAction(pl.id), "Retry queued — status is checked first.");
                else if (confirm === "start_over") act(() => startOverAction(pl.id), "Fresh upload queued.");
                else act(() => cancelPlanAction(pl.id, confirm === "cancel_meta"), "Plan cancelled");
              }}
            >
              {confirm === "retry" ? "Check & retry" : confirm === "start_over" ? "Start over" : confirm === "cancel_meta" ? "I removed it on Meta — cancel" : "Cancel plan"}
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink-700">
          {confirm === "retry" &&
            "Balena will first read the Reel’s status from Facebook. Only if Facebook shows it was never published will it resend the request — for the same uploaded video, so a second Reel can’t be created. Check your Page first if you’re unsure."}
          {confirm === "start_over" && "Facebook reported that the previous upload failed, so it was never published. A new upload will be created."}
          {confirm === "cancel" && "Nothing has been sent to Facebook yet, so cancelling is safe."}
          {confirm === "cancel_meta" && "This Reel is already scheduled on Meta. Balena can’t unschedule it yet — delete or cancel it in Meta Business Suite first, then confirm here."}
        </p>
      </Dialog>
    </div>
  );
}

function PlanFormDialog({
  open,
  onOpenChange,
  initial,
  tz,
  projects,
  defaultMode,
  planId,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initial: { date: string; time: string; projectId?: string } | null;
  tz: string;
  projects: { id: string; title: string; approved: boolean }[];
  defaultMode: PublishMode;
  planId?: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [projectId, setProjectId] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("09:00");
  const [mode, setMode] = useState<PublishMode>(defaultMode);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open && initial) {
      setProjectId(initial.projectId ?? projects.find((p) => p.approved)?.id ?? projects[0]?.id ?? "");
      setDate(initial.date);
      setTime(initial.time);
      setMode(defaultMode);
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const proj = projects.find((p) => p.id === projectId);

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={planId ? "Edit plan" : "New publishing plan"}
      description="Plans are saved in Balena first. Nothing is sent to Facebook until the draft is approved and the publisher runs."
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            variant="primary"
            loading={pending}
            disabled={!projectId || !date || !time}
            onClick={() =>
              start(async () => {
                const input = { date, time, timezone: tz, mode };
                const r = planId ? await updatePlanAction(planId, input) : await createPlanAction(projectId, input);
                if (r.ok) {
                  toast({ tone: "success", message: planId ? "Plan updated" : proj?.approved ? "Plan created" : "Plan created — it will wait for approval" });
                  onOpenChange(false);
                  router.refresh();
                } else setError(r.error);
              })
            }
          >
            {planId ? "Save changes" : "Create plan"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {!planId && (
          <Field label="Reel">
            {(id) => (
              <Select id={id} value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                {projects.length === 0 && <option value="">No Reels yet</option>}
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.title}{p.approved ? " ✓ approved" : " — needs approval"}</option>
                ))}
              </Select>
            )}
          </Field>
        )}
        {proj && !proj.approved && <Notice tone="warning">This Reel isn’t approved for its current version. The plan will wait until you approve it.</Notice>}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Date">{(id) => <Input id={id} type="date" value={date} onChange={(e) => setDate(e.target.value)} />}</Field>
          <Field label="Time">{(id) => <Input id={id} type="time" value={time} onChange={(e) => setTime(e.target.value)} step={300} />}</Field>
        </div>
        <p className="flex items-center gap-1.5 text-xs text-ink-600"><Globe className="size-3.5" aria-hidden /> Time is in {tzLabel(tz)}. Change it in Settings.</p>
        <fieldset>
          <legend className="mb-1.5 text-sm font-semibold text-ink-700">How should it be published?</legend>
          <div className="space-y-2">
            {([
              ["balena_publisher", "Balena publisher (recommended)", "The always-on worker uploads ahead of time and publishes at the planned time, then confirms with Facebook. Easy to edit or cancel until then."],
              ["meta_scheduled", "Schedule natively on Meta", "Hands the Reel to Meta as scheduled (15 min – 28 days ahead). Changes after that must be made in Meta Business Suite. Verify Meta’s current support before relying on it."],
            ] as const).map(([v, label, hint]) => (
              <label key={v} className={cn("flex cursor-pointer gap-3 rounded-xl border p-3", mode === v ? "border-teal-600 bg-teal-50 ring-1 ring-teal-600" : "border-line-strong")}>
                <input type="radio" name="mode" value={v} checked={mode === v} onChange={() => setMode(v)} className="mt-1 size-4 accent-teal-700" />
                <span><span className="block text-sm font-semibold text-ink-900">{label}</span><span className="block text-xs text-ink-500">{hint}</span></span>
              </label>
            ))}
          </div>
        </fieldset>
        {error && <p role="alert" className="text-sm font-medium text-danger-700">{error}</p>}
      </div>
    </Dialog>
  );
}
