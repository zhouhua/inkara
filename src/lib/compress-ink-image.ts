/**
 * Shrink a pen-mode ink canvas to a JPEG data URL for /api/ask.
 * Keeps handwriting readable while cutting upload size.
 */
export function compressInkDataUrl(
  source: HTMLCanvasElement,
  opts?: { maxEdge?: number; quality?: number },
): string {
  const maxEdge = opts?.maxEdge ?? 1280;
  const quality = opts?.quality ?? 0.82;
  const sw = source.width;
  const sh = source.height;
  if (sw <= 0 || sh <= 0) return "";

  const scale = Math.min(1, maxEdge / Math.max(sw, sh));
  const tw = Math.max(1, Math.round(sw * scale));
  const th = Math.max(1, Math.round(sh * scale));

  const out = document.createElement("canvas");
  out.width = tw;
  out.height = th;
  const ctx = out.getContext("2d");
  if (!ctx) return source.toDataURL("image/png");

  // Paper-like fill so JPEG has no transparent black fringe.
  ctx.fillStyle = "#faf9f6";
  ctx.fillRect(0, 0, tw, th);
  ctx.drawImage(source, 0, 0, tw, th);

  try {
    return out.toDataURL("image/jpeg", quality);
  } catch {
    return source.toDataURL("image/png");
  }
}
