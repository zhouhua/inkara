import { afterEach, describe, expect, it } from "vitest";
import { resolveLlmCredentials } from "@/lib/llm";

const ENV_KEYS = [
  "MODEL_API_KEY",
  "MODEL_BASE_URL",
  "MODEL_NAME",
  "DASHSCOPE_API_KEY",
  "DASHSCOPE_BASE_URL",
  "DASHSCOPE_MODEL",
] as const;

const saved: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> =
  {};

function clearEnv() {
  for (const key of ENV_KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
}

function restoreEnv() {
  for (const key of ENV_KEYS) {
    const value = saved[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

afterEach(() => {
  restoreEnv();
});

describe("resolveLlmCredentials", () => {
  it("uses request BYOK over env", () => {
    clearEnv();
    process.env.MODEL_API_KEY = "env-key";
    process.env.MODEL_BASE_URL = "https://env.example.com";
    process.env.MODEL_NAME = "env-model";

    const resolved = resolveLlmCredentials({
      apiKey: " user-key ",
      baseUrl: "https://user.example.com/",
      model: "user-model",
    });
    expect(resolved).toEqual({
      ok: true,
      creds: {
        apiKey: "user-key",
        baseUrl: "https://user.example.com",
        model: "user-model",
      },
    });
  });

  it("falls back to env when BYOK omitted", () => {
    clearEnv();
    process.env.MODEL_API_KEY = "env-key";
    process.env.MODEL_BASE_URL = "https://env.example.com/v1";
    process.env.MODEL_NAME = "env-model";

    const resolved = resolveLlmCredentials({});
    expect(resolved.ok).toBe(true);
    if (resolved.ok) {
      expect(resolved.creds.apiKey).toBe("env-key");
      expect(resolved.creds.model).toBe("env-model");
    }
  });

  it("requires user api key for probe", () => {
    clearEnv();
    process.env.MODEL_API_KEY = "env-key";
    process.env.MODEL_BASE_URL = "https://env.example.com";
    process.env.MODEL_NAME = "env-model";

    const resolved = resolveLlmCredentials({ requireUserApiKey: true });
    expect(resolved).toEqual({
      ok: false,
      error: "missing_api_key",
      message: "apiKey is required",
    });
  });

  it("reports missing base url and model", () => {
    clearEnv();
    expect(resolveLlmCredentials({ apiKey: "k" }).error).toBe(
      "missing_base_url"
    );

    clearEnv();
    process.env.MODEL_BASE_URL = "https://x.example.com";
    expect(resolveLlmCredentials({ apiKey: "k" }).error).toBe("missing_model");
  });
});
