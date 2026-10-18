import { auth } from "@/lib/auth";
import { mergeAnonDailyGrants } from "@/lib/billing/merge-anon";
import { createD1BillingStore } from "@/lib/billing/d1-store";
import { shanghaiDate, shanghaiDayEndIso } from "@/lib/billing/ledger";
import { mergeAnonContent } from "@/lib/content/merge-anon";
import {
  readAnonSubjectFromRequest,
  resolveAnonCookieSecret,
} from "@/lib/anon-cookie";
import { resolveServerDb, type D1Database } from "@/lib/db-server";

/** @deprecated use readAnonSubjectFromRequest — kept name for call sites */
export function readAnonSubject(req: Request): string | null {
  return readAnonSubjectFromRequest(req, resolveAnonCookieSecret());
}

export async function resolveD1(): Promise<D1Database | null> {
  return resolveServerDb();
}

export type SubjectResult =
  | {
      ok: true;
      subjectId: string;
      userId: string | null;
      anonId: string | null;
    }
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
      message: "Database unavailable",
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
