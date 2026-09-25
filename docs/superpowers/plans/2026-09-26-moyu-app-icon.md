# 墨语 App 图标 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the existing paper-stroke PWA icons with a fountain-nib + smooth pressure-stroke mark matching the approved「流畅 1」reference.

**Architecture:** Hand-author one master SVG on a 512 viewBox (paper plate + structured nib + single Bézier ribbon stroke), then derive the 192 asset by copying the same markup with identical paths (viewBox stays `0 0 512 512` so paths need not be rescaled). Keep `layout.tsx` and `manifest.webmanifest` paths unchanged.

**Tech Stack:** Static SVG in `public/icons/`. No new dependencies. Manual visual acceptance (no automated icon tests).

**Spec:** `docs/superpowers/specs/2026-09-26-moyu-app-icon-design.md`  
**Reference:** `docs/superpowers/specs/2026-09-26-moyu-app-icon-reference.png`

---

## File map

| File | Responsibility |
|------|----------------|
| `public/icons/icon-512.svg` | Replace: master app icon (512 semantics / maskable) |
| `public/icons/icon-192.svg` | Replace: favicon / apple-touch / manifest 192 |
| `src/app/layout.tsx` | Verify only — icons URLs stay `/icons/icon-192.svg` |
| `public/manifest.webmanifest` | Verify only — icon `src` paths unchanged |

No new runtime files. Do not commit brainstorm companion assets under `.superpowers/`.

---

### Task 1: Author `icon-512.svg`

**Files:**
- Modify: `public/icons/icon-512.svg` (full replace)

- [ ] **Step 1: Write the new 512 SVG**

Replace the entire file with:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" fill="none">
  <!-- Paper plate -->
  <rect width="512" height="512" rx="96" fill="#faf9f6"/>

  <!-- Fountain nib (shifted up so stroke has room) -->
  <g transform="translate(0 -28)">
    <!-- collar -->
    <rect x="226" y="58" width="60" height="18" rx="3" fill="#1c2233" opacity="0.38"/>
    <!-- shoulders -->
    <path
      d="M168 100
         C 190 82, 222 72, 256 72
         C 290 72, 322 82, 344 100
         L 318 168
         C 300 150, 280 140, 256 140
         C 232 140, 212 150, 194 168
         Z"
      fill="#1c2233"/>
    <!-- shoulder facet -->
    <path
      d="M180 112
         C 202 96, 228 88, 256 88
         C 284 88, 310 96, 332 112
         L 316 146
         C 296 130, 276 122, 256 122
         C 236 122, 216 130, 196 146
         Z"
      fill="#3a4258"/>
    <!-- body → tip -->
    <path
      d="M194 160
         C 214 146, 234 138, 256 138
         C 278 138, 298 146, 318 160
         L 286 278
         L 256 360
         L 226 278
         Z"
      fill="#1c2233"/>
    <!-- center facet -->
    <path
      d="M230 172
         C 240 160, 248 154, 256 154
         C 264 154, 272 160, 282 172
         L 268 270
         L 256 325
         L 244 270
         Z"
      fill="#3a4258"/>
    <!-- slit -->
    <path d="M256 178 L256 342" stroke="#faf9f6" stroke-width="3" stroke-linecap="round"/>
    <!-- breather hole -->
    <circle cx="256" cy="202" r="11" fill="#faf9f6"/>
    <!-- tip fork hint -->
    <path
      d="M248 338 L256 360 L264 338"
      stroke="#faf9f6"
      stroke-width="2"
      stroke-linejoin="round"
      fill="none"
      opacity="0.55"/>
  </g>

  <!--
    Pressure stroke: few cubics, outer then inner, meet at a single tip.
    Tuned to echo 流畅 1 — smooth S, fat belly, hairline end.
  -->
  <path
    fill="#1c2233"
    d="M 244 326
       C 205 342, 168 380, 156 428
       C 144 478, 162 528, 214 544
       C 266 560, 336 542, 390 496
       C 430 462, 458 412, 462 356
       C 464 318, 452 284, 432 258
       C 444 282, 454 316, 452 354
       C 448 406, 422 452, 386 484
       C 340 526, 278 542, 230 528
       C 188 516, 172 474, 180 430
       C 188 388, 216 350, 250 330
       Z"/>
</svg>
```

Notes while editing:
- Colors must match the spec table (`#faf9f6`, `#1c2233`, `#3a4258`).
- No drop shadow on the plate (reference PNG may show shadow for presentation; app icon SVG stays flat).
- If the stroke looks kinked when opened in a browser, adjust only the cubic control points — do not switch to polylines.

- [ ] **Step 2: Visual-check 512 in the browser**

Open the file (or serve via `npm run dev` and hit `/icons/icon-512.svg`).

Expected:
- Paper cream rounded square
- Readable nib (shoulders, hole, slit)
- One smooth S stroke from tip, tapering to a single point
- No text

Compare side-by-side with `docs/superpowers/specs/2026-09-26-moyu-app-icon-reference.png`. Proportion need not be pixel-identical; silhouette and pressure feel must match.

- [ ] **Step 3: Commit**

```bash
git add public/icons/icon-512.svg
git commit -m "$(cat <<'EOF'
feat: replace icon-512 with nib + pressure stroke

EOF
)"
```

---

### Task 2: Author `icon-192.svg`

**Files:**
- Modify: `public/icons/icon-192.svg` (full replace)

- [ ] **Step 1: Copy 512 markup into 192**

Use the **exact same** SVG body as Task 1 (same `viewBox="0 0 512 512"`, same paths, same `rx="96"`). Only the filename / served size hint differs; SVG scales via viewBox.

Do **not** invent a second drawing. If Task 1 required stroke tweaks, copy the final 512 file:

```bash
cp public/icons/icon-512.svg public/icons/icon-192.svg
```

- [ ] **Step 2: Smoke-check small size**

Open `/icons/icon-192.svg` in the browser, or shrink the tab / use DevTools device zoom so the icon is ~48–64 CSS px wide.

Expected: still recognizable as nib + curve (验收: 32–64px).

- [ ] **Step 3: Commit**

```bash
git add public/icons/icon-192.svg
git commit -m "$(cat <<'EOF'
feat: sync icon-192 with new nib mark

EOF
)"
```

---

### Task 3: Verify wiring (no path changes)

**Files:**
- Read: `src/app/layout.tsx` (icons metadata ~46–49)
- Read: `public/manifest.webmanifest` (icons array)

- [ ] **Step 1: Confirm paths**

Assert these still point at the replaced files:

- `layout.tsx`: `icon` and `apple` → `/icons/icon-192.svg`
- `manifest.webmanifest`: `192x192` → `/icons/icon-192.svg`; `512x512` → `/icons/icon-512.svg`

If anything else references the old paper-stroke metaphor in comments only, leave it; do not expand scope.

- [ ] **Step 2: Dev-server check**

```bash
npm run dev
```

Visit `http://localhost:3000` — favicon / tab icon should show the new mark (hard-refresh if cached).  
Visit `http://localhost:3000/icons/icon-512.svg` and `/icons/icon-192.svg` — both render.

Optional: open `http://localhost:3000/manifest.webmanifest` and confirm icon URLs.

- [ ] **Step 3: Acceptance checklist (manual)**

From the spec:

- [ ] 192 / 512：笔尖与笔迹可辨
- [ ] ~32–64px：仍能看出「笔 + 一笔弧」
- [ ] 笔迹边缘平滑，无折线感
- [ ] 色板与纸面 UI 一致
- [ ] layout / manifest 路径加载正常

- [ ] **Step 4: Commit only if a wiring fix was required**

If paths were already correct and no file changed in this task, skip commit.

If a path fix was needed:

```bash
git add src/app/layout.tsx public/manifest.webmanifest
git commit -m "$(cat <<'EOF'
fix: point PWA icons at nib mark assets

EOF
)"
```

---

## Out of scope (do not do in this plan)

- PNG / maskable raster exports
- Wordmark / 「墨语」字标
- Updating README screenshots or help-panel art
- Changing `theme_color` / `background_color` (already `#faf9f6`)
