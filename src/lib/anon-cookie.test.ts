import { describe, expect, it } from "vitest";
import {
  isAnonSubjectId,
  newAnonSubjectId,
  sealAnonCookieValue,
  unsealAnonCookieValue,
  readAnonSubjectFromRequest,
  wantSecureCookie,
} from "./anon-cookie";

describe("anon-cookie", () => {
  const secret = "test-auth-secret";

  it("only accepts signed anon_* ids", () => {
    const id = newAnonSubjectId();
    expect(isAnonSubjectId(id)).toBe(true);
    expect(isAnonSubjectId(crypto.randomUUID())).toBe(false);

    const sealed = sealAnonCookieValue(id, secret);
    expect(unsealAnonCookieValue(sealed, secret)).toBe(id);
    expect(unsealAnonCookieValue(id, secret)).toBeNull();
    expect(
      unsealAnonCookieValue(`${crypto.randomUUID()}.deadbeef`, secret),
    ).toBeNull();
  });

  it("rejects forged cookie header with a user uuid", () => {
    const userId = crypto.randomUUID();
    const req = new Request("http://localhost/", {
      headers: {
        cookie: `inkara_anon=${encodeURIComponent(`${userId}.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa`)}`,
      },
    });
    expect(readAnonSubjectFromRequest(req, secret)).toBeNull();
  });

  it("treats forwarded http as insecure even in production", () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      const httpReq = new Request("http://127.0.0.1/", {
        headers: { "x-forwarded-proto": "http" },
      });
      const httpsReq = new Request("http://127.0.0.1/", {
        headers: { "x-forwarded-proto": "https" },
      });
      expect(wantSecureCookie(httpReq)).toBe(false);
      expect(wantSecureCookie(httpsReq)).toBe(true);
    } finally {
      process.env.NODE_ENV = prev;
    }
  });

  it("reads a valid sealed cookie", () => {
    const id = newAnonSubjectId();
    const sealed = sealAnonCookieValue(id, secret);
    const req = new Request("http://localhost/", {
      headers: { cookie: `inkara_anon=${encodeURIComponent(sealed)}` },
    });
    expect(readAnonSubjectFromRequest(req, secret)).toBe(id);
  });
});
