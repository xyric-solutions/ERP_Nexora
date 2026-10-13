import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "**/*.spec.ts",
  snapshotPathTemplate: "{testDir}/baseline/{arg}{ext}",
  fullyParallel: false,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [["html", { open: "never" }], ["list"]] : "list",
  use: { baseURL: "http://127.0.0.1:3200", trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev:web",
    url: "http://127.0.0.1:3200",
    env: { PORT: "3200" },
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
