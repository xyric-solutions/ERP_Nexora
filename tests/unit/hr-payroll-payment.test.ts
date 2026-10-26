import { describe, it, expect } from "vitest";
import { hrPayrollPaymentActionSchema, hrPayrollPaymentQuerySchema } from "../../packages/contracts/src/hr/index.js";
const base = {
  company_id: "company",
  month: "2026-10-01",
  expected_version: 1,
  source_hash: "a".repeat(64),
  reason: "Independently checked bank evidence",
};
describe("Strict salary payment commands", () => {
  it.each(["prepare", "approve", "reject"])("accepts a bounded %s action", (action) =>
    expect(hrPayrollPaymentActionSchema.safeParse({ ...base, action }).success).toBe(true),
  );
  const confirm = {
    ...base,
    action: "confirm",
    payment_id: "salary",
    bank_payment_line_id: "line",
    bank_reference: "BANK-123",
    confirmed_on: "2026-10-20",
  };
  it("requires complete bank confirmation evidence", () => {
    expect(hrPayrollPaymentActionSchema.safeParse(confirm).success).toBe(true);
    for (const k of ["payment_id", "bank_payment_line_id", "bank_reference", "confirmed_on"]) {
      const p: Record<string, unknown> = { ...confirm };
      delete p[k];
      expect(hrPayrollPaymentActionSchema.safeParse(p).success).toBe(false);
    }
  });
  it.each([
    { amount: "100" },
    { currency_code: "USD" },
    { confirm_override: true },
    { lines: [] },
    { exchange_rate: "1" },
    { expected_version: -1 },
    { source_hash: "bad" },
    { month: "2026-10-02" },
    { confirmed_on: "2026-02-31" },
    { action: "paid" },
    { bank_reference: "x" },
  ])("rejects unsafe confirmation terms %j", (change) =>
    expect(hrPayrollPaymentActionSchema.safeParse({ ...confirm, ...change }).success).toBe(false),
  );
  it("rejects bank evidence attached to a preparation command", () =>
    expect(hrPayrollPaymentActionSchema.safeParse({ ...confirm, action: "prepare" }).success).toBe(false));
  it("rejects hidden query scopes", () =>
    expect(
      hrPayrollPaymentQuerySchema.safeParse({ company_id: "c", month: "2026-10-01", tenant_id: "other" }).success,
    ).toBe(false));
});
