import { z } from "zod";

/**
 * Structured ask payload. Property order prefers transcription → reply so
 * partial streams can surface readable text before intent lands.
 */
export const askObjectSchema = z.object({
  transcription: z
    .string()
    .describe(
      "Faithful reading of the handwriting or the exact typed text when provided"
    ),
  reply: z
    .string()
    .describe(
      "Gentle companion reply shown on the page; soft ack only when intent is recall"
    ),
  intent: z
    .enum(["answer", "recall"])
    .describe(
      'Use "recall" only when they ask to find a past entry; otherwise "answer"'
    ),
  recallQuery: z
    .string()
    .describe(
      'Short 2–6 word search needle when intent is recall; otherwise empty string'
    ),
});

export type AskObject = z.infer<typeof askObjectSchema>;
