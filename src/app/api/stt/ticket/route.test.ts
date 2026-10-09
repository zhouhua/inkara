import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { POST } from "@/app/api/stt/ticket/route";
import { verifySttTicket } from "@/lib/stt-ticket";

const envSnapshot = { ...process.env };

beforeEach(() => {
  process.env = { ...envSnapshot };
  process.env.STT_TICKET_SECRET = "test-ticket-secret";
  process.env.DASHSCOPE_API_KEY = "dash-test-key";
  delete process.env.AUTH_SECRET;
  delete process.env.MODEL_API_KEY;
  delete process.env.NEXT_PUBLIC_STT_WS_URL;
});

afterEach(() => {
  process.env = { ...envSnapshot };
});

function postTicket() {
  return POST(new Request("http://localhost/api/stt/ticket", { method: "POST" }));
}

describe("POST /api/stt/ticket", () => {
  it("returns 503 when ticket secret is missing", async () => {
    delete process.env.STT_TICKET_SECRET;
    delete process.env.AUTH_SECRET;

    const res = await postTicket();
    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toMatchObject({
      error: "missing_ticket_secret",
    });
  });

  it("returns 503 when ASR key is missing", async () => {
    delete process.env.DASHSCOPE_API_KEY;
    delete process.env.MODEL_API_KEY;

    const res = await postTicket();
    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toMatchObject({ error: "missing_asr_key" });
  });

  it("accepts MODEL_API_KEY when DASHSCOPE_API_KEY is unset", async () => {
    delete process.env.DASHSCOPE_API_KEY;
    process.env.MODEL_API_KEY = "model-fallback-key";

    const res = await postTicket();
    expect(res.status).toBe(200);
  });

  it("returns 200 with ticket, expiresAt, and default wsUrl in test", async () => {
    const res = await postTicket();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.wsUrl).toBe("ws://localhost:8787");
    expect(typeof body.ticket).toBe("string");
    expect(typeof body.expiresAt).toBe("number");
    expect(
      verifySttTicket(process.env.STT_TICKET_SECRET!, body.ticket, Date.now()),
    ).toBe(true);
  });

  it("uses NEXT_PUBLIC_STT_WS_URL when set", async () => {
    process.env.NEXT_PUBLIC_STT_WS_URL = "wss://stt.example.com/ws";

    const res = await postTicket();
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      wsUrl: "wss://stt.example.com/ws",
    });
  });
});
