import { auth } from "@/lib/auth";
import {
  consumeOne,
  ensureDailyGrant,
  refundOne,
  shanghaiDate,
  shanghaiDayEndIso,
} from "@/lib/billing/ledger";
import { createD1BillingStore } from "@/lib/billing/d1-store";
import { mergeAnonDailyGrants } from "@/lib/billing/merge-anon";
import { mergeAnonContent } from "@/lib/content/merge-anon";
import { readAnonSubject, resolveD1 } from "@/lib/subject";
import type { ConsumeVia } from "@/lib/billing/schema";
import type { BillingStore } from "@/lib/billing/ledger";

export { readAnonSubject };

export type BillingGateResult =
  | { ok: true; subjectId: string; via: ConsumeVia; store: BillingStore }
  | { ok: false; status: number; error: string; message?: string };

/**
 * Resolve billed subject and consume one ask credit.
 * Logged-in users merge anon daily grants + content first.
 * Caller should refund via `refundAskConsume` if the ask fails after charging.
 */
export async function gateAskConsume(req: Request): Promise<BillingGateResult> {
  const db = await resolveD1();
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
  return { ok: true, subjectId, via: result.via, store };
}

export async function refundAskConsume(
  gate: Extract<BillingGateResult, { ok: true }>,
): Promise<void> {
  try {
    await refundOne(gate.store, gate.subjectId, gate.via);
  } catch (err) {
    console.error("Ask refund failed:", err);
  }
}
