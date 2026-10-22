import { describe, it, expect } from "vitest";
import { loanSchedule, payrollUnits } from "../../server/api/src/modules/hr/payroll-workspace.js";
import { loanRecoveryLine, sameLoanRecoveries } from "../../server/api/src/modules/hr/payroll-loans.js";
import { hrPayrollRecordActionSchema } from "../../packages/contracts/src/hr/index.js";
const input = {
  company_id: "company",
  section: "loans",
  action: "confirm_disbursement",
  reason: "Independently verified bank transfer",
  expected_version: 3,
  source_hash: "a".repeat(64),
  bank_payment_line_id: "line",
  bank_reference: "TRANSFER-1",
  confirmed_on: "2026-10-20",
  confirm_override: false,
};
const evidence = {
  id: "instalment",
  loan_id: "loan",
  employee_id: "employee",
  loan_version: 4,
  currency_code: "PKR",
  component_id: "component",
  code: "LOAN",
  name: "Loan recovery",
  reference: "L-1",
  disbursement_hash: "a".repeat(64),
  receivable_account_id: "receivable",
  component_status: "active",
  kind: "deduction",
  method: "fixed",
  account_status: "active",
  account_type: "asset",
  is_header: false,
  amount: "33.3400",
};
describe("Exact currency loan recovery and contracts", () => {
  it.each([0, 1, 2, 3, 4])("preserves principal exactly at currency scale %s", (scale) => {
    const schedule = loanSchedule("100", 3, scale);
    expect(schedule.reduce((sum, v) => sum + payrollUnits(v), 0n)).toBe(payrollUnits("100"));
    for (const amount of schedule) expect(payrollUnits(amount) % 10n ** BigInt(4 - scale)).toBe(0n);
  });
  it("uses currency minor units when distributing remainders", () =>
    expect(loanSchedule("100", 3, 2)).toEqual(["33.3400", "33.3300", "33.3300"]));
  it.each([
    ["0.01", 2, 2],
    ["1.001", 2, 2],
    ["1", 1, 5],
  ] as const)("rejects unrepresentable principal/schedule %s", (...args) =>
    expect(() => loanSchedule(...args)).toThrow(),
  );
  it("credits the exact loan receivable rather than the generic deduction liability", () =>
    expect(loanRecoveryLine(evidence, "PKR", 2)).toMatchObject({
      source: "loan:instalment",
      amount: "33.34",
      kind: "deduction",
      liability_account_id: "receivable",
      expense_account_id: null,
    }));
  it.each([
    { currency_code: "USD" },
    { component_status: "inactive" },
    { account_status: "inactive" },
    { kind: "earning" },
    { method: "formula" },
    { account_type: "liability" },
    { is_header: true },
    { amount: "33.3333" },
  ])("rejects unsupported recovery authority %j", (change) =>
    expect(() => loanRecoveryLine({ ...evidence, ...change }, "PKR", 2)).toThrow(),
  );
  it("ignores result linkage only while retaining every business fingerprint", () => {
    expect(sameLoanRecoveries([{ ...evidence, result_id: "result" }], [evidence])).toBe(true);
    expect(sameLoanRecoveries([{ ...evidence, result_id: "result" }], [{ ...evidence, loan_version: 5 }])).toBe(false);
    expect(sameLoanRecoveries([evidence], [])).toBe(false);
  });
  it("requires complete independent bank confirmation", () =>
    expect(hrPayrollRecordActionSchema.safeParse(input).success).toBe(true));
  it.each([
    { section: "salaries" },
    { bank_payment_line_id: undefined },
    { bank_reference: undefined },
    { confirmed_on: undefined },
    { confirm_override: true },
    { confirmed_on: "invalid" },
  ])("rejects invalid confirmation %j", (change) =>
    expect(hrPayrollRecordActionSchema.safeParse({ ...input, ...change }).success).toBe(false),
  );
  it("rejects hidden disbursement evidence on an unrelated workflow action", () =>
    expect(hrPayrollRecordActionSchema.safeParse({ ...input, action: "approve" }).success).toBe(false));
});
