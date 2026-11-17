import { describe, it, expect } from "vitest";
import { nativePurchaseAmount } from "../../server/api/src/modules/finance/subledger/purchase-bridge.js";
import {
  formatReportAmount,
  reportCsvCell,
  connectedReportCsv,
} from "../../app/features/reports/model/connected-report-export.js";
import {
  connectedReportQuerySchema,
  connectedReportSchema,
  purchaseAvailableAmount,
} from "../../packages/contracts/src/index.js";
describe("Connected financial report presentation", () => {
  it("canonicalizes supported Finance precisions without rounding source evidence", () => {
    expect(nativePurchaseAmount("10.00", 0)).toBe("10");
    expect(nativePurchaseAmount("10.001", 3)).toBe("10.001");
    expect(() => nativePurchaseAmount("10.001", 2)).toThrow("precision");
  });
  it("never offers more Purchase cents than the exact AP remainder", () => {
    expect(
      purchaseAvailableAmount({ total_amount: "10.00", outstanding_amount: "9.99900000", reserved_amount: "1.00" }),
    ).toBe("8.99");
    expect(purchaseAvailableAmount({ total_amount: "10.00", outstanding_amount: "0.009", reserved_amount: "0" })).toBe(
      "0.00",
    );
    expect(purchaseAvailableAmount({ total_amount: "10.00", outstanding_amount: "0", reserved_amount: "10" })).toBe(
      "0.00",
    );
  });
  it("preserves exact large amounts and currency precision without truncating evidence", () => {
    expect(formatReportAmount("9007199254740993.01000000", 2)).toBe("9,007,199,254,740,993.01");
    expect(formatReportAmount("-123.00000000", 0)).toBe("-123");
    expect(formatReportAmount("1.23400000", 3)).toBe("1.234");
    expect(formatReportAmount("1.005", 2)).toBe("1.005");
  });
  it("neutralizes formulas and escapes multiline user text", () => {
    expect(reportCsvCell(' \t=HYPERLINK("x")')).toBe('"\' \t=HYPERLINK(""x"")"');
    expect(reportCsvCell('Supplier, "A"\nLtd')).toBe('"Supplier, ""A""\nLtd"');
    expect(reportCsvCell("@SUM(1)")).toBe('"\'@SUM(1)"');
  });
  it("exports the same dated filters, native totals and empty evidence as the report", () => {
    const report = connectedReportSchema.parse({
      company_id: "synthetic",
      report: "bank-balance-report",
      from: "2026-07-01",
      as_of: "2027-06-30",
      columns: [],
      rows: [],
      total_rows: 0,
      totals: [
        { currency: "USD", decimal_places: 2, values: { closing: "10.00" } },
        { currency: "PKR", decimal_places: 2, values: { closing: "20.00" } },
      ],
      notes: ["No imported statement evidence"],
    });
    const csv = connectedReportCsv(report, [], "Bank balances");
    expect(csv).toContain("From 2026-07-01");
    expect(csv).toContain("As of 2027-06-30");
    expect(csv).toContain('"USD","closing: 10.00"');
    expect(csv).toContain('"PKR","closing: 20.00"');
    expect(csv).toContain("No imported statement evidence");
    expect(
      connectedReportQuerySchema.safeParse({
        company_id: "synthetic",
        report: "bank-balance-report",
        from: "2027-07-01",
        as_of: "2027-06-30",
      }).success,
    ).toBe(false);
  });
});
