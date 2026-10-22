import { describe, it, expect } from "vitest";
import { calculateHrSettlementMinor } from "../../packages/contracts/src/hr/index.js";
import { settlementSalaryMinor } from "../../server/api/src/modules/hr/settlement-salary.js";
describe("Exact salary settlement basis arithmetic", () => {
  it("rounds only the total and preserves existing fixed-rate behavior", () => {
    expect(calculateHrSettlementMinor("2", "3100000", 3, 1)).toBe("2066667");
    expect(calculateHrSettlementMinor("1", "3100000", 3, 1)).toBe("1033333");
    expect(calculateHrSettlementMinor("10.2500", "10001")).toBe("102510");
    expect(calculateHrSettlementMinor("0.0001", "5000")).toBe("1");
  });
  it("converts stored four-decimal currency amounts exactly at zero through four decimals", () => {
    expect(settlementSalaryMinor("31000.0100", 2)).toBe("3100001");
    expect(settlementSalaryMinor("100.0000", 0)).toBe("100");
    expect(settlementSalaryMinor("0.0001", 4)).toBe("1");
    expect(() => settlementSalaryMinor("1.0010", 2)).toThrow();
    expect(() => settlementSalaryMinor("-1.0000", 2)).toThrow();
  });
  it("rejects unbounded factors and oversized final amounts", () => {
    for (const [d, m] of [
      [0, 1],
      [1, 0],
      [1.5, 1],
      [36601, 1],
      [1, 10001],
    ])
      expect(() => calculateHrSettlementMinor("1", "1", d, m)).toThrow();
    expect(() => calculateHrSettlementMinor("2", "999999999999999")).toThrow();
  });
});
