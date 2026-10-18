import { describe, expect, it } from "vitest";
import { translateSqliteToMysql } from "@/lib/sqlite-to-mysql";

describe("translateSqliteToMysql", () => {
  const now = "2026-10-18T00:00:00.000Z";

  it("rewrites datetime and INSERT OR IGNORE", () => {
    const sql = translateSqliteToMysql(
      `INSERT OR IGNORE INTO credit_lots (created_at) VALUES (datetime('now'))`,
      now,
    );
    expect(sql).toBe(
      `INSERT IGNORE INTO credit_lots (created_at) VALUES ('${now}')`,
    );
  });

  it("rewrites excluded upserts", () => {
    const sql = translateSqliteToMysql(
      `INSERT INTO users (email, name) VALUES (?, ?)
       ON CONFLICT(email) DO UPDATE SET
         name = excluded.name,
         email_verified = COALESCE(excluded.email_verified, users.email_verified)`,
      now,
    );
    expect(sql).toContain("ON DUPLICATE KEY UPDATE");
    expect(sql).toContain("name = VALUES(name)");
    expect(sql).toContain(
      "COALESCE(VALUES(email_verified), users.email_verified)",
    );
    expect(sql).not.toContain("ON CONFLICT");
  });

  it("rewrites capped usage increment", () => {
    const sql = translateSqliteToMysql(
      `INSERT INTO subscription_usage (user_id, period_yyyy_mm, count)
       VALUES (?, ?, 1)
       ON CONFLICT(user_id, period_yyyy_mm)
       DO UPDATE SET count = count + 1
       WHERE subscription_usage.count < ?`,
      now,
    );
    expect(sql).toContain(
      "ON DUPLICATE KEY UPDATE count = IF(count < ?, count + 1, count)",
    );
  });

  it("wraps same-table page deletes", () => {
    const sql = translateSqliteToMysql(
      `DELETE FROM pages WHERE id IN (
         SELECT id FROM pages WHERE subject_id = ?
         ORDER BY created_at ASC LIMIT ?
       )`,
      now,
    );
    expect(sql).toContain("AS inkara_page_drop");
  });
});
