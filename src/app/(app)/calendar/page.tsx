import { addDays, addMonths, format } from "date-fns";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/server/db/connect";
import { products, publishAttempts } from "@/server/db/schema";
import { listPlans } from "@/server/services/plans";
import { listProjects } from "@/server/services/projects";
import { getSettings } from "@/server/services/overview";
import { getConnection } from "@/server/connections";
import { inTz, monthGrid, weekDays, zonedToUtc } from "@/lib/time";
import { CalendarView } from "./calendar-view";

export const metadata = { title: "Publishing calendar" };

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ view?: string; d?: string; plan?: string; new?: string }> }) {
  const sp = await searchParams;
  const s = await getSettings();
  const tz = s?.timezone ?? "Asia/Bangkok";
  const view = (["week", "month", "agenda"].includes(sp.view ?? "") ? sp.view : s?.calendarView ?? "week") as "week" | "month" | "agenda";
  const todayKey = format(inTz(new Date(), tz), "yyyy-MM-dd");
  const anchorKey = sp.d && /^\d{4}-\d{2}-\d{2}$/.test(sp.d) ? sp.d : todayKey;
  const anchor = zonedToUtc(anchorKey, "12:00", tz);

  let days: string[];
  if (view === "week") days = weekDays(anchor, tz).map((d) => format(d, "yyyy-MM-dd"));
  else if (view === "month") days = monthGrid(anchor, tz).map((d) => format(d, "yyyy-MM-dd"));
  else days = Array.from({ length: 30 }, (_, i) => format(addDays(inTz(anchor, tz), i), "yyyy-MM-dd"));
  const from = zonedToUtc(days[0], "00:00", tz);
  const to = zonedToUtc(days[days.length - 1], "23:59", tz);

  const prevKey = format(view === "month" ? addMonths(inTz(anchor, tz), -1) : addDays(inTz(anchor, tz), view === "week" ? -7 : -30), "yyyy-MM-dd");
  const nextKey = format(view === "month" ? addMonths(inTz(anchor, tz), 1) : addDays(inTz(anchor, tz), view === "week" ? 7 : 30), "yyyy-MM-dd");

  const [plans, projects, fb] = await Promise.all([listPlans({ from, to }), listProjects(), getConnection("facebook")]);
  const db = await getDb();
  let selected = null;
  if (sp.plan) {
    const all = await listPlans();
    const plan = all.find((p) => p.id === sp.plan) ?? null;
    if (plan) {
      const [attempts, prod] = await Promise.all([
        db.select().from(publishAttempts).where(eq(publishAttempts.planId, plan.id)).orderBy(desc(publishAttempts.createdAt)).limit(20),
        plan.project.productId ? db.select().from(products).where(eq(products.id, plan.project.productId)) : Promise.resolve([]),
      ]);
      selected = {
        plan: { ...plan, title: plan.project.title, scheduledAt: plan.scheduledAt.toISOString(), finishRequestedAt: plan.finishRequestedAt?.toISOString() ?? null, confirmedAt: plan.confirmedAt?.toISOString() ?? null },
        attempts: attempts.map((a) => ({ id: a.id, phase: a.phase, outcome: a.outcome, createdAt: a.createdAt.toISOString() })),
        product: prod[0] ? { name: prod[0].name, destinationUrl: prod[0].destinationUrl, nativeTag: prod[0].nativeTag, type: prod[0].type } : null,
      };
    }
  }

  return (
    <CalendarView
      view={view}
      timezone={tz}
      days={days}
      anchorKey={anchorKey}
      todayKey={todayKey}
      prevKey={prevKey}
      nextKey={nextKey}
      plans={plans.map((p) => ({ id: p.id, scheduledAt: p.scheduledAt.toISOString(), status: p.status, mode: p.mode, isSimulated: p.isSimulated, title: p.project.title, projectId: p.project.id, thumbDriveFileId: p.thumbDriveFileId }))}
      selected={selected}
      approvedProjects={projects.filter((p) => p.approvalValid).map((p) => ({ id: p.id, title: p.title }))}
      allProjects={projects.map((p) => ({ id: p.id, title: p.title, approved: p.approvalValid }))}
      newForProjectId={sp.new ?? null}
      defaults={{ time: s?.defaultPublishTime ?? "09:00", mode: s?.defaultPublishMode ?? "balena_publisher" }}
      facebook={{ status: fb?.status ?? "disconnected", label: fb?.accountLabel ?? null }}
    />
  );
}
