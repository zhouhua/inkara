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
