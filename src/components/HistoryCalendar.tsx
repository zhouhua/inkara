"use client";

import { useMemo, useState } from "react";
import { t, type Locale } from "@/lib/i18n";
import {
  buildMonthGrid,
  countByDayKey,
  toDayKey,
} from "@/lib/dates";

type Props = {
  locale: Locale;
  timestamps: number[];
  selectedDay: string | null;
  onSelectDay: (dayKey: string | null) => void;
};

export function HistoryCalendar({
  locale,
  timestamps,
  selectedDay,
  onSelectDay,
}: Props) {
  const today = useMemo(() => new Date(), []);
  const todayKey = toDayKey(today);
  const [cursor, setCursor] = useState(() => ({
    year: today.getFullYear(),
    month: today.getMonth(),
  }));

  const counts = useMemo(() => countByDayKey(timestamps), [timestamps]);
  const cells = useMemo(
    () => buildMonthGrid(cursor.year, cursor.month),
    [cursor.year, cursor.month]
  );

  const monthLabel = useMemo(() => {
    const d = new Date(cursor.year, cursor.month, 1);
    return d.toLocaleDateString(locale === "zh" ? "zh-CN" : "en-US", {
      year: "numeric",
      month: "long",
    });
  }, [cursor.year, cursor.month, locale]);

  const weekdays =
    locale === "zh"
      ? ["一", "二", "三", "四", "五", "六", "日"]
      : ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

  const shiftMonth = (delta: number) => {
    setCursor((c) => {
      const d = new Date(c.year, c.month + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  };

  return (
    <section className="history-calendar" aria-label={t(locale, "calendar")}>
      <div className="history-cal-head">
        <button
          type="button"
          className="ink-link history-cal-nav"
          onClick={() => shiftMonth(-1)}
          aria-label={t(locale, "calendarPrev")}
        >
          ‹
        </button>
        <p className="history-cal-month">{monthLabel}</p>
        <button
          type="button"
          className="ink-link history-cal-nav"
          onClick={() => shiftMonth(1)}
          aria-label={t(locale, "calendarNext")}
        >
          ›
        </button>
      </div>

      <div className="history-cal-weekdays" aria-hidden>
        {weekdays.map((w) => (
          <span key={w}>{w}</span>
        ))}
      </div>

      <div className="history-cal-grid" role="grid">
        {cells.map((cell, i) => {
          if (!cell.day || !cell.key) {
            return <span key={`e-${i}`} className="history-cal-cell is-empty" />;
          }
          const count = counts.get(cell.key) ?? 0;
          const hasRecord = count > 0;
          const isSelected = selectedDay === cell.key;
          const isToday = cell.key === todayKey;

          return (
            <button
              key={cell.key}
              type="button"
              role="gridcell"
              className={[
                "history-cal-cell",
                hasRecord ? "has-record" : "",
                isSelected ? "is-selected" : "",
                isToday ? "is-today" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              aria-label={
                hasRecord
                  ? t(locale, "calendarDayMarked", { day: cell.day, n: count })
                  : t(locale, "calendarDayEmpty", { day: cell.day })
              }
              aria-selected={isSelected}
              onClick={() => {
                if (!hasRecord) return;
                onSelectDay(isSelected ? null : cell.key);
              }}
              disabled={!hasRecord}
            >
              <span className="history-cal-num">{cell.day}</span>
              {hasRecord ? <span className="history-cal-dot" aria-hidden /> : null}
            </button>
          );
        })}
      </div>

      {selectedDay ? (
        <div className="history-cal-actions">
          <button
            type="button"
            className="ink-link"
            onClick={() => onSelectDay(null)}
          >
            {t(locale, "calendarShowAll")}
          </button>
        </div>
      ) : null}
    </section>
  );
}
