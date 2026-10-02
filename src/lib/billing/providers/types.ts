export type CreatePaymentInput = {
  orderId: string;
  amountFen: number;
  title: string;
  notifyUrl: string;
  returnUrl: string;
};

export type CreatePaymentResult = {
  /** redirect — Alipay page pay / mock */
  mode?: "redirect" | "qrcode";
  payUrl?: string;
  /** WeChat Native code_url for QR */
  codeUrl?: string;
  providerTradeNo?: string;
};

export type WebhookParseResult =
  | {
      ok: true;
      orderId: string;
      providerTradeNo: string | null;
      paid: true;
      raw: string;
    }
  | { ok: false; error: string };

export type PaymentChannel = "wechat" | "alipay" | "mock";

export type PaymentProvider = {
  id: PaymentChannel | string;
  createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult>;
  verifyAndParseWebhook(
    req: Request,
    rawBody: string,
  ): Promise<WebhookParseResult>;
  successResponse(): string;
};
