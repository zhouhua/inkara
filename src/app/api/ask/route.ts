import {
  buildSystemPrompt,
  buildUserText,
  type MemoryTurn,
} from "@/lib/prompts";
import { createJsonReplyExtractor } from "@/lib/json-reply-stream";

export const runtime = "nodejs";
export const maxDuration = 60;

type AskBody = {
  image: string;
  locale?: "zh" | "en";
  memory?: MemoryTurn[];
  /** Authoritative typed input when user used keyboard mode */
  typedText?: string;
  /** Optional BYOK credentials (preferred over server env) */
  apiKey?: string;
  baseUrl?: string;
  model?: string;
};

type StreamEvent =
  | { type: "delta"; text: string }
  | { type: "meta"; transcription: string }
  | {
      type: "done";
      transcription: string;
      reply: string;
      intent: "answer" | "recall";
      recallQuery: string;
    }
  | { type: "error"; error: string; message?: string };

export async function POST(req: Request) {
  let body: AskBody;
  try {
    body = (await req.json()) as AskBody;
  } catch {
    return jsonError({ error: "invalid_json" }, 400);
  }

  if (!body.image || typeof body.image !== "string") {
    return jsonError({ error: "missing_image" }, 400);
  }

  const userApiKey =
    typeof body.apiKey === "string" ? body.apiKey.trim() : "";
  const apiKey =
    userApiKey ||
    process.env.MODEL_API_KEY ||
    process.env.DASHSCOPE_API_KEY ||
    "";
  if (!apiKey) {
    return jsonError(
      {
        error: "missing_api_key",
        message: "MODEL_API_KEY is not configured",
      },
      500
    );
  }

  const locale = body.locale === "en" ? "en" : "zh";
  const memory = Array.isArray(body.memory) ? body.memory.slice(-8) : [];
  const typedText =
    typeof body.typedText === "string" ? body.typedText.trim() : "";

  const userBaseUrl =
    typeof body.baseUrl === "string" ? body.baseUrl.trim() : "";
  const baseUrl = (
    userBaseUrl ||
    process.env.MODEL_BASE_URL ||
    process.env.DASHSCOPE_BASE_URL ||
    ""
  ).replace(/\/$/, "");
  if (!baseUrl) {
    return jsonError(
      {
        error: "missing_base_url",
        message: "MODEL_BASE_URL is not configured",
      },
      500
    );
  }

  const userModel = typeof body.model === "string" ? body.model.trim() : "";
  const model =
    userModel ||
    process.env.MODEL_NAME ||
    process.env.DASHSCOPE_MODEL ||
    "";
  if (!model) {
    return jsonError(
      {
        error: "missing_model",
        message: "MODEL_NAME is not configured",
      },
      500
    );
  }

  const imageUrl = body.image.startsWith("data:")
    ? body.image
    : `data:image/png;base64,${body.image}`;

  const quietFallback =
    locale === "zh" ? "纸面一时无言。" : "The page stayed quiet.";

  let upstream: Response;
  try {
    upstream = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0.75,
        max_tokens: 800,
        stream: true,
        messages: [
          { role: "system", content: buildSystemPrompt(locale) },
          {
            role: "user",
            content: [
              { type: "image_url", image_url: { url: imageUrl } },
              {
                type: "text",
                text: buildUserText(locale, memory, typedText || undefined),
              },
            ],
          },
        ],
      }),
    });
  } catch (error) {
    console.error("Ask route failed:", error);
    return jsonError(
      {
        error: "request_failed",
        message: error instanceof Error ? error.message : "unknown",
      },
      500
    );
  }

  if (!upstream.ok) {
    const errText = await upstream.text();
    console.error("Upstream model error:", upstream.status, errText);
    return jsonError(
      {
        error: "upstream_error",
        message: errText.slice(0, 500),
      },
      502
    );
  }

  if (!upstream.body) {
    return jsonError({ error: "empty_upstream" }, 502);
  }

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const extractor = createJsonReplyExtractor();
  let sseBuf = "";
  let metaSent = false;
  let finalTranscription = typedText;
  let finalReply = "";

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: StreamEvent) => {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(event)}\n\n`)
        );
      };

      try {
        const reader = upstream.body!.getReader();

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          sseBuf += decoder.decode(value, { stream: true });
          const chunks = sseBuf.split("\n");
          sseBuf = chunks.pop() ?? "";

          for (const line of chunks) {
            const trimmed = line.trim();
            if (!trimmed.startsWith("data:")) continue;
            const payload = trimmed.slice(5).trim();
            if (!payload || payload === "[DONE]") continue;

            let piece = "";
            try {
              const parsed = JSON.parse(payload) as {
                choices?: Array<{ delta?: { content?: string } }>;
              };
              piece = parsed.choices?.[0]?.delta?.content ?? "";
            } catch {
              continue;
            }
            if (!piece) continue;

            const extracted = extractor.push(piece);
            if (
              extracted.transcription !== null &&
              !metaSent &&
              extracted.transcription !== ""
            ) {
              metaSent = true;
              finalTranscription = extracted.transcription;
              send({ type: "meta", transcription: extracted.transcription });
            } else if (extracted.transcription !== null) {
              finalTranscription = extracted.transcription;
            }

            if (extracted.deltas) {
              finalReply = extracted.reply;
              send({ type: "delta", text: extracted.deltas });
            } else {
              finalReply = extracted.reply || finalReply;
            }
          }
        }

        // Flush incomplete SSE line if any
        if (sseBuf.trim()) {
          const trimmed = sseBuf.trim();
          if (trimmed.startsWith("data:")) {
            const payload = trimmed.slice(5).trim();
            if (payload && payload !== "[DONE]") {
              try {
                const parsed = JSON.parse(payload) as {
                  choices?: Array<{ delta?: { content?: string } }>;
                };
                const piece = parsed.choices?.[0]?.delta?.content ?? "";
                if (piece) {
                  const extracted = extractor.push(piece);
                  if (extracted.deltas) {
                    finalReply = extracted.reply;
                    send({ type: "delta", text: extracted.deltas });
                  }
                  if (extracted.transcription !== null) {
                    finalTranscription = extracted.transcription;
                  }
                }
              } catch {
                /* ignore */
              }
            }
          }
        }

        const raw = extractor.getRaw().trim();
        const parsed = parseModelJson(raw);
        let intent: "answer" | "recall" = "answer";
        let recallQuery = "";

        if (parsed) {
          finalTranscription = parsed.transcription || finalTranscription;
          finalReply = parsed.reply || finalReply;
          intent = parsed.intent;
          recallQuery = parsed.recallQuery;
        } else if (!finalReply && raw) {
          // Model returned prose instead of JSON — treat as reply
          finalReply = raw;
          send({ type: "delta", text: raw });
        }

        if (!finalReply && intent !== "recall") {
          finalReply = quietFallback;
          send({ type: "delta", text: finalReply });
        }

        if (!metaSent && finalTranscription) {
          send({ type: "meta", transcription: finalTranscription });
        }

        send({
          type: "done",
          transcription: finalTranscription || typedText || "",
          reply: finalReply,
          intent,
          recallQuery,
        });
        controller.close();
      } catch (error) {
        console.error("Ask stream failed:", error);
        send({
          type: "error",
          error: "stream_failed",
          message: error instanceof Error ? error.message : "unknown",
        });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

function jsonError(
  body: { error: string; message?: string },
  status: number
) {
  return Response.json(body, { status });
}

function parseModelJson(raw: string): {
  transcription: string;
  reply: string;
  intent: "answer" | "recall";
  recallQuery: string;
} | null {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced?.[1] ?? raw).trim();
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;

  try {
    const obj = JSON.parse(candidate.slice(start, end + 1)) as {
      transcription?: unknown;
      reply?: unknown;
      intent?: unknown;
      recallQuery?: unknown;
    };
    const transcription =
      typeof obj.transcription === "string" ? obj.transcription.trim() : "";
    const reply = typeof obj.reply === "string" ? obj.reply.trim() : "";
    const intent = obj.intent === "recall" ? "recall" : "answer";
    const recallQuery =
      typeof obj.recallQuery === "string" ? obj.recallQuery.trim() : "";
    if (!reply && intent !== "recall") return null;
    return { transcription, reply, intent, recallQuery };
  } catch {
    return null;
  }
}
