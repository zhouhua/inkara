import { getCloudflareContext } from "@opennextjs/cloudflare";
import { auth } from "@/lib/auth";
import {
  consumeOne,
  ensureDailyGrant,
  shanghaiDate,
  shanghaiDayEndIso,
} from "@/lib/billing/ledger";
import { createD1BillingStore } from "@/lib/billing/d1-store";
import { mergeAnonDailyGrants } from "@/lib/billing/merge-anon";
import { mergeAnonContent } from "@/lib/content/merge-anon";
import type { D1Database } from "@/lib/db-server";
import { readAnonSubject } from "@/lib/subject";

export { readAnonSubject };

async function resolveDb(): Promise<D1Database | null> {
  try {
    const { env } = await getCloudflareContext({ async: true });
    return (env as { DB?: D1Database }).DB ?? null;
  } catch {
    return null;
  }
}

export type BillingGateResult =
  | { ok: true; subjectId: string }
  | { ok: false; status: number; error: string; message?: string };

/**
 * Resolve billed subject and consume one ask credit.
 * Logged-in users merge anon daily grants + content first.
 */
export async function gateAskConsume(req: Request): Promise<BillingGateResult> {
  const db = await resolveDb();
  if (!db) {
    return {
      ok: false,
      status: 503,
      error: "billing_unavailable",
      message: "D1 binding missing",
    };
  }

  const store = createD1BillingStore(db);
  const session = await auth();
  const anon = readAnonSubject(req);
  const now = new Date();

  let subjectId: string | null = session?.user?.id ?? null;
  if (subjectId && anon) {
    await mergeAnonDailyGrants(
      store,
      anon,
      subjectId,
      shanghaiDate(now),
      shanghaiDayEndIso(now),
    );
    await mergeAnonContent(db, anon, subjectId);
  }
  if (!subjectId) {
    subjectId = anon;
  }
  if (!subjectId) {
    return {
      ok: false,
      status: 401,
      error: "login_required",
      message: "Anonymous subject missing; call POST /api/billing/anon first",
    };
  }

  await ensureDailyGrant(store, subjectId, now);
  const result = await consumeOne(store, subjectId, now);
  if (!result.ok) {
    return { ok: false, status: 429, error: "quota_exhausted" };
  }
  return { ok: true, subjectId };
}
