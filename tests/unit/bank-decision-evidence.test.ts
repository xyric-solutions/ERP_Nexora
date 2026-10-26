import { describe, expect, it } from "vitest";
import { bankDecisionEvidence } from "../../server/api/src/modules/banking/decision-evidence.js";
import { decideFinanceNominalRequestSchema } from "../../packages/contracts/src/finance/index.js";
import {
  decideBankAccountRequestSchema,
  decideBankPaymentRequestSchema,
  decideBankReceiptRequestSchema,
} from "../../packages/contracts/src/banking/index.js";

describe("Bank approval and rejection evidence", () => {
  for (const [label, schema] of [
    ["nominal", decideFinanceNominalRequestSchema],
    ["legacy Bank account", decideBankAccountRequestSchema],
    ["Payment", decideBankPaymentRequestSchema],
    ["Receipt", decideBankReceiptRequestSchema],
  ] as const) {
    it(`${label} permits reason-free approval but rejects missing or empty rejection reasons`, () => {
      expect(schema.safeParse({ action: "approve", expected_version: 1 }).success).toBe(true);
      expect(schema.safeParse({ action: "reject", expected_version: 1 }).success).toBe(false);
      expect(schema.safeParse({ action: "reject", expected_version: 1, reason: " " }).success).toBe(false);
      expect(schema.safeParse({ action: "reject", expected_version: 1, reason: "Incorrect account" }).success).toBe(
        true,
      );
    });
  }
  it("identifies automatic approval text without fabricating a user justification", () => {
    expect(bankDecisionEvidence({ action: "approve" }, "Bank account")).toMatchObject({
      source: "system_confirmation",
    });
    expect(bankDecisionEvidence({ action: "approve" }, "Bank account").reason).toContain(
      "No business reason was requested",
    );
    expect(
      bankDecisionEvidence({ action: "approve", reason: "Previously supplied rationale" }, "Bank account"),
    ).toEqual({ source: "user_entered", reason: "Previously supplied rationale" });
  });
  it("does not generate rejection reasons and enforces server-side bounds", () => {
    for (const reason of [undefined, "", " ", "No", "x".repeat(501)])
      expect(() => bankDecisionEvidence({ action: "reject", reason }, "Bank account")).toThrow();
    expect(bankDecisionEvidence({ action: "reject", reason: "  Duplicate account  " }, "Bank account")).toEqual({
      source: "user_entered",
      reason: "Duplicate account",
    });
  });
});
