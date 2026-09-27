/** Client-side text embeddings for hybrid recall. Lazy-loads the model. */

export const EMBEDDING_MODEL = "Xenova/multilingual-e5-small";
export const EMBEDDING_TEXT_MAX = 768;

/** Official Hub — often blocked / times out in CN; mirror is the fallback. */
export const HF_REMOTE_HOST_DEFAULT = "https://huggingface.co/";
export const HF_REMOTE_HOST_MIRROR = "https://hf-mirror.com/";

function normalizeRemoteHost(host: string): string {
  const trimmed = host.trim();
  if (!trimmed) return HF_REMOTE_HOST_DEFAULT;
  return trimmed.endsWith("/") ? trimmed : `${trimmed}/`;
}

/**
 * Pick a Hub host that actually returns model JSON (not an HTML interstitial).
 * Override with NEXT_PUBLIC_HF_REMOTE_HOST when needed.
 */
export async function resolveHfRemoteHost(
  fetchImpl: typeof fetch = fetch
): Promise<string> {
  const override = process.env.NEXT_PUBLIC_HF_REMOTE_HOST;
  if (override?.trim()) return normalizeRemoteHost(override);

  const candidates = [HF_REMOTE_HOST_DEFAULT, HF_REMOTE_HOST_MIRROR];
  for (const host of candidates) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 2500);
    try {
      const res = await fetchImpl(
        `${host}${EMBEDDING_MODEL}/resolve/main/config.json`,
        { signal: ctrl.signal, headers: { Accept: "application/json" } }
      );
      if (!res.ok) continue;
      const ct = res.headers.get("content-type") ?? "";
      if (ct.includes("text/html")) {
        try {
          await res.body?.cancel();
        } catch {
          /* ignore */
        }
        continue;
      }
      const text = await res.text();
      if (text.trimStart().startsWith("<")) continue;
      JSON.parse(text);
      return host;
    } catch {
      /* try next candidate */
    } finally {
      clearTimeout(timer);
    }
  }
  return HF_REMOTE_HOST_MIRROR;
}

type FeatureExtractor = (
  text: string | string[],
  options?: { pooling?: string; normalize?: boolean }
) => Promise<{ data: Float32Array | number[]; dims: number[] }>;

export type EmbeddingLoadState = {
  status: "idle" | "loading" | "ready" | "failed";
  /** 0–100 aggregate download progress */
  progress: number;
};

type LoadListener = (state: EmbeddingLoadState) => void;

let extractorPromise: Promise<FeatureExtractor | null> | null = null;
let extractorReady = false;
let extractorFailed = false;
let loadState: EmbeddingLoadState = { status: "idle", progress: 0 };
const loadListeners = new Set<LoadListener>();

export function isEmbeddingReady(): boolean {
  return extractorReady;
}

export function didEmbeddingFail(): boolean {
  return extractorFailed;
}

export function getEmbeddingLoadState(): EmbeddingLoadState {
  return loadState;
}

export function subscribeEmbeddingLoad(listener: LoadListener): () => void {
  loadListeners.add(listener);
  listener(loadState);
  return () => {
    loadListeners.delete(listener);
  };
}

function setLoadState(next: EmbeddingLoadState) {
  if (
    loadState.status === next.status &&
    loadState.progress === next.progress
  ) {
    return;
  }
  loadState = next;
  for (const listener of loadListeners) listener(next);
}

/** Truncate page text used for embedding / ranking. */
export function pageEmbedText(
  transcription: string,
  reply: string,
  max = EMBEDDING_TEXT_MAX
): string {
  const raw = `${transcription}\n${reply}`.trim();
  if (raw.length <= max) return raw;
  return raw.slice(0, max);
}

export function cosineSimilarity(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n === 0) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < n; i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

function onPipelineProgress(info: {
  status: string;
  progress?: number;
}): void {
  if (info.status === "initiate" || info.status === "download") {
    setLoadState({
      status: "loading",
      progress: Math.max(0, loadState.progress),
    });
    return;
  }
  if (info.status === "progress_total" || info.status === "progress") {
    const pct = Math.max(
      0,
      Math.min(100, Math.round(info.progress ?? loadState.progress))
    );
    setLoadState({ status: "loading", progress: pct });
    return;
  }
  if (info.status === "ready") {
    setLoadState({ status: "ready", progress: 100 });
  }
}

async function loadExtractor(): Promise<FeatureExtractor | null> {
  if (typeof window === "undefined") return null;
  setLoadState({ status: "loading", progress: 0 });
  try {
    const remoteHost = await resolveHfRemoteHost();
    const { pipeline, env } = await import("@huggingface/transformers");
    // SPA HTML 404s look like JSON to transformers.js — never probe local paths.
    env.allowLocalModels = false;
    env.allowRemoteModels = true;
    env.remoteHost = remoteHost;
    // Bundle must not ship ORT asyncify wasm (>25 MiB Cloudflare Workers limit).
    // Force CDN paths so inference still works after strip/emit:false.
    const ortWeb = (
      env.backends as { onnx?: { versions?: { web?: string }; wasm?: { wasmPaths?: unknown } } }
    )?.onnx;
    const ortVersion = ortWeb?.versions?.web;
    if (ortVersion && ortWeb?.wasm) {
      const prefix = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ortVersion}/dist/`;
      ortWeb.wasm.wasmPaths = {
        mjs: `${prefix}ort-wasm-simd-threaded.asyncify.mjs`,
        wasm: `${prefix}ort-wasm-simd-threaded.asyncify.wasm`,
      };
    }
    const extractor = (await pipeline(
      "feature-extraction",
      EMBEDDING_MODEL,
      {
        dtype: "q8",
        progress_callback: onPipelineProgress,
      }
    )) as unknown as FeatureExtractor;
    extractorReady = true;
    extractorFailed = false;
    setLoadState({ status: "ready", progress: 100 });
    return extractor;
  } catch (error) {
    console.warn("Embedding model failed to load:", error);
    extractorFailed = true;
    extractorReady = false;
    setLoadState({ status: "failed", progress: loadState.progress });
    return null;
  }
}

/** Kick off model download without awaiting (safe to call often). */
export function warmEmbeddings(): void {
  if (typeof window === "undefined") return;
  if (extractorPromise || extractorFailed) return;
  extractorPromise = loadExtractor();
}

async function getExtractor(): Promise<FeatureExtractor | null> {
  if (extractorFailed) return null;
  if (!extractorPromise) extractorPromise = loadExtractor();
  return extractorPromise;
}

async function embedRaw(
  text: string,
  prefix: "query" | "passage"
): Promise<number[] | null> {
  const extractor = await getExtractor();
  if (!extractor) return null;
  const input = `${prefix}: ${text}`.trim();
  if (!input || input === `${prefix}:`) return null;
  try {
    const out = await extractor(input, { pooling: "mean", normalize: true });
    const data = out.data;
    if (data instanceof Float32Array) return Array.from(data);
    return Array.from(data);
  } catch (error) {
    console.warn("embedText failed:", error);
    return null;
  }
}

export async function embedQuery(text: string): Promise<number[] | null> {
  const t = text.trim().slice(0, EMBEDDING_TEXT_MAX);
  if (!t) return null;
  return embedRaw(t, "query");
}

export async function embedPassage(text: string): Promise<number[] | null> {
  const t = text.trim().slice(0, EMBEDDING_TEXT_MAX);
  if (!t) return null;
  return embedRaw(t, "passage");
}
