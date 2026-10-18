import { createD1FulfillStore } from "@/lib/billing/d1-fulfill";
import { fulfillOrder } from "@/lib/billing/fulfill";
import {
  mockPayAllowed,
  mockPaySecret,
  verifyMockPayToken,
} from "@/lib/billing/providers/mock-token";
import { resolveD1 } from "@/lib/subject";

export const runtime = "nodejs";

/**
 * Dev helper: open payUrl from mock provider → fulfill order → redirect home.
 * Requires HMAC `token` from checkout; disabled unless mock is allowed.
 */
export async function GET(req: Request) {
  if (!mockPayAllowed()) {
    return new Response("not_found", { status: 404 });
  }

  const url = new URL(req.url);
  const orderId = url.searchParams.get("orderId");
  const token = url.searchParams.get("token");
  const returnUrl = url.searchParams.get("returnUrl") ?? "/";
  if (!orderId || !token) {
    return new Response("missing_order", { status: 400 });
  }

  const secret = mockPaySecret();
  if (!verifyMockPayToken(orderId, token, secret)) {
    return new Response("bad_token", { status: 401 });
  }

  const db = await resolveD1();
  if (!db) {
    return new Response("billing_unavailable", { status: 503 });
  }

  const raw = JSON.stringify({
    orderId,
    providerTradeNo: `mock_${orderId}`,
    secret,
  });

  const store = createD1FulfillStore(db);
  await fulfillOrder(store, orderId, {
    providerTradeNo: `mock_${orderId}`,
    raw,
  });

  return Response.redirect(returnUrl, 302);
}
