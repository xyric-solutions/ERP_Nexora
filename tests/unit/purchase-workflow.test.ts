import { describe, expect, it } from "vitest";
import {
  documentTotal,
  scaled,
  purchaseActionRequestSchema,
  savePurchaseRequestSchema,
  supplierInputSchema,
} from "../../packages/contracts/src/index.js";
import { prototypeModules, findPrototypePage } from "../../app/shell/config/prototype-data.js";
import { purchaseSteps } from "../../app/features/purchasing/model/purchase-workflow.js";

describe("Consolidated Purchase workflow", () => {
  it("allows approval without entered reasons and retains other action reasons", () => {
    const input = { company_id: "company", expected_version: 1 };
    expect(purchaseActionRequestSchema.parse({ ...input, action: "approve" }).reason).toBe("");
    for (const action of ["submit", "reject", "cancel"])
      expect(purchaseActionRequestSchema.safeParse({ ...input, action }).success).toBe(false);
  });
  it("includes Suppliers alongside the seven Purchase workflow entries", () => {
    const purchaseModule = prototypeModules.find((item) => item.id === "purchases")!;
    const pages = purchaseModule.groups
      .filter((group) => !group.hiddenFromNavigation)
      .flatMap((group) => group.pages.filter((page) => !page.hiddenFromNavigation));
    expect(pages.map((page) => page.label)).toEqual([
      "Purchase Request",
      "Request for Quotation",
      "Purchase Order",
      "Receive Products",
      "Bills",
      "Payment",
      "Multi-vendor Payment",
      "Suppliers",
      "Supplier Currency Accounts",
    ]);
    expect(pages.map((page) => page.id)).toEqual([
      ...purchaseSteps.map((step) => step.page),
      "suppliers",
      "supplier-currency-accounts",
    ]);
    expect(prototypeModules.some((module) => module.id === "suppliers")).toBe(false);
    expect(findPrototypePage("purchases", "suppliers").page.hiddenFromNavigation).not.toBe(true);
  });
  it.each([
    ["suppliers", "suppliers", "suppliers"],
    ["suppliers", "add-supplier", "suppliers"],
    ["suppliers", "payable-bills", "purchase-bills"],
    ["suppliers", "payment-proposals", "multi-vendor-payments"],
    ["purchases", "purchase-order-detail", "add-purchase-order"],
  ])("retains the %s/%s link inside Purchases", (module, page, expected) => {
    const resolved = findPrototypePage(module, page);
    expect(resolved.module.id).toBe("purchases");
    expect(resolved.page.id).toBe(expected);
  });
  it("calculates fractional quantities and line tax using decimal integers", () => {
    expect(documentTotal([{ quantity: "1.2345", unit_price: "10.01", tax_percent: "17.50" }])).toBe("14.52");
    expect(
      documentTotal([
        { quantity: "0.1000", unit_price: "0.10", tax_percent: "0" },
        { quantity: "0.2000", unit_price: "0.10", tax_percent: "0" },
      ]),
    ).toBe("0.03");
    expect(documentTotal([{ quantity: "0.5", unit_price: "0.01", tax_percent: "0" }])).toBe("0.01");
    expect(() => scaled("1.001", 2)).toThrow();
    expect(() => scaled("-1", 2)).toThrow();
  });
  it("rejects malformed amounts, zero quantities, impossible dates and unrecognized fields", () => {
    const input = {
      company_id: "company",
      kind: "request",
      document_date: "2026-11-05",
      currency: "USD",
      lines: [{ description: "Product", quantity: "1", uom: "Each", unit_price: "10", tax_percent: "0" }],
    };
    expect(savePurchaseRequestSchema.safeParse(input).success).toBe(true);
    for (const patch of [
      { document_date: "2026-02-30" },
      { company_id: "" },
      { currency: "US" },
      { unexpected: true },
      { lines: [{ ...input.lines[0], quantity: "0" }] },
      { lines: [{ ...input.lines[0], unit_price: "NaN" }] },
      { lines: [{ ...input.lines[0], tax_percent: "101" }] },
    ])
      expect(savePurchaseRequestSchema.safeParse({ ...input, ...patch }).success).toBe(false);
    expect(
      supplierInputSchema.safeParse({ company_id: "company", name: "Supplier", email: "invalid-email" }).success,
    ).toBe(false);
    expect(
      purchaseActionRequestSchema.safeParse({
        company_id: "company",
        expected_version: 0,
        action: "approve",
        reason: "",
      }).success,
    ).toBe(false);
  });
});
