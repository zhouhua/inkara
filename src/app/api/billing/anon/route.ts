import {
  buildAnonSetCookie,
  newAnonSubjectId,
  readAnonSubjectFromRequest,
  resolveAnonCookieSecret,
  wantSecureCookie,
} from "@/lib/anon-cookie";
import { resolveD1 } from "@/lib/subject";

export const runtime = "nodejs";

/** Issue or return anonymous subject id (httpOnly signed cookie). */
export async function POST(req: Request) {
  const secret = resolveAnonCookieSecret();
  if (!secret) {
    return Response.json(
      { error: "auth_secret_missing", message: "AUTH_SECRET is required" },
      { status: 503 },
    );
  }

  const db = await resolveD1();
  if (!db) {
    return Response.json({ error: "billing_unavailable" }, { status: 503 });
  }

  let subjectId = readAnonSubjectFromRequest(req, secret);
  const headers = new Headers({ "content-type": "application/json" });
  if (!subjectId) {
    subjectId = newAnonSubjectId();
  }
  // Always refresh Set-Cookie so legacy unsigned cookies are replaced.
  headers.append(
    "set-cookie",
    buildAnonSetCookie(subjectId, secret, { secure: wantSecureCookie(req) }),
  );

  return new Response(JSON.stringify({ subjectId }), { status: 200, headers });
}
