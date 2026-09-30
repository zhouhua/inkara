import { describe, expect, it } from "vitest";
import {
  maskApiKey,
  validateByokDraft,
  validateByokFields,
} from "@/lib/byok";

describe("validateByokFields", () => {
  it("requires api key", () => {
    expect(validateByokFields({ apiKey: "  ", baseUrl: "" })).toEqual({
      apiKey: "byokKeyRequired",
    });
  });

  it("rejects non-http(s) urls", () => {
    expect(
      validateByokFields({ apiKey: "sk-test", baseUrl: "ftp://example.com" })
    ).toEqual({ baseUrl: "byokUrlInvalid" });
  });

  it("rejects malformed urls", () => {
    expect(
      validateByokFields({ apiKey: "sk-test", baseUrl: "not a url" })
    ).toEqual({ baseUrl: "byokUrlInvalid" });
  });

  it("accepts empty base url and valid https", () => {
    expect(validateByokFields({ apiKey: "sk-test", baseUrl: "" })).toEqual({});
    expect(
      validateByokFields({
        apiKey: "sk-test",
        baseUrl: "https://api.example.com/v1",
      })
    ).toEqual({});
  });
});

describe("validateByokDraft", () => {
  it("allows all-empty as clear", () => {
    expect(
      validateByokDraft({ apiKey: "", baseUrl: "  ", model: "" })
    ).toEqual({});
  });

  it("requires key when other fields are set", () => {
    expect(
      validateByokDraft({ apiKey: "", baseUrl: "", model: "gpt-4o" })
    ).toEqual({ apiKey: "byokKeyRequired" });
  });
});

describe("maskApiKey", () => {
  it("masks long keys", () => {
    expect(maskApiKey("sk-abcdefghijklmnop")).toBe("sk-a…mnop");
  });

  it("returns empty for blank", () => {
    expect(maskApiKey("  ")).toBe("");
  });
});
