import { describe, it, expect } from "vitest";
import {
  calculateOvertimeAmount,
  overtimeDecimal,
  type MonetaryOvertimeInput,
} from "../../server/api/src/modules/hr/payroll-overtime.js";
import { ExactPayrollAmount as Money } from "../../server/api/src/modules/hr/payroll-calculation.js";
const input = (extra: Partial<MonetaryOvertimeInput> = {}): MonetaryOvertimeInput => ({
  minutes: 60,
  basis_amount: "31000",
  rate_basis_method: "monthly",
  ordinary_hours: "200",
  multiplier: "1.5",
  minute_precision: 8,
  hourly_rate_precision: 8,
  intermediate_precision: 8,
  rounding_mode: "half_up",
  rounding_stage: "per_ot_day",
  final_currency_scale: 2,
  ...extra,
});
describe("Exact monetary overtime", () => {
  it("converts approved monthly compensation using explicit hours and monetary multiplier", () => {
    expect(calculateOvertimeAmount(input())).toMatchObject({
      basis_amount: "31000.000000",
      hourly_rate: "155.00000000",
      overtime_hours: "1.00000000",
      rounded_amount: "232.50",
    });
  });
  it("keeps fractional-hour arithmetic exact until configured intermediate quantization", () => {
    expect(calculateOvertimeAmount(input({ minutes: 1 })).rounded_amount).toBe("3.88");
  });
  it("supports an explicit direct hourly contractual rate", () => {
    expect(
      calculateOvertimeAmount(
        input({ rate_basis_method: "direct_hourly", ordinary_hours: null, basis_amount: "250", minutes: 90 }),
      ).rounded_amount,
    ).toBe("562.50");
  });
  it.each(["daily", "weekly", "annual"])(
    "uses the explicit %s ordinary-hour divisor without a guessed calendar",
    (rate_basis_method) => {
      expect(
        calculateOvertimeAmount(input({ rate_basis_method, basis_amount: "1000", ordinary_hours: "10" }))
          .rounded_amount,
      ).toBe("150.00");
    },
  );
  it("preserves values above floating point exact integer range", () => {
    expect(
      calculateOvertimeAmount(
        input({
          rate_basis_method: "direct_hourly",
          ordinary_hours: null,
          basis_amount: "9007199254740.01",
          multiplier: "1",
        }),
      ).rounded_amount,
    ).toBe("9007199254740.01");
  });
  it("honours currency tie rounding modes", () => {
    expect(
      calculateOvertimeAmount(
        input({ basis_amount: "1", ordinary_hours: "200", multiplier: "1", rounding_mode: "half_even" }),
      ).rounded_amount,
    ).toBe("0.00");
    expect(
      calculateOvertimeAmount(input({ basis_amount: "1", ordinary_hours: "200", multiplier: "1" })).rounded_amount,
    ).toBe("0.01");
  });
  it("quantizes eight decimal intermediate values without floating point conversion", () => {
    expect(overtimeDecimal(Money.parse("0.123456785"), 8, "half_even")).toBe("0.12345678");
    expect(overtimeDecimal(Money.parse("0.123456785"), 8, "half_up")).toBe("0.12345679");
  });
  it.each([0, 1441, 1.5])("rejects invalid approved minutes %s", (minutes) => {
    expect(() => calculateOvertimeAmount(input({ minutes }))).toThrow();
  });
  it.each([null, "0", "-1"])("rejects missing or invalid ordinary hours %s", (ordinary_hours) => {
    expect(() => calculateOvertimeAmount(input({ ordinary_hours }))).toThrow();
  });
  it("does not guess a custom conversion or a missing monetary multiplier", () => {
    expect(() => calculateOvertimeAmount(input({ rate_basis_method: "custom" }))).toThrow("Custom");
    expect(() => calculateOvertimeAmount(input({ multiplier: "0" }))).toThrow();
  });
  it("rejects unsupported precision and negative basis", () => {
    expect(() => calculateOvertimeAmount(input({ intermediate_precision: 9 }))).toThrow();
    expect(() => calculateOvertimeAmount(input({ basis_amount: "-1" }))).toThrow();
    expect(() => calculateOvertimeAmount(input({ final_currency_scale: 5 }))).toThrow();
  });
});
