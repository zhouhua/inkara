import { describe, expect, it } from "vitest";
import { ensureDailyGrant, getBalance, shanghaiDate, shanghaiDayEndIso } from "./ledger";
import { createMemoryBillingStore } from "./memory-db";
import { mergeAnonDailyGrants } from "./merge-anon";

describe("mergeAnonDailyGrants", () => {
  const now = new Date("2026-09-30T12:00:00+08:00");

  it("merges remaining daily grant once without doubling", async () => {
    const store = createMemoryBillingStore({ now });
    const anon = "anon_1";
    const user = "user_1";
    await ensureDailyGrant(store, anon, now);
    await store.debitFifo(anon, "daily_grant", 1, now);

    const grantDate = shanghaiDate(now);
    const expiresAt = shanghaiDayEndIso(now);
    const first = await mergeAnonDailyGrants(
      store,
      anon,
      user,
      grantDate,
      expiresAt,
    );
    expect(first.merged).toBe(1);
    expect((await getBalance(store, user, now)).daily).toBe(1);
    expect((await getBalance(store, anon, now)).daily).toBe(0);

    const second = await mergeAnonDailyGrants(
      store,
      anon,
      user,
      grantDate,
      expiresAt,
    );
    expect(second.merged).toBe(0);
    expect((await getBalance(store, user, now)).daily).toBe(1);
  });
});
