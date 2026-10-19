import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3200";
const useExistingWebServer = process.env.PLAYWRIGHT_USE_EXISTING_WEB === "true";

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "**/*.spec.ts",
  snapshotPathTemplate: "{testDir}/baseline/{arg}{ext}",
  fullyParallel: false,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [["html", { open: "never" }], ["list"]] : "list",
  use: { baseURL, trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: useExistingWebServer
    ? undefined
    : {
        command: "npm run dev:web",
        url: baseURL,
        env: { PORT: "3200" },
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
