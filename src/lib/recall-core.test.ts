import { describe, expect, it } from "vitest";
import { fuseHybrid, findMemoriesByQuery, fuseScored } from "@/lib/recall-core";
import type { MemoryPage } from "@/lib/memory";

const pages: MemoryPage[] = [
  {
    id: "1",
    createdAt: 1,
    transcription: "春天的樱花",
    reply: "很美",
  },
  {
    id: "2",
    createdAt: 2,
    transcription: "冬天的雪",
    reply: "很冷",
  },
];

describe("recall-core", () => {
  it("finds lexical matches", () => {
    const scored = findMemoriesByQuery("樱花", pages, 2);
    expect(scored[0]?.page.id).toBe("1");
  });

  it("fuses without vectors as lexical-only", () => {
    const fused = fuseHybrid("樱花", pages, null, new Map());
    expect(fused.length).toBeGreaterThan(0);
    expect(fused[0]?.page.id).toBe("1");
  });

  it("fuseScored includes vector-only hits", () => {
    const lexical = findMemoriesByQuery("樱花", pages, 2);
    const fused = fuseScored(lexical, [
      { page: pages[1]!, score: 0.95 },
      { page: pages[0]!, score: 0.4 },
    ]);
    expect(fused.some((x) => x.page.id === "1")).toBe(true);
    expect(fused.some((x) => x.page.id === "2")).toBe(true);
  });
});
