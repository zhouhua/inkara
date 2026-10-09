"use client";

import { useEffect, useRef } from "react";
import Mic from "reicon-react/icons/Mic";
import { t, type Locale } from "@/lib/i18n";

type Props = {
  locale: Locale;
  disabled: boolean;
  phase: "idle" | "listening" | "polishing";
  onPressStart: () => void;
  onPressEnd: () => void;
};

export function VoiceMicButton({
  locale,
  disabled,
  phase,
  onPressStart,
  onPressEnd,
}: Props) {
  const pressedRef = useRef(false);
  const onPressEndRef = useRef(onPressEnd);

  useEffect(() => {
    onPressEndRef.current = onPressEnd;
  }, [onPressEnd]);

  useEffect(() => {
    return () => {
      if (!pressedRef.current) return;
      pressedRef.current = false;
      onPressEndRef.current();
    };
  }, []);

  const endPress = () => {
    if (!pressedRef.current) return;
    pressedRef.current = false;
    onPressEnd();
  };

  return (
    <button
      type="button"
      className={`ink-link ink-icon-btn voice-mic${phase === "listening" ? " is-listening" : ""}`}
      aria-label={t(locale, "voiceMic")}
      title={t(locale, "voiceMic")}
      aria-pressed={phase === "listening"}
      disabled={disabled || phase === "polishing"}
      onPointerDown={(e) => {
        if (disabled || phase !== "idle" || e.button !== 0) return;
        e.preventDefault();
        pressedRef.current = true;
        onPressStart();
      }}
      onPointerUp={endPress}
      onPointerCancel={endPress}
      onPointerLeave={endPress}
    >
      <Mic size={16} aria-hidden />
    </button>
  );
}
