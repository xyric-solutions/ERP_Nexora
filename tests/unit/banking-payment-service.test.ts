import { describe, expect, it, vi } from "vitest";

import type { AuthenticatedAccount } from "@nexora/auth";
import type { BankingActorContext } from "../../server/api/src/modules/banking/source-repository.js";
import { BankingPaymentService } from "../../server/api/src/modules/banking/payments/service.js";
import type { SourceBankPaymentRepository } from "../../server/api/src/modules/banking/payments/source-repository.js";

const actor: AuthenticatedAccount = {
  tenantId: "tenant-a",
  organizationName: "Tenant A",
  userId: "user-a",
  email: "user-a@example.test",
  displayName: "User A",
  roles: [],
  permissions: ["banking.payment.read"],
  sessionVersion: 1,
};
const context: BankingActorContext = { tenantId: "tenant-a", actor };

describe("BankingPaymentService", () => {
  it("keeps transport orchestration thin and delegates the complete payment surface", async () => {
    const directory = { items: [], next_cursor: null };
    const options = { bank_accounts: [] };
    const nominals = { items: [] };
    const result = {
      id: "payment-a",
      reference: "BP-2026-00000001",
      state: "draft" as const,
      version: 1,
      audit_event_id: "audit-a",
      replayed: false,
    };
    const repository = {
      list: vi.fn().mockResolvedValue(directory),
      options: vi.fn().mockResolvedValue(options),
      listNominalAccounts: vi.fn().mockResolvedValue(nominals),
      get: vi.fn(),
      create: vi.fn().mockResolvedValue(result),
      update: vi.fn(),
      submit: vi.fn(),
      decide: vi.fn(),
      post: vi.fn(),
      reverse: vi.fn(),
    } satisfies Pick<
      SourceBankPaymentRepository,
      | "list"
      | "options"
      | "listNominalAccounts"
      | "get"
      | "create"
      | "update"
      | "submit"
      | "decide"
      | "post"
      | "reverse"
    >;
    const service = new BankingPaymentService(repository);

    await expect(
      service.list(context, {
        company_id: "company-a",
        sort_by: "posting_date",
        sort_direction: "desc",
        limit: 50,
      }),
    ).resolves.toEqual(directory);
    await expect(service.options(context, { company_id: "company-a" })).resolves.toEqual(options);
    await expect(service.listNominalAccounts(context, { company_id: "company-a", limit: 50 })).resolves.toEqual(
      nominals,
    );

    const request = {
      company_id: "company-a",
      bank_account_id: "bank-a",
      posting_date: "2026-10-19",
      lines: [
        {
          line_order: 1,
          document_date: "2026-10-19",
          external_reference: "EXT-1",
          payment_method: "bank_transfer" as const,
          nominal_account_id: "expense-a",
          narration: "Approved supplier invoice",
          amount: "25.00",
          dimensions: {},
        },
      ],
    };
    await expect(service.create(context, request, "idem-a", "correlation-a")).resolves.toEqual(result);
    expect(repository.create).toHaveBeenCalledWith(context, request, "idem-a", "correlation-a");
  });
});
