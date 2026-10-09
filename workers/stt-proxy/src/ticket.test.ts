import { describe, expect, it } from "vitest";
import { mintSttTicket } from "../../../src/lib/stt-ticket";
import { resolveTicketSecret, verifySttTicket } from "./ticket";

describe("worker stt ticket", () => {
  const secret = "test-secret-please-change";

  it("accepts a ticket minted by src/lib/stt-ticket", async () => {
    const { ticket, expiresAt } = mintSttTicket(secret, 1_000_000);
    expect(expiresAt).toBe(1_120_000);
    expect(await verifySttTicket(secret, ticket, 1_000_000 + 1_000)).toBe(true);
    expect(await verifySttTicket(secret, ticket, expiresAt)).toBe(true);
  });

  it("rejects expired, wrong secret, and malformed tickets", async () => {
    const { ticket } = mintSttTicket(secret, 1_000_000);
    expect(await verifySttTicket(secret, ticket, 1_000_000 + 121_000)).toBe(
      false
    );
    expect(await verifySttTicket("other", ticket, 1_000_000)).toBe(false);
    expect(await verifySttTicket(secret, "bad", 1_000_000)).toBe(false);
    expect(await verifySttTicket(secret, "100.abcd", 1_000_000)).toBe(false);
  });

  it("resolves STT_TICKET_SECRET before AUTH_SECRET", () => {
    expect(
      resolveTicketSecret({
        STT_TICKET_SECRET: " ticket ",
        AUTH_SECRET: "auth",
      })
    ).toBe("ticket");
    expect(resolveTicketSecret({ AUTH_SECRET: " auth " })).toBe("auth");
    expect(resolveTicketSecret({})).toBeNull();
  });
});
