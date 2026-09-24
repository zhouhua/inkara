export type AskIntent = "answer" | "recall";

export type AskResult = {
  transcription: string;
  reply: string;
  intent: AskIntent;
  recallQuery: string;
};

export type AskStreamEvent =
  | { type: "delta"; text: string }
  | { type: "meta"; transcription: string }
  | {
      type: "done";
      transcription: string;
      reply: string;
      intent: AskIntent;
      recallQuery: string;
    }
  | { type: "error"; error: string; message?: string };

export type AskStreamHandlers = {
  onDelta?: (text: string) => void;
  onMeta?: (transcription: string) => void;
  onDone?: (payload: AskResult) => void;
  onError?: (payload: { error: string; message?: string }) => void;
};

/**
 * POST /api/ask and consume SSE events.
 * Falls back to a single JSON body if the response is not a stream.
 */
export async function askPageStream(
  body: {
    image: string;
    locale: "zh" | "en";
    memory: unknown[];
    typedText?: string;
    apiKey?: string;
    baseUrl?: string;
    model?: string;
  },
  handlers: AskStreamHandlers = {},
  init?: { signal?: AbortSignal }
): Promise<AskResult> {
  const res = await fetch("/api/ask", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    },
    body: JSON.stringify(body),
    signal: init?.signal,
  });

  const contentType = res.headers.get("content-type") || "";

  if (!res.ok) {
    const data = await safeJson(res);
    const error = data?.error || "request_failed";
    const message = data?.message;
    handlers.onError?.({ error, message });
    throw Object.assign(new Error(message || error), { error, message });
  }

  if (!contentType.includes("text/event-stream") || !res.body) {
    const data = (await res.json()) as Partial<AskResult> & {
      error?: string;
      message?: string;
    };
    const result = normalizeResult(data);
    if (!result.reply && result.intent !== "recall") {
      handlers.onError?.({
        error: data.error || "empty_reply",
        message: data.message,
      });
      throw new Error(data.message || data.error || "empty_reply");
    }
    if (result.transcription) handlers.onMeta?.(result.transcription);
    if (result.reply) handlers.onDelta?.(result.reply);
    handlers.onDone?.(result);
    return result;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let final: AskResult = {
    transcription: "",
    reply: "",
    intent: "answer",
    recallQuery: "",
  };
  let sawDone = false;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const parts = buffer.split("\n\n");
      buffer = parts.pop() ?? "";

      for (const part of parts) {
        const event = parseSseBlock(part);
        if (!event) continue;

        switch (event.type) {
          case "delta":
            if (event.text) handlers.onDelta?.(event.text);
            break;
          case "meta":
            final.transcription = event.transcription;
            handlers.onMeta?.(event.transcription);
            break;
          case "done":
            sawDone = true;
            final = normalizeResult(event);
            handlers.onDone?.(final);
            break;
          case "error":
            handlers.onError?.(event);
            throw Object.assign(new Error(event.message || event.error), event);
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  if (!sawDone) {
    handlers.onError?.({ error: "stream_incomplete" });
    throw new Error("stream_incomplete");
  }

  if (!final.reply && final.intent !== "recall") {
    handlers.onError?.({ error: "empty_reply" });
    throw new Error("empty_reply");
  }

  return final;
}

function normalizeResult(data: Partial<AskResult>): AskResult {
  return {
    transcription: typeof data.transcription === "string" ? data.transcription : "",
    reply: typeof data.reply === "string" ? data.reply : "",
    intent: data.intent === "recall" ? "recall" : "answer",
    recallQuery: typeof data.recallQuery === "string" ? data.recallQuery : "",
  };
}

function parseSseBlock(block: string): AskStreamEvent | null {
  const lines = block.split("\n");
  const dataLines: string[] = [];
  for (const line of lines) {
    if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).trimStart());
    }
  }
  if (dataLines.length === 0) return null;
  const raw = dataLines.join("\n");
  if (raw === "[DONE]") return null;
  try {
    return JSON.parse(raw) as AskStreamEvent;
  } catch {
    return null;
  }
}

async function safeJson(
  res: Response
): Promise<{ error?: string; message?: string } | null> {
  try {
    return (await res.json()) as { error?: string; message?: string };
  } catch {
    return null;
  }
}
