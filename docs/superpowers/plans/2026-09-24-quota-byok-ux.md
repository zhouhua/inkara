# Quota & BYOK UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship PRD-05 — paper errors use explicit ink text actions (去设定 / 重试), settings get BYOK local validation + connection probe; no free-quota remaining UI.

**Architecture:** Centralize ask/probe error codes → human copy + action kind in `ask-errors.ts`. Stop drawing canvas `retryHint` and stop whole-paper tap-retry; overlay one `.paper-error-action` text button under the reply canvas. Add `POST /api/probe` for a minimal non-streaming completion using the same Key resolution as `/api/ask`, without quota or memory. SettingsPanel validates then calls probe; results stay inside the sheet.

**Tech Stack:** Next.js App Router (`src/app/api/probe`), existing client components, `i18n.ts`. No new dependencies. No test runner in repo — keep pure helpers small; acceptance is manual per PRD.

**Spec:** `docs/prd/2026-09-24-05-quota-byok.md` (Accepted)

---

## File map

| File | Responsibility |
|------|----------------|
| `src/lib/ask-errors.ts` | Map `error` code + offline → `{ messageKey, action }` |
| `src/lib/byok.ts` | `validateByokFields({ apiKey, baseUrl })` → field errors |
| `src/lib/probe.ts` | Client `probeConnection(...)` → `{ ok, error? }` |
| `src/lib/i18n.ts` | New keys: actions, probe, validation, unauthorized/network/upstream |
| `src/app/api/probe/route.ts` | Minimal chat completion; map 401 → `unauthorized` |
| `src/app/api/ask/route.ts` | Map upstream 401 → `unauthorized`; prefer stable codes over raw HTML in `message` for client mapping |
| `src/components/InkPage.tsx` | Error action state; overlay button; remove paper tap retry |
| `src/components/SettingsPanel.tsx` | Validate + Test button + inline result line |
| `src/app/globals.css` | `.paper-error-action`, `.settings-probe-*` (淡墨，非 pill) |
| `README.md` | Mention settings Test; keep honest local-quota note |

**Non-goals (do not implement):** F1/F5 remaining UI; raising `FREE_DAILY_LIMIT`; server fingerprint; client-direct fetch to user baseUrl.

---

## Locked implementation details

### Error → action

```ts
// ask-errors.ts
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
```

- **Ask failures:** use table above (never show raw upstream HTML on paper).
- **`recallMiss`:** `{ messageKey: "recallMiss", action: "dismiss" }` — needed so error phase still has an exit without tap-anywhere retry (PRD unified model).
- Action labels: `open_settings` → `actionOpenSettings`；`retry` → `actionRetry`；`dismiss` → `actionDismiss`（中文「好」/ English「OK」）.

### Paper UI

1. `writePaperMessage(msg)` draws **only** the message (delete canvas `retryHint` block).
2. State: `paperErrorAction: PaperErrorAction | null` set whenever entering error with a message; clear on leave error / successful ask / open settings from button.
3. **Mount the action button as a sibling of `.ink-layer` under `.paper-page`** (same pattern as `.recall-pick`), **not** inside `.reply-stage`. Today `.reply-stage` is `z-index: 1` and `.ink-layer` is `z-index: 2`, so a button inside reply-stage cannot receive clicks. Use `z-index: 5` (like `.recall-pick`).

```tsx
{/* after reply-stage, before or after ink-layer — must be under .paper-page */}
{phase === "error" && paperErrorAction && (
  <button
    type="button"
    className="paper-error-action text-action"
    onClick={onPaperErrorAction}
  >
    {labelFor(paperErrorAction)}
  </button>
)}
```

```css
.paper-error-action {
  position: absolute;
  left: 50%;
  bottom: 18%;
  transform: translateX(-50%);
  z-index: 5; /* above .ink-layer (2) and .type-layer (3) */
  opacity: 0.72;
  pointer-events: auto;
}
```

4. `handlePaperPointer`: **remove** `phase === "error"` → `retryLastCommit`. Keep recall-candidate dismiss only. After this, error should **not** set `paperInteractive` / reply-layer pointer handlers.
5. **Block ink + type while `phase === "error"`** (critical — today `busy` and type `disabled={busy}` **exclude** `error`; tap-retry used to steal the pointer). Locked changes:
   - Extend `busy` **or** add explicit guards to include `phase === "error"` for: `onPointerDown` early return, `onPaperDoubleClick`, type-layer `disabled`, and any `onTypedChange` / mode switch that clears the page.
   - Prefer: `const inputLocked = busy || phase === "error"` and use `inputLocked` everywhere `busy` currently gates writing (do **not** fold error into `busy` if that would hide dock incorrectly — dock already uses `!busy`; error dock can stay status-only).

### Probe API

```ts
// POST /api/probe body
{ apiKey: string; baseUrl?: string; model?: string; locale?: "zh" | "en" }
```

**Locked credential rules (ignore any softer wording elsewhere):**

- `apiKey`: **required** from request body only (trim). Empty → `400` `{ error: "missing_api_key" }`. Never fall back to `MODEL_API_KEY` / env — otherwise blank BYOK “Test” would falsely succeed on server defaults.
- `baseUrl` / `model`: body if non-empty, else same env defaults as ask (`MODEL_BASE_URL` / `MODEL_NAME` …) so user Key + default endpoint remains testable.
- Upstream call: non-stream `chat/completions`, `max_tokens: 8`, messages: one user `"ping"` (no image).
- Map: network/fetch fail → `request_failed`; status 401/403 → `unauthorized`; other !ok → `upstream_error` (do **not** return HTML body to client).
- Success: `{ ok: true }`.
- **Never** touch quota or memory.

### Settings validation

```ts
// byok.ts
export function validateByokFields(input: {
  apiKey: string;
  baseUrl: string;
}): { apiKey?: string; baseUrl?: string } {
  const errors: { apiKey?: string; baseUrl?: string } = {};
  if (!input.apiKey.trim()) errors.apiKey = "byokKeyRequired";
  const url = input.baseUrl.trim();
  if (url) {
    try {
      const u = new URL(url);
      if (u.protocol !== "http:" && u.protocol !== "https:") {
        errors.baseUrl = "byokUrlInvalid";
      }
    } catch {
      errors.baseUrl = "byokUrlInvalid";
    }
  }
  return errors;
}
```

Test button: run validate → if errors, show i18n field hints, no fetch; else call probe with current draft settings (even if not yet “saved” — settings already live via `onChange`).

### i18n keys to add (zh + en)

| Key | zh sketch |
|-----|-----------|
| `actionOpenSettings` | 去设定 |
| `actionRetry` | 重试 |
| `actionDismiss` | 好 |
| `unauthorizedKey` | Key 无效或无权访问 |
| `networkError` | 网络不通，请稍后重试 |
| `upstreamBusy` | 暂时无法完成 |
| `byokKeyRequired` | 请填写 API Key |
| `byokUrlInvalid` | Endpoint 需为 http(s) 地址 |
| `probeTesting` | 测试中… |
| `probeOk` | 连接正常 |
| `probeFail` | （reuse mapped human line） |
| `apiTest` | 测试连接 |

Update `quotaExceeded` / `apiSectionHint` only if wording still matches PRD (already close). Remove reliance on `retryHint` for error UX (key may remain unused or deleted).

---

### Task 1: `ask-errors` + `byok` helpers

**Files:**
- Create: `src/lib/ask-errors.ts`
- Create: `src/lib/byok.ts`

- [ ] **Step 1: Add `ask-errors.ts`** with `PaperErrorAction`, `resolvePaperError` as locked above; export `resolveRecallMissError()` → `{ messageKey: "recallMiss", action: "dismiss" }` for clarity at call sites.

- [ ] **Step 2: Add `byok.ts`** with `validateByokFields` as locked above.

- [ ] **Step 3: Sanity-check in Node (no test runner)**

```bash
npx tsc --noEmit
```

Expected: no errors from new files (project may already have unrelated issues — new files must typecheck).

- [ ] **Step 4: Commit**

```bash
git add src/lib/ask-errors.ts src/lib/byok.ts
git commit -m "$(cat <<'EOF'
feat: add ask error action map and BYOK field validation

EOF
)"
```

---

### Task 2: i18n strings

**Files:**
- Modify: `src/lib/i18n.ts`

- [ ] **Step 1: Add zh + en keys** listed in Locked details (`action*`, `unauthorizedKey`, `networkError`, `upstreamBusy`, `byok*`, `probe*`, `apiTest`).

- [ ] **Step 2: Delete or stop using `retryHint`** — if unused after Task 4, remove both locales to avoid dead copy.

- [ ] **Step 3: Commit**

```bash
git add src/lib/i18n.ts
git commit -m "$(cat <<'EOF'
feat: i18n for paper error actions and BYOK probe

EOF
)"
```

---

### Task 3: `POST /api/probe` + ask unauthorized mapping

**Files:**
- Create: `src/app/api/probe/route.ts`
- Create: `src/lib/probe.ts`
- Modify: `src/app/api/ask/route.ts` (upstream status mapping)

- [ ] **Step 1: Implement probe route** per Locked “Probe API”. Reuse env fallbacks for baseUrl/model; **require** body `apiKey`. Use `jsonError` pattern from ask route if exported, or duplicate small helper locally.

Minimal success body check: upstream JSON has `choices` or status ok — do not stream.

- [ ] **Step 2: Harden ask upstream errors**

In `ask/route.ts` where `!upstream.ok`:

```ts
const code =
  upstream.status === 401 || upstream.status === 403
    ? "unauthorized"
    : "upstream_error";
return jsonError(
  { error: code, message: code === "unauthorized" ? "unauthorized" : "upstream" },
  code === "unauthorized" ? 401 : 502
);
```

Do **not** put `errText` (may be HTML) into client-facing `message` for these codes.

- [ ] **Step 3: Client `probe.ts`**

```ts
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
```

- [ ] **Step 4: Commit**

```bash
git add src/app/api/probe/route.ts src/lib/probe.ts src/app/api/ask/route.ts
git commit -m "$(cat <<'EOF'
feat: add BYOK probe API and stable unauthorized error codes

EOF
)"
```

---

### Task 4: InkPage paper error actions

**Files:**
- Modify: `src/components/InkPage.tsx`
- Modify: `src/app/globals.css`

- [ ] **Step 1: State + writePaperMessage**

- Add `const [paperErrorAction, setPaperErrorAction] = useState<PaperErrorAction | null>(null)`.
- Strip hint drawing from `writePaperMessage` (message only).
- Helper `showPaperError(messageKey, action)` → `writePaperMessage(t(...))` + set action + `setPhaseBoth("error")`.

- [ ] **Step 2: Wire ask catch + recallMiss**

Replace inline message branching in `runAsk` catch with:

```ts
const err = e as { error?: string; message?: string };
const offline = typeof navigator !== "undefined" && !navigator.onLine;
// askPageStream fetch failures often throw TypeError without `.error`
const code =
  err.error ||
  (e instanceof TypeError ? "request_failed" : undefined);
const resolved = resolvePaperError({ error: code, offline });
showPaperError(resolved.messageKey, resolved.action);
```

For recall miss: `showPaperError("recallMiss", "dismiss")`.

- [ ] **Step 3: Overlay button + handlers**

```ts
const onPaperErrorAction = () => {
  const action = paperErrorAction;
  setPaperErrorAction(null);
  if (action === "open_settings") {
    clearReplyLayer();
    setPhaseBoth("ready");
    setSettingsOpen(true);
    return;
  }
  if (action === "retry") {
    void retryLastCommit();
    return;
  }
  // dismiss
  clearReplyLayer();
  setPhaseBoth("ready");
};
```

- Remove error branch from `handlePaperPointer`.
- `paperInteractive` / reply-layer pointer: **candidates only** (not error).
- Mount button under `.paper-page` with `z-index: 5` (see Locked Paper UI) — **not** inside `.reply-stage`.
- Clear `paperErrorAction` in `clearReplyLayer` / successful paths that leave error.

- [ ] **Step 4: Lock input during error**

- Introduce `inputLocked = busy || phase === "error"` (or equivalent).
- Gate `onPointerDown`, `onPaperDoubleClick`, type `disabled`, and typed-input handlers with `inputLocked`.
- Confirm: while error visible, pen strokes and typing cannot start; only the action button works.

- [ ] **Step 5: CSS** — add `.paper-error-action` per Locked block.

- [ ] **Step 6: Manual check**

1. Force offline / fetch fail → paper human line + **重试**; blank paper tap does nothing; button retries; cannot draw while error.  
2. Simulate quota → **去设定** opens settings; no retry.  
3. Recall miss → **好** dismisses.  
4. Confirm button is clickable above ink (not covered).

- [ ] **Step 7: Commit**

```bash
git add src/components/InkPage.tsx src/app/globals.css
git commit -m "$(cat <<'EOF'
feat: replace paper tap-retry with explicit error actions

EOF
)"
```

---

### Task 5: SettingsPanel validation + Test

**Files:**
- Modify: `src/components/SettingsPanel.tsx`
- Modify: `src/app/globals.css` (probe result line)

- [ ] **Step 1: Local state**

`probeStatus: "idle" | "testing" | "ok" | "fail"`, `probeMessage: string`, optional field error map from `validateByokFields`.

- [ ] **Step 2: UI under model fields**

- Button `apiTest` (class `text-action`, not pill).  
- On click: validate → set field errors; if clean, `setProbeStatus("testing")`, call `probeConnection` with `settings.apiKey/baseUrl/model/locale`, map fail via `resolvePaperError({ error }).messageKey` → `t(...)`.  
- Show result as `<p className="settings-probe-result">`.  
- Reset probe result when apiKey/baseUrl/model change.

- [ ] **Step 3: Manual check**

1. Empty Key → Test shows `byokKeyRequired`, no network.  
2. Bad URL → `byokUrlInvalid`.  
3. Valid Key against real endpoint → `probeOk`.  
4. Wrong Key → `unauthorizedKey` (or mapped fail line) inside settings only.

- [ ] **Step 4: Commit**

```bash
git add src/components/SettingsPanel.tsx src/app/globals.css src/lib/i18n.ts
git commit -m "$(cat <<'EOF'
feat: add settings BYOK validation and connection test

EOF
)"
```

---

### Task 6: README + lint smoke

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Document** that settings includes「测试连接」; restate local 2/day free quota and wipe-reset honesty; **do not** claim remaining-count UI.

- [ ] **Step 2: Run**

```bash
npm run lint
npx tsc --noEmit
```

Fix any issues introduced by this plan.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "$(cat <<'EOF'
docs: note BYOK connection test in README

EOF
)"
```

---

## Acceptance checklist (PRD)

- [ ] No settings `今日免费 n/2` / no remaining-1 tip  
- [ ] Quota / missing / unauthorized → paper **去设定** only  
- [ ] Network / upstream → paper **重试** only  
- [ ] Blank paper tap does not retry  
- [ ] Test: local validate then probe; result in settings; no quota/memory side effects  
- [ ] No upstream HTML dumped on paper  

---

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-09-24-quota-byok-ux.md`.

**1. Subagent-Driven (recommended)** — fresh subagent per task, review between tasks  

**2. Inline Execution** — same session, batch with checkpoints  

Which approach?
