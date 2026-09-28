import { describe, expect, it } from "vitest";
import { collectDockHints } from "@/lib/dock-hints";
import { firstRunDockHint } from "@/lib/first-run-hint";

const base = {
  locale: "zh" as const,
  phase: "ready",
  statusExtra: null as string | null,
  embedLoading: false,
  embedProgress: 0,
  hasCommittedOnce: true,
  submitMode: "manual" as const,
  inputMode: "type" as const,
  contentPresent: false,
  idleArmed: false,
  manualSubmitHint: "双击或 Enter 提交",
};

describe("firstRunDockHint", () => {
  it("covers auto and manual first-run copy", () => {
    expect(
      firstRunDockHint({
        locale: "zh",
        submitMode: "auto",
        inputMode: "pen",
        contentPresent: false,
      })
    ).toBeTruthy();
    expect(
      firstRunDockHint({
        locale: "zh",
        submitMode: "manual",
        inputMode: "type",
        contentPresent: false,
      })
    ).toContain("·");
  });
});

describe("collectDockHints", () => {
  it("surfaces statusExtra as exclusive error", () => {
    const hints = collectDockHints({
      ...base,
      statusExtra: "网络不通",
    });
    expect(hints).toEqual([
      { id: "status-extra", text: "网络不通", kind: "error" },
    ]);
  });

  it("shows thinking wait tip", () => {
    const hints = collectDockHints({ ...base, phase: "thinking" });
    expect(hints.some((h) => h.id === "wait-thinking")).toBe(true);
  });

  it("shows manual action tip after first commit", () => {
    const hints = collectDockHints({
      ...base,
      contentPresent: true,
    });
    expect(hints.some((h) => h.id === "action")).toBe(true);
  });
});
