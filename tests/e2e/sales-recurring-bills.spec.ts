import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { chooseProjectLocation, signInToSales } from "./sales-session";

/**
 * Sales › Recurring Bills (prototype, browser-session data only). Only the
 * session and Master Data project/location lists are mocked; every write is
 * refused so the test proves nothing is written to the server.
 */

const evidence = "tmp/recurring-evidence";

test.afterEach(async ({ page }) => page.unrouteAll({ behavior: "wait" }));

test("single template: Create Invoice opens the prefilled invoice form and Save & Post issues it", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 1000 });
  const { writes } = await signInToSales(page);
  await page.goto("/#/sales/recurring-bills");

  await expect(page.getByRole("heading", { name: "Recurring Bills", level: 1 })).toBeVisible();
  await page.screenshot({ path: `${evidence}/list-light-1440.png`, fullPage: true });

  // Create a weekly single-customer template.
  await page.getByRole("button", { name: "+ New Template" }).click();
  await page.getByRole("menuitem", { name: "Single customer template" }).click();
  const sheet = page.getByRole("dialog");
  await expect(sheet.getByText("New recurring template")).toBeVisible();
  await sheet.getByRole("button", { name: "Save template" }).click();
  await expect(sheet.getByText("Select a customer.")).toBeVisible();
  await sheet.getByLabel("Billed for").fill("Weekly site support");
  await sheet.getByRole("combobox", { name: /^Customer/ }).selectOption({ label: "CUS-003 · Indus Textile" });
  await sheet.getByLabel("Frequency").selectOption("Weekly");
  await sheet.getByLabel("Next invoice date").fill("2026-11-12");
  await sheet.getByLabel("Product, line 1").selectOption("INS-HRS");
  await sheet.getByLabel("Quantity, line 1").fill("5");
  await chooseProjectLocation(page, sheet);
  await page.screenshot({ path: `${evidence}/template-form-light-1440.png` });
  await sheet.getByRole("button", { name: "Save template" }).click();
  await expect(sheet).toHaveCount(0);

  const row = page.getByRole("row").filter({ hasText: "Weekly site support" });
  await expect(row).toContainText("RB-005");
  await expect(row).toContainText("Weekly");

  // Create Invoice → existing invoice form, prefilled and labelled Save & Post.
  await row.getByRole("button", { name: "Create Invoice" }).click();
  await expect(page.getByRole("heading", { name: "Create Invoice · RB-005" })).toBeVisible();
  await expect(page.getByRole("combobox", { name: /^Customer/ })).toBeDisabled();
  await expect(page.getByLabel("Description, line 1")).toHaveValue(/Installation & Commissioning · 12 Nov 2026/);
  await expect(page.getByLabel("Quantity, line 1")).toHaveValue("5");
  await expect(page.getByText("From recurring template", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Project", { exact: true })).toContainText("PRJ-001 · Lahore Plant Upgrade");
  await expect(page.getByLabel("Location", { exact: true })).toContainText("LOC-001 · Lahore");
  await page.screenshot({ path: `${evidence}/invoice-from-template-light-1440.png`, fullPage: true });
  await page.getByRole("button", { name: "Save & Post" }).click();

  // Back on Recurring Bills; the template moved one week on.
  await expect(page.getByRole("heading", { name: "Recurring Bills", level: 1 })).toBeVisible();
  await expect(page.getByRole("row").filter({ hasText: "Weekly site support" })).toContainText("19 Nov 2026");
  await page.goto("/#/sales/invoices");
  await expect(page.getByRole("row").filter({ hasText: "From RB-005" })).toHaveCount(1);

  expect(writes).toEqual([]);
  expect(errors).toEqual([]);
});

test("batch template: Save & Post all invoices every customer and advances the period", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 1000 });
  const { writes } = await signInToSales(page);
  await page.goto("/#/sales/recurring-bills");

  // New batch template for three customers.
  await page.getByRole("button", { name: "+ New Template" }).click();
  await page.getByRole("menuitem", { name: "Batch template · multiple customers" }).click();
  const sheet = page.getByRole("dialog");
  await sheet.getByLabel("Billed for").fill("Monthly hosting");
  await sheet.getByLabel("Include Atlas Engineering").check();
  await sheet.getByRole("button", { name: "Save template" }).click();
  await expect(sheet.getByText(/at least two customers/)).toBeVisible();
  await sheet.getByLabel("Include Crescent Holdings").check();
  await sheet.getByLabel("Include Margalla Foods").check();
  await sheet.getByLabel("Product, line 1").selectOption("AMC-STD");
  await chooseProjectLocation(page, sheet, "PRJ-002 · Karachi Port Expansion", "LOC-002 · Karachi");
  await expect(sheet.getByText("Customers · 3 selected")).toBeVisible();
  await page.screenshot({ path: `${evidence}/batch-form-light-1440.png` });
  await sheet.getByRole("button", { name: "Save template" }).click();
  await expect(sheet).toHaveCount(0);

  const row = page.getByRole("row").filter({ hasText: "Monthly hosting" });
  await expect(row).toContainText("0 of 3 invoiced");
  await row.getByRole("button", { name: "Create Invoices (3)" }).click();

  // Review one customer in the invoice form first.
  const batch = page.getByRole("dialog");
  await expect(batch.getByText("Create invoices · RB-005")).toBeVisible();
  await page.screenshot({ path: `${evidence}/batch-invoices-light-1440.png` });
  await batch.getByRole("row").filter({ hasText: "Crescent Holdings" }).getByRole("button", { name: "Review in invoice form" }).click();
  await expect(page.getByRole("heading", { name: "Create Invoice · RB-005" })).toBeVisible();
  await expect(page.getByRole("combobox", { name: /^Customer/ })).toHaveValue("c2");
  await page.getByRole("button", { name: "Save & Post" }).click();
  await expect(page.getByRole("row").filter({ hasText: "Monthly hosting" })).toContainText("1 of 3 invoiced");

  // Save & Post all for the remaining two.
  await page.getByRole("row").filter({ hasText: "Monthly hosting" }).getByRole("button", { name: "Create Invoices (2)" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Save & Post all (2)" }).click();
  await expect(page.getByRole("dialog").getByRole("button", { name: "All invoiced" })).toBeDisabled();
  await page.getByRole("dialog").getByRole("button", { name: "Close" }).first().click();
  const advanced = page.getByRole("row").filter({ hasText: "Monthly hosting" });
  await expect(advanced).toContainText("0 of 3 invoiced");
  await expect(advanced).not.toContainText("· due");

  expect(writes).toEqual([]);
  expect(errors).toEqual([]);
});

for (const theme of ["light", "dark"] as const)
  for (const width of [1440, 768, 390]) {
    test(`Recurring Bills layout and accessibility: ${theme}, ${width}px`, async ({ page }) => {
          await page.setViewportSize({ width, height: 1000 });
      await page.addInitScript((value) => localStorage.setItem("nexora-theme-preference-v1", value), theme);
      const { writes } = await signInToSales(page);
      await page.goto("/#/sales/recurring-bills");
      await expect(page.getByRole("heading", { name: "Recurring Bills", level: 1 })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
      await page.screenshot({ path: `${evidence}/list-${theme}-${width}.png`, fullPage: true });
      await page.goto("/#/sales/recurring-bills/RB-004");
      await expect(page.getByRole("dialog")).toBeVisible();
      await page.screenshot({ path: `${evidence}/batch-template-${theme}-${width}.png` });
      const results = await new AxeBuilder({ page }).include("[role=dialog]").analyze();
      expect(results.violations.filter((item) => item.impact === "critical" || item.impact === "serious")).toEqual([]);
      expect(writes).toEqual([]);
    });
  }
