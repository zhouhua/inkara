import { getCloudflareContext } from "@opennextjs/cloudflare";
import { auth } from "@/lib/auth";
import {
  ensureDailyGrant,
  getBalance,
  shanghaiDate,
  shanghaiDayEndIso,
} from "@/lib/billing/ledger";
import { createD1BillingStore } from "@/lib/billing/d1-store";
import { mergeAnonDailyGrants } from "@/lib/billing/merge-anon";
import type { D1Database } from "@/lib/db-server";

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

export async function GET(req: Request) {
  const db = await resolveDb();
  if (!db) {
    return Response.json(
      { error: "billing_unavailable", message: "D1 binding missing" },
      { status: 503 },
    );
  }

  const store = createD1BillingStore(db);
  const session = await auth();
  const now = new Date();
  const anon = readAnon(req);

  if (session?.user?.id) {
    if (anon) {
      await mergeAnonDailyGrants(
        store,
        anon,
        session.user.id,
        shanghaiDate(now),
        shanghaiDayEndIso(now),
      );
    }
    await ensureDailyGrant(store, session.user.id, now);
    const balance = await getBalance(store, session.user.id, now);
    const subRow = await db
      .prepare(
        `SELECT cancel_at_period_end FROM subscriptions
         WHERE user_id = ? AND status = 'active'
         ORDER BY current_period_end DESC LIMIT 1`,
      )
      .bind(session.user.id)
      .first<{ cancel_at_period_end: number }>();
    return Response.json({
      anonymous: false,
      userId: session.user.id,
      email: session.user.email ?? null,
      subscription: {
        active: balance.hasActiveSubscription,
        cancelAtPeriodEnd: Boolean(subRow?.cancel_at_period_end),
      },
      usage: balance.usage,
      period: balance.period,
      credits: {
        purchased: balance.purchased,
        daily: balance.daily,
        goodwill: balance.goodwill,
      },
      goodwillGrantedThisPeriod: balance.goodwillGrantedThisPeriod,
    });
  }

  if (!anon) {
    return Response.json({
      anonymous: true,
      credits: { purchased: 0, daily: 0, goodwill: 0 },
    });
  }

  await ensureDailyGrant(store, anon, now);
  const balance = await getBalance(store, anon, now);
  return Response.json({
    anonymous: true,
    subjectId: anon,
    period: balance.period,
    credits: {
      purchased: balance.purchased,
      daily: balance.daily,
      goodwill: balance.goodwill,
    },
  });
}
