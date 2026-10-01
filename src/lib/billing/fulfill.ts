import { CATALOG, isSkuId, type SkuId } from "./catalog";

export type OrderRow = {
  id: string;
  userId: string;
  sku: string;
  amountFen: number;
  status: "pending" | "paid" | "failed" | "refunded";
  providerTradeNo: string | null;
};

export type FulfillStore = {
  getOrder(orderId: string): Promise<OrderRow | null>;
  markOrderPaid(
    orderId: string,
    providerTradeNo: string | null,
    raw: string | null,
  ): Promise<"updated" | "already_paid" | "missing">;
  addPurchasedCredits(userId: string, credits: number, orderId: string): Promise<void>;
  extendSubscription(
    userId: string,
    sku: SkuId,
    months: number,
    at: Date,
  ): Promise<void>;
  recordLedger(entry: {
    subjectId: string;
    delta: number;
    reason: string;
    refOrder: string;
  }): Promise<void>;
};

export type FulfillResult =
  | { ok: true; alreadyPaid: boolean; sku: SkuId }
  | { ok: false; error: "missing_order" | "invalid_sku" | "bad_status" };

/**
 * Idempotent: paying the same order twice only credits once.
 */
export async function fulfillOrder(
  store: FulfillStore,
  orderId: string,
  opts?: {
    providerTradeNo?: string | null;
    raw?: string | null;
    at?: Date;
  },
): Promise<FulfillResult> {
  const order = await store.getOrder(orderId);
  if (!order) return { ok: false, error: "missing_order" };
  if (!isSkuId(order.sku)) return { ok: false, error: "invalid_sku" };
  if (order.status === "paid") {
    return { ok: true, alreadyPaid: true, sku: order.sku };
  }
  if (order.status !== "pending") {
    return { ok: false, error: "bad_status" };
  }

  const marked = await store.markOrderPaid(
    orderId,
    opts?.providerTradeNo ?? null,
    opts?.raw ?? null,
  );
  if (marked === "missing") return { ok: false, error: "missing_order" };
  if (marked === "already_paid") {
    return { ok: true, alreadyPaid: true, sku: order.sku };
  }

  const item = CATALOG[order.sku];
  const at = opts?.at ?? new Date();

  if (item.kind === "pack") {
    await store.addPurchasedCredits(order.userId, item.credits, orderId);
    await store.recordLedger({
      subjectId: order.userId,
      delta: item.credits,
      reason: "purchase_pack",
      refOrder: orderId,
    });
  } else {
    await store.extendSubscription(order.userId, order.sku, item.months, at);
    await store.recordLedger({
      subjectId: order.userId,
      delta: 0,
      reason: `purchase_sub:${item.months}m`,
      refOrder: orderId,
    });
  }

  return { ok: true, alreadyPaid: false, sku: order.sku };
}

export function addMonthsIso(from: Date, months: number): string {
  const d = new Date(from.getTime());
  const day = d.getUTCDate();
  d.setUTCMonth(d.getUTCMonth() + months);
  // Clamp overflow (e.g. Jan 31 + 1 month)
  if (d.getUTCDate() < day) {
    d.setUTCDate(0);
  }
  return d.toISOString();
}
