import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";

export async function GET() {
  const gate = await requireAdmin();
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }
  const { db } = gate.ctx;

  const users = await db
    .prepare(`SELECT COUNT(*) AS c FROM users`)
    .first<{ c: number }>();
  const paid = await db
    .prepare(
      `SELECT COUNT(*) AS c, COALESCE(SUM(amount_fen), 0) AS fen
       FROM orders WHERE status = 'paid'`,
    )
    .first<{ c: number; fen: number }>();
  const pending = await db
    .prepare(`SELECT COUNT(*) AS c FROM orders WHERE status = 'pending'`)
    .first<{ c: number }>();
  const banned = await db
    .prepare(`SELECT COUNT(*) AS c FROM users WHERE status = 'banned'`)
    .first<{ c: number }>();

  const trend = await db
    .prepare(
      `SELECT substr(created_at, 1, 10) AS day, COUNT(*) AS c
       FROM users
       WHERE created_at >= datetime('now', '-7 days')
       GROUP BY substr(created_at, 1, 10)
       ORDER BY day`,
    )
    .all<{ day: string; c: number }>();

  const paidTrend = await db
    .prepare(
      `SELECT substr(created_at, 1, 10) AS day,
              COUNT(*) AS c,
              COALESCE(SUM(amount_fen), 0) AS fen
       FROM orders
       WHERE status = 'paid' AND created_at >= datetime('now', '-7 days')
       GROUP BY substr(created_at, 1, 10)
       ORDER BY day`,
    )
    .all<{ day: string; c: number; fen: number }>();

  return NextResponse.json({
    users: users?.c ?? 0,
    banned: banned?.c ?? 0,
    paidOrders: paid?.c ?? 0,
    revenueFen: paid?.fen ?? 0,
    pendingOrders: pending?.c ?? 0,
    registrations7d: trend.results ?? [],
    paid7d: paidTrend.results ?? [],
  });
}
