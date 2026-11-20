import { describe, it, expect } from "vitest";
import { salesAmounts } from "../../packages/contracts/src/sales/amounts.js";
describe("Canonical Sales currency amounts", () => {
  it("allocates document discounts without losing the final minor unit", () => {
    expect(
      salesAmounts(
        [
          { quantity: "1", unit_price: "0.01" },
          { quantity: "2", unit_price: "0.01" },
        ],
        2,
        "0.01",
      ),
    ).toEqual({
      net: "0.02",
      lines: [
        { net: "0.01", document_discount: "0.00" },
        { net: "0.01", document_discount: "0.01" },
      ],
    });
  });
  it.each([
    [0, "100.00", "200"],
    [2, "100.00", "200.00"],
    [3, "100.125", "200.250"],
  ] as const)("respects %i native decimal places", (precision, price, net) => {
    expect(salesAmounts([{ quantity: "2", unit_price: price }], precision).net).toBe(net);
  });
  it("rounds fractional-unit prices only at the currency boundary", () => {
    expect(salesAmounts([{ quantity: "0.3333", unit_price: "0.10" }], 2).net).toBe("0.03");
    expect(salesAmounts([{ quantity: "0.5", unit_price: "1.001" }], 3).net).toBe("0.501");
  });
  it("preserves amounts beyond JavaScript's exact integer range", () => {
    expect(salesAmounts([{ quantity: "1", unit_price: "9007199254740993.01" }], 2).net).toBe("9007199254740993.01");
  });
  it("rejects excess precision, negative amounts and over-discounting", () => {
    expect(() => salesAmounts([{ quantity: "1", unit_price: "1.01" }], 0)).toThrow("precision");
    expect(() => salesAmounts([{ quantity: "1", unit_price: "1", discount_amount: "2" }], 2)).toThrow("discount");
    expect(() => salesAmounts([{ quantity: "1", unit_price: "1" }], 2, "2")).toThrow("discount");
    expect(() => salesAmounts([{ quantity: "1", unit_price: "-1" }], 2)).toThrow();
  });
});
