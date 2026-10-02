import type {
  CreatePaymentInput,
  CreatePaymentResult,
  PaymentProvider,
  WebhookParseResult,
} from "./types";
import {
  aesGcmDecryptWechat,
  normalizePem,
  randomNonce,
  rsaSignSha256,
  rsaVerifySha256,
} from "./crypto-util";

export type WechatPayEnv = {
  appId: string;
  mchId: string;
  apiSerial: string;
  apiPrivateKey: string;
  apiV3Key: string;
  /** WeChat Pay platform / public key PEM for notify verification */
  platformPublicKey?: string;
};

/**
 * WeChat Pay APIv3 Native (扫码).
 * Docs: https://pay.weixin.qq.com/doc/v3/merchant/4012791877
 */
export function createWechatPayProvider(env: WechatPayEnv): PaymentProvider {
  return {
    id: "wechat",

    async createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
      const path = "/v3/pay/transactions/native";
      const bodyObj = {
        appid: env.appId,
        mchid: env.mchId,
        description: input.title.slice(0, 127),
        out_trade_no: input.orderId,
        notify_url: input.notifyUrl,
        amount: { total: input.amountFen, currency: "CNY" },
      };
      const body = JSON.stringify(bodyObj);
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const nonce = randomNonce(16);
      const message = `POST\n${path}\n${timestamp}\n${nonce}\n${body}\n`;
      const signature = rsaSignSha256(message, env.apiPrivateKey);
      const authorization = `WECHATPAY2-SHA256-RSA2048 mchid="${env.mchId}",nonce_str="${nonce}",timestamp="${timestamp}",serial_no="${env.apiSerial}",signature="${signature}"`;

      const res = await fetch(`https://api.mch.weixin.qq.com${path}`, {
        method: "POST",
        headers: {
          Authorization: authorization,
          Accept: "application/json",
          "Content-Type": "application/json",
          "User-Agent": "inkara-billing/1.0",
        },
        body,
      });
      const text = await res.text();
      if (!res.ok) {
        throw new Error(`wechat native failed: ${res.status} ${text.slice(0, 300)}`);
      }
      const json = JSON.parse(text) as { code_url?: string };
      if (!json.code_url) {
        throw new Error(`wechat native missing code_url: ${text.slice(0, 200)}`);
      }
      return { codeUrl: json.code_url, mode: "qrcode" };
    },

    async verifyAndParseWebhook(
      req: Request,
      rawBody: string,
    ): Promise<WebhookParseResult> {
      const timestamp = req.headers.get("Wechatpay-Timestamp") ?? "";
      const nonce = req.headers.get("Wechatpay-Nonce") ?? "";
      const signature = req.headers.get("Wechatpay-Signature") ?? "";
      if (!timestamp || !nonce || !signature) {
        return { ok: false, error: "missing_wechat_headers" };
      }

      if (env.platformPublicKey) {
        const message = `${timestamp}\n${nonce}\n${rawBody}\n`;
        const ok = rsaVerifySha256(message, signature, env.platformPublicKey);
        if (!ok) return { ok: false, error: "bad_wechat_signature" };
      }

      let envelope: {
        resource?: {
          ciphertext?: string;
          nonce?: string;
          associated_data?: string;
        };
      };
      try {
        envelope = JSON.parse(rawBody) as typeof envelope;
      } catch {
        return { ok: false, error: "invalid_json" };
      }
      const resource = envelope.resource;
      if (!resource?.ciphertext || !resource.nonce) {
        return { ok: false, error: "missing_resource" };
      }

      let plain: string;
      try {
        plain = aesGcmDecryptWechat(
          env.apiV3Key,
          resource.nonce,
          resource.associated_data ?? "",
          resource.ciphertext,
        );
      } catch {
        return { ok: false, error: "decrypt_failed" };
      }

      const tx = JSON.parse(plain) as {
        out_trade_no?: string;
        transaction_id?: string;
        trade_state?: string;
      };
      if (tx.trade_state && tx.trade_state !== "SUCCESS") {
        return { ok: false, error: `trade_state_${tx.trade_state}` };
      }
      if (!tx.out_trade_no) return { ok: false, error: "missing_order" };
      return {
        ok: true,
        orderId: tx.out_trade_no,
        providerTradeNo: tx.transaction_id ?? null,
        paid: true,
        raw: rawBody,
      };
    },

    successResponse() {
      return JSON.stringify({ code: "SUCCESS", message: "成功" });
    },
  };
}

export function loadWechatPayEnvFromProcess(): WechatPayEnv | null {
  const appId = process.env.WECHAT_PAY_APP_ID ?? "";
  const mchId = process.env.WECHAT_PAY_MCH_ID ?? "";
  const apiSerial = process.env.WECHAT_PAY_SERIAL ?? "";
  const apiPrivateKey = process.env.WECHAT_PAY_PRIVATE_KEY ?? "";
  const apiV3Key = process.env.WECHAT_PAY_API_V3_KEY ?? "";
  if (!appId || !mchId || !apiSerial || !apiPrivateKey || !apiV3Key) {
    return null;
  }
  return {
    appId,
    mchId,
    apiSerial,
    apiPrivateKey: normalizePem(apiPrivateKey),
    apiV3Key,
    platformPublicKey: process.env.WECHAT_PAY_PLATFORM_PUBLIC_KEY
      ? normalizePem(process.env.WECHAT_PAY_PLATFORM_PUBLIC_KEY)
      : undefined,
  };
}
