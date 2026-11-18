import { describe, it, expect } from "vitest";
import { convertUnitQuantity, unitRatio, unitInputSchema } from "../../packages/contracts/src/inventory/units.js";
const kg = { category: "mass", numerator: "1", denominator: "1" } as const;
const gram = { ...kg, denominator: "1000" };
const tonne = { ...kg, numerator: "1000" };
describe("Exact measurement conversions", () => {
  it.each([
    ["1", kg, gram, "1000"],
    ["250", gram, kg, "0.25"],
    ["1", tonne, kg, "1000"],
    ["2.5", kg, gram, "2500"],
    ["0.0001", kg, gram, "0.1"],
    ["1", tonne, gram, "1000000"],
  ])("converts %s with exact factors", (quantity, from, to, result) => {
    expect(convertUnitQuantity(quantity, unitRatio(from, to))).toEqual({ quantity: result, exact: true });
  });
  it("preserves integer trailing zeros and zero", () => {
    expect(convertUnitQuantity("1000", { numerator: "1", denominator: "1" }, 4)).toEqual({
      quantity: "1000",
      exact: true,
    });
    expect(convertUnitQuantity("0", { numerator: "1", denominator: "1" }, 4)).toEqual({ quantity: "0", exact: true });
  });
  it("round-trips exact rational quantities without floating point", () => {
    const forward = convertUnitQuantity("12345.6789", unitRatio(kg, gram));
    expect(convertUnitQuantity(forward.quantity, unitRatio(gram, kg))).toEqual({ quantity: "12345.6789", exact: true });
  });
  it("uses squared/cubed dimensions and elapsed time factors", () => {
    expect(convertUnitQuantity("1", { numerator: "10000", denominator: "1" }).quantity).toBe("10000");
    expect(convertUnitQuantity("1", { numerator: "1000000", denominator: "1" }).quantity).toBe("1000000");
    expect(convertUnitQuantity("2", { numerator: "3600", denominator: "60" }).quantity).toBe("120");
  });
  it("labels quantities that cannot fit target precision", () => {
    expect(convertUnitQuantity("1", { numerator: "1", denominator: "3" }, 4)).toEqual({
      quantity: "0.3333",
      exact: false,
    });
    expect(convertUnitQuantity("0.01", unitRatio(gram, kg), 4)).toEqual({ quantity: "0", exact: false });
  });
  it("rejects incompatible categories and unconfigured packs/days", () => {
    expect(() => unitRatio(kg, { ...kg, category: "volume" })).toThrow(/compatible/);
    expect(() => unitRatio({ ...kg, category: "packaging" }, { ...kg, category: "packaging" })).toThrow(/Packaging/);
    expect(() => unitRatio({ ...kg, category: "legacy_day" }, { ...kg, category: "legacy_day" })).toThrow();
  });
  it.each(["-1", "1e3", "NaN", "1.1234567890123", "1000000000000"])("rejects invalid quantity %s", (q) =>
    expect(() => convertUnitQuantity(q, { numerator: "1", denominator: "1" })).toThrow(),
  );
  it("rejects zero factors and overflowing conversions", () => {
    expect(() => convertUnitQuantity("1", { numerator: "1", denominator: "0" })).toThrow();
    expect(() => convertUnitQuantity("999999999999", { numerator: "1000", denominator: "1" })).toThrow(/limit/);
    expect(
      unitInputSchema.safeParse({ company_id: "company", name: "Bad", symbol: "bad", category: "mass", numerator: "0" })
        .success,
    ).toBe(false);
  });
});
