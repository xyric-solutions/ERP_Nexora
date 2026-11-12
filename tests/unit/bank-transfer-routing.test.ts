import { describe, expect, it } from "vitest";

import {
  bankTransferEntryKind,
  isPersistedBankTransferId,
} from "../../app/features/banking/model/bank-transfer-routing.js";

describe("Bank Transfer route discrimination", () => {
  it("recognizes creation choices without treating them as persisted records", () => {
    for (const kind of ["transfer", "fx"] as const) {
      expect(bankTransferEntryKind(kind)).toBe(kind);
      expect(isPersistedBankTransferId(kind)).toBe(false);
    }
    expect(bankTransferEntryKind(undefined)).toBeUndefined();
    expect(bankTransferEntryKind("bank-transfer-123e4567-e89b-42d3-a456-426614174000")).toBeUndefined();
  });
  it("accepts only persisted Bank Transfer identifiers", () => {
    expect(isPersistedBankTransferId("bank-transfer-123e4567-e89b-42d3-a456-426614174000")).toBe(true);
    expect(isPersistedBankTransferId("bank-transfer-123e4567-e89b-02d3-a456-426614174000")).toBe(false);
    expect(isPersistedBankTransferId("bank-transfer-not-a-uuid")).toBe(false);
  });

  it.each([
    "TRF-2026-0088",
    "bank-payment-123e4567-e89b-42d3-a456-426614174000",
    "bank-receipt-123e4567-e89b-42d3-a456-426614174000",
    undefined,
  ])("keeps non-transfer identity %s outside the persisted Transfer route", (reference) => {
    expect(isPersistedBankTransferId(reference)).toBe(false);
  });
});
