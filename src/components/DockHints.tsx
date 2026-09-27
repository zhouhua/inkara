"use client";

import {
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
} from "react";
import { ShinyText } from "@/components/ShinyText";
import {
  DOCK_HINT_ROTATE_MS,
  type DockHint,
} from "@/lib/dock-hints";
import { prefersReducedMotion } from "@/lib/ink-motion";

type Props = {
  hints: DockHint[];
  /** Auto-submit countdown ring (left of tip) */
  showIdleRing?: boolean;
  idleRingProgress?: number;
};

export function DockHints({
  hints,
  showIdleRing = false,
  idleRingProgress = 0,
}: Props) {
  const hintsKey = useMemo(() => hints.map((h) => h.id).join("|"), [hints]);
  const [index, setIndex] = useState(0);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    setReduceMotion(prefersReducedMotion());
  }, []);

  useEffect(() => {
    setIndex(0);
  }, [hintsKey]);

  useEffect(() => {
    if (hints.length <= 1) return;
    const timer = window.setInterval(() => {
      setIndex((i) => (i + 1) % hints.length);
    }, DOCK_HINT_ROTATE_MS);
    return () => window.clearInterval(timer);
  }, [hintsKey, hints.length]);

  const safeIndex = hints.length === 0 ? 0 : index % hints.length;
  const current = hints[safeIndex] ?? null;

  if (!current) return null;

  const isError = current.kind === "error";
  const isWait = current.kind === "wait";
  const isSoft = current.kind === "action";
  const showProgress = typeof current.progress === "number";

  const ringCircumference = 2 * Math.PI * 9;
  const ringOffset = ringCircumference * (1 - idleRingProgress);

  const textClass = [
    "submit-hint",
    "dock-hint-text",
    isWait || isError ? "is-active" : "",
    isError ? "is-error" : "",
    isSoft ? "is-soft" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className="dock-hints"
      role="status"
      aria-live="polite"
      aria-busy={isWait || undefined}
    >
      {showIdleRing ? (
        <svg
          className="idle-ring"
          width="24"
          height="24"
          viewBox="0 0 24 24"
          aria-hidden
        >
          <circle
            className="idle-ring-track"
            cx="12"
            cy="12"
            r="9"
            fill="none"
          />
          <circle
            className="idle-ring-progress"
            cx="12"
            cy="12"
            r="9"
            fill="none"
            strokeDasharray={ringCircumference}
            strokeDashoffset={ringOffset}
            transform="rotate(-90 12 12)"
          />
        </svg>
      ) : null}

      <div className="dock-hint-stage">
        <div
          key={`${hintsKey}:${safeIndex}`}
          className={[
            "dock-hint-slide",
            reduceMotion ? "is-instant" : "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          {showProgress ? (
            <div className="embed-load-track" aria-hidden>
              <div
                className="embed-load-fill"
                style={
                  {
                    ["--embed-pct" as string]: `${Math.max(4, current.progress ?? 0)}%`,
                  } as CSSProperties
                }
              />
            </div>
          ) : null}
          {isWait ? (
            <p className={textClass}>
              <ShinyText
                text={current.text}
                className="dock-hint-shiny"
                speed={2.6}
                disabled={reduceMotion}
              />
            </p>
          ) : (
            <p className={textClass}>{current.text}</p>
          )}
        </div>
      </div>

      {hints.length > 1 ? (
        <div className="dock-hint-dots" aria-hidden>
          {hints.map((h, i) => (
            <span
              key={h.id}
              className={`dock-hint-dot ${i === safeIndex ? "is-on" : ""}`}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
