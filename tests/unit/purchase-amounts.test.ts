import { describe, expect, it } from "vitest";
import {
  allocatePurchaseAmount,
  documentTotal,
  formatPurchaseMoney,
  inheritPurchaseAdjustments,
  lineTotal,
  purchaseTotals,
  scaled,
} from "../../packages/contracts/src/procurement/amounts.js";

const line = (patch = {}) => ({ id: "line-a", quantity: "2", unit_price: "10.00", tax_percent: "10", ...patch });
describe("Exact purchase adjustments", () => {
  it("retains historical fractional quantity and tax rounding", () => {
    expect(documentTotal([line({ quantity: "1.2345", unit_price: "10.01", tax_percent: "17.50" })])).toBe("14.52");
    expect(documentTotal([line({ quantity: "0.5", unit_price: "0.01", tax_percent: "0" })])).toBe("0.01");
  });
  it("deducts both discounts before tax and includes freight and its tax once", () => {
    const result = purchaseTotals([line({ discount_amount: "2.00" })], {
      discount_amount: "3.00",
      additional_charges: [{ id: "freight", amount: "5.00", tax_percent: "20" }],
    });
    expect(result).toMatchObject({
      subtotal: "20.00",
      discount: "5.00",
      additional_charges: "5.00",
      net: "20.00",
      tax: "2.50",
      total: "22.50",
    });
    expect(result.lines[0]).toMatchObject({ net: "15.00", tax: "1.50" });
    expect(result.charges[0]).toMatchObject({ net: "5.00", tax: "1.00" });
  });
  it("allocates a residual cent by stable identity regardless of row order", () => {
    const lines = [
      line({ id: "b", quantity: "1", unit_price: "1" }),
      line({ id: "a", quantity: "1", unit_price: "1" }),
    ];
    const first = purchaseTotals(lines, { discount_amount: "0.01" });
    expect(first.lines.map((item) => item.document_discount)).toEqual(["0.00", "0.01"]);
    expect(purchaseTotals([...lines].reverse(), { discount_amount: "0.01" }).lines[0]!.document_discount).toBe("0.01");
  });
  it("handles zero bases and a fully discounted line", () => {
    expect(purchaseTotals([line({ discount_amount: "20" })]).total).toBe("0.00");
    expect(allocatePurchaseAmount(0n, [0n, 0n], ["a", "b"])).toEqual([0n, 0n]);
    expect(purchaseTotals([]).total).toBe("0.00");
  });
  it.each(["-1", "NaN", "", "1.001", "1e2"])("rejects invalid money %s", (amount) => {
    expect(() => purchaseTotals([line({ discount_amount: amount })])).toThrow();
  });
  it("rejects excessive discounts, tax and supported-limit overflow", () => {
    expect(() => purchaseTotals([line({ discount_amount: "20.01" })])).toThrow(/Line discount/);
    expect(() => purchaseTotals([line({ discount_amount: "2" })], { discount_amount: "18.01" })).toThrow(
      /Purchase discount/,
    );
    expect(() => purchaseTotals([line({ tax_percent: "100.01" })])).toThrow(/Tax rate/);
    expect(() => purchaseTotals([line({ quantity: "9999999999", unit_price: "999999999999.99" })])).toThrow(/limit/);
  });
  it("formats large values without losing cents", () => {
    expect(formatPurchaseMoney("999999999999.99")).toBe("999,999,999,999.99");
    expect(formatPurchaseMoney("0")).toBe("0.00");
  });
  it("leaves final partial quantities the exact remaining discount and freight cents", () => {
    const source = {
      lines: [line({ quantity: "3", unit_price: "1", discount_amount: "0.01", tax_percent: "0" })],
      discount_amount: "0.02",
      additional_charges: [{ id: "freight", amount: "0.01", tax_percent: "0" }],
    };
    const selected = [{ ...source.lines[0]!, id: "partial-a", source_line_id: "line-a", quantity: "1" }];
    const first = inheritPurchaseAdjustments(source, selected);
    const firstAmounts = purchaseTotals(first.lines, first);
    const used = {
      lines: [
        {
          source_line_id: "line-a",
          quantity: "1",
          line_discount: firstAmounts.lines[0]!.line_discount,
          document_discount: firstAmounts.lines[0]!.document_discount,
        },
      ],
      charges: [{ source_charge_id: "freight", amount: first.additional_charges[0]!.amount }],
    };
    const second = inheritPurchaseAdjustments(source, [{ ...selected[0]!, id: "partial-b", quantity: "2" }], used);
    expect(scaled(first.discount_amount, 2) + scaled(second.discount_amount, 2)).toBe(2n);
    expect(scaled(first.lines[0]!.discount_amount, 2) + scaled(second.lines[0]!.discount_amount, 2)).toBe(1n);
    expect(scaled(first.additional_charges[0]!.amount, 2) + scaled(second.additional_charges[0]!.amount, 2)).toBe(1n);
    expect(scaled(firstAmounts.total, 2) + scaled(purchaseTotals(second.lines, second).total, 2)).toBe(
      scaled(purchaseTotals(source.lines, source).total, 2),
    );
    expect(() => inheritPurchaseAdjustments(source, [{ ...selected[0]!, quantity: "3" }], used)).toThrow(/quantity/);
  });
  it("rejects tampered allocated discounts", () => {
    expect(() => purchaseTotals([line({ allocated_discount_amount: "1" })])).toThrow(/Allocated/);
  });
  it("includes an inherited discount when calculating one line", () => {
    expect(lineTotal(line({ allocated_discount_amount: "1.00" }))).toBe(2090n);
  });
  it.each(["0.00", "10.00"])("allocates freight for a zero-net source priced at %s", (unit_price) => {
    const source = {
      lines: [line({ quantity: "2", unit_price, discount_amount: unit_price === "0.00" ? "0" : "20" })],
      additional_charges: [{ id: "freight", amount: "10.00", tax_percent: "0" }],
    };
    const part = inheritPurchaseAdjustments(source, [{ ...source.lines[0]!, source_line_id: "line-a", quantity: "1" }]);
    expect(part.additional_charges[0]!.amount).toBe("5.00");
  });
});
