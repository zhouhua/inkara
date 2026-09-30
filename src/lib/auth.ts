import NextAuth from "next-auth";
import Resend from "next-auth/providers/resend";
import type { Adapter } from "@auth/core/adapters";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { createInkAuthAdapter } from "@/lib/auth-adapter";
import type { D1Database } from "@/lib/db-server";

/**
 * Lazy D1 adapter: resolves Cloudflare env per call so NextAuth config stays sync.
 */
function lazyInkAuthAdapter(): Adapter {
  return new Proxy({} as Adapter, {
    get(_target, prop) {
      if (typeof prop === "symbol" || prop === "then") return undefined;
      return async (...args: unknown[]) => {
        const { env } = await getCloudflareContext({ async: true });
        const db = (env as { DB: D1Database }).DB;
        if (!db) throw new Error("D1 binding DB is missing");
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
            subject: "登录墨语 · inkara",
            html: `<p>点击链接登录墨语：</p><p><a href="${url}">${url}</a></p>`,
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
