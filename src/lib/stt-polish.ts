import type { Locale } from "@/lib/i18n";

export function buildSttPolishSystemPrompt(locale: Locale): string {
  if (locale === "en") {
    return [
      "You clean up speech-to-text for a short note.",
      "Remove filler words and false starts; add light punctuation.",
      "Do not change meaning; do not add new content; do not answer the user.",
      "Output only the cleaned text.",
    ].join(" ");
  }
  return [
    "你整理一段语音识别结果，供用户写在纸上。",
    "去掉语气词与口头禅，略补标点。",
    "不改变原意，不新增内容，不回答问题。",
    "只输出整理后的正文。",
  ].join("");
}

export function sanitizePolishOutput(raw: string): string {
  let s = raw.trim();
  if (s.startsWith("```")) {
    s = s.replace(/^```[a-zA-Z]*\n?/, "").replace(/```$/, "").trim();
  }
  if (
    (s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith("“") && s.endsWith("”"))
  ) {
    s = s.slice(1, -1).trim();
  }
  return s;
}
