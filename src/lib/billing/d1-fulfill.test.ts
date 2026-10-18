import { describe, expect, it } from "vitest";
import { createD1FulfillStore } from "./d1-fulfill";
import { fulfillOrder } from "./fulfill";
import type { D1Database, D1PreparedStatement } from "@/lib/db-server";

/**
 * Minimal D1 stand-in: tracks order status and UPDATE changes so concurrent
 * markOrderPaid only one winner returns "updated".
 */
function createRaceDb(order: {
  id: string;
  userId: string;
  sku: string;
  amountFen: number;
  status: "pending" | "paid";
}) {
  const state = { ...order, credits: 0 };
  const db: D1Database = {
    prepare(sql: string): D1PreparedStatement {
      let binds: unknown[] = [];
      const stmt: D1PreparedStatement = {
        bind(...values: unknown[]) {
          binds = values;
          return stmt;
        },
        async first() {
          if (sql.includes("SELECT id, user_id")) {
            return {
              id: state.id,
              user_id: state.userId,
              sku: state.sku,
              amount_fen: state.amountFen,
              status: state.status,
              provider_trade_no: null,
            };
          }
          if (sql.includes("SELECT status")) {
            return { status: state.status };
          }
          return null;
        },
        async run() {
          if (
            sql.includes("UPDATE orders") &&
            sql.includes("status = 'pending'")
          ) {
            if (state.status === "pending") {
              state.status = "paid";
              return { success: true, meta: { changes: 1 } };
            }
            return { success: true, meta: { changes: 0 } };
          }
          if (sql.includes("INSERT INTO credit_lots")) {
            state.credits += Number(binds[2] ?? 0);
            return { success: true, meta: { changes: 1 } };
          }
          if (sql.includes("INSERT INTO ledger_entries")) {
            return { success: true, meta: { changes: 1 } };
          }
          return { success: true, meta: { changes: 0 } };
        },
        async all() {
          return { results: [] };
        },
      };
      return stmt;
    },
    async batch() {
      return [];
    },
  };
  return { db, state };
}

describe("d1 fulfill concurrency", () => {
  it("credits pack only once when two webhooks race", async () => {
    const { db, state } = createRaceDb({
      id: "o1",
      userId: "u1",
      sku: "pack_50",
      amountFen: 990,
      status: "pending",
    });
    const store = createD1FulfillStore(db);

    const [a, b] = await Promise.all([
      fulfillOrder(store, "o1"),
      fulfillOrder(store, "o1"),
    ]);

    const updated = [a, b].filter((r) => r.ok && !r.alreadyPaid);
    const already = [a, b].filter((r) => r.ok && r.alreadyPaid);
    expect(updated).toHaveLength(1);
    expect(already).toHaveLength(1);
    expect(state.credits).toBe(50);
  });
});
