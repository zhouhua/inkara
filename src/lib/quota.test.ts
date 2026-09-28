import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  getCachedQuota: vi.fn(() => ({ date: "2099-01-01", count: 0 })),
  hydrateDb: vi.fn(async () => undefined),
  isDbHydrated: vi.fn(() => true),
  writeQuota: vi.fn(async () => undefined),
}));

vi.mock("@/lib/settings", async () => {
  const actual = await vi.importActual<typeof import("@/lib/settings")>(
    "@/lib/settings"
  );
  return {
    ...actual,
    hasUserApiKey: vi.fn((s: { apiKey: string }) => Boolean(s.apiKey?.trim())),
  };
});

import { getCachedQuota, isDbHydrated, writeQuota } from "@/lib/db";
import {
  FREE_DAILY_LIMIT,
  canUseFreeAsk,
  getFreeAskCount,
  isProductionEnv,
  recordFreeAsk,
  usesFreeQuota,
} from "@/lib/quota";
import { defaultSettings } from "@/lib/settings";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
  vi.mocked(isDbHydrated).mockReturnValue(true);
});

describe("quota helpers", () => {
  it("exposes free daily limit", () => {
    expect(FREE_DAILY_LIMIT).toBe(2);
  });

  it("detects production env", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(isProductionEnv()).toBe(true);
    vi.stubEnv("NODE_ENV", "development");
    expect(isProductionEnv()).toBe(false);
  });

  it("uses free quota only in production without user key", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(usesFreeQuota({ ...defaultSettings, apiKey: "" })).toBe(true);
    expect(usesFreeQuota({ ...defaultSettings, apiKey: "sk" })).toBe(false);
    vi.stubEnv("NODE_ENV", "development");
    expect(usesFreeQuota({ ...defaultSettings, apiKey: "" })).toBe(false);
  });

  it("denies free asks until db hydrated", () => {
    vi.mocked(isDbHydrated).mockReturnValue(false);
    expect(canUseFreeAsk()).toBe(false);
    expect(getFreeAskCount()).toBe(0);
  });

  it("allows free asks under daily limit", () => {
    const today = new Date();
    const key = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    vi.mocked(getCachedQuota).mockReturnValue({ date: key, count: 1 });
    expect(canUseFreeAsk()).toBe(true);
    expect(getFreeAskCount()).toBe(1);

    vi.mocked(getCachedQuota).mockReturnValue({ date: key, count: 2 });
    expect(canUseFreeAsk()).toBe(false);
  });

  it("records free ask increment", async () => {
    const today = new Date();
    const key = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    vi.mocked(getCachedQuota).mockReturnValue({ date: key, count: 0 });
    await recordFreeAsk();
    expect(writeQuota).toHaveBeenCalledWith({ date: key, count: 1 });
  });
});
