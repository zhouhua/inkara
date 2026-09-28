import { beforeEach, describe, expect, it, vi } from "vitest";

const generateText = vi.fn();
const createLlmModel = vi.fn(() => ({ provider: "mock" }));

vi.mock("ai", () => ({
  generateText: (...args: unknown[]) => generateText(...args),
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

import { POST } from "@/app/api/recall-rank/route";

function jsonRequest(body: unknown) {
  return new Request("http://localhost/api/recall-rank", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const candidate = {
  id: "p1",
  createdAt: 1,
  transcription: "失眠",
  reply: "慢慢来",
};

beforeEach(() => {
  generateText.mockReset();
  createLlmModel.mockClear();
  process.env.MODEL_API_KEY = "env-key";
  process.env.MODEL_BASE_URL = "https://example.com/v1";
  process.env.MODEL_NAME = "test-model";
});

describe("POST /api/recall-rank", () => {
  it("returns 400 for missing query/candidates", async () => {
    const res = await POST(jsonRequest({ query: "", candidates: [] }));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ error: "missing_input" });
  });

  it("returns 500 when credentials missing", async () => {
    delete process.env.MODEL_API_KEY;
    delete process.env.DASHSCOPE_API_KEY;
    const res = await POST(
      jsonRequest({ query: "失眠", candidates: [candidate] })
    );
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toMatchObject({
      error: "missing_api_key",
    });
  });

  it("returns ranked ids from mock model", async () => {
    generateText.mockResolvedValue({
      output: { rankedIds: ["p1"], confidence: "high" },
    });
    const res = await POST(
      jsonRequest({ query: "失眠", candidates: [candidate] })
    );
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      rankedIds: ["p1"],
      confidence: "high",
    });
  });
});
