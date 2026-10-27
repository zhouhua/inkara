import { describe, expect, it } from "vitest";
import {
  generateOtpCode,
  hashOtp,
  normalizePhone,
  verifySmsOtp,
} from "./sms-otp";
import type { D1Database, D1PreparedStatement } from "./db-server";

describe("normalizePhone", () => {
  it("normalizes CN mobile", () => {
    expect(normalizePhone("13800138000")).toBe("+8613800138000");
    expect(normalizePhone("+8613800138000")).toBe("+8613800138000");
    expect(normalizePhone("bad")).toBeNull();
  });
});

describe("otp hash + verify", () => {
  it("accepts valid code and rejects wrong", async () => {
    process.env.AUTH_SECRET = "test-secret";
    const phone = "+8613800138000";
    const code = "123456";
    let row: {
      code_hash: string;
      expires_at: string;
      attempts: number;
    } | null = {
      code_hash: hashOtp(phone, code),
      expires_at: new Date(Date.now() + 60_000).toISOString(),
      attempts: 0,
    };

    function prepare(sql: string): D1PreparedStatement {
      const binds: unknown[] = [];
      const stmt: D1PreparedStatement = {
        bind(...v) {
          binds.push(...v);
          return stmt;
        },
        async first<T>() {
          if (sql.includes("FROM sms_otp_challenges")) return row as T;
          return null;
        },
        async run() {
          if (sql.startsWith("UPDATE")) {
            if (row) row.attempts += 1;
          }
          if (sql.startsWith("DELETE")) row = null;
          return { success: true };
        },
        async all() {
          return { results: [] };
        },
      };
      return stmt;
    }
    const db: D1Database = { prepare, batch: async () => [] };

    expect(await verifySmsOtp(db, phone, code)).toEqual({ ok: true });
    expect(row).toBeNull();

    row = {
      code_hash: hashOtp(phone, code),
      expires_at: new Date(Date.now() + 60_000).toISOString(),
      attempts: 0,
    };
    expect(await verifySmsOtp(db, phone, "000000")).toEqual({
      ok: false,
      error: "otp_invalid",
    });
  });

  it("generates 6-digit codes", () => {
    expect(generateOtpCode()).toMatch(/^\d{6}$/);
  });
});
