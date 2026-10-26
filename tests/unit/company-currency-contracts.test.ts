import { describe, expect, it } from "vitest";

import * as contracts from "@nexora/contracts";

describe("Company multi-currency contracts", () => {
  it("exports the approved company currency and country-directory surface", () => {
    for (const name of [
      "countryCurrencyDirectoryQuerySchema",
      "countryCurrencyDirectorySchema",
      "companyCurrencyProfileSchema",
      "companyCurrencyDirectoryQuerySchema",
      "companyCurrencyDirectorySchema",
      "activateCompanyCurrencyRequestSchema",
      "changeCompanyCurrencyStatusRequestSchema",
      "companyCurrencyRateDirectoryQuerySchema",
      "companyCurrencyRateDirectorySchema",
      "createCompanyCurrencyRateRequestSchema",
      "correctCompanyCurrencyRateRequestSchema",
    ]) {
      expect(contracts, `${name} must be exported from @nexora/contracts`).toHaveProperty(name);
    }
  });

  it("exports the complete governed Bank Revaluation contract surface", () => {
    for (const name of [
      "bankRevaluationStateSchema",
      "bankRevaluationPolicySchema",
      "upsertBankRevaluationPolicyRequestSchema",
      "bankRevaluationPolicyMutationSchema",
      "bankRevaluationDirectoryQuerySchema",
      "bankRevaluationDirectorySchema",
      "bankRevaluationPreviewRequestSchema",
      "bankRevaluationPreviewSchema",
      "bankRevaluationDetailSchema",
      "createBankRevaluationRequestSchema",
      "updateBankRevaluationRequestSchema",
      "submitBankRevaluationRequestSchema",
      "decideBankRevaluationRequestSchema",
      "postBankRevaluationRequestSchema",
      "reverseBankRevaluationRequestSchema",
      "bankRevaluationEventDirectorySchema",
      "bankRevaluationEventDirectoryQuerySchema",
    ]) {
      expect(contracts, `${name} must be exported from @nexora/contracts`).toHaveProperty(name);
    }
  });

  it("bounds country search and preserves country-to-currency mappings", () => {
    const query = contracts.countryCurrencyDirectoryQuerySchema.parse({ search: "United", limit: "25" });
    expect(query).toEqual({ search: "United", limit: 25 });
    expect(
      contracts.countryCurrencyDirectoryQuerySchema.safeParse({ search: "x".repeat(101), limit: 101 }).success,
    ).toBe(false);

    const directory = contracts.countryCurrencyDirectorySchema.parse({
      items: [
        {
          country_code: "US",
          country_name: "United States",
          currency_code: "USD",
          currency_name: "US Dollar",
          currency_symbol: "$",
          decimal_places: 2,
          is_primary: true,
          status: "active",
        },
      ],
      next_cursor: null,
    });
    expect(directory.items[0]).toMatchObject({ country_code: "US", currency_code: "USD", is_primary: true });
  });

  it("uses one-FX-to-base direction and rejects protected company-currency fields", () => {
    const request = contracts.activateCompanyCurrencyRequestSchema.parse({
      company_id: "company-1",
      country_code: "US",
      currency_code: "USD",
      rate: "275.125",
      effective_date: "2026-10-26",
    });
    expect(request.rate).toBe("275.125");
    expect(
      contracts.activateCompanyCurrencyRequestSchema.safeParse({
        ...request,
        base_currency: "PKR",
        created_by: "browser-user",
      }).success,
    ).toBe(false);
    expect(contracts.activateCompanyCurrencyRequestSchema.safeParse({ ...request, rate: "0" }).success).toBe(false);
  });

  it("validates company-scoped rate requests as strict decimal-string inputs", () => {
    expect(
      contracts.createCompanyCurrencyRateRequestSchema.parse({
        company_id: "company-1",
        source_currency: "AED",
        rate: "76.25000000",
        effective_date: "2026-10-26",
      }),
    ).toMatchObject({ source_currency: "AED", rate: "76.25000000" });
    expect(
      contracts.correctCompanyCurrencyRateRequestSchema.safeParse({
        expected_version: 2,
        rate: 77,
        reason: "Corrected closing rate",
      }).success,
    ).toBe(false);
  });

  it("bounds revaluation filters and validates date order", () => {
    expect(contracts.bankRevaluationDirectoryQuerySchema.parse({ company_id: "company-1", limit: "50" })).toMatchObject(
      { company_id: "company-1", limit: 50 },
    );
    expect(
      contracts.bankRevaluationDirectoryQuerySchema.safeParse({
        company_id: "company-1",
        date_from: "2026-10-27",
        date_to: "2026-10-26",
      }).success,
    ).toBe(false);
    expect(
      contracts.bankRevaluationDirectoryQuerySchema.safeParse({
        company_id: "company-1",
        search: "x".repeat(161),
      }).success,
    ).toBe(false);
  });

  it("accepts only server-derived revaluation previews", () => {
    const request = {
      company_id: "company-1",
      currency: "USD",
      revaluation_date: "2026-10-26",
    };
    expect(contracts.bankRevaluationPreviewRequestSchema.parse(request)).toEqual(request);
    expect(
      contracts.bankRevaluationPreviewRequestSchema.safeParse({
        ...request,
        closing_rate: "275",
        foreign_balance: "1000",
        gain_nominal_id: "user-controlled",
      }).success,
    ).toBe(false);
  });

  it("requires an independent decision shape and a reason for rejection", () => {
    expect(contracts.decideBankRevaluationRequestSchema.parse({ expected_version: 3, action: "approve" })).toEqual({
      expected_version: 3,
      action: "approve",
    });
    expect(
      contracts.decideBankRevaluationRequestSchema.safeParse({ expected_version: 3, action: "reject" }).success,
    ).toBe(false);
    expect(
      contracts.decideBankRevaluationRequestSchema.parse({
        expected_version: 3,
        action: "reject",
        reason: "Rate evidence needs review",
      }),
    ).toMatchObject({ action: "reject" });
  });

  it("validates a versioned policy with distinct gain and loss nominals", () => {
    const policy = {
      company_id: "company-1",
      expected_version: 2,
      unrealized_gain_nominal_id: "gain-1",
      unrealized_loss_nominal_id: "loss-1",
      status: "active" as const,
      reason: "Update unrealized FX accounts",
    };
    expect(contracts.upsertBankRevaluationPolicyRequestSchema.parse(policy)).toEqual(policy);
    expect(
      contracts.upsertBankRevaluationPolicyRequestSchema.safeParse({
        ...policy,
        unrealized_loss_nominal_id: policy.unrealized_gain_nominal_id,
      }).success,
    ).toBe(false);
  });
});
