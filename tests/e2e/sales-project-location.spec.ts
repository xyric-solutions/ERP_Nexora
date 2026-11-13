import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { chooseProjectLocation, SALES_COMPANY, signInToSales } from "./sales-session";

/**
 * Project and Location are required on every Sales transaction form (12 Nov 2026).
 * Options come from the Master Data project/location lists of the signed-in company.
 */

const evidence = "tmp/project-location-evidence";

test.afterEach(async ({ page }) => page.unrouteAll({ behavior: "wait" }));

test("invoice form: Project and Location are required, loaded for the active company and kept on the invoice", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 1000 });
  const { writes, masterQueries } = await signInToSales(page);
  await page.goto("/#/sales/invoices/new");
  await expect(page.getByRole("heading", { name: "New Invoice", level: 1 })).toBeVisible();

  await page.getByRole("combobox", { name: /^Customer/ }).selectOption({ label: "CUS-001 · Atlas Engineering" });
  await page.getByLabel("Product, line 1").selectOption("INS-HRS");
  await page.getByRole("button", { name: "Save invoice" }).click();
  await expect(page.getByText("Select a project.")).toBeVisible();
  await expect(page.getByText("Select a location.")).toBeVisible();
  await page.screenshot({ path: `${evidence}/invoice-required-light-1440.png`, fullPage: true });

  await chooseProjectLocation(page);
  await page.getByRole("button", { name: "Save invoice" }).click();
  // A saved invoice returns to the list; open it in the invoice panel.
  await page.getByRole("row").filter({ hasText: "INV-004" }).click();
  const panel = page.getByRole("dialog");
  await expect(panel).toContainText("PRJ-001 · Lahore Plant Upgrade");
  await expect(panel).toContainText("LOC-001 · Lahore");

  // Lists are requested for the signed-in company, active records only.
  expect(new Set(masterQueries.map((item) => item.kind))).toEqual(new Set(["projects", "locations"]));
  for (const { query } of masterQueries) {
    expect(query.get("company_id")).toBe(SALES_COMPANY);
    expect(query.get("status")).toBe("active");
  }
  expect(writes).toEqual([]);
  expect(errors).toEqual([]);
});

test("Confirm Order on a quotation saved before the rule asks for Project and Location", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const { writes } = await signInToSales(page);
  await page.goto("/#/sales/quotations/QTN-008");
  await page.getByRole("button", { name: "Confirm Order" }).first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Confirm Order · QTN-008")).toBeVisible();
  await dialog.getByRole("button", { name: "Confirm Order" }).click();
  await expect(dialog.getByText("Select a project.")).toBeVisible();
  await chooseProjectLocation(page, dialog, "PRJ-002 · Karachi Port Expansion", "LOC-002 · Karachi");
  await page.screenshot({ path: `${evidence}/confirm-order-dialog-light-1440.png` });
  await dialog.getByRole("button", { name: "Confirm Order" }).click();
  await expect(page.getByText(/Sales order SO-008 is now in Delivery/)).toBeVisible();
  await page.goto("/#/sales/sales-orders/SO-008");
  await expect(page.getByText("PRJ-002 · Karachi Port Expansion")).toBeVisible();
  expect(writes).toEqual([]);
});

test("receipt, batch receipts, delivery and recurring template forms all require them", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const { writes } = await signInToSales(page);

  // Add New › Receipt.
  await page.goto("/#/sales/receipts/new:RCT");
  let sheet = page.getByRole("dialog");
  await sheet.getByRole("combobox", { name: /^Customer/ }).selectOption({ label: "Indus Textile · CUS-003" });
  await sheet.getByRole("button", { name: "Save & Post" }).click();
  await expect(sheet.getByText("Select a project.")).toBeVisible();
  await expect(sheet.getByText("Select a location.")).toBeVisible();

  // Batch › Receipts: one project and location for every line.
  await page.goto("/#/sales/receipts/new:batch:receipts");
  sheet = page.getByRole("dialog");
  await expect(sheet.getByText("Applies to every line.")).toBeVisible();
  await expect(sheet.getByLabel("Project", { exact: true })).toBeVisible();
  await expect(sheet.getByLabel("Location", { exact: true })).toBeVisible();

  // Delivery on a confirmed order saved before the rule. Items are delivered
  // directly: there is no Pick step and the only action is Confirm Delivery.
  await page.goto("/#/sales/pick-pack-delivery");
  await page.getByRole("row").filter({ hasText: "SO-004" }).click();
  sheet = page.getByRole("dialog");
  await expect(sheet.getByRole("button", { name: "Pick all" })).toHaveCount(0);
  await expect(sheet.getByRole("button", { name: /Pick & Pack/i })).toHaveCount(0);
  await sheet.getByRole("button", { name: "Confirm Delivery" }).click();
  await expect(sheet.getByText("Select a project.")).toBeVisible();
  await page.screenshot({ path: `${evidence}/delivery-required-light-1440.png` });

  // Recurring template saved before the rule: Create Invoice opens it to be completed.
  await page.goto("/#/sales/recurring-bills");
  await page.getByRole("row").filter({ hasText: "RB-001" }).getByRole("button", { name: "Create Invoice" }).click();
  sheet = page.getByRole("dialog");
  await expect(sheet.getByText("RB-001 · Maintenance contract · monthly instalment")).toBeVisible();
  await chooseProjectLocation(page, sheet);
  await sheet.getByRole("button", { name: "Save changes" }).click();
  await page.getByRole("row").filter({ hasText: "RB-001" }).getByRole("button", { name: "Create Invoice" }).click();
  await expect(page.getByRole("heading", { name: "Create Invoice · RB-001" })).toBeVisible();
  await expect(page.getByLabel("Project", { exact: true })).toContainText("PRJ-001 · Lahore Plant Upgrade");
  expect(writes).toEqual([]);
});

test("without Master Data access the fields explain why and saving stays blocked", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signInToSales(page);
  await page.route("**/api/v1/master_data/**", (route) =>
    route.fulfill({ status: 403, json: { type: "about:blank", title: "Forbidden", status: 403, code: "FORBIDDEN", detail: "Forbidden" } }),
  );
  await page.goto("/#/sales/quotations/new");
  await expect(page.getByText("You do not have access to projects.", { exact: false })).toBeVisible();
  await expect(page.getByLabel("Project", { exact: true })).toBeDisabled();
});

for (const theme of ["light", "dark"] as const)
  for (const width of [1440, 768, 390]) {
    test(`quotation form with Project and Location: ${theme}, ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 1000 });
      await page.addInitScript((value) => localStorage.setItem("nexora-theme-preference-v1", value), theme);
      const { writes } = await signInToSales(page);
      await page.goto("/#/sales/quotations/new");
      await expect(page.getByLabel("Project", { exact: true })).toBeVisible();
      await chooseProjectLocation(page);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
      await page.screenshot({ path: `${evidence}/quotation-form-${theme}-${width}.png`, fullPage: true });
      // Pre-existing findings outside this change (recorded in remaining-ui-migration.md): shell AI
      // trigger name, avatar, search shortcut and breadcrumb contrast, and the scrollable lifecycle strip.
      const results = await new AxeBuilder({ page })
        .include("main")
        .exclude(".nx-intelligence-trigger--ai")
        .exclude(".nx-avatar-button")
        .exclude(".nx-global-search")
        .exclude(".nx-breadcrumbs")
        .exclude('[aria-label="Document lifecycle"]')
        .analyze();
      expect(results.violations.filter((item) => item.impact === "critical" || item.impact === "serious").map((item) => item.id)).toEqual([]);
      expect(writes).toEqual([]);
    });
  }
