/**
 * Server D1 accessor. Wired in Phase A Task 3+/API routes via Cloudflare env.
 * Ledger unit tests use `createMemoryBillingStore` instead.
 */
export type D1PreparedStatement = {
  bind: (...values: unknown[]) => D1PreparedStatement;
  first: <T = unknown>() => Promise<T | null>;
  run: () => Promise<{ success: boolean }>;
  all: <T = unknown>() => Promise<{ results: T[] }>;
};

export type D1Database = {
  prepare: (query: string) => D1PreparedStatement;
  batch: (statements: D1PreparedStatement[]) => Promise<unknown[]>;
};

export function getDb(env: { DB: D1Database }): D1Database {
  return env.DB;
}
