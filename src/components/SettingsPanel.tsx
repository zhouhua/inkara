"use client";

import { useId, useState } from "react";
import Xmark from "reicon-react/icons/Xmark";
import GlideSelect from "@/components/GlideSelect";
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
  /** Field-level patch — parent merges against persisted cache, not stale props. */
  onPatch: (patch: Partial<AppSettings>) => void;
  onClearMemory: () => void;
};

type ProbeUi = "idle" | "testing" | "ok" | "fail";

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

  const patchApi = (patch: Partial<AppSettings>) => {
    setFieldErrors({});
    setProbeUi("idle");
    setProbeMessage("");
    onPatch(patch);
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

          <label className="settings-row settings-row-stack">
            <span>{t(settings.locale, "apiKey")}</span>
            <input
              type="password"
              autoComplete="off"
              spellCheck={false}
              placeholder={t(settings.locale, "apiKeyPlaceholder")}
              value={settings.apiKey}
              onChange={(e) => patchApi({ apiKey: e.target.value })}
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
              onChange={(e) => patchApi({ baseUrl: e.target.value })}
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
              onChange={(e) => patchApi({ model: e.target.value })}
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
                role="status"
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
              className="text-action is-danger"
              onClick={() => setConfirmForget(true)}
            >
              {t(settings.locale, "clearMemory")}
            </button>
          ) : (
            <button
              type="button"
              className="text-action is-danger"
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
