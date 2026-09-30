import {
  DAILY_GRANT_AMOUNT,
  type ActiveSubscription,
  type CreditKind,
} from "./schema";
import type { BillingStore } from "./ledger";
import type { D1Database } from "@/lib/db-server";

function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

type LotRow = {
  id: string;
  remaining: number;
  expires_at: string | null;
  created_at: string;
};

export function createD1BillingStore(db: D1Database): BillingStore {
  return {
    async ensureDailyGrant(subjectId, grantDate, expiresAt) {
      await db
        .prepare(
          `INSERT OR IGNORE INTO credit_lots
             (id, subject_id, kind, amount, remaining, grant_date, expires_at, created_at)
           VALUES (?, ?, 'daily_grant', ?, ?, ?, ?, datetime('now'))`,
        )
        .bind(
          newId("lot"),
          subjectId,
          DAILY_GRANT_AMOUNT,
          DAILY_GRANT_AMOUNT,
          grantDate,
          expiresAt,
        )
        .run();
    },

    async getActiveSubscription(userId, at) {
      const row = await db
        .prepare(
          `SELECT sku, current_period_start, current_period_end
           FROM subscriptions
           WHERE user_id = ? AND status = 'active'
             AND current_period_start <= ?
             AND current_period_end > ?
           ORDER BY current_period_end DESC
           LIMIT 1`,
        )
        .bind(userId, at.toISOString(), at.toISOString())
        .first<{
          sku: string;
          current_period_start: string;
          current_period_end: string;
        }>();
      if (!row) return null;
      return {
        sku: row.sku,
        periodStart: row.current_period_start,
        periodEnd: row.current_period_end,
      } satisfies ActiveSubscription;
    },

    async getUsage(userId, period) {
      const row = await db
        .prepare(
          `SELECT count FROM subscription_usage
           WHERE user_id = ? AND period_yyyy_mm = ?`,
        )
        .bind(userId, period)
        .first<{ count: number }>();
      return row?.count ?? 0;
    },

    async incrementUsage(userId, period) {
      await db
        .prepare(
          `INSERT INTO subscription_usage (user_id, period_yyyy_mm, count)
           VALUES (?, ?, 1)
           ON CONFLICT(user_id, period_yyyy_mm)
           DO UPDATE SET count = count + 1`,
        )
        .bind(userId, period)
        .run();
    },

    async sumRemaining(subjectId, kind, at) {
      const rows = await db
        .prepare(
          `SELECT remaining, expires_at FROM credit_lots
           WHERE subject_id = ? AND kind = ? AND remaining > 0`,
        )
        .bind(subjectId, kind)
        .all<{ remaining: number; expires_at: string | null }>();
      const t = at.getTime();
      return (rows.results ?? [])
        .filter((r) => !r.expires_at || new Date(r.expires_at).getTime() >= t)
        .reduce((s, r) => s + r.remaining, 0);
    },

    async debitFifo(subjectId, kind, amount, at) {
      const rows = await db
        .prepare(
          `SELECT id, remaining, expires_at, created_at FROM credit_lots
           WHERE subject_id = ? AND kind = ? AND remaining > 0
           ORDER BY
             CASE WHEN expires_at IS NULL THEN 1 ELSE 0 END,
             expires_at ASC,
             created_at ASC`,
        )
        .bind(subjectId, kind)
        .all<LotRow>();

      const t = at.getTime();
      const usable = (rows.results ?? []).filter(
        (r) => !r.expires_at || new Date(r.expires_at).getTime() >= t,
      );

      let need = amount;
      for (const lot of usable) {
        if (need <= 0) break;
        const take = Math.min(lot.remaining, need);
        await db
          .prepare(
            `UPDATE credit_lots SET remaining = remaining - ? WHERE id = ? AND remaining >= ?`,
          )
          .bind(take, lot.id, take)
          .run();
        need -= take;
      }
      return need === 0;
    },

    async hasGoodwillGrant(userId, period) {
      const row = await db
        .prepare(
          `SELECT 1 AS ok FROM goodwill_grants
           WHERE user_id = ? AND period_yyyy_mm = ?`,
        )
        .bind(userId, period)
        .first();
      return Boolean(row);
    },

    async grantGoodwill(userId, period, amount) {
      await db
        .prepare(
          `INSERT OR IGNORE INTO goodwill_grants (user_id, period_yyyy_mm, granted_at)
           VALUES (?, ?, datetime('now'))`,
        )
        .bind(userId, period)
        .run();
      await db
        .prepare(
          `INSERT INTO credit_lots
             (id, subject_id, kind, amount, remaining, grant_date, expires_at, created_at)
           VALUES (?, ?, 'goodwill', ?, ?, NULL, NULL, datetime('now'))`,
        )
        .bind(newId("lot"), userId, amount, amount)
        .run();
    },

    async recordLedger(entry) {
      await db
        .prepare(
          `INSERT INTO ledger_entries
             (id, subject_id, delta, reason, ref_order, ref_ask, lot_id, created_at)
           VALUES (?, ?, ?, ?, NULL, NULL, NULL, datetime('now'))`,
        )
        .bind(
          newId("led"),
          entry.subjectId,
          entry.delta,
          `${entry.reason}:${entry.via}`,
        )
        .run();
    },

    async transferDailyGrantRemaining(
      fromSubjectId,
      toSubjectId,
      grantDate,
      expiresAt,
    ) {
      const row = await db
        .prepare(
          `SELECT COALESCE(SUM(remaining), 0) AS remaining FROM credit_lots
           WHERE subject_id = ? AND kind = 'daily_grant' AND remaining > 0
             AND (expires_at IS NULL OR expires_at >= datetime('now'))`,
        )
        .bind(fromSubjectId)
        .first<{ remaining: number }>();
      const remaining = Number(row?.remaining ?? 0);
      if (remaining <= 0) return 0;

      await db
        .prepare(
          `UPDATE credit_lots SET remaining = 0
           WHERE subject_id = ? AND kind = 'daily_grant' AND remaining > 0`,
        )
        .bind(fromSubjectId)
        .run();

      const existing = await db
        .prepare(
          `SELECT id, remaining, amount FROM credit_lots
           WHERE subject_id = ? AND kind = 'daily_grant' AND grant_date = ?`,
        )
        .bind(toSubjectId, grantDate)
        .first<{ id: string; remaining: number; amount: number }>();

      if (existing) {
        await db
          .prepare(
            `UPDATE credit_lots
             SET remaining = remaining + ?, amount = amount + ?
             WHERE id = ?`,
          )
          .bind(remaining, remaining, existing.id)
          .run();
      } else {
        await db
          .prepare(
            `INSERT INTO credit_lots
               (id, subject_id, kind, amount, remaining, grant_date, expires_at, created_at)
             VALUES (?, ?, 'daily_grant', ?, ?, ?, ?, datetime('now'))`,
          )
          .bind(
            newId("lot"),
            toSubjectId,
            remaining,
            remaining,
            grantDate,
            expiresAt,
          )
          .run();
      }

      return remaining;
    },
  };
}
