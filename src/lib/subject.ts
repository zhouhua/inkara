import { getCloudflareContext } from "@opennextjs/cloudflare";
import { auth } from "@/lib/auth";
import { mergeAnonDailyGrants } from "@/lib/billing/merge-anon";
import { createD1BillingStore } from "@/lib/billing/d1-store";
import { shanghaiDate, shanghaiDayEndIso } from "@/lib/billing/ledger";
import { mergeAnonContent } from "@/lib/content/merge-anon";
import type { D1Database } from "@/lib/db-server";

export function readAnonSubject(req: Request): string | null {
  const cookie = req.headers.get("cookie") ?? "";
  const match = cookie.match(/(?:^|;\s*)inkara_anon=([^;]+)/);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

export async function resolveD1(): Promise<D1Database | null> {
  try {
    const { env } = await getCloudflareContext({ async: true });
    return (env as { DB?: D1Database }).DB ?? null;
  } catch {
    return null;
  }
}

export type SubjectResult =
  | { ok: true; subjectId: string; userId: string | null; anonId: string | null }
  | { ok: false; status: number; error: string; message?: string };

/**
 * Resolve content/billing subject. Merges anon → user when both present.
 */
export async function resolveSubject(req: Request): Promise<SubjectResult> {
  const db = await resolveD1();
  if (!db) {
    return {
      ok: false,
      status: 503,
      error: "db_unavailable",
      message: "D1 binding missing",
    };
  }

  const session = await auth();
  const anon = readAnonSubject(req);
  const userId = session?.user?.id ?? null;
  const now = new Date();

  if (userId && anon && userId !== anon) {
    const billing = createD1BillingStore(db);
    await mergeAnonDailyGrants(
      billing,
      anon,
      userId,
      shanghaiDate(now),
      shanghaiDayEndIso(now),
    );
    await mergeAnonContent(db, anon, userId);
  }

  const subjectId = userId ?? anon;
  if (!subjectId) {
    return {
      ok: false,
      status: 401,
      error: "anon_required",
      message: "Call POST /api/billing/anon first",
    };
  }

  return { ok: true, subjectId, userId, anonId: anon };
}
