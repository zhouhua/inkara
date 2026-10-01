import { getCloudflareContext } from "@opennextjs/cloudflare";
import { auth } from "@/lib/auth";
import { CATALOG, isSkuId } from "@/lib/billing/catalog";
import { getPaymentProvider } from "@/lib/billing/providers";
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

function appOrigin(req: Request): string {
  const envOrigin = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  if (envOrigin) return envOrigin;
  return new URL(req.url).origin;
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "login_required" }, { status: 401 });
  }

  const db = await resolveDb();
  if (!db) {
    return Response.json({ error: "billing_unavailable" }, { status: 503 });
  }

  let body: { sku?: string };
  try {
    body = (await req.json()) as { sku?: string };
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  const sku = typeof body.sku === "string" ? body.sku : "";
  if (!isSkuId(sku)) {
    return Response.json({ error: "invalid_sku" }, { status: 400 });
  }

  const item = CATALOG[sku];
  const orderId = `ord_${crypto.randomUUID()}`;
  const userId = session.user.id;

  await db
    .prepare(
      `INSERT INTO orders (id, user_id, sku, amount_fen, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'pending', datetime('now'), datetime('now'))`,
    )
    .bind(orderId, userId, sku, item.priceFen)
    .run();

  const origin = appOrigin(req);
  const notifyUrl = `${origin}/api/billing/webhook`;
  const returnUrl = `${origin}/?billing=return`;

  try {
    const provider = getPaymentProvider();
    const title =
      item.kind === "pack"
        ? `墨语积分包 ${"credits" in item ? item.credits : ""}`
        : `墨语会员 ${sku}`;
    const payment = await provider.createPayment({
      orderId,
      amountFen: item.priceFen,
      title,
      notifyUrl,
      returnUrl,
    });

    if (payment.providerTradeNo) {
      await db
        .prepare(
          `UPDATE orders SET provider_trade_no = ?, updated_at = datetime('now')
           WHERE id = ?`,
        )
        .bind(payment.providerTradeNo, orderId)
        .run();
    }

    return Response.json({
      orderId,
      payUrl: payment.payUrl,
      amountFen: item.priceFen,
      sku,
      provider: provider.id,
    });
  } catch (err) {
    await db
      .prepare(
        `UPDATE orders SET status = 'failed', updated_at = datetime('now') WHERE id = ?`,
      )
      .bind(orderId)
      .run();
    const message = err instanceof Error ? err.message : "checkout_failed";
    return Response.json({ error: "checkout_failed", message }, { status: 502 });
  }
}
