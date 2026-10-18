import { mintSttTicket, resolveSttTicketSecret } from "@/lib/stt-ticket";
import { resolveSubject } from "@/lib/subject";

export const runtime = "nodejs";

function hasAsrKey(): boolean {
  const dash = process.env.DASHSCOPE_API_KEY?.trim();
  if (dash) return true;
  const model = process.env.MODEL_API_KEY?.trim();
  return Boolean(model);
}

function resolveSttWsUrl(): string | null {
  const configured = process.env.NEXT_PUBLIC_STT_WS_URL?.trim();
  if (configured) return configured;
  if (process.env.NODE_ENV === "test" || process.env.VITEST) {
    return "ws://localhost:8787";
  }
  return null;
}

export async function POST(req: Request) {
  const subject = await resolveSubject(req);
  if (!subject.ok) {
    return Response.json(
      { error: subject.error, message: subject.message },
      { status: subject.status },
    );
  }

  const secret = resolveSttTicketSecret();
  if (!secret) {
    return Response.json({ error: "missing_ticket_secret" }, { status: 503 });
  }
  if (!hasAsrKey()) {
    return Response.json({ error: "missing_asr_key" }, { status: 503 });
  }
  const wsUrl = resolveSttWsUrl();
  if (!wsUrl) {
    return Response.json({ error: "missing_ws_url" }, { status: 503 });
  }
  const { ticket, expiresAt } = mintSttTicket(secret);
  return Response.json({ ticket, expiresAt, wsUrl });
}
