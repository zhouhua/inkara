import { describe, expect, it } from "vitest";
import { createMockPaymentProvider } from "./mock";

describe("mock payment provider", () => {
  it("builds a mock-pay URL and verifies signed webhook body", async () => {
    const provider = createMockPaymentProvider({
      baseUrl: "https://inkara.example",
    });
    const created = await provider.createPayment({
      orderId: "ord_1",
      amountFen: 990,
      title: "test",
      notifyUrl: "https://inkara.example/api/billing/webhook",
      returnUrl: "https://inkara.example/?billing=return",
    });
    expect(created.payUrl).toContain("/api/billing/mock-pay?orderId=ord_1");

    const raw = JSON.stringify({
      orderId: "ord_1",
      providerTradeNo: "mock_ord_1",
      secret: "inkara-mock-pay",
    });
    const parsed = await provider.verifyAndParseWebhook(
      new Request("https://inkara.example/api/billing/webhook"),
      raw,
    );
    expect(parsed).toMatchObject({ ok: true, orderId: "ord_1", paid: true });
  });
});
