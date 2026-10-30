import { describe, expect, it } from "vitest";
import {
  formatJournalAmount,
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
