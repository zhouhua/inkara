import { createLlmModel, resolveLlmCredentials } from "@/lib/llm";
import { recallRankSchema } from "@/lib/recall-rank-schema";
import { APICallError, generateText, Output } from "ai";

export const runtime = "nodejs";
export const maxDuration = 30;

type Candidate = {
  id: string;
  createdAt: number;
  transcription: string;
  reply: string;
};

type RankBody = {
  query?: string;
  locale?: "zh" | "en";
  candidates?: Candidate[];
  apiKey?: string;
  baseUrl?: string;
  model?: string;
};

export async function POST(req: Request) {
  let body: RankBody;
  try {
    body = (await req.json()) as RankBody;
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  const locale = body.locale === "en" ? "en" : "zh";
  const query = typeof body.query === "string" ? body.query.trim() : "";
  const candidates = Array.isArray(body.candidates)
    ? body.candidates.filter(isCandidate).slice(0, 20)
    : [];

  if (!query || candidates.length === 0) {
    return Response.json(
      { error: "missing_input", message: "query and candidates required" },
      { status: 400 }
    );
  }

  const resolved = resolveLlmCredentials({
    apiKey: body.apiKey,
    baseUrl: body.baseUrl,
    model: body.model,
  });
  if (!resolved.ok) {
    return Response.json(
      { error: resolved.error, message: resolved.message },
      { status: 500 }
    );
  }

  const system =
    locale === "zh"
      ? [
          "你是日记旧页排序助手。根据用户的查找意图，对候选页按相关度从高到低排序。",
          "只使用给定候选；禁止编造 id；每个 id 最多出现一次。",
          "若有一页明显最匹配，confidence 为 high；若多页接近或不确定，为 low。",
        ].join("\n")
      : [
          "You rank diary pages for a recall request. Order candidates by relevance, best first.",
          "Use only the given candidates; never invent ids; each id at most once.",
          'If one page clearly wins, confidence is "high"; if several are close or unsure, "low".',
        ].join("\n");

  const list = candidates
    .map((c, i) => {
      const when = new Date(c.createdAt).toISOString().slice(0, 10);
      return `${i + 1}. id=${c.id} date=${when}\nwrote: ${c.transcription}\nreply: ${c.reply}`;
    })
    .join("\n\n");

  const user =
    locale === "zh"
      ? `查找意图：${query}\n\n候选页：\n${list}`
      : `Recall query: ${query}\n\nCandidates:\n${list}`;

  let rankedIds: string[] = [];
  let confidence: "high" | "low" = "low";

  try {
    const { output } = await generateText({
      model: createLlmModel(resolved.creds),
      system,
      prompt: user,
      temperature: 0.1,
      maxOutputTokens: 800,
      output: Output.object({
        name: "RecallRank",
        description: "Ranked diary page ids for a recall query",
        schema: recallRankSchema,
      }),
    });

    const allowed = new Set(candidates.map((c) => c.id));
    rankedIds = (output?.rankedIds ?? []).filter((id) => allowed.has(id));
    confidence = output?.confidence === "high" ? "high" : "low";
  } catch (error) {
    console.error("Recall-rank failed:", error);
    if (APICallError.isInstance(error)) {
      const status = error.statusCode;
      if (status === 401 || status === 403) {
        return Response.json(
          { error: "unauthorized", message: "unauthorized" },
          { status: 401 }
        );
      }
      return Response.json(
        { error: "upstream_error", message: "upstream" },
        { status: 502 }
      );
    }
    return Response.json(
      {
        error: "request_failed",
        message: error instanceof Error ? error.message : "unknown",
      },
      { status: 500 }
    );
  }

  for (const c of candidates) {
    if (!rankedIds.includes(c.id)) rankedIds.push(c.id);
  }

  return Response.json({ rankedIds, confidence });
}

function isCandidate(v: unknown): v is Candidate {
  if (!v || typeof v !== "object") return false;
  const c = v as Candidate;
  return (
    typeof c.id === "string" &&
    typeof c.createdAt === "number" &&
    typeof c.transcription === "string" &&
    typeof c.reply === "string"
  );
}
