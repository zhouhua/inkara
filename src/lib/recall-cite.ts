import type { Locale } from "@/lib/i18n";
import type { MemoryPage } from "@/lib/memory";

/** Max pages woven into one recall answer (chips + citations). */
export const RECALL_CITE_MAX = 3;

export type CiteSegment =
  | { kind: "text"; text: string }
  | { kind: "cite"; index: number };

const CITE_RE = /\[\^(\d+)\]/g;

/** Order pages by ranked ids, then append any omitted candidates. */
export function orderPagesByRankedIds(
  rankedIds: string[],
  candidates: MemoryPage[]
): MemoryPage[] {
  const byId = new Map(candidates.map((p) => [p.id, p]));
  const pages: MemoryPage[] = [];
  for (const id of rankedIds) {
    const p = byId.get(id);
    if (p && !pages.some((x) => x.id === p.id)) pages.push(p);
  }
  for (const p of candidates) {
    if (!pages.some((x) => x.id === p.id)) pages.push(p);
  }
  return pages;
}

export function pickRecallCitePages(
  pages: MemoryPage[],
  max = RECALL_CITE_MAX
): MemoryPage[] {
  return pages.slice(0, Math.max(0, max));
}

/** Split reply into text + [^n] cite markers (1-based index). */
export function parseCiteReply(reply: string): CiteSegment[] {
  const segments: CiteSegment[] = [];
  let last = 0;
  CITE_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = CITE_RE.exec(reply)) !== null) {
    if (m.index > last) {
      segments.push({ kind: "text", text: reply.slice(last, m.index) });
    }
    const index = Number(m[1]);
    if (Number.isFinite(index) && index > 0) {
      segments.push({ kind: "cite", index });
    }
    last = m.index + m[0].length;
  }
  if (last < reply.length) {
    segments.push({ kind: "text", text: reply.slice(last) });
  }
  if (segments.length === 0 && reply) {
    segments.push({ kind: "text", text: reply });
  }
  return segments;
}

/** 1-based cite indexes that appear in the reply and map to a page. */
export function citedIndexesInReply(
  reply: string,
  pageCount: number
): number[] {
  const found = new Set<number>();
  for (const seg of parseCiteReply(reply)) {
    if (
      seg.kind === "cite" &&
      seg.index >= 1 &&
      seg.index <= pageCount
    ) {
      found.add(seg.index);
    }
  }
  return [...found].sort((a, b) => a - b);
}

/** Remove [^n] markers for memory storage / canvas-free prose cleanup. */
export function stripCiteMarkers(reply: string): string {
  return reply
    .replace(/\[\^\d+\]/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

export function formatCiteChipLabel(
  page: MemoryPage,
  locale: Locale
): { date: string; snippet: string } {
  const date = new Date(page.createdAt).toLocaleString(
    locale === "zh" ? "zh-CN" : "en-US",
    {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }
  );
  const raw = page.transcription.trim();
  const snippet =
    raw.length > 36 ? `${raw.slice(0, 36).trim()}…` : raw;
  return { date, snippet };
}

export type RecallCitePayload = {
  transcription: string;
  reply: string;
  createdAt: number;
};

export function toRecallCitePayloads(
  pages: MemoryPage[]
): RecallCitePayload[] {
  return pages.map((p) => ({
    transcription: p.transcription,
    reply: p.reply,
    createdAt: p.createdAt,
  }));
}
