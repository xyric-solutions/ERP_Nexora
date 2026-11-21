import { describe, it, expect } from "vitest";
import {
  expectedBatchMaterials,
  manufacturingRecipeSchema,
  stockPreviewSchema,
  productQuerySchema,
} from "../../packages/contracts/src/index.js";

describe("BOM batch calculation and posting boundaries", () => {
  const recipe = manufacturingRecipeSchema.parse({
    bom_id: "bom",
    bom_code: "BOM-001",
    bom_version: 1,
    template_name: "Reviewed recipe",
    product_id: "finished",
    product_code: "PRD-001",
    product_name: "Output",
    output_quantity: "3",
    quantity: "3",
    unit: "Each",
    warehouse_id: "warehouse",
    currency: "USD",
    decimal_places: 2,
    lines: [
      {
        product_id: "raw",
        product_code: "PRD-002",
        product_name: "Material",
        category: "Raw Material",
        description: "Material",
        bom_quantity: "1",
        quantity: "1",
        standard_quantity: "1",
        remark: "",
        unit: "Kg",
        unit_snapshot: null,
        warehouse_id: "warehouse",
        warehouse_name: "Warehouse",
      },
    ],
    charges: [],
    estimated_charges: "0.00",
    notes: "",
  });
  it("allocates cumulative rounded materials across repeated partial batches without drift", () => {
    expect(["0", "1", "2"].map((issued) => expectedBatchMaterials(recipe, issued, "1")[0]!.quantity)).toEqual([
      "0.3333",
      "0.3334",
      "0.3333",
    ]);
    expect(expectedBatchMaterials(recipe, "0", "3")[0]!.quantity).toBe("1");
  });
  it("uses approved actual order quantities when batch standards differ from the original BOM", () => {
    expect(
      expectedBatchMaterials(
        { ...recipe, lines: [{ ...recipe.lines[0]!, quantity: "1.5", remark: "Approved extra material" }] },
        "1",
        "2",
      )[0]!.quantity,
    ).toBe("1");
  });
  it("requires physical evidence except for explicit value-only production cost operations", () => {
    const preview = {
      base_currency: "USD",
      decimal_places: 2,
      policy_version: 1,
      entries: [],
      lines: [
        { accountId: "wip", debit: "10", credit: "0", dimensions: {}, description: "WIP" },
        { accountId: "expense", debit: "0", credit: "10", dimensions: {}, description: "Source expense" },
      ],
      evidence: {},
    };
    expect(stockPreviewSchema.safeParse(preview).success).toBe(false);
    expect(stockPreviewSchema.safeParse({ ...preview, evidence: { production_charge: true } }).success).toBe(true);
    expect(
      stockPreviewSchema.safeParse({ ...preview, evidence: { original_kind: "manufacturing_charge" } }).success,
    ).toBe(true);
  });
  it("parses the explicit legacy filter without treating false as true", () => {
    expect(productQuerySchema.parse({ company_id: "company", legacy_unmapped: "false" }).legacy_unmapped).toBe(false);
    expect(productQuerySchema.parse({ company_id: "company", legacy_unmapped: "true" }).legacy_unmapped).toBe(true);
    expect(productQuerySchema.safeParse({ company_id: "company", legacy_unmapped: "yes" }).success).toBe(false);
  });
});
