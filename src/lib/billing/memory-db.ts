import {
  DAILY_GRANT_AMOUNT,
  type ActiveSubscription,
  type CreditKind,
  type CreditLot,
} from "./schema";
import type { BillingStore } from "./ledger";

export type MemoryBillingStore = BillingStore & {
  setActiveSubscription: NonNullable<BillingStore["setActiveSubscription"]>;
  addPurchased: NonNullable<BillingStore["addPurchased"]>;
  setUsage: NonNullable<BillingStore["setUsage"]>;
  markGoodwillGranted: NonNullable<BillingStore["markGoodwillGranted"]>;
};

function id(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function isUsable(lot: CreditLot, at: Date): boolean {
  if (lot.remaining <= 0) return false;
  if (!lot.expiresAt) return true;
  return new Date(lot.expiresAt).getTime() >= at.getTime();
}

export function createMemoryBillingStore(opts?: {
  now?: Date;
}): MemoryBillingStore {
  void opts;
  const lots: CreditLot[] = [];
  const usage = new Map<string, number>();
  const goodwill = new Set<string>();
  const subs = new Map<string, ActiveSubscription>();
  let seq = 0;

  const usageKey = (userId: string, period: string) => `${userId}:${period}`;

  const store: MemoryBillingStore = {
    async ensureDailyGrant(subjectId, grantDate, expiresAt) {
      const exists = lots.some(
        (l) =>
          l.subjectId === subjectId &&
          l.kind === "daily_grant" &&
          l.grantDate === grantDate,
      );
      if (exists) return;
      lots.push({
        id: id("lot"),
        subjectId,
        kind: "daily_grant",
        amount: DAILY_GRANT_AMOUNT,
        remaining: DAILY_GRANT_AMOUNT,
        grantDate,
        expiresAt,
        createdAt: new Date().toISOString(),
      });
    },

    async getActiveSubscription(userId, at) {
      const sub = subs.get(userId);
      if (!sub) return null;
      const t = at.getTime();
      if (t < new Date(sub.periodStart).getTime()) return null;
      if (t >= new Date(sub.periodEnd).getTime()) return null;
      return sub;
    },

    async getUsage(userId, period) {
      return usage.get(usageKey(userId, period)) ?? 0;
    },

    async incrementUsage(userId, period) {
      const k = usageKey(userId, period);
      usage.set(k, (usage.get(k) ?? 0) + 1);
    },

    async sumRemaining(subjectId, kind, at) {
      return lots
        .filter((l) => l.subjectId === subjectId && l.kind === kind && isUsable(l, at))
        .reduce((s, l) => s + l.remaining, 0);
    },

    async debitFifo(subjectId, kind, amount, at) {
      const candidates = lots
        .filter((l) => l.subjectId === subjectId && l.kind === kind && isUsable(l, at))
        .sort((a, b) => {
          const ae = a.expiresAt ? new Date(a.expiresAt).getTime() : Number.POSITIVE_INFINITY;
          const be = b.expiresAt ? new Date(b.expiresAt).getTime() : Number.POSITIVE_INFINITY;
          if (ae !== be) return ae - be;
          return a.createdAt.localeCompare(b.createdAt);
        });

      let need = amount;
      for (const lot of candidates) {
        if (need <= 0) break;
        const take = Math.min(lot.remaining, need);
        lot.remaining -= take;
        need -= take;
      }
      return need === 0;
    },

    async hasGoodwillGrant(userId, period) {
      return goodwill.has(usageKey(userId, period));
    },

    async grantGoodwill(userId, period, amount) {
      goodwill.add(usageKey(userId, period));
      lots.push({
        id: id("lot"),
        subjectId: userId,
        kind: "goodwill",
        amount,
        remaining: amount,
        grantDate: null,
        expiresAt: null,
        createdAt: new Date(Date.now() + seq++).toISOString(),
      });
    },

    async recordLedger() {
      // audit no-op in memory tests
    },

    setActiveSubscription(userId, sub) {
      subs.set(userId, sub);
    },

    addPurchased(subjectId, amount) {
      lots.push({
        id: id("lot"),
        subjectId,
        kind: "purchased" satisfies CreditKind,
        amount,
        remaining: amount,
        grantDate: null,
        expiresAt: null,
        createdAt: new Date().toISOString(),
      });
    },

    setUsage(userId, period, count) {
      usage.set(usageKey(userId, period), count);
    },

    markGoodwillGranted(userId, period) {
      goodwill.add(usageKey(userId, period));
    },
  };

  return store;
}
