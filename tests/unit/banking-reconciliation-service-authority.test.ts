import { describe, expect, it, vi } from "vitest";

import type { AuthenticatedAccount } from "@nexora/auth";
import type { BankingActorContext } from "../../server/api/src/modules/banking/source-repository.js";
import {
  BankingReconciliationService,
  type BankingReconciliationRepository,
} from "../../server/api/src/modules/banking/reconciliations/service.js";

const account: AuthenticatedAccount = {
  tenantId: "tenant-a",
  organizationName: "Tenant A",
  userId: "maker-a",
  email: "maker-a@example.test",
  displayName: "Maker A",
  roles: [],
  permissions: ["banking.reconciliation.create", "banking.reconciliation.match"],
  sessionVersion: 1,
};
const context: BankingActorContext = { tenantId: account.tenantId, actor: account };

function repository(): BankingReconciliationRepository {
  return {
    setup: vi.fn().mockResolvedValue({
      company_id: "company-a",
      bank_account_id: "bank-a",
      bank_account_name: "Operating account",
      currency: "USD",
      opening_statement_balance: "1000.00000000",
      opening_balance_source: "last_approved_reconciliation",
      last_approved_reconciliation_id: "reconciliation-prior",
      last_approved_statement_date: "2026-09-30",
      available_receipts: "200.00000000",
      available_payments: "50.00000000",
      available_transaction_count: 2,
    }),
    list: vi.fn(),
    get: vi.fn(),
    create: vi.fn().mockResolvedValue({
      id: "reconciliation-a",
      state: "in_progress",
      version: 1,
      audit_event_id: "event-a",
      replayed: false,
    }),
    createMatch: vi.fn(),
    setManualSelection: vi.fn().mockResolvedValue({
      reconciliation_id: "reconciliation-a",
      reconciliation_version: 2,
      journal_line_id: "journal-line-a",
      selected: true,
      balances: {},
      audit_event_id: "event-selection-a",
      replayed: false,
    }),
    decideMatch: vi.fn(),
    unmatch: vi.fn(),
    submit: vi.fn(),
    decide: vi.fn(),
  };
}

describe("BankingReconciliationService", () => {
  it("passes creation through the server-owned repository with idempotency and correlation evidence", async () => {
    const authority = repository();
    const service = new BankingReconciliationService(authority);
    const input = {
      company_id: "company-a",
      bank_account_id: "bank-a",
      method: "statement_import" as const,
      import_id: "import-a",
      reconciliation_date: "2026-10-23",
      statement_date: "2026-10-22",
      period_start: "2026-10-01",
      period_end: "2026-10-22",
      statement_reference: "STATEMENT-001",
      opening_statement_balance: "1000.00000000",
      closing_statement_balance: "1100.00000000",
    };

    await expect(service.create(context, input, "idem-a", "correlation-a")).resolves.toMatchObject({
      id: "reconciliation-a",
      state: "in_progress",
    });
    expect(authority.create).toHaveBeenCalledWith(context, input, "idem-a", "correlation-a");
  });

  it("delegates setup and versioned manual selection to the repository authority", async () => {
    const authority = repository();
    const service = new BankingReconciliationService(authority);
    const query = {
      company_id: "company-a",
      bank_account_id: "bank-a",
      period_start: "2026-10-01",
      period_end: "2026-10-22",
      statement_date: "2026-10-22",
    };
    await service.setup(context, query);
    expect(authority.setup).toHaveBeenCalledWith(context, query);

    const input = { expected_version: 1, journal_line_id: "journal-line-a", selected: true };
    await service.setManualSelection(
      context,
      "reconciliation-a",
      input,
      "manual-selection-a",
      "correlation-selection-a",
    );
    expect(authority.setManualSelection).toHaveBeenCalledWith(
      context,
      "reconciliation-a",
      input,
      "manual-selection-a",
      "correlation-selection-a",
    );
  });
});
