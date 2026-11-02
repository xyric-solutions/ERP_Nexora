import { describe, expect, it } from "vitest";
import {
  formatJournalAmount,
  formatJournalDisplayAmount,
  parseJournalAmount,
  validateJournalLines,
} from "../../app/features/finance/lib/finance-journal-form.js";

const line = (debit: string, credit: string, account = "nominal-1") => ({
  account_id: account,
  description: "Journal line",
  debit,
  credit,
  dimensions: {},
});

describe("Finance Journal form validation", () => {
  it("formats database amounts at the chosen display precision without losing large-number accuracy", () => {
    expect(formatJournalDisplayAmount("100000.00000000")).toBe("100,000.00");
    expect(formatJournalDisplayAmount("0.00000000")).toBe("0.00");
    expect(formatJournalDisplayAmount("1.23500000", 2)).toBe("1.24");
    expect(formatJournalDisplayAmount("999.99500000", 2)).toBe("1,000.00");
    expect(formatJournalDisplayAmount("100000.12", 0)).toBe("100,000");
    expect(formatJournalDisplayAmount("100000.12", 4)).toBe("100,000.1200");
    expect(formatJournalDisplayAmount("9007199254740993.01", 2)).toBe("9,007,199,254,740,993.01");
    expect(formatJournalDisplayAmount("0.00000001", 8)).toBe("0.00000001");
  });

  it("balances base-currency amounts using exact scaled integers", () => {
    const result = validateJournalLines([line("0.10", "0"), line("0.20", "0"), line("0", "0.30")], 2);
    expect(result.errors).toEqual([]);
    expect(formatJournalAmount(result.debit, 2)).toBe("0.30");
    expect(formatJournalAmount(result.credit, 2)).toBe("0.30");
  });

  it("accepts database-padded zeroes but rejects non-zero precision beyond the base scale", () => {
    expect(parseJournalAmount("125.00000000", 2)).toBe(12_500n);
    expect(parseJournalAmount("125.00100000", 2)).toBeNull();
  });

  it("rejects incomplete, two-sided and unbalanced lines", () => {
    const result = validateJournalLines([{ ...line("10", "1", ""), description: "" }, line("0", "8")], 2);
    expect(result.errors).toContain("Line 1: select a nominal account.");
    expect(result.errors).toContain("Line 1: enter a description.");
    expect(result.errors).toContain("Line 1: enter one positive debit or credit amount.");
    expect(result.errors).toContain("Total debits and credits must be equal and greater than zero.");
  });
});
