import {
  clearEmbeddings,
  deleteEmbedding,
  getCachedEmbeddings,
  getCachedMemoryRaw,
  hydrateDb,
  isDbHydrated,
  isMemoryDirty,
  markMemoryDirty,
  putEmbedding,
  whenDbReady,
  writeMemoryRaw,
  type EmbeddingRecord,
} from "./db";
import {
  EMBEDDING_MODEL,
  embedPassage,
  pageEmbedText,
  warmEmbeddings,
} from "./embeddings";

export type MemoryPage = {
  id: string;
  createdAt: number;
  /** Model's reading of the handwriting */
  transcription: string;
  /** Model reply shown on the page */
  reply: string;
};

/** Soft cap — trim oldest when exceeded */
const MAX_PAGES = 5000;
const CONTEXT_PAGES = 8;
const REINDEX_CONCURRENCY = 2;

let memoryCache: MemoryPage[] = [];

/** In-memory only; refresh restores full recent context. */
let sessionCutoffAt = 0;
let reindexRunning = false;

type PendingOp =
  | { kind: "append"; page: MemoryPage }
  | { kind: "clear" }
  | { kind: "delete"; id: string }
  | { kind: "replace"; pages: MemoryPage[] };

/** Mutations requested before hydrate — replayed on top of IDB. */
const pendingOps: PendingOp[] = [];

function isMemoryPage(v: unknown): v is MemoryPage {
  if (!v || typeof v !== "object") return false;
  const p = v as MemoryPage;
  return (
    typeof p.id === "string" &&
    typeof p.createdAt === "number" &&
    typeof p.transcription === "string" &&
    typeof p.reply === "string"
  );
}

function normalizeMemory(raw: unknown): MemoryPage[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(isMemoryPage).slice(-MAX_PAGES);
}

function syncCacheFromDb() {
  if (isMemoryDirty()) return;
  memoryCache = normalizeMemory(getCachedMemoryRaw());
}

function persist(pages: MemoryPage[]) {
  const prevIds = new Set(memoryCache.map((p) => p.id));
  const trimmed = pages.slice(-MAX_PAGES);
  const keptIds = new Set(trimmed.map((p) => p.id));
  memoryCache = trimmed;
  markMemoryDirty();
  void writeMemoryRaw(trimmed);
  for (const id of prevIds) {
    if (!keptIds.has(id)) void deleteEmbedding(id);
  }
}

function applyPendingOps() {
  if (pendingOps.length === 0) return;
  // Start from IDB snapshot, then replay.
  memoryCache = normalizeMemory(getCachedMemoryRaw());
  const ops = pendingOps.splice(0);
  for (const op of ops) {
    if (op.kind === "clear") {
      persist([]);
      void clearEmbeddings();
    } else if (op.kind === "replace") {
      persist(op.pages);
    } else if (op.kind === "delete") {
      persist(memoryCache.filter((p) => p.id !== op.id));
      void deleteEmbedding(op.id);
    } else if (op.kind === "append") {
      persist([...memoryCache, op.page]);
      void indexPageEmbedding(op.page);
    }
  }
}

function enqueueOrRun(op: PendingOp): MemoryPage[] {
  if (!isDbHydrated()) {
    pendingOps.push(op);
    // Optimistic UI only — do not touch IDB cache (would block hydrate snapshot).
    if (op.kind === "clear") {
      memoryCache = [];
    } else if (op.kind === "replace") {
      memoryCache = op.pages.slice(-MAX_PAGES);
    } else if (op.kind === "delete") {
      memoryCache = memoryCache.filter((p) => p.id !== op.id);
    } else if (op.kind === "append") {
      memoryCache = [...memoryCache, op.page];
    }
    void whenDbReady().then(() => {
      applyPendingOps();
    });
    return [...memoryCache];
  }
  if (op.kind === "clear") {
    persist([]);
    void clearEmbeddings();
  } else if (op.kind === "replace") {
    persist(op.pages);
  } else if (op.kind === "delete") {
    persist(memoryCache.filter((p) => p.id !== op.id));
    void deleteEmbedding(op.id);
  } else if (op.kind === "append") {
    persist([...memoryCache, op.page]);
    void indexPageEmbedding(op.page);
  }
  return [...memoryCache];
}

/** Sync read from memory cache (call after hydrateDb). */
export function loadMemory(): MemoryPage[] {
  return [...memoryCache];
}

export function saveMemory(pages: MemoryPage[]) {
  enqueueOrRun({ kind: "replace", pages });
}

export function appendMemory(page: Omit<MemoryPage, "id" | "createdAt">) {
  const next: MemoryPage = {
    id: crypto.randomUUID(),
    createdAt: Date.now(),
    ...page,
  };
  return enqueueOrRun({ kind: "append", page: next });
}

export function clearMemory() {
  enqueueOrRun({ kind: "clear" });
}

export function deleteMemoryPage(id: string) {
  return enqueueOrRun({ kind: "delete", id });
}

/** Disconnect prompt context without deleting diary pages. */
export function beginNewChapterSession() {
  sessionCutoffAt = Date.now();
}

export function recentContext(pages: MemoryPage[] = loadMemory()) {
  const inSession = pages.filter((p) => p.createdAt > sessionCutoffAt);
  return inSession.slice(-CONTEXT_PAGES).map((p) => ({
    transcription: p.transcription,
    reply: p.reply,
    createdAt: p.createdAt,
  }));
}

export function getPageById(
  id: string,
  pages: MemoryPage[] = loadMemory()
): MemoryPage | null {
  return pages.find((p) => p.id === id) ?? null;
}

export async function indexPageEmbedding(page: MemoryPage): Promise<void> {
  if (typeof window === "undefined") return;
  const text = pageEmbedText(page.transcription, page.reply);
  if (!text) return;
  const vector = await embedPassage(text);
  if (!vector || vector.length === 0) return;
  const record: EmbeddingRecord = {
    id: page.id,
    dims: vector.length,
    vector,
    model: EMBEDDING_MODEL,
  };
  await putEmbedding(record);
}

/** Background: embed any pages missing vectors. Non-blocking. */
export function scheduleEmbeddingBackfill(
  pages: MemoryPage[] = loadMemory()
): void {
  if (typeof window === "undefined") return;
  if (reindexRunning) return;
  warmEmbeddings();
  void (async () => {
    reindexRunning = true;
    try {
      const missing = pages.filter((p) => {
        const emb = getCachedEmbeddings().get(p.id);
        return !emb || emb.model !== EMBEDDING_MODEL || emb.vector.length === 0;
      });
      for (let i = 0; i < missing.length; i += REINDEX_CONCURRENCY) {
        const batch = missing.slice(i, i + REINDEX_CONCURRENCY);
        await Promise.all(batch.map((p) => indexPageEmbedding(p)));
      }
      // Drop orphan embeddings for deleted pages
      const live = new Set(pages.map((p) => p.id));
      for (const id of getCachedEmbeddings().keys()) {
        if (!live.has(id)) await deleteEmbedding(id);
      }
    } finally {
      reindexRunning = false;
    }
  })();
}

export async function hydrateMemory(): Promise<MemoryPage[]> {
  await hydrateDb();
  if (pendingOps.length > 0) {
    applyPendingOps();
  } else if (!isMemoryDirty()) {
    syncCacheFromDb();
  }
  warmEmbeddings();
  scheduleEmbeddingBackfill(memoryCache);
  return [...memoryCache];
}
