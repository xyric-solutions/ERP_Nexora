import { describe, expect, it } from "vitest";
import {
  computeFuelAmount,
  computeKmPerLitre,
  computeMaintenanceTotal,
  fleetFuelEntryInputSchema,
  fleetMaintenanceInputSchema,
  fleetToolInputSchema,
  fleetVehicleInputSchema,
} from "../../packages/contracts/src/index.js";

describe("Fleet fuel average (meeting 16 Nov 2026)", () => {
  it("divides the distance since the previous reading by the litres added", () => {
    expect(computeKmPerLitre("84260", "84723", "42.85")).toBe("10.81"); // 463 / 42.85 = 10.805
    expect(computeKmPerLitre("84723", "85243", "40")).toBe("13.00");
    expect(computeKmPerLitre("1000.5", "1100", "10")).toBe("9.95");
  });
  it("rounds half away from zero like PostgreSQL round()", () => {
    expect(computeKmPerLitre("0", "1.5", "2")).toBe("0.75");
    expect(computeKmPerLitre("0", "100", "8")).toBe("12.50");
    expect(computeKmPerLitre("0", "0.1", "0.08")).toBe("1.25");
  });
  it("cannot be calculated when the reading does not increase or no fuel is added", () => {
    expect(computeKmPerLitre("85243", "85243", "10")).toBeNull();
    expect(computeKmPerLitre("85243", "85000", "10")).toBeNull();
    expect(computeKmPerLitre("0", "100", "0")).toBeNull();
    expect(computeKmPerLitre("0", "abc", "10")).toBeNull();
  });
  it("prices fuel and totals maintenance to the cent", () => {
    expect(computeFuelAmount("42.85", "350")).toBe("14997.50");
    expect(computeFuelAmount("81.2", "348.5")).toBe("28298.20");
    expect(computeMaintenanceTotal("1500", "26900")).toBe("28400.00");
    expect(computeMaintenanceTotal("", "0.5")).toBe("0.50");
  });
});

describe("Fleet input contracts", () => {
  const company = "company-1";
  it("normalises the registration and defaults a vehicle to active with no driver", () => {
    const parsed = fleetVehicleInputSchema.parse({
      company_id: company,
      registration_no: " khi-6296 ",
      make_model: "Toyota Hilux",
      category: "Light commercial",
      ownership: "owned",
      fuel_type: "diesel",
      opening_odometer: "84260",
    });
    expect(parsed).toMatchObject({
      registration_no: "KHI-6296",
      status: "active",
      current_driver_id: null,
      asset_number: "",
    });
    expect(fleetVehicleInputSchema.safeParse({ ...parsed, registration_no: "KHI/6296" }).success).toBe(false);
  });
  it("requires litres above zero and a well-formed odometer", () => {
    const base = {
      company_id: company,
      vehicle_id: "v1",
      entry_date: "2026-11-16",
      odometer: "100",
      litres: "10",
      rate: "350",
    };
    expect(fleetFuelEntryInputSchema.parse(base)).toMatchObject({ supplier_id: null, supplier_invoice_ref: "" });
    expect(fleetFuelEntryInputSchema.safeParse({ ...base, litres: "0" }).success).toBe(false);
    expect(fleetFuelEntryInputSchema.safeParse({ ...base, odometer: "1,000" }).success).toBe(false);
  });
  it("requires a vendor for outsourced maintenance and an amount", () => {
    const base = {
      company_id: company,
      vehicle_id: "v1",
      entry_date: "2026-11-16",
      work_description: "Oil change",
      labour_amount: "500",
    };
    expect(fleetMaintenanceInputSchema.parse(base)).toMatchObject({ is_external: false, parts_amount: "0" });
    expect(fleetMaintenanceInputSchema.safeParse({ ...base, is_external: true }).success).toBe(false);
    expect(fleetMaintenanceInputSchema.safeParse({ ...base, supplier_id: "s1" }).success).toBe(false);
    expect(fleetMaintenanceInputSchema.safeParse({ ...base, labour_amount: "0" }).success).toBe(false);
  });
  it("defaults a tool to one item in good condition", () => {
    expect(
      fleetToolInputSchema.parse({ company_id: company, name: "Wrench", recorded_on: "2026-11-16" }),
    ).toMatchObject({
      quantity: 1,
      condition: "good",
      replaces_tool_id: null,
    });
  });
});
