import { describe, expect, it } from "vitest";
import { billPaymentSchedule, billPaymentTerms } from "../../packages/contracts/src/procurement/bill-payment-terms.js";

describe("Bill-date payment terms", () => {
  it.each([
    ["immediate", "2026-11-11"],
    ["days_15", "2026-11-26"],
    ["days_21", "2026-12-02"],
    ["days_30", "2026-12-11"],
    ["days_45", "2026-12-26"],
    ["end_following_month", "2026-12-31"],
    ["days_10_after_end_next_month", "2027-01-10"],
    ["percent_30_now_balance_60_days", "2027-01-10"],
  ])("calculates %s from the bill date", (term, expected) => {
    const option = billPaymentTerms.find((item) => item.value === term)!;
    expect(billPaymentSchedule("2026-11-11", option.value, "100.00").at(-1)?.due_date).toBe(expected);
  });
  it("handles month-end and leap years without local-time or overflow drift", () => {
    expect(billPaymentSchedule("2028-01-31", "end_following_month", "10")).toEqual([
      { due_date: "2028-02-29", amount: "10.00" },
    ]);
    expect(billPaymentSchedule("2028-02-28", "days_15", "10")[0].due_date).toBe("2028-03-14");
  });
  it("rounds the first installment half-up and preserves every cent in the balance", () => {
    expect(billPaymentSchedule("2026-11-11", "percent_30_now_balance_60_days", "100.05")).toEqual([
      { due_date: "2026-11-11", amount: "30.02" },
      { due_date: "2027-01-10", amount: "70.03" },
    ]);
  });
  it("rejects invalid dates, amounts and calendar overflow", () => {
    expect(() => billPaymentSchedule("2026-02-30", "days_15", "10")).toThrow();
    expect(() => billPaymentSchedule("2026-11-11", "days_15", "-1")).toThrow();
    expect(() => billPaymentSchedule("9999-12-31", "days_45", "10")).toThrow();
  });
});
