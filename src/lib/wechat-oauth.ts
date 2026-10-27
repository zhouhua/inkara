/**
 * WeChat Open Platform website QR login.
 * https://developers.weixin.qq.com/doc/oplatform/Website_App/WeChat_Login/Wechat_Login.html
 */

export function wechatConfigured(): boolean {
  return Boolean(
    process.env.WECHAT_OPEN_APP_ID && process.env.WECHAT_OPEN_APP_SECRET,
  );
}

export function wechatAuthorizeUrl(state: string, redirectUri: string): string {
  const appId = process.env.WECHAT_OPEN_APP_ID!;
  const q = new URLSearchParams({
    appid: appId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "snsapi_login",
    state,
  });
  return `https://open.weixin.qq.com/connect/qrconnect?${q.toString()}#wechat_redirect`;
}

export type WechatTokenResult = {
  access_token: string;
  expires_in: number;
  refresh_token: string;
  openid: string;
  scope: string;
  unionid?: string;
};

export async function exchangeWechatCode(
  code: string,
): Promise<WechatTokenResult> {
  const appId = process.env.WECHAT_OPEN_APP_ID;
  const secret = process.env.WECHAT_OPEN_APP_SECRET;
  if (!appId || !secret) {
    throw new Error("wechat_not_configured");
  }
  const q = new URLSearchParams({
    appid: appId,
    secret,
    code,
    grant_type: "authorization_code",
  });
  const res = await fetch(
    `https://api.weixin.qq.com/sns/oauth2/access_token?${q.toString()}`,
  );
  const body = (await res.json()) as WechatTokenResult & {
    errcode?: number;
    errmsg?: string;
  };
  if (body.errcode || !body.openid || !body.access_token) {
    throw new Error(
      `wechat_token: ${body.errmsg ?? body.errcode ?? "unknown"}`,
    );
  }
  return body;
}

export async function fetchWechatProfile(
  accessToken: string,
  openid: string,
): Promise<{ nickname?: string; headimgurl?: string; unionid?: string }> {
  const q = new URLSearchParams({
    access_token: accessToken,
    openid,
  });
  const res = await fetch(
    `https://api.weixin.qq.com/sns/userinfo?${q.toString()}`,
  );
  return (await res.json()) as {
    nickname?: string;
    headimgurl?: string;
    unionid?: string;
  };
}
