/**
 * Composite the visible paper (background + ink + reply) and download as PNG.
 */
export async function exportPaperPng(opts: {
  wrap: HTMLElement;
  ink: HTMLCanvasElement;
  reply: HTMLCanvasElement;
  fileName?: string;
}): Promise<void> {
  const { wrap, ink, reply } = opts;
  const rect = wrap.getBoundingClientRect();
  const w = Math.max(1, Math.floor(rect.width));
  const h = Math.max(1, Math.floor(rect.height));
  const dpr = Math.min(window.devicePixelRatio || 1, 2);

  const out = document.createElement("canvas");
  out.width = Math.floor(w * dpr);
  out.height = Math.floor(h * dpr);
  const ctx = out.getContext("2d");
  if (!ctx) return;

  ctx.scale(dpr, dpr);

  // Paper fill from CSS variable
  const paper =
    getComputedStyle(document.documentElement).getPropertyValue("--paper").trim() ||
    "#faf9f6";
  ctx.fillStyle = paper;
  ctx.fillRect(0, 0, w, h);

  // Soft grain hint
  ctx.save();
  ctx.globalAlpha = 0.06;
  ctx.fillStyle = "#1c2233";
  for (let i = 0; i < 1200; i++) {
    const x = Math.random() * w;
    const y = Math.random() * h;
    ctx.fillRect(x, y, 1, 1);
  }
  ctx.restore();

  ctx.drawImage(ink, 0, 0, w, h);
  ctx.drawImage(reply, 0, 0, w, h);

  const stamp = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const name =
    opts.fileName ||
    `inkara-${stamp.getFullYear()}${pad(stamp.getMonth() + 1)}${pad(stamp.getDate())}-${pad(stamp.getHours())}${pad(stamp.getMinutes())}.png`;

  await new Promise<void>((resolve, reject) => {
    out.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("export_failed"));
          return;
        }
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = name;
        a.click();
        URL.revokeObjectURL(url);
        resolve();
      },
      "image/png",
      0.95
    );
  });
}
