export const runtime = "nodejs";
export const maxDuration = 30;

type ProbeBody = {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  locale?: "zh" | "en";
};

export async function POST(req: Request) {
  let body: ProbeBody;
  try {
    body = (await req.json()) as ProbeBody;
  } catch {
    return jsonError({ error: "invalid_json" }, 400);
  }

  const apiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
  if (!apiKey) {
    return jsonError({ error: "missing_api_key" }, 400);
  }

  const userBaseUrl =
    typeof body.baseUrl === "string" ? body.baseUrl.trim() : "";
  const baseUrl = (
    userBaseUrl ||
    process.env.MODEL_BASE_URL ||
    process.env.DASHSCOPE_BASE_URL ||
    ""
  ).replace(/\/$/, "");
  if (!baseUrl) {
    return jsonError({ error: "missing_base_url" }, 500);
  }

  const userModel = typeof body.model === "string" ? body.model.trim() : "";
  const model =
    userModel ||
    process.env.MODEL_NAME ||
    process.env.DASHSCOPE_MODEL ||
    "";
  if (!model) {
    return jsonError({ error: "missing_model" }, 500);
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        max_tokens: 8,
        stream: false,
        messages: [{ role: "user", content: "ping" }],
      }),
    });
  } catch {
    return jsonError({ error: "request_failed" }, 502);
  }

  if (!upstream.ok) {
    const code =
      upstream.status === 401 || upstream.status === 403
        ? "unauthorized"
        : "upstream_error";
    // Drain body for logging only — never return HTML to client
    const errText = await upstream.text().catch(() => "");
    console.error("Probe upstream error:", upstream.status, errText.slice(0, 200));
    return jsonError(
      {
        error: code,
        message: code === "unauthorized" ? "unauthorized" : "upstream",
      },
      code === "unauthorized" ? 401 : 502
    );
  }

  try {
    const data = (await upstream.json()) as { choices?: unknown[] };
    if (!Array.isArray(data.choices)) {
      return jsonError({ error: "upstream_error", message: "upstream" }, 502);
    }
  } catch {
    return jsonError({ error: "upstream_error", message: "upstream" }, 502);
  }

  return Response.json({ ok: true });
}

function jsonError(
  body: { error: string; message?: string },
  status: number
) {
  return Response.json(body, { status });
}
