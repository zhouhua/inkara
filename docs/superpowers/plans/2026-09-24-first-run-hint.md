# First-run Dock Hint Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show first-run submit copy in the bottom dock until the user enters `fading` once, then persist `hasCommittedOnce` and permanently use the existing everyday hints.

**Architecture:** Add `hasCommittedOnce` to `AppSettings` (IndexedDB via existing settings path). Extract a pure helper `firstRunDockHint(...)` so dock copy logic stays testable-by-inspection and out of the giant `InkPage` render path. In `dockHint`, after `statusExtra` / busy phases, if `!settings.hasCommittedOnce` use the helper; otherwise keep current `submitHint*` logic. On `commitPage`, immediately after `setPhaseBoth("fading")`, mark committed and `saveSettings`.

**Tech Stack:** Next.js client component, existing `settings.ts` / `i18n.ts` / IndexedDB. No new dependencies. No automated test runner in this repo — verify with the manual checklist from the PRD.

**Spec:** `docs/prd/2026-09-24-01-first-run-hint.md` (Accepted)

---

## File map

| File | Responsibility |
|------|----------------|
| `src/lib/settings.ts` | Add `hasCommittedOnce: boolean` to type, defaults, `normalizeSettings` |
| `src/lib/i18n.ts` | First-run message keys (zh + en) |
| `src/lib/first-run-hint.ts` | Pure helper: pick first-run dock string from locale / modes / content |
| `src/components/InkPage.tsx` | Update `SSR_SETTINGS`; wire helper into `dockHint`; graduate on `fading` in `commitPage` |

No SettingsPanel UI changes (reset is v1.1 / Non-Goal for MVP). No CSS changes.

---

### Task 1: Settings field `hasCommittedOnce`

**Files:**
- Modify: `src/lib/settings.ts`

- [x] **Step 1: Extend `AppSettings` and defaults**
- [x] **Step 2: Normalize missing / legacy values**
- [x] **Step 3: Update SSR stub in InkPage**
- [x] **Step 4: Sanity-check types**
- [x] **Step 5: Commit** (`50834aa`)
---

### Task 2: i18n keys for first-run copy

**Files:**
- Modify: `src/lib/i18n.ts`

- [ ] **Step 1: Add zh keys** (near existing `submitHint*` keys)

```ts
    firstRunHintManualIdle: "写下一点，然后双击空白或按 Enter",
    firstRunHintManualWriting: "双击空白或按 Enter 交给纸",
    firstRunHintAutoIdle: "写下一点，停笔后将提交 · 也可双击或 Enter",
    firstRunHintAutoWriting: "停笔后将提交 · 也可双击或 Enter",
```

Reuse existing `submitHintTypeExtra` for the ` · Shift+Enter …` suffix (do **not** duplicate that string).

- [ ] **Step 2: Add en keys** (same key names)

```ts
    firstRunHintManualIdle: "Write something, then double-tap empty or press Enter",
    firstRunHintManualWriting: "Double-tap empty or press Enter to send",
    firstRunHintAutoIdle: "Write something; it sends when you pause · or double-tap / Enter",
    firstRunHintAutoWriting: "Sends when you pause · or double-tap / Enter",
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/i18n.ts
git commit -m "$(cat <<'EOF'
feat: i18n strings for first-run dock hints

EOF
)"
```

---

### Task 3: Pure helper `firstRunDockHint`

**Files:**
- Create: `src/lib/first-run-hint.ts`

- [ ] **Step 1: Create the helper**

```ts
import { t, type Locale } from "@/lib/i18n";
import type { InputMode, SubmitMode } from "@/lib/settings";

export type FirstRunHintInput = {
  locale: Locale;
  submitMode: SubmitMode;
  inputMode: InputMode;
  /** Same meaning as InkPage `contentPresent` */
  contentPresent: boolean;
};

/**
 * Dock copy while hasCommittedOnce is false (ready/writing only — caller gates phase).
 */
export function firstRunDockHint(input: FirstRunHintInput): string {
  const { locale, submitMode, inputMode, contentPresent } = input;

  if (submitMode === "auto") {
    return contentPresent
      ? t(locale, "firstRunHintAutoWriting")
      : t(locale, "firstRunHintAutoIdle");
  }

  // manual
  if (contentPresent) {
    return t(locale, "firstRunHintManualWriting");
  }

  const idle = t(locale, "firstRunHintManualIdle");
  return inputMode === "type"
    ? `${idle} · ${t(locale, "submitHintTypeExtra")}`
    : idle;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/first-run-hint.ts
git commit -m "$(cat <<'EOF'
feat: add firstRunDockHint helper

EOF
)"
```

---

### Task 4: Wire `dockHint` + graduate on `fading`

**Files:**
- Modify: `src/components/InkPage.tsx`

- [ ] **Step 1: Import helper**

Near other `@/lib/*` imports:

```ts
import { firstRunDockHint } from "@/lib/first-run-hint";
```

- [ ] **Step 2: Branch inside `dockHint`**

Current structure (do not reorder `statusExtra` / busy ahead of first-run):

```ts
  const dockHint = (() => {
    if (statusExtra) return statusExtra;
    if (isBusyPhase) {
      // ... existing switch unchanged ...
    }
    if (phase !== "ready" && phase !== "writing") return "";

    // FIRST-RUN: insert here, before everyday hints
    if (!settings.hasCommittedOnce) {
      return firstRunDockHint({
        locale: settings.locale,
        submitMode: settings.submitMode,
        inputMode,
        contentPresent,
      });
    }

    if (settings.submitMode === "manual") {
      return manualSubmitHint;
    }
    // auto everyday hints — unchanged
    ...
  })();
```

Do **not** add new CSS classes.

- [ ] **Step 3: Graduate in `commitPage`**

Immediately after `setPhaseBoth("fading");` (today ~line 776), mark committed:

```ts
    setPhaseBoth("fading");
    if (!settingsRef.current.hasCommittedOnce) {
      const next = {
        ...settingsRef.current,
        hasCommittedOnce: true,
      };
      settingsRef.current = next;
      setSettings(next);
      saveSettings(next);
    }
    setPageToolsVisible(false);
```

**Requirements:**

- Use `settingsRef` (already kept in sync with settings) so the commit closure does not go stale.
- Only write when currently `false` (avoid redundant IDB writes every commit).
- Do **not** reset this flag in `clearPage` / `resetToReady`.
- `retryLastCommit` does not need to re-graduate (already true after first fading).

Confirm `settingsRef` exists and is updated on settings changes (search `settingsRef` in the file). If it is missing, add:

```ts
const settingsRef = useRef(settings);
useEffect(() => {
  settingsRef.current = settings;
}, [settings]);
```

(Only add if not already present.)

- [ ] **Step 4: Ensure `commitPage` deps**

If the callback eslint requires it, depending on `setSettings` / `saveSettings` is fine; prefer **not** listing full `settings` object if using `settingsRef`.

- [ ] **Step 5: Typecheck / lint touched files**

Run: `npm run lint`  
Expected: clean for edited files.

- [ ] **Step 6: Commit**

```bash
git add src/components/InkPage.tsx
git commit -m "$(cat <<'EOF'
feat: first-run dock hints until first commit

EOF
)"
```

---

### Task 5: Manual acceptance (PRD checklist)

**Files:** none (verification only)

- [ ] **Step 1: Start app**

Run: `npm run dev` → open http://localhost:3000

- [ ] **Step 2: Fresh profile**

Browser: clear site data for localhost (or use a clean profile).

| # | Action | Expect |
|---|--------|--------|
| 1 | Land on blank paper, pen + manual | Dock: `写下一点，然后双击空白或按 Enter` |
| 2 | Draw a stroke (`writing`) | Dock: `双击空白或按 Enter 交给纸` |
| 3 | Switch to type mode, clear / blank | Dock includes `Shift+Enter 换行` |
| 4 | Settings → 自动延迟, blank | Dock: auto idle first-run sentence |
| 5 | Type a character | Dock: auto writing first-run sentence |
| 6 | Double-tap / Enter to commit | Phase fading…; after refresh, everyday `submitHint*` only |
| 7 | Force an error after first fading (e.g. bad key in prod-like path, or offline) | Still everyday hints after returning to ready — not first-run |
| 8 | Clear page | `hasCommittedOnce` stays true — still everyday hints |

- [ ] **Step 3: Old-user migration check**

With memory already present but `hasCommittedOnce` false (default after upgrade): still see first-run until one commit. Do **not** auto-set from memory length.

- [ ] **Step 4: Final commit only if Step 2–3 found fixes**

If bugs fixed, commit those fixes separately. If all pass, no extra commit required.

---

## Out of scope (do not implement)

- Settings toggle to reset first-run (v1.1)
- Paper-surface hint, modal, CSS emphasis
- Auto-graduate when `memory.length > 0`
- Changing submit gestures

---

## Execution handoff

After this plan is approved for execution:

1. **Subagent-Driven (recommended)** — one fresh subagent per task, review between tasks  
2. **Inline Execution** — same session, batch with checkpoints  

Which approach?
