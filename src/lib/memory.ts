import {
  getCachedMemoryRaw,
  hydrateDb,
  writeMemoryRaw,
} from "./db";

export type MemoryPage = {
  id: string;
  createdAt: number;
  /** Model's reading of the handwriting */
  transcription: string;
  /** Model reply shown on the page */
  reply: string;
};

const MAX_PAGES = 40;
const CONTEXT_PAGES = 8;

let memoryCache: MemoryPage[] = [];

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
  memoryCache = normalizeMemory(getCachedMemoryRaw());
}

function persist(pages: MemoryPage[]) {
  const trimmed = pages.slice(-MAX_PAGES);
  memoryCache = trimmed;
  void writeMemoryRaw(trimmed);
}

/** Sync read from memory cache (call after hydrateDb). */
export function loadMemory(): MemoryPage[] {
  return [...memoryCache];
}

export function saveMemory(pages: MemoryPage[]) {
  persist(pages);
}

export function appendMemory(page: Omit<MemoryPage, "id" | "createdAt">) {
  const pages = loadMemory();
  const next: MemoryPage = {
    id: crypto.randomUUID(),
    createdAt: Date.now(),
    ...page,
  };
  pages.push(next);
  persist(pages);
  return pages;
}

export function clearMemory() {
  persist([]);
}

export function deleteMemoryPage(id: string) {
  const pages = loadMemory().filter((p) => p.id !== id);
  persist(pages);
  return pages;
}

export function recentContext(pages: MemoryPage[] = loadMemory()) {
  return pages.slice(-CONTEXT_PAGES).map((p) => ({
    transcription: p.transcription,
    reply: p.reply,
    createdAt: p.createdAt,
  }));
}

export async function hydrateMemory(): Promise<MemoryPage[]> {
  await hydrateDb();
  syncCacheFromDb();
  return [...memoryCache];
}
