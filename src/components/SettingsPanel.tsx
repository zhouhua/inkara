"use client";

import { useEffect, useId, useState } from "react";
import Xmark from "reicon-react/icons/Xmark";
import GlideSelect from "@/components/GlideSelect";
import { PaperPicker } from "@/components/PaperPicker";
import { t, type Locale } from "@/lib/i18n";
import type { PaperStyleId } from "@/lib/paper";
import type { AppSettings, IdlePace, SubmitMode } from "@/lib/settings";

type Props = {
  open: boolean;
  settings: AppSettings;
  onClose: () => void;
  onPatch: (patch: Partial<AppSettings>) => void;
  onOpenBilling: () => void;
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

type BillingSummary = {
  anonymous?: boolean;
  email?: string | null;
  credits?: { daily: number; purchased: number };
  subscription?: { active: boolean };
};

export function SettingsPanel({
  open,
  settings,
  onClose,
  onPatch,
  onOpenBilling,
}: Props) {
  const titleId = useId();
  const [summary, setSummary] = useState<BillingSummary | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void fetch("/api/billing/me")
      .then((r) => r.json())
      .then((data: BillingSummary) => {
        if (!cancelled) setSummary(data);
      })
      .catch(() => {
        if (!cancelled) setSummary(null);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  if (!open) return null;

  return (
    <>
      <div className="settings-backdrop" onClick={onClose} role="presentation" />
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
            onClick={onClose}
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
            {t(settings.locale, "billingTitle")}
          </p>
          <p className="settings-section-hint">
            {summary?.anonymous === false
              ? t(settings.locale, "billingCreditsLine")
                  .replace("{daily}", String(summary.credits?.daily ?? 0))
                  .replace(
                    "{purchased}",
                    String(summary.credits?.purchased ?? 0),
                  )
              : t(settings.locale, "billingNeedLogin")}
          </p>
          <button
            type="button"
            className="text-action"
            onClick={() => {
              onClose();
              onOpenBilling();
            }}
          >
            {t(settings.locale, "billingOpen")}
          </button>
        </div>
      </aside>
    </>
  );
}
