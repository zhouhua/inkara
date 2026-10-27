import { createHmac, timingSafeEqual } from "node:crypto";

const TTL_MS = 5 * 60 * 1000;

function secret(): string {
  return process.env.AUTH_SECRET ?? "dev";
}

/** Short-lived HMAC ticket so OAuth callback can complete via Credentials signIn. */
export function mintLoginTicket(userId: string): string {
  const exp = Date.now() + TTL_MS;
  const payload = `${userId}.${exp}`;
  const sig = createHmac("sha256", secret())
    .update(payload)
    .digest("base64url");
  return `${payload}.${sig}`;
}

export function verifyLoginTicket(ticket: string): string | null {
  const parts = ticket.split(".");
  if (parts.length !== 3) return null;
  const [userId, expStr, sig] = parts as [string, string, string];
  const exp = Number(expStr);
  if (!userId || !Number.isFinite(exp) || exp < Date.now()) return null;
  const payload = `${userId}.${expStr}`;
  const expected = createHmac("sha256", secret())
    .update(payload)
    .digest("base64url");
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }
  return userId;
}
