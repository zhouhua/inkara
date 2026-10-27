import type { Adapter } from "@auth/core/adapters";
import { createInkAuthAdapter } from "@/lib/auth-adapter";
import { resolveServerDb } from "@/lib/db-server";

const METHOD_NAMES = [
  "createUser",
  "getUser",
  "getUserByEmail",
  "getUserByAccount",
  "updateUser",
  "deleteUser",
  "linkAccount",
  "unlinkAccount",
  "createVerificationToken",
  "useVerificationToken",
] as const satisfies readonly (keyof Adapter)[];

type AdapterMethodName = (typeof METHOD_NAMES)[number];

/**
 * Lazy D1/MySQL adapter: resolves DB per call so NextAuth config stays sync.
 * Plain object (not Proxy) — Auth.js copies methods via `Object.keys(adapter)`.
 */
export function lazyInkAuthAdapter(): Adapter {
  const adapter = {} as Adapter;
  for (const name of METHOD_NAMES) {
    Object.assign(adapter, {
      [name]: async (...args: unknown[]) => {
        const db = await resolveServerDb();
        if (!db) throw new Error("Database unavailable");
        const real = createInkAuthAdapter(db);
        const method = real[name as AdapterMethodName];
        if (typeof method !== "function") return undefined;
        return (method as (...a: unknown[]) => unknown).apply(real, args);
      },
    });
  }
  return adapter;
}
