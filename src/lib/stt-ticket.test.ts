import { describe, expect, it } from "vitest";
import { mintSttTicket, verifySttTicket } from "./stt-ticket";

describe("stt-ticket", () => {
  const secret = "test-secret-please-change";

  it("mints a verifiable ticket", () => {
    const { ticket, expiresAt } = mintSttTicket(secret, 1_000_000);
    expect(expiresAt).toBe(1_000_000 + 120_000);
    expect(verifySttTicket(secret, ticket, 1_000_000 + 1_000)).toBe(true);
  });

  it("rejects expired and wrong secret", () => {
    const { ticket } = mintSttTicket(secret, 1_000_000);
    expect(verifySttTicket(secret, ticket, 1_000_000 + 121_000)).toBe(false);
    expect(verifySttTicket("other", ticket, 1_000_000)).toBe(false);
    expect(verifySttTicket(secret, "bad", 1_000_000)).toBe(false);
  });
});
