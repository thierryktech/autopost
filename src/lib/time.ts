/*
 * Timezone helpers. Instants are stored in UTC; everything shown to the user is rendered
 * in the selected IANA timezone (default Asia/Bangkok, GMT+7, no DST).
 */
import { TZDate } from "@date-fns/tz";
import { addDays, format, startOfWeek, startOfMonth, endOfMonth, isSameDay } from "date-fns";

export const DEFAULT_TZ = "Asia/Bangkok";

export function tzOffsetLabel(tz: string, at: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "shortOffset" }).formatToParts(at);
  const off = parts.find((p) => p.type === "timeZoneName")?.value ?? "";
  return off.replace("GMT", "GMT");
}

export function tzLabel(tz: string, at: Date = new Date()): string {
  const city = tz.split("/").pop()?.replace(/_/g, " ") ?? tz;
  return `${city} (${tzOffsetLabel(tz, at)})`;
}

/** Wall-clock view of an instant in a timezone. */
export function inTz(instant: Date | string | number, tz: string): TZDate {
  return new TZDate(new Date(instant).getTime(), tz);
}

export function formatInTz(instant: Date | string | number, tz: string, pattern: string): string {
  return format(inTz(instant, tz), pattern);
}

/** Converts a wall-clock date ("2026-10-26") and time ("09:00") in `tz` to a UTC instant. */
export function zonedToUtc(dateStr: string, timeStr: string, tz: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  const [hh, mm] = timeStr.split(":").map(Number);
  if (![y, m, d, hh, mm].every(Number.isFinite)) throw new Error(`Invalid date/time: ${dateStr} ${timeStr}`);
  const local = new TZDate(y, m - 1, d, hh, mm, 0, 0, tz);
  return new Date(local.getTime());
}

/** Inverse of zonedToUtc: returns { date: "YYYY-MM-DD", time: "HH:mm" } in tz. */
export function utcToZonedParts(instant: Date | string, tz: string): { date: string; time: string } {
  const z = inTz(instant, tz);
  return { date: format(z, "yyyy-MM-dd"), time: format(z, "HH:mm") };
}

/** Calendar day key in tz, used to bucket plans by day. */
export function dayKey(instant: Date | string | number, tz: string): string {
  return format(inTz(instant, tz), "yyyy-MM-dd");
}

/** Monday-start week containing `anchor` (in tz). Returns 7 day keys + TZDate objects. */
export function weekDays(anchor: Date, tz: string): TZDate[] {
  const start = startOfWeek(inTz(anchor, tz), { weekStartsOn: 1 });
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

/** 6x7 month grid (Monday start) for the month containing `anchor` in tz. */
export function monthGrid(anchor: Date, tz: string): TZDate[] {
  const first = startOfMonth(inTz(anchor, tz));
  const start = startOfWeek(first, { weekStartsOn: 1 });
  const end = endOfMonth(first);
  const days: TZDate[] = [];
  let d = start;
  while (days.length < 42) {
    days.push(d);
    d = addDays(d, 1);
  }
  void end;
  return days;
}

export function sameDayInTz(a: Date, b: Date, tz: string): boolean {
  return isSameDay(inTz(a, tz), inTz(b, tz));
}

/**
 * Meta's Page Reels scheduling window as reported by third-party guides: at least ~10 minutes and
 * at most ~29 days ahead. Unverified against the official docs in this build — keep conservative.
 */
export const META_SCHEDULE_MIN_LEAD_MS = 15 * 60 * 1000;
export const META_SCHEDULE_MAX_LEAD_MS = 28 * 24 * 60 * 60 * 1000;

export function isWithinMetaScheduleWindow(scheduledAt: Date, now: Date = new Date()): boolean {
  const lead = scheduledAt.getTime() - now.getTime();
  return lead >= META_SCHEDULE_MIN_LEAD_MS && lead <= META_SCHEDULE_MAX_LEAD_MS;
}

export function formatDuration(ms: number | null | undefined): string {
  if (ms == null) return "–";
  const total = Math.round(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function relativeTime(instant: Date | string, now: Date = new Date()): string {
  const diff = new Date(instant).getTime() - now.getTime();
  const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  if (abs < 60_000) return rtf.format(Math.round(diff / 1000), "second");
  if (abs < 3_600_000) return rtf.format(Math.round(diff / 60_000), "minute");
  if (abs < 86_400_000) return rtf.format(Math.round(diff / 3_600_000), "hour");
  return rtf.format(Math.round(diff / 86_400_000), "day");
}

export const COMMON_TIMEZONES = [
  "Asia/Bangkok",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Asia/Ho_Chi_Minh",
  "Europe/London",
  "Europe/Berlin",
  "America/New_York",
  "America/Los_Angeles",
  "UTC",
];
