import type {
  CreatePaymentInput,
  CreatePaymentResult,
  PaymentProvider,
  WebhookParseResult,
} from "./types";

/**
 * Local/dev provider: no third-party call. Checkout returns a URL that hits
 * our mock pay endpoint which immediately fires a signed webhook-style fulfill.
 */
export function createMockPaymentProvider(opts?: {
  baseUrl?: string;
}): PaymentProvider {
  const baseUrl = (opts?.baseUrl ?? "").replace(/\/$/, "");

  return {
    id: "mock",

    async createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
      const origin = baseUrl || new URL(input.returnUrl).origin;
      const payUrl = `${origin}/api/billing/mock-pay?orderId=${encodeURIComponent(input.orderId)}&returnUrl=${encodeURIComponent(input.returnUrl)}`;
      return {
        mode: "redirect",
        payUrl,
        providerTradeNo: `mock_${input.orderId}`,
      };
    },

    async verifyAndParseWebhook(
      _req: Request,
      rawBody: string,
    ): Promise<WebhookParseResult> {
      try {
        const data = JSON.parse(rawBody) as {
          orderId?: string;
          providerTradeNo?: string;
          secret?: string;
        };
        const expected = process.env.PAY_MOCK_SECRET ?? "inkara-mock-pay";
        if (data.secret !== expected) {
          return { ok: false, error: "bad_secret" };
        }
        if (!data.orderId) return { ok: false, error: "missing_order" };
        return {
          ok: true,
          orderId: data.orderId,
          providerTradeNo: data.providerTradeNo ?? null,
          paid: true,
          raw: rawBody,
        };
      } catch {
        return { ok: false, error: "invalid_json" };
      }
    },

    successResponse() {
      return "success";
    },
  };
}
