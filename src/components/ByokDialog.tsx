"use client";

import { useEffect, useId, useState } from "react";
import { resolvePaperError } from "@/lib/ask-errors";
import {
  maskApiKey,
  validateByokDraft,
  validateByokFields,
} from "@/lib/byok";
import { t, type Locale, type MessageKey } from "@/lib/i18n";
import { probeConnection } from "@/lib/probe";
import { hasUserApiKey, type AppSettings } from "@/lib/settings";

type Draft = {
  apiKey: string;
  baseUrl: string;
  model: string;
};

type Props = {
  open: boolean;
  locale: Locale;
  settings: AppSettings;
  onClose: () => void;
  onSave: (draft: Draft) => void;
};

type ProbeUi = "idle" | "testing" | "ok" | "fail";

function draftFromSettings(settings: AppSettings): Draft {
  return {
    apiKey: settings.apiKey,
    baseUrl: settings.baseUrl,
    model: settings.model,
  };
}

export function ByokDialog({
  open,
  locale,
  settings,
  onClose,
  onSave,
}: Props) {
  const titleId = useId();
  const [draft, setDraft] = useState<Draft>(() => draftFromSettings(settings));
  const [fieldErrors, setFieldErrors] = useState<{
    apiKey?: string;
    baseUrl?: string;
  }>({});
  const [probeUi, setProbeUi] = useState<ProbeUi>("idle");
  const [probeMessage, setProbeMessage] = useState("");

  useEffect(() => {
    if (!open) return;
    setDraft(draftFromSettings(settings));
    setFieldErrors({});
    setProbeUi("idle");
    setProbeMessage("");
  }, [open, settings]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const patchDraft = (patch: Partial<Draft>) => {
    setFieldErrors({});
    setProbeUi("idle");
    setProbeMessage("");
    setDraft((prev) => ({ ...prev, ...patch }));
  };

  const onTestConnection = async () => {
    const errors = validateByokFields({
      apiKey: draft.apiKey,
      baseUrl: draft.baseUrl,
    });
    setFieldErrors(errors);
    if (errors.apiKey || errors.baseUrl) {
      setProbeUi("idle");
      setProbeMessage("");
      return;
    }

    setProbeUi("testing");
    setProbeMessage(t(locale, "probeTesting"));
    const result = await probeConnection({
      apiKey: draft.apiKey.trim(),
      baseUrl: draft.baseUrl.trim() || undefined,
      model: draft.model.trim() || undefined,
      locale,
    });
    if (result.ok) {
      setProbeUi("ok");
      setProbeMessage(t(locale, "probeOk"));
      return;
    }
    const resolved = resolvePaperError({ error: result.error });
    setProbeUi("fail");
    setProbeMessage(t(locale, resolved.messageKey as MessageKey));
  };

  const onSubmit = () => {
    const errors = validateByokDraft(draft);
    setFieldErrors(errors);
    if (errors.apiKey || errors.baseUrl) return;
    onSave({
      apiKey: draft.apiKey.trim(),
      baseUrl: draft.baseUrl.trim(),
      model: draft.model.trim(),
    });
    onClose();
  };

  const onClear = () => {
    setFieldErrors({});
    setProbeUi("idle");
    setProbeMessage("");
    setDraft({ apiKey: "", baseUrl: "", model: "" });
  };

  const draftHasKey = draft.apiKey.trim().length > 0;
  const showClear =
    hasUserApiKey(settings) ||
    draftHasKey ||
    Boolean(draft.baseUrl.trim()) ||
    Boolean(draft.model.trim());

  return (
    <div className="byok-layer" role="presentation">
      <div
        className="byok-backdrop"
        onClick={onClose}
        role="presentation"
      />
      <div
        className="byok-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <header className="byok-header">
          <h3 id={titleId}>{t(locale, "apiSection")}</h3>
          <button type="button" className="text-action" onClick={onClose}>
            {t(locale, "close")}
          </button>
        </header>

        <div className="byok-fields">
          <label className="byok-field">
            <span>{t(locale, "apiKey")}</span>
            <input
              type="password"
              autoComplete="off"
              spellCheck={false}
              placeholder={t(locale, "apiKeyPlaceholder")}
              value={draft.apiKey}
              onChange={(e) => patchDraft({ apiKey: e.target.value })}
            />
            {fieldErrors.apiKey ? (
              <span className="settings-field-error">
                {t(locale, fieldErrors.apiKey as MessageKey)}
              </span>
            ) : null}
          </label>

          <label className="byok-field">
            <span>{t(locale, "apiEndpoint")}</span>
            <input
              type="url"
              autoComplete="off"
              spellCheck={false}
              placeholder={t(locale, "apiEndpointPlaceholder")}
              value={draft.baseUrl}
              onChange={(e) => patchDraft({ baseUrl: e.target.value })}
            />
            {fieldErrors.baseUrl ? (
              <span className="settings-field-error">
                {t(locale, fieldErrors.baseUrl as MessageKey)}
              </span>
            ) : null}
          </label>

          <label className="byok-field">
            <span>{t(locale, "apiModel")}</span>
            <input
              type="text"
              autoComplete="off"
              spellCheck={false}
              placeholder={t(locale, "apiModelPlaceholder")}
              value={draft.model}
              onChange={(e) => patchDraft({ model: e.target.value })}
            />
          </label>
        </div>

        {draftHasKey || probeMessage ? (
          <div className="settings-probe">
            {draftHasKey ? (
              <button
                type="button"
                className="text-action"
                onClick={() => void onTestConnection()}
                disabled={probeUi === "testing"}
              >
                {t(locale, "apiTest")}
              </button>
            ) : null}
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
        ) : null}

        <footer className="byok-actions">
          {showClear ? (
            <button type="button" className="text-action" onClick={onClear}>
              {t(locale, "apiClear")}
            </button>
          ) : (
            <span />
          )}
          <div className="byok-actions-end">
            <button type="button" className="text-action" onClick={onClose}>
              {t(locale, "apiCancel")}
            </button>
            <button
              type="button"
              className="text-action is-primary"
              onClick={onSubmit}
            >
              {t(locale, "apiSave")}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}

export function byokSummaryLabel(
  settings: AppSettings,
  locale: Locale
): string {
  if (!hasUserApiKey(settings)) {
    return t(locale, "apiNotConfigured");
  }
  const masked = maskApiKey(settings.apiKey);
  return t(locale, "apiConfigured", { key: masked });
}
