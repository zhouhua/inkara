import { createMockPaymentProvider } from "./mock";
import { createXunhuPaymentProvider } from "./xunhupay";
import type { PaymentProvider } from "./types";

export function getPaymentProvider(): PaymentProvider {
  const kind = (process.env.PAY_PROVIDER ?? "mock").toLowerCase();
  if (kind === "xunhupay" || kind === "xunhu") {
    const appId = process.env.PAY_XH_APPID ?? "";
    const appSecret = process.env.PAY_XH_APPSECRET ?? "";
    if (!appId || !appSecret) {
      throw new Error("PAY_XH_APPID / PAY_XH_APPSECRET required for xunhupay");
    }
    return createXunhuPaymentProvider({
      appId,
      appSecret,
      gateway: process.env.PAY_XH_GATEWAY,
    });
  }
  return createMockPaymentProvider({
    baseUrl: process.env.NEXT_PUBLIC_APP_URL,
  });
}
