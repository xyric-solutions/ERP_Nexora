import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import {
  purchaseDocumentSchema,
  purchaseFlowSchema,
  supplierSchema,
} from "../../packages/contracts/src/procurement/index.js";

const company = "flow-company";
const line = {
  item_code: "PRD-001",
  product_id: "product-one",
  product_name: "Control valve",
  description: "Supply control valves",
  quantity: "10",
  uom: "Each",
  unit_price: "10.00",
  tax_percent: "0",
};
const base = {
  company_id: company,
  document_date: "2026-11-10",
  currency: "USD",
  version: 3,
  created_by: "flow-maker",
  updated_by: "flow-checker",
  created_at: "2026-11-10T00:00:00Z",
  updated_at: "2026-11-10T00:00:00Z",
  supplier_name: "Synthetic supplier",
  source_code: null,
  total_amount: "100.00",
  approver_id: "flow-checker",
  approver_name: "Purchase Checker",
};
const records = [
  purchaseDocumentSchema.parse({
    ...base,
    id: "prq-one",
    code: "PRQ-001",
    kind: "request",
    state: "approved",
    lines: [{ ...line, id: "prq-line" }],
  }),
  purchaseDocumentSchema.parse({
    ...base,
    id: "rfq-one",
    code: "RFQ-001",
    kind: "rfq",
    state: "approved",
    source_id: "prq-one",
    source_code: "PRQ-001",
    invited_supplier_ids: ["supplier-one"],
    lines: [{ ...line, id: "rfq-line", source_line_id: "prq-line" }],
  }),
  purchaseDocumentSchema.parse({
    ...base,
    id: "po-one",
    code: "PO-001",
    kind: "order",
    state: "approved",
    source_id: "rfq-one",
    source_code: "RFQ-001",
    supplier_id: "supplier-one",
    lines: [{ ...line, id: "po-line", source_line_id: "rfq-line" }],
  }),
  purchaseDocumentSchema.parse({
    ...base,
    id: "grn-one",
    code: "GRN-001",
    kind: "receipt",
    state: "approved",
    source_id: "po-one",
    source_code: "PO-001",
    supplier_id: "supplier-one",
    total_amount: "40.00",
    lines: [{ ...line, id: "grn-line", source_line_id: "po-line", quantity: "4" }],
  }),
  purchaseDocumentSchema.parse({
    ...base,
    id: "grn-two",
    code: "GRN-002",
    kind: "receipt",
    state: "draft",
    source_id: "po-one",
    source_code: "PO-001",
    supplier_id: "supplier-one",
    total_amount: "60.00",
    lines: [{ ...line, id: "grn-two-line", source_line_id: "po-line", quantity: "6" }],
  }),
  purchaseDocumentSchema.parse({
    ...base,
    id: "bill-one",
    code: "BILL-001",
    kind: "bill",
    state: "submitted",
    source_id: "po-one",
    source_code: "PO-001",
    reference: "SYNTHETIC-INVOICE",
    supplier_id: "supplier-one",
    total_amount: "40.00",
    lines: [{ ...line, id: "bill-line", source_line_id: "po-line", quantity: "4" }],
  }),
];
const flow = purchaseFlowSchema.parse({
  root_id: "prq-one",
  root_code: "PRQ-001",
  items: records.map(
    ({ id, code, kind, state, source_id, source_code, document_date, supplier_name, total_amount, currency }) => ({
      id,
      code,
      kind,
      state,
      source_id,
      source_code,
      document_date,
      supplier_name,
      total_amount,
      currency,
    }),
  ),
  stages: ["request", "rfq", "order", "receipt", "bill"].map((kind) => {
    const items = records.filter((record) => record.kind === kind);
    return {
      kind,
      total: items.length,
      draft: items.filter((record) => record.state === "draft").length,
      submitted: items.filter((record) => record.state === "submitted").length,
      approved: items.filter((record) => record.state === "approved").length,
      rejected: 0,
      cancelled: 0,
    };
  }),
  next_cursor: null,
});
const supplier = supplierSchema.parse({
  company_id: company,
  id: "supplier-one",
  code: "SUP-001",
  name: "Synthetic supplier",
  version: 1,
  risk_status: "normal",
});

test.afterEach(async ({ page }) => {
  await page.unrouteAll({ behavior: "wait" });
});
for (const theme of ["light", "dark"] as const)
  for (const width of [1440, 390]) {
    test(`Purchase stage context and linked partial receipts: ${theme}, ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 1000 });
      await page.addInitScript((value) => localStorage.setItem("nexora-theme-preference-v1", value), theme);
      const writes: string[] = [],
        errors: string[] = [];
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
              tenant_id: "flow-tenant",
              csrf_token: "c".repeat(43),
              idle_expires_at: "2099-01-01T00:00:00Z",
              absolute_expires_at: "2099-01-01T00:00:00Z",
              user: {
                id: "flow-checker",
                email: "checker@example.invalid",
                display_name: "Purchase Checker",
                roles: ["purchase_checker"],
                permissions: [
                  "procurement.document.read",
                  "procurement.document.create",
                  "procurement.document.action",
                  "procurement.document.submit",
                  "procurement.document.approve",
                  "procurement.vendor.read",
                ],
              },
            },
          });
        if (path === "/api/v1/procurement/companies")
          return route.fulfill({
            json: { items: [{ id: company, code: "FLOW", name: "Synthetic Purchase company" }] },
          });
        if (path === "/api/v1/procurement/options")
          return route.fulfill({
            json: {
              currencies: [{ code: "USD", name: "US Dollar" }],
              can_self_approve: false,
              execution_mode: "instruction_only",
            },
          });
        if (path === "/api/v1/procurement/suppliers")
          return route.fulfill({ json: { items: [supplier], next_cursor: null } });
        if (path.endsWith("/flow")) return route.fulfill({ json: flow });
        if (path === "/api/v1/procurement/documents")
          return route.fulfill({
            json: {
              items: records.filter(
                (record) =>
                  (!url.searchParams.get("kind") || record.kind === url.searchParams.get("kind")) &&
                  (!url.searchParams.get("state") || record.state === url.searchParams.get("state")),
              ),
              next_cursor: null,
            },
          });
        const record = records.find((item) => path === `/api/v1/procurement/documents/${item.id}`);
        if (record) return route.fulfill({ json: record });
        return route.fulfill({ status: 404, json: { detail: "No fixture for this endpoint" } });
      });
      await page.goto("/#/purchases/add-purchase-bill/bill-one");
      const progress = page.getByRole("region", { name: "Purchase workflow progress", exact: true });
      await expect(progress).toContainText("Purchase flow · PRQ-001");
      await expect(progress).toContainText("Latest stage with records: Bill");
      await expect(progress.locator('[aria-current="step"]')).toContainText("Bill");
      // Keep stage cards compact even when a stage offers both Open and Create.
      for (const card of await progress.locator('ol[aria-label="Purchase stages"] > li').all()) {
        expect((await card.boundingBox())!.height).toBeLessThanOrEqual(width >= 768 ? 120 : 140);
      }
      await expect(page.locator('[aria-label="Document status"] [aria-current="step"]')).toHaveText(
        "Awaiting approval",
      );
      await expect(page.getByLabel("Approval / action reason", { exact: true })).toHaveCount(0);
      await expect(page.getByLabel("Purchase approver", { exact: true })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Approve Bill", exact: true })).toBeEnabled();
      for (const label of ["Purchase stages", "Document status"]) {
        expect(
          await page
            .getByRole("list", { name: label, exact: true })
            .evaluate((element) => getComputedStyle(element).listStyleType),
        ).toBe("none");
      }
      if (width < 768) {
        const scroll = page.getByRole("region", { name: "Products and services table", exact: true });
        await scroll.focus();
        await expect(scroll).toBeFocused();
        await page.keyboard.press("ArrowRight");
        await expect.poll(() => scroll.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
        await scroll.evaluate((element) => {
          element.scrollLeft = 0;
        });
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(
        1,
      );
      expect((await new AxeBuilder({ page }).include('form[aria-label="Bills form"]').analyze()).violations).toEqual(
        [],
      );
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: `tmp/purchase-flow-evidence/bill-${theme}-${width}.png`, fullPage: true });
      await progress.getByRole("button", { name: "Open Receive Products (2)", exact: true }).click();
      await expect(page.getByLabel("Linked stage documents", { exact: true })).toContainText("GRN-001 · Approved");
      await expect(page.getByLabel("Linked stage documents", { exact: true })).toContainText("GRN-002 · Draft");
      await page
        .getByLabel("Linked stage documents", { exact: true })
        .getByRole("button", { name: /GRN-001 · Approved/ })
        .click();
      await expect(page.getByRole("form", { name: "Receive Products form", exact: true })).toBeVisible();
      await expect(page.getByLabel("Line 1 quantity", { exact: true })).toHaveValue("4");
      await expect(page.getByRole("heading", { name: "Purchase workflow", exact: true })).toBeVisible();
      await expect(page.getByRole("region", { name: "Purchase workflow progress" })).toContainText(
        "Latest stage with records: Bill",
      );
      expect(writes).toEqual([]);
      expect(errors).toEqual([]);
    });
  }
