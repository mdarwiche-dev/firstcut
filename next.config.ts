import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Native/WASM server deps must not be bundled by webpack/turbopack.
  serverExternalPackages: [
    "better-sqlite3",
    "occt-import-js",
    "pdf-to-img",
    "@napi-rs/canvas",
  ],
};

export default nextConfig;
