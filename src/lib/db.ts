/**
 * Client session cache for cloud-backed content.
 * Persistence is D1 via /api/sync/* — no IndexedDB.
 */

type DbCache = {
  hydrated: boolean;
  settingsRaw: unknown | null;
  memoryRaw: unknown | null;
};

const cache: DbCache = {
  hydrated: false,
  settingsRaw: null,
  memoryRaw: null,
};

let settingsDirty = false;
let memoryDirty = false;
let hydratePromise: Promise<void> | null = null;
const readyWaiters: Array<() => void> = [];

function notifyDbReady() {
  const waiters = readyWaiters.splice(0);
  for (const w of waiters) w();
}

export function whenDbReady(): Promise<void> {
  if (cache.hydrated) return Promise.resolve();
  return new Promise((resolve) => {
    readyWaiters.push(resolve);
  });
}

export function isDbHydrated() {
  return cache.hydrated;
}

export function markSettingsDirty() {
  settingsDirty = true;
}

export function markMemoryDirty() {
  memoryDirty = true;
}

export function isSettingsDirty() {
  return settingsDirty;
}

export function isMemoryDirty() {
  return memoryDirty;
}

export function getCachedSettingsRaw(): unknown | null {
  return cache.settingsRaw;
}

export function getCachedMemoryRaw(): unknown | null {
  return cache.memoryRaw;
}

export async function writeSettingsRaw(value: unknown): Promise<void> {
  cache.settingsRaw = value;
  settingsDirty = true;
  if (typeof window === "undefined") return;
  try {
    await fetch("/api/sync/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ settings: value }),
    });
  } catch {
    /* keep cache; next hydrate may overwrite */
  }
}

export async function writeMemoryRaw(_value: unknown): Promise<void> {
  // Pages are written via append/delete APIs; full replace uses sync endpoint.
  memoryDirty = true;
}

/** One-shot upload of legacy IndexedDB diary/settings, then delete local DB. */
async function migrateLegacyIndexedDb(): Promise<{
  settings: unknown | null;
  pages: unknown | null;
}> {
  if (typeof indexedDB === "undefined") {
    return { settings: null, pages: null };
  }
  try {
    const db = await new Promise<IDBDatabase | null>((resolve) => {
      const req = indexedDB.open("inkara");
      req.onerror = () => resolve(null);
      req.onsuccess = () => resolve(req.result);
      req.onupgradeneeded = () => {
        /* empty — do not create */
      };
    });
    if (!db) return { settings: null, pages: null };
    const hasSettings = db.objectStoreNames.contains("settings");
    const hasMemory = db.objectStoreNames.contains("memory");
    if (!hasSettings && !hasMemory) {
      db.close();
      return { settings: null, pages: null };
    }

    const get = (store: string, key: string) =>
      new Promise<unknown>((resolve) => {
        try {
          const tx = db.transaction(store, "readonly");
          const req = tx.objectStore(store).get(key);
          req.onsuccess = () => resolve(req.result ?? null);
          req.onerror = () => resolve(null);
        } catch {
          resolve(null);
        }
      });

    const settings = hasSettings ? await get("settings", "app") : null;
    const pages = hasMemory ? await get("memory", "pages") : null;
    db.close();

    if (settings && typeof settings === "object") {
      await fetch("/api/sync/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings }),
      });
    }
    if (Array.isArray(pages) && pages.length > 0) {
      await fetch("/api/sync/pages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pages }),
      });
    }

    await new Promise<void>((resolve) => {
      const del = indexedDB.deleteDatabase("inkara");
      del.onsuccess = () => resolve();
      del.onerror = () => resolve();
      del.onblocked = () => resolve();
    });

    return { settings, pages };
  } catch {
    return { settings: null, pages: null };
  }
}

const HYDRATE_FETCH_MS = 8_000;

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init?: RequestInit,
  ms = HYDRATE_FETCH_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    window.clearTimeout(timer);
  }
}

export function hydrateDb(): Promise<void> {
  if (cache.hydrated) return Promise.resolve();
  if (hydratePromise) return hydratePromise;

  hydratePromise = (async () => {
    if (typeof window === "undefined") {
      cache.hydrated = true;
      notifyDbReady();
      return;
    }

    // Ensure anon cookie before sync
    try {
      await fetchWithTimeout("/api/billing/anon", { method: "POST" });
    } catch {
      /* continue */
    }

    await migrateLegacyIndexedDb();

    try {
      const [settingsRes, pagesRes] = await Promise.all([
        fetchWithTimeout("/api/sync/settings"),
        fetchWithTimeout("/api/sync/pages"),
      ]);
      if (settingsRes.ok) {
        const data = (await settingsRes.json()) as { settings?: unknown };
        if (!settingsDirty) cache.settingsRaw = data.settings ?? null;
      }
      if (pagesRes.ok) {
        const data = (await pagesRes.json()) as { pages?: unknown };
        if (!memoryDirty) cache.memoryRaw = data.pages ?? [];
      }
    } catch {
      if (!memoryDirty) cache.memoryRaw = cache.memoryRaw ?? [];
    }

    cache.hydrated = true;
    notifyDbReady();
  })();

  return hydratePromise;
}
