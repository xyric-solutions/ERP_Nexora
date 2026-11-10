import { describe, expect, it } from "vitest";
import { bankTransferLineInputSchema } from "../../packages/contracts/src/banking/index.js";

const line = {
  line_order: 1,
  document_date: "2026-11-06",
  from_bank_account_id: "usd-bank",
  to_bank_account_id: "pkr-bank",
  transfer_mode: "internal",
  source_amount: "1000.00",
};

describe("Bank Transfer conversion rate contract", () => {
  it.each([undefined, null, "280", "0.003571428571428571", "99999999999999999999.999999999999999999"])(
    "accepts the optional exact rate %s",
    (conversion_rate) => {
      expect(bankTransferLineInputSchema.safeParse({ ...line, conversion_rate }).success).toBe(true);
    },
  );
  it.each(["0", "0.000", "-1", "1e3", "Infinity", "0.1234567890123456789", "100000000000000000000", 280])(
    "rejects invalid rate %s",
    (conversion_rate) => {
      expect(bankTransferLineInputSchema.safeParse({ ...line, conversion_rate }).success).toBe(false);
    },
  );
});
