import { describe, expect, it } from "vitest";
import { lazyInkAuthAdapter } from "./lazy-auth-adapter";

describe("lazyInkAuthAdapter", () => {
  it("exposes email methods for Auth.js assert + Object.keys wrap", () => {
    const adapter = lazyInkAuthAdapter();
    const keys = Object.keys(adapter);
    for (const method of [
      "createVerificationToken",
      "useVerificationToken",
      "getUserByEmail",
    ] as const) {
      expect(method in adapter).toBe(true);
      expect(keys).toContain(method);
      expect(typeof adapter[method]).toBe("function");
    }
  });
});
