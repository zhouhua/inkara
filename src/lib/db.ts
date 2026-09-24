/** IndexedDB persistence with in-memory cache. Call hydrateDb() once on startup. */

const DB_NAME = "inkara";
const DB_VERSION = 1;

const SETTINGS_STORE = "settings";
const MEMORY_STORE = "memory";
const QUOTA_STORE = "quota";

const SETTINGS_KEY = "app";
const QUOTA_KEY = "daily";
const MEMORY_LIST_KEY = "pages";

export type QuotaRecord = {
  date: string;
  count: number;
};

type DbCache = {
  hydrated: boolean;
  settingsRaw: unknown | null;
  memoryRaw: unknown | null;
  quota: QuotaRecord;
};

const cache: DbCache = {
  hydrated: false,
  settingsRaw: null,
  memoryRaw: null,
  quota: { date: "", count: 0 },
};

let dbPromise: Promise<IDBDatabase> | null = null;
let hydratePromise: Promise<void> | null = null;

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
  await hydrateDb();
  cache.settingsRaw = value;
  if (typeof indexedDB === "undefined") return;
  try {
    await idbPut(SETTINGS_STORE, SETTINGS_KEY, value);
  } catch (error) {
    console.error("Failed to persist settings:", error);
  }
}

export async function writeMemoryRaw(value: unknown): Promise<void> {
  await hydrateDb();
  cache.memoryRaw = value;
  if (typeof indexedDB === "undefined") return;
  try {
    await idbPut(MEMORY_STORE, MEMORY_LIST_KEY, value);
  } catch (error) {
    console.error("Failed to persist memory:", error);
  }
}

export async function writeQuota(value: QuotaRecord): Promise<void> {
  await hydrateDb();
  cache.quota = value;
  if (typeof indexedDB === "undefined") return;
  try {
    await idbPut(QUOTA_STORE, QUOTA_KEY, value);
  } catch (error) {
    console.error("Failed to persist quota:", error);
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

      cache.settingsRaw = settingsRaw ?? null;
      cache.memoryRaw = memoryRaw ?? null;
      cache.quota =
        quotaRaw && typeof quotaRaw.date === "string"
          ? {
              date: quotaRaw.date,
              count: typeof quotaRaw.count === "number" ? quotaRaw.count : 0,
            }
          : { date: "", count: 0 };
    } catch (error) {
      console.error("IndexedDB hydrate failed:", error);
      const legacy = readLegacyLocalStorage();
      cache.settingsRaw = legacy.settings;
      cache.memoryRaw = legacy.memory;
      cache.quota = { date: "", count: 0 };
    }

    cache.hydrated = true;
  })();

  return hydratePromise;
}
