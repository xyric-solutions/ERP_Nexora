import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { buildOpenApiDocument } from "../../packages/contracts/src/openapi-c4.js";

describe("Company currency and Bank Revaluation API contract", () => {
  it("documents the approved company-currency operations", () => {
    const paths = buildOpenApiDocument().paths;

    expect(paths["/master-data/countries"].get.operationId).toBe("listCountryCurrencies");
    expect(paths["/finance/companies/{companyId}/currency-profile"].get.operationId).toBe("getCompanyCurrencyProfile");
    expect(paths["/finance/companies/{companyId}/currency-profile"].post.operationId).toBe(
      "configureCompanyCurrencyProfile",
    );
    expect(paths["/finance/company-currencies"].get.operationId).toBe("listCompanyCurrencies");
    expect(paths["/finance/company-currencies"].post.operationId).toBe("activateCompanyCurrency");
    expect(paths["/finance/company-currencies/{currencyCode}/status"].patch.operationId).toBe(
      "changeCompanyCurrencyStatus",
    );
    expect(paths["/finance/company-currency-rates"].get.operationId).toBe("listCompanyCurrencyRates");
    expect(paths["/finance/company-currency-rates"].post.operationId).toBe("createCompanyCurrencyRate");
    expect(paths["/finance/company-currency-rates/{rateId}/corrections"].post.operationId).toBe(
      "correctCompanyCurrencyRate",
    );
    expect(paths["/finance/company-currency-rates/{rateId}/status"].patch.operationId).toBe(
      "changeCompanyCurrencyRateStatus",
    );
  });

  it("documents the complete authenticated Bank Revaluation lifecycle", () => {
    const paths = buildOpenApiDocument().paths;
    const operations = [
      ["/banking/revaluation-policy", "get", "getBankRevaluationPolicy"],
      ["/banking/revaluation-policy", "post", "upsertBankRevaluationPolicy"],
      ["/banking/revaluations", "get", "listBankRevaluations"],
      ["/banking/revaluations", "post", "createBankRevaluation"],
      ["/banking/revaluations/approvers", "get", "listBankRevaluationApprovers"],
      ["/banking/revaluations/preview", "post", "previewBankRevaluation"],
      ["/banking/revaluations/{revaluationId}", "get", "getBankRevaluation"],
      ["/banking/revaluations/{revaluationId}", "patch", "updateBankRevaluation"],
      ["/banking/revaluations/{revaluationId}/submit", "post", "submitBankRevaluation"],
      ["/banking/revaluations/{revaluationId}/approve", "post", "approveBankRevaluation"],
      ["/banking/revaluations/{revaluationId}/reject", "post", "rejectBankRevaluation"],
      ["/banking/revaluations/{revaluationId}/post", "post", "postBankRevaluation"],
      ["/banking/revaluations/{revaluationId}/reverse", "post", "reverseBankRevaluation"],
      ["/banking/revaluations/{revaluationId}/events", "get", "listBankRevaluationEvents"],
    ] as const;

    for (const [path, method, operationId] of operations) {
      const operation = paths[path][method];
      expect(operation.operationId).toBe(operationId);
      expect(operation.security).toEqual([{ cookieAuth: [] }]);
    }
  });

  it("requires mutation protections and keeps calculated values response-only", () => {
    const paths = buildOpenApiDocument().paths;
    const update = paths["/banking/revaluations/{revaluationId}"].patch;
    expect(update.parameters.map((parameter) => parameter.name)).toEqual([
      "revaluationId",
      "x-csrf-token",
      "idempotency-key",
      "if-match",
    ]);

    const previewSchema = paths["/banking/revaluations/preview"].post.requestBody.content["application/json"]
      .schema as { properties?: Record<string, unknown>; additionalProperties?: boolean };
    expect(previewSchema.additionalProperties).toBe(false);
    expect(Object.keys(previewSchema.properties ?? {})).toEqual(["company_id", "currency", "revaluation_date"]);
    expect(previewSchema.properties).not.toHaveProperty("closing_rate");
    expect(previewSchema.properties).not.toHaveProperty("foreign_balance");
    expect(previewSchema.properties).not.toHaveProperty("policy_snapshot");
  });

  it("emits the approved generated-client methods", async () => {
    const source = await readFile(new URL("../../app/lib/api/generated.ts", import.meta.url), "utf8");
    for (const method of [
      "listCountryCurrencies",
      "getCompanyCurrencyProfile",
      "configureCompanyCurrencyProfile",
      "activateCompanyCurrency",
      "createCompanyCurrencyRate",
      "correctCompanyCurrencyRate",
      "changeCompanyCurrencyRateStatus",
      "listBankRevaluations",
      "listBankRevaluationApprovers",
      "getBankRevaluationPolicy",
      "upsertBankRevaluationPolicy",
      "previewBankRevaluation",
      "createBankRevaluation",
      "updateBankRevaluation",
      "submitBankRevaluation",
      "approveBankRevaluation",
      "rejectBankRevaluation",
      "postBankRevaluation",
      "reverseBankRevaluation",
      "listBankRevaluationEvents",
    ]) {
      expect(source).toContain(`${method}(`);
    }
  });
});
