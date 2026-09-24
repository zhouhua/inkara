export async function probeConnection(body: {
  apiKey: string;
  baseUrl?: string;
  model?: string;
  locale?: "zh" | "en";
}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const res = await fetch("/api/probe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await res.json()) as { ok?: boolean; error?: string };
    if (res.ok && data.ok) return { ok: true };
    return { ok: false, error: data.error || "upstream_error" };
  } catch {
    return { ok: false, error: "request_failed" };
  }
}
