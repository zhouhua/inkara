"use client";

import { useId, useState } from "react";
import { PaperPicker } from "@/components/PaperPicker";
import { resolvePaperError } from "@/lib/ask-errors";
import { validateByokFields } from "@/lib/byok";
import { t, type Locale, type MessageKey } from "@/lib/i18n";
import type { PaperStyleId } from "@/lib/paper";
import { probeConnection } from "@/lib/probe";
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

type ProbeUi = "idle" | "testing" | "ok" | "fail";

export function SettingsPanel({
  open,
  settings,
  onClose,
  onChange,
  onClearMemory,
}: Props) {
  const titleId = useId();
  const [confirmForget, setConfirmForget] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{
    apiKey?: string;
    baseUrl?: string;
  }>({});
  const [probeUi, setProbeUi] = useState<ProbeUi>("idle");
  const [probeMessage, setProbeMessage] = useState("");

  const handleClose = () => {
    setConfirmForget(false);
    setFieldErrors({});
    setProbeUi("idle");
    setProbeMessage("");
    onClose();
  };

  const patchApi = (next: AppSettings) => {
    setFieldErrors({});
    setProbeUi("idle");
    setProbeMessage("");
    onChange(next);
  };

  const onTestConnection = async () => {
    const errors = validateByokFields({
      apiKey: settings.apiKey,
      baseUrl: settings.baseUrl,
    });
    setFieldErrors(errors);
    if (errors.apiKey || errors.baseUrl) {
      setProbeUi("idle");
      setProbeMessage("");
      return;
    }

    setProbeUi("testing");
    setProbeMessage(t(settings.locale, "probeTesting"));
    const result = await probeConnection({
      apiKey: settings.apiKey.trim(),
      baseUrl: settings.baseUrl.trim() || undefined,
      model: settings.model.trim() || undefined,
      locale: settings.locale,
    });
    if (result.ok) {
      setProbeUi("ok");
      setProbeMessage(t(settings.locale, "probeOk"));
      return;
    }
    const resolved = resolvePaperError({ error: result.error });
    setProbeUi("fail");
    setProbeMessage(t(settings.locale, resolved.messageKey as MessageKey));
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
              onChange({
                ...settings,
                showReadAs: e.target.value === "on",
              })
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
                patchApi({ ...settings, apiKey: e.target.value })
              }
            />
            {fieldErrors.apiKey ? (
              <span className="settings-field-error">
                {t(settings.locale, fieldErrors.apiKey as MessageKey)}
              </span>
            ) : null}
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
                patchApi({ ...settings, baseUrl: e.target.value })
              }
            />
            {fieldErrors.baseUrl ? (
              <span className="settings-field-error">
                {t(settings.locale, fieldErrors.baseUrl as MessageKey)}
              </span>
            ) : null}
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
                patchApi({ ...settings, model: e.target.value })
              }
            />
          </label>

          <div className="settings-probe">
            <button
              type="button"
              className="text-action"
              onClick={() => void onTestConnection()}
              disabled={probeUi === "testing"}
            >
              {t(settings.locale, "apiTest")}
            </button>
            {probeMessage ? (
              <p
                className={`settings-probe-result ${
                  probeUi === "ok"
                    ? "is-ok"
                    : probeUi === "fail"
                      ? "is-fail"
                      : ""
                }`}
              >
                {probeMessage}
              </p>
            ) : null}
          </div>
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
