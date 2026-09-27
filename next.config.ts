import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
initOpenNextCloudflareForDev();
