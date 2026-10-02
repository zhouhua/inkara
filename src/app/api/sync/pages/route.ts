import { embedOne, pageEmbedText, resolveAi } from "@/lib/ai/embed";
import {
  deletePageVectors,
  resolveVectorize,
  upsertPageVector,
} from "@/lib/ai/vectorize";
import { createD1ContentStore } from "@/lib/content/d1-store";
import type { MemoryPage } from "@/lib/memory";
import { resolveD1, resolveSubject } from "@/lib/subject";

export const runtime = "nodejs";

function isPage(v: unknown): v is MemoryPage {
  if (!v || typeof v !== "object") return false;
  const p = v as MemoryPage;
  return (
    typeof p.id === "string" &&
    typeof p.createdAt === "number" &&
    typeof p.transcription === "string" &&
    typeof p.reply === "string"
  );
}

async function embedPageBestEffort(
  subjectId: string,
  page: MemoryPage,
  droppedIds: string[] = [],
): Promise<void> {
  const vectorize = await resolveVectorize();
  if (vectorize && droppedIds.length > 0) {
    await deletePageVectors(vectorize, droppedIds);
  }

  const ai = await resolveAi();
  if (!ai || !vectorize) return;
  const text = pageEmbedText(page.transcription, page.reply);
  if (!text) return;
  const vector = await embedOne(ai, text);
  if (!vector) return;
  try {
    await upsertPageVector(vectorize, subjectId, page.id, vector);
  } catch {
    /* best-effort */
  }
}

export async function GET(req: Request) {
  const subject = await resolveSubject(req);
  if (!subject.ok) {
    return Response.json(
      { error: subject.error, message: subject.message },
      { status: subject.status },
    );
  }
  const db = await resolveD1();
  if (!db) {
    return Response.json({ error: "db_unavailable" }, { status: 503 });
  }
  const store = createD1ContentStore(db);
  const pages = await store.listPages(subject.subjectId);
  return Response.json({ pages });
}

export async function POST(req: Request) {
  const subject = await resolveSubject(req);
  if (!subject.ok) {
    return Response.json(
      { error: subject.error, message: subject.message },
      { status: subject.status },
    );
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  const db = await resolveD1();
  if (!db) {
    return Response.json({ error: "db_unavailable" }, { status: 503 });
  }
  const store = createD1ContentStore(db);
  const vectorize = await resolveVectorize();

  const bulk = (body as { pages?: unknown }).pages;
  if (Array.isArray(bulk)) {
    const pages = bulk.filter(isPage);
    for (const page of pages) {
      try {
        const { droppedIds } = await store.insertPage(subject.subjectId, page);
        void embedPageBestEffort(subject.subjectId, page, droppedIds);
      } catch {
        /* skip clash */
      }
    }
    const all = await store.listPages(subject.subjectId);
    return Response.json({ pages: all, imported: pages.length });
  }

  if ((body as { clear?: boolean }).clear === true) {
    const ids = await store.clearPages(subject.subjectId);
    if (vectorize && ids.length > 0) {
      await deletePageVectors(vectorize, ids);
    }
    return Response.json({ pages: [] });
  }

  const pageInput = (body as { page?: unknown }).page ?? body;
  if (!isPage(pageInput)) {
    const partial = pageInput as Partial<MemoryPage>;
    if (
      typeof partial.transcription !== "string" ||
      typeof partial.reply !== "string"
    ) {
      return Response.json({ error: "invalid_page" }, { status: 400 });
    }
    const page: MemoryPage = {
      id: typeof partial.id === "string" ? partial.id : crypto.randomUUID(),
      createdAt:
        typeof partial.createdAt === "number" ? partial.createdAt : Date.now(),
      transcription: partial.transcription,
      reply: partial.reply,
    };
    const { droppedIds } = await store.insertPage(subject.subjectId, page);
    void embedPageBestEffort(subject.subjectId, page, droppedIds);
    return Response.json({ page });
  }

  const { droppedIds } = await store.insertPage(subject.subjectId, pageInput);
  void embedPageBestEffort(subject.subjectId, pageInput, droppedIds);
  return Response.json({ page: pageInput });
}
