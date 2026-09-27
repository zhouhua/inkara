import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModel } from "ai";

export type LlmCredentials = {
  apiKey: string;
  baseUrl: string;
  model: string;
};

export type LlmCredentialError =
  | "missing_api_key"
  | "missing_base_url"
  | "missing_model";

/**
 * Merge optional BYOK fields with server env (MODEL_* / DASHSCOPE_*).
 */
export function resolveLlmCredentials(input: {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  /** When true, apiKey must come from the request (probe). */
  requireUserApiKey?: boolean;
}):
  | { ok: true; creds: LlmCredentials }
  | { ok: false; error: LlmCredentialError; message: string } {
  const userApiKey =
    typeof input.apiKey === "string" ? input.apiKey.trim() : "";
  const apiKey = input.requireUserApiKey
    ? userApiKey
    : userApiKey ||
      process.env.MODEL_API_KEY ||
      process.env.DASHSCOPE_API_KEY ||
      "";
  if (!apiKey) {
    return {
      ok: false,
      error: "missing_api_key",
      message: input.requireUserApiKey
        ? "apiKey is required"
        : "MODEL_API_KEY is not configured",
    };
  }

  const userBaseUrl =
    typeof input.baseUrl === "string" ? input.baseUrl.trim() : "";
  const baseUrl = (
    userBaseUrl ||
    process.env.MODEL_BASE_URL ||
    process.env.DASHSCOPE_BASE_URL ||
    ""
  ).replace(/\/$/, "");
  if (!baseUrl) {
    return {
      ok: false,
      error: "missing_base_url",
      message: "MODEL_BASE_URL is not configured",
    };
  }

  const userModel = typeof input.model === "string" ? input.model.trim() : "";
  const model =
    userModel ||
    process.env.MODEL_NAME ||
    process.env.DASHSCOPE_MODEL ||
    "";
  if (!model) {
    return {
      ok: false,
      error: "missing_model",
      message: "MODEL_NAME is not configured",
    };
  }

  return { ok: true, creds: { apiKey, baseUrl, model } };
}

/**
 * Per-request OpenAI-compatible client (server env or BYOK).
 * Structured outputs stay off so DashScope / generic endpoints keep working
 * via JSON-mode + schema guidance instead of strict json_schema.
 */
export function createLlmModel(creds: LlmCredentials): LanguageModel {
  const provider = createOpenAICompatible({
    name: "inkara",
    apiKey: creds.apiKey,
    baseURL: creds.baseUrl.replace(/\/$/, ""),
    supportsStructuredOutputs: false,
  });
  return provider.chatModel(creds.model);
}
