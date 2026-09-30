import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { D1Database } from "@/lib/db-server";

const COOKIE = "inkara_anon";
const MAX_AGE = 60 * 60 * 24 * 365;

export const runtime = "nodejs";

async function resolveDb(): Promise<D1Database | null> {
  try {
    const { env } = await getCloudflareContext({ async: true });
    return (env as { DB?: D1Database }).DB ?? null;
  } catch {
    return null;
  }
}

function readAnon(req: Request): string | null {
  const cookie = req.headers.get("cookie") ?? "";
  const match = cookie.match(/(?:^|;\s*)inkara_anon=([^;]+)/);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

/** Issue or return anonymous subject id (httpOnly cookie). */
export async function POST(req: Request) {
  const db = await resolveDb();
  if (!db) {
    return Response.json({ error: "billing_unavailable" }, { status: 503 });
  }

  let subjectId = readAnon(req);
  const headers = new Headers({ "content-type": "application/json" });
  if (!subjectId) {
    subjectId = `anon_${crypto.randomUUID()}`;
    headers.append(
      "set-cookie",
      `${COOKIE}=${encodeURIComponent(subjectId)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${MAX_AGE}`,
    );
  }

  return new Response(JSON.stringify({ subjectId }), { status: 200, headers });
}
