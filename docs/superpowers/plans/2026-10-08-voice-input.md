# Voice Input (Type Mode) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add hold-to-talk streaming Chinese dictation in type mode, writing into the existing textarea, then lightly polish with the LLM on release.

**Architecture:** Browser captures 16 kHz mono PCM and streams it over WebSocket to a thin Cloudflare Worker that proxies DashScope `paraformer-realtime-v2` (API key stays server-side). Short-lived HMAC tickets are minted by Next (`POST /api/stt/ticket`). On stop, `POST /api/stt/polish` rewrites only the current voice span. UI is a mic button beside type-mode chrome; no new `inputMode`.

**Tech Stack:** Next.js App Router, Vitest, Playwright, Cloudflare Worker (wrangler), Web Audio / AudioWorklet, DashScope Paraformer WebSocket, existing `resolveLlmCredentials` + `ai` SDK.

**Spec:** `docs/superpowers/specs/2026-10-08-voice-input-design.md`

## Global Constraints

- Type-mode only; mic hidden in pen mode and when input is locked
- Soft max **180s**; warn at **120s** (“还剩约 1 分钟” / EN equivalent)
- ASR: `paraformer-realtime-v2`, `disfluency_removal_enabled: true`, `language_hints: ["zh"]`, `heartbeat: true`
- Polish on release/timeout; on polish failure keep ASR text
- No STT BYOK in v1; no auto-submit; no polish settings toggle
- Visual: e-ink restraint — `ink-icon-btn` / `reicon-react/icons/Mic`, no chat bubbles or heavy cards
- Prefer small focused modules; avoid growing `InkPage.tsx` with raw WS/PCM logic

---

## File map

| File | Responsibility |
|------|----------------|
| `src/lib/voice-span.ts` | Pure splice of “current voice span” into `typedText` |
| `src/lib/voice-span.test.ts` | Unit tests for span apply |
| `src/lib/stt-ticket.ts` | HMAC mint/verify for WS tickets |
| `src/lib/stt-ticket.test.ts` | Ticket unit tests |
| `src/lib/stt-polish.ts` | Polish system/user prompts + response sanitize |
| `src/lib/stt-polish.test.ts` | Prompt / sanitize tests |
| `src/app/api/stt/ticket/route.ts` | `POST` → `{ ticket, expiresAt, wsUrl }` |
| `src/app/api/stt/polish/route.ts` | `POST` → `{ text }` polished |
| `src/app/api/stt/polish/route.test.ts` | Route integration (mock LLM) |
| `workers/stt-proxy/src/index.ts` | WS proxy Worker → DashScope |
| `workers/stt-proxy/wrangler.toml` | Worker name, secrets, route |
| `src/lib/stt-client.ts` | Browser: ticket fetch, WS session, PCM send, result callbacks |
| `src/lib/stt-pcm.ts` | Mic → PCM Int16 frames helper |
| `src/components/VoiceMicButton.tsx` | Hold-to-talk button + states |
| `src/components/InkPage.tsx` | Wire mic, span state, polish, lock |
| `src/lib/dock-hints.ts` + test | Listening / polishing / time-warn hints |
| `src/lib/i18n.ts` | zh/en copy + help memo line |
| `e2e/voice-mic.spec.ts` | Mic visible in type mode; stub media |
| `.env.example` | `DASHSCOPE_API_KEY`, `STT_TICKET_SECRET`, `NEXT_PUBLIC_STT_WS_URL` |

---

### Task 1: Voice span pure helpers

**Files:**
- Create: `src/lib/voice-span.ts`
- Create: `src/lib/voice-span.test.ts`

**Interfaces:**
- Produces:
  - `export type VoiceSession = { prefix: string; suffix: string; text: string }`
  - `export function beginVoiceSession(full: string, caret: number): VoiceSession`
  - `export function voiceSessionFull(s: VoiceSession): string`
  - `export function setVoiceSessionText(s: VoiceSession, text: string): VoiceSession`

Streaming rule: freeze `prefix`/`suffix` at mic-down; only mutate `text` with ASR/polish updates; always render via `voiceSessionFull`.

- [ ] **Step 1: Write failing tests**

```ts
import { describe, expect, it } from "vitest";
import {
  beginVoiceSession,
  setVoiceSessionText,
  voiceSessionFull,
} from "./voice-span";

describe("voice-span", () => {
  it("beginVoiceSession clamps caret and splits prefix/suffix", () => {
    const s = beginVoiceSession("你好", 99);
    expect(s).toEqual({ prefix: "你好", suffix: "", text: "" });
  });

  it("only replaces the voice middle", () => {
    let s = beginVoiceSession("前缀后缀", 2);
    expect(s).toEqual({ prefix: "前缀", suffix: "后缀", text: "" });
    s = setVoiceSessionText(s, "中");
    expect(voiceSessionFull(s)).toBe("前缀中后缀");
    s = setVoiceSessionText(s, "中间话");
    expect(voiceSessionFull(s)).toBe("前缀中间话后缀");
  });

  it("empty document becomes the voice text", () => {
    let s = beginVoiceSession("", 0);
    s = setVoiceSessionText(s, "整段");
    expect(voiceSessionFull(s)).toBe("整段");
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
npm test -- src/lib/voice-span.test.ts
```

Expected: cannot find module / fail.

- [ ] **Step 3: Implement**

```ts
export type VoiceSession = {
  prefix: string;
  suffix: string;
  text: string;
};

export function beginVoiceSession(full: string, caret: number): VoiceSession {
  const start = Math.max(0, Math.min(caret, full.length));
  return {
    prefix: full.slice(0, start),
    suffix: full.slice(start),
    text: "",
  };
}

export function voiceSessionFull(s: VoiceSession): string {
  return s.prefix + s.text + s.suffix;
}

export function setVoiceSessionText(
  s: VoiceSession,
  text: string
): VoiceSession {
  return { ...s, text };
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
npm test -- src/lib/voice-span.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/voice-span.ts src/lib/voice-span.test.ts
git commit -m "feat: add voice session text span helpers"
```

---

### Task 2: STT ticket mint / verify

**Files:**
- Create: `src/lib/stt-ticket.ts`
- Create: `src/lib/stt-ticket.test.ts`

**Interfaces:**
- Produces:
  - `mintSttTicket(secret: string, nowMs?: number): { ticket: string; expiresAt: number }`
  - `verifySttTicket(secret: string, ticket: string, nowMs?: number): boolean`
- TTL: **120 seconds**
- Format: `expMs.hexHmac` where HMAC-SHA256 over `String(expMs)` with `secret`, truncated to 32 hex chars

- [ ] **Step 1: Failing tests**

```ts
import { describe, expect, it } from "vitest";
import { mintSttTicket, verifySttTicket } from "./stt-ticket";

describe("stt-ticket", () => {
  const secret = "test-secret-please-change";

  it("mints a verifiable ticket", () => {
    const { ticket, expiresAt } = mintSttTicket(secret, 1_000_000);
    expect(expiresAt).toBe(1_000_000 + 120_000);
    expect(verifySttTicket(secret, ticket, 1_000_000 + 1_000)).toBe(true);
  });

  it("rejects expired and wrong secret", () => {
    const { ticket } = mintSttTicket(secret, 1_000_000);
    expect(verifySttTicket(secret, ticket, 1_000_000 + 121_000)).toBe(false);
    expect(verifySttTicket("other", ticket, 1_000_000)).toBe(false);
    expect(verifySttTicket(secret, "bad", 1_000_000)).toBe(false);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
npm test -- src/lib/stt-ticket.test.ts
```

- [ ] **Step 3: Implement with Web Crypto-compatible Node `crypto`**

```ts
import { createHmac, timingSafeEqual } from "node:crypto";

const TTL_MS = 120_000;

export function mintSttTicket(secret: string, nowMs = Date.now()) {
  const expiresAt = nowMs + TTL_MS;
  const sig = createHmac("sha256", secret)
    .update(String(expiresAt))
    .digest("hex")
    .slice(0, 32);
  return { ticket: `${expiresAt}.${sig}`, expiresAt };
}

export function verifySttTicket(
  secret: string,
  ticket: string,
  nowMs = Date.now()
): boolean {
  const [expStr, sig] = ticket.split(".");
  if (!expStr || !sig || sig.length !== 32) return false;
  const expiresAt = Number(expStr);
  if (!Number.isFinite(expiresAt) || nowMs > expiresAt) return false;
  const expected = createHmac("sha256", secret)
    .update(String(expiresAt))
    .digest("hex")
    .slice(0, 32);
  try {
    return timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  } catch {
    return false;
  }
}

export function resolveSttTicketSecret(): string | null {
  const s =
    process.env.STT_TICKET_SECRET?.trim() ||
    process.env.AUTH_SECRET?.trim() ||
    "";
  return s || null;
}
```

Duplicate a **Worker-safe** verify in `workers/stt-proxy` using Web Crypto (or import shared logic via copy — Workers cannot import from `src/` easily). Plan: copy `verifySttTicket` into `workers/stt-proxy/src/ticket.ts` using `crypto.subtle` — keep algorithms identical.

- [ ] **Step 4: Pass tests + commit**

```bash
npm test -- src/lib/stt-ticket.test.ts
git add src/lib/stt-ticket.ts src/lib/stt-ticket.test.ts
git commit -m "feat: add STT websocket ticket mint/verify"
```

---

### Task 3: Polish prompts + API route

**Files:**
- Create: `src/lib/stt-polish.ts`
- Create: `src/lib/stt-polish.test.ts`
- Create: `src/app/api/stt/polish/route.ts`
- Create: `src/app/api/stt/polish/route.test.ts`
- Modify: `.env.example` (document nothing new required beyond existing `MODEL_*`)

**Interfaces:**
- Produces:
  - `buildSttPolishSystemPrompt(locale: "zh" | "en"): string`
  - `sanitizePolishOutput(raw: string): string` — trim; strip wrapping quotes; reject if empty
- Route: `POST /api/stt/polish` body `{ text: string; locale?: "zh"|"en" }` → `{ text: string }`
- Uses `resolveLlmCredentials` + `createLlmModel` + `generateText` from `ai` (non-streaming)
- Max input length **4000** chars; longer → 400 `text_too_long`
- Timeout: rely on `maxDuration = 30`

- [ ] **Step 1: Unit tests for prompts/sanitize**

```ts
import { describe, expect, it } from "vitest";
import {
  buildSttPolishSystemPrompt,
  sanitizePolishOutput,
} from "./stt-polish";

describe("stt-polish", () => {
  it("zh system mentions 语气词 and 只输出正文", () => {
    const s = buildSttPolishSystemPrompt("zh");
    expect(s).toContain("语气词");
    expect(s).toContain("只输出");
  });

  it("sanitize strips fences and quotes", () => {
    expect(sanitizePolishOutput('  "你好"  ')).toBe("你好");
    expect(sanitizePolishOutput("```\n你好\n```")).toBe("你好");
  });
});
```

- [ ] **Step 2: Implement `stt-polish.ts`**

```ts
import type { Locale } from "@/lib/i18n";

export function buildSttPolishSystemPrompt(locale: Locale): string {
  if (locale === "en") {
    return [
      "You clean up speech-to-text for a short note.",
      "Remove filler words and false starts; add light punctuation.",
      "Do not change meaning; do not add new content; do not answer the user.",
      "Output only the cleaned text.",
    ].join(" ");
  }
  return [
    "你整理一段语音识别结果，供用户写在纸上。",
    "去掉语气词与口头禅，略补标点。",
    "不改变原意，不新增内容，不回答问题。",
    "只输出整理后的正文。",
  ].join("");
}

export function sanitizePolishOutput(raw: string): string {
  let s = raw.trim();
  if (s.startsWith("```")) {
    s = s.replace(/^```[a-zA-Z]*\n?/, "").replace(/```$/, "").trim();
  }
  if (
    (s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith("“") && s.endsWith("”"))
  ) {
    s = s.slice(1, -1).trim();
  }
  return s;
}
```

- [ ] **Step 3: Implement route** (mirror patterns in `src/app/api/ask/route.ts`)

```ts
import { generateText } from "ai";
import { createLlmModel, resolveLlmCredentials } from "@/lib/llm";
import {
  buildSttPolishSystemPrompt,
  sanitizePolishOutput,
} from "@/lib/stt-polish";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: Request) {
  let body: { text?: string; locale?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }
  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!text) return Response.json({ error: "empty_text" }, { status: 400 });
  if (text.length > 4000) {
    return Response.json({ error: "text_too_long" }, { status: 400 });
  }
  const locale = body.locale === "en" ? "en" : "zh";
  const resolved = resolveLlmCredentials({});
  if (!resolved.ok) {
    return Response.json({ error: resolved.error }, { status: 503 });
  }
  try {
    const result = await generateText({
      model: createLlmModel(resolved.creds),
      system: buildSttPolishSystemPrompt(locale),
      prompt: text,
      maxOutputTokens: 1024,
    });
    const cleaned = sanitizePolishOutput(result.text || "");
    if (!cleaned) {
      return Response.json({ error: "empty_polish" }, { status: 502 });
    }
    return Response.json({ text: cleaned });
  } catch {
    return Response.json({ error: "polish_failed" }, { status: 502 });
  }
}
```

- [ ] **Step 4: Route test** — mock `ai` `generateText` and `resolveLlmCredentials` like `ask/route.test.ts`; assert 400 on empty, 200 on ok.

- [ ] **Step 5: Run tests + commit**

```bash
npm test -- src/lib/stt-polish.test.ts src/app/api/stt/polish/route.test.ts
git add src/lib/stt-polish.ts src/lib/stt-polish.test.ts \
  src/app/api/stt/polish/route.ts src/app/api/stt/polish/route.test.ts
git commit -m "feat: add STT polish API"
```

---

### Task 4: Ticket HTTP route + env docs

**Files:**
- Create: `src/app/api/stt/ticket/route.ts`
- Create: `src/app/api/stt/ticket/route.test.ts`
- Modify: `.env.example`

**Interfaces:**
- `POST /api/stt/ticket` → `{ ticket, expiresAt, wsUrl }`
- `wsUrl` from `process.env.NEXT_PUBLIC_STT_WS_URL` (required in prod); if missing in test, return `wsUrl: "ws://localhost:8787"`
- If `resolveSttTicketSecret()` null → 503 `{ error: "missing_ticket_secret" }`
- If neither `DASHSCOPE_API_KEY` nor `MODEL_API_KEY` set → 503 `{ error: "missing_asr_key" }` (Worker needs DashScope; document that `DASHSCOPE_API_KEY` is preferred for STT)

- [ ] **Step 1–4:** TDD route tests for 503/200; implement; update `.env.example`:

```bash
# Speech-to-text (type-mode mic). Prefer DASHSCOPE_API_KEY for Paraformer.
# DASHSCOPE_API_KEY=
# STT_TICKET_SECRET=   # falls back to AUTH_SECRET
# NEXT_PUBLIC_STT_WS_URL=ws://127.0.0.1:8787
```

- [ ] **Step 5: Commit**

```bash
git add src/app/api/stt/ticket/route.ts src/app/api/stt/ticket/route.test.ts .env.example
git commit -m "feat: add STT ticket endpoint"
```

---

### Task 5: Cloudflare STT proxy Worker

**Files:**
- Create: `workers/stt-proxy/package.json` (minimal, or root script)
- Create: `workers/stt-proxy/wrangler.toml`
- Create: `workers/stt-proxy/src/index.ts`
- Create: `workers/stt-proxy/src/ticket.ts` (Web Crypto verify matching Task 2)
- Create: `workers/stt-proxy/src/dashscope.ts` (run-task / finish-task helpers)
- Modify: root `README.md` — short “语音输入本地联调” subsection
- Optional npm script: `"stt-proxy": "wrangler dev -c workers/stt-proxy/wrangler.toml"`

**Behavior:**

1. Client connects: `GET` upgrade `/?ticket=...`
2. Verify ticket with `STT_TICKET_SECRET` / `AUTH_SECRET`
3. Open `wss://dashscope.aliyuncs.com/api-ws/v1/inference` with `Authorization: Bearer ${DASHSCOPE_API_KEY}`
4. On upstream open: send `run-task` JSON:

```json
{
  "header": {
    "action": "run-task",
    "task_id": "<uuid>",
    "streaming": "duplex"
  },
  "payload": {
    "task_group": "audio",
    "task": "asr",
    "function": "recognition",
    "model": "paraformer-realtime-v2",
    "parameters": {
      "format": "pcm",
      "sample_rate": 16000,
      "disfluency_removal_enabled": true,
      "language_hints": ["zh"],
      "heartbeat": true
    },
    "input": {}
  }
}
```

5. After `task-started`: forward client **binary** frames to DashScope; forward DashScope text events to client as JSON `{ type: "result", text, isFinal?: boolean }` (parse `result-generated` payload for sentence text — follow current DashScope event shape in [client events docs](https://help.aliyun.com/zh/model-studio/paraformer-client-events); extract the cumulative or sentence text field actually returned and document the chosen field in a one-line comment).
6. Client JSON `{ type: "finish" }` → send `finish-task` with same `task_id`; on `task-finished` close both sides.
7. Reject missing/invalid ticket with 401 before upgrade.

**Local run:**

```bash
cd workers/stt-proxy && npx wrangler dev
# secrets: wrangler secret put DASHSCOPE_API_KEY; STT_TICKET_SECRET
```

- [ ] **Step 1:** Scaffold worker + ticket verify unit testable with vitest if possible (Node test of pure extractors).
- [ ] **Step 2:** Implement proxy; manually smoke with `websocat` if available.
- [ ] **Step 3:** README + npm script + commit

```bash
git add workers/stt-proxy README.md package.json
git commit -m "feat: add DashScope STT websocket proxy worker"
```

---

### Task 6: Browser PCM + STT client

**Files:**
- Create: `src/lib/stt-pcm.ts`
- Create: `src/lib/stt-client.ts`
- Create: `src/lib/stt-client.test.ts` (mock WebSocket + ticket fetch)

**Interfaces:**
- `createMicPcmStream(onFrame: (pcm: Int16Array) => void): Promise<{ stop: () => void }>`
  - `getUserMedia({ audio: true })`
  - AudioContext 16 kHz; ScriptProcessor or AudioWorklet downsample to Int16 LE mono; ~100ms frames
- `export type SttClientHandlers = { onPartial: (text: string) => void; onError: (code: string) => void }`
- `export async function startSttSession(handlers): Promise<{ stop: () => Promise<void> }>`
  1. `POST /api/stt/ticket`
  2. `new WebSocket(`${wsUrl}?ticket=...`)`
  3. start mic; on message accumulate display text (prefer latest final sentence concat policy: keep `committed` + current `partial`; when `isFinal`, append to committed — implement clearly and test)
  4. `stop`: stop mic, send `{type:"finish"}`, wait close / timeout 3s

**Constants (export):**

```ts
export const VOICE_MAX_MS = 180_000;
export const VOICE_WARN_MS = 120_000;
```

- [ ] **Step 1:** Unit-test text accumulation helper extracted as `accumulateAsr(state, event) → state` in `stt-client.ts`.
- [ ] **Step 2:** Implement PCM + session.
- [ ] **Step 3:** Commit

```bash
git add src/lib/stt-pcm.ts src/lib/stt-client.ts src/lib/stt-client.test.ts
git commit -m "feat: add browser STT client and PCM capture"
```

---

### Task 7: i18n + dock hints

**Files:**
- Modify: `src/lib/i18n.ts` — add keys to both `zh` and `en` (TypeScript `MessageKey` is inferred from `zh`)
- Modify: `src/lib/dock-hints.ts`
- Modify: `src/lib/dock-hints.test.ts`

**New keys (exact):**

| key | zh | en |
|-----|----|----|
| `voiceMic` | 按住说话 | Hold to talk |
| `voiceListening` | 正在听… | Listening… |
| `voicePolishing` | 整理中… | Tidying… |
| `voiceWarn` | 还剩约 1 分钟 | About 1 minute left |
| `voiceNeedMic` | 需要麦克风权限才能语音输入 | Microphone access is needed for voice input |
| `voiceFailed` | 语音识别暂时不可用 | Voice input is temporarily unavailable |
| `voicePolishFailed` | 未整理 | Couldn’t tidy — kept as heard |
| `helpMemoVoice` | 文字模式下，按住输入区旁的麦克风说话，松手后文字会略作整理；仍用 Enter 或双击提交。 | In type mode, hold the mic beside the input to dictate; on release the text is lightly tidied. Submit with Enter or double-click as usual. |

Wire `helpMemoVoice` into `HelpPanel` memo list (find where `helpMemoType` is rendered and add after it).

Extend `CollectInput` with optional:

```ts
voicePhase?: "idle" | "listening" | "warn" | "polishing";
```

When `listening` / `warn` / `polishing`, push corresponding dock hint (kind `wait`).

- [ ] **Step 1:** Update dock-hints tests for new phases.
- [ ] **Step 2:** Implement i18n + hints + HelpPanel.
- [ ] **Step 3: Commit**

```bash
git add src/lib/i18n.ts src/lib/dock-hints.ts src/lib/dock-hints.test.ts src/components/HelpPanel.tsx
git commit -m "feat: i18n and dock hints for voice input"
```

---

### Task 8: VoiceMicButton + InkPage wiring

**Files:**
- Create: `src/components/VoiceMicButton.tsx`
- Modify: `src/components/InkPage.tsx` (minimal: state + handlers + render mic near type chrome / dock)
- Modify: CSS module or `globals` if needed for `.voice-mic.is-listening` pulse (respect `prefers-reduced-motion`)

**VoiceMicButton props:**

```ts
type Props = {
  locale: Locale;
  disabled: boolean;
  phase: "idle" | "listening" | "polishing";
  onPressStart: () => void;
  onPressEnd: () => void;
};
```

- pointerdown → `onPressStart`; pointerup/cancel/leave → `onPressEnd`
- `aria-label={t(locale,"voiceMic")}`
- Icon: `import Mic from "reicon-react/icons/Mic"`

**InkPage integration sketch:**

```ts
const [voicePhase, setVoicePhase] = useState<"idle"|"listening"|"warn"|"polishing">("idle");
const voiceSessionRef = useRef<VoiceSession | null>(null);
const sttStopRef = useRef<null | (() => Promise<void>)>(null);
const warnTimerRef = useRef<number | null>(null);
const maxTimerRef = useRef<number | null>(null);

async function startVoice() {
  if (inputMode !== "type" || inputLocked || voicePhase !== "idle") return;
  const ta = typeRef.current;
  const caret = ta ? ta.selectionStart : typedText.length;
  voiceSessionRef.current = beginVoiceSession(typedText, caret);
  setVoicePhase("listening");
  // set timers for VOICE_WARN_MS / VOICE_MAX_MS
  try {
    const session = await startSttSession({
      onPartial: (text) => {
        const vs = voiceSessionRef.current;
        if (!vs) return;
        const next = setVoiceSessionText(vs, text);
        voiceSessionRef.current = next;
        onTypedChange(voiceSessionFull(next)); // or setTypedText path used elsewhere
      },
      onError: () => { /* statusExtra voiceFailed; stopVoice(false) */ },
    });
    sttStopRef.current = session.stop;
  } catch {
    setVoicePhase("idle");
    // need mic / failed
  }
}

async function stopVoice(doPolish: boolean) {
  clear timers; await sttStopRef.current?.();
  const vs = voiceSessionRef.current;
  if (!vs || !doPolish || !vs.text.trim()) {
    setVoicePhase("idle");
    voiceSessionRef.current = null;
    return;
  }
  setVoicePhase("polishing");
  try {
    const res = await fetch("/api/stt/polish", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: vs.text, locale: settings.locale }),
    });
    if (res.ok) {
      const data = (await res.json()) as { text?: string };
      if (data.text) {
        const next = setVoiceSessionText(vs, data.text);
        voiceSessionRef.current = next;
        onTypedChange(voiceSessionFull(next));
      }
    } else {
      // statusExtra voicePolishFailed briefly
    }
  } finally {
    setVoicePhase("idle");
    voiceSessionRef.current = null;
  }
}
```

Lock: treat `voicePhase !== "idle"` like `inputLocked` for mode switch / submit (extend existing guards).

Render mic only when `inputMode === "type" && !settingsOpen && !helpOpen`.

- [ ] **Step 1: Implement component**
- [ ] **Step 2: Wire InkPage**
- [ ] **Step 3: Manual check on `npm run dev` + `npm run stt-proxy`**
- [ ] **Step 4: Commit**

```bash
git add src/components/VoiceMicButton.tsx src/components/InkPage.tsx src/app/globals.css
git commit -m "feat: wire type-mode hold-to-talk voice input"
```

---

### Task 9: E2E smoke

**Files:**
- Create: `e2e/voice-mic.spec.ts`

- [ ] **Step 1: Spec**

```ts
import { test, expect } from "@playwright/test";

test("type mode shows mic; pen mode hides it", async ({ page }) => {
  await page.addInitScript(() => {
    // @ts-expect-error stub
    navigator.mediaDevices = {
      getUserMedia: () => Promise.reject(new Error("denied")),
    };
  });
  await page.goto("/");
  // switch to type mode via mode switch control
  await page.getByRole("button", { name: /文字|Type/i }).click();
  await expect(page.getByRole("button", { name: /按住说话|Hold to talk/i })).toBeVisible();
  await page.getByRole("button", { name: /笔迹|Pen/i }).click();
  await expect(page.getByRole("button", { name: /按住说话|Hold to talk/i })).toHaveCount(0);
});
```

Adjust selectors to match `RubberSegment` / `sr-only` labels actually used (`modeType` / `modePen`).

- [ ] **Step 2: Run**

```bash
npm run test:e2e -- e2e/voice-mic.spec.ts
```

- [ ] **Step 3: Commit**

```bash
git add e2e/voice-mic.spec.ts
git commit -m "test: e2e smoke for voice mic visibility"
```

---

## Spec coverage checklist

| Spec item | Task |
|-----------|------|
| Type-mode mic only | 8, 9 |
| Streaming Paraformer + disfluency + heartbeat | 5, 6 |
| Voice span / don’t wipe prefix-suffix | 1, 8 |
| 3 min max / warn at 2 min | 6 constants, 8 timers, 7 copy |
| Polish on release / keep ASR on fail | 3, 8 |
| Ticket auth, key not in browser | 2, 4, 5 |
| Dock / help / i18n | 7 |
| No R2, no auto-submit, no polish toggle | — explicit non-goals, no tasks |

## Execution handoff

Plan saved to `docs/superpowers/plans/2026-10-08-voice-input.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks  
2. **Inline Execution** — execute tasks in this session with executing-plans checkpoints  

Which approach?
