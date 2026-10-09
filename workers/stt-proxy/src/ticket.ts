// Ticket: `${expiresAt}.${hmac}` where hmac is the first 32 hex chars of
// HMAC-SHA256(secret, String(expiresAt)). Mint TTL is 120s (see src/lib/stt-ticket.ts).

const SIG_HEX_LEN = 32;

export function resolveTicketSecret(env: {
  STT_TICKET_SECRET?: string;
  AUTH_SECRET?: string;
}): string | null {
  const secret =
    env.STT_TICKET_SECRET?.trim() || env.AUTH_SECRET?.trim() || "";
  return secret || null;
}

export async function verifySttTicket(
  secret: string,
  ticket: string,
  nowMs = Date.now()
): Promise<boolean> {
  const [expStr, sig] = ticket.split(".");
  if (!expStr || !sig || sig.length !== SIG_HEX_LEN) return false;
  const expiresAt = Number(expStr);
  if (!Number.isFinite(expiresAt) || nowMs > expiresAt) return false;
  const expected = await hmacSha256Hex32(secret, String(expiresAt));
  return timingSafeEqualHex(sig, expected);
}

async function hmacSha256Hex32(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const mac = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(message)
  );
  return bufferToHex(mac).slice(0, SIG_HEX_LEN);
}

function bufferToHex(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, "0");
  }
  return hex;
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
