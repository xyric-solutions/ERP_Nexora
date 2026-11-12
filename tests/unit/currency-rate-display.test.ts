import { describe, expect, it } from "vitest";
import { formatDecimalDisplay as formatCurrencyRate } from "../../app/shared/lib/decimal-display.js";

describe("currency rate display", () => {
  it.each([
    ["1", "1.00"],
    ["305.100000000000000000", "305.10"],
    ["0.003600000000000000", "0.00"],
    ["1.005000000000000000", "1.01"],
    ["9.999", "10.00"],
    ["99999999999999999999.995", "100000000000000000000.00"],
    ["12345678901234567890.124999999999999999", "12345678901234567890.12"],
  ])("displays %s as %s without floating-point conversion", (source, expected) => {
    expect(formatCurrencyRate(source)).toBe(expected);
  });

  it.each(["", "not a rate", "1e3"])("does not display malformed values as zero: %s", (source) => {
    expect(formatCurrencyRate(source)).toBe("—");
  });
});
