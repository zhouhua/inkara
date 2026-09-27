"use client";

import { useId } from "react";
import { t, type Locale, type MessageKey } from "@/lib/i18n";

type Props = {
  open: boolean;
  locale: Locale;
  onClose: () => void;
};

const HELP_KEYS = [
  "helpWrite",
  "helpSubmit",
  "helpReply",
  "helpRecall",
  "helpTools",
] as const satisfies readonly MessageKey[];

export function HelpPanel({ open, locale, onClose }: Props) {
  const titleId = useId();

  if (!open) return null;

  return (
    <>
      <div className="settings-backdrop" onClick={onClose} role="presentation" />
      <aside
        className="settings-sheet help-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <header className="settings-header">
          <h2 id={titleId}>{t(locale, "help")}</h2>
          <button type="button" className="text-action" onClick={onClose}>
            {t(locale, "close")}
          </button>
        </header>

        <p className="help-lead">{t(locale, "helpLead")}</p>

        <ol className="help-list">
          {HELP_KEYS.map((key) => (
            <li key={key}>{t(locale, key)}</li>
          ))}
        </ol>
      </aside>
    </>
  );
}
