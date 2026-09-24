import {
  getCachedQuota,
  hydrateDb,
  isDbHydrated,
  writeQuota,
  type QuotaRecord,
} from "./db";
import { hasUserApiKey, type AppSettings } from "./settings";

export const FREE_DAILY_LIMIT = 2;

function todayKey(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function currentQuota(): QuotaRecord {
  const q = getCachedQuota();
  const today = todayKey();
  if (q.date === today) return q;
  return { date: today, count: 0 };
}

export function isProductionEnv(): boolean {
  return process.env.NODE_ENV === "production";
}

/** Whether this ask consumes the free daily quota (server key path). */
export function usesFreeQuota(settings: AppSettings): boolean {
  return isProductionEnv() && !hasUserApiKey(settings);
}

export function getFreeAskCount(): number {
  if (isDbHydrated()) {
    return currentQuota().count;
  }
  return 0;
}

export function canUseFreeAsk(): boolean {
  return getFreeAskCount() < FREE_DAILY_LIMIT;
}

export async function recordFreeAsk(): Promise<void> {
  await hydrateDb();
  const today = todayKey();
  const q = currentQuota();
  const next: QuotaRecord =
    q.date === today
      ? { date: today, count: q.count + 1 }
      : { date: today, count: 1 };
  await writeQuota(next);
}

export async function hydrateQuota(): Promise<QuotaRecord> {
  await hydrateDb();
  return currentQuota();
}
