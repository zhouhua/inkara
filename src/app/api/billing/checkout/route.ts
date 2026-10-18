import { auth } from "@/lib/auth";
import { CATALOG, isSkuId, skuLabelKey } from "@/lib/billing/catalog";
import { getPaymentProvider, isPaymentChannel } from "@/lib/billing/providers";
import type { PaymentChannel } from "@/lib/billing/providers/types";
import { t } from "@/lib/i18n";
import { requestLocale } from "@/lib/request-locale";
import { resolveD1 } from "@/lib/subject";

export const runtime = "nodejs";

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

  const db = await resolveD1();
  if (!db) {
    return Response.json({ error: "billing_unavailable" }, { status: 503 });
  }

  let body: { sku?: string; channel?: string };
  try {
    body = (await req.json()) as { sku?: string; channel?: string };
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  const sku = typeof body.sku === "string" ? body.sku : "";
  if (!isSkuId(sku)) {
    return Response.json({ error: "invalid_sku" }, { status: 400 });
  }

  const channelRaw = typeof body.channel === "string" ? body.channel : "alipay";
  if (!isPaymentChannel(channelRaw)) {
    return Response.json({ error: "invalid_channel" }, { status: 400 });
  }
  const channel: PaymentChannel = channelRaw;

  const item = CATALOG[sku];
  const orderId = `ord_${crypto.randomUUID()}`;
  const userId = session.user.id;

  await db
    .prepare(
      `INSERT INTO orders
         (id, user_id, sku, amount_fen, status, channel, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'pending', ?, datetime('now'), datetime('now'))`,
    )
    .bind(orderId, userId, sku, item.priceFen, channel)
    .run();

  const origin = appOrigin(req);
  const notifyUrl = `${origin}/api/billing/webhook/${channel}`;
  const returnUrl = `${origin}/?billing=return&channel=${channel}`;

  try {
    const provider = getPaymentProvider(channel);
    const locale = await requestLocale();
    const label = t(locale, skuLabelKey(sku));
    const title = `${t(locale, "brand")} · ${label}`;
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
      channel,
      provider: provider.id,
      mode: payment.mode ?? (payment.codeUrl ? "qrcode" : "redirect"),
      payUrl: payment.payUrl ?? null,
      codeUrl: payment.codeUrl ?? null,
      amountFen: item.priceFen,
      sku,
    });
  } catch (err) {
    await db
      .prepare(
        `UPDATE orders SET status = 'failed', updated_at = datetime('now') WHERE id = ?`,
      )
      .bind(orderId)
      .run();
    const message = err instanceof Error ? err.message : "checkout_failed";
    return Response.json(
      { error: "checkout_failed", message },
      { status: 502 },
    );
  }
}
