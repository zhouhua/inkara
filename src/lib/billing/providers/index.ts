import { createAlipayProvider, loadAlipayEnvFromProcess } from "./alipay";
import { createMockPaymentProvider } from "./mock";
import type { PaymentChannel, PaymentProvider } from "./types";
import {
  createWechatPayProvider,
  loadWechatPayEnvFromProcess,
} from "./wechat";

export function isPaymentChannel(value: string): value is PaymentChannel {
  return value === "wechat" || value === "alipay" || value === "mock";
}

/**
 * Resolve official channel provider. Aggregators are not supported.
 * `mock` is local-only when PAY_ALLOW_MOCK=1 or NODE_ENV=development.
 */
export function getPaymentProvider(channel: PaymentChannel): PaymentProvider {
  if (channel === "mock") {
    assertMockAllowed();
    return createMockPaymentProvider({
      baseUrl: process.env.NEXT_PUBLIC_APP_URL,
    });
  }
  if (channel === "wechat") {
    const env = loadWechatPayEnvFromProcess();
    if (!env) {
      throw new Error(
        "WeChat Pay env missing: WECHAT_PAY_APP_ID / MCH_ID / SERIAL / PRIVATE_KEY / API_V3_KEY",
      );
    }
    return createWechatPayProvider(env);
  }
  if (channel === "alipay") {
    const env = loadAlipayEnvFromProcess();
    if (!env) {
      throw new Error(
        "Alipay env missing: ALIPAY_APP_ID / PRIVATE_KEY / PUBLIC_KEY",
      );
    }
    return createAlipayProvider(env);
  }
  throw new Error(`unsupported channel: ${channel}`);
}

function assertMockAllowed() {
  const allow =
    process.env.PAY_ALLOW_MOCK === "1" ||
    process.env.NODE_ENV === "development";
  if (!allow) {
    throw new Error("mock pay disabled outside development (set PAY_ALLOW_MOCK=1)");
  }
}
