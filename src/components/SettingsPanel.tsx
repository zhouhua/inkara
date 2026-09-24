"use client";

import { useId, useState } from "react";
import { PaperPicker } from "@/components/PaperPicker";
import { t, type Locale } from "@/lib/i18n";
import type { PaperStyleId } from "@/lib/paper";
import type {
  AppSettings,
  IdlePace,
  SubmitMode,
} from "@/lib/settings";

type Props = {
  open: boolean;
  settings: AppSettings;
  onClose: () => void;
  onChange: (next: AppSettings) => void;
  onClearMemory: () => void;
};

export function SettingsPanel({
  open,
  settings,
  onClose,
  onChange,
  onClearMemory,
}: Props) {
  const titleId = useId();
  const [confirmForget, setConfirmForget] = useState(false);

  const handleClose = () => {
    setConfirmForget(false);
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
          <button type="button" className="text-action" onClick={handleClose}>
            {t(settings.locale, "close")}
          </button>
        </header>

        <label className="settings-row">
          <span>{t(settings.locale, "locale")}</span>
          <select
            value={settings.locale}
            onChange={(e) =>
              onChange({ ...settings, locale: e.target.value as Locale })
            }
          >
            <option value="zh">{t(settings.locale, "localeZh")}</option>
            <option value="en">{t(settings.locale, "localeEn")}</option>
          </select>
        </label>

        <label className="settings-row">
          <span>{t(settings.locale, "submitMode")}</span>
          <select
            value={settings.submitMode}
            onChange={(e) =>
              onChange({
                ...settings,
                submitMode: e.target.value as SubmitMode,
              })
            }
          >
            <option value="manual">{t(settings.locale, "submitManual")}</option>
            <option value="auto">{t(settings.locale, "submitAuto")}</option>
          </select>
        </label>

        {settings.submitMode === "auto" ? (
          <label className="settings-row">
            <span>{t(settings.locale, "idlePace")}</span>
            <select
              value={settings.idlePace}
              onChange={(e) =>
                onChange({
                  ...settings,
                  idlePace: e.target.value as IdlePace,
                })
              }
            >
              <option value="fast">{t(settings.locale, "idleFast")}</option>
              <option value="normal">{t(settings.locale, "idleNormal")}</option>
              <option value="slow">{t(settings.locale, "idleSlow")}</option>
            </select>
          </label>
        ) : null}

        <label className="settings-row">
          <span>{t(settings.locale, "showReadAs")}</span>
          <select
            value={settings.showReadAs ? "on" : "off"}
            onChange={(e) =>
              onChange({ ...settings, showReadAs: e.target.value === "on" })
            }
          >
            <option value="on">{t(settings.locale, "showReadAsOn")}</option>
            <option value="off">{t(settings.locale, "showReadAsOff")}</option>
          </select>
        </label>

        <PaperPicker
          locale={settings.locale}
          value={settings.paperStyle}
          onChange={(paperStyle: PaperStyleId) =>
            onChange({ ...settings, paperStyle })
          }
        />

        <div className="settings-section">
          <p className="settings-section-title">
            {t(settings.locale, "apiSection")}
          </p>
          <p className="settings-section-hint">
            {t(settings.locale, "apiSectionHint")}
          </p>

          <label className="settings-row settings-row-stack">
            <span>{t(settings.locale, "apiKey")}</span>
            <input
              type="password"
              autoComplete="off"
              spellCheck={false}
              placeholder={t(settings.locale, "apiKeyPlaceholder")}
              value={settings.apiKey}
              onChange={(e) =>
                onChange({ ...settings, apiKey: e.target.value })
              }
            />
          </label>

          <label className="settings-row settings-row-stack">
            <span>{t(settings.locale, "apiEndpoint")}</span>
            <input
              type="url"
              autoComplete="off"
              spellCheck={false}
              placeholder={t(settings.locale, "apiEndpointPlaceholder")}
              value={settings.baseUrl}
              onChange={(e) =>
                onChange({ ...settings, baseUrl: e.target.value })
              }
            />
          </label>

          <label className="settings-row settings-row-stack">
            <span>{t(settings.locale, "apiModel")}</span>
            <input
              type="text"
              autoComplete="off"
              spellCheck={false}
              placeholder={t(settings.locale, "apiModelPlaceholder")}
              value={settings.model}
              onChange={(e) =>
                onChange({ ...settings, model: e.target.value })
              }
            />
          </label>
        </div>

        <div className="settings-actions">
          {!confirmForget ? (
            <button
              type="button"
              className="text-action danger"
              onClick={() => setConfirmForget(true)}
            >
              {t(settings.locale, "clearMemory")}
            </button>
          ) : (
            <button
              type="button"
              className="text-action danger confirm"
              onClick={() => {
                onClearMemory();
                setConfirmForget(false);
              }}
            >
              {t(settings.locale, "confirmForget")}
            </button>
          )}
        </div>
      </aside>
    </>
  );
}
