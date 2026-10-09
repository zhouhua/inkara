import { createMicPcmStream } from "./stt-pcm";

export const VOICE_MAX_MS = 180_000;
export const VOICE_WARN_MS = 120_000;

const STOP_TIMEOUT_MS = 3_000;

export type AsrEvent = {
  text: string;
  isFinal?: boolean;
};

export type AsrState = {
  committed: string;
  partial: string;
};

/**
 * Paraformer sends the current sentence, not the full transcript.
 * Partials replace the in-progress sentence. A final sentence is appended
 * to `committed` and the partial is cleared.
 * Display text is `committed + partial`.
 */
export function accumulateAsr(state: AsrState, event: AsrEvent): AsrState {
  if (!event.text) return state;
  if (event.isFinal) {
    return { committed: state.committed + event.text, partial: "" };
  }
  return { committed: state.committed, partial: event.text };
}

export function asrDisplayText(state: AsrState): string {
  return state.committed + state.partial;
}

export type SttClientHandlers = {
  onPartial: (text: string) => void;
  onError: (code: string) => void;
};

type TicketBody = {
  ticket?: unknown;
  wsUrl?: unknown;
  error?: unknown;
};

function ticketUrl(wsUrl: string, ticket: string): string {
  const url = new URL(wsUrl);
  url.searchParams.set("ticket", ticket);
  return url.toString();
}

async function requestTicket(): Promise<{ ticket: string; wsUrl: string }> {
  let res: Response;
  try {
    res = await fetch("/api/stt/ticket", { method: "POST" });
  } catch {
    throw new Error("ticket_network");
  }
  let body: TicketBody = {};
  try {
    body = (await res.json()) as TicketBody;
  } catch {
    body = {};
  }
  if (!res.ok) {
    const code =
      typeof body.error === "string" && body.error
        ? body.error
        : `ticket_${res.status}`;
    throw new Error(code);
  }
  if (typeof body.ticket !== "string" || typeof body.wsUrl !== "string") {
    throw new Error("ticket_invalid");
  }
  return { ticket: body.ticket, wsUrl: body.wsUrl };
}

function readResult(data: unknown): AsrEvent | null {
  if (typeof data !== "string") return null;
  let msg: unknown;
  try {
    msg = JSON.parse(data);
  } catch {
    return null;
  }
  if (!msg || typeof msg !== "object") return null;
  const rec = msg as { type?: unknown; text?: unknown; isFinal?: unknown };
  if (rec.type !== "result" || typeof rec.text !== "string" || !rec.text) {
    return null;
  }
  return { text: rec.text, isFinal: rec.isFinal === true };
}

function mapMicError(err: unknown): Error {
  if (err instanceof Error && err.message === "mic_unsupported") return err;
  const name =
    typeof err === "object" && err && "name" in err
      ? String((err as { name: unknown }).name)
      : "";
  if (
    name === "NotAllowedError" ||
    name === "PermissionDeniedError" ||
    name === "SecurityError"
  ) {
    return new Error("mic_denied");
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") {
    return new Error("mic_unavailable");
  }
  return new Error("mic_failed");
}

function waitForSocketClose(ws: WebSocket, ms: number): Promise<void> {
  if (ws.readyState === WebSocket.CLOSED) return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      ws.removeEventListener("close", done);
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(() => {
      ws.removeEventListener("close", done);
      if (
        ws.readyState === WebSocket.OPEN ||
        ws.readyState === WebSocket.CONNECTING
      ) {
        ws.close();
      }
      resolve();
    }, ms);
    ws.addEventListener("close", done);
  });
}

function openSocket(url: string): Promise<WebSocket> {
  const ws = new WebSocket(url);
  ws.binaryType = "arraybuffer";
  return new Promise((resolve, reject) => {
    const fail = (code: string) => {
      cleanup();
      if (
        ws.readyState === WebSocket.OPEN ||
        ws.readyState === WebSocket.CONNECTING
      ) {
        ws.close();
      }
      reject(new Error(code));
    };
    const onOpen = () => {
      cleanup();
      resolve(ws);
    };
    const onError = () => fail("ws_error");
    const onClose = (ev: CloseEvent) => fail(`ws_closed_${ev.code || 1006}`);
    function cleanup() {
      ws.removeEventListener("open", onOpen);
      ws.removeEventListener("error", onError);
      ws.removeEventListener("close", onClose);
    }
    ws.addEventListener("open", onOpen);
    ws.addEventListener("error", onError);
    ws.addEventListener("close", onClose);
  });
}

/**
 * Starts a browser STT session (ticket + WebSocket + mic PCM stream).
 * Throws on startup failures (ticket, socket open, mic permission).
 * Mid-session faults are reported via `handlers.onError` without throwing.
 */
export async function startSttSession(
  handlers: SttClientHandlers,
): Promise<{ stop: () => Promise<void> }> {
  const { ticket, wsUrl } = await requestTicket();
  let url: string;
  try {
    url = ticketUrl(wsUrl, ticket);
  } catch {
    throw new Error("ticket_invalid");
  }
  const ws = await openSocket(url);

  let asr: AsrState = { committed: "", partial: "" };
  let userStop = false;
  ws.addEventListener("message", (ev) => {
    const event = readResult(ev.data);
    if (!event) return;
    asr = accumulateAsr(asr, event);
    handlers.onPartial(asrDisplayText(asr));
  });
  let mic: { stop: () => void } | null = null;
  ws.addEventListener("close", (ev) => {
    if (userStop || ev.code === 1000) return;
    try {
      mic?.stop();
    } catch {
      /* mic already stopped */
    }
    handlers.onError(`ws_closed_${ev.code || 1006}`);
  });

  try {
    mic = await createMicPcmStream((pcm) => {
      if (ws.readyState !== WebSocket.OPEN) return;
      ws.send(pcm);
    });
  } catch (err) {
    if (
      ws.readyState === WebSocket.OPEN ||
      ws.readyState === WebSocket.CONNECTING
    ) {
      ws.close();
    }
    throw mapMicError(err);
  }

  let stopPromise: Promise<void> | null = null;
  return {
    stop() {
      if (!stopPromise) {
        stopPromise = (async () => {
          userStop = true;
          try {
            mic!.stop();
          } catch {
            /* mic already stopped */
          }
          if (ws.readyState === WebSocket.OPEN) {
            try {
              ws.send(JSON.stringify({ type: "finish" }));
            } catch {
              /* socket already closing */
            }
          }
          await waitForSocketClose(ws, STOP_TIMEOUT_MS);
        })();
      }
      return stopPromise;
    },
  };
}
