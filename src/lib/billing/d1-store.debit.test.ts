import { describe, expect, it } from "vitest";
import { createD1BillingStore } from "./d1-store";
import type { D1Database, D1PreparedStatement } from "@/lib/db-server";

function createDebitRaceDb(remaining: number) {
  const lot = {
    id: "lot_1",
    remaining,
    expires_at: null as string | null,
    created_at: "2026-01-01T00:00:00.000Z",
  };

  const db: D1Database = {
    prepare(sql: string): D1PreparedStatement {
      let binds: unknown[] = [];
      const stmt: D1PreparedStatement = {
        bind(...values: unknown[]) {
          binds = values;
          return stmt;
        },
        async first() {
          return null;
        },
        async all() {
          if (sql.includes("SELECT id, remaining")) {
            return { results: [{ ...lot }] };
          }
          return { results: [] };
        },
        async run() {
          if (sql.includes("UPDATE credit_lots SET remaining")) {
            const take = Number(binds[0]);
            if (lot.remaining >= take) {
              lot.remaining -= take;
              return { success: true, meta: { changes: 1 } };
            }
            return { success: true, meta: { changes: 0 } };
          }
          return { success: true, meta: { changes: 0 } };
        },
      };
      return stmt;
    },
    async batch() {
      return [];
    },
  };
  return { db, lot };
}

describe("d1 debitFifo concurrency", () => {
  it("only one of two concurrent debits succeeds when remaining is 1", async () => {
    const { db, lot } = createDebitRaceDb(1);
    const store = createD1BillingStore(db);
    const at = new Date("2026-09-30T12:00:00+08:00");

    const [a, b] = await Promise.all([
      store.debitFifo("u1", "purchased", 1, at),
      store.debitFifo("u1", "purchased", 1, at),
    ]);

    expect([a, b].filter(Boolean)).toHaveLength(1);
    expect(lot.remaining).toBe(0);
  });
});
