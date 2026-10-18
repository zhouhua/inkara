import { createHmac, timingSafeEqual } from "node:crypto";

const ANON_PREFIX = "anon_";
const SIG_LEN = 32;
const COOKIE_NAME = "inkara_anon";
const MAX_AGE = 60 * 60 * 24 * 365;

export { COOKIE_NAME as ANON_COOKIE_NAME };

export function newAnonSubjectId(): string {
  return `${ANON_PREFIX}${crypto.randomUUID()}`;
}

export function isAnonSubjectId(id: string): boolean {
  return id.startsWith(ANON_PREFIX) && id.length > ANON_PREFIX.length + 8;
}

export function resolveAnonCookieSecret(): string | null {
  const s = process.env.AUTH_SECRET?.trim() || "";
  return s || null;
}

/** Cookie value: `anon_<uuid>.<hmac32>` */
export function sealAnonCookieValue(subjectId: string, secret: string): string {
  const sig = createHmac("sha256", secret)
    .update(subjectId)
    .digest("hex")
    .slice(0, SIG_LEN);
  return `${subjectId}.${sig}`;
}

/**
 * Parse Cookie header; only signed anon_* ids are accepted.
 * Bare user UUIDs (or unsigned values) never become a subject.
 */
export function readAnonSubjectFromRequest(
  req: Request,
  secret: string | null = resolveAnonCookieSecret(),
): string | null {
  if (!secret) return null;
  const cookie = req.headers.get("cookie") ?? "";
  const match = cookie.match(/(?:^|;\s*)inkara_anon=([^;]+)/);
  if (!match?.[1]) return null;
  let raw: string;
  try {
    raw = decodeURIComponent(match[1]);
  } catch {
    return null;
  }
  return unsealAnonCookieValue(raw, secret);
}

export function unsealAnonCookieValue(
  raw: string,
  secret: string,
): string | null {
  const dot = raw.lastIndexOf(".");
  if (dot <= 0) return null;
  const subjectId = raw.slice(0, dot);
  const sig = raw.slice(dot + 1);
  if (!isAnonSubjectId(subjectId) || sig.length !== SIG_LEN) return null;
  const expected = createHmac("sha256", secret)
    .update(subjectId)
    .digest("hex")
    .slice(0, SIG_LEN);
  try {
    if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  } catch {
    return null;
  }
  return subjectId;
}

export function buildAnonSetCookie(
  subjectId: string,
  secret: string,
  opts?: { secure?: boolean },
): string {
  const value = encodeURIComponent(sealAnonCookieValue(subjectId, secret));
  const secure = opts?.secure ? "; Secure" : "";
  return `${COOKIE_NAME}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${MAX_AGE}${secure}`;
}

export function wantSecureCookie(req: Request): boolean {
  const forwarded = req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  if (forwarded === "https") return true;
  if (forwarded === "http") return false;
  if (process.env.NODE_ENV === "production") return true;
  try {
    return new URL(req.url).protocol === "https:";
  } catch {
    return false;
  }
}
