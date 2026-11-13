import { describe, expect, it } from "vitest";
import { subledgerOperationInputSchema, subledgerQuerySchema } from "../../packages/contracts/src/finance/subledger.js";
import { buildOpenApiDocument } from "../../packages/contracts/src/openapi-c4.js";

describe("persistent currency accounting API", () => {
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
