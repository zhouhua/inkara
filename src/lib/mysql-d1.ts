import type { Pool, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import mysql from "mysql2/promise";
import type { D1Database, D1PreparedStatement } from "@/lib/db-server";
import { translateSqliteToMysql } from "@/lib/sqlite-to-mysql";

const globalPool = globalThis as unknown as { __inkaraMysql?: Pool };

function databaseUrl(): string {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) throw new Error("DATABASE_URL is not set");
  return url;
}

export function getMysqlPool(): Pool {
  if (!globalPool.__inkaraMysql) {
    const pool = mysql.createPool({
      uri: databaseUrl(),
      connectionLimit: 8,
      waitForConnections: true,
      enableKeepAlive: true,
      dateStrings: true,
      supportBigNumbers: true,
      bigNumberStrings: false,
      timezone: "Z",
    });
    pool.pool.on("connection", (connection) => {
      connection.query("SET SESSION transaction_isolation = 'READ-COMMITTED'");
      connection.query("SET SESSION vidx_hnsw_ef_search = 64");
    });
    globalPool.__inkaraMysql = pool;
  }
  return globalPool.__inkaraMysql;
}

class MysqlStatement implements D1PreparedStatement {
  private params: unknown[] = [];

  constructor(
    private readonly pool: Pool,
    private readonly sql: string,
  ) {}

  bind(...values: unknown[]): D1PreparedStatement {
    const next = new MysqlStatement(this.pool, this.sql);
    next.params = values;
    return next;
  }

  private translated(): string {
    return translateSqliteToMysql(this.sql);
  }

  async first<T = unknown>(): Promise<T | null> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      this.translated(),
      this.params,
    );
    return (rows[0] as T | undefined) ?? null;
  }

  async all<T = unknown>(): Promise<{ results: T[] }> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      this.translated(),
      this.params,
    );
    return { results: rows as T[] };
  }

  async run(): Promise<{ success: boolean; meta?: { changes?: number } }> {
    const [result] = await this.pool.query<ResultSetHeader>(
      this.translated(),
      this.params,
    );
    return { success: true, meta: { changes: result.affectedRows ?? 0 } };
  }
}

export function createMysqlD1(pool: Pool = getMysqlPool()): D1Database {
  return {
    prepare(query: string) {
      return new MysqlStatement(pool, query);
    },
    async batch(statements: D1PreparedStatement[]) {
      const out = [];
      for (const statement of statements) {
        out.push(await statement.run());
      }
      return out;
    },
  };
}

export function getMysqlD1(): D1Database {
  return createMysqlD1();
}
