import { createHash } from "node:crypto";
import type {
  CreatePaymentInput,
  CreatePaymentResult,
  PaymentProvider,
  WebhookParseResult,
} from "./types";

/**
 * 虎皮椒 / XunhuPay OpenAPI (MD5 hash).
 * Docs: https://www.xunhupay.com/doc/api/pay.html
 *
 * Env:
 * - PAY_XH_APPID
 * - PAY_XH_APPSECRET
 * - PAY_XH_GATEWAY (optional, default official)
 */
export function createXunhuPaymentProvider(env: {
  appId: string;
  appSecret: string;
  gateway?: string;
}): PaymentProvider {
  const gateway =
    (env.gateway ?? "https://api.xunhupay.com/payment/do.html").replace(
      /\/$/,
      "",
    );

  return {
    id: "xunhupay",

    async createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
      const time = Math.floor(Date.now() / 1000).toString();
      const nonce = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
      const totalFee = (input.amountFen / 100).toFixed(2);
      const params: Record<string, string> = {
        version: "1.1",
        appid: env.appId,
        trade_order_id: input.orderId,
        total_fee: totalFee,
        title: input.title.slice(0, 127),
        time,
        notify_url: input.notifyUrl,
        return_url: input.returnUrl,
        nonce_str: nonce,
      };
      params.hash = await md5Sign(params, env.appSecret);

      const body = new URLSearchParams(params);
      const res = await fetch(gateway, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      });
      const text = await res.text();
      let json: { errcode?: number; url?: string; url_qrcode?: string; message?: string };
      try {
        json = JSON.parse(text) as typeof json;
      } catch {
        throw new Error(`xunhupay invalid response: ${text.slice(0, 200)}`);
      }
      if (json.errcode !== 0 || !json.url) {
        throw new Error(
          `xunhupay create failed: ${json.message ?? text.slice(0, 200)}`,
        );
      }
      return { payUrl: json.url };
    },

    async verifyAndParseWebhook(
      _req: Request,
      rawBody: string,
    ): Promise<WebhookParseResult> {
      const params = Object.fromEntries(new URLSearchParams(rawBody));
      const hash = params.hash;
      if (!hash) return { ok: false, error: "missing_hash" };
      const check = { ...params };
      delete check.hash;
      const expected = await md5Sign(check, env.appSecret);
      if (expected.toLowerCase() !== hash.toLowerCase()) {
        return { ok: false, error: "bad_hash" };
      }
      const status = params.status;
      if (status !== "OD" && status !== "CD") {
        // OD=paid, CD=completed — treat others as not paid yet
        return { ok: false, error: `status_${status ?? "unknown"}` };
      }
      const orderId = params.trade_order_id;
      if (!orderId) return { ok: false, error: "missing_order" };
      return {
        ok: true,
        orderId,
        providerTradeNo: params.transaction_id ?? params.open_order_id ?? null,
        paid: true,
        raw: rawBody,
      };
    },

    successResponse() {
      return "success";
    },
  };
}

async function md5Sign(
  params: Record<string, string>,
  appSecret: string,
): Promise<string> {
  const keys = Object.keys(params)
    .filter((k) => params[k] !== "" && params[k] != null)
    .sort();
  const base =
    keys.map((k) => `${k}=${params[k]}`).join("&") + appSecret;
  return md5Hex(base);
}

async function md5Hex(input: string): Promise<string> {
  return createHash("md5").update(input, "utf8").digest("hex");
}
