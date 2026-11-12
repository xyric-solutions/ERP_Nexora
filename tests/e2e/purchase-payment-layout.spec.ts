import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { purchaseDocumentSchema, supplierSchema } from "../../packages/contracts/src/procurement/index.js";

const company = "payment-layout-company";
const suppliers = ["A", "B"].map((name) =>
  supplierSchema.parse({
    company_id: company,
    id: `supplier-${name}`,
    code: `SUP-00${name === "A" ? 1 : 2}`,
    name: `Supplier ${name}`,
    version: 1,
    risk_status: "normal",
    profile: { billing_city: name === "A" ? "Karachi" : "Lahore" },
  }),
);
const bills = [
  { id: "open", code: "BILL-001", supplier_id: "supplier-A", reserved_amount: "0.00", currency: "USD" },
  { id: "reserved", code: "BILL-002", supplier_id: "supplier-A", reserved_amount: "100.00", currency: "USD" },
  { id: "partial", code: "BILL-003", supplier_id: "supplier-A", reserved_amount: "60.00", currency: "USD" },
  { id: "other-currency", code: "BILL-004", supplier_id: "supplier-A", reserved_amount: "0.00", currency: "EUR" },
  { id: "other-supplier", code: "BILL-005", supplier_id: "supplier-B", reserved_amount: "0.00", currency: "USD" },
].map((bill) =>
  purchaseDocumentSchema.parse({
    company_id: company,
    document_date: "2026-11-11",
    version: 1,
    created_by: "maker",
    updated_by: "maker",
    created_at: "2026-11-11T00:00:00Z",
    updated_at: "2026-11-11T00:00:00Z",
    total_amount: "100.00",
    kind: "bill",
    state: "approved",
    source_code: null,
    supplier_name: bill.supplier_id === "supplier-A" ? "Supplier A" : "Supplier B",
    ...bill,
  }),
);

test.afterEach(async ({ page }) => page.unrouteAll({ behavior: "wait" }));

for (const theme of ["light", "dark"] as const)
  for (const width of [1440, 768, 390]) {
    test(`Supplier-driven payment allocation: ${theme}, ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 1100 });
      await page.addInitScript((value) => localStorage.setItem("nexora-theme-preference-v1", value), theme);
      const queries: URLSearchParams[] = [],
        errors: string[] = [],
        writes: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.route("**/api/v1/**", (route) => {
        const request = route.request(),
          url = new URL(request.url()),
          path = url.pathname;
        if (request.method() !== "GET") {
          writes.push(path);
          return route.abort();
        }
        if (path === "/api/v1/auth/session")
          return route.fulfill({
            json: {
              status: "authenticated",
              tenant_id: "payment-layout-tenant",
              csrf_token: "c".repeat(43),
              idle_expires_at: "2099-01-01T00:00:00Z",
              absolute_expires_at: "2099-01-01T00:00:00Z",
              user: {
                id: "maker",
                email: "maker@example.invalid",
                display_name: "Payment maker",
                roles: ["purchase_maker"],
                permissions: [
                  "procurement.document.read",
                  "procurement.document.create",
                  "procurement.document.action",
                  "procurement.document.submit",
                  "procurement.vendor.read",
                ],
              },
            },
          });
        if (path === "/api/v1/procurement/companies")
          return route.fulfill({ json: { items: [{ id: company, code: "PAY", name: "Synthetic payment company" }] } });
        if (path === "/api/v1/procurement/options")
          return route.fulfill({
            json: {
              currencies: [
                { code: "USD", name: "US Dollar" },
                { code: "EUR", name: "Euro" },
              ],
              bank_accounts: [
                { id: "bank-one", account_name: "Operating bank", currency: "USD" },
                { id: "bank-two", account_name: "Euro bank", currency: "EUR" },
                { id: "bank-three", account_name: "Reserve bank", currency: "USD" },
                { id: "bank-unsupported", account_name: "Unsupported currency bank", currency: "GBP" },
              ],
              can_self_approve: false,
              execution_mode: "instruction_only",
            },
          });
        if (path === "/api/v1/procurement/suppliers")
          return route.fulfill({ json: { items: suppliers, next_cursor: null } });
        if (path === "/api/v1/procurement/approvers")
          return route.fulfill({ json: { items: [{ id: "checker", name: "Purchase Checker" }], next_cursor: null } });
        if (path === "/api/v1/procurement/documents") {
          queries.push(url.searchParams);
          const matching = bills.filter((bill) => bill.supplier_id === url.searchParams.get("supplier_id"));
          // Deliberately paginate inside one supplier, including fully reserved and foreign-currency bills.
          return route.fulfill({
            json: {
              items: url.searchParams.has("cursor") ? matching.slice(2) : matching.slice(0, 2),
              next_cursor: !url.searchParams.has("cursor") && matching.length > 2 ? "supplier-page-two" : null,
            },
          });
        }
        return route.fulfill({ status: 404, json: { detail: "No fixture for this endpoint" } });
      });
      await page.goto("/#/purchases/add-payment");
      const form = page.getByRole("form", { name: "Payment form", exact: true });
      await expect(form).toBeVisible();
      await expect(form.getByRole("heading", { name: "Payment details", exact: true })).toBeVisible();
      for (const heading of ["Supplier and approval", "Payment and bank details"])
        await expect(form.getByRole("heading", { name: heading, exact: true })).toHaveCount(0);
      await expect(form.getByText("Select a supplier to load its bills.", { exact: true })).toBeVisible();
      await expect(page.getByLabel("Search approved bills", { exact: true })).toHaveCount(0);
      for (const label of ["Due / expected date", "Currency *", "External reference"])
        await expect(form.getByLabel(label, { exact: true })).toHaveCount(0);
      expect(queries).toHaveLength(0);
      await page.getByLabel("Supplier *", { exact: true }).click();
      await page.getByRole("option", { name: "SUP-001 · Supplier A", exact: true }).click();
      await expect(page.getByLabel("Mailing address", { exact: true })).toHaveValue("Karachi");
      await expect(page.getByLabel("Include BILL-001", { exact: true })).toBeEnabled();
      await expect(page.getByLabel("Include BILL-002", { exact: true })).toBeDisabled();
      const fullyAllocated = form
        .getByRole("row")
        .filter({ has: page.getByLabel("Include BILL-002", { exact: true }) });
      await expect(fullyAllocated).toContainText("Fully allocated");
      await expect(fullyAllocated.getByRole("cell", { name: "0.00", exact: true }).first()).toBeAttached();
      await expect(form).toContainText("Fully allocated");
      await page.getByRole("button", { name: "Load more bills", exact: true }).click();
      await expect(page.getByLabel("Include BILL-003", { exact: true })).toBeEnabled();
      await expect(page.getByLabel("Include BILL-004", { exact: true })).toBeDisabled();
      await expect(page.getByLabel("Include BILL-005", { exact: true })).toHaveCount(0);
      await page.getByLabel("Bank *", { exact: true }).click();
      await expect(page.getByRole("option", { name: "Euro bank · EUR", exact: true })).toBeVisible();
      await expect(page.getByRole("option", { name: /Unsupported currency bank/ })).toHaveCount(0);
      await page.getByRole("option", { name: "Operating bank · USD", exact: true }).click();
      await page.getByLabel("Include BILL-001", { exact: true }).check();
      await expect(page.getByLabel("Allocate BILL-001", { exact: true })).toHaveValue("100.00");
      await expect(page.getByLabel("Gross payment amount 1", { exact: true })).toHaveValue("100.00");
      await page.getByLabel("Include BILL-003", { exact: true }).check();
      await expect(page.getByLabel("Allocate BILL-003", { exact: true })).toHaveValue("40.00");
      await expect(page.getByLabel("Gross payment amount 1", { exact: true })).toHaveValue("140.00");
      await page.getByLabel("Allocate BILL-001", { exact: true }).fill("25.00");
      await expect(page.getByLabel("Gross payment amount 1", { exact: true })).toHaveValue("65.00");
      await expect(form.getByText("2 selected", { exact: true })).toBeVisible();
      const left = await page.getByRole("group", { name: "Supplier and approval", exact: true }).boundingBox(),
        right = await page.getByRole("group", { name: "Dates and bank details", exact: true }).boundingBox();
      expect(left).toBeTruthy();
      expect(right).toBeTruthy();
      for (const name of ["Supplier and approval", "Dates and bank details"]) {
        expect(
          await page.getByRole("group", { name, exact: true }).evaluate((element) => {
            const style = getComputedStyle(element);
            return {
              background: style.backgroundColor,
              borderTop: style.borderTopWidth,
              borderRight: style.borderRightWidth,
            };
          }),
        ).toEqual({ background: "rgba(0, 0, 0, 0)", borderTop: "0px", borderRight: "0px" });
      }
      if (width >= 1024) {
        expect(right!.x).toBeGreaterThan(left!.x + left!.width - 1);
        expect(Math.abs(right!.y - left!.y)).toBeLessThan(2);
      } else expect(right!.y).toBeGreaterThanOrEqual(left!.y + left!.height);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
      expect((await new AxeBuilder({ page }).include('form[aria-label="Payment form"]').analyze()).violations).toEqual(
        [],
      );
      expect((await page.getByLabel("Mailing address", { exact: true }).boundingBox())!.height).toBeGreaterThanOrEqual(
        96,
      );
      await page.getByRole("region", { name: "Bill allocations table", exact: true }).evaluate((element) => {
        element.scrollLeft = 0;
      });
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: `tmp/purchase-payment-evidence/allocation-${theme}-${width}.png`, fullPage: true });
      // An explicitly entered gross amount stays fixed; checkbox allocation uses its remaining amount.
      await page.getByLabel("Gross payment amount 1", { exact: true }).fill("30.00");
      await page.getByLabel("Include BILL-003", { exact: true }).uncheck();
      await page.getByLabel("Include BILL-003", { exact: true }).check();
      await expect(page.getByLabel("Allocate BILL-003", { exact: true })).toHaveValue("5.00");
      await expect(page.getByLabel("Unallocated balance 1", { exact: true })).toHaveValue("0.00");
      await page.getByLabel("Bank *", { exact: true }).click();
      await page.getByRole("option", { name: "Reserve bank · USD", exact: true }).click();
      await expect(page.getByLabel("Allocate BILL-001", { exact: true })).toHaveValue("25.00");
      await expect(page.getByLabel("Gross payment amount 1", { exact: true })).toHaveValue("30.00");
      await page.getByLabel("Bank *", { exact: true }).click();
      await page.getByRole("option", { name: "Euro bank · EUR", exact: true }).click();
      await expect(form.getByText("0 selected", { exact: true })).toBeVisible();
      await expect(page.getByLabel("Gross payment amount 1", { exact: true })).toHaveValue("0.00");
      await expect(page.getByLabel("Include BILL-001", { exact: true })).toBeDisabled();
      await expect(page.getByLabel("Include BILL-004", { exact: true })).toBeEnabled();
      await page.getByLabel("Include BILL-004", { exact: true }).check();
      await expect(page.getByLabel("Gross payment amount 1", { exact: true })).toHaveValue("100.00");
      await expect(form.getByText("Net bank amount: 100.00 EUR", { exact: true })).toBeVisible();
      await page.getByLabel("Bank *", { exact: true }).click();
      await page.getByRole("option", { name: "Operating bank · USD", exact: true }).click();
      await expect(page.getByLabel("Include BILL-004", { exact: true })).toBeDisabled();
      await page.getByLabel("Supplier *", { exact: true }).click();
      await page.getByRole("option", { name: "SUP-002 · Supplier B", exact: true }).click();
      await expect(page.getByLabel("Include BILL-005", { exact: true })).toBeEnabled();
      await expect(page.getByLabel("Include BILL-001", { exact: true })).toHaveCount(0);
      await expect(page.getByLabel("Mailing address", { exact: true })).toHaveValue("Lahore");
      await expect(page.getByLabel("Gross payment amount 1", { exact: true })).toHaveValue("0.00");
      await expect(form.getByText("0 selected", { exact: true })).toBeVisible();
      expect(
        queries.every((query) => query.get("supplier_id") && query.get("state") === "approved" && !query.get("search")),
      ).toBe(true);
      expect(writes).toEqual([]);
      expect(errors).toEqual([]);
    });
  }
