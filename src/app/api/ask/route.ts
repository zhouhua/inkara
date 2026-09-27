import {
  buildRecallCiteSystemPrompt,
  buildRecallCiteUserText,
  buildRecallMissSystemPrompt,
  buildRecallMissUserText,
  buildSystemPrompt,
  buildUserText,
  type MemoryTurn,
  type RecallCitePageInput,
} from "@/lib/prompts";
import { askObjectSchema } from "@/lib/ask-schema";
import { createLlmModel, resolveLlmCredentials } from "@/lib/llm";
import { APICallError, Output, streamText } from "ai";

export const runtime = "nodejs";
export const maxDuration = 60;

type AskBody = {
  /** Page snapshot — required for pen mode; omit when typedText is set */
  image?: string;
  locale?: "zh" | "en";
  memory?: MemoryTurn[];
  /** Authoritative typed input when user used keyboard mode */
  typedText?: string;
  /** Optional BYOK credentials (preferred over server env) */
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  /**
   * Second-pass recall: cite found pages, or answer after a silent miss.
   * When set, typedText (or fixedTranscription) is required; image optional.
   */
  recallMode?: "cite" | "miss";
  recallPages?: RecallCitePageInput[];
  fixedTranscription?: string;
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

type UserContent =
  | string
  | Array<
      | { type: "text"; text: string }
      | { type: "image"; image: string }
    >;

export async function POST(req: Request) {
  let body: AskBody;
  try {
    body = (await req.json()) as AskBody;
  } catch {
    return jsonError({ error: "invalid_json" }, 400);
  }

  const locale = body.locale === "en" ? "en" : "zh";
  const memory = Array.isArray(body.memory) ? body.memory.slice(-8) : [];
  const typedText =
    typeof body.typedText === "string" ? body.typedText.trim() : "";
  const fixedTranscription =
    typeof body.fixedTranscription === "string"
      ? body.fixedTranscription.trim()
      : "";
  const recallMode =
    body.recallMode === "cite" || body.recallMode === "miss"
      ? body.recallMode
      : null;
  const recallPages = Array.isArray(body.recallPages)
    ? body.recallPages
        .filter(
          (p): p is RecallCitePageInput =>
            !!p &&
            typeof p === "object" &&
            typeof p.transcription === "string" &&
            typeof p.reply === "string" &&
            typeof p.createdAt === "number"
        )
        .slice(0, 3)
    : [];
  const hasImage = typeof body.image === "string" && body.image.length > 0;
  const recallText = fixedTranscription || typedText;

  if (recallMode) {
    if (!recallText) {
      return jsonError({ error: "missing_image" }, 400);
    }
    if (recallMode === "cite" && recallPages.length === 0) {
      return jsonError({ error: "invalid_json" }, 400);
    }
  } else if (!typedText && !hasImage) {
    return jsonError({ error: "missing_image" }, 400);
  }

  const resolved = resolveLlmCredentials({
    apiKey: body.apiKey,
    baseUrl: body.baseUrl,
    model: body.model,
  });
  if (!resolved.ok) {
    return jsonError(
      { error: resolved.error, message: resolved.message },
      500
    );
  }

  const quietFallback =
    locale === "zh" ? "纸面一时无言。" : "The page stayed quiet.";

  let systemContent: string;
  let userContent: UserContent;
  let seedTranscription = typedText;

  if (recallMode === "cite") {
    systemContent = buildRecallCiteSystemPrompt(locale);
    userContent = buildRecallCiteUserText(locale, recallText, recallPages);
    seedTranscription = recallText;
  } else if (recallMode === "miss") {
    systemContent = buildRecallMissSystemPrompt(locale);
    userContent = buildRecallMissUserText(locale, recallText);
    seedTranscription = recallText;
  } else {
    const userText = buildUserText(locale, memory, typedText || undefined);
    systemContent = buildSystemPrompt(locale);
    seedTranscription = typedText;
    userContent = typedText
      ? userText
      : [
          {
            type: "image",
            image: body.image!.startsWith("data:")
              ? body.image!
              : `data:image/png;base64,${body.image}`,
          },
          { type: "text", text: userText },
        ];
  }

  const forceAnswer = recallMode != null;
  const model = createLlmModel(resolved.creds);

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: StreamEvent) => {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(event)}\n\n`)
        );
      };

      let metaSent = false;
      let finalTranscription = seedTranscription;
      let finalReply = "";
      let emittedReply = "";

      try {
        const result = streamText({
          model,
          system: systemContent,
          messages: [{ role: "user", content: userContent }],
          temperature: 0.75,
          maxOutputTokens: 1600,
          output: Output.object({
            name: "InkAsk",
            description:
              "Ink diary turn: transcription, reply, intent, and optional recall needle",
            schema: askObjectSchema,
          }),
          onError({ error }) {
            console.error("Ask streamText error:", error);
          },
        });

        for await (const partial of result.partialOutputStream) {
          const transcription =
            typeof partial.transcription === "string"
              ? partial.transcription
              : undefined;
          const reply =
            typeof partial.reply === "string" ? partial.reply : undefined;

          if (transcription !== undefined) {
            finalTranscription = transcription;
            if (!metaSent && transcription !== "") {
              metaSent = true;
              send({ type: "meta", transcription });
            }
          }

          if (reply !== undefined && reply.length > emittedReply.length) {
            const deltas = reply.slice(emittedReply.length);
            emittedReply = reply;
            finalReply = reply;
            if (deltas) send({ type: "delta", text: deltas });
          }
        }

        let intent: "answer" | "recall" = "answer";
        let recallQuery = "";

        try {
          const output = await result.output;
          if (output) {
            finalTranscription =
              output.transcription.trim() || finalTranscription;
            finalReply = output.reply.trim() || finalReply;
            intent = forceAnswer ? "answer" : output.intent;
            recallQuery = forceAnswer ? "" : output.recallQuery.trim();

            if (finalReply.length > emittedReply.length) {
              const deltas = finalReply.slice(emittedReply.length);
              emittedReply = finalReply;
              if (deltas) send({ type: "delta", text: deltas });
            }
          }
        } catch (error) {
          console.error("Ask structured output failed:", error);
        }

        if (forceAnswer) {
          intent = "answer";
          recallQuery = "";
          if (seedTranscription) finalTranscription = seedTranscription;
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
          transcription:
            finalTranscription || seedTranscription || typedText || "",
          reply: finalReply,
          intent,
          recallQuery,
        });
        controller.close();
      } catch (error) {
        console.error("Ask stream failed:", error);
        if (APICallError.isInstance(error)) {
          const status = error.statusCode;
          if (status === 401 || status === 403) {
            send({ type: "error", error: "unauthorized", message: "unauthorized" });
          } else {
            send({ type: "error", error: "upstream_error", message: "upstream" });
          }
        } else {
          send({
            type: "error",
            error: "stream_failed",
            message: error instanceof Error ? error.message : "unknown",
          });
        }
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
