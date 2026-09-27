/**
 * Cloudflare Workers static assets have a 25 MiB per-file limit.
 * onnxruntime-web's asyncify wasm can exceed that; embeddings load it from CDN instead.
 */
import fs from "node:fs";
import path from "node:path";

const ASSETS = path.join(process.cwd(), ".open-next", "assets");
const MAX_BYTES = 25 * 1024 * 1024;

function walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) {
      walk(p);
    } else if (st.size > MAX_BYTES) {
      console.log(
        `[strip-cf-oversized-assets] removing ${path.relative(process.cwd(), p)} (${(st.size / 1024 / 1024).toFixed(1)} MiB)`
      );
      fs.unlinkSync(p);
    }
  }
}

walk(ASSETS);
