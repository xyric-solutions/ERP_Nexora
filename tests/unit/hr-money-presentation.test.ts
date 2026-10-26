import { describe, it, expect } from "vitest";
import { formatHrMinor, parseHrCurrency } from "../../app/features/hr/components/payroll-money.js";
import { calculateHrSettlementMinor } from "../../packages/contracts/src/hr/index.js";
describe("Shared exact HR currency presentation", () => {
  it("formats large and signed currency amounts without floating point", () => {
    expect(formatHrMinor("999999999999999", 2)).toBe("9999999999999.99");
    expect(formatHrMinor("-1", 4)).toBe("-0.0001");
    expect(formatHrMinor("1", 0)).toBe("1");
  });
  it("accepts ordinary currency entry and rejects unsupported precision", () => {
    expect(parseHrCurrency("100.50", 2)).toBe("10050");
    expect(parseHrCurrency("1.0001", 4)).toBe("10001");
    expect(() => parseHrCurrency("1.001", 2)).toThrow();
    expect(() => parseHrCurrency("NaN", 2)).toThrow();
  });
  it("preserves four-decimal leave until one exact minor-unit rounding", () => {
    expect(calculateHrSettlementMinor("10.2500", "10001")).toBe("102510");
    expect(calculateHrSettlementMinor("0.0005", "1000")).toBe("1");
  });
});
