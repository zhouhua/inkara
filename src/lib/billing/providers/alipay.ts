import type {
  CreatePaymentInput,
  CreatePaymentResult,
  PaymentProvider,
  WebhookParseResult,
} from "./types";
import { normalizePem, rsaSignSha256, rsaVerifySha256 } from "./crypto-util";

export type AlipayEnv = {
  appId: string;
  privateKey: string;
  alipayPublicKey: string;
  gateway?: string;
};

/**
 * Alipay 电脑网站支付 (alipay.trade.page.pay) — returns a redirect URL.
 * Notify: application/x-www-form-urlencoded with RSA2 sign.
 */
export function createAlipayProvider(env: AlipayEnv): PaymentProvider {
  const gateway = (
    env.gateway ?? "https://openapi.alipay.com/gateway.do"
  ).replace(/\/$/, "");

  return {
    id: "alipay",

    async createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
      const bizContent = JSON.stringify({
        out_trade_no: input.orderId,
        total_amount: (input.amountFen / 100).toFixed(2),
        subject: input.title.slice(0, 256),
        product_code: "FAST_INSTANT_TRADE_PAY",
      });

      const params: Record<string, string> = {
        app_id: env.appId,
        method: "alipay.trade.page.pay",
        format: "JSON",
        charset: "utf-8",
        sign_type: "RSA2",
        timestamp: formatAlipayTimestamp(new Date()),
        version: "1.0",
        notify_url: input.notifyUrl,
        return_url: input.returnUrl,
        biz_content: bizContent,
      };
      params.sign = signAlipayParams(params, env.privateKey);

      const qs = new URLSearchParams();
      for (const [k, v] of Object.entries(params)) {
        qs.set(k, v);
      }
      return {
        mode: "redirect",
        payUrl: `${gateway}?${qs.toString()}`,
      };
    },

    async verifyAndParseWebhook(
      _req: Request,
      rawBody: string,
    ): Promise<WebhookParseResult> {
      const params = Object.fromEntries(new URLSearchParams(rawBody));
      const sign = params.sign;
      const signType = params.sign_type ?? "RSA2";
      if (!sign || signType !== "RSA2") {
        return { ok: false, error: "missing_sign" };
      }
      const content = alipaySignContent(params);
      if (!rsaVerifySha256(content, sign, env.alipayPublicKey)) {
        return { ok: false, error: "bad_alipay_signature" };
      }
      const status = params.trade_status;
      if (status !== "TRADE_SUCCESS" && status !== "TRADE_FINISHED") {
        return { ok: false, error: `trade_status_${status ?? "unknown"}` };
      }
      const orderId = params.out_trade_no;
      if (!orderId) return { ok: false, error: "missing_order" };
      return {
        ok: true,
        orderId,
        providerTradeNo: params.trade_no ?? null,
        paid: true,
        raw: rawBody,
      };
    },

    successResponse() {
      return "success";
    },
  };
}

function formatAlipayTimestamp(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  // Alipay expects Asia/Shanghai wall time; approximate via +08 offset format.
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(d);
  const get = (type: string) =>
    parts.find((p) => p.type === type)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}:${get("second")}`;
}

function alipaySignContent(params: Record<string, string>): string {
  return Object.keys(params)
    .filter((k) => k !== "sign" && params[k] !== undefined && params[k] !== "")
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join("&");
}

function signAlipayParams(
  params: Record<string, string>,
  privateKeyPem: string,
): string {
  return rsaSignSha256(alipaySignContent(params), privateKeyPem);
}

export function loadAlipayEnvFromProcess(): AlipayEnv | null {
  const appId = process.env.ALIPAY_APP_ID ?? "";
  const privateKey = process.env.ALIPAY_PRIVATE_KEY ?? "";
  const alipayPublicKey = process.env.ALIPAY_PUBLIC_KEY ?? "";
  if (!appId || !privateKey || !alipayPublicKey) return null;
  return {
    appId,
    privateKey: normalizePem(privateKey),
    alipayPublicKey: normalizePem(alipayPublicKey),
    gateway: process.env.ALIPAY_GATEWAY,
  };
}
