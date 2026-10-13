import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  oxc: { jsx: { runtime: "automatic" } },
  resolve: { alias: { "@prototype": fileURLToPath(new URL("./app", import.meta.url)) } },
  test: { environment: "node", include: ["tests/unit/**/*.test.ts"] },
});
