/** Local calendar day key: YYYY-MM-DD */
export function toDayKey(ts: number | Date): string {
  const d = typeof ts === "number" ? new Date(ts) : ts;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function parseDayKey(key: string): { year: number; month: number; day: number } {
  const [y, m, d] = key.split("-").map(Number);
  return { year: y, month: m, day: d };
}

export function startOfMonth(year: number, monthIndex: number): Date {
  return new Date(year, monthIndex, 1);
}

/** Monday-first weekday index: Mon=0 … Sun=6 */
export function mondayFirstWeekday(date: Date): number {
  return (date.getDay() + 6) % 7;
}

export function daysInMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

export function buildMonthGrid(year: number, monthIndex: number) {
  const first = startOfMonth(year, monthIndex);
  const leading = mondayFirstWeekday(first);
  const total = daysInMonth(year, monthIndex);
  const cells: Array<{ day: number | null; key: string | null }> = [];

  for (let i = 0; i < leading; i++) {
    cells.push({ day: null, key: null });
  }
  for (let day = 1; day <= total; day++) {
    const key = toDayKey(new Date(year, monthIndex, day));
    cells.push({ day, key });
  }
  while (cells.length % 7 !== 0) {
    cells.push({ day: null, key: null });
  }
  return cells;
}

export function countByDayKey(timestamps: number[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const ts of timestamps) {
    const key = toDayKey(ts);
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return map;
}
