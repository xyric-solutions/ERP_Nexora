import { describe, expect, it } from "vitest";
import {
  administrationModuleCatalogue,
  bomInputSchema,
  convertProductionPlanInputSchema,
  expandModuleAccessToPermissionKeys,
  formatQuantity,
  manufacturingOrderActionSchema,
  manufacturingOrderInputSchema,
  normalizeQuantity,
  parseQuantity,
  productionPlanInputSchema,
  quantityVariance,
  scaleComponents,
  scaleQuantity,
} from "@nexora/contracts";
import { isManufacturingLivePage, manufacturingLivePages } from "@/features/manufacturing/model/manufacturing";
import { prototypeModules } from "@/shell/config/prototype-data";

describe("Manufacturing quantity scaling", () => {
  it("scales a 1-unit BOM linearly (1 motorcycle -> 2 tyres; 10 -> 20)", () => {
    expect(scaleQuantity("2", "1", "1")).toBe("2");
    expect(scaleQuantity("2", "1", "10")).toBe("20");
  });

  it("scales a batch BOM proportionally to its output quantity", () => {
    // BOM makes 5 units from 12.5 kg; 8 units need 20 kg, 1 unit needs 2.5 kg.
    expect(scaleQuantity("12.5", "5", "8")).toBe("20");
    expect(scaleQuantity("12.5", "5", "1")).toBe("2.5");
  });

  it("rounds half-up to four decimals and keeps exact arithmetic", () => {
    expect(scaleQuantity("1", "3", "1")).toBe("0.3333");
    expect(scaleQuantity("2", "3", "1")).toBe("0.6667");
    expect(scaleQuantity("0.1", "1", "3")).toBe("0.3");
  });

  it("scales every component and keeps line fields", () => {
    const lines = scaleComponents(
      [
        { product_id: "tyre", quantity: "2", unit: "Each" },
        { product_id: "seat", quantity: "1", unit: "Each" },
      ],
      "1",
      "10",
    );
    expect(lines).toEqual([
      { product_id: "tyre", quantity: "2", unit: "Each", standard_quantity: "20" },
      { product_id: "seat", quantity: "1", unit: "Each", standard_quantity: "10" },
    ]);
  });

  it("rejects a zero BOM output and malformed quantities", () => {
    expect(() => scaleQuantity("1", "0", "1")).toThrow(RangeError);
    expect(() => parseQuantity("1.23456")).toThrow(RangeError);
    expect(() => parseQuantity("-1")).toThrow(RangeError);
  });

  it("normalises and formats quantities", () => {
    expect(normalizeQuantity("2.5000")).toBe("2.5");
    expect(formatQuantity(-25000n)).toBe("-2.5");
  });

  it("reports variance against the standard quantity", () => {
    expect(quantityVariance("20", "22")).toEqual({ difference: "2", percent: 10, changed: true });
    expect(quantityVariance("20", "0")).toEqual({ difference: "-20", percent: -100, changed: true });
    expect(quantityVariance("20", "20.0").changed).toBe(false);
    expect(quantityVariance("0", "1").percent).toBeNull();
  });
});

describe("Manufacturing contract validation", () => {
  const bom = {
    company_id: "company-1",
    product_id: "motorcycle",
    output_quantity: "1",
    lines: [{ product_id: "tyre", quantity: "2" }],
  };

  it("accepts a valid Bill of Materials", () => {
    expect(bomInputSchema.safeParse(bom).success).toBe(true);
  });

  it("requires at least one component, positive quantities and no duplicates", () => {
    expect(bomInputSchema.safeParse({ ...bom, lines: [] }).success).toBe(false);
    expect(bomInputSchema.safeParse({ ...bom, output_quantity: "0" }).success).toBe(false);
    expect(bomInputSchema.safeParse({ ...bom, lines: [{ product_id: "tyre", quantity: "0" }] }).success).toBe(false);
    expect(
      bomInputSchema.safeParse({
        ...bom,
        lines: [
          { product_id: "tyre", quantity: "2" },
          { product_id: "tyre", quantity: "1" },
        ],
      }).success,
    ).toBe(false);
  });

  it("rejects the finished product as its own component", () => {
    const result = bomInputSchema.safeParse({ ...bom, lines: [{ product_id: "motorcycle", quantity: "1" }] });
    expect(result.success).toBe(false);
  });

  it("requires a positive planned quantity", () => {
    expect(
      productionPlanInputSchema.safeParse({ company_id: "c", product_id: "p", planned_quantity: "0" }).success,
    ).toBe(false);
    expect(
      productionPlanInputSchema.safeParse({ company_id: "c", product_id: "p", planned_quantity: "5" }).success,
    ).toBe(true);
  });

  it("needs only product, quantity and date on an order; project and site location are optional", () => {
    const order = { company_id: "c", product_id: "motorcycle", quantity: "10", order_date: "2026-11-13" };
    expect(manufacturingOrderInputSchema.parse(order)).toMatchObject({ project_id: null, location_id: null });
    expect(manufacturingOrderInputSchema.safeParse({ ...order, quantity: "0" }).success).toBe(false);
    expect(manufacturingOrderInputSchema.safeParse({ ...order, project_id: "" }).success).toBe(false);
    // The server fetches default materials; explicit deviations cannot erase the recipe.
    expect(manufacturingOrderInputSchema.safeParse({ ...order, lines: [] }).success).toBe(false);
  });

  it("confirms an order in one step: approve is the only action", () => {
    const base = { company_id: "c", expected_version: 2 };
    expect(manufacturingOrderActionSchema.safeParse({ ...base, action: "approve" }).success).toBe(true);
    for (const action of ["submit", "return", "reject"])
      expect(manufacturingOrderActionSchema.safeParse({ ...base, action }).success).toBe(false);
  });

  it("converts a plan with nothing but its current version", () => {
    expect(convertProductionPlanInputSchema.safeParse({ company_id: "c", expected_version: 1 }).success).toBe(true);
  });
});

describe("Manufacturing module wiring", () => {
  const keys = [
    "manufacturing.bom.read",
    "manufacturing.bom.create",
    "manufacturing.bom.update",
    "manufacturing.plan.read",
    "manufacturing.plan.create",
    "manufacturing.plan.convert",
    "manufacturing.order.read",
    "manufacturing.order.create",
    "manufacturing.order.submit",
    "manufacturing.order.approve",
  ];

  it("is a live catalogue module whose access levels grant the right permissions", () => {
    const entry = administrationModuleCatalogue.find((item) => item.id === "manufacturing")!;
    expect(entry.live).toBe(true);
    const manufacturing = (level: "view" | "user" | "admin") =>
      expandModuleAccessToPermissionKeys({ manufacturing: level }, keys).filter((key) =>
        key.startsWith("manufacturing."),
      );
    expect(manufacturing("view")).toEqual([
      "manufacturing.bom.read",
      "manufacturing.order.read",
      "manufacturing.plan.read",
    ]);
    expect(manufacturing("user")).toContain("manufacturing.plan.convert");
    expect(manufacturing("user")).not.toContain("manufacturing.order.approve");
    expect(manufacturing("admin")).toContain("manufacturing.order.approve");
  });

  it("serves the three working sections live and keeps other pages as prototypes", () => {
    const manufacturingModule = prototypeModules.find((item) => item.id === "manufacturing")!;
    const pages = manufacturingModule.groups.flatMap((group) => group.pages);
    for (const id of Object.keys(manufacturingLivePages)) {
      expect(pages.find((page) => page.id === id)?.status, id).toBe("live");
      expect(isManufacturingLivePage(id)).toBe(true);
    }
    expect(pages.find((page) => page.id === "boms")?.label).toBe("Bill of Materials");
    expect(pages.find((page) => page.id === "production-plans")?.label).toBe("Production Planning");
    expect(pages.find((page) => page.id === "production-orders")?.label).toBe("Manufacturing Orders");
    for (const id of ["routings", "mrp-run", "material-issue", "release-production-order", "production-variance"]) {
      expect(pages.find((page) => page.id === id)?.status, id).toBe("prototype");
      expect(isManufacturingLivePage(id)).toBe(false);
    }
  });
});
