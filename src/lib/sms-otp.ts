import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import type { D1Database } from "@/lib/db-server";

const OTP_TTL_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 5;

export function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\s+/g, "").replace(/-/g, "");
  if (/^\+86\d{11}$/.test(digits)) return digits;
  if (/^1\d{10}$/.test(digits)) return `+86${digits}`;
  if (/^\+\d{8,15}$/.test(digits)) return digits;
  return null;
}

export function hashOtp(phone: string, code: string): string {
  return createHash("sha256")
    .update(`${phone}:${code}:${process.env.AUTH_SECRET ?? "dev"}`)
    .digest("hex");
}

function safeEqualHex(a: string, b: string): boolean {
  try {
    const ba = Buffer.from(a, "hex");
    const bb = Buffer.from(b, "hex");
    if (ba.length !== bb.length) return false;
    return timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

export function generateOtpCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export type SendSmsResult =
  | { ok: true; loggedOnly: boolean }
  | { ok: false; error: string; message: string };

/**
 * Persist OTP and send via Aliyun Dysms when configured; otherwise log (dev).
 */
export async function issueSmsOtp(
  db: D1Database,
  phone: string,
): Promise<SendSmsResult> {
  const code = generateOtpCode();
  const expires = new Date(Date.now() + OTP_TTL_MS).toISOString();
  await db
    .prepare(
      `INSERT INTO sms_otp_challenges (phone, code_hash, expires_at, attempts, created_at)
       VALUES (?, ?, ?, 0, datetime('now'))
       ON CONFLICT(phone) DO UPDATE SET
         code_hash = excluded.code_hash,
         expires_at = excluded.expires_at,
         attempts = 0,
         created_at = excluded.created_at`,
    )
    .bind(phone, hashOtp(phone, code), expires)
    .run();

  const accessKeyId = process.env.ALIYUN_SMS_ACCESS_KEY_ID;
  const accessKeySecret = process.env.ALIYUN_SMS_ACCESS_KEY_SECRET;
  const signName = process.env.ALIYUN_SMS_SIGN_NAME;
  const templateCode = process.env.ALIYUN_SMS_TEMPLATE_CODE;

  if (!accessKeyId || !accessKeySecret || !signName || !templateCode) {
    console.info(`[inkara:auth] SMS OTP for ${phone}: ${code}`);
    return { ok: true, loggedOnly: true };
  }

  // Minimal Dysms OpenAPI v3-style call via official HTTP endpoint would need
  // full signing. Keep a thin fetch placeholder; ops wires credentials later.
  // shortcut: no full Aliyun SDK, upgrade when production SMS must ship.
  console.info(
    `[inkara:auth] SMS credentials present; sending OTP to ${phone} (template ${templateCode})`,
  );
  try {
    const { sendAliyunSms } = await import("@/lib/sms-aliyun");
    await sendAliyunSms({
      accessKeyId,
      accessKeySecret,
      signName,
      templateCode,
      phone: phone.replace(/^\+86/, ""),
      templateParam: { code },
    });
    return { ok: true, loggedOnly: false };
  } catch (err) {
    console.error("[inkara:auth] Aliyun SMS failed", err);
    return {
      ok: false,
      error: "sms_send_failed",
      message: "短信发送失败",
    };
  }
}

export async function verifySmsOtp(
  db: D1Database,
  phone: string,
  code: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const row = await db
    .prepare(
      `SELECT code_hash, expires_at, attempts FROM sms_otp_challenges WHERE phone = ?`,
    )
    .bind(phone)
    .first<{ code_hash: string; expires_at: string; attempts: number }>();
  if (!row) return { ok: false, error: "otp_not_found" };
  if (row.attempts >= MAX_ATTEMPTS) return { ok: false, error: "otp_locked" };
  if (new Date(row.expires_at).getTime() < Date.now()) {
    return { ok: false, error: "otp_expired" };
  }
  const match = safeEqualHex(row.code_hash, hashOtp(phone, code));
  await db
    .prepare(
      `UPDATE sms_otp_challenges SET attempts = attempts + 1 WHERE phone = ?`,
    )
    .bind(phone)
    .run();
  if (!match) return { ok: false, error: "otp_invalid" };
  await db
    .prepare(`DELETE FROM sms_otp_challenges WHERE phone = ?`)
    .bind(phone)
    .run();
  return { ok: true };
}
