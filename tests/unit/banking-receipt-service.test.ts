import { describe, expect, it, vi } from "vitest";

import type { AuthenticatedAccount } from "@nexora/auth";
import type { BankingActorContext } from "../../server/api/src/modules/banking/source-repository.js";
import { BankingReceiptService } from "../../server/api/src/modules/banking/receipts/service.js";
import type { SourceBankReceiptRepository } from "../../server/api/src/modules/banking/receipts/source-repository.js";

const actor: AuthenticatedAccount = {
  tenantId: "tenant-a",
  organizationName: "Tenant A",
  userId: "user-a",
  email: "user-a@example.test",
  displayName: "User A",
  roles: [],
  permissions: ["banking.receipt.read"],
  sessionVersion: 1,
};
const context: BankingActorContext = { tenantId: "tenant-a", actor };

describe("BankingReceiptService", () => {
  it("keeps transport orchestration thin and delegates the complete receipt surface", async () => {
    const directory = { items: [], next_cursor: null };
    const options = {
      bank_accounts: [],
      receipt_methods: [
        { value: "bank_transfer" as const, label: "Bank transfer" },
        { value: "cheque" as const, label: "Cheque" },
        { value: "cash" as const, label: "Cash" },
        { value: "online" as const, label: "Online" },
        { value: "direct_debit" as const, label: "Direct debit" },
        { value: "card" as const, label: "Card" },
      ],
    };
    const nominals = { items: [] };
    const result = {
      id: "receipt-a",
      reference: "BR-2026-00000001",
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
      SourceBankReceiptRepository,
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
    const service = new BankingReceiptService(repository);

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
          receipt_method: "bank_transfer" as const,
          payer_name: "Nexora Test Customer",
          nominal_account_id: "income-a",
          narration: "Controlled customer receipt",
          amount: "25.00",
          dimensions: {},
        },
      ],
    };
    await expect(service.create(context, request, "idem-a", "correlation-a")).resolves.toEqual(result);
    expect(repository.create).toHaveBeenCalledWith(context, request, "idem-a", "correlation-a");
  });
});
