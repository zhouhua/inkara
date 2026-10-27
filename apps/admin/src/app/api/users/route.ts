import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";

export async function GET(req: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }
  const { db } = gate.ctx;
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 50), 100);
  const offset = Math.max(Number(url.searchParams.get("offset") ?? 0), 0);

  if (q) {
    const like = `%${q}%`;
    const rows = await db
      .prepare(
        `SELECT id, email, phone, name, status, role, created_at
         FROM users
         WHERE id = ? OR email LIKE ? OR phone LIKE ? OR name LIKE ?
         ORDER BY created_at DESC
         LIMIT ? OFFSET ?`,
      )
      .bind(q, like, like, like, limit, offset)
      .all();
    return NextResponse.json({ users: rows.results ?? [] });
  }

  const rows = await db
    .prepare(
      `SELECT id, email, phone, name, status, role, created_at
       FROM users
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
    )
    .bind(limit, offset)
    .all();
  return NextResponse.json({ users: rows.results ?? [] });
}
