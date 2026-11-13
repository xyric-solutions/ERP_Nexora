import { describe, it, expect } from "vitest";
import { calculateMonthlyPayroll } from "../../server/api/src/modules/hr/payroll-calculation.js";
import { calculateTax, taxInputSchema, taxSnapshotSchema } from "../../packages/contracts/src/finance/taxes.js";
import { prototypeModules, findPrototypePage } from "../../app/shell/config/prototype-data.js";

describe("governed taxes", () => {
  it("calculates exact percentages across currency precision and signed credits", () => {
    expect(calculateTax("1000.00", "5.50", 2)).toBe("55.00");
    expect(calculateTax("1", "5.50", 0)).toBe("0");
    expect(calculateTax("1.234", "5.50", 3)).toBe("0.068");
    expect(calculateTax("-0.10", "5.00", 2)).toBe("-0.01");
    expect(calculateTax("9007199254740993.00", "100", 2)).toBe("9007199254740993.00");
    expect(() => calculateTax("1.001", "5.50", 2)).toThrow();
    expect(() => calculateTax("1.00", "100.01", 2)).toThrow();
    expect(() => calculateTax("1.00", "5.555", 2)).toThrow();
  });
  it("retains the governed deduction variable for later Payroll formulas", () => {
    const tax = taxSnapshotSchema.parse({
      definition_id: "tax",
      revision: 1,
      code: "TAX-001",
      name: "Test tax",
      module: "payroll",
      treatment: "payroll_deduction",
      trigger: "calculation",
      account_id: "liability",
      rate: "5.50",
      basis: "0",
      amount: "0",
      currency: "USD",
      decimal_places: 2,
    });
    const result = calculateMonthlyPayroll({
      month: "2026-11-01",
      currency_code: "USD",
      money_scale: 2,
      rounding: "half_up",
      days: Array.from({ length: 30 }, (_, index) => ({
        on_date: `2026-11-${String(index + 1).padStart(2, "0")}`,
        paid_days: "1",
        unpaid_days: "0",
      })),
      salaries: [
        {
          id: "salary",
          effective_from: "2026-11-01",
          effective_to: null,
          currency_code: "USD",
          compensation_type: "fixed",
          payment_basis: "monthly",
          components: [
            {
              id: "earning",
              code: "BASIC",
              name: "Basic salary",
              kind: "earning",
              method: "fixed",
              amount: "1000",
              formula: null,
              prorated: true,
              expense_account_id: "expense",
              liability_account_id: null,
            },
            {
              id: "tax",
              code: "TAX",
              name: "Tax",
              kind: "deduction",
              method: "fixed",
              amount: "0",
              formula: null,
              prorated: false,
              expense_account_id: null,
              liability_account_id: "liability",
              tax: { definition: tax, basis_component_id: "earning" },
            },
            {
              id: "later",
              code: "LATER",
              name: "Later deduction",
              kind: "deduction",
              method: "formula",
              amount: null,
              formula: "TAX * 2",
              prorated: false,
              expense_account_id: null,
              liability_account_id: "liability",
            },
          ],
        },
      ],
    });
    expect(result.lines.map((line) => line.amount)).toEqual(["1000.00", "55.00", "110.00"]);
    expect(result.net).toBe("835.00");
  });
  it("rejects incompatible module/treatment combinations", () => {
    expect(
      taxInputSchema.safeParse({
        company_id: "company",
        name: "Bad mapping",
        tax_type: "WHT",
        rate: "5.50",
        module: "sales",
        treatment: "recoverable",
        trigger: "recognition",
        account_id: "account",
        effective_date: "2026-11-12",
        reason: "Test mapping",
      }).success,
    ).toBe(false);
  });
  it("offers one Taxes leaf under Accounting and retires old modules and routes", () => {
    const accounting = prototypeModules.find((module) => module.id === "finance")!;
    expect(accounting.shortLabel).toBe("Accounting");
    expect(prototypeModules.some((module) => ["tax", "costing"].includes(module.id))).toBe(false);
    expect(accounting.groups.flatMap((group) => group.pages).filter((page) => page.id === "taxes")).toHaveLength(1);
    expect(findPrototypePage("tax", "tax-code-editor").page.id).toBe("taxes");
    expect(findPrototypePage("costing", "cost-policies").page.id).toBe("retired-module");
  });
});
