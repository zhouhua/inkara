import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  VOICE_MAX_MS,
  VOICE_WARN_MS,
  accumulateAsr,
  asrDisplayText,
  startSttSession,
} from "./stt-client";
import { createMicPcmStream, createPcmFramer, floatToInt16 } from "./stt-pcm";

const mic = vi.hoisted(() => {
  const state: {
    onFrame: ((pcm: Int16Array) => void) | null;
    stop: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
  } = {
    onFrame: null,
    stop: vi.fn(),
    create: vi.fn(),
  };
  state.create.mockImplementation(async (onFrame: (pcm: Int16Array) => void) => {
    state.onFrame = onFrame;
    return { stop: state.stop };
  });
  return state;
});

vi.mock("./stt-pcm", async () => {
  const actual = await vi.importActual<typeof import("./stt-pcm")>("./stt-pcm");
  return { ...actual, createMicPcmStream: mic.create };
});

type Listener = (ev: { data?: unknown; code?: number; reason?: string }) => void;

class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  url: string;
  binaryType = "blob";
  readyState = MockWebSocket.CONNECTING;
  sent: unknown[] = [];
  private listeners = new Map<string, Set<Listener>>();

  constructor(url: string) {
    this.url = url;
    sockets.push(this);
    const mode = openMode;
    queueMicrotask(() => {
      if (this.readyState === MockWebSocket.CLOSED) return;
      if (mode === "error") {
        this.emit("error", {});
        return;
      }
      if (mode === "close") {
        this.readyState = MockWebSocket.CLOSED;
        this.emit("close", { code: 1006, reason: "" });
        return;
      }
      this.readyState = MockWebSocket.OPEN;
      this.emit("open", {});
    });
  }

  addEventListener(type: string, fn: Listener) {
    let set = this.listeners.get(type);
    if (!set) {
      set = new Set();
      this.listeners.set(type, set);
    }
    set.add(fn);
  }

  removeEventListener(type: string, fn: Listener) {
    this.listeners.get(type)?.delete(fn);
  }

  send(data: unknown) {
    this.sent.push(data);
  }

  close(code = 1000, reason = "") {
    if (this.readyState === MockWebSocket.CLOSED) return;
    this.readyState = MockWebSocket.CLOSED;
    this.emit("close", { code, reason });
  }

  serverMessage(data: string) {
    this.emit("message", { data });
  }

  private emit(type: string, ev: { data?: unknown; code?: number; reason?: string }) {
    const set = this.listeners.get(type);
    if (!set) return;
    for (const fn of [...set]) fn(ev);
  }
}

let sockets: MockWebSocket[] = [];
let openMode: "open" | "error" | "close" = "open";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function ticketOk(wsUrl = "ws://localhost:8787") {
  return jsonResponse({
    ticket: "1700000000000.abc123",
    expiresAt: 1_700_000_120_000,
    wsUrl,
  });
}

beforeEach(() => {
  sockets = [];
  openMode = "open";
  mic.onFrame = null;
  mic.stop.mockReset();
  mic.create.mockReset();
  mic.create.mockImplementation(async (onFrame: (pcm: Int16Array) => void) => {
    mic.onFrame = onFrame;
    return { stop: mic.stop };
  });
  vi.stubGlobal("WebSocket", MockWebSocket);
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ticketOk()),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("accumulateAsr", () => {
  it("replaces the partial, then commits finals without duplicating", () => {
    let state = { committed: "", partial: "" };
    state = accumulateAsr(state, { text: "今" });
    expect(state).toEqual({ committed: "", partial: "今" });
    expect(asrDisplayText(state)).toBe("今");

    state = accumulateAsr(state, { text: "今天" });
    expect(state).toEqual({ committed: "", partial: "今天" });
    expect(asrDisplayText(state)).toBe("今天");

    state = accumulateAsr(state, { text: "今天天气不错。", isFinal: true });
    expect(state).toEqual({ committed: "今天天气不错。", partial: "" });
    expect(asrDisplayText(state)).toBe("今天天气不错。");

    state = accumulateAsr(state, { text: "明天" });
    expect(asrDisplayText(state)).toBe("今天天气不错。明天");

    state = accumulateAsr(state, { text: "明天也好。", isFinal: true });
    expect(state).toEqual({
      committed: "今天天气不错。明天也好。",
      partial: "",
    });
    expect(asrDisplayText(state)).toBe("今天天气不错。明天也好。");
  });

  it("ignores empty text", () => {
    const state = { committed: "已", partial: "在" };
    expect(accumulateAsr(state, { text: "" })).toBe(state);
    expect(accumulateAsr(state, { text: "", isFinal: true })).toBe(state);
  });
});

describe("createPcmFramer", () => {
  it("converts 16 kHz float samples to little-endian int16 frames", () => {
    const frames: Int16Array[] = [];
    const framer = createPcmFramer(16_000, (pcm) => frames.push(pcm));
    const input = new Float32Array(1_600);
    input[0] = 0;
    input[1] = 0.5;
    input[2] = -1;
    input[3] = 1;
    framer.push(input);

    expect(frames).toHaveLength(1);
    expect(frames[0]).toHaveLength(1_600);
    expect(frames[0]![0]).toBe(0);
    expect(frames[0]![1]).toBe(16_384);
    expect(frames[0]![2]).toBe(-32_768);
    expect(frames[0]![3]).toBe(32_767);
    expect(floatToInt16(0.5)).toBe(16_384);

    const view = new DataView(frames[0]!.buffer, frames[0]!.byteOffset, 4);
    expect(view.getInt16(2, true)).toBe(16_384);
  });

  it("keeps sample order across chunk boundaries", () => {
    const frames: Int16Array[] = [];
    const framer = createPcmFramer(16_000, (pcm) => frames.push(pcm));
    const head = new Float32Array(1_000);
    const tail = new Float32Array(600);
    head[0] = 1;
    tail[0] = -1;
    framer.push(head);
    expect(frames).toHaveLength(0);
    framer.push(tail);
    expect(frames).toHaveLength(1);
    expect(frames[0]![0]).toBe(32_767);
    expect(frames[0]![1_000]).toBe(-32_768);
  });

  it("downsamples 32 kHz by taking every other sample", () => {
    const frames: Int16Array[] = [];
    const framer = createPcmFramer(32_000, (pcm) => frames.push(pcm));
    const input = new Float32Array(3_200);
    for (let i = 0; i < input.length; i++) input[i] = (i * 2) / 3_200;
    framer.push(input);
    expect(frames).toHaveLength(1);
    expect(frames[0]).toHaveLength(1_600);
    expect(frames[0]![1]).toBe(floatToInt16(4 / 3_200));
  });

  it("interpolates across a fractional chunk boundary", () => {
    const frames: Int16Array[] = [];
    const framer = createPcmFramer(24_000, (pcm) => frames.push(pcm));
    framer.push(new Float32Array([0, 1]));
    framer.push(new Float32Array([0, 1]));
    framer.flush();
    expect(Array.from(frames[0]!)).toEqual([0, floatToInt16(0.5), 32_767]);
  });

  it("flushes a short tail", () => {
    const frames: Int16Array[] = [];
    const framer = createPcmFramer(16_000, (pcm) => frames.push(pcm));
    framer.push(new Float32Array(100));
    framer.flush();
    expect(frames[0]).toHaveLength(100);
  });
});

describe("startSttSession", () => {
  it("exports the voice duration budget", () => {
    expect(VOICE_MAX_MS).toBe(180_000);
    expect(VOICE_WARN_MS).toBe(120_000);
  });

  it("fetches a ticket, streams pcm, and accumulates sentences", async () => {
    const onPartial = vi.fn();
    const onError = vi.fn();
    const session = await startSttSession({ onPartial, onError });

    expect(fetch).toHaveBeenCalledWith("/api/stt/ticket", { method: "POST" });
    expect(createMicPcmStream).toBe(mic.create);
    const ws = sockets[0]!;
    expect(ws.url).toBe(
      "ws://localhost:8787/?ticket=1700000000000.abc123",
    );
    expect(ws.binaryType).toBe("arraybuffer");

    ws.serverMessage(JSON.stringify({ type: "result", text: "今天", isFinal: false }));
    ws.serverMessage(
      JSON.stringify({ type: "result", text: "今天天气不错。", isFinal: true }),
    );
    ws.serverMessage(JSON.stringify({ type: "result", text: "明天" }));
    ws.serverMessage("not-json");
    ws.serverMessage(JSON.stringify({ type: "ignore" }));
    expect(onPartial.mock.calls.map((call) => call[0])).toEqual([
      "今天",
      "今天天气不错。",
      "今天天气不错。明天",
    ]);

    const pcm = new Int16Array([1, -2, 3]);
    mic.onFrame?.(pcm);
    expect(ws.sent[0]).toBe(pcm);

    const stopped = session.stop();
    expect(mic.stop).toHaveBeenCalledOnce();
    expect(ws.sent).toContain(JSON.stringify({ type: "finish" }));
    ws.close(1000);
    await stopped;
    expect(onError).not.toHaveBeenCalled();
  });

  it("appends the ticket when wsUrl already has a query", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ticketOk("wss://stt.example.com/ws?region=cn")),
    );
    await startSttSession({ onPartial: vi.fn(), onError: vi.fn() });
    const url = new URL(sockets[0]!.url);
    expect(url.searchParams.get("region")).toBe("cn");
    expect(url.searchParams.get("ticket")).toBe("1700000000000.abc123");
  });

  it("throws the ticket error code and does not open a socket", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ error: "missing_asr_key" }, 503)),
    );
    const onError = vi.fn();
    await expect(
      startSttSession({ onPartial: vi.fn(), onError }),
    ).rejects.toThrow("missing_asr_key");
    expect(onError).not.toHaveBeenCalled();
    expect(sockets).toHaveLength(0);
  });

  it("throws ticket_network when fetch fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("offline");
      }),
    );
    await expect(
      startSttSession({ onPartial: vi.fn(), onError: vi.fn() }),
    ).rejects.toThrow("ticket_network");
  });

  it("rejects when the socket closes before open", async () => {
    openMode = "close";
    await expect(
      startSttSession({ onPartial: vi.fn(), onError: vi.fn() }),
    ).rejects.toThrow("ws_closed_1006");
  });

  it("maps microphone denial and closes the socket", async () => {
    mic.create.mockRejectedValueOnce(
      Object.assign(new Error("denied"), { name: "NotAllowedError" }),
    );
    await expect(
      startSttSession({ onPartial: vi.fn(), onError: vi.fn() }),
    ).rejects.toThrow("mic_denied");
    expect(sockets[0]!.readyState).toBe(MockWebSocket.CLOSED);
  });

  it("reports an abnormal close after the session starts", async () => {
    const onError = vi.fn();
    await startSttSession({ onPartial: vi.fn(), onError });
    sockets[0]!.close(1011, "task-failed");
    expect(mic.stop).toHaveBeenCalledOnce();
    expect(onError).toHaveBeenCalledWith("ws_closed_1011");
  });

  it("closes the socket if finish does not complete within 3s", async () => {
    vi.useFakeTimers();
    const onError = vi.fn();
    const session = await startSttSession({ onPartial: vi.fn(), onError });
    const ws = sockets[0]!;
    const pending = session.stop();
    expect(ws.sent).toContain(JSON.stringify({ type: "finish" }));
    await vi.advanceTimersByTimeAsync(2_999);
    expect(ws.readyState).toBe(MockWebSocket.OPEN);
    await vi.advanceTimersByTimeAsync(1);
    await pending;
    expect(ws.readyState).toBe(MockWebSocket.CLOSED);
    expect(onError).not.toHaveBeenCalled();
  });

  it("shares one stop promise", async () => {
    const session = await startSttSession({
      onPartial: vi.fn(),
      onError: vi.fn(),
    });
    const ws = sockets[0]!;
    const first = session.stop();
    const second = session.stop();
    expect(first).toBe(second);
    ws.close(1000);
    await first;
    expect(ws.sent.filter((item) => item === JSON.stringify({ type: "finish" }))).toHaveLength(1);
  });
});
