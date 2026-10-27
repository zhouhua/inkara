import { NextResponse } from "next/server";
import { writeAdminAudit } from "@/lib/admin-audit";
import { requireAdmin } from "@/lib/admin-auth";
import { getUserRow } from "@/lib/auth-adapter";
import { createD1BillingStore } from "@/lib/billing/d1-store";
import { getBalance } from "@/lib/billing/ledger";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const gate = await requireAdmin();
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }
  const { id } = await ctx.params;
  const { db } = gate.ctx;
  const user = await getUserRow(db, id);
  if (!user) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const accounts = await db
    .prepare(
      `SELECT provider, provider_account_id, type FROM accounts WHERE user_id = ?`,
    )
    .bind(id)
    .all();
  const orders = await db
    .prepare(
      `SELECT id, sku, amount_fen, status, channel, created_at
       FROM orders WHERE user_id = ? ORDER BY created_at DESC LIMIT 20`,
    )
    .bind(id)
    .all();
  const store = createD1BillingStore(db);
  const credits = await getBalance(store, id, new Date());
  return NextResponse.json({
    user,
    accounts: accounts.results ?? [],
    orders: orders.results ?? [],
    credits,
  });
}

export async function PATCH(req: Request, ctx: Ctx) {
  const gate = await requireAdmin();
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }
  const { id } = await ctx.params;
  const { db, actorId } = gate.ctx;
  const body = (await req.json().catch(() => null)) as {
    status?: "active" | "banned";
    role?: "user" | "admin";
    banReason?: string;
  } | null;
  if (!body) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const user = await getUserRow(db, id);
  if (!user) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  if (body.status === "banned") {
    await db
      .prepare(
        `UPDATE users SET status = 'banned', banned_at = datetime('now'), ban_reason = ?
         WHERE id = ?`,
      )
      .bind(body.banReason ?? null, id)
      .run();
    await writeAdminAudit(db, {
      actorId,
      action: "user.ban",
      targetType: "user",
      targetId: id,
      payload: { reason: body.banReason ?? null },
    });
  } else if (body.status === "active") {
    await db
      .prepare(
        `UPDATE users SET status = 'active', banned_at = NULL, ban_reason = NULL
         WHERE id = ?`,
      )
      .bind(id)
      .run();
    await writeAdminAudit(db, {
      actorId,
      action: "user.unban",
      targetType: "user",
      targetId: id,
    });
  }

  if (body.role === "admin" || body.role === "user") {
    if (id === actorId && body.role !== "admin") {
      return NextResponse.json(
        { error: "cannot_demote_self" },
        { status: 400 },
      );
    }
    await db
      .prepare(`UPDATE users SET role = ? WHERE id = ?`)
      .bind(body.role, id)
      .run();
    await writeAdminAudit(db, {
      actorId,
      action: "user.role",
      targetType: "user",
      targetId: id,
      payload: { role: body.role },
    });
  }

  const updated = await getUserRow(db, id);
  return NextResponse.json({ user: updated });
}
