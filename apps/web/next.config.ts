import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { NextConfig } from "next";

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

const config: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: workspaceRoot,
  poweredByHeader: false,
  reactStrictMode: true,
  turbopack: { root: workspaceRoot },
};

export default config;
