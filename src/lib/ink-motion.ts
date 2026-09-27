/**
 * Canvas ink motion helpers — fade into paper, hand-like reply reveal.
 */

export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function easeInOutCubic(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export function easeInCubic(t: number) {
  return t * t * t;
}

export function easeOutQuad(t: number) {
  return 1 - (1 - t) * (1 - t);
}

/** Question ink soaking into the sheet — long enough to mask model wait. */
export const INK_SINK_DURATION_MS = 2600;

/** Ink sinking into the sheet: linger, soft bleed halo, downward soak. */
export async function fadeInkIntoPaper(
  canvas: HTMLCanvasElement,
  opts?: { signal?: { cancelled: boolean }; durationMs?: number }
): Promise<void> {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const copy = document.createElement("canvas");
  copy.width = canvas.width;
  copy.height = canvas.height;
  copy.getContext("2d")?.drawImage(canvas, 0, 0);

  if (prefersReducedMotion()) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    return;
  }

  const duration = opts?.durationMs ?? INK_SINK_DURATION_MS;
  const start = performance.now();
  const drift = Math.max(8, canvas.height * 0.022);
  const bleedX = Math.max(3, canvas.width * 0.004);

  await new Promise<void>((resolve) => {
    const tick = (now: number) => {
      if (opts?.signal?.cancelled) {
        resolve();
        return;
      }
      const p = Math.min(1, (now - start) / duration);
      // Opacity lingers, then dissolves; motion eases smoothly.
      const fadeE = easeInCubic(p);
      const moveE = easeInOutCubic(p);
      const alpha = 1 - fadeE;
      const y = drift * moveE;
      const blur = 0.15 + fadeE * 2.35;
      const spread = bleedX * moveE;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Wide soft halo — ink spreading into paper fibers
      ctx.save();
      ctx.globalAlpha = alpha * 0.3;
      ctx.filter = `blur(${blur * 2.5}px)`;
      ctx.drawImage(
        copy,
        -spread,
        y + drift * 0.08,
        canvas.width + spread * 2,
        canvas.height
      );
      ctx.restore();

      // Mid veil
      ctx.save();
      ctx.globalAlpha = alpha * 0.5;
      ctx.filter = `blur(${blur * 1.4}px)`;
      ctx.drawImage(copy, -spread * 0.35, y * 0.92, canvas.width + spread * 0.7, canvas.height);
      ctx.restore();

      // Core stroke, still readable early in the soak
      ctx.save();
      ctx.globalAlpha = alpha * 0.95;
      ctx.filter = `blur(${blur}px)`;
      ctx.drawImage(copy, 0, y);
      ctx.restore();

      if (p < 1) {
        requestAnimationFrame(tick);
      } else {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        resolve();
      }
    };
    requestAnimationFrame(tick);
  });
}

/**
 * Same sink motion for typed ink: fade the live textarea in place so there is
 * no canvas handoff jump (CSS vs canvas glyph metrics never match perfectly).
 * Leaves the element at opacity 0 — caller should clear content, then reset styles.
 */
export async function fadeElementIntoPaper(
  el: HTMLElement,
  opts?: {
    signal?: { cancelled: boolean };
    driftPx?: number;
    durationMs?: number;
  }
): Promise<void> {
  const drift = opts?.driftPx ?? 14;

  // Claim opacity with an inline value immediately so `.is-active { opacity: 1 }`
  // cannot snap the text back if classes update mid-animation.
  el.style.willChange = "opacity, transform, filter";
  el.style.transformOrigin = "50% 0%";
  el.style.opacity = "1";

  if (prefersReducedMotion()) {
    el.style.opacity = "0";
    el.style.transform = "";
    el.style.filter = "";
    el.style.transformOrigin = "";
    return;
  }

  const duration = opts?.durationMs ?? INK_SINK_DURATION_MS;
  const start = performance.now();

  await new Promise<void>((resolve) => {
    const tick = (now: number) => {
      if (opts?.signal?.cancelled) {
        el.style.opacity = "0";
        resolve();
        return;
      }
      const p = Math.min(1, (now - start) / duration);
      const fadeE = easeInCubic(p);
      const moveE = easeInOutCubic(p);
      const scale = 1 + moveE * 0.014;
      el.style.opacity = String(1 - fadeE);
      el.style.transform = `translateY(${drift * moveE}px) scale(${scale})`;
      el.style.filter = `blur(${0.15 + fadeE * 2.35}px)`;
      if (p < 1) {
        requestAnimationFrame(tick);
      } else {
        resolve();
      }
    };
    requestAnimationFrame(tick);
  });

  el.style.opacity = "0";
  el.style.transform = "";
  el.style.filter = "";
  el.style.transformOrigin = "";
  el.style.willChange = "";
}

export type ReplyChar = { ch: string; x: number; y: number };

export function layoutReplyChars(
  ctx: CanvasRenderingContext2D,
  text: string,
  opts: {
    padX: number;
    padY: number;
    maxWidth: number;
    lineHeight: number;
    canvasHeight: number;
    /** Vertically center the block on the page (default). */
    align?: "top" | "center";
    /**
     * Extra space above the text, included when centering
     * (e.g. room for a quote sitting just above the reply).
     */
    reserveAbove?: number;
    /**
     * Lock the first glyph's Y (canvas px). Used while streaming so growing
     * text expands downward instead of recentering upward.
     */
    fixedStartY?: number;
  }
): ReplyChar[] {
  const {
    padX,
    padY,
    maxWidth,
    lineHeight,
    canvasHeight,
    align = "center",
    reserveAbove = 0,
    fixedStartY,
  } = opts;
  const paragraphs = text.split(/\n+/);
  const lines: { text: string; width: number }[] = [];

  for (const para of paragraphs) {
    if (!para) {
      lines.push({ text: "", width: 0 });
      continue;
    }
    let line = "";
    for (const ch of [...para]) {
      const test = line + ch;
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push({ text: line, width: ctx.measureText(line).width });
        line = ch;
      } else {
        line = test;
      }
    }
    if (line) lines.push({ text: line, width: ctx.measureText(line).width });
  }

  if (lines.length === 0) return [];

  const blockHeight = lines.length * lineHeight;
  const totalHeight = reserveAbove + blockHeight;
  const maxBottom = canvasHeight - padY;
  let startY: number;
  if (fixedStartY != null) {
    startY = fixedStartY;
  } else {
    let blockTop =
      align === "center"
        ? Math.max(padY, (canvasHeight - totalHeight) / 2)
        : padY;
    if (blockTop + totalHeight > maxBottom) {
      blockTop = Math.max(padY, maxBottom - totalHeight);
    }
    startY = blockTop + reserveAbove;
  }

  const chars: ReplyChar[] = [];
  let y = startY;
  for (const row of lines) {
    if (y > maxBottom) break;
    let x = padX;
    for (const ch of [...row.text]) {
      chars.push({ ch, x, y });
      x += ctx.measureText(ch).width;
    }
    y += lineHeight;
  }

  return chars;
}

/** Ease `current` toward `target` (canvas px). */
export function smoothApproach(
  current: number,
  target: number,
  factor = 0.22
): number {
  const delta = target - current;
  if (Math.abs(delta) < 0.5) return target;
  return current + delta * factor;
}

/** CSS pixel Y for placing a quote just above a canvas reply start. */
export function quoteTopCssPx(
  replyStartY: number,
  dpr: number,
  quoteHeightCss: number,
  gapCss = 10
): number {
  return Math.max(4.5 * 16, replyStartY / dpr - quoteHeightCss - gapCss) + 20;
}

/** Draw a single glyph with ink-settling motion (ghost + settle). */
export function drawInkChar(
  ctx: CanvasRenderingContext2D,
  ch: string,
  x: number,
  y: number,
  dpr: number,
  progress = 1
) {
  const p = Math.min(1, Math.max(0, progress));
  const e = easeOutQuad(p);
  const lift = (1 - e) * 3.2 * dpr;
  const jitter = (1 - e) * (Math.random() - 0.5) * 1.1 * dpr;

  ctx.save();
  // Faint under-stroke (ink bleed)
  ctx.globalAlpha = 0.12 * e;
  ctx.fillText(ch, x + jitter * 0.6, y + lift + 0.6 * dpr);
  // Main stroke settling
  ctx.globalAlpha = 0.35 + 0.65 * e;
  ctx.fillText(ch, x + jitter * 0.25, y + lift);
  ctx.restore();
}

export function charRevealDelay(ch: string, reduced: boolean): number {
  if (reduced) return 0;
  if (/[\s]/.test(ch)) return 48;
  if (/[，。！？、；：,.!?;:]/.test(ch)) return 90;
  if (/[—…·]/.test(ch)) return 70;
  return 22 + Math.floor(Math.random() * 14);
}

/** Opacity fade for a full reply block (reduced-motion path). */
export async function fadeInReplyBlock(opts: {
  durationMs?: number;
  signal?: { cancelled: boolean };
  paint: (alpha: number) => void;
}): Promise<void> {
  const duration = opts.durationMs ?? 180;
  const start = performance.now();
  await new Promise<void>((resolve) => {
    const tick = (now: number) => {
      if (opts.signal?.cancelled) {
        resolve();
        return;
      }
      const p = Math.min(1, (now - start) / duration);
      opts.paint(easeOutQuad(p));
      if (p < 1) requestAnimationFrame(tick);
      else resolve();
    };
    requestAnimationFrame(tick);
  });
}

export function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}
