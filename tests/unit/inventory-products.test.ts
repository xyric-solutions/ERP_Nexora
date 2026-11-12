import { describe, it, expect } from "vitest";
import {
  productDraftSchema,
  productInputSchema,
  updateProductInputSchema,
  warehouseInputSchema,
  stockTransferInputSchema,
} from "../../packages/contracts/src/index.js";
import { prototypeModules, findPrototypePage } from "../../app/shell/config/prototype-data.js";

describe("Inventory product catalog", () => {
  it("exposes the requested Products, Stock Transfer and Warehouse pages and preserves item links", () => {
    const inventory = prototypeModules.find((m) => m.id === "inventory")!;
    expect(
      inventory.groups
        .filter((g) => !g.hiddenFromNavigation)
        .flatMap((g) => g.pages.filter((p) => !p.hiddenFromNavigation))
        .map((p) => p.label),
    ).toEqual(["Products", "Stock Transfer", "Warehouse"]);
    expect(findPrototypePage("inventory", "items").page.id).toBe("products");
    expect(findPrototypePage("inventory", "add-item").page.id).toBe("add-product");
    expect(findPrototypePage("inventory", "item-detail").page.id).toBe("product-detail");
  });
  const input = { company_id: "company", name: "Valve", currency: "PKR" };
  it("restricts manufacture to goods and validates Warehouse and Stock Transfer creation", () => {
    expect(productInputSchema.parse({ ...input, manufacture_enabled: true }).manufacture_enabled).toBe(true);
    expect(
      productInputSchema.safeParse({ ...input, type: "service", track_inventory: false, manufacture_enabled: true })
        .success,
    ).toBe(false);
    expect(warehouseInputSchema.safeParse({ company_id: "company", name: "Warehouse", email: "invalid" }).success).toBe(
      false,
    );
    const transfer = {
      company_id: "company",
      from_warehouse_id: "source",
      to_warehouse_id: "destination",
      transfer_date: "2026-11-05",
      lines: [{ product_id: "product", quantity: "1.1250" }],
    };
    expect(stockTransferInputSchema.safeParse(transfer).success).toBe(true);
    for (const patch of [
      { to_warehouse_id: "source" },
      { transfer_date: "2026-02-30" },
      { lines: [{ product_id: "product", quantity: "0" }] },
      { lines: [...transfer.lines, ...transfer.lines] },
      { state: "posted" },
    ])
      expect(stockTransferInputSchema.safeParse({ ...transfer, ...patch }).success).toBe(false);
  });
  it("allows an incomplete browser draft without accepting it as an API mutation", () => {
    const draft = productDraftSchema.parse({ company_id: "company", name: "", currency: "" });
    expect(draft.currency).toBe("");
    expect(productInputSchema.safeParse(draft).success).toBe(false);
  });
  it("rejects invalid quantities, dates, percentages and client-supplied codes", () => {
    expect(productInputSchema.safeParse(input).success).toBe(true);
    for (const patch of [
      { name: " " },
      { sale_price: "-1" },
      { cost: "NaN" },
      { sale_price: "1.001" },
      { opening_quantity: "1", opening_date: null },
      { opening_quantity: "1", opening_date: "2026-02-30" },
      { sales_tax: "100.01" },
      { large_pack_size: "0" },
      { type: "service", track_inventory: true },
      { code: "PRD-999" },
    ])
      expect(productInputSchema.safeParse({ ...input, ...patch }).success).toBe(false);
    expect(updateProductInputSchema.safeParse(input).success).toBe(false);
    expect(updateProductInputSchema.safeParse({ ...input, expected_version: 1 }).success).toBe(true);
  });
  it("accepts services without stock and preserves exact decimal input", () => {
    const service = productInputSchema.parse({
      ...input,
      type: "service",
      track_inventory: false,
      cost: "12.30",
      sale_price: "19.99",
    });
    expect(service.cost).toBe("12.30");
    expect(service.sale_price).toBe("19.99");
    expect(
      productInputSchema.parse({
        ...input,
        opening_quantity: "1.2345",
        opening_rate: "2.50",
        opening_date: "2026-11-05",
      }).opening_quantity,
    ).toBe("1.2345");
  });
});
