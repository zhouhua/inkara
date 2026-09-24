"use client";

import { t, type Locale, type MessageKey } from "@/lib/i18n";
import { paperStyles, type PaperStyleId } from "@/lib/paper";

const paperLabelKey: Record<PaperStyleId, MessageKey> = {
  blank: "paperBlank",
  lines: "paperLines",
  "dots-sm": "paperDotsSm",
  "dots-md": "paperDotsMd",
  "dots-lg": "paperDotsLg",
  "grid-sm": "paperGridSm",
  "grid-md": "paperGridMd",
  "grid-lg": "paperGridLg",
};

type Props = {
  locale: Locale;
  value: PaperStyleId;
  onChange: (id: PaperStyleId) => void;
};

export function PaperPicker({ locale, value, onChange }: Props) {
  return (
    <fieldset className="paper-picker">
      <legend className="paper-picker-legend">{t(locale, "paper")}</legend>
      <div className="paper-picker-grid" role="listbox" aria-label={t(locale, "paper")}>
        {paperStyles.map((paper) => {
          const selected = value === paper.id;
          const label = t(locale, paperLabelKey[paper.id]);
          return (
            <button
              key={paper.id}
              type="button"
              role="option"
              aria-selected={selected}
              aria-label={label}
              title={label}
              className={`paper-swatch ${selected ? "is-selected" : ""}`}
              data-paper-kind={paper.kind}
              style={
                paper.step
                  ? ({ ["--swatch-step" as string]: paper.step })
                  : undefined
              }
              onClick={() => onChange(paper.id)}
            >
              <span className="paper-swatch-face" aria-hidden>
                <span className="paper-swatch-pattern" />
              </span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
