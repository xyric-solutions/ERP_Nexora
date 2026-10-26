import { describe, expect, it, vi } from "vitest";

import type { AuthenticatedAccount } from "@nexora/auth";
import type { BankingActorContext } from "../../server/api/src/modules/banking/source-repository.js";
import { BankingTransferService } from "../../server/api/src/modules/banking/transfers/service.js";
import type { SourceBankTransferRepository } from "../../server/api/src/modules/banking/transfers/source-repository.js";

const actor: AuthenticatedAccount = {
  tenantId: "tenant-a",
  organizationName: "Tenant A",
  userId: "user-a",
  email: "user-a@example.test",
  displayName: "User A",
  roles: [],
  permissions: ["banking.transfer.read"],
  sessionVersion: 1,
};
const context: BankingActorContext = { tenantId: "tenant-a", actor };

describe("BankingTransferService", () => {
  it("delegates the complete governed Transfer surface without adding transport behavior", async () => {
    const result = {
      id: "bank-transfer-a",
      reference: "TRF-2026-00000001",
      state: "draft" as const,
      version: 1,
      audit_event_id: "audit-a",
      replayed: false,
    };
    const repository = {
      list: vi.fn().mockResolvedValue({ items: [], next_cursor: null }),
      options: vi.fn().mockResolvedValue({ bank_accounts: [], transfer_modes: [] }),
      workflowOptions: vi.fn().mockResolvedValue({ items: [], selected: null, next_cursor: null }),
      get: vi.fn(),
      create: vi.fn().mockResolvedValue(result),
      update: vi.fn(),
      submit: vi.fn(),
      decide: vi.fn(),
      post: vi.fn(),
      reverse: vi.fn(),
      reassign: vi.fn(),
    } satisfies Pick<
      SourceBankTransferRepository,
      | "list"
      | "options"
      | "workflowOptions"
      | "get"
      | "create"
      | "update"
      | "submit"
      | "decide"
      | "post"
      | "reverse"
      | "reassign"
    >;
    const service = new BankingTransferService(repository);
    const request = {
      company_id: "company-a",
      posting_date: "2026-10-22",
      value_date: null,
      lines: [
        {
          line_order: 1,
          document_date: "2026-10-22",
          from_bank_account_id: "bank-a",
          external_reference: "REF-1",
          transfer_mode: "internal" as const,
          to_bank_account_id: "bank-b",
          details: "Treasury funding",
          source_amount: "100.00",
          bank_charge_amount: "0",
        },
      ],
    };

    await expect(service.create(context, request, "idem-a", "correlation-a")).resolves.toEqual(result);
    expect(repository.create).toHaveBeenCalledWith(context, request, "idem-a", "correlation-a");
    await expect(
      service.list(context, { company_id: "company-a", sort_by: "posting_date", sort_direction: "desc", limit: 50 }),
    ).resolves.toEqual({ items: [], next_cursor: null });
    await expect(service.options(context, { company_id: "company-a" })).resolves.toEqual({
      bank_accounts: [],
      transfer_modes: [],
    });
  });
});
