import { z } from "zod";

export const recallRankSchema = z.object({
  rankedIds: z
    .array(z.string())
    .describe("Candidate ids ordered best-first; only given ids"),
  confidence: z
    .enum(["high", "low"])
    .describe(
      'high when one page clearly wins; low when several are close or unsure'
    ),
});

export type RecallRankObject = z.infer<typeof recallRankSchema>;
