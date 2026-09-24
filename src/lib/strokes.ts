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
};

type AnyPointer = {
  clientX: number;
  clientY: number;
  pressure: number;
};

export function pointerToPoint(
  e: AnyPointer,
  rect: DOMRect,
  dpr: number
): Point {
  return {
    x: (e.clientX - rect.left) * dpr,
    y: (e.clientY - rect.top) * dpr,
    pressure: e.pressure > 0 ? e.pressure : 0.5,
    t: performance.now(),
  };
}

export function drawStroke(
  ctx: CanvasRenderingContext2D,
  stroke: Stroke,
  dpr: number,
  alpha = 1
) {
  const pts = stroke.points;
  if (pts.length === 0) return;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  if (stroke.erase) {
    ctx.globalCompositeOperation = "destination-out";
    ctx.strokeStyle = "rgba(0,0,0,1)";
  } else {
    ctx.globalCompositeOperation = "source-over";
    ctx.strokeStyle = stroke.color;
  }

  if (pts.length === 1) {
    const p = pts[0];
    const r = strokeWidth(p.pressure, dpr, stroke.erase) / 2;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fillStyle = stroke.erase ? "rgba(0,0,0,1)" : stroke.color;
    ctx.fill();
    ctx.restore();
    return;
  }

  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) {
    const prev = pts[i - 1];
    const curr = pts[i];
    const midX = (prev.x + curr.x) / 2;
    const midY = (prev.y + curr.y) / 2;
    ctx.lineWidth = strokeWidth(curr.pressure, dpr, stroke.erase);
    ctx.quadraticCurveTo(prev.x, prev.y, midX, midY);
  }
  const last = pts[pts.length - 1];
  ctx.lineTo(last.x, last.y);
  ctx.stroke();
  ctx.restore();
}

function strokeWidth(pressure: number, dpr: number, erase: boolean) {
  const base = erase ? 18 : 2.2;
  const p = Math.min(1, Math.max(0.15, pressure));
  return (base + p * (erase ? 22 : 3.8)) * dpr;
}

export function redrawAll(
  ctx: CanvasRenderingContext2D,
  strokes: Stroke[],
  width: number,
  height: number,
  dpr: number,
  alpha = 1
) {
  ctx.clearRect(0, 0, width, height);
  for (const s of strokes) {
    drawStroke(ctx, s, dpr, alpha);
  }
}

/** Wrap reply text into lines that fit the page. */
export function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
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
