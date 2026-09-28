import { describe, expect, it } from "vitest";
import type { MemoryPage } from "@/lib/memory";
import {
  extractRecallNeedle,
  findMemoriesByQuery,
  looksLikeRecall,
  resolveRecallHitsFromRanked,
  resolveRecallHitsFromScored,
} from "@/lib/recall";

function page(
  partial: Partial<MemoryPage> & Pick<MemoryPage, "id" | "transcription">
): MemoryPage {
  return {
    reply: "",
    createdAt: partial.createdAt ?? 1,
    ...partial,
  };
}

describe("looksLikeRecall", () => {
  it("detects zh and en recall phrasing", () => {
    expect(looksLikeRecall("找失眠那页")).toBe(true);
    expect(looksLikeRecall("remember the page about rain")).toBe(true);
    expect(looksLikeRecall("今天天气真好")).toBe(false);
  });
});

describe("extractRecallNeedle", () => {
  it("pulls needle from recall sentence", () => {
    expect(extractRecallNeedle("找失眠那页")).toContain("失眠");
    expect(extractRecallNeedle("find the page about rain")).toMatch(/rain/i);
  });
});

describe("findMemoriesByQuery", () => {
  const pages = [
    page({
      id: "1",
      transcription: "夜里失眠想到很多事",
      reply: "慢慢写就好",
      createdAt: 100,
    }),
    page({
      id: "2",
      transcription: "午后晒太阳",
      reply: "暖一点",
      createdAt: 200,
    }),
  ];

  it("ranks lexical hits and ignores weak matches", () => {
    const hits = findMemoriesByQuery("失眠", pages);
    expect(hits[0]?.page.id).toBe("1");
    expect(findMemoriesByQuery("完全无关的词xyz", pages)).toEqual([]);
  });
});

describe("resolveRecallHitsFromScored", () => {
  it("returns miss / single / multi by score gap", () => {
    expect(resolveRecallHitsFromScored([])).toEqual({ kind: "miss" });
    expect(
      resolveRecallHitsFromScored([
        { page: page({ id: "a", transcription: "a" }), score: 10 },
      ])
    ).toEqual({
      kind: "single",
      page: expect.objectContaining({ id: "a" }),
    });

    const multi = resolveRecallHitsFromScored([
      { page: page({ id: "a", transcription: "a" }), score: 10 },
      { page: page({ id: "b", transcription: "b" }), score: 9 },
    ]);
    expect(multi.kind).toBe("multi");
  });
});

describe("resolveRecallHitsFromRanked", () => {
  const candidates = [
    page({ id: "a", transcription: "a" }),
    page({ id: "b", transcription: "b" }),
  ];

  it("collapses to single when confidence is high", () => {
    const resolved = resolveRecallHitsFromRanked(
      ["b", "a"],
      candidates,
      "high"
    );
    expect(resolved).toEqual({
      kind: "single",
      page: expect.objectContaining({ id: "b" }),
    });
  });

  it("keeps multi when confidence is low", () => {
    const resolved = resolveRecallHitsFromRanked(
      ["b", "a"],
      candidates,
      "low"
    );
    expect(resolved.kind).toBe("multi");
    if (resolved.kind === "multi") {
      expect(resolved.pages.map((p) => p.id)).toEqual(["b", "a"]);
    }
  });
});
