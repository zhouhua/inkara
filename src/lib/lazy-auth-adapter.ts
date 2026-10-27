import type { Adapter } from "@auth/core/adapters";
import { createInkAuthAdapter } from "@/lib/auth-adapter";
import { resolveServerDb } from "@/lib/db-server";

/**
 * Lazy D1/MySQL adapter: resolves DB per call so NextAuth config stays sync.
 * Must implement `has` — Auth.js asserts required methods with `method in adapter`.
 */
export function lazyInkAuthAdapter(): Adapter {
  return new Proxy({} as Adapter, {
    get(_target, prop) {
      if (typeof prop === "symbol" || prop === "then") return undefined;
      return async (...args: unknown[]) => {
        const db = await resolveServerDb();
        if (!db) throw new Error("Database unavailable");
        const adapter = createInkAuthAdapter(db) as Record<
          string,
          ((...a: unknown[]) => unknown) | undefined
        >;
        const method = adapter[prop];
        if (typeof method !== "function") return undefined;
        return method(...args);
      };
    },
    has(_target, prop) {
      return typeof prop === "string" && prop !== "then";
    },
  });
}
