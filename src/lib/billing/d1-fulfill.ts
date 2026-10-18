import type { D1Database } from "@/lib/db-server";
import { addMonthsIso, type FulfillStore, type OrderRow } from "./fulfill";

function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

export function createD1FulfillStore(db: D1Database): FulfillStore {
  return {
    async getOrder(orderId) {
      const row = await db
        .prepare(
          `SELECT id, user_id, sku, amount_fen, status, provider_trade_no
           FROM orders WHERE id = ?`,
        )
        .bind(orderId)
        .first<{
          id: string;
          user_id: string;
          sku: string;
          amount_fen: number;
          status: OrderRow["status"];
          provider_trade_no: string | null;
        }>();
      if (!row) return null;
      return {
        id: row.id,
        userId: row.user_id,
        sku: row.sku,
        amountFen: row.amount_fen,
        status: row.status,
        providerTradeNo: row.provider_trade_no,
      };
    },

    async markOrderPaid(orderId, providerTradeNo, raw) {
      const existing = await db
        .prepare(`SELECT status FROM orders WHERE id = ?`)
        .bind(orderId)
        .first<{ status: string }>();
      if (!existing) return "missing";
      if (existing.status === "paid") return "already_paid";

      const result = await db
        .prepare(
          `UPDATE orders
           SET status = 'paid',
               provider_trade_no = COALESCE(?, provider_trade_no),
               raw = COALESCE(?, raw),
               updated_at = datetime('now')
           WHERE id = ? AND status = 'pending'`,
        )
        .bind(providerTradeNo, raw, orderId)
        .run();

      // Only the winner of concurrent webhooks may fulfill credits.
      if ((result.meta?.changes ?? 0) === 1) return "updated";
      return "already_paid";
    },

    async addPurchasedCredits(userId, credits) {
      await db
        .prepare(
          `INSERT INTO credit_lots
             (id, subject_id, kind, amount, remaining, grant_date, expires_at, created_at)
           VALUES (?, ?, 'purchased', ?, ?, NULL, NULL, datetime('now'))`,
        )
        .bind(newId("lot"), userId, credits, credits)
        .run();
    },

    async extendSubscription(userId, sku, months, at) {
      const active = await db
        .prepare(
          `SELECT id, current_period_start, current_period_end
           FROM subscriptions
           WHERE user_id = ? AND status = 'active'
           ORDER BY current_period_end DESC
           LIMIT 1`,
        )
        .bind(userId)
        .first<{
          id: string;
          current_period_start: string;
          current_period_end: string;
        }>();

      if (active) {
        const endMs = new Date(active.current_period_end).getTime();
        const base =
          endMs > at.getTime() ? new Date(active.current_period_end) : at;
        const nextEnd = addMonthsIso(base, months);
        await db
          .prepare(
            `UPDATE subscriptions
             SET sku = ?,
                 current_period_end = ?,
                 cancel_at_period_end = 0,
                 updated_at = datetime('now')
             WHERE id = ?`,
          )
          .bind(sku, nextEnd, active.id)
          .run();
        return;
      }

      await db
        .prepare(
          `INSERT INTO subscriptions
             (id, user_id, sku, status, current_period_start, current_period_end,
              cancel_at_period_end, created_at, updated_at)
           VALUES (?, ?, ?, 'active', ?, ?, 0, datetime('now'), datetime('now'))`,
        )
        .bind(
          newId("sub"),
          userId,
          sku,
          at.toISOString(),
          addMonthsIso(at, months),
        )
        .run();
    },

    async recordLedger(entry) {
      await db
        .prepare(
          `INSERT INTO ledger_entries
             (id, subject_id, delta, reason, ref_order, ref_ask, lot_id, created_at)
           VALUES (?, ?, ?, ?, ?, NULL, NULL, datetime('now'))`,
        )
        .bind(
          newId("led"),
          entry.subjectId,
          entry.delta,
          entry.reason,
          entry.refOrder,
        )
        .run();
    },
  };
}
