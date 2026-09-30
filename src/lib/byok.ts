export function validateByokFields(input: {
  apiKey: string;
  baseUrl: string;
}): { apiKey?: string; baseUrl?: string } {
  const errors: { apiKey?: string; baseUrl?: string } = {};
  if (!input.apiKey.trim()) errors.apiKey = "byokKeyRequired";
  const url = input.baseUrl.trim();
  if (url) {
    try {
      const u = new URL(url);
      if (u.protocol !== "http:" && u.protocol !== "https:") {
        errors.baseUrl = "byokUrlInvalid";
      }
    } catch {
      errors.baseUrl = "byokUrlInvalid";
    }
  }
  return errors;
}

/** Draft save: all empty clears BYOK; any field set requires a valid key (+ optional URL). */
export function validateByokDraft(input: {
  apiKey: string;
  baseUrl: string;
  model: string;
}): { apiKey?: string; baseUrl?: string } {
  const apiKey = input.apiKey.trim();
  const baseUrl = input.baseUrl.trim();
  const model = input.model.trim();
  if (!apiKey && !baseUrl && !model) return {};
  return validateByokFields({ apiKey, baseUrl });
}

export function maskApiKey(apiKey: string): string {
  const key = apiKey.trim();
  if (!key) return "";
  if (key.length <= 8) return "••••";
  return `${key.slice(0, 4)}…${key.slice(-4)}`;
}
