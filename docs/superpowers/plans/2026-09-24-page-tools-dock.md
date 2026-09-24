# Page Tools Dock Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move Clear / Export from the top menu into the bottom dock (right side), showing them only after a normal reply has fully appeared and hiding them when the user starts writing again.

**Architecture:** Add a `pageToolsVisible` boolean in `InkPage`. Set it `true` only after a successful `animateAnswer` path; set it `false` on writing, clear, fade/commit start, and `resetToReady`. Render the two icon buttons in `submit-dock` opposite the status hint; restyle the dock with `space-between`.

**Tech Stack:** Next.js / React client component (`InkPage.tsx`), existing `reicon-react` icons, `globals.css`. No new dependencies. No automated UI tests (manual acceptance per spec).

**Spec:** `docs/superpowers/specs/2026-09-24-page-tools-dock-design.md`

---

## File map

| File | Responsibility |
|------|----------------|
| `src/components/InkPage.tsx` | State, visibility toggles, move buttons from header to dock |
| `src/app/globals.css` | Dock layout (space-between) + page-tools group fade |

No new files.

---

### Task 1: Dock CSS for left status / right tools

**Files:**
- Modify: `src/app/globals.css` (`.status-dock` / `.submit-dock` ~363–387; add rules after `.submit-dock-main`)

- [ ] **Step 1: Update dock flex alignment**

Change `.status-dock, .submit-dock` from `justify-content: flex-start` to `justify-content: space-between`.

- [ ] **Step 2: Add page-tools styles**

Insert after `.submit-dock-main`:

```css
.submit-dock-tools {
  display: flex;
  align-items: center;
  gap: 0.15rem;
  flex-shrink: 0;
  pointer-events: none;
  opacity: 0;
  transform: translateY(2px);
  transition:
    opacity 180ms cubic-bezier(0.16, 1, 0.3, 1),
    transform 180ms cubic-bezier(0.16, 1, 0.3, 1);
}

.submit-dock-tools.is-visible {
  pointer-events: auto;
  opacity: 1;
  transform: translateY(0);
}

@media (prefers-reduced-motion: reduce) {
  .submit-dock-tools {
    transition: none;
    transform: none;
  }
}
```

Do **not** toggle `visibility: hidden` on hide — it cuts off the fade. Rely on `opacity` + `pointer-events`.

Also tighten left column if needed for narrow screens (验收 #6): change `.submit-dock-main` `max-width` from `min(36rem, 92%)` to something like `min(36rem, calc(100% - 4.5rem))` so two icon buttons always fit on the right.

- [ ] **Step 3: Commit**

```bash
git add src/app/globals.css
git commit -m "$(cat <<'EOF'
style: bottom dock space-between for page tools

EOF
)"
```

---

### Task 2: Wire `pageToolsVisible` and relocate buttons

**Files:**
- Modify: `src/components/InkPage.tsx`
  - State near other `useState` (~122–136)
  - `resetToReady` ~574–579
  - Successful answer path ~692–705
  - Commit / fade start ~773
  - Writing entry ~929, ~971, ~993
  - `clearPage` ~1049–1067
  - Header buttons ~1332–1351 (remove)
  - Dock ~1374–1405 (add tools)

- [ ] **Step 1: Add state**

Near other state declarations:

```tsx
const [pageToolsVisible, setPageToolsVisible] = useState(false);
```

- [ ] **Step 2: Set true only after normal answer completes**

In `runAsk`, after successful `animateAnswer` and `appendMemory`, **before** `setPhaseBoth("ready")` (~700–705):

```tsx
setPageToolsVisible(true);
setPhaseBoth("ready");
```

Do **not** set true on the recall success path (~680–688).

- [ ] **Step 3: Set false on hide triggers**

1. `resetToReady` — add `setPageToolsVisible(false);`
2. Start of commit when entering fade — right after `setPhaseBoth("fading");` (~773): `setPageToolsVisible(false);`
3. `clearPage` — near the start: `setPageToolsVisible(false);`
4. Every place that enters writing:
   - pointer down / stroke start that calls `setPhaseBoth("writing")` (~929)
   - typed change that calls `setPhaseBoth("writing")` (~971, ~993)

Use `setPageToolsVisible(false)` alongside those `setPhaseBoth("writing")` calls (or a tiny helper `enterWriting()` if it reduces duplication — optional, YAGNI if only 3 sites).

Also set false in `dismissRecall` if desired for consistency (recall never sets true; optional).

- [ ] **Step 4: Remove Clear / Export from header**

Delete the two `<button>` blocks for `clearPage` / `onExport` inside `.paper-actions` (~1332–1351). Keep mode switch, history, settings.

- [ ] **Step 5: Render tools in the dock**

Replace the dock block (~1374–1405) so it has two children:

```tsx
<div className="status-dock submit-dock">
  <div className="submit-dock-main">
    {/* existing idle ring + dockHint unchanged */}
  </div>
  <div
    className={`submit-dock-tools ${pageToolsVisible ? "is-visible" : ""}`}
    aria-hidden={!pageToolsVisible}
  >
    <button
      type="button"
      className="ink-link ink-icon-btn"
      onClick={clearPage}
      aria-label={t(settings.locale, "clearPage")}
      title={t(settings.locale, "clearPage")}
      tabIndex={pageToolsVisible ? 0 : -1}
    >
      <Eraser size={16} aria-hidden />
    </button>
    <button
      type="button"
      className="ink-link ink-icon-btn"
      onClick={onExport}
      aria-label={t(settings.locale, "exportPage")}
      title={t(settings.locale, "exportPage")}
      tabIndex={pageToolsVisible ? 0 : -1}
    >
      <Export size={16} aria-hidden />
    </button>
  </div>
</div>
```

Icons `Eraser` / `Export` stay imported; no new i18n keys.

Note: `onPaperDoubleClick` already ignores `button` via `closest("button, ...")` — no change needed.

- [ ] **Step 6: Manual acceptance**

Run: `npm run dev` → open the app.

Check against spec 验收:

1. Blank paper: no Clear/Export in header or dock (dock tools not visible)
2. Write → submit → after reply fully appears: dock right shows two icons
3. Start writing again: icons hide
4. Clear: page clears, icons hide
5. During fading/thinking/answering: icons hidden
6. Narrow viewport: tools stay on the right, status on the left, above safe-area

- [ ] **Step 7: Commit**

```bash
git add src/components/InkPage.tsx src/app/globals.css
git commit -m "$(cat <<'EOF'
feat: show clear/export in dock after reply settles

EOF
)"
```

---

## Done when

All checklist items in the spec 验收 section pass manually, and both commits are on the branch.
