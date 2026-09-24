export type PaperErrorAction = "open_settings" | "retry" | "dismiss";

export function resolvePaperError(input: {
  error?: string;
  offline?: boolean;
}): { messageKey: string; action: PaperErrorAction } {
  if (input.offline) return { messageKey: "offline", action: "retry" };
  switch (input.error) {
    case "quota_exceeded":
      return { messageKey: "quotaExceeded", action: "open_settings" };
    case "missing_api_key":
      return { messageKey: "missingKey", action: "open_settings" };
    case "unauthorized":
      return { messageKey: "unauthorizedKey", action: "open_settings" };
    case "request_failed":
    case "network":
      return { messageKey: "networkError", action: "retry" };
    case "upstream_error":
    case "empty_upstream":
    case "stream_incomplete":
    case "empty_reply":
      return { messageKey: "upstreamBusy", action: "retry" };
    default:
      return { messageKey: "upstreamBusy", action: "retry" };
  }
}

export function resolveRecallMissError(): {
  messageKey: string;
  action: PaperErrorAction;
} {
  return { messageKey: "recallMiss", action: "dismiss" };
}
