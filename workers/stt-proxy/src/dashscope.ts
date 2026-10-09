// Workers fetch rejects wss:// URLs. https + Upgrade: websocket opens the same DashScope socket.
export const DASHSCOPE_WS_URL =
  "https://dashscope.aliyuncs.com/api-ws/v1/inference";

export type ClientResultMessage = {
  type: "result";
  text: string;
  isFinal?: boolean;
};

export type UpstreamEvent =
  | { type: "task-started" }
  | { type: "task-finished" }
  | { type: "task-failed"; message: string }
  | { type: "result"; message: ClientResultMessage }
  | { type: "ignore" };

type Sentence = {
  text?: unknown;
  sentence_end?: unknown;
  heartbeat?: unknown;
};

export function buildRunTask(taskId: string) {
  return {
    header: {
      action: "run-task",
      task_id: taskId,
      streaming: "duplex",
    },
    payload: {
      task_group: "audio",
      task: "asr",
      function: "recognition",
      model: "paraformer-realtime-v2",
      parameters: {
        format: "pcm",
        sample_rate: 16000,
        disfluency_removal_enabled: true,
        language_hints: ["zh"],
        heartbeat: true,
      },
      input: {},
    },
  };
}

export function buildFinishTask(taskId: string) {
  return {
    header: {
      action: "finish-task",
      task_id: taskId,
      streaming: "duplex",
    },
    payload: {
      input: {},
    },
  };
}

export function parseClientControl(raw: string): "finish" | null {
  try {
    const msg = JSON.parse(raw) as { type?: unknown };
    if (msg?.type === "finish") return "finish";
  } catch {
    return null;
  }
  return null;
}

// result-generated text: payload.output.sentence.text (current sentence; sentence_end → isFinal). Skip sentence.heartbeat.
export function extractResultGenerated(
  message: unknown
): ClientResultMessage | "heartbeat" | null {
  if (!message || typeof message !== "object") return null;
  const sentence = (
    message as { payload?: { output?: { sentence?: Sentence } } }
  ).payload?.output?.sentence;
  if (!sentence || typeof sentence !== "object" || Array.isArray(sentence)) {
    return null;
  }
  if (sentence.heartbeat === true) return "heartbeat";
  if (typeof sentence.text !== "string" || sentence.text.length === 0) {
    return null;
  }
  return {
    type: "result",
    text: sentence.text,
    isFinal: sentence.sentence_end === true,
  };
}

export function parseUpstreamEvent(raw: string): UpstreamEvent {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return { type: "ignore" };
  }
  if (!data || typeof data !== "object") return { type: "ignore" };
  const header = (data as { header?: { event?: unknown; error_message?: unknown } })
    .header;
  const event = header?.event;
  if (event === "task-started") return { type: "task-started" };
  if (event === "task-finished") return { type: "task-finished" };
  if (event === "task-failed") {
    const message =
      typeof header?.error_message === "string" && header.error_message
        ? header.error_message
        : "task-failed";
    return { type: "task-failed", message };
  }
  if (event === "result-generated") {
    const result = extractResultGenerated(data);
    if (!result || result === "heartbeat") return { type: "ignore" };
    return { type: "result", message: result };
  }
  return { type: "ignore" };
}
