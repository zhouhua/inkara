import { describe, expect, it } from "vitest";
import {
  addMonthsIso,
  fulfillOrder,
  type FulfillStore,
  type OrderRow,
} from "./fulfill";
import type { SkuId } from "./catalog";

function createMemoryFulfillStore(): FulfillStore & {
  orders: Map<string, OrderRow>;
  purchased: Map<string, number>;
  subs: Map<string, { sku: SkuId; start: string; end: string }>;
  ledger: Array<{ reason: string; refOrder: string; delta: number }>;
} {
  const orders = new Map<string, OrderRow>();
  const purchased = new Map<string, number>();
  const subs = new Map<string, { sku: SkuId; start: string; end: string }>();
  const ledger: Array<{ reason: string; refOrder: string; delta: number }> = [];

  return {
    orders,
    purchased,
    subs,
    ledger,
    async getOrder(orderId) {
      return orders.get(orderId) ?? null;
    },
    async markOrderPaid(orderId, providerTradeNo) {
      const order = orders.get(orderId);
      if (!order) return "missing";
      if (order.status === "paid") return "already_paid";
      order.status = "paid";
      order.providerTradeNo = providerTradeNo;
      return "updated";
    },
    async addPurchasedCredits(userId, credits) {
      purchased.set(userId, (purchased.get(userId) ?? 0) + credits);
    },
    async extendSubscription(userId, sku, months, at) {
      const existing = subs.get(userId);
      const startBase =
        existing && new Date(existing.end).getTime() > at.getTime()
          ? new Date(existing.end)
          : at;
      const start = existing ? existing.start : at.toISOString();
      const end = addMonthsIso(startBase, months);
      subs.set(userId, { sku, start, end });
    },
    async recordLedger(entry) {
      ledger.push({
        reason: entry.reason,
        refOrder: entry.refOrder,
        delta: entry.delta,
      });
    },
  };
}

describe("fulfillOrder", () => {
  it("credits pack once even if fulfilled twice", async () => {
    const store = createMemoryFulfillStore();
    store.orders.set("o1", {
      id: "o1",
      userId: "u1",
      sku: "pack_50",
      amountFen: 990,
      status: "pending",
      providerTradeNo: null,
    });

    const first = await fulfillOrder(store, "o1");
    const second = await fulfillOrder(store, "o1");
    expect(first).toEqual({ ok: true, alreadyPaid: false, sku: "pack_50" });
    expect(second).toEqual({ ok: true, alreadyPaid: true, sku: "pack_50" });
    expect(store.purchased.get("u1")).toBe(50);
    expect(store.ledger.filter((e) => e.refOrder === "o1")).toHaveLength(1);
  });

  it("extends subscription from max(now, period_end)", async () => {
    const store = createMemoryFulfillStore();
    const at = new Date("2026-10-01T00:00:00.000Z");
    store.orders.set("o2", {
      id: "o2",
      userId: "u2",
      sku: "sub_month",
      amountFen: 1900,
      status: "pending",
      providerTradeNo: null,
    });

    await fulfillOrder(store, "o2", { at });
    const first = store.subs.get("u2");
    expect(first?.end).toBe(addMonthsIso(at, 1));

    store.orders.set("o3", {
      id: "o3",
      userId: "u2",
      sku: "sub_quarter",
      amountFen: 4900,
      status: "pending",
      providerTradeNo: null,
    });
    await fulfillOrder(store, "o3", { at });
    const second = store.subs.get("u2");
    expect(second?.sku).toBe("sub_quarter");
    expect(second?.end).toBe(addMonthsIso(new Date(first!.end), 3));
  });
});
