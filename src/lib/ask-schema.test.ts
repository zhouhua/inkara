import { describe, expect, it } from "vitest";
import { askObjectSchema } from "@/lib/ask-schema";
import { recallRankSchema } from "@/lib/recall-rank-schema";

describe("askObjectSchema", () => {
  it("accepts a valid answer object", () => {
    const parsed = askObjectSchema.parse({
      transcription: "今天天气不错",
      reply: "嗯，纸上也觉得轻松。",
      intent: "answer",
      recallQuery: "",
    });
    expect(parsed.intent).toBe("answer");
  });

  it("rejects invalid intent", () => {
    expect(() =>
      askObjectSchema.parse({
        transcription: "x",
        reply: "y",
        intent: "search",
        recallQuery: "",
      })
    ).toThrow();
  });
});

describe("recallRankSchema", () => {
  it("accepts ranked ids and confidence", () => {
    const parsed = recallRankSchema.parse({
      rankedIds: ["a", "b"],
      confidence: "high",
    });
    expect(parsed.rankedIds).toEqual(["a", "b"]);
  });

  it("rejects unknown confidence", () => {
    expect(() =>
      recallRankSchema.parse({ rankedIds: [], confidence: "medium" })
    ).toThrow();
  });
});
