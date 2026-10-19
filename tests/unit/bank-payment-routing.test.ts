import { describe, expect, it } from "vitest";

import { isPersistedBankPaymentId } from "../../app/features/banking/model/bank-payment-routing.js";

describe("Bank Payment route discrimination", () => {
  it("accepts only persisted Bank Payment identifiers", () => {
    expect(isPersistedBankPaymentId("bank-payment-123e4567-e89b-42d3-a456-426614174000")).toBe(true);
    expect(isPersistedBankPaymentId("bank-payment-123e4567-e89b-02d3-a456-426614174000")).toBe(false);
    expect(isPersistedBankPaymentId("bank-payment-123e4567-e89b-42d3-7456-426614174000")).toBe(false);
  });

  it.each(["PAY-2026-0418", "REC-2026-0157", "TRF-2026-0081", "CHQ-2026-0042", "bank-payment-not-a-uuid", undefined])(
    "keeps legacy transaction reference %s on the prototype detail route",
    (reference) => {
      expect(isPersistedBankPaymentId(reference)).toBe(false);
    },
  );
});
