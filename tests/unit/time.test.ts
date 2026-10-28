import { describe, expect, it } from "vitest";
import { dayKey, formatInTz, monthGrid, utcToZonedParts, weekDays, zonedToUtc, isWithinMetaScheduleWindow } from "@/lib/time";

describe("timezone handling (Asia/Bangkok default)", () => {
  it("converts Bangkok wall-clock to UTC (GMT+7, no DST)", () => {
    expect(zonedToUtc("2026-10-26", "09:00", "Asia/Bangkok").toISOString()).toBe("2026-10-26T02:00:00.000Z");
    expect(zonedToUtc("2026-11-01", "00:30", "Asia/Bangkok").toISOString()).toBe("2026-10-31T17:30:00.000Z");
  });

  it("round-trips", () => {
    const utc = zonedToUtc("2026-12-31", "23:45", "Asia/Bangkok");
    expect(utcToZonedParts(utc, "Asia/Bangkok")).toEqual({ date: "2026-12-31", time: "23:45" });
  });

  it("buckets a late-UTC instant into the correct Bangkok day", () => {
    // 2026-10-26 20:00 UTC is already 27 Oct 03:00 in Bangkok
    expect(dayKey(new Date("2026-10-26T20:00:00Z"), "Asia/Bangkok")).toBe("2026-10-27");
    expect(dayKey(new Date("2026-10-26T20:00:00Z"), "UTC")).toBe("2026-10-26");
  });

  it("handles DST zones correctly", () => {
    // London switches back from BST on 25 Oct 2026
    expect(zonedToUtc("2026-10-24", "09:00", "Europe/London").toISOString()).toBe("2026-10-24T08:00:00.000Z");
    expect(zonedToUtc("2026-10-26", "09:00", "Europe/London").toISOString()).toBe("2026-10-26T09:00:00.000Z");
  });

  it("builds Monday-start weeks and 6-week month grids", () => {
    const week = weekDays(new Date("2026-10-28T05:00:00Z"), "Asia/Bangkok");
    expect(week.map((d) => formatInTz(d, "Asia/Bangkok", "EEE d MMM"))).toEqual([
      "Mon 26 Oct", "Tue 27 Oct", "Wed 28 Oct", "Thu 29 Oct", "Fri 30 Oct", "Sat 31 Oct", "Sun 1 Nov",
    ]);
    const grid = monthGrid(new Date("2026-11-15T05:00:00Z"), "Asia/Bangkok");
    expect(grid).toHaveLength(42);
    expect(formatInTz(grid[0], "Asia/Bangkok", "yyyy-MM-dd")).toBe("2026-10-26");
  });

  it("enforces the conservative Meta scheduling window", () => {
    const now = new Date("2026-10-28T00:00:00Z");
    expect(isWithinMetaScheduleWindow(new Date("2026-10-28T00:05:00Z"), now)).toBe(false);
    expect(isWithinMetaScheduleWindow(new Date("2026-10-28T01:00:00Z"), now)).toBe(true);
    expect(isWithinMetaScheduleWindow(new Date("2026-12-28T01:00:00Z"), now)).toBe(false);
  });
});
