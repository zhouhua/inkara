interface Env {
  DASHSCOPE_API_KEY?: string;
  STT_TICKET_SECRET?: string;
  AUTH_SECRET?: string;
}

interface CfWebSocket extends WebSocket {
  accept(): void;
}

declare class WebSocketPair {
  0: CfWebSocket;
  1: CfWebSocket;
}

interface ResponseInit {
  webSocket?: CfWebSocket;
}

interface Response {
  readonly webSocket: CfWebSocket | null;
}
