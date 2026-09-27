import type { MemoryPage } from "@/lib/memory";
import { toDayKey } from "@/lib/dates";
import { hybridRetrieve } from "@/lib/recall";

export function filterHistoryPages(
  pages: MemoryPage[],
  opts: { dayKey: string | null; query: string }
): MemoryPage[] {
  const q = opts.query.trim().toLowerCase();
  return pages.filter((p) => {
    if (opts.dayKey && toDayKey(p.createdAt) !== opts.dayKey) return false;
    if (!q) return true;
    const hay = `${p.transcription} ${p.reply}`.toLowerCase();
    return hay.includes(q);
  });
}

/**
 * History list filter: day ∩ hybrid retrieve (no LLM).
 * Empty query → calendar/day filter only (newest-first order preserved by caller).
 */
export async function filterHistoryPagesHybrid(
  pages: MemoryPage[],
  opts: { dayKey: string | null; query: string }
): Promise<MemoryPage[]> {
  const q = opts.query.trim();
  if (!q) {
    return filterHistoryPages(pages, { dayKey: opts.dayKey, query: "" });
  }

  // Chronological order so lexical recency bonus matches ink recall
  const chronological = [...pages].sort((a, b) => a.createdAt - b.createdAt);
  const scored = await hybridRetrieve(q, chronological, {
    waitForEmbed: false,
  });
  let result = scored.map((s) => s.page);
  if (opts.dayKey) {
    result = result.filter((p) => toDayKey(p.createdAt) === opts.dayKey);
  }
  return result;
}
