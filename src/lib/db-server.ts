/**
 * Server D1 accessor. Wired in Phase A Task 3+/API routes via Cloudflare env.
 * Ledger unit tests use `createMemoryBillingStore` instead.
 */
export type D1RunResult = {
  success: boolean;
  meta?: { changes?: number };
};

export type D1PreparedStatement = {
  bind: (...values: unknown[]) => D1PreparedStatement;
  first: <T = unknown>() => Promise<T | null>;
  run: () => Promise<D1RunResult>;
  all: <T = unknown>() => Promise<{ results: T[] }>;
};

export type D1Database = {
  prepare: (query: string) => D1PreparedStatement;
  batch: (statements: D1PreparedStatement[]) => Promise<unknown[]>;
};

export function getDb(env: { DB: D1Database }): D1Database {
  return env.DB;
}

/** D1 on Workers, MySQL when DATABASE_URL is set (ECS / Node). */
export async function resolveServerDb(): Promise<D1Database | null> {
  if (process.env.DATABASE_URL?.trim()) {
    const { getMysqlD1 } = await import("@/lib/mysql-d1");
    return getMysqlD1();
  }
  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    const { env } = await getCloudflareContext({ async: true });
    return (env as { DB?: D1Database }).DB ?? null;
  } catch {
    return null;
  }
}
