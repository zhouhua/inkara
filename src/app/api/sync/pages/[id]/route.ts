import { deletePageVectors, resolveVectorize } from "@/lib/ai/vectorize";
import { createD1ContentStore } from "@/lib/content/d1-store";
import { resolveD1, resolveSubject } from "@/lib/subject";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function DELETE(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  if (!id) {
    return Response.json({ error: "missing_id" }, { status: 400 });
  }
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
  const ok = await store.deletePage(subject.subjectId, id);
  if (!ok) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }
  const vectorize = await resolveVectorize();
  if (vectorize) {
    await deletePageVectors(vectorize, [id]);
  }
  return Response.json({ ok: true });
}
