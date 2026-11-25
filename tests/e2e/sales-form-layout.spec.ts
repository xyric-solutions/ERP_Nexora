import { expect, test } from "@playwright/test";
import {
  subledgerOperationSchema,
  type SubledgerOperation,
  type CustomerMaster,
  type CustomerMasterInput,
  type SubledgerWorkspace,
} from "@nexora/contracts";

const company = { id: "sales-form-company", code: "SFC", name: "Sales Form Company" };
const workspace: SubledgerWorkspace = {
  company_id: company.id,
  base_currency: "PKR",
  base_decimal_places: 2,
  as_of: "2026-11-20",
  currencies: [
    { code: "PKR", decimal_places: 2 },
    { code: "USD", decimal_places: 2 },
  ],
  parties: [],
  policy: null,
  items: [],
  operations: [],
  balances: [],
  total_items: 0,
  total_operations: 0,
  total_balances: 0,
  carrying_total: "0",
  unrealized_total: "0",
  accounts: [],
  banks: [],
};

for (const theme of ["light", "dark"] as const) {
  for (const width of [390, 768, 1440]) {
    test(`Sales forms and customer creation at ${width}px in ${theme} mode`, async ({ page }, testInfo) => {
      test.setTimeout(90_000);
      const customers: CustomerMaster[] = [];
      let unitAttempts = 0;
      let receiptResponseLost = true;
      const receiptOperations: SubledgerOperation[] = [];
      const receiptKeys: string[] = [];
      const receiptRequests = new Map<string, SubledgerOperation>();
      await page.setViewportSize({ width, height: 1050 });
      await page.addInitScript((value) => localStorage.setItem("nexora-theme-preference-v1", value), theme);
      await page.route("**/api/v1/**", (route) => {
        const request = route.request();
        const path = new URL(request.url()).pathname;
        if (path === "/api/v1/auth/session") {
          return route.fulfill({
            json: {
              status: "authenticated",
              tenant_id: "sales-form-tenant",
              csrf_token: "c".repeat(43),
              idle_expires_at: "2099-01-01T00:00:00Z",
              absolute_expires_at: "2099-01-01T00:00:00Z",
              user: {
                id: "sales-form-user",
                email: "sales@example.invalid",
                display_name: "Sales Maker",
                roles: ["super_administrator"],
                permissions: [
                  "sales.document.read",
                  "sales.document.create",
                  "finance.subledger.read",
                  "finance.subledger.manage",
                ],
              },
              active_company: company,
            },
          });
        }
        if (path === "/api/v1/auth/companies") return route.fulfill({ json: { items: [company] } });
        if (path === "/api/v1/finance/subledger/workspace") {
          const selectedParty = new URL(request.url()).searchParams.get("party_id");
          return route.fulfill({
            json: {
              ...workspace,
              parties: customers.map((customer) => ({
                company_id: company.id,
                id: customer.id,
                code: customer.code,
                name: customer.name,
                kind: "customer",
                default_currency: "PKR",
              })),
              banks: [{ id: "bank-1", name: "Operating bank", currency: "PKR" }],
              operations: receiptOperations,
              total_operations: receiptOperations.length,
              items: selectedParty
                ? [
                    {
                      id: "invoice-1",
                      code: "INV-001",
                      party_id: "customer-1",
                      party_name: "Example Customer",
                      side: "receivable",
                      kind: "invoice",
                      currency: "PKR",
                      base_currency: "PKR",
                      decimal_places: 2,
                      base_decimal_places: 2,
                      date: "2026-11-01",
                      due_date: "2026-11-30",
                      original_amount: "100.00",
                      original_base: "100.00",
                      outstanding: "100.00",
                      carrying: "100.00",
                      historical: "100.00",
                      unrealized: "0",
                      monetary: true,
                      control_account_id: "control-1",
                      journal_id: "journal-1",
                      rate: "1",
                      rate_id: null,
                    },
                  ]
                : [],
            },
          });
        }
        if (path === "/api/v1/finance/subledger/operations" && request.method() === "POST") {
          const key = request.headers()["idempotency-key"];
          receiptKeys.push(key);
          const cached = receiptRequests.get(key);
          if (cached) return route.fulfill({ json: cached });
          const record = subledgerOperationSchema.parse({
            id: `receipt-${receiptOperations.length + 1}`,
            code: `RCT-00${receiptOperations.length + 1}`,
            company_id: company.id,
            type: "settlement",
            date: request.postDataJSON().date,
            state: "draft",
            version: 1,
            maker_id: "sales-form-user",
            approver_id: null,
            journal_id: null,
            input: { ...request.postDataJSON(), payment_currency: "PKR" },
            preview: null,
          });
          receiptOperations.push(record);
          receiptRequests.set(key, record);
          if (receiptResponseLost) {
            receiptResponseLost = false;
            return route.fulfill({
              status: 503,
              json: { title: "Receipt response unavailable", detail: "Retry the unchanged draft." },
            });
          }
          return route.fulfill({ status: 201, json: record });
        }
        if (path === "/api/v1/finance/subledger/customers") {
          if (request.method() === "POST") {
            const payload = request.postDataJSON() as CustomerMasterInput;
            const record = { ...payload, id: "customer-1", code: "CUS-001", version: 1 };
            customers.push(record);
            return route.fulfill({ status: 201, json: { id: record.id, code: record.code, version: 1 } });
          }
          return route.fulfill({
            json: {
              items: customers,
              total: customers.length,
              base_currency: "PKR",
              currencies: [
                { code: "PKR", name: "Pakistani Rupee" },
                { code: "USD", name: "US Dollar" },
              ],
            },
          });
        }
        if (path === "/api/v1/finance/subledger/customers/customer-1") return route.fulfill({ json: customers[0] });
        if (path === "/api/v1/sales/products/product-1/units") {
          if (++unitAttempts === 1)
            return route.fulfill({ status: 503, json: { detail: "Units temporarily unavailable" } });
          const unit = {
            company_id: company.id,
            code: "UOM-001",
            category: "mass",
            numerator: "1",
            denominator: "1",
            precision: 4,
            status: "active",
            standard: true,
            version: 1,
          };
          const base = { ...unit, id: "kg", name: "Kilogram", symbol: "kg" };
          return route.fulfill({
            json: {
              base,
              items: [
                { unit: base, numerator: "1", denominator: "1" },
                {
                  unit: { ...unit, id: "g", name: "Gram", symbol: "g", denominator: "1000" },
                  numerator: "1",
                  denominator: "1000",
                },
              ],
            },
          });
        }
        if (path === "/api/v1/sales/lookups") {
          if (new URL(request.url()).searchParams.get("kind") === "approver")
            return route.fulfill({
              json: {
                items: [
                  { id: "sales-form-user", code: "sales-form-user", name: "Sales Maker", type: "approver" },
                  { id: "reviewer-1", code: "reviewer-1", name: "Independent Reviewer", type: "approver" },
                ],
                total: 2,
              },
            });
          const product = new URL(request.url()).searchParams.get("kind") === "product";
          return route.fulfill({
            json: {
              items: product
                ? [
                    {
                      id: "product-1",
                      code: "PRD-001",
                      name: "Test material",
                      unit_id: "kg",
                      unit: "Kilogram",
                      quantity: null,
                      currency: "PKR",
                      price: "100",
                    },
                  ]
                : [],
              total: product ? 1 : 0,
            },
          });
        }
        return route.fulfill({ status: 404, json: { detail: "No fixture for this endpoint" } });
      });

      await page.goto("/#/sales/customers");
      const addCustomer = page.getByRole("button", { name: "Add Customer", exact: true });
      await expect(page.getByRole("heading", { name: "Customers", exact: true })).toBeVisible();
      await expect(page.getByRole("columnheader", { name: "Tax ID", exact: true })).toBeVisible();
      await addCustomer.click();
      await expect(page).toHaveURL(/#\/sales\/customers\/new$/);
      const form = page.getByRole("form", { name: "Customer form" });
      await expect(form.getByRole("heading", { name: "Create a customer" })).toBeVisible();
      const code = form.getByLabel("Customer code");
      await expect(code).toHaveJSProperty("readOnly", true);
      const [codeBox, formBox] = await Promise.all([code.boundingBox(), form.boundingBox()]);
      expect(codeBox!.x + codeBox!.width).toBeLessThan(formBox!.x + formBox!.width);
      await expect(page.getByRole("form", { name: "Financial terms and credit" })).toHaveCount(0);
      await form.getByLabel(/Customer name/).fill("Cancel this draft");
      await form.getByRole("button", { name: "Cancel", exact: true }).click();
      await page.getByRole("alertdialog").getByRole("button", { name: "Discard", exact: true }).click();
      await expect(form).toHaveCount(0);
      await expect(page).toHaveURL(/#\/sales\/customers$/);
      expect(customers).toEqual([]);

      await addCustomer.click();
      await expect(form.getByLabel(/Customer name/)).toHaveValue("");
      await form.getByLabel(/Customer name/).fill("Example Customer");
      await form.getByLabel(/Default currency/).selectOption("USD");
      await expect(form.getByRole("heading", { name: "Example Customer" })).toBeVisible();
      await form.screenshot({ path: testInfo.outputPath("add-customer.png") });
      await form.getByRole("tab", { name: "Internal Notes", exact: true }).click();
      await form.locator('[data-supplier-field="profile.notes"]').fill("Customer note saved across tabs");
      await form.getByRole("tab", { name: "Bank Accounts", exact: true }).click();
      await expect(form.getByRole("heading", { name: "Customer bank accounts" })).toBeVisible();
      await form.getByRole("button", { name: "Save Customer", exact: true }).click();
      await expect(page).toHaveURL(/#\/sales\/customers$/);
      expect(customers).toMatchObject([
        {
          company_id: company.id,
          name: "Example Customer",
          default_currency: "USD",
          profile: { notes: "Customer note saved across tabs" },
        },
      ]);
      await page.getByRole("button", { name: "Edit CUS-001", exact: true }).click();
      await form.getByRole("tab", { name: "Internal Notes", exact: true }).click();
      await expect(form.locator('[data-supplier-field="profile.notes"]')).toHaveValue(
        "Customer note saved across tabs",
      );
      await form.getByRole("button", { name: "Cancel", exact: true }).click();

      await page.goto("/#/sales/quotations/new");
      const quotation = page.getByRole("form", { name: "Quotation form", exact: true });
      await expect(quotation.getByRole("button", { name: "Save", exact: true })).toBeVisible();
      const approver = quotation.getByRole("combobox", { name: "Approver (optional)", exact: true });
      await expect(quotation).not.toContainText("Choose another reviewer");
      await expect(quotation).not.toContainText("Save the draft, then review");
      await expect(quotation).not.toContainText("Choose the actual customer");
      await expect(approver).toContainText("Creator approval (no reviewer)");
      await quotation.screenshot({ path: testInfo.outputPath("quotation-compact.png") });
      await approver.click();
      await expect(page.getByRole("option", { name: /Sales Maker/ })).toHaveCount(0);
      await page.getByRole("option", { name: /Independent Reviewer/ }).click();
      await expect(approver).toContainText("Independent Reviewer");
      await approver.click();
      await page.getByRole("option", { name: "Creator approval (no reviewer)", exact: true }).click();
      await expect(approver).toContainText("Creator approval (no reviewer)");
      const lines = quotation.getByRole("table", { name: "Products and services", exact: true });
      await expect(lines.getByRole("row", { name: "Sales line 1" })).toBeVisible();
      await quotation.getByRole("button", { name: "Add line", exact: true }).click();
      const added = lines.getByRole("row", { name: "Sales line 2" });
      await added.getByLabel("Quantity 2", { exact: true }).fill("3");
      await expect(added.getByLabel("Quantity 2", { exact: true })).toHaveValue("3");
      await added.getByRole("button", { name: "Remove line 2", exact: true }).click();
      await expect(added).toHaveCount(0);
      await quotation.getByRole("button", { name: "Add other charge", exact: true }).click();
      await expect(added.getByText("Other charge", { exact: true })).toBeVisible();
      await added.getByRole("button", { name: "Remove line 2", exact: true }).click();
      await quotation.getByRole("button", { name: "Save", exact: true }).click();
      await expect(quotation.getByRole("alert")).toContainText("Choose the actual product/service");
      await expect(quotation.getByRole("tab", { name: "Product / Service" })).toBeVisible();
      await quotation.screenshot({ path: testInfo.outputPath("quotation.png") });
      await quotation.getByRole("combobox", { name: "Product / Service 1", exact: true }).click();
      await page.getByRole("option", { name: /PRD-001/ }).click();
      await expect(quotation.getByRole("button", { name: "Retry units" })).toBeVisible();
      await quotation.getByRole("button", { name: "Retry units" }).click();
      const unitSelect = quotation.getByRole("combobox", { name: "Unit 1", exact: true });
      await expect(unitSelect).toBeEnabled();
      await expect(unitSelect).toContainText("Kilogram");
      await unitSelect.click();
      await page.getByRole("option", { name: "Gram (g)", exact: true }).click();
      await expect(unitSelect).toContainText("Gram (g)");
      await unitSelect.click();
      await page.getByRole("option", { name: "Kilogram (kg)", exact: true }).click();
      await expect(unitSelect).toContainText("Kilogram (kg)");
      await quotation.screenshot({ path: testInfo.outputPath("unit-selected.png") });
      await quotation.getByRole("tab", { name: "Other details" }).click();
      await expect(quotation.getByLabel("Notes", { exact: true })).toBeVisible();
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

      page.once("dialog", (dialog) => dialog.accept());
      await page.goto("/#/sales/receipts");
      const receipt = page.locator("form[data-work-form]").filter({
        has: page.getByRole("heading", { name: "Add Receipts" }),
      });
      await expect(receipt.getByLabel("Bank account", { exact: true })).toBeVisible();
      await expect(page.getByRole("navigation", { name: "Currency accounting sections" })).toHaveCount(0);
      await expect(page.getByRole("heading", { name: "Customer receipts & invoices", exact: true })).toHaveCount(0);
      for (const name of ["Save and Print", "Save and New", "Save and Close"])
        await expect(receipt.getByRole("button", { name, exact: true })).toBeDisabled();
      await expect(receipt.getByLabel("Receipt print format")).toBeVisible();
      const invoiceHeader = receipt.getByRole("columnheader", { name: "Date", exact: true });
      const headerColours = await invoiceHeader.evaluate((element) => {
        const style = getComputedStyle(element);
        return { background: style.backgroundColor, text: style.color };
      });
      expect(headerColours.background).toBe("rgb(255, 179, 26)");
      expect(headerColours.text).toBe("rgb(37, 39, 33)");
      await expect(receipt.getByRole("button", { name: "Save and New", exact: true })).toHaveCSS(
        "background-color",
        headerColours.background,
      );
      const customerControl = receipt.getByLabel("Customer *", { exact: true });
      const bankControl = receipt.getByLabel("Bank account", { exact: true });
      const modeControl = receipt.getByLabel("Mode", { exact: true });
      if (width === 1440) {
        const [customerBox, bankBox, modeBox] = await Promise.all([
          customerControl.boundingBox(),
          bankControl.boundingBox(),
          modeControl.boundingBox(),
        ]);
        expect(Math.abs(customerBox!.y - bankBox!.y)).toBeLessThan(3);
        expect(Math.abs(bankBox!.y - modeBox!.y)).toBeLessThan(3);
        for (const label of ["Customer *", "Bank *", "Mode"]) {
          const element = receipt.locator("label").filter({ hasText: label }).first();
          const labelBox = await element.boundingBox();
          const controlBox = label === "Customer *" ? customerBox : label === "Bank *" ? bankBox : modeBox;
          expect(labelBox!.x).toBeLessThan(controlBox!.x);
        }
      }
      await expect(receipt.getByRole("table", { name: "Outstanding Invoices", exact: true })).toBeVisible();
      await expect(receipt.getByLabel("Mailing Address", { exact: true })).toHaveJSProperty("readOnly", true);
      await expect(receipt.getByLabel("Notes *", { exact: true })).toBeVisible();
      await receipt.screenshot({ path: testInfo.outputPath("receipt.png") });

      if (theme === "light" && width === 1440) {
        await page.evaluate(() =>
          Object.defineProperty(window, "print", {
            value: () => {
              document.documentElement.dataset.receiptPrinted = "true";
            },
          }),
        );
        for (const action of ["new", "print", "close"] as const) {
          await receipt.getByLabel("Customer *", { exact: true }).selectOption("customer-1");
          await expect(receipt.getByLabel("Bank account", { exact: true })).toBeVisible();
          await receipt.getByLabel("Bank account", { exact: true }).selectOption("bank-1");
          await receipt.getByLabel("Amount *", { exact: true }).fill("100.00");
          await receipt.getByLabel("Notes *", { exact: true }).fill(`Receipt ${action} draft`);
          await receipt.getByLabel("Allocate INV-001", { exact: true }).fill("100.00");
          const label = action === "new" ? "Save and New" : action === "print" ? "Save and Print" : "Save and Close";
          await receipt.getByRole("button", { name: label, exact: true }).click();
          if (action === "new") {
            await expect(
              page
                .getByRole("alert")
                .filter({ hasText: /Receipt|Retry/ })
                .first(),
            ).toBeVisible();
            await expect(receipt.getByLabel("Amount *", { exact: true })).toHaveValue("100.00");
            await receipt.getByRole("button", { name: label, exact: true }).click();
            await expect(receipt.getByLabel("Amount *", { exact: true })).toHaveValue("");
            expect(receiptKeys[0]).toBe(receiptKeys[1]);
            expect(receiptOperations).toHaveLength(1);
          }
          if (action === "print") {
            const preview = page.getByRole("dialog", { name: "Receipt draft print preview", exact: true });
            await expect(preview).toBeVisible();
            await expect(preview).toContainText("RCT-002");
            await expect(preview).toContainText("Draft - pending review and approval");
            await expect(page.locator("html")).toHaveAttribute("data-receipt-printed", "true");
            await page.emulateMedia({ media: "print" });
            const paper = preview.locator("[data-print-sheet]");
            const paperBox = await paper.boundingBox();
            expect(paperBox!.x).toBeGreaterThanOrEqual(0);
            await paper.screenshot({ path: testInfo.outputPath("receipt-draft-print.png") });
            await page.emulateMedia({ media: null });
            await preview.getByRole("button", { name: "Close preview", exact: true }).click();
          }
          if (action === "close") {
            await expect(receipt).toHaveCount(0);
            await expect(page.getByRole("heading", { name: "Receipts", exact: true })).toBeVisible();
            expect(receiptOperations).toHaveLength(3);
            expect(new Set(receiptKeys).size).toBe(3);
          }
        }

        await page.goto("/#/sales/invoices/accounting");
        await expect(page.getByRole("navigation", { name: "Currency accounting sections" })).toBeVisible();
        for (const [route, title] of [
          ["sales-orders/new", "New sales order"],
          ["pick-pack-delivery/new", "New delivery"],
          ["invoices/new", "New invoice"],
          ["recurring-bills/new", "New recurring bill"],
        ]) {
          await page.goto(`/#/sales/${route}`);
          const editor = page.locator("form[data-work-form]").filter({
            has: page.getByRole("heading", { name: title, exact: true }),
          });
          await expect(editor.getByRole("button", { name: "Save", exact: true })).toBeVisible();
        }
      }
    });
  }
}
