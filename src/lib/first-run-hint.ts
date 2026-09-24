import { t, type Locale } from "@/lib/i18n";
import type { InputMode, SubmitMode } from "@/lib/settings";

export type FirstRunHintInput = {
  locale: Locale;
  submitMode: SubmitMode;
  inputMode: InputMode;
  /** Same meaning as InkPage `contentPresent` */
  contentPresent: boolean;
};

/**
 * Dock copy while hasCommittedOnce is false (ready/writing only — caller gates phase).
 */
export function firstRunDockHint(input: FirstRunHintInput): string {
  const { locale, submitMode, inputMode, contentPresent } = input;

  if (submitMode === "auto") {
    return contentPresent
      ? t(locale, "firstRunHintAutoWriting")
      : t(locale, "firstRunHintAutoIdle");
  }

  // manual
  if (contentPresent) {
    return t(locale, "firstRunHintManualWriting");
  }

  const idle = t(locale, "firstRunHintManualIdle");
  return inputMode === "type"
    ? `${idle} · ${t(locale, "submitHintTypeExtra")}`
    : idle;
}
