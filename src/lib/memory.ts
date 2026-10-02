import {
  getCachedMemoryRaw,
  hydrateDb,
  isDbHydrated,
  isMemoryDirty,
  markMemoryDirty,
  whenDbReady,
} from "./db";

export type MemoryPage = {
  id: string;
  createdAt: number;
  transcription: string;
  reply: string;
};

const MAX_PAGES = 5000;
const CONTEXT_PAGES = 8;

let memoryCache: MemoryPage[] = [];
let sessionCutoffAt = 0;

type PendingOp =
  | { kind: "append"; page: MemoryPage }
  | { kind: "clear" }
  | { kind: "delete"; id: string }
  | { kind: "replace"; pages: MemoryPage[] };

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

function ensureSynced() {
  if (!isDbHydrated()) return;
  if (isMemoryDirty()) return;
  syncCacheFromDb();
}

async function apiAppend(page: MemoryPage) {
  await fetch("/api/sync/pages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ page }),
  });
}

async function apiDelete(id: string) {
  await fetch(`/api/sync/pages/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

async function apiClear() {
  await fetch("/api/sync/pages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clear: true }),
  });
}

async function apiReplace(pages: MemoryPage[]) {
  await apiClear();
  if (pages.length === 0) return;
  await fetch("/api/sync/pages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pages }),
  });
}

function persistLocal(pages: MemoryPage[]) {
  memoryCache = pages.slice(-MAX_PAGES);
  markMemoryDirty();
}

function applyPendingOps() {
  if (pendingOps.length === 0) return;
  memoryCache = normalizeMemory(getCachedMemoryRaw());
  const ops = pendingOps.splice(0);
  for (const op of ops) {
    if (op.kind === "clear") {
      persistLocal([]);
      void apiClear();
    } else if (op.kind === "replace") {
      persistLocal(op.pages);
      void apiReplace(op.pages);
    } else if (op.kind === "delete") {
      persistLocal(memoryCache.filter((p) => p.id !== op.id));
      void apiDelete(op.id);
    } else if (op.kind === "append") {
      persistLocal([...memoryCache, op.page]);
      void apiAppend(op.page);
    }
  }
}

function enqueueOrRun(op: PendingOp): MemoryPage[] {
  if (!isDbHydrated()) {
    pendingOps.push(op);
    if (op.kind === "clear") memoryCache = [];
    else if (op.kind === "replace") memoryCache = op.pages.slice(-MAX_PAGES);
    else if (op.kind === "delete")
      memoryCache = memoryCache.filter((p) => p.id !== op.id);
    else if (op.kind === "append")
      memoryCache = [...memoryCache, op.page];
    void whenDbReady().then(() => applyPendingOps());
    return [...memoryCache];
  }
  ensureSynced();
  if (op.kind === "clear") {
    persistLocal([]);
    void apiClear();
  } else if (op.kind === "replace") {
    persistLocal(op.pages);
    void apiReplace(op.pages);
  } else if (op.kind === "delete") {
    persistLocal(memoryCache.filter((p) => p.id !== op.id));
    void apiDelete(op.id);
  } else if (op.kind === "append") {
    persistLocal([...memoryCache, op.page]);
    void apiAppend(op.page);
  }
  return [...memoryCache];
}

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
  pages: MemoryPage[] = loadMemory(),
): MemoryPage | null {
  return pages.find((p) => p.id === id) ?? null;
}

/** @deprecated Embeddings are server-side; no-op. */
export async function indexPageEmbedding(_page: MemoryPage): Promise<void> {}

/** @deprecated Embeddings are server-side; no-op. */
export function scheduleEmbeddingBackfill(_pages?: MemoryPage[]): void {}

export async function hydrateMemory(): Promise<MemoryPage[]> {
  await hydrateDb();
  if (pendingOps.length > 0) {
    applyPendingOps();
  } else if (!isMemoryDirty()) {
    syncCacheFromDb();
  }
  return [...memoryCache];
}
