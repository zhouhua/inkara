import { describe, expect, it } from "vitest";
import { localeFromAcceptLanguage, parseLocale, t } from "./i18n";

describe("localeFromAcceptLanguage", () => {
  it("prefers the first supported tag", () => {
    expect(localeFromAcceptLanguage("en-US,zh-CN;q=0.8")).toBe("en");
    expect(localeFromAcceptLanguage("zh-Hans,en;q=0.5")).toBe("zh");
    expect(localeFromAcceptLanguage("fr,de")).toBe("zh");
    expect(localeFromAcceptLanguage(null)).toBe("zh");
  });
});

describe("parseLocale", () => {
  it("accepts only zh and en", () => {
    expect(parseLocale("en")).toBe("en");
    expect(parseLocale("zh")).toBe("zh");
    expect(parseLocale("en-US")).toBeNull();
  });
});

describe("t", () => {
  it("fills placeholders and falls back to Chinese", () => {
    expect(t("zh", "billingCreditsLine", { daily: 3, purchased: 10 })).toBe(
      "今日还可写 3 次 · 已购还剩 10 次",
    );
    expect(t("en", "pageQuiet")).toBe(
      "That one didn't land. Write another line — a reply usually follows.",
    );
    expect(t("en", "settings")).toBe("Settings");
  });
});
