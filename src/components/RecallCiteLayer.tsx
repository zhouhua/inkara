"use client";

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { createPortal } from "react-dom";
import { t, type Locale } from "@/lib/i18n";
import type { MemoryPage } from "@/lib/memory";
import {
  formatCiteChipLabel,
  citedIndexesInReply,
  parseCiteReply,
} from "@/lib/recall-cite";

type Anchor = {
  top: number;
  bottom: number;
  left: number;
  right: number;
  centerX: number;
};

type NoteLayout = {
  top: number;
  left: number;
  caretLeft: number;
  placeAbove: boolean;
};

type Props = {
  reply: string;
  pages: MemoryPage[];
  locale: Locale;
  openIndex: number | null;
  onOpen: (index: number) => void;
  onClose: () => void;
};

function layoutNote(anchor: Anchor, noteW: number, noteH: number): NoteLayout {
  const gap = 10;
  const pad = 12;
  const vw = typeof window !== "undefined" ? window.innerWidth : 400;
  const vh = typeof window !== "undefined" ? window.innerHeight : 700;

  const placeAbove =
    anchor.bottom + gap + noteH > vh - pad && anchor.top - gap - noteH > pad;

  let top = placeAbove ? anchor.top - gap - noteH : anchor.bottom + gap;
  top = Math.max(pad, Math.min(top, vh - noteH - pad));

  let left = anchor.centerX - noteW / 2;
  left = Math.max(pad, Math.min(left, vw - noteW - pad));

  const caretLeft = Math.max(
    16,
    Math.min(anchor.centerX - left, noteW - 16)
  );

  return { top, left, caretLeft, placeAbove };
}

export function RecallCiteLayer({
  reply,
  pages,
  locale,
  openIndex,
  onOpen,
  onClose,
}: Props) {
  const segments = useMemo(() => parseCiteReply(reply), [reply]);
  const chipIndexes = useMemo(
    () => citedIndexesInReply(reply, pages.length),
    [reply, pages.length]
  );
  const openPage =
    openIndex != null && openIndex >= 1 && openIndex <= pages.length
      ? pages[openIndex - 1]
      : null;

  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const [noteBox, setNoteBox] = useState<NoteLayout | null>(null);
  const noteRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (openIndex == null) {
      setAnchor(null);
      setNoteBox(null);
    }
  }, [openIndex]);

  useEffect(() => {
    if (openIndex == null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openIndex, onClose]);

  useLayoutEffect(() => {
    if (!openPage || !anchor) {
      setNoteBox(null);
      return;
    }
    const noteW = Math.min(352, window.innerWidth - 24);
    const measuredH = noteRef.current?.offsetHeight;
    const noteH =
      measuredH && measuredH > 40
        ? measuredH
        : Math.min(window.innerHeight * 0.42, 280);
    setNoteBox(layoutNote(anchor, noteW, noteH));
  }, [openPage, anchor, openIndex]);

  const captureAnchor = (el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    setAnchor({
      top: r.top,
      bottom: r.bottom,
      left: r.left,
      right: r.right,
      centerX: r.left + r.width / 2,
    });
  };

  const openCite = (index: number, e?: ReactMouseEvent) => {
    e?.stopPropagation();
    if (index < 1 || index > pages.length) return;
    if (openIndex === index) {
      onClose();
      return;
    }
    if (e?.currentTarget instanceof HTMLElement) {
      captureAnchor(e.currentTarget);
    }
    onOpen(index);
  };

  const activeBox =
    noteBox ??
    (anchor
      ? layoutNote(
          anchor,
          Math.min(352, typeof window !== "undefined" ? window.innerWidth - 24 : 352),
          240
        )
      : null);

  const noteStyle: CSSProperties | undefined =
    activeBox != null
      ? {
          top: activeBox.top,
          left: activeBox.left,
          ["--recall-caret-x" as string]: `${activeBox.caretLeft}px`,
        }
      : undefined;

  const note =
    typeof document !== "undefined" && openPage && openIndex != null && anchor && activeBox ? (
      <aside
        ref={noteRef}
        className={`recall-note${activeBox.placeAbove ? " is-above" : " is-below"}`}
        role="dialog"
        aria-label={t(locale, "recallNoteTitle")}
        style={noteStyle}
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <span className="recall-note-caret" aria-hidden />
        <header className="recall-note-head">
          <span className="recall-note-index" aria-hidden>
            {openIndex}
          </span>
          <div className="recall-note-head-text">
            <p className="recall-note-kicker">{t(locale, "recallNoteTitle")}</p>
            <p className="recall-note-date">
              {new Date(openPage.createdAt).toLocaleString(
                locale === "zh" ? "zh-CN" : "en-US",
                {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                }
              )}
            </p>
          </div>
          <button
            type="button"
            className="ink-link recall-note-close"
            onClick={onClose}
          >
            {t(locale, "recallNoteClose")}
          </button>
        </header>
        <div className="recall-note-scroll">
          <p className="recall-note-label">{t(locale, "historyYou")}</p>
          <p className="recall-note-body">
            {openPage.transcription.trim() || t(locale, "historyUnread")}
          </p>
          <p className="recall-note-label">{t(locale, "historyPage")}</p>
          <p className="recall-note-body">{openPage.reply}</p>
        </div>
      </aside>
    ) : null;

  return (
    <div className="recall-cite">
      <div className="recall-cite-prose" aria-live="polite">
        {segments.map((seg, i) => {
          if (seg.kind === "text") {
            return <span key={`t${i}`}>{seg.text}</span>;
          }
          const valid = seg.index >= 1 && seg.index <= pages.length;
          if (!valid) {
            return (
              <span key={`c${i}`} className="recall-cite-mark is-inert">
                [^{seg.index}]
              </span>
            );
          }
          return (
            <button
              key={`c${i}`}
              type="button"
              className={`recall-cite-mark${openIndex === seg.index ? " is-open" : ""}`}
              aria-label={t(locale, "recallCiteOpen")}
              aria-expanded={openIndex === seg.index}
              onClick={(e) => openCite(seg.index, e)}
            >
              {seg.index}
            </button>
          );
        })}
      </div>

      <ul className="recall-cite-chips" aria-label={t(locale, "history")}>
        {chipIndexes.map((index) => {
          const page = pages[index - 1];
          if (!page) return null;
          const { date, snippet } = formatCiteChipLabel(page, locale);
          const label = snippet || t(locale, "historyUnread");
          return (
            <li key={page.id}>
              <button
                type="button"
                className={`recall-cite-chip${openIndex === index ? " is-open" : ""}`}
                onClick={(e) => openCite(index, e)}
                aria-expanded={openIndex === index}
              >
                <span className="recall-cite-chip-n">{index}</span>
                <span className="recall-cite-chip-meta">
                  <span className="recall-cite-chip-date">{date}</span>
                  <span className="recall-cite-chip-body">{label}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {note ? createPortal(note, document.body) : null}
    </div>
  );
}
