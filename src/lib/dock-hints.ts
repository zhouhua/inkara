import { t, type Locale } from "@/lib/i18n";
import { firstRunDockHint } from "@/lib/first-run-hint";
import type { InputMode, SubmitMode } from "@/lib/settings";

export type DockHintKind = "action" | "wait" | "error";

export type DockHint = {
  id: string;
  text: string;
  kind: DockHintKind;
  /** 0–100 when the tip tracks download progress */
  progress?: number;
};

export const DOCK_HINT_ROTATE_MS = 3600;

type CollectInput = {
  locale: Locale;
  phase: string;
  statusExtra: string | null;
  embedLoading: boolean;
  embedProgress: number;
  hasCommittedOnce: boolean;
  submitMode: SubmitMode;
  inputMode: InputMode;
  contentPresent: boolean;
  idleArmed: boolean;
  manualSubmitHint: string;
};

/**
 * All currently relevant dock tips (may rotate when length > 1).
 * Error / statusExtra is exclusive so the user always sees the failure.
 */
export function collectDockHints(input: CollectInput): DockHint[] {
  const {
    locale,
    phase,
    statusExtra,
    embedLoading,
    embedProgress,
    hasCommittedOnce,
    submitMode,
    inputMode,
    contentPresent,
    idleArmed,
    manualSubmitHint,
  } = input;

  if (statusExtra) {
    return [{ id: "status-extra", text: statusExtra, kind: "error" }];
  }

  if (phase === "error") {
    return [{ id: "phase-error", text: t(locale, "error"), kind: "error" }];
  }

  const hints: DockHint[] = [];

  if (embedLoading) {
    hints.push({
      id: "embed",
      text:
        embedProgress > 0
          ? t(locale, "embedLoadingPct", { pct: embedProgress })
          : t(locale, "embedLoading"),
      kind: "wait",
      progress: embedProgress,
    });
  }

  const waitPhaseText = waitTextForPhase(locale, phase);
  if (waitPhaseText) {
    hints.push({
      id: waitPhaseText.id,
      text: waitPhaseText.text,
      kind: "wait",
    });
  }

  if (phase === "ready" || phase === "writing") {
    let actionText = "";
    if (!hasCommittedOnce) {
      actionText = firstRunDockHint({
        locale,
        submitMode,
        inputMode,
        contentPresent,
      });
    } else if (submitMode === "manual") {
      actionText = manualSubmitHint;
    } else if (contentPresent) {
      actionText = idleArmed
        ? t(locale, "submitHintAuto")
        : t(locale, "submitHintAutoWait");
    } else {
      actionText = t(locale, "submitHintAutoIdle");
    }
    if (actionText) {
      hints.push({ id: "action", text: actionText, kind: "action" });
    }
  }

  return hints;
}

function waitTextForPhase(
  locale: Locale,
  phase: string
): { id: string; text: string } | null {
  switch (phase) {
    case "thinking":
      return { id: "wait-thinking", text: t(locale, "thinking") };
    case "answering":
      return { id: "wait-answering", text: t(locale, "answering") };
    case "recalling":
      return { id: "wait-recalling", text: t(locale, "recalling") };
    default:
      return null;
  }
}
