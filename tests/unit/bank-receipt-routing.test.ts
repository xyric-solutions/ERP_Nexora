import { describe, expect, it } from "vitest";

import { isPersistedBankReceiptId } from "../../app/features/banking/model/bank-receipt-routing.js";

describe("Bank Receipt route discrimination", () => {
  it("accepts only persisted Bank Receipt identifiers", () => {
    expect(isPersistedBankReceiptId("bank-receipt-123e4567-e89b-42d3-a456-426614174000")).toBe(true);
    expect(isPersistedBankReceiptId("bank-receipt-123e4567-e89b-02d3-a456-426614174000")).toBe(false);
    expect(isPersistedBankReceiptId("bank-receipt-123e4567-e89b-42d3-7456-426614174000")).toBe(false);
  });

  it.each([
    "REC-2026-0157",
    "PAY-2026-0418",
    "TRF-2026-0081",
    "bank-payment-123e4567-e89b-42d3-a456-426614174000",
    "bank-receipt-not-a-uuid",
    undefined,
  ])("keeps non-receipt transaction identity %s outside the persisted Receipt route", (reference) => {
    expect(isPersistedBankReceiptId(reference)).toBe(false);
  });
});
