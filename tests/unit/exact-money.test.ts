import { describe, expect, it } from "vitest";
import {
  decimal,
  decimalText,
  convertMinor,
  proportionalMinor,
} from "../../packages/contracts/src/finance/exact-money.js";

describe("exact multi-currency arithmetic", () => {
  it("retains three decimals, rejects JPY fractional amounts and avoids Number precision loss", () => {
    expect(decimalText(decimal("1.234", 3), 3)).toBe("1.234");
    expect(() => decimal("1.1", 0)).toThrow();
    expect(decimalText(decimal("9007199254740993.12", 2), 2)).toBe("9007199254740993.12");
    expect(() => decimal("Infinity", 2)).toThrow();
    expect(() => decimal("-1", 2)).toThrow();
  });
  it("converts currency scales and rounds half values symmetrically", () => {
    expect(convertMinor(100000n, 2, "280", 2)).toBe(28000000n);
    expect(convertMinor(1234n, 3, "900", 2)).toBe(111060n);
    expect(convertMinor(1n, 0, "1.005", 2)).toBe(101n);
    expect(convertMinor(-1n, 0, "1.005", 2)).toBe(-101n);
  });
  it("clears the final carrying residue exactly after partial allocation", () => {
    const first = proportionalMinor(100n, 1n, 3n);
    const second = proportionalMinor(100n - first, 1n, 2n);
    const last = proportionalMinor(100n - first - second, 1n, 1n);
    expect(first + second + last).toBe(100n);
    expect(proportionalMinor(-100n, 1n, 3n)).toBe(-33n);
    expect(() => proportionalMinor(100n, 4n, 3n)).toThrow();
  });
});
