"use client";

import { useId, useState } from "react";
import Xmark from "reicon-react/icons/Xmark";
import { ByokDialog, byokSummaryLabel } from "@/components/ByokDialog";
import GlideSelect from "@/components/GlideSelect";
import { PaperPicker } from "@/components/PaperPicker";
import { t, type Locale } from "@/lib/i18n";
import type { PaperStyleId } from "@/lib/paper";
import {
  hasUserApiKey,
  type AppSettings,
  type IdlePace,
  type SubmitMode,
} from "@/lib/settings";

type Props = {
  open: boolean;
  settings: AppSettings;
  onClose: () => void;
  /** Field-level patch — parent merges against persisted cache, not stale props. */
  onPatch: (patch: Partial<AppSettings>) => void;
};

const glideTone = {
  accentColor: "var(--ink)",
  surfaceColor: "oklch(0.985 0.003 100)",
  highlightColor: "oklch(0.26 0.016 255 / 0.08)",
  textColor: "var(--ink)",
  size: "sm" as const,
  radius: 6,
  align: "right" as const,
  showTags: false,
};

export function SettingsPanel({
  open,
  settings,
  onClose,
  onPatch,
}: Props) {
  const titleId = useId();
  const [byokOpen, setByokOpen] = useState(false);

  const handleClose = () => {
    setByokOpen(false);
    onClose();
  };

  if (!open) return null;

  return (
    <>
      <div className="settings-backdrop" onClick={handleClose} role="presentation" />
      <aside
        className="settings-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <header className="settings-header">
          <h2 id={titleId}>{t(settings.locale, "settings")}</h2>
          <button
            type="button"
            className="ink-link ink-icon-btn"
            onClick={handleClose}
            aria-label={t(settings.locale, "close")}
            title={t(settings.locale, "close")}
          >
            <Xmark size={16} aria-hidden />
          </button>
        </header>

        <div className="settings-row">
          <span>{t(settings.locale, "locale")}</span>
          <GlideSelect
            className="settings-glide"
            {...glideTone}
            menuWidth={140}
            ariaLabel={t(settings.locale, "locale")}
            value={settings.locale}
            onChange={(value) => onPatch({ locale: value as Locale })}
            options={[
              { value: "zh", label: t(settings.locale, "localeZh") },
              { value: "en", label: t(settings.locale, "localeEn") },
            ]}
          />
        </div>

        <div className="settings-row">
          <span>{t(settings.locale, "submitMode")}</span>
          <GlideSelect
            className="settings-glide"
            {...glideTone}
            menuWidth={160}
            ariaLabel={t(settings.locale, "submitMode")}
            value={settings.submitMode}
            onChange={(value) =>
              onPatch({ submitMode: value as SubmitMode })
            }
            options={[
              { value: "manual", label: t(settings.locale, "submitManual") },
              { value: "auto", label: t(settings.locale, "submitAuto") },
            ]}
          />
        </div>

        {settings.submitMode === "auto" ? (
          <div className="settings-row">
            <span>{t(settings.locale, "idlePace")}</span>
            <GlideSelect
              className="settings-glide"
              {...glideTone}
              menuWidth={140}
              ariaLabel={t(settings.locale, "idlePace")}
              value={settings.idlePace}
              onChange={(value) => onPatch({ idlePace: value as IdlePace })}
              options={[
                { value: "fast", label: t(settings.locale, "idleFast") },
                { value: "normal", label: t(settings.locale, "idleNormal") },
                { value: "slow", label: t(settings.locale, "idleSlow") },
              ]}
            />
          </div>
        ) : null}

        <PaperPicker
          locale={settings.locale}
          value={settings.paperStyle}
          onChange={(paperStyle: PaperStyleId) => onPatch({ paperStyle })}
        />

        <div className="settings-section">
          <p className="settings-section-title">
            {t(settings.locale, "apiSection")}
          </p>
          <p className="settings-section-hint">
            {t(settings.locale, "apiSectionHint")}
          </p>
          <div className="settings-byok-summary">
            <p
              className={`settings-byok-status ${
                hasUserApiKey(settings) ? "is-set" : ""
              }`}
            >
              {byokSummaryLabel(settings, settings.locale)}
            </p>
            <button
              type="button"
              className="text-action"
              onClick={() => setByokOpen(true)}
            >
              {t(settings.locale, "apiConfigure")}
            </button>
          </div>
        </div>
      </aside>

      <ByokDialog
        open={byokOpen}
        locale={settings.locale}
        settings={settings}
        onClose={() => setByokOpen(false)}
        onSave={(draft) => onPatch(draft)}
      />
    </>
  );
}
