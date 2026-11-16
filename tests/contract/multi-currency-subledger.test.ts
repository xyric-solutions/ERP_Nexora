import { describe, expect, it } from "vitest";
import {
  subledgerOperationInputSchema,
  subledgerOperationRequestSchema,
  subledgerQuerySchema,
} from "../../packages/contracts/src/finance/subledger.js";
import { savePurchaseInputSchema, savePurchaseRequestSchema } from "../../packages/contracts/src/procurement/index.js";
import { buildOpenApiDocument } from "../../packages/contracts/src/openapi-c4.js";

describe("persistent currency accounting API", () => {
  it("accepts bank-derived request currencies while keeping stored documents strict", () => {
    const settlement = {
      company_id: "company",
      type: "settlement",
      party_id: "customer",
      side: "receivable",
      bank_account_id: "bank",
      payment_amount: "100.00",
      date: "2026-11-13",
      reason: "Bank-derived receipt",
      allocations: [{ item_id: "invoice", amount: "100.00" }],
    };
    expect(subledgerOperationRequestSchema.safeParse(settlement).success).toBe(true);
    expect(subledgerOperationInputSchema.safeParse(settlement).success).toBe(false);
    expect(subledgerOperationRequestSchema.safeParse({ ...settlement, rate: "1" }).success).toBe(false);
    const advance = {
      company_id: "company",
      type: "recognition",
      party_id: "customer",
      side: "receivable",
      kind: "advance",
      bank_account_id: "bank",
      amount: "100",
      date: "2026-11-13",
      due_date: "2026-11-13",
      reason: "Bank-funded advance",
    };
    expect(subledgerOperationRequestSchema.safeParse(advance).success).toBe(true);
    expect(subledgerOperationRequestSchema.safeParse({ ...advance, kind: "invoice" }).success).toBe(false);
    const purchase = {
      company_id: "company",
      kind: "payment",
      supplier_id: "supplier",
      document_date: "2026-11-13",
      payment_details: {
        bank_account_id: "bank",
        entries: [
          { supplier_id: "supplier", amount: "100", mode: "bank_transfer", wht_rate: "0", additional_wht: "0" },
        ],
      },
    };
    expect(savePurchaseInputSchema.safeParse(purchase).success).toBe(true);
    expect(savePurchaseRequestSchema.safeParse(purchase).success).toBe(false);
    expect(savePurchaseInputSchema.safeParse({ ...purchase, payment_details: null }).success).toBe(false);
    expect(savePurchaseInputSchema.safeParse({ ...purchase, kind: "request" }).success).toBe(false);
  });
  it("documents authenticated workspace, report, party, policy, draft and lifecycle endpoints", () => {
    const paths = buildOpenApiDocument().paths;
    expect(paths["/finance/subledger/workspace"].get.operationId).toBe("getSubledgerWorkspace");
    expect(paths["/finance/subledger/reports"].get.operationId).toBe("getSubledgerReport");
    expect(paths["/finance/subledger/parties"].post.operationId).toBe("createSubledgerParty");
    expect(paths["/finance/subledger/policy"].post.operationId).toBe("configureSubledgerPolicy");
    const action = paths["/finance/subledger/operations/{operationId}/actions"].post;
    expect(action.security).toEqual([{ cookieAuth: [] }]);
    expect(action.parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "if-match", required: true }),
        expect.objectContaining({ name: "idempotency-key", required: true }),
        expect.objectContaining({ name: "x-csrf-token", required: true }),
      ]),
    );
  });
  it("rejects unbounded queries, invalid dates, float payloads and caller-supplied carrying values", () => {
    expect(() => subledgerQuerySchema.parse({ company_id: "a", as_of: "2026-02-30" })).toThrow();
    expect(() => subledgerQuerySchema.parse({ company_id: "a", as_of: "2026-11-12", limit: 101 })).toThrow();
    const base = {
      company_id: "a",
      type: "recognition",
      party_id: "p",
      side: "receivable",
      kind: "invoice",
      currency: "USD",
      amount: "1.234",
      date: "2026-11-12",
      due_date: "2026-11-30",
      reason: "Contract test",
    };
    expect(subledgerOperationInputSchema.parse(base).type).toBe("recognition");
    expect(() => subledgerOperationInputSchema.parse({ ...base, amount: 1.234 })).toThrow();
    expect(() => subledgerOperationInputSchema.parse({ ...base, carrying: "0" })).toThrow();
    expect(() => subledgerOperationInputSchema.parse({ ...base, amount: "NaN" })).toThrow();
  });
});
