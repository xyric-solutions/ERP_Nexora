import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { purchaseDocumentSchema } from "../../packages/contracts/src/procurement/index.js";
const company = "work-list-company";
const bills = Array.from({ length: 130 }, (_, index) =>
  purchaseDocumentSchema.parse({
    id: `bill-${index}`,
    company_id: company,
    kind: "bill",
    code: `BILL-${String(index).padStart(4, "0")}`,
    document_date: "2026-11-11",
    currency: "USD",
    state: index % 2 ? "draft" : "approved",
    version: 1,
    total_amount: "100.00",
    reserved_amount: "0.00",
    supplier_id: null,
    supplier_name: `Supplier ${index % 3}`,
    source_code: null,
    created_by: "maker",
    updated_by: "maker",
    created_at: "2026-11-11T00:00:00Z",
    updated_at: "2026-11-11T00:00:00Z",
  }),
);
for (const theme of ["light", "dark"] as const)
  for (const width of [1440, 390])
    test(`Shared work controls: ${theme}, ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 1000 });
      await page.addInitScript((value) => localStorage.setItem("nexora-theme-preference-v1", value), theme);
      const writes: string[] = [],
        errors: string[] = [],
        cursors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.route("**/api/v1/**", (route) => {
        const req = route.request(),
          url = new URL(req.url()),
          path = url.pathname;
        if (req.method() !== "GET") {
          writes.push(path);
          return route.abort();
        }
        if (path === "/api/v1/auth/session")
          return route.fulfill({
            json: {
              status: "authenticated",
              tenant_id: "work-list-tenant",
              csrf_token: "c".repeat(43),
              idle_expires_at: "2099-01-01T00:00:00Z",
              absolute_expires_at: "2099-01-01T00:00:00Z",
              user: {
                id: "maker",
                email: "maker@example.invalid",
                display_name: "Work list maker",
                roles: ["purchase_maker"],
                permissions: [
                  "procurement.document.read",
                  "procurement.document.create",
                  "procurement.vendor.read",
                  "banking.payment.read",
                ],
              },
            },
          });
        if (path === "/api/v1/procurement/companies" || path === "/api/v1/banking/companies")
          return route.fulfill({ json: { items: [{ id: company, code: "WORK", name: "Synthetic company" }] } });
        if (path === "/api/v1/procurement/options")
          return route.fulfill({
            json: {
              currencies: [{ code: "USD", name: "US Dollar" }],
              bank_accounts: [],
              can_self_approve: false,
              execution_mode: "instruction_only",
            },
          });
        if (path === "/api/v1/procurement/suppliers") return route.fulfill({ json: { items: [], next_cursor: null } });
        if (path === "/api/v1/procurement/documents") {
          const offset = Number(url.searchParams.get("cursor") ?? 0);
          cursors.push(String(offset));
          return route.fulfill({
            json: {
              items: bills.slice(offset, offset + 50),
              next_cursor: offset + 50 < bills.length ? String(offset + 50) : null,
            },
          });
        }
        if (path === "/api/v1/banking/payments/options") return route.fulfill({ json: { bank_accounts: [] } });
        if (path === "/api/v1/banking/payments")
          return route.fulfill({
            json: {
              items: Array.from({ length: 35 }, (_, index) => ({
                id: `payment-${index}`,
                company_id: company,
                reference: `BP-${String(index).padStart(4, "0")}`,
                bank_account_id: "bank-1",
                bank_account_name: "Operating bank",
                bank_name: "Synthetic bank",
                account_number_masked: "0011",
                posting_date: "2026-11-11",
                value_date: null,
                currency: "USD",
                total_amount: "1250.50",
                line_count: 1,
                narration_summary: "Supplier payment",
                state: "approved",
                version: 1,
                created_at: "2026-11-11T00:00:00Z",
              })),
              next_cursor: null,
            },
          });
        return route.fulfill({ status: 404, json: { detail: "No read fixture" } });
      });
      await page.goto("/#/purchases/purchase-bills");
      await expect(page.getByRole("heading", { name: "Bills", exact: true })).toBeVisible();
      const table = page.locator('[data-work-table="app/features/purchasing/views/purchase-workspace:1"]');
      await expect(table).toBeVisible();
      const rows = table.locator("tbody tr:not([hidden])");
      await expect(rows).toHaveCount(25);
      await table.getByLabel("Rows per page").selectOption("10");
      await expect(rows).toHaveCount(10);
      await table.getByRole("button", { name: "Next page", exact: true }).click();
      await expect(rows.first()).toContainText("BILL-0010");
      await table.getByLabel("Rows per page").selectOption("100");
      await expect(rows).toHaveCount(100);
      expect(cursors).toEqual(["0", "50"]);
      await table.getByRole("button", { name: "Next page", exact: true }).click();
      await expect(rows).toHaveCount(30);
      await expect(rows.first()).toContainText("BILL-0100");
      await table.getByLabel("Filter records", { exact: true }).fill("BILL-0129");
      await expect(rows).toHaveCount(1);
      await expect(rows.first()).toContainText("0129");
      await table.getByRole("button", { name: "Reset table controls" }).click();
      await table.getByRole("button", { name: "Filters", exact: true }).click();
      await table.getByLabel("Filter field").selectOption({ label: "Status" });
      await table.getByLabel("Filter condition").selectOption("equals");
      await table.getByLabel("Filter value").fill("draft");
      await table.getByRole("button", { name: "Apply filter" }).click();
      await expect(rows).toHaveCount(65);
      await table.getByRole("button", { name: "Choose records columns" }).click();
      const supplier = page.getByRole("menuitemcheckbox", { name: "Supplier", exact: true });
      await supplier.click();
      await expect(supplier).toHaveAttribute("aria-checked", "false");
      await page.keyboard.press("Escape");
      await expect(table.locator("thead th").filter({ hasText: /^Supplier$/ })).toBeHidden();
      await table.getByRole("button", { name: "Reset table controls" }).click();
      await table.getByRole("button", { name: "Filters", exact: true }).click();
      const result = await new AxeBuilder({ page })
        .include('[data-work-table="app/features/purchasing/views/purchase-workspace:1"]')
        .analyze();
      expect(result.violations).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
      await page.screenshot({ path: `tmp/work-list-${theme}-${width}.png`, fullPage: true });
      await page.goto("/#/banking/bank-payments");
      const banking = page.locator('[data-work-table="app/features/banking/views/banking-payments:1"]');
      await expect(banking).toBeVisible();
      await expect(banking.locator("tbody tr:not([hidden])")).toHaveCount(25);
      await banking.getByLabel("Rows per page").selectOption("10");
      await expect(banking.locator("tbody tr:not([hidden])")).toHaveCount(10);
      await banking.getByRole("button", { name: "Next page", exact: true }).click();
      await expect(banking.locator("tbody tr:not([hidden])").first()).toContainText("BP-0010");
      expect(writes).toEqual([]);
      expect(errors).toEqual([]);
      await page.unrouteAll({ behavior: "wait" });
    });
