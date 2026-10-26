import { describe, it, expect } from "vitest";
import {
  payrollUnits,
  payrollDecimal,
  loanSchedule,
  validatePayrollFormula,
} from "../../server/api/src/modules/hr/payroll-workspace.js";
import { createHrPayrollRecordSchema, hrPayrollWorkspaceQuerySchema } from "../../packages/contracts/src/hr/index.js";
describe("Exact Payroll configuration arithmetic", () => {
  it("retains amounts above JavaScript safe integer precision", () =>
    expect(payrollDecimal(payrollUnits("9999999999999999.9999"))).toBe("9999999999999999.9999"));
  it("splits every principal unit without rounding loss", () => {
    const rows = loanSchedule("100.0001", 3);
    expect(rows).toEqual(["33.3334", "33.3334", "33.3333"]);
    expect(rows.reduce((sum, v) => sum + payrollUnits(v), 0n)).toBe(payrollUnits("100.0001"));
  });
  it.each(["-1", "NaN", "Infinity", "0.00001", "1e4", "1,000"])("rejects invalid monetary format %s", (value) =>
    expect(() => payrollUnits(value)).toThrow(),
  );
  it("rejects zero-value recovery instalments", () => expect(() => loanSchedule("0.0001", 2)).toThrow());
  it("accepts bounded safe arithmetic with prior components", () =>
    expect(() => validatePayrollFormula("round(max(BASIC * 0.1, 100), 2)", new Set(["BASIC"]))).not.toThrow());
  it.each([
    "process.exit()",
    "BASIC.constructor",
    "BASIC ** 2",
    "BASIC + FUTURE",
    "round(BASIC)",
    "1; alert(1)",
    "min(1)",
    "1 +",
    "()",
  ])("rejects unsafe or invalid formula %s", (formula) =>
    expect(() => validatePayrollFormula(formula, new Set(["BASIC"]))).toThrow(),
  );
  it("limits nesting and expression complexity", () =>
    expect(() => validatePayrollFormula("(".repeat(30) + "1" + ")".repeat(30), new Set())).toThrow());
  it("enforces bounded workspace pagination and actual month", () => {
    expect(
      hrPayrollWorkspaceQuerySchema.safeParse({ company_id: "c", section: "runs", month: "2026-10-02", limit: 999 })
        .success,
    ).toBe(false);
  });
  it("requires exact one monetary source per structure item", () =>
    expect(
      createHrPayrollRecordSchema.safeParse({
        kind: "structure",
        company_id: "c",
        code: "S",
        name: "Salary",
        reason: "Test configuration",
        description: "",
        currency_code: "PKR",
        items: [{ component_id: "c", amount: "10", formula: "BASIC" }],
      }).success,
    ).toBe(false));
});
