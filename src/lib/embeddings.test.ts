import { describe, expect, it } from "vitest";
import { cosineSimilarity, pageEmbedText } from "@/lib/embeddings";

describe("cosineSimilarity", () => {
  it("returns 1 for identical vectors and 0 for empty", () => {
    expect(cosineSimilarity([1, 0], [1, 0])).toBeCloseTo(1);
    expect(cosineSimilarity([], [1])).toBe(0);
  });
});

describe("pageEmbedText", () => {
  it("joins transcription and reply", () => {
    expect(pageEmbedText("hello", "world")).toBe("hello\nworld");
  });
});
