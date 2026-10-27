import { NextResponse } from "next/server";
import { createInkAuthAdapter, getUserRow } from "@/lib/auth-adapter";
import { resolveServerDb } from "@/lib/db-server";
import { mintLoginTicket } from "@/lib/login-ticket";
import {
  exchangeWechatCode,
  fetchWechatProfile,
  wechatConfigured,
} from "@/lib/wechat-oauth";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookieState = req.headers
    .get("cookie")
    ?.match(/(?:^|;\s*)inkara_wx_state=([^;]+)/)?.[1];

  if (!wechatConfigured()) {
    return NextResponse.redirect(
      new URL("/login?error=wechat_not_configured", url.origin),
    );
  }
  if (!code || !state || !cookieState || state !== cookieState) {
    return NextResponse.redirect(
      new URL("/login?error=wechat_state", url.origin),
    );
  }

  const db = await resolveServerDb();
  if (!db) {
    return NextResponse.redirect(new URL("/login?error=db", url.origin));
  }

  try {
    const token = await exchangeWechatCode(code);
    const profile = await fetchWechatProfile(token.access_token, token.openid);
    const adapter = createInkAuthAdapter(db);
    const providerAccountId = token.unionid || token.openid;
    let user = await adapter.getUserByAccount!({
      provider: "wechat",
      providerAccountId,
    });
    if (!user) {
      user = await adapter.createUser!({
        id: crypto.randomUUID(),
        email: "",
        emailVerified: null,
        name: profile.nickname ?? null,
        image: profile.headimgurl ?? null,
      });
      await adapter.linkAccount!({
        userId: user.id,
        type: "oauth",
        provider: "wechat",
        providerAccountId,
        access_token: token.access_token,
        refresh_token: token.refresh_token,
        expires_at: Math.floor(Date.now() / 1000) + (token.expires_in || 7200),
        token_type: "bearer",
        scope: token.scope,
      });
    }
    const row = await getUserRow(db, user.id);
    if (row?.status === "banned") {
      return NextResponse.redirect(new URL("/login?error=banned", url.origin));
    }
    const ticket = mintLoginTicket(user.id);
    const res = NextResponse.redirect(
      new URL(`/login?ticket=${encodeURIComponent(ticket)}`, url.origin),
    );
    res.cookies.set("inkara_wx_state", "", { path: "/", maxAge: 0 });
    return res;
  } catch (err) {
    console.error("[inkara:auth] wechat callback", err);
    return NextResponse.redirect(new URL("/login?error=wechat", url.origin));
  }
}
