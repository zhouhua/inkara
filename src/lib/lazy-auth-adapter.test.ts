import { describe, expect, it } from "vitest";
import { lazyInkAuthAdapter } from "./lazy-auth-adapter";

describe("lazyInkAuthAdapter", () => {
  it("exposes email-provider methods via `in` (Auth.js assert)", () => {
    const adapter = lazyInkAuthAdapter();
    for (const method of [
      "createVerificationToken",
      "useVerificationToken",
      "getUserByEmail",
    ] as const) {
      expect(method in adapter).toBe(true);
      expect(typeof adapter[method]).toBe("function");
    }
  });
});
