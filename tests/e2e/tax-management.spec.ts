import { test, expect, type Browser, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";

async function signIn(browser: Browser, username: string) {
  const context = await browser.newContext({ baseURL: process.env.PLAYWRIGHT_BASE_URL });
  const page = await context.newPage();
  await page.goto("/login");
  await page.getByRole("textbox", { name: "Username or email" }).fill(username);
  await page.getByRole("textbox", { name: "Password", exact: true }).fill(process.env.NEXORA_E2E_PASSWORD!);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByRole("button", { name: "Open nexora-currency-browser", exact: true }).click();
  await page.goto("/#/finance/taxes");
  await expect(page.getByRole("heading", { name: "Unified Tax Management Console" })).toBeVisible();
  return { context, page };
}
async function checkTaxFormLayout(page: Page) {
  const dialog = page.getByRole("dialog");
  await mkdir("tmp/tax-layout-evidence", { recursive: true });
  for (const [width, height, label] of [
    [1440, 1000, "desktop"],
    [900, 1100, "tablet"],
    [390, 844, "mobile"],
    [844, 390, "landscape"],
  ] as const) {
    await page.setViewportSize({ width, height });
    for (const theme of ["light", "dark"] as const) {
      await page.evaluate((theme) => {
        document.documentElement.dataset.theme = theme;
      }, theme);
      await dialog.getByLabel("Tax Name", { exact: true }).focus();
      await expect(dialog.getByRole("button", { name: "Create Tax Definition", exact: true })).toBeInViewport({
        ratio: 1,
      });
      await expect(dialog.getByRole("button", { name: "Cancel", exact: true })).toBeInViewport({ ratio: 1 });
      const box = await dialog.boundingBox();
      if (!box) throw new Error("Tax dialog has no visible bounds");
      expect(box.x).toBeGreaterThanOrEqual(15);
      expect(box.y).toBeGreaterThanOrEqual(15);
      expect(box.x + box.width).toBeLessThanOrEqual(width - 15);
      expect(box.y + box.height).toBeLessThanOrEqual(height - 15);
      const modalLayer = await dialog.evaluate((element) => Number(getComputedStyle(element).zIndex));
      const sidebarLayer = await page
        .locator(".nx-sidebar")
        .evaluate((element) => Number(getComputedStyle(element).zIndex));
      const overlayLayer = await page
        .locator('[data-slot="dialog-overlay"]')
        .evaluate((element) => Number(getComputedStyle(element).zIndex));
      expect(modalLayer).toBeGreaterThan(overlayLayer);
      expect(overlayLayer).toBeGreaterThan(sidebarLayer);
      expect(await dialog.locator("form").evaluate((form) => form.scrollWidth <= form.clientWidth)).toBe(true);
      const createColour = await page
        .getByRole("button", { name: "Add New Tax Definition", exact: true, includeHidden: true })
        .evaluate((button) => getComputedStyle(button).backgroundColor);
      const saveColour = await dialog
        .getByRole("button", { name: "Create Tax Definition", exact: true })
        .evaluate((button) => getComputedStyle(button).backgroundColor);
      expect(createColour).toBe(saveColour);
      await page.screenshot({ path: `tmp/tax-layout-evidence/${label}-${theme}.png`, fullPage: true });
    }
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.evaluate(() => {
    document.documentElement.dataset.theme = "light";
  });
}

test.describe("unified tax management", () => {
  test.use({ actionTimeout: 15000 });
  test.skip(
    process.env.NEXORA_TAX_E2E !== "true" || !process.env.NEXORA_E2E_PASSWORD,
    "Use the isolated tax browser harness.",
  );
  test("creates, edits, deactivates and persists secure company mappings across themes and viewport sizes", async ({
    browser,
  }) => {
    test.setTimeout(240000);
    const admin = await signIn(browser, "r06.override-admin");
    try {
      await expect(admin.page.getByRole("button", { name: "Add New Tax Definition", exact: true })).toBeEnabled();
      await admin.page.getByRole("button", { name: "Add New Tax Definition", exact: true }).click();
      const dialog = admin.page.getByRole("dialog");
      await expect(dialog.getByLabel("Tax Name", { exact: true })).toBeFocused();
      await checkTaxFormLayout(admin.page);
      await dialog.getByLabel("Tax Name", { exact: true }).fill("Supplies withholding");
      await dialog.getByLabel("Tax Rate (%)", { exact: true }).fill("5.50");
      await dialog.getByLabel("Effective date", { exact: true }).fill("2026-09-01");
      await dialog.getByLabel("Associated Nominal (GL) Account", { exact: true }).selectOption("tax-browser-liability");
      await dialog.getByLabel("Applicable ERP Module", { exact: true }).selectOption("sales");
      await expect(dialog.getByLabel("Associated Nominal (GL) Account", { exact: true })).toHaveValue("");
      await dialog.getByLabel("Applicable ERP Module", { exact: true }).selectOption("purchases");
      await dialog.getByLabel("Associated Nominal (GL) Account", { exact: true }).selectOption("tax-browser-asset");
      await dialog.getByLabel("Tax treatment", { exact: true }).selectOption("withholding:settlement");
      await expect(dialog.getByLabel("Associated Nominal (GL) Account", { exact: true })).toHaveValue("");
      await dialog.getByLabel("Associated Nominal (GL) Account", { exact: true }).selectOption("tax-browser-liability");
      await dialog.getByLabel("Search nominal code or name", { exact: true }).fill("Recoverable");
      await expect(dialog.getByText(/1 eligible company accounts/)).toBeVisible();
      await expect(dialog.getByLabel("Associated Nominal (GL) Account", { exact: true })).toHaveValue(
        "tax-browser-liability",
      );
      await dialog.getByLabel("Search nominal code or name", { exact: true }).fill("");
      await dialog.getByLabel("Reason for change", { exact: true }).fill("Controlled browser tax setup");
      await mkdir("tmp/tax-management-evidence", { recursive: true });
      await admin.page.screenshot({ path: "tmp/tax-management-evidence/definition-form.png", fullPage: true });
      await dialog.getByRole("button", { name: "Create Tax Definition", exact: true }).click();
      const row = admin.page.getByRole("row").filter({ hasText: "Supplies withholding" });
      await expect(row).toContainText("TAX-001");
      await expect(row).toContainText("5.50%");
      await row.getByRole("button", { name: "Edit", exact: true }).click();
      await dialog.getByLabel("Tax Rate (%)", { exact: true }).fill("6.00");
      await dialog.getByLabel("Reason for change", { exact: true }).fill("Rate revision for browser verification");
      await dialog.getByRole("button", { name: "Save revision", exact: true }).click();
      await expect(row).toContainText("6.00%");
      await admin.page.reload();
      await expect(row).toContainText("6.00%");
      await row.getByRole("button", { name: "Deactivate", exact: true }).click();
      await dialog.getByLabel("Reason", { exact: true }).fill("Retain historical definition");
      await dialog.getByRole("button", { name: "Confirm status change", exact: true }).click();
      await expect(row.getByText("Inactive", { exact: true })).toBeVisible();
      await row.getByRole("button", { name: "Supplies withholding", exact: true }).click();
      await expect(dialog.getByText("Revision 1 · effective 2026-09-01", { exact: true })).toBeVisible();
      await dialog.getByRole("button", { name: "Close", exact: true }).click();
      await mkdir("tmp/tax-management-evidence", { recursive: true });
      for (const [width, height, theme, label] of [
        [1440, 1000, "light", "desktop-light"],
        [1440, 1000, "dark", "desktop-dark"],
        [900, 1100, "dark", "tablet-dark"],
        [390, 844, "light", "mobile-light"],
        [390, 844, "dark", "mobile-dark"],
      ] as const) {
        await admin.page.setViewportSize({ width, height });
        await admin.page.evaluate((theme) => {
          document.documentElement.dataset.theme = theme;
        }, theme);
        await expect(admin.page.getByRole("heading", { name: "Unified Tax Management Console" })).toBeVisible();
        await expect
          .poll(() => admin.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
          .toBe(true);
        await admin.page.screenshot({ path: `tmp/tax-management-evidence/${label}.png`, fullPage: true });
      }
      const reader = await signIn(browser, "r06.maker");
      try {
        await expect(reader.page.getByRole("button", { name: "Add New Tax Definition", exact: true })).toBeDisabled();
        await expect(reader.page.getByRole("row").filter({ hasText: "Supplies withholding" })).toContainText(
          "Inactive",
        );
        const origin = `http://127.0.0.1:${process.env.NEXORA_BANK_CONTEXT_E2E_PORT}`;
        const denied = await reader.context.request.get(`${origin}/api/v1/finance/taxes?company_id=wrong-company`, {
          headers: { "x-company-id": "nexora-currency-browser" },
        });
        expect(denied.status()).toBe(403);
        const csrf = await reader.context.request.post(`${origin}/api/v1/finance/taxes`, {
          headers: { "x-company-id": "nexora-currency-browser", "idempotency-key": "reject-csrf" },
          data: {
            company_id: "nexora-currency-browser",
            name: "Rejected",
            tax_type: "WHT",
            rate: "5.50",
            module: "purchases",
            treatment: "withholding",
            trigger: "settlement",
            account_id: "tax-browser-liability",
            effective_date: "2026-09-01",
            reason: "Reject unsafe request",
          },
        });
        expect(csrf.status()).toBe(403);
      } finally {
        await reader.context.close();
      }
    } finally {
      await admin.context.close();
    }
  });
});
