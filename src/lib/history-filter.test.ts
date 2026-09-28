import { describe, expect, it, vi } from "vitest";
import type { MemoryPage } from "@/lib/memory";
import { filterHistoryPages } from "@/lib/history-filter";

vi.mock("@/lib/recall", () => ({
  hybridRetrieve: vi.fn(async () => []),
}));

function page(
  partial: Partial<MemoryPage> & Pick<MemoryPage, "id" | "transcription">
): MemoryPage {
  return {
    reply: "",
    createdAt: partial.createdAt ?? Date.UTC(2026, 0, 1),
    ...partial,
  };
}

describe("filterHistoryPages", () => {
  const pages = [
    page({
      id: "1",
      transcription: "失眠笔记",
      reply: "慢慢来",
      createdAt: Date.UTC(2026, 0, 1, 12),
    }),
    page({
      id: "2",
      transcription: "午后散步",
      reply: "阳光",
      createdAt: Date.UTC(2026, 0, 2, 12),
    }),
  ];

  it("filters by day key and query substring", () => {
    expect(
      filterHistoryPages(pages, { dayKey: "2026-01-01", query: "" }).map(
        (p) => p.id
      )
    ).toEqual(["1"]);
    expect(
      filterHistoryPages(pages, { dayKey: null, query: "散步" }).map(
        (p) => p.id
      )
    ).toEqual(["2"]);
    expect(
      filterHistoryPages(pages, { dayKey: "2026-01-01", query: "散步" })
    ).toEqual([]);
  });
});
