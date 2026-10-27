import { describe, expect, it } from "vitest";
import { createInkAuthAdapter } from "./auth-adapter";
import type { D1Database, D1PreparedStatement } from "./db-server";

type Row = Record<string, unknown>;

function createFakeD1() {
  const users = new Map<string, Row>();
  const accounts: Row[] = [];
  const tokens: Row[] = [];

  function prepare(sql: string): D1PreparedStatement {
    const binds: unknown[] = [];
    const stmt: D1PreparedStatement = {
      bind(...values: unknown[]) {
        binds.push(...values);
        return stmt;
      },
      async first<T>() {
        if (
          sql.includes("FROM users u") &&
          sql.includes("INNER JOIN accounts")
        ) {
          const [provider, providerAccountId] = binds;
          const acc = accounts.find(
            (a) =>
              a.provider === provider &&
              a.provider_account_id === providerAccountId,
          );
          if (!acc) return null;
          return (users.get(String(acc.user_id)) as T) ?? null;
        }
        if (sql.includes("FROM users WHERE email")) {
          const email = binds[0];
          for (const u of users.values()) {
            if (u.email === email) return u as T;
          }
          return null;
        }
        if (sql.includes("FROM users WHERE id")) {
          return (users.get(String(binds[0])) as T) ?? null;
        }
        if (sql.includes("FROM verification_tokens")) {
          const [identifier, token] = binds;
          const row = tokens.find(
            (t) => t.identifier === identifier && t.token === token,
          );
          return (row as T) ?? null;
        }
        return null;
      },
      async run() {
        if (sql.startsWith("INSERT INTO users")) {
          if (sql.includes("VALUES (?, NULL,")) {
            const [id, name, email_verified, image] = binds as (
              string | null
            )[];
            users.set(String(id), {
              id,
              email: null,
              phone: null,
              name,
              email_verified,
              image,
              status: "active",
              role: "user",
              banned_at: null,
              ban_reason: null,
              created_at: new Date().toISOString(),
            });
          } else {
            const [id, email, name, email_verified, image] = binds as string[];
            const existing = [...users.values()].find((u) => u.email === email);
            if (existing && sql.includes("ON CONFLICT")) {
              existing.name = name ?? existing.name;
              existing.email_verified =
                email_verified ?? existing.email_verified;
              existing.image = image ?? existing.image;
            } else {
              users.set(id, {
                id,
                email,
                phone: null,
                name,
                email_verified,
                image,
                status: "active",
                role: "user",
                banned_at: null,
                ban_reason: null,
                created_at: new Date().toISOString(),
              });
            }
          }
        }
        if (sql.startsWith("INSERT INTO accounts")) {
          accounts.push({
            id: binds[0],
            user_id: binds[1],
            type: binds[2],
            provider: binds[3],
            provider_account_id: binds[4],
          });
        }
        if (sql.startsWith("INSERT INTO verification_tokens")) {
          tokens.push({
            identifier: binds[0],
            token: binds[1],
            expires: binds[2],
          });
        }
        if (sql.startsWith("DELETE FROM verification_tokens")) {
          const [identifier, token] = binds;
          const i = tokens.findIndex(
            (t) => t.identifier === identifier && t.token === token,
          );
          if (i >= 0) tokens.splice(i, 1);
        }
        if (sql.startsWith("UPDATE users SET")) {
          const id = binds[4] as string;
          const u = users.get(id);
          if (u) {
            if (binds[0] != null) u.email = binds[0];
            if (binds[1] != null) u.name = binds[1];
            u.email_verified = binds[2];
            if (binds[3] != null) u.image = binds[3];
          }
        }
        return { success: true };
      },
      async all() {
        return { results: [] };
      },
    };
    return stmt;
  }

  const db: D1Database = {
    prepare,
    batch: async () => [],
  };
  return { db, users, tokens, accounts };
}

describe("createInkAuthAdapter", () => {
  it("creates user and stores verification token", async () => {
    const { db, users, tokens } = createFakeD1();
    const adapter = createInkAuthAdapter(db);
    const user = await adapter.createUser!({
      email: "a@example.com",
      emailVerified: null,
      name: null,
      image: null,
    });
    expect(user.email).toBe("a@example.com");
    expect(users.size).toBe(1);

    const vt = await adapter.createVerificationToken!({
      identifier: "a@example.com",
      token: "tok",
      expires: new Date("2099-01-01T00:00:00Z"),
    });
    expect(vt.token).toBe("tok");
    expect(tokens).toHaveLength(1);

    const used = await adapter.useVerificationToken!({
      identifier: "a@example.com",
      token: "tok",
    });
    expect(used?.token).toBe("tok");
    expect(tokens).toHaveLength(0);
  });

  it("creates email-less user and links OAuth account", async () => {
    const { db, accounts } = createFakeD1();
    const adapter = createInkAuthAdapter(db);
    const user = await adapter.createUser!({
      email: "",
      emailVerified: null,
      name: "wx",
      image: null,
    });
    expect(user.id).toBeTruthy();
    await adapter.linkAccount!({
      userId: user.id,
      type: "oauth",
      provider: "wechat",
      providerAccountId: "openid-1",
    });
    expect(accounts).toHaveLength(1);
    const found = await adapter.getUserByAccount!({
      provider: "wechat",
      providerAccountId: "openid-1",
    });
    expect(found?.id).toBe(user.id);
  });
});
