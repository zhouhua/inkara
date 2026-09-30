import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  ensureDailyGrant,
  consumeOne,
  getBalance,
  type BillingStore,
} from "./ledger";
import { createMemoryBillingStore } from "./memory-db";

const SUBJECT = "user_test_1";
const PERIOD = "2026-09";

describe("billing ledger", () => {
  let store: BillingStore;
  const now = new Date("2026-09-30T12:00:00+08:00");

  beforeEach(() => {
    store = createMemoryBillingStore({ now });
  });

  afterEach(() => {
    store = createMemoryBillingStore({ now });
  });

  it("allows two daily grants then fails the third without subscription", async () => {
    await ensureDailyGrant(store, SUBJECT, now);
    expect((await consumeOne(store, SUBJECT, now)).ok).toBe(true);
    expect((await consumeOne(store, SUBJECT, now)).ok).toBe(true);
    const third = await consumeOne(store, SUBJECT, now);
    expect(third).toEqual({ ok: false, code: "quota_exhausted" });
  });

  it("subscription under soft cap does not debit purchased", async () => {
    store.setActiveSubscription(SUBJECT, {
      sku: "sub_month",
      periodStart: "2026-09-01T00:00:00+08:00",
      periodEnd: "2026-10-01T00:00:00+08:00",
    });
    store.addPurchased(SUBJECT, 10);
    const r = await consumeOne(store, SUBJECT, now);
    expect(r).toMatchObject({ ok: true, via: "subscription" });
    const bal = await getBalance(store, SUBJECT, now);
    expect(bal.purchased).toBe(10);
    expect(bal.usage).toBe(1);
  });

  it("after soft cap debits purchased", async () => {
    store.setActiveSubscription(SUBJECT, {
      sku: "sub_month",
      periodStart: "2026-09-01T00:00:00+08:00",
      periodEnd: "2026-10-01T00:00:00+08:00",
    });
    store.setUsage(SUBJECT, PERIOD, 500);
    store.addPurchased(SUBJECT, 10);
    const r = await consumeOne(store, SUBJECT, now);
    expect(r).toMatchObject({ ok: true, via: "purchased" });
    expect((await getBalance(store, SUBJECT, now)).purchased).toBe(9);
  });

  it("after soft cap with no purchased grants goodwill and debits it", async () => {
    store.setActiveSubscription(SUBJECT, {
      sku: "sub_month",
      periodStart: "2026-09-01T00:00:00+08:00",
      periodEnd: "2026-10-01T00:00:00+08:00",
    });
    store.setUsage(SUBJECT, PERIOD, 500);
    const r = await consumeOne(store, SUBJECT, now);
    expect(r).toMatchObject({ ok: true, via: "goodwill" });
    const bal = await getBalance(store, SUBJECT, now);
    expect(bal.goodwill).toBe(4);
    expect(bal.goodwillGrantedThisPeriod).toBe(true);
  });

  it("fails when goodwill already granted and exhausted", async () => {
    store.setActiveSubscription(SUBJECT, {
      sku: "sub_month",
      periodStart: "2026-09-01T00:00:00+08:00",
      periodEnd: "2026-10-01T00:00:00+08:00",
    });
    store.setUsage(SUBJECT, PERIOD, 500);
    store.markGoodwillGranted(SUBJECT, PERIOD);
    const r = await consumeOne(store, SUBJECT, now);
    expect(r).toEqual({ ok: false, code: "quota_exhausted" });
  });

  it("ensureDailyGrant is idempotent same day", async () => {
    await ensureDailyGrant(store, SUBJECT, now);
    await ensureDailyGrant(store, SUBJECT, now);
    const bal = await getBalance(store, SUBJECT, now);
    expect(bal.daily).toBe(2);
  });
});
