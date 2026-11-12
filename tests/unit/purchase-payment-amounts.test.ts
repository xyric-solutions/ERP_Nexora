import { describe, expect, it } from "vitest";
import {
  paymentTotals,
  purchasePaymentDetailsSchema,
  supplierMailingAddress,
} from "../../packages/contracts/src/procurement/index.js";

describe("Payment instruction amounts", () => {
  it("formats complete mailing addresses without empty separators", () => {
    expect(
      supplierMailingAddress({
        address: "Street 1",
        profile: {
          billing_city: "Karachi",
          billing_province: "Sindh",
          billing_postal_code: "74000",
          billing_country: "Pakistan",
        },
      }),
    ).toBe("Street 1\nKarachi, Sindh, 74000\nPakistan");
    expect(supplierMailingAddress({ address: "Street 1" })).toBe("Street 1");
  });
  it("deducts rounded WHT and additional WHT without double-counting bill allocations", () => {
    expect(paymentTotals({ amount: "100.00", wht_rate: "2.50", additional_wht: "1.00" }, "75.00")).toEqual({
      gross: "100.00",
      wht: "2.50",
      additional_wht: "1.00",
      net: "96.50",
      unallocated: "25.00",
    });
    expect(paymentTotals({ amount: "0.05", wht_rate: "10", additional_wht: "0" }, "0").wht).toBe("0.01");
  });
  it("rejects excess allocations, withholding, rates and malformed decimals", () => {
    for (const [entry, allocated] of [
      [{ amount: "10", wht_rate: "0", additional_wht: "0" }, "10.01"],
      [{ amount: "10", wht_rate: "100", additional_wht: "0.01" }, "10"],
      [{ amount: "10", wht_rate: "100.01", additional_wht: "0" }, "10"],
      [{ amount: "1e3", wht_rate: "0", additional_wht: "0" }, "0"],
    ] as const)
      expect(() => paymentTotals(entry, allocated)).toThrow(RangeError);
  });
  it("requires a bank, supplier, explicit method and bounded transaction tax inputs", () => {
    expect(purchasePaymentDetailsSchema.safeParse({ bank_account_id: "", entries: [] }).success).toBe(false);
    const entry = {
      supplier_id: "supplier",
      amount: "10",
      mode: "cheque",
      reference: "CHQ-01",
      wht_rate: "0",
      additional_wht: "0",
    };
    expect(purchasePaymentDetailsSchema.parse({ bank_account_id: "bank", entries: [entry] }).entries[0].mode).toBe(
      "cheque",
    );
    expect(
      purchasePaymentDetailsSchema.safeParse({ bank_account_id: "bank", entries: [{ ...entry, wht_rate: "101" }] })
        .success,
    ).toBe(false);
  });
});
