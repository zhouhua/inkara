# History, Relive & Continue Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship PRD-03 — searchable history with Relive, multi-hit ink recall picker, Continue (reply rises/fades as background), and a contextual Clear / New chapter dock button, with a 5000-page soft memory cap.

**Architecture:** Keep diary pages in IndexedDB; add an in-memory `sessionCutoffAt` so “New chapter” stops feeding `recentContext()` without deleting pages. Extend recall to score top-N and branch to a paper candidate picker. Drive the post-answer dock from explicit flags (`awaitingContinue`, `hasDialogueBackground`) instead of overloading `pageToolsVisible` alone. Reuse `animateRecallPage` for Relive and single-hit recall.

**Tech Stack:** Next.js client (`InkPage`, `HistoryPanel`), existing Canvas reply layer + CSS transforms, `memory.ts` / `recall.ts` / `i18n.ts`. No new dependencies. No test runner in repo — pure helpers where useful; acceptance is manual per PRD.

**Spec:** `docs/prd/2026-09-24-03-history-recall.md` (Accepted)

---

## File map

| File | Responsibility |
|------|----------------|
| `src/lib/memory.ts` | Soft cap 5000; `getPageById`; session cutoff for context |
| `src/lib/recall.ts` | `findMemoriesByQuery` → ranked list; `resolveRecallHits` multi vs single |
| `src/lib/history-filter.ts` | Pure filter: day ∩ keyword (HistoryPanel) |
| `src/lib/i18n.ts` | All new strings |
| `src/components/HistoryPanel.tsx` | Search UI; Relive action; `onRelive(page)` |
| `src/components/InkPage.tsx` | Relive entry, multi-pick UI, continue / clear-chapter dock, block write while awaiting continue |
| `src/app/globals.css` | Search field, dock buttons, reply background rise/fade, candidate list |

Optional thin extract (if `InkPage` gets worse): `src/lib/session-dock.ts` for “which clear/chapter label” pure helper — prefer inline first; extract in Task 6 if the dock render block exceeds ~40 lines of conditionals.

**Ordering rule:** Declare `awaitingContinue` / `hasDialogueBackground` in **Task 4** (before Relive sets them). Task 6 only wires dock UI + continue animation on top of those flags.

---

## Locked implementation details (from PRD gaps)

### Session context cutoff

```ts
// memory.ts — module state, NOT persisted (refresh ⇒ full recent context again)
let sessionCutoffAt = 0;

export function beginNewChapterSession() {
  sessionCutoffAt = Date.now();
}

export function recentContext(pages = loadMemory()) {
  const inSession = pages.filter((p) => p.createdAt > sessionCutoffAt);
  return inSession.slice(-CONTEXT_PAGES).map(...);
}
```

`appendMemory` still writes full diary; only prompt context is gated.

### Multi-hit rule

```ts
const MIN_SCORE = 3;
const MAX_CANDIDATES = 5;
// After scoring all pages with score >= MIN_SCORE, sort desc:
// - 0 → miss
// - 1 → single
// - 2+ → multi if second.score >= first.score * 0.7 OR second.score >= first.score - 2
//        else treat as single (clear winner)
// multi list = top MAX_CANDIDATES
```

### Post-answer flags (InkPage)

| Flag | Meaning |
|------|---------|
| `awaitingContinue` | Normal answer fully shown; user must tap **继续写** before writing |
| `hasDialogueBackground` | Faded prior reply (or relive) sits on reply canvas as background |

**Dock visibility (reconciles “hide Continue after continue” with Clear/Chapter table):**

```ts
const showSessionDock =
  awaitingContinue || hasDialogueBackground || recallCandidates != null;
```

| Situation | Dock shows |
|-----------|------------|
| `awaitingContinue` | **继续写** + **新篇章** + **导出** |
| `hasDialogueBackground` && hasInput | **清页** + **导出** |
| `hasDialogueBackground` && !hasInput | **新篇章** + **导出** |
| neither | hide session tools (status hint may remain) |

- After successful `animateAnswer`: `awaitingContinue=true`, `hasDialogueBackground=false`
- **继续写**: rise+fade → `awaitingContinue=false`, `hasDialogueBackground=true` (**继续写** disappears; **新篇章/导出** remain)
- Relive / single recall done: `awaitingContinue=false`, `hasDialogueBackground=true` (writable; dock per table)
- Do **not** call `setPageToolsVisible(false)` on every pen/type start when `hasDialogueBackground` — that would hide **清页**. Prefer deriving dock from flags above; deprecate boolean `pageToolsVisible` for this group or set it `true` whenever `showSessionDock`.

While `awaitingContinue`: ignore pen/type/commit; textarea disabled.

### Clear vs New chapter (same control)

```ts
function clearChapterKind(
  hasInput: boolean,
  hasDialogueBackground: boolean,
  awaitingContinue: boolean
): "clear" | "chapter" | null {
  if (hasInput) return "clear";
  if (hasDialogueBackground || awaitingContinue) return "chapter";
  return null;
}
```

Use **`hasContent()`** for `hasInput` (not `contentPresent` alone).

- **clear:** clear ink + typed only; keep reply canvas; keep flags/`sessionCutoffAt`
- **chapter:** clear ink + typed + reply; `hasDialogueBackground=false`; `awaitingContinue=false`; `beginNewChapterSession()` (dock hides because `showSessionDock` becomes false)

While `awaitingContinue`, full reply counts as dialogue → no input ⇒ label **新篇章**.

---

### Task 1: Memory soft cap + session cutoff + getPageById

**Files:**
- Modify: `src/lib/memory.ts`

- [ ] **Step 1: Replace hard cap**

```ts
const MAX_PAGES = 5000; // soft cap
const CONTEXT_PAGES = 8;
```

Keep `slice(-MAX_PAGES)` in `normalizeMemory` / `persist`.

- [ ] **Step 2: Add session cutoff + `beginNewChapterSession` + gate `recentContext`**

As in “Locked implementation details”. Export `beginNewChapterSession`.

- [ ] **Step 3: Add `getPageById` (optional)**

Skip unless a caller needs it in the same PR. Relive passes the full `MemoryPage` from the list; multi-pick also holds page objects. Prefer **omit** to avoid unused exports (YAGNI). If you add it for symmetry with the PRD tech note, that is fine.

- [ ] **Step 4: Commit**

```bash
git add src/lib/memory.ts
git commit -m "$(cat <<'EOF'
feat: soft-cap memory at 5000 and session context cutoff

EOF
)"
```

---

### Task 2: i18n strings

**Files:**
- Modify: `src/lib/i18n.ts`

- [ ] **Step 1: Add zh + en keys** (exact PRD copy)

```ts
// zh
historyRelive: "记忆重现",
historySearchPlaceholder: "搜索写下的字或纸答",
historySearchEmpty: "没有符合的旧页。",
continueWriting: "继续写",
newChapter: "新篇章",
recallPickNevermind: "算了",
recallMiss: "没有找到那一页。也可打开「旧页」查找", // replace existing recallMiss value
// keep clearPage: "清页"
```

```ts
// en
historyRelive: "Relive",
historySearchPlaceholder: "Search what you wrote or the reply",
historySearchEmpty: "No matching pages.",
continueWriting: "Continue",
newChapter: "New chapter",
recallPickNevermind: "Never mind",
recallMiss: "No page found. Or open Pages to look",
```

Do **not** leave the old short `recallMiss` — PRD requires the Pages hint in the same string.

- [ ] **Step 2: Commit**

```bash
git add src/lib/i18n.ts
git commit -m "$(cat <<'EOF'
feat: i18n for history search, relive, and continue session

EOF
)"
```

---

### Task 3: Recall top-N + resolve helper

**Files:**
- Modify: `src/lib/recall.ts`

- [ ] **Step 1: Refactor scoring into shared internal `scorePage`**

Keep behavior of current scoring; extract loop body.

- [ ] **Step 2: Add `findMemoriesByQuery`**

```ts
export type ScoredMemory = { page: MemoryPage; score: number };

export function findMemoriesByQuery(
  query: string,
  pages: MemoryPage[] = loadMemory()
): ScoredMemory[] {
  // return all with score >= 3, sort by score desc, then newer createdAt
}
```

- [ ] **Step 3: Add `resolveRecallHits`**

```ts
export type RecallResolution =
  | { kind: "miss" }
  | { kind: "single"; page: MemoryPage }
  | { kind: "multi"; pages: MemoryPage[] };

export function resolveRecallHits(query: string, pages?: MemoryPage[]): RecallResolution {
  const ranked = findMemoriesByQuery(query, pages);
  if (ranked.length === 0) return { kind: "miss" };
  if (ranked.length === 1) return { kind: "single", page: ranked[0].page };
  const [a, b] = ranked;
  const multi =
    b.score >= a.score * 0.7 || b.score >= a.score - 2;
  if (!multi) return { kind: "single", page: a.page };
  return {
    kind: "multi",
    pages: ranked.slice(0, 5).map((x) => x.page),
  };
}
```

- [ ] **Step 4: Keep `findMemoryByQuery` as thin wrapper**

```ts
export function findMemoryByQuery(...): MemoryPage | null {
  const r = resolveRecallHits(...);
  return r.kind === "single" ? r.page : r.kind === "multi" ? r.pages[0] : null;
}
```

Prefer updating call sites to `resolveRecallHits` in Task 5 instead of relying on wrapper for multi.

- [ ] **Step 5: Commit**

```bash
git add src/lib/recall.ts
git commit -m "$(cat <<'EOF'
feat: rank memory recall hits and detect multi-match

EOF
)"
```

---

### Task 4: History filter helper + HistoryPanel search & Relive

**Files:**
- Create: `src/lib/history-filter.ts`
- Modify: `src/components/HistoryPanel.tsx`
- Modify: `src/components/InkPage.tsx` (props only: `onRelive`)

- [ ] **Step 1: Create filter helper**

```ts
import type { MemoryPage } from "@/lib/memory";
import { toDayKey } from "@/lib/dates";

export function filterHistoryPages(
  pages: MemoryPage[],
  opts: { dayKey: string | null; query: string }
): MemoryPage[] {
  const q = opts.query.trim().toLowerCase();
  return pages.filter((p) => {
    if (opts.dayKey && toDayKey(p.createdAt) !== opts.dayKey) return false;
    if (!q) return true;
    const hay = `${p.transcription} ${p.reply}`.toLowerCase();
    return hay.includes(q);
  });
}
```

- [ ] **Step 2: Extend HistoryPanel props**

```ts
type Props = {
  open: boolean;
  locale: Locale;
  onClose: () => void;
  onMemoryChange: (count: number) => void;
  onRelive: (page: MemoryPage) => void;
};
```

- [ ] **Step 3: Search state + filtered list**

- `const [query, setQuery] = useState("")`
- Reset query on `handleClose`
- Show search `<input>` when `pages.length > 0` (after title/meta), class `history-search`, placeholder `t(locale, "historySearchPlaceholder")`
- `filtered = filterHistoryPages(pages, { dayKey: selectedDay, query })`
- Empty: if `pages.length===0` → `historyEmpty`; else if filtered empty → `historySearchEmpty` or keep `calendarDayNoPages` when only day filter fails with empty query — if `query` non-empty use `historySearchEmpty`

- [ ] **Step 4: Relive control**

In each entry head (beside delete), add:

```tsx
<button
  type="button"
  className="ink-link"
  onClick={() => {
    onRelive(page);
    handleClose();
  }}
>
  {t(locale, "historyRelive")}
</button>
```

Do not make the whole `<li>` clickable.

- [ ] **Step 5: Declare session flags early + wire Relive in InkPage**

**First** add state (needed before Relive; Task 6 builds dock on these):

```ts
const [awaitingContinue, setAwaitingContinue] = useState(false);
const [hasDialogueBackground, setHasDialogueBackground] = useState(false);
const [recallCandidates, setRecallCandidates] = useState<MemoryPage[] | null>(null);
```

(`recallCandidates` UI comes in Task 5; declare here so `resetToReady` can clear it without a forward-reference.)

Update `resetToReady` (and error / abort paths that call it) to also:

```ts
setAwaitingContinue(false);
setHasDialogueBackground(false);
setRecallCandidates(null);
```

Pass `onRelive`:

```ts
onRelive={(page) => {
  setHistoryOpen(false);
  void (async () => {
    setPhaseBoth("recalling");
    clearReplyLayer();
    await animateRecallPage(page, animSignalRef.current);
    recallingRef.current = false; // writable after relive (Q20 A2)
    setHasDialogueBackground(true);
    setAwaitingContinue(false);
    setPhaseBoth("ready");
  })();
}}
```

(Do not rely on legacy `pageToolsVisible=true` alone — Task 6 docks from `showSessionDock`.)

Also change `dismissRecall` / `handlePaperPointer`: after relive/single recall completes, **do not** keep `recallingRef` true (that blocked writing). Tap-to-dismiss applies only while a multi-pick overlay is open (Task 5).

- [ ] **Step 6: CSS for `.history-search`**

Minimal: full width, ink-like border-bottom, no card chrome. Match settings inputs if any.

- [ ] **Step 7: Commit**

```bash
git add src/lib/history-filter.ts src/components/HistoryPanel.tsx src/components/InkPage.tsx src/app/globals.css
git commit -m "$(cat <<'EOF'
feat: history search and relive from review panel

EOF
)"
```

---

### Task 5: Ink recall multi-pick + unify post-recall flags

**Files:**
- Modify: `src/components/InkPage.tsx`
- Modify: `src/app/globals.css`

- [ ] **Step 1: Picker UI (state already declared in Task 4)**

When `recallCandidates` non-null, show overlay list on paper (DOM, not canvas) with date + transcription snippet; buttons per row; **算了** control.

- [ ] **Step 2: Replace `findMemoryByQuery` branch in `runAsk`**

```ts
const resolution = resolveRecallHits(query);
if (resolution.kind === "miss") { writePaperMessage(t(locale, "recallMiss")); ... }
if (resolution.kind === "multi") {
  setRecallCandidates(resolution.pages);
  setPhaseBoth("ready"); // or dedicated; paper interactive for pick
  // do not appendMemory for recall-only
  return;
}
// single → animateRecallPage as today, then:
recallingRef.current = false;
setHasDialogueBackground(true);
setAwaitingContinue(false);
```

- [ ] **Step 3: Candidate actions**

- Select → `setRecallCandidates(null)`; `animateRecallPage`; same flag updates as relive  
- Nevermind / blank paper tap while candidates open → clear candidates, `resetToReady`-like without wiping unrelated state  

- [ ] **Step 4: Stop using long-lived `recallingRef` as “read-only mode”**

After animation, `recallingRef = false`. Remove “tap paper to dismiss recall” **or** limit it to: only while candidates open, Nevermind. (Old “tap to leave recall” conflicts with Q20 write-after-relive.)

- [ ] **Step 5: Commit**

```bash
git add src/components/InkPage.tsx src/app/globals.css
git commit -m "$(cat <<'EOF'
feat: paper multi-hit recall picker and writable relive

EOF
)"
```

---

### Task 6: Continue writing + Clear/Chapter dock

**Files:**
- Modify: `src/components/InkPage.tsx`
- Modify: `src/app/globals.css`

- [ ] **Step 1: Add state** (flags already declared in Task 4)

Wire reply canvas wrapper:

```tsx
<div
  className={[
    "reply-layer",
    hasDialogueBackground && !awaitingContinue ? "is-background" : "",
    awaitingContinue ? "is-awaiting-continue" : "",
  ]
    .filter(Boolean)
    .join(" ")}
>
  <canvas ref={replyRef} ... />
</div>
```

- [ ] **Step 2: After `animateAnswer` success**

```ts
setAwaitingContinue(true);
setHasDialogueBackground(false);
```

(Remove dependence on `pageToolsVisible` for showing continue — use `showSessionDock` in render.)

- [ ] **Step 3: `continueWriting` handler**

- CSS transition on `.reply-layer`: `transform: translateY(-12%)`, `opacity: 0.35` (tune); reduced-motion → opacity only / instant  
- Then: `setAwaitingContinue(false)`, `setHasDialogueBackground(true)`  
- **Do not** force-hide the whole dock — **继续写** simply stops rendering; **新篇章/导出** stay available

- [ ] **Step 4: Block input while `awaitingContinue`; preserve background while writing**

At start of `onPointerDown`, type handlers, double-click commit, Enter commit: if `awaitingContinue` return. Textarea `disabled={awaitingContinue}`.

**Critical — keep dialogue background on write:** when `hasDialogueBackground`, **skip** `clearReplyLayer()` on pen/type start. Audit all write-entry paths.

**Critical — dock on write:** when `hasDialogueBackground`, **do not** `setPageToolsVisible(false)` on pen/type start (or stop using that flag for this dock). User must reach **清页** after typing (Acceptance #5).

- [ ] **Step 5: Replace dock tools UI**

Render `.submit-dock-tools` when `showSessionDock` (see Locked details). Contents:

1. If `awaitingContinue` → **继续写**  
2. `clearKind` via `clearChapterKind(hasContent(), hasDialogueBackground, awaitingContinue)` → **清页** or **新篇章**  
3. **导出**

```ts
const clearInputOnly = () => { /* strokes, typed, ink; NOT reply */ };
const newChapter = () => {
  clearInputOnly();
  clearReplyLayer();
  setHasDialogueBackground(false);
  setAwaitingContinue(false);
  beginNewChapterSession();
  setPhaseBoth("ready");
};
```

- [ ] **Step 6: Commit**

```bash
git add src/components/InkPage.tsx src/app/globals.css
git commit -m "$(cat <<'EOF'
feat: continue writing and contextual clear or new chapter

EOF
)"
```

---

### Task 7: Manual acceptance

**Files:** none

- [ ] **Step 1:** `npm run dev` on a clean profile (or accept existing IDB)

- [ ] **Step 2: Checklist**

| # | Action | Expect |
|---|--------|--------|
| 1 | Seed ≥2 memory pages; open 旧页; search keyword | List filters; empty copy when none |
| 2 | 记忆重现 | Panel closes; page animates; can write; no new memory row until ask completes |
| 3 | Normal ask → answer finishes | Dock: 继续写 + 新篇章 + 导出; writing blocked |
| 4 | 继续写 | Reply rises/fades; can write; **继续写** gone; **新篇章/导出** remain |
| 5 | Type then 清页 | Input gone; faded reply remains |
| 6 | 新篇章 | Paper empty; next ask context ignores pre-chapter pages; 旧页 still lists them |
| 7 | Wide recall query with 2+ close scores | Candidate list; pick / 算了 |
| 8 | Miss recall | Message includes 旧页 hint |
| 9 | `prefers-reduced-motion` | No long rise animation |
| 10 | Soft cap | (optional) unit-level reason about 5000 in code; no need to insert 5000 rows |

- [ ] **Step 3: Fix bugs in follow-up commits if any**

---

## Out of scope

- Cloud sync, vector search, notebooks, tone (PRD-02)
- Persisting `sessionCutoffAt` across refresh
- Changing `CONTEXT_PAGES` from 8

---

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-09-24-history-relive-continue.md`.

**1. Subagent-Driven (recommended)** — fresh subagent per task + reviews  

**2. Inline Execution** — this session, checkpointed  

Which approach?
