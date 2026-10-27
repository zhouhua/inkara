import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";

export async function GET(req: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }
  const { db } = gate.ctx;
  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 50), 100);
  const offset = Math.max(Number(url.searchParams.get("offset") ?? 0), 0);

  if (status && ["pending", "paid", "failed", "refunded"].includes(status)) {
    const rows = await db
      .prepare(
        `SELECT id, user_id, sku, amount_fen, status, channel, provider_trade_no, created_at, raw
         FROM orders WHERE status = ?
         ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      )
      .bind(status, limit, offset)
      .all();
    return NextResponse.json({ orders: rows.results ?? [] });
  }

  const rows = await db
    .prepare(
      `SELECT id, user_id, sku, amount_fen, status, channel, provider_trade_no, created_at, raw
       FROM orders
       ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    )
    .bind(limit, offset)
    .all();
  return NextResponse.json({ orders: rows.results ?? [] });
}
