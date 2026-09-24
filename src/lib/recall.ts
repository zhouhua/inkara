import type { MemoryPage } from "@/lib/memory";
import { loadMemory } from "@/lib/memory";

export type ScoredMemory = { page: MemoryPage; score: number };

export type RecallResolution =
  | { kind: "miss" }
  | { kind: "single"; page: MemoryPage }
  | { kind: "multi"; pages: MemoryPage[] };

const MIN_SCORE = 3;
const MAX_CANDIDATES = 5;

function scorePage(queryNorm: string, page: MemoryPage, index: number, total: number): number {
  const hay = normalize(`${page.transcription} ${page.reply}`);
  if (!hay) return 0;

  let score = 0;
  if (hay.includes(queryNorm) || queryNorm.includes(hay)) score += 12;

  const qTokens = tokens(queryNorm);
  const hTokens = new Set(tokens(hay));
  for (const t of qTokens) {
    if (t.length < 2) continue;
    if (hTokens.has(t)) score += t.length >= 4 ? 4 : 2;
    else if ([...hTokens].some((h) => h.includes(t) || t.includes(h))) score += 1;
  }

  // Prefer more recent on ties
  score += Math.min(2, index / Math.max(1, total));
  return score;
}

/** All pages with score >= MIN_SCORE, best first. */
export function findMemoriesByQuery(
  query: string,
  pages: MemoryPage[] = loadMemory()
): ScoredMemory[] {
  const q = normalize(query);
  if (!q || pages.length === 0) return [];

  const scored: ScoredMemory[] = [];
  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    const score = scorePage(q, page, i, pages.length);
    if (score >= MIN_SCORE) scored.push({ page, score });
  }

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return b.page.createdAt - a.page.createdAt;
  });
  return scored;
}

export function resolveRecallHits(
  query: string,
  pages: MemoryPage[] = loadMemory()
): RecallResolution {
  const ranked = findMemoriesByQuery(query, pages);
  if (ranked.length === 0) return { kind: "miss" };
  if (ranked.length === 1) return { kind: "single", page: ranked[0].page };

  const [a, b] = ranked;
  const multi = b.score >= a.score * 0.7 || b.score >= a.score - 2;
  if (!multi) return { kind: "single", page: a.page };
  return {
    kind: "multi",
    pages: ranked.slice(0, MAX_CANDIDATES).map((x) => x.page),
  };
}

/** Loose token overlap + substring scoring to find a remembered page. */
export function findMemoryByQuery(
  query: string,
  pages: MemoryPage[] = loadMemory()
): MemoryPage | null {
  const r = resolveRecallHits(query, pages);
  if (r.kind === "single") return r.page;
  if (r.kind === "multi") return r.pages[0] ?? null;
  return null;
}

/** Heuristic: does this writing look like a recall request? */
export function looksLikeRecall(text: string): boolean {
  const s = text.trim();
  if (!s) return false;
  return (
    /找(到|一?下|出)?|那[一]?页|记(得|起|住)|翻出|上一页|上次|那天|关于.+的|show\s+me|what\s+did\s+i|remember|recall|find\s+(the\s+)?page|pages?\s+about/i.test(
      s
    )
  );
}

/** Pull a search needle from a recall-style sentence. */
export function extractRecallNeedle(text: string): string {
  const s = text.trim();
  const patterns = [
    /(?:找|翻出|记起|记得|关于)(?:一下|到)?[「「"']?(.+?)[」」"']?(?:那[一]?页|的页|的事)?$/,
    /show\s+me\s+(?:the\s+page\s+)?(?:about\s+)?(.+)/i,
    /(?:find|recall)\s+(?:the\s+page\s+)?(?:about\s+)?(.+)/i,
    /pages?\s+about\s+(.+)/i,
  ];
  for (const re of patterns) {
    const m = s.match(re);
    if (m?.[1]) return m[1].trim();
  }
  return (
    s
      .replace(
        /请|帮我|一下|那一?页|找|翻出|记起|记得|关于|的事|show me|the page|about|find|recall/gi,
        " "
      )
      .replace(/\s+/g, " ")
      .trim() || s
  );
}

function normalize(s: string) {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(s: string): string[] {
  const out: string[] = [];
  const parts = s.split(/\s+/).filter(Boolean);
  for (const p of parts) {
    if (/[\u4e00-\u9fff]/.test(p)) {
      if (p.length === 1) out.push(p);
      else {
        for (let i = 0; i < p.length - 1; i++) out.push(p.slice(i, i + 2));
        if (p.length >= 3) out.push(p);
      }
    } else {
      out.push(p);
    }
  }
  return out;
}
