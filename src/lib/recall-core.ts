import type { MemoryPage } from "@/lib/memory";
import { cosineSimilarity } from "@/lib/ai/embed";

export type ScoredMemory = { page: MemoryPage; score: number };

export type RecallResolution =
  | { kind: "miss" }
  | { kind: "single"; page: MemoryPage }
  | { kind: "multi"; pages: MemoryPage[] };

const LEX_MIN_SCORE = 2;
const MIN_SCORE = 3;
const MAX_CANDIDATES = 5;
const HYBRID_TOP_K = 16;
const VECTOR_TOP_K = 16;
const VECTOR_MIN_SIM = 0.28;
const LEX_WEIGHT = 0.4;
const VEC_WEIGHT = 0.6;

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

function scorePage(
  queryNorm: string,
  page: MemoryPage,
  index: number,
  total: number,
): number {
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

  score += Math.min(2, index / Math.max(1, total));
  return score;
}

export function findMemoriesByQuery(
  query: string,
  pages: MemoryPage[],
  minScore = MIN_SCORE,
): ScoredMemory[] {
  const q = normalize(query);
  if (!q || pages.length === 0) return [];

  const scored: ScoredMemory[] = [];
  for (let i = 0; i < pages.length; i++) {
    const page = pages[i]!;
    const score = scorePage(q, page, i, pages.length);
    if (score >= minScore) scored.push({ page, score });
  }

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return b.page.createdAt - a.page.createdAt;
  });
  return scored;
}

export function findMemoriesByVector(
  queryVec: ArrayLike<number>,
  pages: MemoryPage[],
  embeddings: Map<string, ArrayLike<number>>,
  topK = VECTOR_TOP_K,
): ScoredMemory[] {
  if (!queryVec.length || pages.length === 0) return [];
  const scored: ScoredMemory[] = [];

  for (const page of pages) {
    const emb = embeddings.get(page.id);
    if (!emb?.length) continue;
    const sim = cosineSimilarity(queryVec, emb);
    if (sim < VECTOR_MIN_SIM) continue;
    scored.push({ page, score: sim });
  }

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return b.page.createdAt - a.page.createdAt;
  });
  return scored.slice(0, topK);
}

export function fuseHybrid(
  query: string,
  pages: MemoryPage[],
  queryVec: ArrayLike<number> | null,
  embeddings: Map<string, ArrayLike<number>>,
): ScoredMemory[] {
  const lexical = findMemoriesByQuery(query, pages, LEX_MIN_SCORE);
  const vector =
    queryVec && queryVec.length
      ? findMemoriesByVector(queryVec, pages, embeddings)
      : [];
  return fuseScored(lexical, vector);
}

/** Fuse precomputed lexical + vector hits (e.g. Vectorize matches). */
export function fuseScored(
  lexical: ScoredMemory[],
  vector: ScoredMemory[],
): ScoredMemory[] {
  if (lexical.length === 0 && vector.length === 0) return [];

  const lexMax = Math.max(1, ...lexical.map((x) => x.score));
  const vecMax = Math.max(VECTOR_MIN_SIM, ...vector.map((x) => x.score));

  const byId = new Map<
    string,
    { page: MemoryPage; lex: number; vec: number }
  >();

  for (const item of lexical) {
    byId.set(item.page.id, {
      page: item.page,
      lex: item.score / lexMax,
      vec: 0,
    });
  }
  for (const item of vector) {
    const prev = byId.get(item.page.id);
    const vecNorm = item.score / vecMax;
    if (prev) {
      prev.vec = Math.max(prev.vec, vecNorm);
    } else {
      byId.set(item.page.id, {
        page: item.page,
        lex: 0,
        vec: vecNorm,
      });
    }
  }

  const fused: ScoredMemory[] = [...byId.values()].map((row) => ({
    page: row.page,
    score: LEX_WEIGHT * row.lex + VEC_WEIGHT * row.vec,
  }));

  fused.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return b.page.createdAt - a.page.createdAt;
  });
  return fused.slice(0, HYBRID_TOP_K);
}

export function resolveRecallHitsFromScored(
  ranked: ScoredMemory[],
  scoreKind: "lexical" | "hybrid" = "lexical",
): RecallResolution {
  if (ranked.length === 0) return { kind: "miss" };
  if (ranked.length === 1) return { kind: "single", page: ranked[0]!.page };

  const a = ranked[0]!;
  const b = ranked[1]!;
  const multi =
    scoreKind === "hybrid"
      ? b.score >= a.score * 0.85 || a.score - b.score < 0.06
      : b.score >= a.score * 0.7 || b.score >= a.score - 2;
  if (!multi) return { kind: "single", page: a.page };
  return {
    kind: "multi",
    pages: ranked.slice(0, MAX_CANDIDATES).map((x) => x.page),
  };
}

export function resolveRecallHitsFromRanked(
  rankedIds: string[],
  candidates: MemoryPage[],
  confidence: "high" | "low" = "low",
): RecallResolution {
  const byId = new Map(candidates.map((p) => [p.id, p]));
  const pages: MemoryPage[] = [];
  for (const id of rankedIds) {
    const p = byId.get(id);
    if (p && !pages.some((x) => x.id === p.id)) pages.push(p);
  }
  for (const p of candidates) {
    if (!pages.some((x) => x.id === p.id)) pages.push(p);
  }

  if (pages.length === 0) return { kind: "miss" };
  if (pages.length === 1 || confidence === "high") {
    return { kind: "single", page: pages[0]! };
  }
  return {
    kind: "multi",
    pages: pages.slice(0, MAX_CANDIDATES),
  };
}

export function looksLikeRecall(text: string): boolean {
  const s = text.trim();
  if (!s) return false;
  return (
    /找(到|一?下|出)?|那[一]?页|记(得|起|住)|翻出|上一页|上次|那天|关于.+的|show\s+me|what\s+did\s+i|remember|recall|find\s+(the\s+)?page|pages?\s+about/i.test(
      s,
    )
  );
}

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
        " ",
      )
      .replace(/\s+/g, " ")
      .trim() || s
  );
}
