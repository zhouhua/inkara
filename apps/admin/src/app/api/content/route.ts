import { NextResponse } from "next/server";
import { writeAdminAudit } from "@/lib/admin-audit";
import { requireAdmin } from "@/lib/admin-auth";

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
  const settings = await db
    .prepare(`SELECT * FROM user_settings WHERE subject_id = ?`)
    .bind(subjectId)
    .first();
  const pages = await db
    .prepare(
      `SELECT id, created_at, transcription, reply
       FROM pages WHERE subject_id = ?
       ORDER BY created_at DESC LIMIT 50`,
    )
    .bind(subjectId)
    .all();
  return NextResponse.json({
    settings: settings ?? null,
    pages: pages.results ?? [],
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
    note?: string;
  } | null;
  if (!body?.subjectId?.trim() || !body.note?.trim()) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  await writeAdminAudit(db, {
    actorId,
    action: "content.note",
    targetType: "subject",
    targetId: body.subjectId.trim(),
    payload: { note: body.note.trim() },
  });
  return NextResponse.json({ ok: true });
}
