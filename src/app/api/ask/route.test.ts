import { beforeEach, describe, expect, it, vi } from "vitest";

const streamText = vi.fn();
const createLlmModel = vi.fn(() => ({ provider: "mock" }));

vi.mock("ai", () => ({
  streamText: (...args: unknown[]) => streamText(...args),
  Output: {
    object: (opts: unknown) => opts,
  },
  APICallError: {
    isInstance: (error: unknown) =>
      Boolean(error && typeof error === "object" && "statusCode" in error),
  },
}));

vi.mock("@/lib/llm", async () => {
  const actual = await vi.importActual<typeof import("@/lib/llm")>("@/lib/llm");
  return {
    ...actual,
    createLlmModel: (...args: unknown[]) => createLlmModel(...args),
  };
});

import { POST } from "@/app/api/ask/route";

function jsonRequest(body: unknown) {
  return new Request("http://localhost/api/ask", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function readSse(res: Response) {
  const text = await res.text();
  return text
    .split("\n")
    .filter((line) => line.startsWith("data: "))
    .map((line) => JSON.parse(line.slice(6)) as Record<string, unknown>);
}

function mockSuccessfulStream(output: {
  transcription: string;
  reply: string;
  intent: "answer" | "recall";
  recallQuery: string;
}) {
  streamText.mockReturnValue({
    partialOutputStream: (async function* () {
      yield output;
    })(),
    output: Promise.resolve(output),
  });
}

beforeEach(() => {
  streamText.mockReset();
  createLlmModel.mockClear();
  process.env.MODEL_API_KEY = "env-key";
  process.env.MODEL_BASE_URL = "https://example.com/v1";
  process.env.MODEL_NAME = "test-model";
});

describe("POST /api/ask", () => {
  it("returns 400 for invalid json", async () => {
    const res = await POST(
      new Request("http://localhost/api/ask", { method: "POST", body: "{" })
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when image and typedText missing", async () => {
    const res = await POST(jsonRequest({ locale: "zh" }));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ error: "missing_image" });
  });

  it("returns 500 when credentials missing", async () => {
    delete process.env.MODEL_API_KEY;
    delete process.env.DASHSCOPE_API_KEY;
    const res = await POST(jsonRequest({ typedText: "你好" }));
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toMatchObject({
      error: "missing_api_key",
    });
  });

  it("streams done event for typed answer", async () => {
    mockSuccessfulStream({
      transcription: "你好",
      reply: "纸面上也好。",
      intent: "answer",
      recallQuery: "",
    });

    const res = await POST(jsonRequest({ typedText: "你好", locale: "zh" }));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");

    const events = await readSse(res);
    const done = events.find((e) => e.type === "done");
    expect(done).toMatchObject({
      type: "done",
      transcription: "你好",
      reply: "纸面上也好。",
      intent: "answer",
    });
  });
});
