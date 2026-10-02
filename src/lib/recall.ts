import type { MemoryPage } from "@/lib/memory";
import { loadMemory } from "@/lib/memory";
import {
  extractRecallNeedle,
  findMemoriesByQuery,
  fuseHybrid,
  looksLikeRecall,
  resolveRecallHitsFromRanked,
  resolveRecallHitsFromScored,
  type RecallResolution,
  type ScoredMemory,
} from "@/lib/recall-core";

export type { RecallResolution, ScoredMemory };
export {
  extractRecallNeedle,
  findMemoriesByQuery,
  looksLikeRecall,
  resolveRecallHitsFromRanked,
  resolveRecallHitsFromScored,
};

export function resolveRecallHits(
  query: string,
  pages: MemoryPage[] = loadMemory(),
): RecallResolution {
  return resolveRecallHitsFromScored(findMemoriesByQuery(query, pages));
}

export function findMemoryByQuery(
  query: string,
  pages: MemoryPage[] = loadMemory(),
): MemoryPage | null {
  const r = resolveRecallHits(query, pages);
  if (r.kind === "single") return r.page;
  if (r.kind === "multi") return r.pages[0] ?? null;
  return null;
}

/**
 * Hybrid recall via server (/api/recall). Falls back to lexical-only
 * against the in-memory page cache when the API is unavailable.
 */
export async function hybridRetrieve(
  query: string,
  pages: MemoryPage[] = loadMemory(),
  _opts?: { waitForEmbed?: boolean },
): Promise<ScoredMemory[]> {
  if (typeof window !== "undefined") {
    try {
      const res = await fetch("/api/recall", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });
      if (res.ok) {
        const data = (await res.json()) as {
          results?: { score: number; page: MemoryPage }[];
        };
        if (Array.isArray(data.results)) {
          return data.results.map((r) => ({ page: r.page, score: r.score }));
        }
      }
    } catch {
      /* fall through */
    }
  }
  return fuseHybrid(query, pages, null, new Map());
}
