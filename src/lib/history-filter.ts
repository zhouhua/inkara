import type { MemoryPage } from "@/lib/memory";
import { toDayKey } from "@/lib/dates";

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
