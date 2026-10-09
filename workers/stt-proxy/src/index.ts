import {
  DASHSCOPE_WS_URL,
  buildFinishTask,
  buildRunTask,
  parseClientControl,
  parseUpstreamEvent,
} from "./dashscope";
import { resolveTicketSecret, verifySttTicket } from "./ticket";

const MAX_PENDING_BYTES = 2_000_000;

const worker = {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return new Response("Expected Upgrade: websocket", { status: 426 });
    }

    const secret = resolveTicketSecret(env);
    if (!secret) {
      return new Response("STT ticket secret is not configured", { status: 500 });
    }

    const ticket = new URL(request.url).searchParams.get("ticket");
    if (!ticket || !(await verifySttTicket(secret, ticket))) {
      return new Response("Unauthorized", { status: 401 });
    }

    const apiKey = env.DASHSCOPE_API_KEY?.trim();
    if (!apiKey) {
      return new Response("STT upstream is not configured", { status: 500 });
    }

    let upstreamResponse: Response;
    try {
      upstreamResponse = await fetch(DASHSCOPE_WS_URL, {
        headers: {
          Upgrade: "websocket",
          Authorization: `Bearer ${apiKey}`,
        },
      });
    } catch {
      return new Response("Upstream websocket rejected", { status: 502 });
    }
    const upstream = upstreamResponse.webSocket;
    if (!upstream) {
      await upstreamResponse.body?.cancel().catch(() => undefined);
      return new Response("Upstream websocket rejected", { status: 502 });
    }

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];

    upstream.accept();
    server.accept();
    bridge(server, upstream, crypto.randomUUID());

    return new Response(null, { status: 101, webSocket: client });
  },
};

export default worker;

const MAX_CLOSE_REASON_BYTES = 123;

function truncateCloseReason(reason: string): string {
  if (!reason) return "";
  const bytes = new TextEncoder().encode(reason);
  if (bytes.byteLength <= MAX_CLOSE_REASON_BYTES) return reason;
  let end = reason.length;
  while (end > 0 && new TextEncoder().encode(reason.slice(0, end)).byteLength > MAX_CLOSE_REASON_BYTES) {
    end -= 1;
  }
  return reason.slice(0, end);
}

function normalizeUpstreamCloseCode(code: number): number {
  if (!code || code === 1005 || code === 1006) return 1011;
  const ok =
    code === 1000 ||
    code === 1001 ||
    code === 1002 ||
    code === 1003 ||
    (code >= 1007 && code <= 1014) ||
    (code >= 3000 && code <= 4999);
  return ok ? code : 1011;
}

function bridge(client: CfWebSocket, upstream: CfWebSocket, taskId: string) {
  let started = false;
  let finishPending = false;
  let finishSent = false;
  let taskFinished = false;
  let closing = false;
  let pendingBytes = 0;
  const pending: ArrayBuffer[] = [];

  const closeBoth = (code = 1000, reason = "") => {
    if (closing) return;
    closing = true;
    const safeReason = truncateCloseReason(reason);
    try {
      upstream.close(code, safeReason);
    } catch {
      /* already closed */
    }
    try {
      client.close(code, safeReason);
    } catch {
      /* already closed */
    }
  };

  const sendUpstream = (data: string | ArrayBuffer): boolean => {
    if (closing) return false;
    try {
      upstream.send(data);
      return true;
    } catch {
      closeBoth(1011, "upstream-send-failed");
      return false;
    }
  };

  const sendClient = (data: string): boolean => {
    if (closing) return false;
    try {
      client.send(data);
      return true;
    } catch {
      closeBoth(1011, "client-send-failed");
      return false;
    }
  };

  const sendFinish = () => {
    if (finishSent || closing) return;
    finishSent = true;
    sendUpstream(JSON.stringify(buildFinishTask(taskId)));
  };

  const flushPending = () => {
    for (const chunk of pending) {
      if (!sendUpstream(chunk)) return;
    }
    pending.length = 0;
    pendingBytes = 0;
    if (finishPending) sendFinish();
  };

  upstream.addEventListener("message", (event) => {
    if (closing || typeof event.data !== "string") return;
    const parsed = parseUpstreamEvent(event.data);
    if (parsed.type === "task-started") {
      if (started) return;
      started = true;
      flushPending();
      return;
    }
    if (parsed.type === "result") {
      sendClient(JSON.stringify(parsed.message));
      return;
    }
    if (parsed.type === "task-finished") {
      taskFinished = true;
      closeBoth(1000);
      return;
    }
    if (parsed.type === "task-failed") {
      closeBoth(1011, "task-failed");
    }
  });

  upstream.addEventListener("close", (event) => {
    if (closing) return;
    const { code, reason } = event as CloseEvent;
    let forwardCode = normalizeUpstreamCloseCode(code);
    if (forwardCode === 1000 && !taskFinished) forwardCode = 1011;
    closeBoth(forwardCode, reason);
  });
  upstream.addEventListener("error", () => closeBoth(1011, "upstream error"));

  client.addEventListener("message", (event) => {
    if (closing) return;
    void handleClientMessage(event.data);
  });
  client.addEventListener("close", () => closeBoth(1000));
  client.addEventListener("error", () => closeBoth(1011, "client error"));

  if (!sendUpstream(JSON.stringify(buildRunTask(taskId)))) return;

  async function handleClientMessage(data: unknown) {
    if (closing) return;
    if (typeof data === "string") {
      if (parseClientControl(data) !== "finish" || finishSent) return;
      if (!started) {
        finishPending = true;
        return;
      }
      sendFinish();
      return;
    }
    if (finishSent) return;
    const buf = await toArrayBuffer(data);
    if (!buf || closing) return;
    if (!started) {
      if (pendingBytes + buf.byteLength > MAX_PENDING_BYTES) {
        closeBoth(1011, "audio buffered before task-started");
        return;
      }
      pending.push(buf);
      pendingBytes += buf.byteLength;
      return;
    }
    sendUpstream(buf);
  }
}

async function toArrayBuffer(data: unknown): Promise<ArrayBuffer | null> {
  if (data instanceof ArrayBuffer) return copyBytes(new Uint8Array(data));
  if (ArrayBuffer.isView(data)) {
    return copyBytes(
      new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
    );
  }
  if (typeof Blob !== "undefined" && data instanceof Blob) {
    return data.arrayBuffer();
  }
  return null;
}

function copyBytes(bytes: Uint8Array): ArrayBuffer {
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  return copy;
}
