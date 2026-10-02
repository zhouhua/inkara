import { createD1ContentStore } from "@/lib/content/d1-store";
import { defaultSettings, normalizeSettings } from "@/lib/settings";
import { resolveD1, resolveSubject } from "@/lib/subject";

export const runtime = "nodejs";

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
  const row = await store.getSettings(subject.subjectId);
  return Response.json({
    settings: row ? normalizeSettings(row) : defaultSettings,
  });
}

export async function PUT(req: Request) {
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
  const settings = normalizeSettings(
    (body as { settings?: Parameters<typeof normalizeSettings>[0] })?.settings ??
      (body as Parameters<typeof normalizeSettings>[0]),
  );
  const db = await resolveD1();
  if (!db) {
    return Response.json({ error: "db_unavailable" }, { status: 503 });
  }
  const store = createD1ContentStore(db);
  await store.upsertSettings(subject.subjectId, settings);
  return Response.json({ settings });
}
