import { describe, it, expect } from "vitest";
import { hrEncashmentRuleTermsSchema, calculateHrSettlementMinor } from "../../packages/contracts/src/hr/index.js";
const fixed = {
  name: "Reviewed company paid leave rule",
  leave_type_id: "paid-leave",
  currency: "PKR",
  rate_minor: "10001",
  maximum_days: "10.2500",
  minimum_service_days: 0,
  effective_from: "2026-01-01",
  effective_to: "2026-12-31",
  policy_reference: "Signed company contractual policy reference",
};
describe("Salary-derived encashment contract", () => {
  it("requires an explicit salary basis with a server-derived rate sentinel and unique components", () => {
    const salary = { ...fixed, rate_minor: "0", salary_basis: { component_ids: ["base"], multiplier: 1, divisor: 30 } };
    expect(hrEncashmentRuleTermsSchema.safeParse(fixed).success).toBe(true);
    expect(hrEncashmentRuleTermsSchema.safeParse(salary).success).toBe(true);
    for (const invalid of [
      { ...fixed, rate_minor: "0" },
      { ...salary, rate_minor: "100" },
      { ...salary, salary_basis: { ...salary.salary_basis, component_ids: ["base", "base"] } },
      { ...salary, salary_basis: { ...salary.salary_basis, divisor: 0 } },
      { ...salary, salary_basis: { ...salary.salary_basis, multiplier: 1.5 } },
    ])
      expect(hrEncashmentRuleTermsSchema.safeParse(invalid).success).toBe(false);
  });
  it("rounds capped fractional days against the exact salary basis once", () => {
    expect(calculateHrSettlementMinor("10.2500", "3100000", 30, 1)).toBe("1059167");
    expect(calculateHrSettlementMinor("0.0001", "3100000", 30, 1)).toBe("10");
    expect(calculateHrSettlementMinor("0.0001", "150000", 30, 1)).toBe("1");
  });
});
