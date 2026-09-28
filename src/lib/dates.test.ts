import { describe, expect, it } from "vitest";
import {
  buildMonthGrid,
  countByDayKey,
  mondayFirstWeekday,
  parseDayKey,
  toDayKey,
} from "@/lib/dates";

describe("dates", () => {
  it("formats and parses day keys", () => {
    const key = toDayKey(new Date(2026, 8, 28));
    expect(key).toBe("2026-09-28");
    expect(parseDayKey(key)).toEqual({ year: 2026, month: 9, day: 28 });
  });

  it("uses monday-first weekday index", () => {
    // 2026-09-28 is Monday
    expect(mondayFirstWeekday(new Date(2026, 8, 28))).toBe(0);
    // 2026-09-27 is Sunday
    expect(mondayFirstWeekday(new Date(2026, 8, 27))).toBe(6);
  });

  it("builds a complete month grid", () => {
    const cells = buildMonthGrid(2026, 8);
    expect(cells.length % 7).toBe(0);
    expect(cells.some((c) => c.key === "2026-09-01")).toBe(true);
    expect(cells.some((c) => c.key === "2026-09-30")).toBe(true);
  });

  it("counts timestamps by day key", () => {
    const a = new Date(2026, 0, 1).getTime();
    const b = new Date(2026, 0, 1, 20).getTime();
    const c = new Date(2026, 0, 2).getTime();
    const map = countByDayKey([a, b, c]);
    expect(map.get("2026-01-01")).toBe(2);
    expect(map.get("2026-01-02")).toBe(1);
  });
});
