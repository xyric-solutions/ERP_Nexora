import { describe, expect, it } from "vitest";
import {
  displayTransferTotal,
  estimateFxTransferAmount,
  reciprocalFxTransferRate,
  transferAmountUnits,
} from "../../app/features/banking/model/bank-transfer-entry.js";

describe("FX transfer preview", () => {
  it.each([
    ["1", "280", "280.00"],
    ["1000", "280.125", "280125.00"],
    ["100", "0.923456789012345678", "92.35"],
    ["0.01", "0.5", "0.01"],
    ["1", "0.999999999999999999", "1.00"],
    ["999999999999999999999999999999.99999999", "1", "1000000000000000000000000000000.00"],
  ])("estimates %s × %s as %s without floating-point arithmetic", (amount, rate, expected) => {
    expect(estimateFxTransferAmount(amount, rate)).toBe(expected);
  });

  it.each([
    ["", "280"],
    ["100", ""],
    ["0", "280"],
    ["-1", "280"],
    ["1e3", "280"],
    ["1", "0"],
    ["1", "-1"],
    ["1", "1e3"],
    ["1", "0.1234567890123456789"],
    ["1.123456789", "280"],
  ])("does not invent a receiving estimate for invalid or unavailable input: %s × %s", (amount, rate) => {
    expect(estimateFxTransferAmount(amount, rate)).toBeNull();
  });

  it("calculates the inverse direction independently of display rounding", () => {
    expect(reciprocalFxTransferRate("280")).toBe("0.003571428571428571");
    expect(reciprocalFxTransferRate("0.5")).toBe("2.000000000000000000");
    expect(reciprocalFxTransferRate("0")).toBeNull();
  });

  it("sums source amounts exactly before rounding the total", () => {
    const sum = (transferAmountUnits("0.004") ?? 0n) + (transferAmountUnits("0.004") ?? 0n);
    expect(displayTransferTotal(sum)).toBe("0.01");
    expect(displayTransferTotal(0n)).toBe("0.00");
    expect(displayTransferTotal(900719925474099300400000n)).toBe("9,007,199,254,740,993.00");
    expect(transferAmountUnits("1.123456789")).toBeNull();
  });
});
