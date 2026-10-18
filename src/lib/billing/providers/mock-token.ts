import { createHmac, timingSafeEqual } from "node:crypto";

/** HMAC token bound to orderId for mock-pay GET. */
export function mockPayToken(orderId: string, secret: string): string {
  return createHmac("sha256", secret)
    .update(`mock-pay:${orderId}`)
    .digest("hex")
    .slice(0, 32);
}

export function verifyMockPayToken(
  orderId: string,
  token: string,
  secret: string,
): boolean {
  const expected = mockPayToken(orderId, secret);
  try {
    return timingSafeEqual(Buffer.from(token), Buffer.from(expected));
  } catch {
    return false;
  }
}

export function mockPaySecret(): string {
  return process.env.PAY_MOCK_SECRET ?? "inkara-mock-pay";
}

export function mockPayAllowed(): boolean {
  return (
    process.env.PAY_ALLOW_MOCK === "1" || process.env.NODE_ENV === "development"
  );
}
