import {
  GOODWILL_AMOUNT,
  SUBSCRIPTION_SOFT_CAP,
  type ActiveSubscription,
  type BalanceSnapshot,
  type ConsumeResult,
  type ConsumeVia,
  type CreditKind,
} from "./schema";

export type BillingStore = {
  ensureDailyGrant(
    subjectId: string,
    grantDate: string,
    expiresAt: string,
  ): Promise<void>;
  getActiveSubscription(
    userId: string,
    at: Date,
  ): Promise<ActiveSubscription | null>;
  getUsage(userId: string, period: string): Promise<number>;
  /** Atomically increment usage only when count < softCap. Returns false if at/over cap. */
  tryIncrementUsageUnderCap(
    userId: string,
    period: string,
    softCap: number,
  ): Promise<boolean>;
  decrementUsage(userId: string, period: string): Promise<void>;
  sumRemaining(subjectId: string, kind: CreditKind, at: Date): Promise<number>;
  debitFifo(
    subjectId: string,
    kind: CreditKind,
    amount: number,
    at: Date,
  ): Promise<boolean>;
  /** Credit back one unit (refund after failed ask). */
  creditOne(subjectId: string, kind: CreditKind, at: Date): Promise<void>;
  hasGoodwillGrant(userId: string, period: string): Promise<boolean>;
  /** Returns true only when this call newly granted the period lot. */
  grantGoodwill(
    userId: string,
    period: string,
    amount: number,
  ): Promise<boolean>;
  recordLedger(entry: {
    subjectId: string;
    delta: number;
    reason: string;
    via: string;
  }): Promise<void>;
  transferDailyGrantRemaining(
    fromSubjectId: string,
    toSubjectId: string,
    grantDate: string,
    expiresAt: string,
  ): Promise<number>;
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
    if (
      await store.tryIncrementUsageUnderCap(
        subjectId,
        period,
        SUBSCRIPTION_SOFT_CAP,
      )
    ) {
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
      const granted = await store.grantGoodwill(
        subjectId,
        period,
        GOODWILL_AMOUNT,
      );
      if (!granted && !(await store.hasGoodwillGrant(subjectId, period))) {
        return { ok: false, code: "quota_exhausted" };
      }
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

    // Already granted this period — try remaining goodwill lots
    if (await store.debitFifo(subjectId, "goodwill", 1, at)) {
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

/** Reverse a successful consumeOne after ask/stream failure. */
export async function refundOne(
  store: BillingStore,
  subjectId: string,
  via: ConsumeVia,
  at: Date = new Date(),
): Promise<void> {
  if (via === "subscription") {
    await store.decrementUsage(subjectId, shanghaiPeriod(at));
    await store.recordLedger({
      subjectId,
      delta: 1,
      reason: "refund",
      via,
    });
    return;
  }
  const kind =
    via === "purchased"
      ? "purchased"
      : via === "goodwill"
        ? "goodwill"
        : "daily_grant";
  await store.creditOne(subjectId, kind, at);
  await store.recordLedger({
    subjectId,
    delta: 1,
    reason: "refund",
    via,
  });
}
