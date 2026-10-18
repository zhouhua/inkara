import { auth } from "@/lib/auth";
import { resolveD1 } from "@/lib/subject";

export const runtime = "nodejs";

/** Mark active subscription to cancel at period end (no immediate cut-off). */
export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "login_required" }, { status: 401 });
  }
  const db = await resolveD1();
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
    canceled: true,
    meta: result,
  });
}
