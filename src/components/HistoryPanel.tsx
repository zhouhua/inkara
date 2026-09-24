"use client";

import { useId, useMemo, useState } from "react";
import { HistoryCalendar } from "@/components/HistoryCalendar";
import { t, type Locale } from "@/lib/i18n";
import { toDayKey } from "@/lib/dates";
import {
  clearMemory,
  deleteMemoryPage,
  loadMemory,
} from "@/lib/memory";

type Props = {
  open: boolean;
  locale: Locale;
  onClose: () => void;
  onMemoryChange: (count: number) => void;
};

export function HistoryPanel({ open, locale, onClose, onMemoryChange }: Props) {
  const titleId = useId();
  const [revision, setRevision] = useState(0);
  const [confirmClear, setConfirmClear] = useState(false);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const pages = useMemo(() => {
    if (!open) return [];
    void revision;
    return [...loadMemory()].reverse();
  }, [open, revision]);

  const timestamps = useMemo(
    () => pages.map((p) => p.createdAt),
    [pages]
  );

  const filtered = useMemo(() => {
    if (!selectedDay) return pages;
    return pages.filter((p) => toDayKey(p.createdAt) === selectedDay);
  }, [pages, selectedDay]);

  if (!open) return null;

  const formatDate = (ts: number) =>
    new Date(ts).toLocaleString(locale === "zh" ? "zh-CN" : "en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  const handleClose = () => {
    setConfirmClear(false);
    setSelectedDay(null);
    onClose();
  };

  return (
    <div
      className="history-panel"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <header className="history-chrome">
        <div className="brand-mark">
          <p className="brand-zh">{t(locale, "brand")}</p>
          <p className="brand-en">{t(locale, "brandEn")}</p>
        </div>
        <nav className="paper-actions">
          {pages.length > 0 &&
            (!confirmClear ? (
              <button
                type="button"
                className="ink-link"
                onClick={() => setConfirmClear(true)}
              >
                {t(locale, "historyClearAll")}
              </button>
            ) : (
              <button
                type="button"
                className="ink-link active"
                onClick={() => {
                  clearMemory();
                  setRevision((n) => n + 1);
                  onMemoryChange(0);
                  setConfirmClear(false);
                  setSelectedDay(null);
                }}
              >
                {t(locale, "confirmForget")}
              </button>
            ))}
          <button type="button" className="ink-link" onClick={handleClose}>
            {t(locale, "historyBack")}
          </button>
        </nav>
      </header>

      <div className="history-body">
        <h1 id={titleId} className="history-title">
          {t(locale, "historyTitle")}
        </h1>
        <p className="history-meta">
          {selectedDay
            ? t(locale, "calendarFilterCount", { n: filtered.length })
            : t(locale, "memoryCount", { n: pages.length })}
        </p>

        <HistoryCalendar
          locale={locale}
          timestamps={timestamps}
          selectedDay={selectedDay}
          onSelectDay={setSelectedDay}
        />

        {pages.length === 0 ? (
          <p className="history-empty">{t(locale, "historyEmpty")}</p>
        ) : filtered.length === 0 ? (
          <p className="history-empty">{t(locale, "calendarDayNoPages")}</p>
        ) : (
          <ol className="history-list">
            {filtered.map((page, index) => (
              <li key={page.id} className="history-entry">
                <div className="history-entry-head">
                  <span className="history-index">
                    {String(filtered.length - index).padStart(2, "0")}
                  </span>
                  <time dateTime={new Date(page.createdAt).toISOString()}>
                    {formatDate(page.createdAt)}
                  </time>
                  <button
                    type="button"
                    className="ink-link history-delete"
                    onClick={() => {
                      const next = deleteMemoryPage(page.id);
                      setRevision((n) => n + 1);
                      onMemoryChange(next.length);
                      if (
                        selectedDay &&
                        !next.some((p) => toDayKey(p.createdAt) === selectedDay)
                      ) {
                        setSelectedDay(null);
                      }
                    }}
                  >
                    {t(locale, "historyDelete")}
                  </button>
                </div>
                <blockquote className="history-ask">
                  {page.transcription.trim() || t(locale, "historyUnread")}
                </blockquote>
                <p className="history-reply">{page.reply}</p>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
