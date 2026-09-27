import {
  getCachedSettingsRaw,
  hydrateDb,
  isDbHydrated,
  isSettingsDirty,
  markSettingsDirty,
  whenDbReady,
  writeSettingsRaw,
} from "./db";
import { defaultLocale, type Locale, locales } from "./i18n";
import {
  defaultPaperStyle,
  isPaperStyleId,
  type PaperStyleId,
} from "./paper";

export type InputMode = "pen" | "type";
export type SubmitMode = "manual" | "auto";
export type IdlePace = "fast" | "normal" | "slow";

export type AppSettings = {
  locale: Locale;
  paperStyle: PaperStyleId;
  /** Pen or keyboard input */
  inputMode: InputMode;
  /** How pages are committed */
  submitMode: SubmitMode;
  /** Delay pace when submitMode is auto */
  idlePace: IdlePace;
  /** Show persistent “read as” transcription */
  showReadAs: boolean;
  /** User-provided OpenAI-compatible API key (BYOK) */
  apiKey: string;
  /** User-provided base URL; empty uses server default */
  baseUrl: string;
  /** User-provided model id; empty uses server default */
  model: string;
  /** User has entered commit (thinking) at least once — dismisses first-run dock copy */
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
  showReadAs: true,
  apiKey: "",
  baseUrl: "",
  model: "",
  hasCommittedOnce: false,
};

let settingsCache: AppSettings = { ...defaultSettings };

/**
 * Saves requested before DB hydrate. Applied on top of IDB after hydrate
 * using field-level patches recorded separately when possible; full object
 * only replaces after ready (UI should not save pre-hydrate).
 */
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

/** Map legacy idleMs to nearest pace. */
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
  parsed: Partial<AppSettings> & { idleMs?: number } | null | undefined
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
    showReadAs: parsed.showReadAs !== false,
    apiKey: typeof parsed.apiKey === "string" ? parsed.apiKey : "",
    baseUrl: typeof parsed.baseUrl === "string" ? parsed.baseUrl.trim() : "",
    model: typeof parsed.model === "string" ? parsed.model.trim() : "",
    hasCommittedOnce: parsed.hasCommittedOnce === true,
  };
}

function syncCacheFromDb() {
  if (isSettingsDirty()) return;
  settingsCache = normalizeSettings(
    getCachedSettingsRaw() as Partial<AppSettings> | null
  );
}

function commitSettings(next: AppSettings): AppSettings {
  settingsCache = normalizeSettings(next);
  markSettingsDirty();
  void writeSettingsRaw(settingsCache);
  return { ...settingsCache };
}

/** Sync read from memory cache (call after hydrateDb). */
export function loadSettings(): AppSettings {
  return { ...settingsCache };
}

/**
 * Persist settings. Before DB is ready, queues the save and applies it after
 * hydrate on top of IDB (never writes SSR defaults over stored secrets alone).
 */
export function saveSettings(settings: AppSettings) {
  const normalized = normalizeSettings(settings);
  if (!isDbHydrated()) {
    // Queue only — do not mark IDB cache dirty with SSR defaults.
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

/**
 * Patch settings against the module cache (source of truth), never against a
 * possibly-stale React props snapshot. Prevents rapid field edits from
 * resurrecting an older submitMode / apiKey / etc.
 */
export function patchSettings(patch: Partial<AppSettings>): AppSettings {
  return saveSettings({ ...loadSettings(), ...patch });
}

async function flushPendingSettings() {
  if (!pendingSave) return;
  const pending = pendingSave;
  pendingSave = null;
  await hydrateDb();
  const fromDb = normalizeSettings(
    getCachedSettingsRaw() as Partial<AppSettings> | null
  );
  const merged = mergePreHydrateSettings(fromDb, pending);
  commitSettings(merged);
}

/**
 * Pre-hydrate UI may hold SSR defaults. Keep non-empty secrets from DB when
 * pending left them blank; otherwise prefer pending (user intent).
 */
export function mergePreHydrateSettings(
  fromDb: AppSettings,
  pending: AppSettings
): AppSettings {
  return {
    ...fromDb,
    ...pending,
    apiKey: pending.apiKey.trim() ? pending.apiKey : fromDb.apiKey,
    baseUrl: pending.baseUrl.trim() ? pending.baseUrl : fromDb.baseUrl,
    model: pending.model.trim() ? pending.model : fromDb.model,
    hasCommittedOnce: fromDb.hasCommittedOnce || pending.hasCommittedOnce,
  };
}

export function hasUserApiKey(settings: AppSettings = settingsCache): boolean {
  return settings.apiKey.trim().length > 0;
}

/** Ensure DB is hydrated and settings cache is warm. */
export async function hydrateSettings(): Promise<AppSettings> {
  await hydrateDb();
  if (pendingSave) {
    await flushPendingSettings();
  } else if (!isSettingsDirty()) {
    syncCacheFromDb();
  }
  return { ...settingsCache };
}
