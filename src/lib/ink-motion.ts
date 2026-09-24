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

export function easeOutQuad(t: number) {
  return 1 - (1 - t) * (1 - t);
}

/** Ink sinking into the sheet: fade + slight downward drift + soft blur. */
export async function fadeInkIntoPaper(
  canvas: HTMLCanvasElement,
  opts?: { signal?: { cancelled: boolean } }
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

  const duration = 1400;
  const start = performance.now();
  const drift = Math.max(4, canvas.height * 0.012);

  await new Promise<void>((resolve) => {
    const tick = (now: number) => {
      if (opts?.signal?.cancelled) {
        resolve();
        return;
      }
      const p = Math.min(1, (now - start) / duration);
      const e = easeInOutCubic(p);
      const alpha = 1 - e;
      const y = drift * e;
      // Soft “bleed” blur grows as ink sinks
      const blur = 0.4 + e * 2.2;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.save();
      ctx.globalAlpha = alpha;
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
  let blockTop =
    align === "center"
      ? Math.max(padY, (canvasHeight - totalHeight) / 2)
      : padY;
  if (blockTop + totalHeight > maxBottom) {
    blockTop = Math.max(padY, maxBottom - totalHeight);
  }

  const startY = blockTop + reserveAbove;
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

/** CSS pixel Y for placing a quote just above a canvas reply start. */
export function quoteTopCssPx(
  replyStartY: number,
  dpr: number,
  quoteHeightCss: number,
  gapCss = 10
): number {
  return Math.max(4.5 * 16, replyStartY / dpr - quoteHeightCss - gapCss);
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

export function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}
