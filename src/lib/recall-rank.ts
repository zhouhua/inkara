import { pageEmbedText } from "@/lib/embeddings";
import type { MemoryPage } from "@/lib/memory";

export type RecallRankCandidate = {
  id: string;
  createdAt: number;
  transcription: string;
  reply: string;
};

export type RecallRankResult = {
  rankedIds: string[];
  confidence: "high" | "low";
};

/**
 * POST /api/recall-rank — LLM reorders hybrid candidates.
 * Throws on HTTP failure; caller should fall back to hybrid scores.
 */
export async function rankRecallCandidates(
  body: {
    query: string;
    locale: "zh" | "en";
    candidates: RecallRankCandidate[];
    apiKey?: string;
    baseUrl?: string;
    model?: string;
  },
  init?: { signal?: AbortSignal }
): Promise<RecallRankResult> {
  const res = await fetch("/api/recall-rank", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: init?.signal,
  });

  const data = (await res.json()) as Partial<RecallRankResult> & {
    error?: string;
    message?: string;
  };

  if (!res.ok) {
    throw Object.assign(new Error(data.message || data.error || "rank_failed"), {
      error: data.error || "rank_failed",
      message: data.message,
    });
  }

  const rankedIds = Array.isArray(data.rankedIds)
    ? data.rankedIds.filter((id): id is string => typeof id === "string")
    : [];
  const confidence = data.confidence === "high" ? "high" : "low";
  return { rankedIds, confidence };
}

export function toRankCandidates(pages: MemoryPage[]): RecallRankCandidate[] {
  return pages.map((p) => ({
    id: p.id,
    createdAt: p.createdAt,
    transcription: pageEmbedText(p.transcription, "", 280),
    reply: pageEmbedText(p.reply, "", 280),
  }));
}
