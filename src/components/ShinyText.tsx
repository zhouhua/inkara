"use client";

import type { CSSProperties } from "react";

type Props = {
  text: string;
  className?: string;
  /** Seconds per shine sweep */
  speed?: number;
  disabled?: boolean;
};

/**
 * Soft metallic sheen across text (React Bits ShinyText idea),
 * tuned for light e-ink paper instead of dark UI.
 */
export function ShinyText({
  text,
  className = "",
  speed = 2.4,
  disabled = false,
}: Props) {
  if (disabled) {
    return <span className={className}>{text}</span>;
  }

  return (
    <span
      className={`shiny-text ${className}`.trim()}
      style={{ ["--shiny-speed" as string]: `${speed}s` } as CSSProperties}
    >
      {text}
    </span>
  );
}
