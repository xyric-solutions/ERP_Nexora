import { describe, expect, it } from "vitest";
import { formatAmountInput, groupAmount, normalizeAmount, parseAmount, toRawAmount } from "../../app/shared/model/amount-format.js";

describe("amount formatting", () => {
  it("groups thousands", () => {
    expect(formatAmountInput(1000)).toBe("1,000");
    expect(formatAmountInput(10000)).toBe("10,000");
    expect(formatAmountInput(100000)).toBe("100,000");
    expect(formatAmountInput(1000000)).toBe("1,000,000");
    expect(formatAmountInput(999)).toBe("999");
    expect(formatAmountInput(1234567.5)).toBe("1,234,567.5");
    expect(formatAmountInput("")).toBe("");
    expect(formatAmountInput(null)).toBe("");
  });

  it("normalizes typed and pasted text", () => {
    expect(normalizeAmount("1,000,000")).toBe("1000000");
    expect(normalizeAmount("PKR 12,500.756")).toBe("12500.75");
    expect(normalizeAmount("1.2.3")).toBe("1.23");
    expect(normalizeAmount("007")).toBe("7");
    expect(normalizeAmount(".5")).toBe("0.5");
    expect(normalizeAmount("100.")).toBe("100.");
    expect(normalizeAmount("12.5", { decimals: 0 })).toBe("125");
    expect(normalizeAmount("-50")).toBe("50");
    expect(normalizeAmount("-50", { allowNegative: true })).toBe("-50");
    expect(normalizeAmount("1.123456", { decimals: 6 })).toBe("1.123456");
  });

  it("keeps partial input while typing", () => {
    expect(groupAmount("1000.")).toBe("1,000.");
    expect(groupAmount("-1234")).toBe("-1,234");
  });

  it("parses raw and grouped values", () => {
    expect(parseAmount("1,000,000.25")).toBe(1000000.25);
    expect(parseAmount("")).toBe(0);
    expect(parseAmount("-")).toBe(0);
    expect(parseAmount(42)).toBe(42);
  });

  it("avoids float noise and exponents from numeric state", () => {
    expect(toRawAmount(0.1 + 0.2)).toBe("0.3");
    expect(toRawAmount(1e15)).toBe("1000000000000000");
    expect(toRawAmount(-25.5)).toBe("-25.5");
  });
});
