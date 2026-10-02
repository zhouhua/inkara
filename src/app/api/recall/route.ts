import { embedOne, pageEmbedText, resolveAi } from "@/lib/ai/embed";
import { queryPageVectors, resolveVectorize } from "@/lib/ai/vectorize";
import { createD1ContentStore } from "@/lib/content/d1-store";
import {
  findMemoriesByQuery,
  fuseScored,
  type ScoredMemory,
} from "@/lib/recall-core";
import { resolveD1, resolveSubject } from "@/lib/subject";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const subject = await resolveSubject(req);
  if (!subject.ok) {
    return Response.json(
      { error: subject.error, message: subject.message },
      { status: subject.status },
    );
  }

  let body: { query?: string };
  try {
    body = (await req.json()) as { query?: string };
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }
  const query = typeof body.query === "string" ? body.query.trim() : "";
  if (!query) {
    return Response.json({ results: [] });
  }

  const db = await resolveD1();
  if (!db) {
    return Response.json({ error: "db_unavailable" }, { status: 503 });
  }
  const store = createD1ContentStore(db);
  const pages = await store.listPages(subject.subjectId);
  const byId = new Map(pages.map((p) => [p.id, p]));

  const lexical = findMemoriesByQuery(query, pages, 2);

  let vectorHits: ScoredMemory[] = [];
  const ai = await resolveAi();
  const vectorize = await resolveVectorize();
  if (ai && vectorize) {
    const queryVec = await embedOne(ai, pageEmbedText(query, ""));
    if (queryVec) {
      const matches = await queryPageVectors(
        vectorize,
        subject.subjectId,
        queryVec,
      );
      vectorHits = matches
        .map((m) => {
          const page = byId.get(m.id);
          if (!page) return null;
          return { page, score: m.score };
        })
        .filter((x): x is ScoredMemory => x !== null);
    }
  }

  const scored = fuseScored(lexical, vectorHits);
  return Response.json({
    results: scored.map((s) => ({
      score: s.score,
      page: s.page,
    })),
  });
}
