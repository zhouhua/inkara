import { generateText } from "ai";
import { createLlmModel, resolveLlmCredentials } from "@/lib/llm";
import {
  buildSttPolishSystemPrompt,
  sanitizePolishOutput,
} from "@/lib/stt-polish";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: Request) {
  let body: { text?: string; locale?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }
  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!text) return Response.json({ error: "empty_text" }, { status: 400 });
  if (text.length > 4000) {
    return Response.json({ error: "text_too_long" }, { status: 400 });
  }
  const locale = body.locale === "en" ? "en" : "zh";
  const resolved = resolveLlmCredentials({});
  if (!resolved.ok) {
    return Response.json({ error: resolved.error }, { status: 503 });
  }
  try {
    const result = await generateText({
      model: createLlmModel(resolved.creds),
      system: buildSttPolishSystemPrompt(locale),
      prompt: text,
      maxOutputTokens: 1024,
    });
    const cleaned = sanitizePolishOutput(result.text || "");
    if (!cleaned) {
      return Response.json({ error: "empty_polish" }, { status: 502 });
    }
    return Response.json({ text: cleaned });
  } catch {
    return Response.json({ error: "polish_failed" }, { status: 502 });
  }
}
