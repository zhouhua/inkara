import { getCloudflareContext } from "@opennextjs/cloudflare";
import { createD1FulfillStore } from "@/lib/billing/d1-fulfill";
import { fulfillOrder } from "@/lib/billing/fulfill";
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

/**
 * Dev helper: open payUrl from mock provider → fulfill order → redirect home.
 * Only active when PAY_PROVIDER is mock (default).
 */
export async function GET(req: Request) {
  if ((process.env.PAY_PROVIDER ?? "mock").toLowerCase() !== "mock") {
    return new Response("not_found", { status: 404 });
  }

  const url = new URL(req.url);
  const orderId = url.searchParams.get("orderId");
  const returnUrl = url.searchParams.get("returnUrl") ?? "/";
  if (!orderId) {
    return new Response("missing_order", { status: 400 });
  }

  const db = await resolveDb();
  if (!db) {
    return new Response("billing_unavailable", { status: 503 });
  }

  const secret = process.env.PAY_MOCK_SECRET ?? "inkara-mock-pay";
  const raw = JSON.stringify({
    orderId,
    providerTradeNo: `mock_${orderId}`,
    secret,
  });

  // Inline fulfill (same as webhook) so local mock doesn't need a second hop.
  const store = createD1FulfillStore(db);
  await fulfillOrder(store, orderId, {
    providerTradeNo: `mock_${orderId}`,
    raw,
  });

  return Response.redirect(returnUrl, 302);
}
