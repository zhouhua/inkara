import { describe, expect, it } from "vitest";
import {
  beginVoiceSession,
  setVoiceSessionText,
  voiceSessionFull,
} from "./voice-span";

describe("voice-span", () => {
  it("beginVoiceSession clamps caret and splits prefix/suffix", () => {
    const s = beginVoiceSession("你好", 99);
    expect(s).toEqual({ prefix: "你好", suffix: "", text: "" });
  });

  it("only replaces the voice middle", () => {
    let s = beginVoiceSession("前缀后缀", 2);
    expect(s).toEqual({ prefix: "前缀", suffix: "后缀", text: "" });
    s = setVoiceSessionText(s, "中");
    expect(voiceSessionFull(s)).toBe("前缀中后缀");
    s = setVoiceSessionText(s, "中间话");
    expect(voiceSessionFull(s)).toBe("前缀中间话后缀");
  });

  it("empty document becomes the voice text", () => {
    let s = beginVoiceSession("", 0);
    s = setVoiceSessionText(s, "整段");
    expect(voiceSessionFull(s)).toBe("整段");
  });
});
