/** IndexedDB persistence with in-memory cache. Call hydrateDb() once on startup. */

const DB_NAME = "inkara";
const DB_VERSION = 2;

const SETTINGS_STORE = "settings";
const MEMORY_STORE = "memory";
const QUOTA_STORE = "quota";
const EMBEDDINGS_STORE = "embeddings";

const SETTINGS_KEY = "app";
const QUOTA_KEY = "daily";
const MEMORY_LIST_KEY = "pages";

export type QuotaRecord = {
  date: string;
  count: number;
};

export type EmbeddingRecord = {
  id: string;
  dims: number;
  vector: number[];
  model: string;
};

type DbCache = {
  hydrated: boolean;
  settingsRaw: unknown | null;
  memoryRaw: unknown | null;
  quota: QuotaRecord;
  embeddings: Map<string, EmbeddingRecord>;
  /** Last IDB snapshot (even when dirty keeps a different live value). */
  idbSettingsSnapshot: unknown | null;
  idbMemorySnapshot: unknown | null;
};

const cache: DbCache = {
  hydrated: false,
  settingsRaw: null,
  memoryRaw: null,
  quota: { date: "", count: 0 },
  embeddings: new Map(),
  idbSettingsSnapshot: null,
  idbMemorySnapshot: null,
};

/** In-memory edits that must not be clobbered by hydrate's IDB snapshot. */
let settingsDirty = false;
let memoryDirty = false;
let quotaDirty = false;

let dbPromise: Promise<IDBDatabase> | null = null;
let hydratePromise: Promise<void> | null = null;
let settingsWriteChain: Promise<void> = Promise.resolve();
let memoryWriteChain: Promise<void> = Promise.resolve();
let quotaWriteChain: Promise<void> = Promise.resolve();

const readyWaiters: Array<() => void> = [];

function notifyDbReady() {
  const waiters = readyWaiters.splice(0);
  for (const w of waiters) w();
}

/** Resolves once IndexedDB cache has been hydrated (or immediately if already). */
export function whenDbReady(): Promise<void> {
  if (cache.hydrated) return Promise.resolve();
  return new Promise((resolve) => {
    readyWaiters.push(resolve);
  });
}

export function markSettingsDirty() {
  settingsDirty = true;
}

export function markMemoryDirty() {
  memoryDirty = true;
}

export function markQuotaDirty() {
  quotaDirty = true;
}

export function isSettingsDirty() {
  return settingsDirty;
}

export function isMemoryDirty() {
  return memoryDirty;
}


function openDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("indexedDB unavailable"));
  }
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(SETTINGS_STORE)) {
        db.createObjectStore(SETTINGS_STORE);
      }
      if (!db.objectStoreNames.contains(MEMORY_STORE)) {
        db.createObjectStore(MEMORY_STORE);
      }
      if (!db.objectStoreNames.contains(QUOTA_STORE)) {
        db.createObjectStore(QUOTA_STORE);
      }
      if (!db.objectStoreNames.contains(EMBEDDINGS_STORE)) {
        db.createObjectStore(EMBEDDINGS_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("idb open failed"));
  });

  return dbPromise;
}

function idbGet<T>(store: string, key: string): Promise<T | undefined> {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(store, "readonly");
        const req = tx.objectStore(store).get(key);
        req.onsuccess = () => resolve(req.result as T | undefined);
        req.onerror = () => reject(req.error);
      })
  );
}

function idbPut(store: string, key: string, value: unknown): Promise<void> {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(store, "readwrite");
        tx.objectStore(store).put(value, key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      })
  );
}

function idbDelete(store: string, key: string): Promise<void> {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(store, "readwrite");
        tx.objectStore(store).delete(key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      })
  );
}

function idbClear(store: string): Promise<void> {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(store, "readwrite");
        tx.objectStore(store).clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      })
  );
}

function idbGetAll<T>(store: string): Promise<T[]> {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(store, "readonly");
        const req = tx.objectStore(store).getAll();
        req.onsuccess = () => resolve((req.result as T[]) ?? []);
        req.onerror = () => reject(req.error);
      })
  );
}

function readLegacyLocalStorage(): {
  settings: unknown | null;
  memory: unknown | null;
} {
  if (typeof localStorage === "undefined") {
    return { settings: null, memory: null };
  }

  let settings: unknown | null = null;
  const settingsKeys = [
    "inkara.settings.v6",
    "inkara.settings.v5",
    "inkara.settings.v4",
    "inkara.settings.v3",
    "inkara.settings.v2",
    "inkara.settings.v1",
  ];
  for (const key of settingsKeys) {
    const raw = localStorage.getItem(key);
    if (!raw) continue;
    try {
      settings = JSON.parse(raw);
      break;
    } catch {
      /* try next */
    }
  }

  let memory: unknown | null = null;
  const memRaw = localStorage.getItem("inkara.memory.v1");
  if (memRaw) {
    try {
      memory = JSON.parse(memRaw);
    } catch {
      memory = null;
    }
  }

  return { settings, memory };
}

function clearLegacyLocalStorage() {
  if (typeof localStorage === "undefined") return;
  const keys = [
    "inkara.settings.v6",
    "inkara.settings.v5",
    "inkara.settings.v4",
    "inkara.settings.v3",
    "inkara.settings.v2",
    "inkara.settings.v1",
    "inkara.memory.v1",
  ];
  for (const key of keys) {
    localStorage.removeItem(key);
  }
}

export function isDbHydrated(): boolean {
  return cache.hydrated;
}

export function getCachedSettingsRaw(): unknown | null {
  return cache.settingsRaw;
}

export function getCachedMemoryRaw(): unknown | null {
  return cache.memoryRaw;
}

export function getCachedQuota(): QuotaRecord {
  return cache.quota;
}

export async function writeSettingsRaw(value: unknown): Promise<void> {
  settingsDirty = true;
  cache.settingsRaw = value;
  const run = async () => {
    await hydrateDb();
    // Always persist the latest dirty snapshot (newer writes may have replaced it).
    const toWrite = cache.settingsRaw;
    if (typeof indexedDB === "undefined") return;
    try {
      await idbPut(SETTINGS_STORE, SETTINGS_KEY, toWrite);
    } catch (error) {
      console.error("Failed to persist settings:", error);
    }
  };
  settingsWriteChain = settingsWriteChain.then(run, run);
  return settingsWriteChain;
}

export async function writeMemoryRaw(value: unknown): Promise<void> {
  memoryDirty = true;
  cache.memoryRaw = value;
  const run = async () => {
    await hydrateDb();
    const toWrite = cache.memoryRaw;
    if (typeof indexedDB === "undefined") return;
    try {
      await idbPut(MEMORY_STORE, MEMORY_LIST_KEY, toWrite);
    } catch (error) {
      console.error("Failed to persist memory:", error);
    }
  };
  memoryWriteChain = memoryWriteChain.then(run, run);
  return memoryWriteChain;
}

export async function writeQuota(value: QuotaRecord): Promise<void> {
  quotaDirty = true;
  cache.quota = value;
  const run = async () => {
    await hydrateDb();
    const toWrite = cache.quota;
    if (typeof indexedDB === "undefined") return;
    try {
      await idbPut(QUOTA_STORE, QUOTA_KEY, toWrite);
    } catch (error) {
      console.error("Failed to persist quota:", error);
    }
  };
  quotaWriteChain = quotaWriteChain.then(run, run);
  return quotaWriteChain;
}

function isEmbeddingRecord(v: unknown): v is EmbeddingRecord {
  if (!v || typeof v !== "object") return false;
  const r = v as EmbeddingRecord;
  return (
    typeof r.id === "string" &&
    typeof r.dims === "number" &&
    Array.isArray(r.vector) &&
    typeof r.model === "string"
  );
}

/** Sync snapshot of cached embeddings (after hydrate). */
export function getCachedEmbeddings(): Map<string, EmbeddingRecord> {
  return cache.embeddings;
}

export async function putEmbedding(record: EmbeddingRecord): Promise<void> {
  await hydrateDb();
  cache.embeddings.set(record.id, record);
  if (typeof indexedDB === "undefined") return;
  try {
    await idbPut(EMBEDDINGS_STORE, record.id, record);
  } catch (error) {
    console.error("Failed to persist embedding:", error);
  }
}

export async function deleteEmbedding(id: string): Promise<void> {
  await hydrateDb();
  cache.embeddings.delete(id);
  if (typeof indexedDB === "undefined") return;
  try {
    await idbDelete(EMBEDDINGS_STORE, id);
  } catch (error) {
    console.error("Failed to delete embedding:", error);
  }
}

export async function clearEmbeddings(): Promise<void> {
  await hydrateDb();
  cache.embeddings.clear();
  if (typeof indexedDB === "undefined") return;
  try {
    await idbClear(EMBEDDINGS_STORE);
  } catch (error) {
    console.error("Failed to clear embeddings:", error);
  }
}

/**
 * Load IndexedDB into memory cache. Migrates legacy localStorage once.
 * Safe to call multiple times; subsequent calls await the first.
 */
export function hydrateDb(): Promise<void> {
  if (cache.hydrated) return Promise.resolve();
  if (hydratePromise) return hydratePromise;

  hydratePromise = (async () => {
    if (typeof window === "undefined") {
      cache.hydrated = true;
      notifyDbReady();
      return;
    }

    try {
      let settingsRaw = await idbGet<unknown>(SETTINGS_STORE, SETTINGS_KEY);
      let memoryRaw = await idbGet<unknown>(MEMORY_STORE, MEMORY_LIST_KEY);
      const quotaRaw = await idbGet<QuotaRecord>(QUOTA_STORE, QUOTA_KEY);

      const needsMigrate =
        settingsRaw === undefined && memoryRaw === undefined;

      if (needsMigrate) {
        const legacy = readLegacyLocalStorage();
        if (legacy.settings != null || legacy.memory != null) {
          if (legacy.settings != null) {
            settingsRaw = legacy.settings;
            await idbPut(SETTINGS_STORE, SETTINGS_KEY, legacy.settings);
          }
          if (legacy.memory != null) {
            memoryRaw = legacy.memory;
            await idbPut(MEMORY_STORE, MEMORY_LIST_KEY, legacy.memory);
          }
          clearLegacyLocalStorage();
        }
      }

      if (!settingsDirty) {
        cache.settingsRaw = settingsRaw ?? null;
      }
      if (!memoryDirty) {
        cache.memoryRaw = memoryRaw ?? null;
      }
      if (!quotaDirty) {
        cache.quota =
          quotaRaw && typeof quotaRaw.date === "string"
            ? {
                date: quotaRaw.date,
                count: typeof quotaRaw.count === "number" ? quotaRaw.count : 0,
              }
            : { date: "", count: 0 };
      }

      try {
        const rows = await idbGetAll<unknown>(EMBEDDINGS_STORE);
        const map = new Map<string, EmbeddingRecord>();
        for (const row of rows) {
          if (isEmbeddingRecord(row)) map.set(row.id, row);
        }
        cache.embeddings = map;
      } catch {
        cache.embeddings = new Map();
      }
    } catch (error) {
      console.error("IndexedDB hydrate failed:", error);
      const legacy = readLegacyLocalStorage();
      if (!settingsDirty) cache.settingsRaw = legacy.settings;
      if (!memoryDirty) cache.memoryRaw = legacy.memory;
      if (!quotaDirty) cache.quota = { date: "", count: 0 };
      cache.embeddings = new Map();
    }

    cache.hydrated = true;
    notifyDbReady();
  })();

  return hydratePromise;
}
