"use client";

import { useId } from "react";
import { HelpText } from "@/components/HelpText";
import { InkKbd } from "@/components/InkKbd";
import { t, type Locale, type MessageKey } from "@/lib/i18n";

type Props = {
  open: boolean;
  locale: Locale;
  onClose: () => void;
};

const MEMOS = [
  "helpMemoPen",
  "helpMemoType",
  "helpMemoVoice",
  "helpMemoAuto",
  "helpMemoRecall",
  "helpMemoHistory",
  "helpMemoContinue",
  "helpMemoClear",
  "helpMemoChapter",
  "helpMemoExport",
] as const satisfies readonly MessageKey[];

const SHORTCUTS: {
  keys: string[];
  note: MessageKey;
}[] = [
  { keys: ["Enter"], note: "helpKeyEnter" },
  { keys: ["Shift", "Enter"], note: "helpKeyShiftEnter" },
];

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
        <header className="settings-header help-header">
          <h2 id={titleId}>{t(locale, "help")}</h2>
          <button type="button" className="text-action" onClick={onClose}>
            {t(locale, "close")}
          </button>
        </header>

        <div className="help-intro">
          <p className="help-intro-who">{t(locale, "helpIntro")}</p>
          <p className="help-lead">
            <HelpText text={t(locale, "helpLead")} />
          </p>
        </div>

        <ul className="help-shortcuts" aria-label={t(locale, "helpKeyLegend")}>
          {SHORTCUTS.map(({ keys, note }) => (
            <li key={note} className="help-shortcut-row">
              <span className="help-shortcut-keys" aria-hidden>
                {keys.map((key, i) => (
                  <span key={`${key}-${i}`} className="help-shortcut-chord">
                    {i > 0 ? <span className="ink-kbd-join">+</span> : null}
                    <InkKbd>{key}</InkKbd>
                  </span>
                ))}
              </span>
              <span className="help-shortcut-label">{t(locale, note)}</span>
            </li>
          ))}
        </ul>

        <ol className="help-memos" aria-label={t(locale, "helpMemosLabel")}>
          {MEMOS.map((key, index) => (
            <li key={key} className="help-memo">
              <span className="help-memo-index" aria-hidden>
                {String(index + 1).padStart(2, "0")}
              </span>
              <p className="help-memo-body">
                <HelpText text={t(locale, key)} />
              </p>
            </li>
          ))}
        </ol>
      </aside>
    </>
  );
}
