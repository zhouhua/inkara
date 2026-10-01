export type CreatePaymentInput = {
  orderId: string;
  amountFen: number;
  title: string;
  notifyUrl: string;
  returnUrl: string;
};

export type CreatePaymentResult = {
  /** Redirect or open this URL / QR page */
  payUrl: string;
  /** Optional provider trade no if known at create time */
  providerTradeNo?: string;
};

export type WebhookParseResult =
  | { ok: true; orderId: string; providerTradeNo: string | null; paid: true; raw: string }
  | { ok: false; error: string };

export type PaymentProvider = {
  id: string;
  createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult>;
  verifyAndParseWebhook(
    req: Request,
    rawBody: string,
  ): Promise<WebhookParseResult>;
  /** Body text expected by the aggregator after successful notify handling */
  successResponse(): string;
};
