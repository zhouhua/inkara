import NextAuth from "next-auth";
import Resend from "next-auth/providers/resend";
import type { Adapter } from "@auth/core/adapters";
import { createInkAuthAdapter } from "@/lib/auth-adapter";
import { resolveServerDb } from "@/lib/db-server";
import { t } from "@/lib/i18n";
import { requestLocale } from "@/lib/request-locale";

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

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  session: { strategy: "jwt" },
  pages: {
    signIn: "/api/auth/signin",
  },
  providers: [
    Resend({
      // Placeholder allowed in local/dev when sendVerificationRequest only logs.
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
  ],
  adapter: lazyInkAuthAdapter(),
  callbacks: {
    async jwt({ token, user }) {
      if (user?.id) {
        token.sub = user.id;
      }
      if (user?.email) {
        token.email = user.email;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub ?? "";
        if (typeof token.email === "string") {
          session.user.email = token.email;
        }
      }
      return session;
    },
  },
});
