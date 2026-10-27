import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Resend from "next-auth/providers/resend";
import type { Adapter } from "@auth/core/adapters";
import {
  createInkAuthAdapter,
  getUserRow,
  promoteAdminIfListed,
  upsertUserByPhone,
  type UserRow,
} from "@/lib/auth-adapter";
import { resolveServerDb } from "@/lib/db-server";
import { t } from "@/lib/i18n";
import { verifyLoginTicket } from "@/lib/login-ticket";
import { requestLocale } from "@/lib/request-locale";
import { normalizePhone, verifySmsOtp } from "@/lib/sms-otp";
import {
  parseAdminEmails,
  type UserRole,
  type UserStatus,
} from "@/lib/user-fields";

/**
 * Lazy D1 adapter: resolves Cloudflare env per call so NextAuth config stays sync.
 */
function lazyInkAuthAdapter(): Adapter {
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
  });
}

async function emailSubject() {
  try {
    return t(await requestLocale(), "emailSubject");
  } catch {
    return t("zh", "emailSubject");
  }
}

async function emailHtml(url: string) {
  let lead = t("zh", "emailLead");
  try {
    lead = t(await requestLocale(), "emailLead");
  } catch {
    /* keep Chinese */
  }
  return `<p>${lead}</p><p><a href="${url}">${url}</a></p>`;
}

async function enrichTokenFromRow(
  token: {
    sub?: string;
    email?: string | null;
    role?: UserRole;
    status?: UserStatus;
    phone?: string | null;
  },
  row: UserRow,
  db: NonNullable<Awaited<ReturnType<typeof resolveServerDb>>>,
) {
  const role = await promoteAdminIfListed(
    db,
    row.id,
    row.email,
    parseAdminEmails(process.env.ADMIN_EMAILS),
  );
  token.sub = row.id;
  token.email = row.email;
  token.phone = row.phone;
  token.role = role;
  token.status = row.status;
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  providers: [
    Resend({
      apiKey: process.env.AUTH_RESEND_KEY ?? "re_dev_console_only",
      from: process.env.AUTH_EMAIL_FROM ?? "onboarding@resend.dev",
      async sendVerificationRequest({ identifier, url, provider }) {
        console.info(`[inkara:auth] Magic link for ${identifier}\n${url}`);
        const key = process.env.AUTH_RESEND_KEY;
        if (!key) return;
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${key}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: provider.from,
            to: [identifier],
            subject: await emailSubject(),
            html: await emailHtml(url),
          }),
        });
        if (!res.ok) {
          throw new Error(`Resend failed: ${await res.text()}`);
        }
      },
    }),
    Credentials({
      id: "sms",
      name: "SMS",
      credentials: {
        phone: { label: "Phone", type: "text" },
        code: { label: "Code", type: "text" },
      },
      async authorize(credentials) {
        const phoneRaw = String(credentials?.phone ?? "");
        const code = String(credentials?.code ?? "");
        const phone = normalizePhone(phoneRaw);
        if (!phone || !/^\d{6}$/.test(code)) return null;
        const db = await resolveServerDb();
        if (!db) return null;
        const verified = await verifySmsOtp(db, phone, code);
        if (!verified.ok) return null;
        const row = await upsertUserByPhone(db, phone);
        if (row.status === "banned") return null;
        return {
          id: row.id,
          email: row.email ?? undefined,
          name: row.name,
          image: row.image,
        };
      },
    }),
    Credentials({
      id: "ticket",
      name: "Ticket",
      credentials: {
        ticket: { label: "Ticket", type: "text" },
      },
      async authorize(credentials) {
        const ticket = String(credentials?.ticket ?? "");
        const userId = verifyLoginTicket(ticket);
        if (!userId) return null;
        const db = await resolveServerDb();
        if (!db) return null;
        const row = await getUserRow(db, userId);
        if (!row || row.status === "banned") return null;
        return {
          id: row.id,
          email: row.email ?? undefined,
          name: row.name,
          image: row.image,
        };
      },
    }),
  ],
  adapter: lazyInkAuthAdapter(),
  callbacks: {
    async signIn({ user }) {
      if (!user?.id) return true;
      const db = await resolveServerDb();
      if (!db) return false;
      const row = await getUserRow(db, user.id);
      if (row?.status === "banned") return false;
      return true;
    },
    async jwt({ token, user, trigger }) {
      const db = await resolveServerDb();
      if (user?.id && db) {
        const row = await getUserRow(db, user.id);
        if (row) await enrichTokenFromRow(token, row, db);
        else {
          token.sub = user.id;
          if (user.email) token.email = user.email;
          token.role = "user";
          token.status = "active";
        }
        return token;
      }
      if ((trigger === "update" || !token.role) && token.sub && db) {
        const row = await getUserRow(db, token.sub);
        if (row) await enrichTokenFromRow(token, row, db);
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        const u = session.user as {
          id: string;
          email?: string | null;
          phone?: string | null;
          role: UserRole;
          status: UserStatus;
        };
        u.id = token.sub ?? "";
        u.email = typeof token.email === "string" ? token.email : null;
        u.phone = typeof token.phone === "string" ? token.phone : null;
        u.role = (token.role as UserRole) ?? "user";
        u.status = (token.status as UserStatus) ?? "active";
      }
      return session;
    },
  },
});
