import { getCloudflareContext } from "@opennextjs/cloudflare";
import { createD1FulfillStore } from "@/lib/billing/d1-fulfill";
import { fulfillOrder } from "@/lib/billing/fulfill";
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

export async function POST(req: Request) {
  const db = await resolveDb();
  if (!db) {
    return new Response("billing_unavailable", { status: 503 });
  }

  const rawBody = await req.text();
  const provider = getPaymentProvider();
  const parsed = await provider.verifyAndParseWebhook(req, rawBody);
  if (!parsed.ok) {
    return new Response(parsed.error, { status: 401 });
  }

  const store = createD1FulfillStore(db);
  const result = await fulfillOrder(store, parsed.orderId, {
    providerTradeNo: parsed.providerTradeNo,
    raw: parsed.raw,
  });

  if (!result.ok && result.error === "missing_order") {
    return new Response("missing_order", { status: 404 });
  }

  return new Response(provider.successResponse(), {
    status: 200,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
