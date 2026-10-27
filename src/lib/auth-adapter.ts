import type {
  Adapter,
  AdapterAccount,
  AdapterUser,
  VerificationToken,
} from "@auth/core/adapters";
import type { D1Database } from "@/lib/db-server";
import type { UserRole, UserStatus } from "@/lib/user-fields";

export type UserRow = {
  id: string;
  email: string | null;
  phone: string | null;
  name: string | null;
  email_verified: string | null;
  image: string | null;
  status: UserStatus;
  role: UserRole;
  banned_at: string | null;
  ban_reason: string | null;
  created_at: string;
};

export function toAdapterUser(row: UserRow): AdapterUser {
  return {
    id: row.id,
    // Auth.js AdapterUser requires string; phone/wechat-only users may lack email.
    email: row.email ?? "",
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
 * JWT sessions — no sessions table. Supports email / phone / OAuth accounts.
 */
export function createInkAuthAdapter(db: D1Database): Adapter {
  return {
    async createUser(user) {
      const id = user.id ?? newId();
      const email =
        user.email && String(user.email).trim()
          ? String(user.email).trim()
          : null;
      const emailVerified = user.emailVerified
        ? user.emailVerified.toISOString()
        : null;
      if (email) {
        await db
          .prepare(
            `INSERT INTO users (id, email, name, email_verified, image, status, role, created_at)
             VALUES (?, ?, ?, ?, ?, 'active', 'user', datetime('now'))
             ON CONFLICT(email) DO UPDATE SET
               name = COALESCE(excluded.name, users.name),
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
      }
      await db
        .prepare(
          `INSERT INTO users (id, email, name, email_verified, image, status, role, created_at)
           VALUES (?, NULL, ?, ?, ?, 'active', 'user', datetime('now'))`,
        )
        .bind(id, user.name ?? null, emailVerified, user.image ?? null)
        .run();
      const row = await db
        .prepare(`SELECT * FROM users WHERE id = ?`)
        .bind(id)
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

    async getUserByAccount({ provider, providerAccountId }) {
      const row = await db
        .prepare(
          `SELECT u.* FROM users u
           INNER JOIN accounts a ON a.user_id = u.id
           WHERE a.provider = ? AND a.provider_account_id = ?`,
        )
        .bind(provider, providerAccountId)
        .first<UserRow>();
      return row ? toAdapterUser(row) : null;
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
      await db
        .prepare(`DELETE FROM accounts WHERE user_id = ?`)
        .bind(userId)
        .run();
      await db.prepare(`DELETE FROM users WHERE id = ?`).bind(userId).run();
    },

    async linkAccount(account) {
      const id = newId();
      await db
        .prepare(
          `INSERT INTO accounts (
             id, user_id, type, provider, provider_account_id,
             refresh_token, access_token, expires_at, token_type, scope, id_token, session_state
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          id,
          account.userId,
          account.type,
          account.provider,
          account.providerAccountId,
          account.refresh_token ?? null,
          account.access_token ?? null,
          account.expires_at ?? null,
          account.token_type ?? null,
          account.scope ?? null,
          account.id_token ?? null,
          account.session_state ?? null,
        )
        .run();
      return { ...account, id } as AdapterAccount;
    },

    async unlinkAccount({ provider, providerAccountId }) {
      await db
        .prepare(
          `DELETE FROM accounts WHERE provider = ? AND provider_account_id = ?`,
        )
        .bind(provider, providerAccountId)
        .run();
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

export async function getUserRow(
  db: D1Database,
  id: string,
): Promise<UserRow | null> {
  return (
    (await db
      .prepare(`SELECT * FROM users WHERE id = ?`)
      .bind(id)
      .first<UserRow>()) ?? null
  );
}

export async function getUserRowByPhone(
  db: D1Database,
  phone: string,
): Promise<UserRow | null> {
  return (
    (await db
      .prepare(`SELECT * FROM users WHERE phone = ?`)
      .bind(phone)
      .first<UserRow>()) ?? null
  );
}

export async function upsertUserByPhone(
  db: D1Database,
  phone: string,
): Promise<UserRow> {
  const existing = await getUserRowByPhone(db, phone);
  if (existing) return existing;
  const id = newId();
  await db
    .prepare(
      `INSERT INTO users (id, email, phone, status, role, created_at)
       VALUES (?, NULL, ?, 'active', 'user', datetime('now'))`,
    )
    .bind(id, phone)
    .run();
  const row = await getUserRow(db, id);
  if (!row) throw new Error("upsertUserByPhone failed");
  return row;
}

export async function promoteAdminIfListed(
  db: D1Database,
  userId: string,
  email: string | null | undefined,
  adminEmails: Set<string>,
): Promise<UserRole> {
  const row = await getUserRow(db, userId);
  if (!row) return "user";
  if (row.role === "admin") return "admin";
  if (email && adminEmails.has(email.trim().toLowerCase())) {
    await db
      .prepare(`UPDATE users SET role = 'admin' WHERE id = ?`)
      .bind(userId)
      .run();
    return "admin";
  }
  return row.role;
}
