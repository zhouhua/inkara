import { describe, expect, it } from "vitest";
import { resolvePaperError, resolveRecallMissError } from "@/lib/ask-errors";

describe("resolvePaperError", () => {
  it("maps offline to retry", () => {
    expect(resolvePaperError({ offline: true })).toEqual({
      messageKey: "offline",
      action: "retry",
    });
  });

  it("maps quota and missing key to open_settings", () => {
    expect(resolvePaperError({ error: "quota_exceeded" }).action).toBe(
      "open_settings"
    );
    expect(resolvePaperError({ error: "missing_api_key" })).toEqual({
      messageKey: "missingKey",
      action: "open_settings",
    });
    expect(resolvePaperError({ error: "unauthorized" }).messageKey).toBe(
      "unauthorizedKey"
    );
  });

  it("maps network-ish errors to retry", () => {
    expect(resolvePaperError({ error: "network" })).toEqual({
      messageKey: "networkError",
      action: "retry",
    });
    expect(resolvePaperError({ error: "upstream_error" }).action).toBe("retry");
    expect(resolvePaperError({ error: "unknown_code" })).toEqual({
      messageKey: "upstreamBusy",
      action: "retry",
    });
  });
});

describe("resolveRecallMissError", () => {
  it("returns dismissable miss copy", () => {
    expect(resolveRecallMissError()).toEqual({
      messageKey: "recallMiss",
      action: "dismiss",
    });
  });
});
