import {
  getCachedSettingsRaw,
  hydrateDb,
  isDbHydrated,
  isSettingsDirty,
  markSettingsDirty,
  whenDbReady,
  writeSettingsRaw,
} from "./db";
import {
  defaultLocale,
  localeFromAcceptLanguage,
  type Locale,
  locales,
} from "./i18n";
import { defaultPaperStyle, isPaperStyleId, type PaperStyleId } from "./paper";

export type InputMode = "pen" | "type";
export type SubmitMode = "manual" | "auto";
export type IdlePace = "fast" | "normal" | "slow";

export type AppSettings = {
  locale: Locale;
  paperStyle: PaperStyleId;
  inputMode: InputMode;
  submitMode: SubmitMode;
  idlePace: IdlePace;
  hasCommittedOnce: boolean;
};

export const IDLE_PACE_MS: Record<IdlePace, number> = {
  fast: 3400,
  normal: 4500,
  slow: 6000,
};

const IDLE_PACES: IdlePace[] = ["fast", "normal", "slow"];

export const defaultSettings: AppSettings = {
  locale: defaultLocale,
  paperStyle: defaultPaperStyle,
  inputMode: "pen",
  submitMode: "manual",
  idlePace: "normal",
  hasCommittedOnce: false,
};

let settingsCache: AppSettings = { ...defaultSettings };
let pendingSave: AppSettings | null = null;

function isSubmitMode(v: unknown): v is SubmitMode {
  return v === "manual" || v === "auto";
}

function isInputMode(v: unknown): v is InputMode {
  return v === "pen" || v === "type";
}

function isIdlePace(v: unknown): v is IdlePace {
  return typeof v === "string" && IDLE_PACES.includes(v as IdlePace);
}

function paceFromMs(ms: number): IdlePace {
  let best: IdlePace = "normal";
  let bestDist = Infinity;
  for (const pace of IDLE_PACES) {
    const d = Math.abs(IDLE_PACE_MS[pace] - ms);
    if (d < bestDist) {
      bestDist = d;
      best = pace;
    }
  }
  return best;
}

export function idleMsFor(settings: AppSettings): number {
  return IDLE_PACE_MS[settings.idlePace] ?? IDLE_PACE_MS.normal;
}

export function normalizeSettings(
  parsed: (Partial<AppSettings> & { idleMs?: number }) | null | undefined,
): AppSettings {
  if (!parsed || typeof parsed !== "object") {
    return { ...defaultSettings };
  }

  const locale = locales.includes(parsed.locale as Locale)
    ? (parsed.locale as Locale)
    : defaultLocale;

  let submitMode: SubmitMode = defaultSettings.submitMode;
  let idlePace: IdlePace = defaultSettings.idlePace;

  if (isSubmitMode(parsed.submitMode)) {
    submitMode = parsed.submitMode;
  } else if (typeof parsed.idleMs === "number") {
    submitMode = "auto";
    idlePace = paceFromMs(parsed.idleMs);
  }

  if (isIdlePace(parsed.idlePace)) {
    idlePace = parsed.idlePace;
  }

  return {
    locale,
    paperStyle: isPaperStyleId(parsed.paperStyle)
      ? parsed.paperStyle
      : defaultPaperStyle,
    inputMode: isInputMode(parsed.inputMode)
      ? parsed.inputMode
      : defaultSettings.inputMode,
    submitMode,
    idlePace,
    hasCommittedOnce: parsed.hasCommittedOnce === true,
  };
}

function syncCacheFromDb() {
  if (isSettingsDirty()) return;
  settingsCache = normalizeSettings(
    getCachedSettingsRaw() as Partial<AppSettings> | null,
  );
}

function commitSettings(next: AppSettings): AppSettings {
  settingsCache = normalizeSettings(next);
  markSettingsDirty();
  void writeSettingsRaw(settingsCache);
  return { ...settingsCache };
}

export function loadSettings(): AppSettings {
  return { ...settingsCache };
}

export function saveSettings(settings: AppSettings) {
  const normalized = normalizeSettings(settings);
  if (!isDbHydrated()) {
    pendingSave = normalized;
    settingsCache = normalized;
    void whenDbReady().then(() => {
      void flushPendingSettings();
    });
    return normalized;
  }
  pendingSave = null;
  return commitSettings(normalized);
}

export function patchSettings(patch: Partial<AppSettings>): AppSettings {
  return saveSettings({ ...loadSettings(), ...patch });
}

async function flushPendingSettings() {
  if (!pendingSave) return;
  const pending = pendingSave;
  pendingSave = null;
  await hydrateDb();
  const fromDb = normalizeSettings(
    getCachedSettingsRaw() as Partial<AppSettings> | null,
  );
  const merged = mergePreHydrateSettings(fromDb, pending);
  commitSettings(merged);
}

export function mergePreHydrateSettings(
  fromDb: AppSettings,
  pending: AppSettings,
): AppSettings {
  return {
    ...fromDb,
    ...pending,
    hasCommittedOnce: fromDb.hasCommittedOnce || pending.hasCommittedOnce,
  };
}

export async function hydrateSettings(): Promise<AppSettings> {
  await hydrateDb();
  if (pendingSave) {
    await flushPendingSettings();
  } else if (!isSettingsDirty()) {
    const raw = getCachedSettingsRaw();
    syncCacheFromDb();
    if (raw == null && typeof navigator !== "undefined") {
      const header = navigator.languages?.length
        ? navigator.languages.join(",")
        : navigator.language;
      settingsCache = {
        ...settingsCache,
        locale: localeFromAcceptLanguage(header),
      };
    }
  }
  return { ...settingsCache };
}
