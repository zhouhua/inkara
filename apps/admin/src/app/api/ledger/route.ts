import { NextResponse } from "next/server";
import { writeAdminAudit } from "@/lib/admin-audit";
import { requireAdmin } from "@/lib/admin-auth";
import { createD1BillingStore } from "@/lib/billing/d1-store";
import { getBalance } from "@/lib/billing/ledger";

export async function GET(req: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }
  const { db } = gate.ctx;
  const subjectId = new URL(req.url).searchParams.get("subjectId");
  if (!subjectId) {
    return NextResponse.json({ error: "subjectId_required" }, { status: 400 });
  }
  const lots = await db
    .prepare(
      `SELECT id, kind, amount, remaining, grant_date, expires_at, created_at
       FROM credit_lots WHERE subject_id = ?
       ORDER BY created_at DESC LIMIT 100`,
    )
    .bind(subjectId)
    .all();
  const entries = await db
    .prepare(
      `SELECT id, delta, reason, ref_order, ref_ask, created_at
       FROM ledger_entries WHERE subject_id = ?
       ORDER BY created_at DESC LIMIT 100`,
    )
    .bind(subjectId)
    .all();
  const store = createD1BillingStore(db);
  const credits = await getBalance(store, subjectId, new Date());
  return NextResponse.json({
    credits,
    lots: lots.results ?? [],
    entries: entries.results ?? [],
  });
}

export async function POST(req: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }
  const { db, actorId } = gate.ctx;
  const body = (await req.json().catch(() => null)) as {
    subjectId?: string;
    amount?: number;
    note?: string;
  } | null;
  const subjectId = body?.subjectId?.trim();
  const amount = Number(body?.amount);
  if (
    !subjectId ||
    !Number.isInteger(amount) ||
    amount < 1 ||
    amount > 10_000
  ) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const lotId = crypto.randomUUID();
  await db
    .prepare(
      `INSERT INTO credit_lots
         (id, subject_id, kind, amount, remaining, grant_date, expires_at, created_at)
       VALUES (?, ?, 'goodwill', ?, ?, NULL, NULL, datetime('now'))`,
    )
    .bind(lotId, subjectId, amount, amount)
    .run();
  await db
    .prepare(
      `INSERT INTO ledger_entries
         (id, subject_id, delta, reason, ref_order, ref_ask, lot_id, created_at)
       VALUES (?, ?, ?, ?, NULL, NULL, ?, datetime('now'))`,
    )
    .bind(
      crypto.randomUUID(),
      subjectId,
      amount,
      `admin_grant:${body?.note ?? "manual"}`,
      lotId,
    )
    .run();
  await writeAdminAudit(db, {
    actorId,
    action: "ledger.goodwill",
    targetType: "subject",
    targetId: subjectId,
    payload: { amount, note: body?.note ?? null, lotId },
  });

  const store = createD1BillingStore(db);
  const credits = await getBalance(store, subjectId, new Date());
  return NextResponse.json({ ok: true, lotId, credits });
}
