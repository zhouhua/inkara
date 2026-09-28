import { beforeEach, describe, expect, it, vi } from "vitest";

const generateText = vi.fn();
const createLlmModel = vi.fn(() => ({ provider: "mock" }));

vi.mock("ai", () => ({
  generateText: (...args: unknown[]) => generateText(...args),
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

import { POST } from "@/app/api/probe/route";

function jsonRequest(body: unknown) {
  return new Request("http://localhost/api/probe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  generateText.mockReset();
  createLlmModel.mockClear();
  delete process.env.MODEL_API_KEY;
  delete process.env.MODEL_BASE_URL;
  delete process.env.MODEL_NAME;
});

describe("POST /api/probe", () => {
  it("returns 400 for invalid json", async () => {
    const res = await POST(
      new Request("http://localhost/api/probe", {
        method: "POST",
        body: "{",
      })
    );
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ error: "invalid_json" });
  });

  it("returns 400 when api key missing", async () => {
    const res = await POST(
      jsonRequest({ baseUrl: "https://example.com", model: "m" })
    );
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      error: "missing_api_key",
    });
  });

  it("returns ok when generateText succeeds", async () => {
    process.env.MODEL_BASE_URL = "https://example.com/v1";
    process.env.MODEL_NAME = "test-model";
    generateText.mockResolvedValue({ text: "pong" });

    const res = await POST(
      jsonRequest({
        apiKey: "sk-user",
        baseUrl: "https://example.com/v1",
        model: "test-model",
      })
    );
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
  });

  it("maps unauthorized upstream errors", async () => {
    process.env.MODEL_BASE_URL = "https://example.com/v1";
    process.env.MODEL_NAME = "test-model";
    generateText.mockRejectedValue({ statusCode: 401 });

    const res = await POST(
      jsonRequest({
        apiKey: "sk-user",
        baseUrl: "https://example.com/v1",
        model: "test-model",
      })
    );
    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toMatchObject({ error: "unauthorized" });
  });
});
