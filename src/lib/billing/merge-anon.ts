import type { BillingStore } from "./ledger";

/**
 * Move remaining unexpired daily_grant from anon → user.
 * Idempotent when anon has nothing left.
 */
export async function mergeAnonDailyGrants(
  store: BillingStore,
  anonSubjectId: string,
  userId: string,
  grantDate: string,
  expiresAt: string,
): Promise<{ merged: number }> {
  if (!anonSubjectId || !userId || anonSubjectId === userId) {
    return { merged: 0 };
  }
  const merged = await store.transferDailyGrantRemaining(
    anonSubjectId,
    userId,
    grantDate,
    expiresAt,
  );
  return { merged };
}
