import type {
  Adapter,
  AdapterUser,
  VerificationToken,
} from "@auth/core/adapters";
import type { D1Database } from "@/lib/db-server";

type UserRow = {
  id: string;
  email: string;
  name: string | null;
  email_verified: string | null;
  image: string | null;
  created_at: string;
};

function toAdapterUser(row: UserRow): AdapterUser {
  return {
    id: row.id,
    email: row.email,
    emailVerified: row.email_verified ? new Date(row.email_verified) : null,
    name: row.name ?? null,
    image: row.image ?? null,
  };
}

function newId(): string {
  return crypto.randomUUID();
}

/**
 * Minimal Auth.js adapter backed by inkara billing D1 schema.
 * Avoids @auth/d1-adapter `users` table clash; JWT sessions so no sessions table.
 */
export function createInkAuthAdapter(db: D1Database): Adapter {
  return {
    async createUser(user) {
      const id = user.id ?? newId();
      const email = user.email;
      if (!email) throw new Error("createUser requires email");
      const emailVerified = user.emailVerified
        ? user.emailVerified.toISOString()
        : null;
      await db
        .prepare(
          `INSERT INTO users (id, email, name, email_verified, image, created_at)
           VALUES (?, ?, ?, ?, ?, datetime('now'))
           ON CONFLICT(email) DO UPDATE SET
             name = excluded.name,
             email_verified = COALESCE(excluded.email_verified, users.email_verified),
             image = COALESCE(excluded.image, users.image)`,
        )
        .bind(id, email, user.name ?? null, emailVerified, user.image ?? null)
        .run();
      const row = await db
        .prepare(`SELECT * FROM users WHERE email = ?`)
        .bind(email)
        .first<UserRow>();
      if (!row) throw new Error("createUser failed");
      return toAdapterUser(row);
    },

    async getUser(id) {
      const row = await db
        .prepare(`SELECT * FROM users WHERE id = ?`)
        .bind(id)
        .first<UserRow>();
      return row ? toAdapterUser(row) : null;
    },

    async getUserByEmail(email) {
      const row = await db
        .prepare(`SELECT * FROM users WHERE email = ?`)
        .bind(email)
        .first<UserRow>();
      return row ? toAdapterUser(row) : null;
    },

    async getUserByAccount() {
      return null;
    },

    async updateUser(user) {
      const existing = await db
        .prepare(`SELECT * FROM users WHERE id = ?`)
        .bind(user.id)
        .first<UserRow>();
      if (!existing) throw new Error("updateUser: not found");
      const emailVerified =
        user.emailVerified === undefined
          ? existing.email_verified
          : user.emailVerified
            ? user.emailVerified.toISOString()
            : null;
      await db
        .prepare(
          `UPDATE users SET
             email = COALESCE(?, email),
             name = COALESCE(?, name),
             email_verified = ?,
             image = COALESCE(?, image)
           WHERE id = ?`,
        )
        .bind(
          user.email ?? null,
          user.name ?? null,
          emailVerified,
          user.image ?? null,
          user.id,
        )
        .run();
      const row = await db
        .prepare(`SELECT * FROM users WHERE id = ?`)
        .bind(user.id)
        .first<UserRow>();
      if (!row) throw new Error("updateUser failed");
      return toAdapterUser(row);
    },

    async deleteUser(userId) {
      await db.prepare(`DELETE FROM users WHERE id = ?`).bind(userId).run();
    },

    async linkAccount() {
      return;
    },

    async unlinkAccount() {
      return;
    },

    async createVerificationToken(verificationToken) {
      await db
        .prepare(
          `INSERT INTO verification_tokens (identifier, token, expires)
           VALUES (?, ?, ?)`,
        )
        .bind(
          verificationToken.identifier,
          verificationToken.token,
          verificationToken.expires.toISOString(),
        )
        .run();
      return verificationToken;
    },

    async useVerificationToken({ identifier, token }) {
      const row = await db
        .prepare(
          `SELECT identifier, token, expires FROM verification_tokens
           WHERE identifier = ? AND token = ?`,
        )
        .bind(identifier, token)
        .first<{ identifier: string; token: string; expires: string }>();
      if (!row) return null;
      await db
        .prepare(
          `DELETE FROM verification_tokens WHERE identifier = ? AND token = ?`,
        )
        .bind(identifier, token)
        .run();
      return {
        identifier: row.identifier,
        token: row.token,
        expires: new Date(row.expires),
      } satisfies VerificationToken;
    },
  };
}
