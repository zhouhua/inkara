import { describe, expect, it } from "vitest";
import { mintLoginTicket, verifyLoginTicket } from "./login-ticket";

describe("login ticket", () => {
  it("round-trips user id", () => {
    process.env.AUTH_SECRET = "ticket-secret";
    const ticket = mintLoginTicket("user-1");
    expect(verifyLoginTicket(ticket)).toBe("user-1");
  });

  it("rejects tampered ticket", () => {
    process.env.AUTH_SECRET = "ticket-secret";
    const ticket = mintLoginTicket("user-1");
    expect(verifyLoginTicket(`${ticket}x`)).toBeNull();
  });
});
