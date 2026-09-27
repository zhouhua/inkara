import { createLlmModel, resolveLlmCredentials } from "@/lib/llm";
import { APICallError, generateText } from "ai";

export const runtime = "nodejs";
export const maxDuration = 30;

type ProbeBody = {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  locale?: "zh" | "en";
};

export async function POST(req: Request) {
  let body: ProbeBody;
  try {
    body = (await req.json()) as ProbeBody;
  } catch {
    return jsonError({ error: "invalid_json" }, 400);
  }

  const resolved = resolveLlmCredentials({
    apiKey: body.apiKey,
    baseUrl: body.baseUrl,
    model: body.model,
    requireUserApiKey: true,
  });
  if (!resolved.ok) {
    const status = resolved.error === "missing_api_key" ? 400 : 500;
    return jsonError(
      { error: resolved.error, message: resolved.message },
      status
    );
  }

  try {
    const { text } = await generateText({
      model: createLlmModel(resolved.creds),
      temperature: 0,
      maxOutputTokens: 8,
      prompt: "ping",
    });
    if (typeof text !== "string") {
      return jsonError({ error: "upstream_error", message: "upstream" }, 502);
    }
  } catch (error) {
    console.error("Probe failed:", error);
    if (APICallError.isInstance(error)) {
      const status = error.statusCode;
      if (status === 401 || status === 403) {
        return jsonError({ error: "unauthorized", message: "unauthorized" }, 401);
      }
      return jsonError({ error: "upstream_error", message: "upstream" }, 502);
    }
    return jsonError({ error: "request_failed" }, 502);
  }

  return Response.json({ ok: true });
}

function jsonError(
  body: { error: string; message?: string },
  status: number
) {
  return Response.json(body, { status });
}
