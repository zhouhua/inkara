import path from "node:path";
import type { NextConfig } from "next";

const sharedSrc = path.resolve(__dirname, "../../src");

const nextConfig: NextConfig = {
  output: "standalone",
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  serverExternalPackages: ["mysql2"],
  turbopack: {
    resolveAlias: {
      "@": sharedSrc,
    },
  },
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      "@": sharedSrc,
    };
    return config;
  },
  // Allow importing shared lib outside this app directory.
  experimental: {
    externalDir: true,
  },
};

export default nextConfig;
