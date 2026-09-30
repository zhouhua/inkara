import {
  GOODWILL_AMOUNT,
  SUBSCRIPTION_SOFT_CAP,
  type ActiveSubscription,
  type BalanceSnapshot,
  type ConsumeResult,
  type CreditKind,
} from "./schema";

export type BillingStore = {
  ensureDailyGrant(subjectId: string, grantDate: string, expiresAt: string): Promise<void>;
  getActiveSubscription(userId: string, at: Date): Promise<ActiveSubscription | null>;
  getUsage(userId: string, period: string): Promise<number>;
  incrementUsage(userId: string, period: string): Promise<void>;
  sumRemaining(
    subjectId: string,
    kind: CreditKind,
    at: Date,
  ): Promise<number>;
  debitFifo(
    subjectId: string,
    kind: CreditKind,
    amount: number,
    at: Date,
  ): Promise<boolean>;
  hasGoodwillGrant(userId: string, period: string): Promise<boolean>;
  grantGoodwill(userId: string, period: string, amount: number): Promise<void>;
  recordLedger(entry: {
    subjectId: string;
    delta: number;
    reason: string;
    via: string;
  }): Promise<void>;
  /** test helpers — optional on production adapters */
  setActiveSubscription?(userId: string, sub: ActiveSubscription): void;
  addPurchased?(subjectId: string, amount: number): void;
  setUsage?(userId: string, period: string, count: number): void;
  markGoodwillGranted?(userId: string, period: string): void;
};

export function shanghaiDate(at: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
}

export function shanghaiPeriod(at: Date): string {
  return shanghaiDate(at).slice(0, 7);
}

/** End of Shanghai calendar day as ISO string (exclusive next midnight - 1s). */
export function shanghaiDayEndIso(at: Date): string {
  const date = shanghaiDate(at);
  // 23:59:59.999 in Asia/Shanghai
  return new Date(`${date}T23:59:59.999+08:00`).toISOString();
}

export async function ensureDailyGrant(
  store: BillingStore,
  subjectId: string,
  at: Date = new Date(),
): Promise<void> {
  const grantDate = shanghaiDate(at);
  const expiresAt = shanghaiDayEndIso(at);
  await store.ensureDailyGrant(subjectId, grantDate, expiresAt);
}

export async function getBalance(
  store: BillingStore,
  subjectId: string,
  at: Date = new Date(),
): Promise<BalanceSnapshot> {
  const period = shanghaiPeriod(at);
  const sub = await store.getActiveSubscription(subjectId, at);
  return {
    purchased: await store.sumRemaining(subjectId, "purchased", at),
    daily: await store.sumRemaining(subjectId, "daily_grant", at),
    goodwill: await store.sumRemaining(subjectId, "goodwill", at),
    usage: sub ? await store.getUsage(subjectId, period) : 0,
    period,
    hasActiveSubscription: Boolean(sub),
    goodwillGrantedThisPeriod: sub
      ? await store.hasGoodwillGrant(subjectId, period)
      : false,
  };
}

export async function consumeOne(
  store: BillingStore,
  subjectId: string,
  at: Date = new Date(),
): Promise<ConsumeResult> {
  await ensureDailyGrant(store, subjectId, at);
  const period = shanghaiPeriod(at);
  const sub = await store.getActiveSubscription(subjectId, at);

  if (sub) {
    const usage = await store.getUsage(subjectId, period);
    if (usage < SUBSCRIPTION_SOFT_CAP) {
      await store.incrementUsage(subjectId, period);
      await store.recordLedger({
        subjectId,
        delta: -1,
        reason: "consume",
        via: "subscription",
      });
      return { ok: true, via: "subscription" };
    }

    if (await store.debitFifo(subjectId, "purchased", 1, at)) {
      await store.recordLedger({
        subjectId,
        delta: -1,
        reason: "consume",
        via: "purchased",
      });
      return { ok: true, via: "purchased" };
    }

    if (!(await store.hasGoodwillGrant(subjectId, period))) {
      await store.grantGoodwill(subjectId, period, GOODWILL_AMOUNT);
      const ok = await store.debitFifo(subjectId, "goodwill", 1, at);
      if (!ok) return { ok: false, code: "quota_exhausted" };
      await store.recordLedger({
        subjectId,
        delta: -1,
        reason: "consume",
        via: "goodwill",
      });
      return { ok: true, via: "goodwill" };
    }

    return { ok: false, code: "quota_exhausted" };
  }

  if (await store.debitFifo(subjectId, "purchased", 1, at)) {
    await store.recordLedger({
      subjectId,
      delta: -1,
      reason: "consume",
      via: "purchased",
    });
    return { ok: true, via: "purchased" };
  }

  if (await store.debitFifo(subjectId, "daily_grant", 1, at)) {
    await store.recordLedger({
      subjectId,
      delta: -1,
      reason: "consume",
      via: "daily_grant",
    });
    return { ok: true, via: "daily_grant" };
  }

  return { ok: false, code: "quota_exhausted" };
}
