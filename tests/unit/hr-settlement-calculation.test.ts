import { describe, it, expect } from "vitest";
import { calculateHrSettlementMinor, hrLifecycleCaseTermsSchema } from "../../packages/contracts/src/hr/index.js";
import { lifecycleSettlement } from "../../server/api/src/modules/hr/lifecycle-cases.js";
describe("Reviewed settlement quantity and rate", () => {
  it.each([
    ["1.5", "8230", "12345"],
    ["0.005", "100", "1"],
    ["0.004", "100", "0"],
    ["1000000.125", "12", "12000002"],
    ["0", "999", "0"],
  ])("calculates %s × %s in exact minor units", (q, r, expected) =>
    expect(calculateHrSettlementMinor(q, r)).toBe(expected),
  );
  it("rejects unsupported precision and overflowing amounts", () => {
    for (const [q, r] of [
      ["1.00001", "10"],
      ["1", "1.2"],
      ["-1", "100"],
      ["9999999.999", "999999999999999"],
    ])
      expect(() => calculateHrSettlementMinor(q!, r!)).toThrow();
  });
  it("blocks tampered line totals at both public contract and repository calculation boundaries", () => {
    const line = {
      direction: "earning" as const,
      description: "Reviewed leave entitlement",
      amount_minor: "12346",
      source_reference: "approved-policy-and-days-record",
      calculation: { quantity: "1.5", rate_minor: "8230", rounding: "half_up" as const },
    };
    expect(
      hrLifecycleCaseTermsSchema.safeParse({
        kind: "settlement",
        exit_case_id: "exit-case",
        currency: "PKR",
        notes: "Approved contractual policy evidence",
        lines: [line],
      }).success,
    ).toBe(false);
    expect(() => lifecycleSettlement([line])).toThrow();
    expect(lifecycleSettlement([{ ...line, amount_minor: "12345" }]).net_minor).toBe("12345");
  });
});
