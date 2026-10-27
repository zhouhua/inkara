import { describe, expect, it } from "vitest";
import { isAdminEmail, parseAdminEmails } from "./user-fields";

describe("admin emails", () => {
  it("parses CSV", () => {
    expect([...parseAdminEmails("a@x.com, B@Y.com ")]).toEqual([
      "a@x.com",
      "b@y.com",
    ]);
  });

  it("matches case-insensitively", () => {
    const set = parseAdminEmails("Ops@inkara.app");
    expect(isAdminEmail("ops@inkara.app", set)).toBe(true);
    expect(isAdminEmail("other@inkara.app", set)).toBe(false);
  });
});
