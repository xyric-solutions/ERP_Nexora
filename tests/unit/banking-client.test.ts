import { describe, expect, it, vi } from "vitest";

import { BankingApiClient } from "../../app/features/banking/api/banking-client.js";
import { ApiError, NexoraApiClient } from "../../app/lib/api/generated.js";

describe("Banking browser API adapter", () => {
  it("exposes generated Bank Payment directory and lifecycle methods", () => {
    const api = new NexoraApiClient("http://127.0.0.1:4000");
    for (const method of [
      api.listBankPayments,
      api.listBankPaymentOptions,
      api.listBankPaymentNominalAccounts,
      api.getBankPayment,
      api.createBankPayment,
      api.updateBankPayment,
      api.submitBankPayment,
      api.decideBankPayment,
      api.postBankPayment,
      api.reverseBankPayment,
    ]) {
      expect(typeof method).toBe("function");
    }
  });

  it("encodes bounded account-directory filters through the generated client", async () => {
    const api = {
      listBankAccounts: vi.fn(async () => ({ items: [], next_cursor: null })),
    } as unknown as NexoraApiClient;
    const client = new BankingApiClient(api);

    await client.accounts({
      company_id: "company/a",
      search: "Operating & payroll",
      currency: "USD",
      state: "active",
      sort_by: "ledger_balance",
      sort_direction: "desc",
      limit: 25,
      cursor: "cursor/value",
    });

    const encoded = vi.mocked(api.listBankAccounts).mock.calls[0]?.[0] ?? "";
    const parameters = new URLSearchParams(encoded.slice(1));
    expect(Object.fromEntries(parameters)).toEqual({
      company_id: "company/a",
      search: "Operating & payroll",
      currency: "USD",
      state: "active",
      sort_by: "ledger_balance",
      sort_direction: "desc",
      limit: "25",
      cursor: "cursor/value",
    });
  });

  it("passes mutation safeguards only through generated client methods", async () => {
    const result = {
      id: "bank-account-1",
      reference: "BA-2026-0001",
      state: "draft" as const,
      version: 1,
      audit_event_id: "audit-1",
      replayed: false,
    };
    const api = { createBankAccount: vi.fn(async () => result) } as unknown as NexoraApiClient;
    const client = new BankingApiClient(api);
    const payload = {
      company_id: "company-a",
      account_name: "Operating USD",
      account_type: "current" as const,
      bank_name: "Synthetic Bank",
      account_number: "1234567890",
      currency: "USD",
      ledger_account_id: "ledger-a",
      overdraft_limit: "0",
      opening_balance: "0",
    };

    await expect(client.create(payload, "csrf-token", "bank-create-1")).resolves.toEqual(result);
    expect(api.createBankAccount).toHaveBeenCalledWith(payload, "csrf-token", "bank-create-1");
  });

  it("encodes every committed payment-directory filter through the generated client", async () => {
    const api = {
      listBankPayments: vi.fn(async () => ({ items: [], next_cursor: null })),
    } as unknown as NexoraApiClient;
    const client = new BankingApiClient(api);

    await client.payments({
      company_id: "company/a",
      bank_account_id: "bank account/1",
      state: "approved",
      posting_date_from: "2026-10-01",
      posting_date_to: "2026-10-31",
      search: "Atlas & invoice",
      sort_by: "total_amount",
      sort_direction: "asc",
      limit: 25,
      cursor: "cursor/value",
    });

    const encoded = vi.mocked(api.listBankPayments).mock.calls[0]?.[0] ?? "";
    const parameters = new URLSearchParams(encoded.slice(1));
    expect(Object.fromEntries(parameters)).toEqual({
      company_id: "company/a",
      bank_account_id: "bank account/1",
      state: "approved",
      posting_date_from: "2026-10-01",
      posting_date_to: "2026-10-31",
      search: "Atlas & invoice",
      sort_by: "total_amount",
      sort_direction: "asc",
      limit: "25",
      cursor: "cursor/value",
    });
  });

  it("adapts payment options, bounded nominal search, and detail reads", async () => {
    const api = {
      listBankPaymentOptions: vi.fn(async () => ({ bank_accounts: [] })),
      listBankPaymentNominalAccounts: vi.fn(async () => ({ items: [] })),
      getBankPayment: vi.fn(async () => ({ id: "payment/1" })),
    } as unknown as NexoraApiClient;
    const client = new BankingApiClient(api);

    await client.paymentOptions({ company_id: "company/a" });
    await client.paymentNominalAccounts({ company_id: "company/a", search: "travel & expense", limit: 50 });
    await client.payment("payment/1");

    expect(api.listBankPaymentOptions).toHaveBeenCalledWith("?company_id=company%2Fa");
    const nominalQuery = vi.mocked(api.listBankPaymentNominalAccounts).mock.calls[0]?.[0] ?? "";
    expect(Object.fromEntries(new URLSearchParams(nominalQuery.slice(1)))).toEqual({
      company_id: "company/a",
      search: "travel & expense",
      limit: "50",
    });
    expect(api.getBankPayment).toHaveBeenCalledWith("payment/1");
  });

  it("passes payment payloads, CSRF tokens, versions, and stable action keys unchanged", async () => {
    const mutation = {
      id: "payment-1",
      reference: "BP-2026-000001",
      state: "draft" as const,
      version: 1,
      audit_event_id: "audit-1",
      replayed: false,
    };
    const posted = {
      ...mutation,
      state: "posted" as const,
      accounting_event_id: "accounting-event-1",
      journal_id: "journal-1",
      journal_entry_number: "JE-000001",
    };
    const reversed = {
      ...mutation,
      state: "reversed" as const,
      original_accounting_event_id: "accounting-event-1",
      original_journal_id: "journal-1",
      reversal_accounting_event_id: "accounting-event-2",
      reversal_journal_id: "journal-2",
      reversal_journal_entry_number: "JE-000002",
    };
    const api = {
      createBankPayment: vi.fn(async () => mutation),
      updateBankPayment: vi.fn(async () => mutation),
      submitBankPayment: vi.fn(async () => mutation),
      decideBankPayment: vi.fn(async () => mutation),
      postBankPayment: vi.fn(async () => posted),
      reverseBankPayment: vi.fn(async () => reversed),
    } as unknown as NexoraApiClient;
    const client = new BankingApiClient(api);
    const createPayload = {
      company_id: "company-a",
      bank_account_id: "bank-account-1",
      posting_date: "2026-10-19",
      lines: [
        {
          line_order: 1,
          document_date: "2026-10-19",
          external_reference: "INV-1001",
          payment_method: "bank_transfer" as const,
          nominal_account_id: "nominal-1",
          narration: "Supplier payment",
          amount: "125.00",
          dimensions: {},
        },
      ],
    };
    const updatePayload = { expected_version: 1, posting_date: "2026-10-20" };
    const submitPayload = { expected_version: 2 };
    const decisionPayload = { action: "approve" as const, expected_version: 3 };
    const postPayload = { expected_version: 4 };
    const reversePayload = { expected_version: 5, reason: "Duplicate supplier settlement" };

    await client.createPayment(createPayload, "csrf", "payment-create-key");
    await client.updatePayment("payment-1", updatePayload, "csrf", "payment-update-key");
    await client.submitPayment("payment-1", submitPayload, "csrf", "payment-submit-key");
    await client.decidePayment("payment-1", decisionPayload, "csrf", "payment-decision-key");
    await client.postPayment("payment-1", postPayload, "csrf", "payment-post-key");
    await client.reversePayment("payment-1", reversePayload, "csrf", "payment-reverse-key");

    expect(api.createBankPayment).toHaveBeenCalledWith(createPayload, "csrf", "payment-create-key");
    expect(api.updateBankPayment).toHaveBeenCalledWith("payment-1", updatePayload, "csrf", "payment-update-key");
    expect(api.submitBankPayment).toHaveBeenCalledWith("payment-1", submitPayload, "csrf", "payment-submit-key");
    expect(api.decideBankPayment).toHaveBeenCalledWith("payment-1", decisionPayload, "csrf", "payment-decision-key");
    expect(api.postBankPayment).toHaveBeenCalledWith("payment-1", postPayload, "csrf", "payment-post-key");
    expect(api.reverseBankPayment).toHaveBeenCalledWith("payment-1", reversePayload, "csrf", "payment-reverse-key");
  });

  it("preserves generated ApiError identity, code, and correlation ID", async () => {
    const error = new ApiError(409, "Payment version conflict", "PAYMENT_VERSION_CONFLICT", "correlation-1");
    const api = { postBankPayment: vi.fn(async () => Promise.reject(error)) } as unknown as NexoraApiClient;
    const client = new BankingApiClient(api);

    const request = client.postPayment("payment-1", { expected_version: 4 }, "csrf", "payment-post-key");
    await expect(request).rejects.toBe(error);
    await request.catch((caught: unknown) => {
      expect(caught).toMatchObject({ code: "PAYMENT_VERSION_CONFLICT", correlationId: "correlation-1" });
    });
  });
});
