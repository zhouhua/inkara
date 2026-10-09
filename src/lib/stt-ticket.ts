import { createHmac, timingSafeEqual } from "node:crypto";

const TTL_MS = 120_000;

export function mintSttTicket(secret: string, nowMs = Date.now()) {
  const expiresAt = nowMs + TTL_MS;
  const sig = createHmac("sha256", secret)
    .update(String(expiresAt))
    .digest("hex")
    .slice(0, 32);
  return { ticket: `${expiresAt}.${sig}`, expiresAt };
}

export function verifySttTicket(
  secret: string,
  ticket: string,
  nowMs = Date.now()
): boolean {
  const [expStr, sig] = ticket.split(".");
  if (!expStr || !sig || sig.length !== 32) return false;
  const expiresAt = Number(expStr);
  if (!Number.isFinite(expiresAt) || nowMs > expiresAt) return false;
  const expected = createHmac("sha256", secret)
    .update(String(expiresAt))
    .digest("hex")
    .slice(0, 32);
  try {
    return timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  } catch {
    return false;
  }
}

export function resolveSttTicketSecret(): string | null {
  const s =
    process.env.STT_TICKET_SECRET?.trim() ||
    process.env.AUTH_SECRET?.trim() ||
    "";
  return s || null;
}
