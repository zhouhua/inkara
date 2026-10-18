import { beforeEach, describe, expect, it, vi } from "vitest";

const generateText = vi.fn();
const createLlmModel = vi.fn(() => ({ provider: "mock" }));
const resolveLlmCredentials = vi.fn();

vi.mock("ai", () => ({
  generateText: (...args: unknown[]) => generateText(...args),
}));

vi.mock("@/lib/llm", () => ({
  createLlmModel: (...args: unknown[]) => createLlmModel(...args),
  resolveLlmCredentials: (...args: unknown[]) => resolveLlmCredentials(...args),
}));

vi.mock("@/lib/subject", () => ({
  resolveSubject: vi.fn(async () => ({
    ok: true,
    subjectId: "anon_test",
    userId: null,
    anonId: "anon_test",
  })),
}));

import { POST } from "@/app/api/stt/polish/route";
import { buildSttPolishSystemPrompt } from "@/lib/stt-polish";
import { resolveSubject } from "@/lib/subject";

const resolveLlmCredentialsMock = vi.mocked(resolveLlmCredentials);
const resolveSubjectMock = vi.mocked(resolveSubject);

function jsonRequest(body: unknown) {
  return new Request("http://localhost/api/stt/polish", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  generateText.mockReset();
  createLlmModel.mockClear();
  resolveLlmCredentialsMock.mockReset();
  resolveLlmCredentialsMock.mockReturnValue({
    ok: true,
    creds: {
      apiKey: "key",
      baseUrl: "https://example.com/v1",
      model: "test-model",
    },
  });
  resolveSubjectMock.mockResolvedValue({
    ok: true,
    subjectId: "anon_test",
    userId: null,
    anonId: "anon_test",
  });
});

describe("POST /api/stt/polish", () => {
  it("returns 401 when subject missing", async () => {
    resolveSubjectMock.mockResolvedValue({
      ok: false,
      status: 401,
      error: "anon_required",
    });
    const res = await POST(jsonRequest({ text: "你好" }));
    expect(res.status).toBe(401);
    expect(generateText).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid json", async () => {
    const res = await POST(
      new Request("http://localhost/api/stt/polish", {
        method: "POST",
        body: "{",
      }),
    );
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ error: "invalid_json" });
  });

  it("returns 400 when text is empty", async () => {
    const res = await POST(jsonRequest({ text: "   " }));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ error: "empty_text" });
    expect(generateText).not.toHaveBeenCalled();
  });

  it("returns 400 when text exceeds 4000 chars", async () => {
    const res = await POST(jsonRequest({ text: "a".repeat(4001) }));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ error: "text_too_long" });
    expect(generateText).not.toHaveBeenCalled();
  });

  it("returns 503 when credentials missing", async () => {
    resolveLlmCredentialsMock.mockReturnValue({
      ok: false,
      error: "missing_api_key",
      message: "MODEL_API_KEY is not configured",
    });
    const res = await POST(jsonRequest({ text: "你好" }));
    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toMatchObject({
      error: "missing_api_key",
      message: "MODEL_API_KEY is not configured",
    });
    expect(generateText).not.toHaveBeenCalled();
  });

  it("returns 200 with polished text", async () => {
    generateText.mockResolvedValue({ text: "  你好。  " });

    const res = await POST(jsonRequest({ text: "嗯那个你好", locale: "zh" }));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ text: "你好。" });

    expect(resolveLlmCredentialsMock).toHaveBeenCalledWith({});
    expect(generateText).toHaveBeenCalledWith(
      expect.objectContaining({
        system: buildSttPolishSystemPrompt("zh"),
        prompt: "嗯那个你好",
        maxOutputTokens: 1024,
      }),
    );
  });

  it("returns 502 empty_polish when model output is blank", async () => {
    generateText.mockResolvedValue({ text: "   " });

    const res = await POST(jsonRequest({ text: "你好" }));
    expect(res.status).toBe(502);
    await expect(res.json()).resolves.toMatchObject({ error: "empty_polish" });
  });

  it("returns 502 polish_failed when generateText rejects", async () => {
    generateText.mockRejectedValue(new Error("upstream"));

    const res = await POST(jsonRequest({ text: "你好" }));
    expect(res.status).toBe(502);
    await expect(res.json()).resolves.toMatchObject({ error: "polish_failed" });
  });
});
