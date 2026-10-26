import { describe, expect, it, vi } from "vitest";

import type {
  BankReconciliationAdjustmentMutationResult,
  CreateBankReconciliationAdjustmentRequest,
} from "../../packages/contracts/src/index.js";
import { buildAdjustmentPostingLines } from "../../server/api/src/modules/banking/reconciliations/adjustment-repository.js";
import { BankReconciliationAdjustmentService } from "../../server/api/src/modules/banking/reconciliations/adjustment-service.js";
import type { BankingActorContext } from "../../server/api/src/modules/banking/source-repository.js";

const context = {
  tenantId: "tenant-a",
  actor: {
    tenantId: "tenant-a",
    organizationName: "Tenant A",
    userId: "maker-a",
    email: "maker-a@example.invalid",
    displayName: "Maker A",
    roles: [],
    permissions: [],
    sessionVersion: 1,
  },
} satisfies BankingActorContext;

const result = {
  reconciliation_id: "reconciliation-a",
  reconciliation_version: 2,
  adjustment: {
    id: "adjustment-a",
    statement_line_id: "statement-a",
    kind: "bank_charge",
    offset_nominal_id: "nominal-a",
    offset_nominal_code: "6100",
    offset_nominal_name: "Bank charges",
    narrative: "Monthly bank charge",
    direction: "money_out",
    amount: "25.00000000",
    currency: "USD",
    state: "draft",
    version: 1,
    created_by: "maker-a",
    submitted_by: null,
    approved_by: null,
    posted_by: null,
    reversed_by: null,
    journal_id: null,
    bank_journal_line_id: null,
  },
  balances: {
    currency: "USD",
    opening_statement_balance: "100.00000000",
    statement_money_in: "0.00000000",
    statement_money_out: "25.00000000",
    reconstructed_statement_balance: "75.00000000",
    closing_statement_balance: "75.00000000",
    ledger_balance_at_cutoff: "100.00000000",
    unmatched_ledger_money_in: "0.00000000",
    unmatched_ledger_money_out: "0.00000000",
    adjusted_ledger_balance: "100.00000000",
    difference: "-25.00000000",
    matched_count: 0,
    unmatched_statement_count: 1,
    unmatched_ledger_count: 0,
    adjustment_count: 1,
  },
  audit_event_id: "adjustment-event-a",
  replayed: false,
} satisfies BankReconciliationAdjustmentMutationResult;

describe("Bank Reconciliation adjustment service", () => {
  it.each([
    {
      direction: "money_out" as const,
      expected: [
        { accountId: "offset-a", debit: "25", credit: "0" },
        { accountId: "bank-a", debit: "0", credit: "25" },
      ],
    },
    {
      direction: "money_in" as const,
      expected: [
        { accountId: "bank-a", debit: "25", credit: "0" },
        { accountId: "offset-a", debit: "0", credit: "25" },
      ],
    },
  ])("builds a balanced $direction Finance posting", ({ direction, expected }) => {
    const lines = buildAdjustmentPostingLines({
      direction,
      amount: "25",
      bankAccountId: "bank-definition-a",
      bankNominalId: "bank-a",
      offsetNominalId: "offset-a",
      adjustmentKind: direction === "money_out" ? "bank_charge" : "interest_earned",
      narrative: "Statement-only adjustment",
    });

    expect(lines).toMatchObject(expected);
    expect(lines.filter((line) => line.sourceMetadata.is_bank_control === true)).toHaveLength(1);
  });

  it("delegates lifecycle operations to the governed repository boundary", async () => {
    const repository = {
      get: vi.fn().mockResolvedValue(result.adjustment),
      create: vi.fn().mockResolvedValue(result),
      update: vi.fn().mockResolvedValue(result),
      submit: vi.fn().mockResolvedValue(result),
      decide: vi.fn().mockResolvedValue(result),
      post: vi.fn().mockResolvedValue(result),
      reverse: vi.fn().mockResolvedValue(result),
    };
    const service = new BankReconciliationAdjustmentService(repository);
    const input: CreateBankReconciliationAdjustmentRequest = {
      expected_version: 1,
      statement_line_id: "statement-a",
      kind: "bank_charge",
      offset_nominal_id: "nominal-a",
      narrative: "Monthly bank charge",
    };

    await expect(service.get(context, "reconciliation-a", "adjustment-a")).resolves.toBe(result.adjustment);
    expect(repository.get).toHaveBeenCalledWith(context, "reconciliation-a", "adjustment-a");
    await expect(service.create(context, "reconciliation-a", input, "key-a", "correlation-a")).resolves.toBe(result);
    expect(repository.create).toHaveBeenCalledWith(context, "reconciliation-a", input, "key-a", "correlation-a");
  });
});
