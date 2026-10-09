import { describe, expect, it } from "vitest";
import {
  buildSttPolishSystemPrompt,
  sanitizePolishOutput,
} from "./stt-polish";

describe("stt-polish", () => {
  it("zh system mentions 语气词 and 只输出正文", () => {
    const s = buildSttPolishSystemPrompt("zh");
    expect(s).toContain("语气词");
    expect(s).toContain("只输出");
  });

  it("sanitize strips fences and quotes", () => {
    expect(sanitizePolishOutput('  "你好"  ')).toBe("你好");
    expect(sanitizePolishOutput("```\n你好\n```")).toBe("你好");
  });
});
