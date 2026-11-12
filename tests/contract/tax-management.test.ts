import { describe, it, expect } from "vitest";
import { buildOpenApiDocument } from "../../packages/contracts/src/openapi-c4.js";
import { taxInputSchema, taxQuerySchema } from "../../packages/contracts/src/finance/taxes.js";
describe("tax management API contract", () => {
  it("documents authenticated persistent CRUD, options and versioned status actions", () => {
    const paths = buildOpenApiDocument().paths;
    expect(paths["/finance/taxes"].post.operationId).toBe("createTax");
    expect(paths["/finance/taxes/options"].get.security).toEqual([{ cookieAuth: [] }]);
    expect(paths["/finance/taxes/{id}"].patch.parameters).toEqual(
      expect.arrayContaining(
        ["if-match", "x-csrf-token", "idempotency-key"].map((name) =>
          expect.objectContaining({ name, required: true }),
        ),
      ),
    );
    expect(paths["/finance/taxes/{id}/status"].post.operationId).toBe("changeTaxStatus");
  });
  it("rejects rate overprecision, numbers and unbounded queries", () => {
    const input = {
      company_id: "company",
      name: "WHT",
      tax_type: "WHT",
      rate: "5.50",
      module: "purchases",
      treatment: "withholding",
      trigger: "settlement",
      account_id: "nominal",
      effective_date: "2026-11-12",
      reason: "Contract check",
    };
    expect(taxInputSchema.safeParse(input).success).toBe(true);
    for (const rate of [5.5, "5.555", "-1", "100.01", "NaN"])
      expect(taxInputSchema.safeParse({ ...input, rate }).success).toBe(false);
    expect(taxQuerySchema.safeParse({ company_id: "company", limit: 101 }).success).toBe(false);
  });
});
