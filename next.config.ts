import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Cursor/browser tooling may hit the app via 127.0.0.1 while the
  // page Origin is localhost (or the reverse); allow HMR either way.
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  serverExternalPackages: ["@huggingface/transformers", "onnxruntime-node"],
  // Next 16 defaults to Turbopack; keep an empty turbopack block so a
  // webpack resolveAlias (for non-Turbopack builds) does not fail the build.
  turbopack: {},
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      sharp$: false,
      "onnxruntime-node$": false,
    };
    // Do not emit ORT wasm into /.next/static (asyncify > 25 MiB — Cloudflare Workers asset limit).
    // Runtime loads these from jsDelivr via env.backends.onnx.wasm.wasmPaths in embeddings.ts.
    config.module.rules.push({
      test: /ort.*\.wasm$/,
      type: "asset/resource",
      generator: { emit: false },
    });
    return config;
  },
};

export default nextConfig;

import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

// Cloudflare Wrangler bootstrap can take a long time / hang in CI and Playwright.
// Skip it when running automated tests; local `npm run dev` still gets CF bindings.
if (!process.env.SKIP_OPENNEXT_CLOUDFLARE_DEV) {
  initOpenNextCloudflareForDev();
}
