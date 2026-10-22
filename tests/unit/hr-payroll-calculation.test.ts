import { describe, it, expect } from "vitest";
import {
  ExactPayrollAmount as D,
  evaluatePayrollFormula,
  calculateMonthlyPayroll,
  type PayrollCalculationSalary,
} from "../../server/api/src/modules/hr/payroll-calculation.js";
describe("Exact Payroll execution mathematics", () => {
  it("adds decimal values without binary float loss", () =>
    expect(D.parse("0.1").add(D.parse("0.2")).decimal(2)).toBe("0.30"));
  it("retains large monetary amounts and exact rational division", () =>
    expect(D.parse("9999999999999999.9999").divide(D.parse("3")).multiply(D.parse("3")).decimal(4)).toBe(
      "9999999999999999.9999",
    ));
  it.each([
    ["half_up", "1.01"],
    ["half_even", "1.00"],
    ["down", "1.00"],
    ["up", "1.01"],
  ] as const)("implements %s rounding", (mode, expected) => expect(D.parse("1.005").decimal(2, mode)).toBe(expected));
  it("rounds negative ties away from zero and avoids negative zero", () => {
    expect(D.parse("-1.005").decimal(2)).toBe("-1.01");
    expect(D.parse("-0.0001").decimal(2)).toBe("0.00");
  });
  it("evaluates bounded formulas with exact intermediate values", () =>
    expect(evaluatePayrollFormula("round(max(BASIC / 3, 100) * 0.4, 2)", { BASIC: D.parse("1000") }).decimal(2)).toBe(
      "133.33",
    ));
  it.each([
    "process.exit()",
    "1/0",
    "FUTURE+1",
    "BASIC.constructor",
    "round(1, 1.5)",
    "round(1, 10)",
    "min(1)",
    "1+",
    "1;2",
  ])("rejects unsafe/invalid formula %s", (formula) =>
    expect(() => evaluatePayrollFormula(formula, { BASIC: D.parse("1") })).toThrow(),
  );
  const salary: PayrollCalculationSalary = {
    id: "salary-1",
    effective_from: "2026-10-01",
    effective_to: null,
    currency_code: "PKR",
    compensation_type: "fixed",
    payment_basis: "monthly",
    components: [
      {
        id: "basic",
        code: "BASIC",
        name: "Basic",
        kind: "earning",
        method: "fixed",
        amount: "31000",
        formula: null,
        prorated: true,
        expense_account_id: "expense",
        liability_account_id: null,
      },
      {
        id: "house",
        code: "HOUSE",
        name: "Housing",
        kind: "earning",
        method: "formula",
        amount: null,
        formula: "BASIC * 0.4",
        prorated: true,
        expense_account_id: "expense",
        liability_account_id: null,
      },
    ],
  };
  const days = Array.from({ length: 31 }, (_, i) => ({
    on_date: "2026-10-" + String(i + 1).padStart(2, "0"),
    paid_days: "1",
    unpaid_days: "0",
  }));
  const input = {
    month: "2026-10-01",
    currency_code: "PKR",
    money_scale: 2,
    rounding: "half_up" as const,
    days,
    salaries: [salary],
  };
  it("prorates once; a formula component refers to the full contractual base", () => {
    const result = calculateMonthlyPayroll({
      ...input,
      days: days.map((d, i) => (i === 0 ? { ...d, paid_days: "0.5", unpaid_days: "0.5" } : d)),
    });
    expect(result.lines.map((i) => i.amount)).toEqual(["30500.00", "12200.00"]);
    expect(result.net).toBe("42700.00");
  });
  it("splits effective salary revisions against the actual frozen dates", () => {
    const result = calculateMonthlyPayroll({
      ...input,
      salaries: [
        { ...salary, effective_to: "2026-10-15" },
        {
          ...salary,
          id: "salary-2",
          effective_from: "2026-10-16",
          components: [{ ...salary.components[0]!, amount: "62000" }],
        },
      ],
    });
    expect(result.segments).toHaveLength(2);
    expect(result.gross).toBe("53000.00");
  });
  it("does not treat unsupported hourly/contractual authority as monthly salary", () =>
    expect(() => calculateMonthlyPayroll({ ...input, salaries: [{ ...salary, payment_basis: "hourly" }] })).toThrow());
  it("blocks missing or overlapping salary coverage", () => {
    expect(() => calculateMonthlyPayroll({ ...input, salaries: [] })).toThrow();
    expect(() => calculateMonthlyPayroll({ ...input, salaries: [salary, { ...salary, id: "other" }] })).toThrow();
  });
  it("blocks duplicate or unbalanced frozen days", () => {
    expect(() => calculateMonthlyPayroll({ ...input, days: [days[0]!, days[0]!] })).toThrow();
    expect(() => calculateMonthlyPayroll({ ...input, days: [{ ...days[0]!, paid_days: "0.5" }] })).toThrow();
  });
});
