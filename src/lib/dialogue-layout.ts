/**
 * Measure where prior dialogue sits so Continue can rise by a real amount
 * and the type layer can start just below it — not a guessed %.
 */

export type CssRect = { top: number; bottom: number };

/** Alpha > threshold ink bounds in canvas pixel space. */
export function measureCanvasInkBounds(
  canvas: HTMLCanvasElement,
  alphaMin = 10
): { top: number; bottom: number } | null {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  const { width, height } = canvas;
  if (width < 1 || height < 1) return null;

  let data: ImageData;
  try {
    data = ctx.getImageData(0, 0, width, height);
  } catch {
    return null;
  }

  const px = data.data;
  let top = height;
  let bottom = -1;

  for (let y = 0; y < height; y++) {
    const row = y * width * 4;
    for (let x = 0; x < width; x++) {
      if (px[row + x * 4 + 3] > alphaMin) {
        if (y < top) top = y;
        if (y > bottom) bottom = y;
        break;
      }
    }
  }

  if (bottom < 0) return null;
  return { top, bottom: bottom + 1 };
}

function relativeToWrap(
  elRect: DOMRect,
  wrapRect: DOMRect
): CssRect {
  return {
    top: elRect.top - wrapRect.top,
    bottom: elRect.bottom - wrapRect.top,
  };
}

/**
 * Union of quote + reply ink + optional cite DOM, in CSS px relative to wrap.
 */
export function measureDialogueCssBounds(opts: {
  wrap: HTMLElement;
  replyCanvas: HTMLCanvasElement;
  quoteEl?: HTMLElement | null;
  citeEl?: HTMLElement | null;
}): CssRect | null {
  const wrapRect = opts.wrap.getBoundingClientRect();
  const canvasRect = opts.replyCanvas.getBoundingClientRect();
  const scaleY = opts.replyCanvas.height / Math.max(1, canvasRect.height);

  const parts: CssRect[] = [];

  if (opts.quoteEl) {
    parts.push(relativeToWrap(opts.quoteEl.getBoundingClientRect(), wrapRect));
  }

  if (opts.citeEl) {
    parts.push(relativeToWrap(opts.citeEl.getBoundingClientRect(), wrapRect));
  }

  const ink = measureCanvasInkBounds(opts.replyCanvas);
  if (ink) {
    const top =
      canvasRect.top - wrapRect.top + ink.top / scaleY;
    const bottom =
      canvasRect.top - wrapRect.top + ink.bottom / scaleY;
    parts.push({ top, bottom });
  }

  if (parts.length === 0) return null;

  return {
    top: Math.min(...parts.map((p) => p.top)),
    bottom: Math.max(...parts.map((p) => p.bottom)),
  };
}

export function chromeClearanceCss(wrap: HTMLElement): number {
  const chrome = wrap.querySelector(".paper-chrome") as HTMLElement | null;
  const wrapRect = wrap.getBoundingClientRect();
  if (!chrome) return 72;
  return chrome.getBoundingClientRect().bottom - wrapRect.top + 10;
}

/**
 * How far to rise prior dialogue, and where the type layer should start.
 * Rise parks the block under chrome; writingTop sits just below the risen bottom.
 */
export function computeDialoguePark(
  bounds: CssRect,
  chromeClearance: number,
  opts?: {
    gapCss?: number;
    wrapHeight?: number;
    minWritingCss?: number;
  }
): { risePx: number; writingTopPx: number } {
  const gap = opts?.gapCss ?? 14;
  const minWriting = opts?.minWritingCss ?? 140;
  const wrapH = opts?.wrapHeight;

  let risePx = Math.max(0, bounds.top - chromeClearance);

  if (wrapH != null) {
    const maxWritingTop = Math.max(chromeClearance, wrapH - minWriting);
    const risenBottom = bounds.bottom - risePx;
    if (risenBottom + gap > maxWritingTop) {
      risePx = Math.max(risePx, bounds.bottom + gap - maxWritingTop);
    }
  }

  const writingTopPx = Math.max(
    chromeClearance,
    bounds.bottom - risePx + gap
  );

  return { risePx, writingTopPx };
}
