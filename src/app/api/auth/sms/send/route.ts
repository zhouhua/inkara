import { NextResponse } from "next/server";
import { resolveServerDb } from "@/lib/db-server";
import { issueSmsOtp, normalizePhone } from "@/lib/sms-otp";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as {
    phone?: string;
  } | null;
  const phone = normalizePhone(String(body?.phone ?? ""));
  if (!phone) {
    return NextResponse.json(
      { error: "invalid_phone", message: "手机号格式不正确" },
      { status: 400 },
    );
  }
  const db = await resolveServerDb();
  if (!db) {
    return NextResponse.json(
      { error: "db_unavailable", message: "Database unavailable" },
      { status: 503 },
    );
  }
  const result = await issueSmsOtp(db, phone);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, message: result.message },
      { status: 502 },
    );
  }
  return NextResponse.json({ ok: true, loggedOnly: result.loggedOnly });
}
