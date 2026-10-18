export const EMBEDDING_MODEL = "@cf/baai/bge-m3";
export const EMBEDDING_TEXT_MAX = 768;
export const EMBEDDING_DIMS = 1024;

export type WorkersAi = {
  run: (
    model: string,
    inputs: { text: string[] },
  ) => Promise<{ data?: number[][]; shape?: number[] } | number[][]>;
};

export function pageEmbedText(transcription: string, reply: string): string {
  return `${transcription}\n${reply}`.trim().slice(0, EMBEDDING_TEXT_MAX);
}

export function truncateEmbedText(text: string): string {
  return text.trim().slice(0, EMBEDDING_TEXT_MAX);
}

export function cosineSimilarity(
  a: ArrayLike<number>,
  b: ArrayLike<number>,
): number {
  const n = Math.min(a.length, b.length);
  if (n === 0) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < n; i++) {
    const x = a[i]!;
    const y = b[i]!;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export async function embedTexts(
  ai: WorkersAi,
  texts: string[],
): Promise<number[][] | null> {
  if (texts.length === 0) return [];
  try {
    const result = await ai.run(EMBEDDING_MODEL, {
      text: texts.map(truncateEmbedText),
    });
    if (Array.isArray(result)) {
      return result as number[][];
    }
    if (result && Array.isArray(result.data)) {
      return result.data;
    }
    return null;
  } catch {
    return null;
  }
}

export async function embedOne(
  ai: WorkersAi,
  text: string,
): Promise<number[] | null> {
  const rows = await embedTexts(ai, [text]);
  const first = rows?.[0];
  if (!first?.length) return null;
  if (first.length !== EMBEDDING_DIMS) {
    return null;
  }
  return first;
}

function dashscopeEmbeddingAi(): WorkersAi | null {
  const apiKey =
    process.env.DASHSCOPE_API_KEY?.trim() || process.env.MODEL_API_KEY?.trim();
  if (!apiKey) return null;
  const base = (
    process.env.DASHSCOPE_BASE_URL?.trim() ||
    process.env.MODEL_BASE_URL?.trim() ||
    "https://dashscope.aliyuncs.com/compatible-mode/v1"
  ).replace(/\/$/, "");
  return {
    async run(_model, inputs) {
      const res = await fetch(`${base}/embeddings`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: process.env.EMBEDDING_MODEL?.trim() || "text-embedding-v3",
          input: inputs.text,
          dimensions: EMBEDDING_DIMS,
          encoding_format: "float",
        }),
      });
      if (!res.ok) {
        throw new Error(`embeddings ${res.status}`);
      }
      const body = (await res.json()) as {
        data?: { embedding?: number[]; index?: number }[];
      };
      const rows = body.data ?? [];
      rows.sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
      return rows.map((row) => row.embedding ?? []);
    },
  };
}

export async function resolveAi(): Promise<WorkersAi | null> {
  if (process.env.DATABASE_URL?.trim()) {
    return dashscopeEmbeddingAi();
  }
  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    const { env } = await getCloudflareContext({ async: true });
    return (env as { AI?: WorkersAi }).AI ?? null;
  } catch {
    return null;
  }
}
