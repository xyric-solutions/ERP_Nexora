import { describe, expect, it } from "vitest";

import {
  adoptCurrencyRequestSchema,
  changeFinanceNominalStatusRequestSchema,
  correctCurrencyRateRequestSchema,
  createCurrencyRateRequestSchema,
  createFinanceNominalRequestSchema,
  decideFinanceNominalRequestSchema,
  financeNominalDirectoryQuerySchema,
  financeNominalOptionsQuerySchema,
  financeNominalOptionsSchema,
  financeNominalSummarySchema,
  submitFinanceNominalRequestSchema,
  upsertTransferFxPolicyRequestSchema,
  updateFinanceNominalRequestSchema,
} from "../../packages/contracts/src/finance/index.js";

const draft = {
  company_id: "company-a",
  category_id: "current-assets",
  section_id: "cash-bank",
  name: "Operating USD",
  currency: "USD",
  description: "Day-to-day operating account",
};

describe("Finance Nominal contracts", () => {
  it("accepts the approved minimal form without external bank identifiers", () => {
    expect(createFinanceNominalRequestSchema.parse(draft)).toEqual(draft);
    expect(createFinanceNominalRequestSchema.parse({ ...draft, name: "  Payroll USD  " }).name).toBe("Payroll USD");
    expect(createFinanceNominalRequestSchema.safeParse({ ...draft, description: undefined }).success).toBe(true);
  });

  it.each([
    ["tenant_id", "outside-tenant"],
    ["code", "110201"],
    ["state", "active"],
    ["account_type", "asset"],
    ["manual_posting_allowed", true],
    ["reconciliation_required", true],
    ["approved_by", "maker"],
    ["bank_account_id", "browser-supplied"],
    ["account_number", "12345678"],
    ["bank_name", "Unnecessary bank master"],
    ["opening_balance", "100.00"],
  ])("rejects browser-supplied %s authority or legacy identity", (key, value) => {
    expect(createFinanceNominalRequestSchema.safeParse({ ...draft, [key]: value }).success).toBe(false);
  });

  it.each([
    { name: " " },
    { name: "x".repeat(161) },
    { currency: "usd" },
    { currency: "USDD" },
    { category_id: "" },
    { section_id: "" },
    { description: "x".repeat(2_001) },
  ])("bounds and validates nominal business fields: %j", (invalid) => {
    expect(createFinanceNominalRequestSchema.safeParse({ ...draft, ...invalid }).success).toBe(false);
  });

  it("requires versioned draft changes and forbids code or hierarchy reassignment", () => {
    expect(updateFinanceNominalRequestSchema.safeParse({ name: "Payroll" }).success).toBe(false);
    expect(updateFinanceNominalRequestSchema.safeParse({ expected_version: 1 }).success).toBe(false);
    expect(updateFinanceNominalRequestSchema.safeParse({ expected_version: 1, description: null }).success).toBe(true);
    expect(updateFinanceNominalRequestSchema.safeParse({ expected_version: 1, name: "Payroll" }).success).toBe(true);
    for (const key of ["code", "category_id", "section_id", "company_id"]) {
      expect(updateFinanceNominalRequestSchema.safeParse({ expected_version: 1, [key]: "changed" }).success).toBe(
        false,
      );
    }
  });

  it("requires meaningful reasons and positive versions for governed transitions", () => {
    for (const expected_version of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
      expect(
        submitFinanceNominalRequestSchema.safeParse({ expected_version, reason: "Ready for review" }).success,
      ).toBe(false);
    }
    expect(submitFinanceNominalRequestSchema.safeParse({ expected_version: 1, reason: " " }).success).toBe(false);
    expect(decideFinanceNominalRequestSchema.safeParse({ expected_version: 2, action: "approve" }).success).toBe(true);
    expect(decideFinanceNominalRequestSchema.safeParse({ expected_version: 2, action: "reject" }).success).toBe(false);
    expect(
      decideFinanceNominalRequestSchema.safeParse({ expected_version: 2, action: "approve", reason: "Verified" })
        .success,
    ).toBe(true);
    expect(
      changeFinanceNominalStatusRequestSchema.safeParse({ expected_version: 3, action: "delete", reason: "Delete" })
        .success,
    ).toBe(false);
    expect(
      changeFinanceNominalStatusRequestSchema.safeParse({
        expected_version: 3,
        action: "deactivate",
        reason: "No longer used",
      }).success,
    ).toBe(true);
  });

  it("bounds directory input and supports company discovery through Finance options", () => {
    expect(financeNominalDirectoryQuerySchema.parse({ company_id: "company-a" })).toMatchObject({
      limit: 50,
      sort_by: "code",
      sort_direction: "asc",
    });
    expect(financeNominalOptionsQuerySchema.parse({})).toEqual({});
    for (const invalid of [
      { limit: 101 },
      { search: "x".repeat(161) },
      { cursor: "x".repeat(513) },
      { sort_by: "sql" },
    ]) {
      expect(financeNominalDirectoryQuerySchema.safeParse({ company_id: "company-a", ...invalid }).success).toBe(false);
    }
    expect(financeNominalDirectoryQuerySchema.safeParse({}).success).toBe(false);
    expect(
      financeNominalOptionsSchema.safeParse({
        companies: [{ id: "company-a", code: "A", name: "Company A" }],
        selected_company_id: null,
        categories: [],
        sections: [],
        currencies: [],
        setup: { cash_and_bank_configured: false, code_policy_configured: false },
      }).success,
    ).toBe(true);
  });

  it("represents both read-only Finance nominals and nominal-only Banking identity without fabricated bank details", () => {
    const nominal = {
      id: "nominal-1",
      company_id: "company-a",
      code: "110201",
      name: "Operating USD",
      description: null,
      type: "asset",
      account_status: "inactive",
      is_header: false,
      category: { id: "current-assets", code: "11", name: "Current Assets" },
      section: { id: "cash-bank", code: "1102", name: "Cash & Bank" },
      currency: "USD",
      bank_account_id: "bank-1",
      identity_mode: "nominal_only",
      state: "draft",
      version: 1,
      banking_available: false,
    };
    expect(financeNominalSummarySchema.parse(nominal)).toEqual(nominal);
    expect(financeNominalSummarySchema.safeParse({ ...nominal, account_number: "secret" }).success).toBe(false);
    expect(
      financeNominalSummarySchema.safeParse({
        ...nominal,
        category: null,
        section: null,
        currency: null,
        bank_account_id: null,
        identity_mode: null,
        state: null,
        version: null,
      }).success,
    ).toBe(true);
  });

  it("adopts only canonical catalog currencies and accepts governed effective-dated rates", () => {
    expect(adoptCurrencyRequestSchema.parse({ code: "USD" })).toEqual({ code: "USD" });
    expect(adoptCurrencyRequestSchema.safeParse({ code: "usd" }).success).toBe(false);
    expect(
      createCurrencyRateRequestSchema.parse({
        source_currency: "EUR",
        rate: "305.800000000000000000",
        effective_date: "2026-10-22",
      }),
    ).toEqual({ source_currency: "EUR", rate: "305.800000000000000000", effective_date: "2026-10-22" });
    expect(correctCurrencyRateRequestSchema.safeParse({ expected_version: 1, rate: "0", reason: "Bad quote" }).success)
      .toBe(false);
  });

  it("requires a complete version-aware Transfer FX policy", () => {
    const policy = {
      company_id: "company-1",
      fx_gain_nominal_id: "fx-gain",
      fx_loss_nominal_id: "fx-loss",
      rounding_nominal_id: "rounding",
      bank_charge_nominal_id: "bank-charge",
      rounding_tolerance: "0.01",
      reason: "Initial governed policy",
    };
    expect(upsertTransferFxPolicyRequestSchema.parse(policy)).toEqual(policy);
    expect(upsertTransferFxPolicyRequestSchema.safeParse({ ...policy, rounding_tolerance: "-0.01" }).success).toBe(
      false,
    );
    expect(upsertTransferFxPolicyRequestSchema.safeParse({ ...policy, reason: " " }).success).toBe(false);
  });
});
