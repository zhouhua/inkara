import { getStroke } from "perfect-freehand";

export type Point = {
  x: number;
  y: number;
  pressure: number;
  t: number;
};

export type Stroke = {
  points: Point[];
  color: string;
  erase: boolean;
  /** When true, width follows velocity (mouse/touch). Pen uses real pressure. */
  simulatePressure?: boolean;
};

type AnyPointer = {
  clientX: number;
  clientY: number;
  pressure: number;
};

export function pointerToPoint(
  e: AnyPointer,
  rect: DOMRect,
  dpr: number,
): Point {
  return {
    x: (e.clientX - rect.left) * dpr,
    y: (e.clientY - rect.top) * dpr,
    pressure: e.pressure > 0 ? e.pressure : 0,
    t: performance.now(),
  };
}

/** Normalize pointer pressure: 0 / missing / browser-default 0.5 → mid comfort. */
export function normalizePressure(raw: number): number {
  if (!(raw > 0) || raw === 0.5) {
    return 0.5;
  }
  const t = Math.min(1, Math.max(0, (raw - 0.08) / 0.84));
  return 0.28 + t * 0.72;
}

/** Mid comfort stroke diameter in device pixels (legacy strokeWidth at p=0.5). */
export function strokeSize(dpr: number, erase: boolean): number {
  if (erase) return (18 + 0.5 * 22) * dpr;
  return (2.4 + 0.5 * 3.2) * dpr;
}

/** @deprecated Prefer strokeSize + outline fill; kept for call sites / tests. */
export function strokeWidth(pressure: number, dpr: number, erase: boolean) {
  const p = normalizePressure(pressure);
  if (erase) return (18 + p * 22) * dpr;
  const base = 2.4;
  const span = 3.2;
  return (base + p * span) * dpr;
}

const easeOutSine = (t: number) => Math.sin((t * Math.PI) / 2);

/** Quickdraw / tldraw-style freehand options tuned for e-ink pen feel. */
export function inkStrokeOptions(
  dpr: number,
  opts: {
    erase?: boolean;
    simulatePressure?: boolean;
    last?: boolean;
  } = {},
) {
  const erase = opts.erase ?? false;
  const simulatePressure = opts.simulatePressure ?? true;
  const last = opts.last ?? true;
  const width = strokeSize(dpr, erase);

  if (erase) {
    return {
      size: width,
      thinning: 0.25,
      smoothing: 0.55,
      streamline: 0.55,
      simulatePressure,
      easing: easeOutSine,
      last,
    };
  }

  if (!simulatePressure) {
    return {
      size: width * 1.2,
      thinning: 0.6,
      smoothing: 0.6,
      streamline: 0.6,
      simulatePressure: false,
      easing: easeOutSine,
      last,
    };
  }

  return {
    size: width,
    thinning: 0.5,
    smoothing: 0.6,
    streamline: 0.6,
    simulatePressure: true,
    easing: easeOutSine,
    last,
  };
}

/** Average midpoints into a smooth closed SVG path (perfect-freehand recipe). */
export function getSvgPathFromStroke(points: number[][]): string {
  if (points.length < 2) return "";

  const max = points.length - 1;
  const parts: (string | number)[] = ["M", points[0][0], points[0][1], "Q"];

  for (let i = 1; i < max; i++) {
    const a = points[i];
    const b = points[i + 1];
    parts.push(a[0], a[1], (a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
  }

  const last = points[max];
  const first = points[0];
  parts.push(
    last[0],
    last[1],
    (last[0] + first[0]) / 2,
    (last[1] + first[1]) / 2,
    "Z",
  );
  return parts.join(" ");
}

export type DrawStrokeOptions = {
  alpha?: number;
  /** When false, streamline lags the tip slightly (live drawing). */
  last?: boolean;
};

export function drawStroke(
  ctx: CanvasRenderingContext2D,
  stroke: Stroke,
  dpr: number,
  alphaOrOpts: number | DrawStrokeOptions = 1,
) {
  const pts = stroke.points;
  if (pts.length === 0) return;

  const alpha =
    typeof alphaOrOpts === "number" ? alphaOrOpts : (alphaOrOpts.alpha ?? 1);
  const last =
    typeof alphaOrOpts === "number" ? true : (alphaOrOpts.last ?? true);

  ctx.save();
  ctx.globalAlpha = alpha;

  if (stroke.erase) {
    ctx.globalCompositeOperation = "destination-out";
    ctx.fillStyle = "rgba(0,0,0,1)";
  } else {
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = stroke.color;
  }

  const input = pts.map(
    (p) =>
      [p.x, p.y, normalizePressure(p.pressure)] as [number, number, number],
  );
  const outline = getStroke(
    input,
    inkStrokeOptions(dpr, {
      erase: stroke.erase,
      simulatePressure: stroke.simulatePressure ?? true,
      last,
    }),
  );

  if (outline.length < 2) {
    const p = pts[0];
    const r = strokeSize(dpr, stroke.erase) / 4;
    ctx.beginPath();
    ctx.arc(p.x, p.y, Math.max(0.5, r), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }

  const path = new Path2D(getSvgPathFromStroke(outline));
  ctx.fill(path);
  ctx.restore();
}

export function redrawAll(
  ctx: CanvasRenderingContext2D,
  strokes: Stroke[],
  width: number,
  height: number,
  dpr: number,
  alpha = 1,
  /** While drawing, pass the active stroke so streamline can lag the tip. */
  liveStroke: Stroke | null = null,
) {
  ctx.clearRect(0, 0, width, height);
  for (const s of strokes) {
    drawStroke(ctx, s, dpr, {
      alpha,
      last: liveStroke == null || s !== liveStroke,
    });
  }
}

/** Wrap reply text into lines that fit the page. */
export function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const paragraphs = text.split(/\n+/);
  const lines: string[] = [];

  for (const para of paragraphs) {
    if (!para) {
      lines.push("");
      continue;
    }
    let line = "";
    const chars = [...para];
    for (const ch of chars) {
      const test = line + ch;
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = ch;
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);
  }

  return lines;
}
