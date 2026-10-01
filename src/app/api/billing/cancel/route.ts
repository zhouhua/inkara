import { getCloudflareContext } from "@opennextjs/cloudflare";
import { auth } from "@/lib/auth";
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

/** Mark active subscription to cancel at period end (no immediate cut-off). */
export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "login_required" }, { status: 401 });
  }
  const db = await resolveDb();
  if (!db) {
    return Response.json({ error: "billing_unavailable" }, { status: 503 });
  }

  const result = await db
    .prepare(
      `UPDATE subscriptions
       SET cancel_at_period_end = 1, updated_at = datetime('now')
       WHERE user_id = ? AND status = 'active'`,
    )
    .bind(session.user.id)
    .run();

  return Response.json({
    ok: true,
    // D1 meta may expose changes; keep soft response
    canceled: true,
    meta: result,
  });
}
