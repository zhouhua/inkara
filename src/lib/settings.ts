import {
  getCachedSettingsRaw,
  hydrateDb,
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
  /** User has entered commit (fading) at least once — dismisses first-run dock copy */
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
  submitMode: "manual",
  idlePace: "normal",
  showReadAs: true,
  apiKey: "",
  baseUrl: "",
  model: "",
  hasCommittedOnce: false,
};

let settingsCache: AppSettings = { ...defaultSettings };

function isSubmitMode(v: unknown): v is SubmitMode {
  return v === "manual" || v === "auto";
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
  settingsCache = normalizeSettings(
    getCachedSettingsRaw() as Partial<AppSettings> | null
  );
}

/** Sync read from memory cache (call after hydrateDb). */
export function loadSettings(): AppSettings {
  return { ...settingsCache };
}

export function saveSettings(settings: AppSettings) {
  settingsCache = normalizeSettings(settings);
  void writeSettingsRaw(settingsCache);
}

export function hasUserApiKey(settings: AppSettings = settingsCache): boolean {
  return settings.apiKey.trim().length > 0;
}

/** Ensure DB is hydrated and settings cache is warm. */
export async function hydrateSettings(): Promise<AppSettings> {
  await hydrateDb();
  syncCacheFromDb();
  return { ...settingsCache };
}
