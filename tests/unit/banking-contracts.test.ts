import { describe, expect, it } from "vitest";

import {
  bankAccountDirectoryQuerySchema,
  bankPaymentDetailSchema,
  bankPaymentDirectoryQuerySchema,
  bankPaymentMethodSchema,
  createBankPaymentRequestSchema,
  createBankAccountRequestSchema,
  decideBankPaymentRequestSchema,
  decideBankAccountRequestSchema,
  reverseBankPaymentRequestSchema,
  updateBankAccountRequestSchema,
  updateBankPaymentRequestSchema,
} from "@nexora/contracts";

const validCreate = {
  company_id: "company-1",
  account_name: "Operating PKR",
  account_type: "current",
  bank_name: "First Meridian Bank",
  branch: "Karachi Main",
  account_number: "001234567890",
  iban: "PK36SCBL0000001123456702",
  swift_bic: "SCBLPKKX",
  currency: "PKR",
  ledger_account_id: "account-bank-control",
  overdraft_limit: "0.00",
  opening_balance: "0",
} as const;

const validPaymentCreate = {
  company_id: "company-1",
  bank_account_id: "bank-account-1",
  posting_date: "2026-10-19",
  value_date: "2026-10-20",
  lines: [
    {
      line_order: 1,
      document_date: "2026-10-19",
      external_reference: "SUP-2026-001",
      document_reference: "INV-2026-001",
      payment_method: "bank_transfer",
      nominal_account_id: "nominal-account-1",
      narration: "Synthetic supplier settlement",
      amount: "1250.00",
      dimensions: { cost_center: "operations" },
    },
  ],
} as const;

describe("Banking contracts", () => {
  it("accepts a zero-opening-balance bank account draft", () => {
    expect(createBankAccountRequestSchema.parse(validCreate)).toEqual(validCreate);
  });

  it("rejects a non-zero opening balance until Finance posting is implemented", () => {
    const result = createBankAccountRequestSchema.safeParse({ ...validCreate, opening_balance: "1.00" });
    expect(result.success).toBe(false);
  });

  it("rejects browser-controlled lifecycle and tenant authority", () => {
    const result = createBankAccountRequestSchema.safeParse({
      ...validCreate,
      tenant_id: "other-tenant",
      state: "active",
      approved_by: "maker",
    });
    expect(result.success).toBe(false);
  });

  it("requires optimistic versions for updates and decisions", () => {
    expect(updateBankAccountRequestSchema.safeParse({ account_name: "Updated", opening_balance: "0" }).success).toBe(
      false,
    );
    expect(
      decideBankAccountRequestSchema.safeParse({ action: "approve", reason: "Reviewed account evidence" }).success,
    ).toBe(false);
  });

  it("bounds directory filters", () => {
    expect(bankAccountDirectoryQuerySchema.parse({ company_id: "company-1" }).limit).toBe(50);
    expect(bankAccountDirectoryQuerySchema.safeParse({ company_id: "company-1", limit: 101 }).success).toBe(false);
    expect(bankAccountDirectoryQuerySchema.safeParse({ company_id: "company-1", currency: "pkr" }).success).toBe(false);
  });

  it("accepts only the approved Bank Payment methods and bounded line input", () => {
    expect(bankPaymentMethodSchema.options).toEqual([
      "bank_transfer",
      "cheque",
      "cash",
      "online",
      "standing_order",
      "card",
    ]);
    expect(createBankPaymentRequestSchema.parse(validPaymentCreate)).toEqual(validPaymentCreate);
    expect(
      createBankPaymentRequestSchema.safeParse({
        ...validPaymentCreate,
        lines: [{ ...validPaymentCreate.lines[0], payment_method: "payment_file" }],
      }).success,
    ).toBe(false);
  });

  it("rejects Bank Payment amounts outside numeric(38,8), zero values and duplicate line order", () => {
    expect(
      createBankPaymentRequestSchema.safeParse({
        ...validPaymentCreate,
        lines: [{ ...validPaymentCreate.lines[0], amount: "1000000000000000000000000000000.00" }],
      }).success,
    ).toBe(false);
    expect(
      createBankPaymentRequestSchema.safeParse({
        ...validPaymentCreate,
        lines: [{ ...validPaymentCreate.lines[0], amount: "0.00000000" }],
      }).success,
    ).toBe(false);
    expect(
      createBankPaymentRequestSchema.safeParse({
        ...validPaymentCreate,
        lines: [validPaymentCreate.lines[0], { ...validPaymentCreate.lines[0] }],
      }).success,
    ).toBe(false);
  });

  it("rejects browser-controlled Bank Payment authority and unbounded payloads", () => {
    expect(
      createBankPaymentRequestSchema.safeParse({
        ...validPaymentCreate,
        tenant_id: "other-tenant",
        state: "approved",
        total_amount: "1250.00",
        bank_control_account_id: "browser-controlled",
        journal_id: "browser-controlled",
      }).success,
    ).toBe(false);
    expect(
      createBankPaymentRequestSchema.safeParse({
        ...validPaymentCreate,
        lines: Array.from({ length: 201 }, (_, index) => ({
          ...validPaymentCreate.lines[0],
          line_order: index + 1,
        })),
      }).success,
    ).toBe(false);
    expect(
      createBankPaymentRequestSchema.safeParse({
        ...validPaymentCreate,
        lines: [{ ...validPaymentCreate.lines[0], dimensions: { oversized: "x".repeat(4_001) } }],
      }).success,
    ).toBe(false);
    expect(
      createBankPaymentRequestSchema.safeParse({
        ...validPaymentCreate,
        lines: [{ ...validPaymentCreate.lines[0], external_reference: "x".repeat(129) }],
      }).success,
    ).toBe(false);
  });

  it("requires optimistic versions and reasons for rejecting or reversing Bank Payments", () => {
    expect(updateBankPaymentRequestSchema.safeParse({ posting_date: "2026-10-20" }).success).toBe(false);
    expect(decideBankPaymentRequestSchema.safeParse({ action: "reject", expected_version: 2 }).success).toBe(false);
    expect(decideBankPaymentRequestSchema.safeParse({ action: "approve", expected_version: 2 }).success).toBe(true);
    expect(reverseBankPaymentRequestSchema.safeParse({ expected_version: 4 }).success).toBe(false);
  });

  it("bounds Bank Payment list filters and validates date order", () => {
    expect(bankPaymentDirectoryQuerySchema.parse({ company_id: "company-1" })).toMatchObject({
      limit: 50,
      sort_by: "posting_date",
      sort_direction: "desc",
    });
    expect(bankPaymentDirectoryQuerySchema.safeParse({ company_id: "company-1", limit: 101 }).success).toBe(false);
    expect(
      bankPaymentDirectoryQuerySchema.safeParse({
        company_id: "company-1",
        posting_date_from: "2026-10-20",
        posting_date_to: "2026-10-19",
      }).success,
    ).toBe(false);
  });

  it("preserves the Finance exchange-rate scale in payment details", () => {
    const detail = {
      id: "payment-1",
      company_id: "company-1",
      reference: "BP-2026-000001",
      bank_account_id: "bank-account-1",
      bank_account_name: "Operating USD",
      bank_name: "Synthetic Bank",
      account_number_masked: "•••• 7812",
      posting_date: "2026-10-19",
      value_date: null,
      currency: "USD",
      total_amount: "1250.00",
      line_count: 1,
      state: "submitted",
      version: 2,
      created_at: "2026-10-19T08:00:00.000Z",
      base_currency: "PKR",
      exchange_rate: "277.123456789012345678",
      lines: [{ id: "line-1", ...validPaymentCreate.lines[0] }],
      timeline: [],
      accounting_preview: {
        currency: "USD",
        lines: [
          {
            line_order: 1,
            account_id: "nominal-account-1",
            account_code: "60-01",
            account_name: "Operating expense",
            side: "debit",
            amount: "1250.00",
            is_bank_control: false,
          },
          {
            line_order: 2,
            account_id: "bank-control-1",
            account_code: "10-01",
            account_name: "Bank control",
            side: "credit",
            amount: "1250.00",
            is_bank_control: true,
          },
        ],
        debit_total: "1250.00",
        credit_total: "1250.00",
      },
      created_by: "maker-1",
      submitted_by: "maker-1",
      approved_by: null,
      rejected_by: null,
      posted_by: null,
      reversed_by: null,
      submitted_at: "2026-10-19T08:05:00.000Z",
      approved_at: null,
      rejected_at: null,
      posted_at: null,
      reversed_at: null,
      accounting_event_id: null,
      journal_id: null,
      journal_entry_number: null,
      reversal_accounting_event_id: null,
      reversal_journal_id: null,
      reversal_journal_entry_number: null,
      self_decision_requires_override: true,
      super_admin_override_allowed: false,
    } as const;

    expect(bankPaymentDetailSchema.parse(detail).exchange_rate).toBe("277.123456789012345678");
  });
});
