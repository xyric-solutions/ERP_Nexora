import { describe, expect, it } from "vitest";

import {
  buildReconciliationMatches,
  calculateManualReconciliationBalances,
  calculateReconciliationBalances,
  ledgerPopulationHash,
  normalizeMatchReference,
} from "../../server/api/src/modules/banking/reconciliations/matching.js";

const statement = (id: string, reference: string, amount = "100.00000000", date = "2026-10-22") => ({
  id,
  transactionDate: date,
  direction: "money_in" as const,
  amount,
  currency: "USD",
  reference,
  details: "Customer receipt",
});

const ledger = (id: string, reference: string, amount = "100.00000000", date = "2026-10-22") => ({
  journalLineId: id,
  journalId: `journal-${id}`,
  postingDate: date,
  direction: "money_in" as const,
  amount,
  currency: "USD",
  reference,
  narrative: "Customer receipt",
});

describe("Bank Reconciliation deterministic matching", () => {
  it("normalizes references and confirms only a unique reciprocal exact match", () => {
    expect(normalizeMatchReference("  INV-001 / ab  ")).toBe("inv001ab");
    const result = buildReconciliationMatches(
      [statement("statement-a", "INV-001"), statement("statement-b", "INV-002")],
      [ledger("ledger-a", "inv 001"), ledger("ledger-b", "different")],
    );

    expect(result.confirmed).toEqual([
      expect.objectContaining({
        statementLineId: "statement-a",
        journalLineId: "ledger-a",
        matchType: "exact",
        state: "confirmed",
        confidenceScore: 1,
      }),
    ]);
    expect(result.confirmed).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ statementLineId: "statement-b" })]),
    );
  });

  it("does not auto-confirm ambiguous exact candidates and returns explainable suggestions", () => {
    const result = buildReconciliationMatches(
      [statement("statement-a", "INV-001")],
      [ledger("ledger-a", "INV-001"), ledger("ledger-b", "INV-001", "100.00000000", "2026-10-23")],
    );

    expect(result.confirmed).toEqual([]);
    expect(result.suggestions).toHaveLength(2);
    expect(result.suggestions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          statementLineId: "statement-a",
          matchType: "suggested",
          state: "proposed",
          reasonCodes: expect.arrayContaining(["AMOUNT_DIRECTION_EXACT", "REFERENCE_EXACT", "DATE_WITHIN_3_DAYS"]),
        }),
      ]),
    );
  });

  it("calculates the approved outstanding-item formula with fixed-point arithmetic", () => {
    const balances = calculateReconciliationBalances({
      currency: "USD",
      currencyDecimals: 2,
      openingStatementBalance: "1000.00000000",
      closingStatementBalance: "1175.00000000",
      ledgerBalanceAtCutoff: "1200.00000000",
      statementLines: [
        statement("statement-in", "IN", "200.00000000"),
        { ...statement("statement-out", "OUT", "25.00000000"), direction: "money_out" as const },
      ],
      ledgerCandidates: [
        { ...ledger("ledger-in", "IN", "200.00000000"), matched: true },
        { ...ledger("ledger-outstanding", "OLD", "25.00000000"), matched: false },
      ],
      confirmedStatementLineIds: new Set(["statement-in", "statement-out"]),
      adjustmentCount: 0,
    });

    expect(balances).toEqual({
      currency: "USD",
      opening_statement_balance: "1000.00000000",
      statement_money_in: "200.00000000",
      statement_money_out: "25.00000000",
      reconstructed_statement_balance: "1175.00000000",
      closing_statement_balance: "1175.00000000",
      ledger_balance_at_cutoff: "1200.00000000",
      unmatched_ledger_money_in: "25.00000000",
      unmatched_ledger_money_out: "0.00000000",
      adjusted_ledger_balance: "1175.00000000",
      difference: "0.00000000",
      matched_count: 2,
      unmatched_statement_count: 0,
      unmatched_ledger_count: 1,
      adjustment_count: 0,
    });
  });

  it("hashes a ledger population independently of input ordering", () => {
    const original = [ledger("ledger-b", "B"), ledger("ledger-a", "A")];
    const originalHash = ledgerPopulationHash(original);
    expect(originalHash).toBe(ledgerPopulationHash([...original].reverse()));
    expect(ledgerPopulationHash([...original, ledger("ledger-c", "C")])).not.toBe(originalHash);
    expect(ledgerPopulationHash([{ ...original[0]!, amount: "100.01000000" }, original[1]!])).not.toBe(originalHash);
  });

  it("calculates manual ticks from selected ledger evidence using fixed-point arithmetic", () => {
    const balances = calculateManualReconciliationBalances({
      currency: "USD",
      currencyDecimals: 2,
      openingStatementBalance: "1000.00000000",
      closingStatementBalance: "1125.00000000",
      ledgerBalanceAtCutoff: "1175.00000000",
      ledgerCandidates: [
        { ...ledger("receipt-selected", "RCPT-1", "200.00000000"), selected: true },
        {
          ...ledger("payment-selected", "PAY-1", "75.00000000"),
          direction: "money_out" as const,
          selected: true,
        },
        { ...ledger("receipt-open", "RCPT-2", "50.00000000"), selected: false },
      ],
    });

    expect(balances.available_ledger_money_in).toBe("250.00000000");
    expect(balances.available_ledger_money_out).toBe("75.00000000");
    expect(balances.selected_ledger_money_in).toBe("200.00000000");
    expect(balances.selected_ledger_money_out).toBe("75.00000000");
    expect(balances.calculated_selected_balance).toBe("1125.00000000");
    expect(balances.difference).toBe("0.00000000");
    expect(balances.matched_count).toBe(2);
    expect(balances.unmatched_ledger_count).toBe(1);
  });
});
