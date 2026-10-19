import { describe, expect, it, vi } from "vitest";

import { BankingApiClient } from "../../app/features/banking/api/banking-client.js";
import { NexoraApiClient } from "../../app/lib/api/generated.js";

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
});
