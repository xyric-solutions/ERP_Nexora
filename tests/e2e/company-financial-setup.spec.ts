import { test, expect, type Browser } from "@playwright/test";
import { mkdir } from "node:fs/promises";
const enabled = process.env.NEXORA_FINANCE_CALENDAR_E2E === "true";
async function signIn(browser: Browser, user: string) {
  const context = await browser.newContext({ baseURL: process.env.PLAYWRIGHT_BASE_URL });
  const page = await context.newPage();
  await page.goto("/login");
  await page.getByLabel("Username or email", { exact: true }).fill(user);
  await page.getByLabel("Password", { exact: true }).fill(process.env.NEXORA_E2E_PASSWORD!);
  const response = page.waitForResponse((r) => new URL(r.url()).pathname === "/api/v1/auth/login");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  const result = await (await response).json();
  if (result.status === "tenant_selection_required") {
    await expect(page.getByRole("heading", { name: "Choose your organization", exact: true })).toBeVisible();
    await page
      .getByRole("button", { name: /^Open / })
      .first()
      .click();
  }
  await expect(page.getByRole("heading", { name: "Choose a company", exact: true })).toBeVisible();
  const selected = page.waitForResponse((r) => new URL(r.url()).pathname === "/api/v1/auth/session/company");
  await page.getByRole("button", { name: "Open Nexora R06 UAT Company", exact: true }).click();
  expect((await selected).ok()).toBe(true);
  // Restore the persisted company session explicitly; the SessionProvider remounts on selection.
  await page.goto("/");
  await expect(page.locator(".nx-sidebar")).toBeVisible();
  return { context, page };
}
test.describe("Accounting navigation and company fiscal setup", () => {
  test.skip(!enabled || !process.env.NEXORA_E2E_PASSWORD, "Run the isolated fiscal setup harness");
  test("moves fiscal setup, preserves period creation, reports and permission boundaries", async ({ browser }) => {
    test.setTimeout(180000);
    const admin = await signIn(browser, "r06.override-admin");
    try {
      await admin.page.goto("/#/finance/fiscal-periods");
      await expect(admin.page.getByRole("heading", { name: "Company Setup", exact: true })).toBeVisible();
      await admin.page.getByLabel("Fiscal year start", { exact: true }).fill("2042-07-01");
      await expect(admin.page.getByLabel("Fiscal year end", { exact: true })).toHaveValue("2043-06-30");
      await expect(admin.page.getByLabel("Fiscal year end", { exact: true })).toHaveJSProperty("readOnly", true);
      await admin.page.getByRole("button", { name: "Preview new fiscal year", exact: true }).click();
      const dialog = admin.page.getByRole("dialog");
      await expect(dialog).toContainText("2043-06-30");
      await dialog.getByRole("button", { name: "Confirm calendar action", exact: true }).click();
      const table = admin.page.getByRole("table", { name: "Persisted monthly Finance periods" });
      await expect(table.locator("tbody tr")).toHaveCount(12);
      await expect(table.getByText("Soft Closed", { exact: true })).toHaveCount(12);
      const calendar = await admin.page.getByLabel("Fiscal year", { exact: true }).inputValue();
      await admin.page.reload();
      await expect(admin.page.getByLabel("Fiscal year", { exact: true })).toHaveValue(calendar);
      await expect(table.locator("tbody tr")).toHaveCount(12);
      await mkdir("tmp/accounting-menu-evidence", { recursive: true });
      for (const [width, height, label] of [
        [1440, 1000, "desktop"],
        [390, 844, "mobile"],
      ] as const) {
        await admin.page.setViewportSize({ width, height });
        for (const theme of ["light", "dark"] as const) {
          await admin.page.evaluate((t) => (document.documentElement.dataset.theme = t), theme);
          await expect
            .poll(() => admin.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
            .toBe(true);
          await admin.page.screenshot({
            path: `tmp/accounting-menu-evidence/setup-${label}-${theme}.png`,
            fullPage: true,
          });
        }
      }
      await admin.page.setViewportSize({ width: 1440, height: 1000 });
      await admin.page.goto("/#/finance/general-ledger");
      await expect(admin.page.locator(".nx-breadcrumbs")).toContainText("Reports");
      await admin.page.goto("/#/finance/nominals");
      await expect(admin.page.getByRole("button", { name: "Ledgers & Close", exact: true })).toHaveCount(0);
      await expect(admin.page.getByRole("button", { name: "Group & Reporting", exact: true })).toHaveCount(0);
      await admin.page.screenshot({ path: "tmp/accounting-menu-evidence/accounting-menu.png", fullPage: true });
      const reader = await signIn(browser, "r06.restricted");
      try {
        await reader.page.goto("/#/configuration/company-fiscal-currency");
        await expect(
          reader.page.getByText("Permission required: platform.fiscal_calendar.read.", { exact: true }),
        ).toBeVisible();
      } finally {
        await reader.context.close();
      }
    } finally {
      await admin.context.close();
    }
  });
});
