export type PaperErrorAction =
  | "open_settings"
  | "open_billing"
  | "retry"
  | "dismiss";

export function resolvePaperError(input: {
  error?: string;
  offline?: boolean;
}): { messageKey: string; action: PaperErrorAction } {
  if (input.offline) return { messageKey: "offline", action: "retry" };
  switch (input.error) {
    case "quota_exceeded":
    case "quota_exhausted":
      return { messageKey: "quotaExceeded", action: "open_billing" };
    case "login_required":
      return { messageKey: "loginRequired", action: "open_billing" };
    case "missing_api_key":
      // Platform misconfig — not a user BYOK path anymore
      return { messageKey: "upstreamBusy", action: "retry" };
    case "unauthorized":
      return { messageKey: "upstreamBusy", action: "retry" };
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
