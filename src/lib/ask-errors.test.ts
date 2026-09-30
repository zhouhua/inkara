import { describe, expect, it } from "vitest";
import { resolvePaperError, resolveRecallMissError } from "@/lib/ask-errors";

describe("resolvePaperError", () => {
  it("maps offline to retry", () => {
    expect(resolvePaperError({ offline: true })).toEqual({
      messageKey: "offline",
      action: "retry",
    });
  });

  it("maps quota exhaustion to open_billing", () => {
    expect(resolvePaperError({ error: "quota_exceeded" }).action).toBe(
      "open_billing",
    );
    expect(resolvePaperError({ error: "quota_exhausted" })).toEqual({
      messageKey: "quotaExceeded",
      action: "open_billing",
    });
    expect(resolvePaperError({ error: "login_required" }).action).toBe(
      "open_billing",
    );
  });

  it("maps missing platform key to retry", () => {
    expect(resolvePaperError({ error: "missing_api_key" }).action).toBe(
      "retry",
    );
    expect(resolvePaperError({ error: "unauthorized" }).action).toBe("retry");
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
