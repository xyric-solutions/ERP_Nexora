import { describe, it, expect } from "vitest";
import { assemblePayrollAccrual, hasExactLoanCurrencyParity } from "../../server/api/src/modules/hr/payroll-journal.js";
import { hrPayrollJournalActionSchema, hrPayrollJournalQuerySchema } from "../../packages/contracts/src/hr/index.js";
const results = [
  { id: "r1", gross: "100.0000", deductions: "20.0000", net: "80.0000", employer_contributions: "5.0000" },
];
const items = [
  { result_id: "r1", kind: "earning", amount: "100.0000", expense_account_id: "expense", liability_account_id: null },
  { result_id: "r1", kind: "deduction", amount: "10.0000", expense_account_id: null, liability_account_id: "tax" },
  {
    result_id: "r1",
    kind: "deduction",
    amount: "10.0000",
    expense_account_id: null,
    liability_account_id: "loan-asset",
  },
  {
    result_id: "r1",
    kind: "employer_contribution",
    amount: "5.0000",
    expense_account_id: "expense",
    liability_account_id: "tax",
  },
];
describe("Exact Payroll accrual assembly and financial command contracts", () => {
  it("balances expense, statutory liabilities, funded loan assets and net payable", () => {
    const assembled = assemblePayrollAccrual(results, items, "net");
    expect(assembled.debit).toBe("105.0000");
    expect(assembled.credit).toBe("105.0000");
    expect(assembled.lines).toEqual(
      expect.arrayContaining([
        { account_id: "expense", debit: "105.0000", credit: "0.0000" },
        { account_id: "tax", debit: "0.0000", credit: "15.0000" },
        { account_id: "loan-asset", debit: "0.0000", credit: "10.0000" },
        { account_id: "net", debit: "0.0000", credit: "80.0000" },
      ]),
    );
  });
  it("retains amounts above JavaScript safe integer precision", () => {
    const amount = "9007199254740991.1200",
      r = [{ id: "r1", gross: amount, deductions: "0", net: amount, employer_contributions: "0" }];
    expect(
      assemblePayrollAccrual(r, [{ result_id: "r1", kind: "earning", amount, expense_account_id: "expense" }], "net")
        .debit,
    ).toBe(amount);
  });
  it.each([{ gross: "101" }, { deductions: "21" }, { net: "79" }, { employer_contributions: "6" }])(
    "rejects inconsistent employee headers %j",
    (change) => expect(() => assemblePayrollAccrual([{ ...results[0], ...change }], items, "net")).toThrow(),
  );
  it("does not net opposite sides of one control account", () => {
    const assembled = assemblePayrollAccrual(results, items, "expense");
    expect(assembled.lines.filter((l) => l.account_id === "expense")).toHaveLength(2);
  });
  it("rejects missing source account mappings", () =>
    expect(() =>
      assemblePayrollAccrual(
        results,
        items.map((i) => ({ ...i, expense_account_id: null })),
        "net",
      ),
    ).toThrow());
  it("rejects non-postable and empty source kinds", () => {
    expect(() => assemblePayrollAccrual(results, [{ ...items[0], kind: "informational" }], "net")).toThrow();
    expect(() => assemblePayrollAccrual([], [], "net")).toThrow();
  });
  it("drops zero-value source lines without guessing an account", () => {
    expect(
      assemblePayrollAccrual(
        results,
        [...items, { result_id: "r1", kind: "earning", amount: "0", expense_account_id: null }],
        "net",
      ).debit,
    ).toBe("105.0000");
  });
  const body = {
    company_id: "company",
    month: "2026-10-01",
    posting_date: "2026-10-20",
    action: "prepare",
    expected_version: 0,
    source_hash: "a".repeat(64),
    reason: "Prepare reviewed Payroll accrual",
  };
  it.each(["prepare", "accept", "reject", "post"])("accepts the bounded %s action", (action) =>
    expect(hrPayrollJournalActionSchema.safeParse({ ...body, action }).success).toBe(true),
  );
  it.each([
    { action: "paid" },
    { confirm_override: true },
    { exchange_rate: "1" },
    { lines: [] },
    { source_hash: "bad" },
    { expected_version: -1 },
    { month: "2026-10-02" },
  ])("rejects hidden posting/override inputs %j", (change) =>
    expect(hrPayrollJournalActionSchema.safeParse({ ...body, ...change }).success).toBe(false),
  );
  it("validates real calendar dates", () =>
    expect(
      hrPayrollJournalQuerySchema.safeParse({ company_id: "c", month: "2026-02-01", posting_date: "2026-02-31" })
        .success,
    ).toBe(false));
});

describe("Loan receivable carrying-value parity", () => {
  const funding = {
    funding_base_currency: "USD",
    base_debit: "100.00000000",
    principal: "100.0000",
    amount: "33.3400",
  };
  it("retains an exact parity-funded loan without inventing FX differences", () =>
    expect(hasExactLoanCurrencyParity(funding, "USD", 2, "1.000000000000000000")).toBe(true));
  it.each([{ funding_base_currency: "PKR" }, { base_debit: "99.99" }, { amount: "0.0001" }])(
    "rejects unallocated funding or recovery evidence %j",
    (change) => expect(hasExactLoanCurrencyParity({ ...funding, ...change }, "USD", 2, "1")).toBe(false),
  );
  it.each(["0.5", "1.000000000000000001"])("rejects non-parity current FX %s", (rate) =>
    expect(hasExactLoanCurrencyParity(funding, "USD", 2, rate)).toBe(false),
  );
  it("permits higher Finance base precision without rounding Payroll minor units", () =>
    expect(hasExactLoanCurrencyParity(funding, "USD", 6, "1")).toBe(true));
});
