/** Client stubs — embeddings run on Workers AI server-side. */

export const EMBEDDING_MODEL = "@cf/baai/bge-m3";
export const EMBEDDING_TEXT_MAX = 768;

export type EmbeddingLoadState = {
  status: "idle" | "loading" | "ready" | "failed";
  progress: number;
};

export function isEmbeddingReady(): boolean {
  return true;
}

export function getEmbeddingLoadState(): EmbeddingLoadState {
  return { status: "ready", progress: 100 };
}

export function subscribeEmbeddingLoad(
  _listener: (state: EmbeddingLoadState) => void,
): () => void {
  return () => {};
}

export function warmEmbeddings(): void {}

export function pageEmbedText(transcription: string, reply: string): string {
  return `${transcription}\n${reply}`.trim().slice(0, EMBEDDING_TEXT_MAX);
}

export async function embedQuery(_text: string): Promise<number[] | null> {
  return null;
}

export async function embedPassage(_text: string): Promise<number[] | null> {
  return null;
}

export function cosineSimilarity(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n === 0) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < n; i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}
