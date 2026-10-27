import { NextResponse } from "next/server";
import { wechatAuthorizeUrl, wechatConfigured } from "@/lib/wechat-oauth";

export async function GET(req: Request) {
  if (!wechatConfigured()) {
    return NextResponse.json(
      { error: "wechat_not_configured", message: "微信登录未配置" },
      { status: 503 },
    );
  }
  const url = new URL(req.url);
  const callback = new URL("/api/auth/wechat/callback", url.origin).toString();
  const state = crypto.randomUUID();
  const res = NextResponse.redirect(wechatAuthorizeUrl(state, callback));
  res.cookies.set("inkara_wx_state", state, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return res;
}
