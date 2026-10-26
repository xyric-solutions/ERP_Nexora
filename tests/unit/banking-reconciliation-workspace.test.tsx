// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  client: {
    companies: vi.fn(),
    statementImportOptions: vi.fn(),
    statementImports: vi.fn(),
    statementImport: vi.fn(),
    ledgerAccounts: vi.fn(),
    reconciliationSetup: vi.fn(),
    reconciliation: vi.fn(),
    createReconciliation: vi.fn(),
    setReconciliationManualSelection: vi.fn(),
    createReconciliationMatch: vi.fn(),
    decideReconciliationMatch: vi.fn(),
    unmatchReconciliation: vi.fn(),
    createReconciliationAdjustment: vi.fn(),
    submitReconciliationAdjustment: vi.fn(),
    decideReconciliationAdjustment: vi.fn(),
    postReconciliationAdjustment: vi.fn(),
    reverseReconciliationAdjustment: vi.fn(),
    submitReconciliation: vi.fn(),
    decideReconciliation: vi.fn(),
  },
  session: {
    tenant_id: "tenant-1",
    user: {
      id: "maker-1",
      email: "maker@example.test",
      roles: ["reconciliation_maker"],
      permissions: [
        "banking.reconciliation.read",
        "banking.reconciliation.create",
        "banking.reconciliation.update",
        "banking.reconciliation.match",
        "banking.reconciliation.submit",
        "banking.reconciliation.approve",
        "banking.reconciliation_adjustment.read",
        "banking.reconciliation_adjustment.create",
        "banking.reconciliation_adjustment.submit",
        "banking.reconciliation_adjustment.approve",
        "banking.reconciliation_adjustment.post",
        "banking.reconciliation_adjustment.reverse",
      ],
    },
  },
}));

vi.mock("@/lib/session/session-provider", () => ({
  useSession: () => ({ api: {}, session: harness.session, loading: false, csrfToken: () => "csrf-token" }),
}));

vi.mock("../../app/features/banking/api/banking-client.js", () => ({
  BankingApiClient: class {
    constructor() {
      return harness.client;
    }
  },
}));

import { BankingReconciliationWorkspace } from "../../app/features/banking/views/banking-reconciliation-live.js";

const importId = "123e4567-e89b-42d3-a456-426614174000";
const reconciliationId = "bank-reconciliation-123e4567-e89b-42d3-a456-426614174000";
const statementLine = {
  id: "statement-line-1",
  import_id: importId,
  source_row_number: 2,
  raw_row: { Date: "22/10/2026" },
  transaction_date: "2026-10-22",
  direction: "money_out",
  amount: "125.00",
  currency: "USD",
  reference: "FEE-1",
  details: "Monthly bank charge",
  transaction_type: "Charge",
  account_text: "Bank",
  payment_mode: "Direct debit",
  row_fingerprint: "a".repeat(64),
  inclusion_state: "included",
  exclusion_reason: null,
  validation_state: "valid",
  duplicate_disposition: "not_applicable",
  issues: [],
  version: 1,
} as const;
const balances = {
  currency: "USD",
  opening_statement_balance: "1000.00",
  statement_money_in: "0.00",
  statement_money_out: "125.00",
  reconstructed_statement_balance: "875.00",
  closing_statement_balance: "875.00",
  ledger_balance_at_cutoff: "1000.00",
  unmatched_ledger_money_in: "0.00",
  unmatched_ledger_money_out: "0.00",
  adjusted_ledger_balance: "1000.00",
  difference: "-125.00",
  matched_count: 0,
  unmatched_statement_count: 1,
  unmatched_ledger_count: 1,
  adjustment_count: 0,
  available_ledger_money_in: "0.00",
  available_ledger_money_out: "125.00",
  selected_ledger_money_in: "0.00",
  selected_ledger_money_out: "0.00",
  calculated_selected_balance: "1000.00",
};
const detail = {
  id: reconciliationId,
  company_id: "company-1",
  bank_account_id: "bank-1",
  bank_account_name: "Operating Account",
  method: "statement_import",
  import_id: importId,
  reconciliation_date: "2026-10-23",
  statement_date: "2026-10-22",
  period_start: "2026-10-01",
  period_end: "2026-10-22",
  statement_reference: "OCT-2026",
  balances,
  state: "in_progress",
  prepared_by: "maker-1",
  submitted_by: null,
  approved_by: null,
  version: 2,
  created_at: "2026-10-23T10:00:00.000Z",
  submitted_at: null,
  approved_at: null,
  statement_lines: [statementLine],
  ledger_candidates: [
    {
      journal_line_id: "journal-line-1",
      journal_id: "journal-1",
      journal_entry_number: "JRN-1",
      posting_date: "2026-10-22",
      direction: "money_out",
      amount: "125.00",
      currency: "USD",
      reference: "FEE-1",
      narrative: "Monthly bank charge",
      matched: false,
      reversed: false,
      manual_selected: false,
    },
  ],
  matches: [],
  adjustments: [],
  timeline: [],
  ledger_population_hash: "b".repeat(64),
  ledger_calculated_at: "2026-10-23T10:00:00.000Z",
  self_decision_requires_override: false,
  super_admin_override_allowed: false,
} as const;

let container: HTMLDivElement;
let root: Root;
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true, PointerEvent: MouseEvent });
async function settle() {
  for (let index = 0; index < 5; index += 1)
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
}
function change(label: string, value: string) {
  const element = container.querySelector(`[aria-label="${label}"]`);
  if (!(element instanceof HTMLInputElement || element instanceof HTMLSelectElement))
    throw new Error(`Missing ${label}`);
  act(() => {
    const prototype = element instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLSelectElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(element, value);
    element.dispatchEvent(new Event(element instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
  });
}

describe("BankingReconciliationWorkspace", () => {
  beforeEach(() => {
    harness.client.companies.mockResolvedValue({ items: [{ id: "company-1", code: "C01", name: "Nexora" }] });
    harness.client.statementImportOptions.mockResolvedValue({
      bank_accounts: [
        {
          id: "bank-1",
          reference: "BA-1",
          account_name: "Operating Account",
          bank_name: "Bank A",
          account_number_masked: "**** 1001",
          currency: "USD",
        },
      ],
      mapping_profiles: [],
      date_formats: ["dd/MM/yyyy"],
      max_file_bytes: 26_214_400,
      max_rows: 1_000,
    });
    harness.client.statementImports.mockResolvedValue({
      items: [
        {
          id: importId,
          company_id: "company-1",
          bank_account_id: "bank-1",
          bank_account_name: "Operating Account",
          statement_reference: "OCT-2026",
          original_filename: "october.csv",
          file_format: "csv",
          detected_media_type: "text/csv",
          byte_size: 100,
          checksum_sha256: "c".repeat(64),
          state: "finalized",
          counts: { total: 1, valid: 1, warning: 0, error: 0, duplicate: 0, excluded: 0, finalized: 1 },
          version: 3,
          created_by: "maker-1",
          created_at: "2026-10-23T09:00:00.000Z",
          finalized_by: "maker-1",
          finalized_at: "2026-10-23T09:05:00.000Z",
        },
      ],
      next_cursor: null,
    });
    harness.client.statementImport.mockResolvedValue({
      ...harness.client.statementImports.mock.results[0]?.value,
      ...detail,
      id: importId,
      lines: [statementLine],
    });
    harness.client.ledgerAccounts.mockResolvedValue({
      items: [{ id: "nominal-1", code: "7000", name: "Bank charges", currency: "USD" }],
    });
    harness.client.reconciliationSetup.mockResolvedValue({
      company_id: "company-1",
      bank_account_id: "bank-1",
      bank_account_name: "Operating Account",
      currency: "USD",
      opening_statement_balance: "1000.00",
      opening_balance_source: "ledger_before_period",
      last_approved_reconciliation_id: null,
      last_approved_statement_date: null,
      available_receipts: "0.00",
      available_payments: "125.00",
      available_transaction_count: 1,
    });
    harness.client.reconciliation.mockResolvedValue(detail);
    harness.client.createReconciliation.mockResolvedValue({
      id: reconciliationId,
      state: "draft",
      version: 1,
      audit_event_id: "audit-1",
      replayed: false,
    });
    harness.client.createReconciliationMatch.mockResolvedValue({
      reconciliation_id: reconciliationId,
      reconciliation_version: 3,
      match: null,
      balances: { ...balances, difference: "0.00" },
      audit_event_id: "audit-2",
      replayed: false,
    });
    harness.client.setReconciliationManualSelection.mockResolvedValue({
      reconciliation_id: reconciliationId,
      reconciliation_version: 3,
      ledger_line_id: "journal-line-1",
      selected: true,
      balances: { ...balances, selected_ledger_money_out: "125.00", calculated_selected_balance: "875.00" },
      audit_event_id: "audit-selection-1",
      replayed: false,
    });
    harness.client.submitReconciliation.mockResolvedValue({
      id: reconciliationId,
      state: "submitted",
      version: 3,
      audit_event_id: "audit-3",
      replayed: false,
    });
    harness.client.createReconciliationAdjustment.mockResolvedValue({
      reconciliation_id: reconciliationId,
      reconciliation_version: 3,
      adjustment: {
        id: "adjustment-1",
        statement_line_id: "statement-line-1",
        kind: "bank_charge",
        offset_nominal_id: "nominal-1",
        offset_nominal_code: "7000",
        offset_nominal_name: "Bank charges",
        narrative: "Monthly bank charge",
        direction: "money_out",
        amount: "125.00",
        currency: "USD",
        state: "draft",
        version: 1,
        created_by: "maker-1",
        submitted_by: null,
        approved_by: null,
        posted_by: null,
        reversed_by: null,
        journal_id: null,
        bank_journal_line_id: null,
      },
      balances,
      audit_event_id: "audit-4",
      replayed: false,
    });
    harness.client.decideReconciliation.mockResolvedValue({
      id: reconciliationId,
      state: "approved",
      version: 5,
      audit_event_id: "audit-5",
      replayed: false,
    });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.resetAllMocks();
  });

  it("creates a persisted reconciliation from the finalized import route", async () => {
    const onOpen = vi.fn();
    await act(async () =>
      root.render(
        <BankingReconciliationWorkspace
          initialBankAccountId="bank-1"
          initialStatementImportId={importId}
          onBack={vi.fn()}
          onOpen={onOpen}
          onImportStatement={vi.fn()}
        />,
      ),
    );
    await settle();
    change("Opening statement balance", "1000.00");
    change("Closing statement balance", "875.00");
    const save = [...container.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "Save reconciliation",
    );
    await act(async () => save?.click());
    await settle();
    expect(harness.client.createReconciliation).toHaveBeenCalledWith(
      expect.objectContaining({
        company_id: "company-1",
        bank_account_id: "bank-1",
        import_id: importId,
        method: "statement_import",
      }),
      "csrf-token",
      expect.stringMatching(/^web-bank-reconciliation-create-/),
    );
    expect(onOpen).toHaveBeenCalledWith(reconciliationId);
  });

  it("loads authoritative rows and confirms a manual statement-to-ledger match", async () => {
    await act(async () =>
      root.render(
        <BankingReconciliationWorkspace
          reconciliationId={reconciliationId}
          onBack={vi.fn()}
          onOpen={vi.fn()}
          onImportStatement={vi.fn()}
        />,
      ),
    );
    await settle();
    expect(container.textContent).toContain("Monthly bank charge");
    expect(container.textContent).toContain("JRN-1");
    const match = [...container.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "Confirm manual match",
    );
    await act(async () => match?.click());
    await settle();
    expect(harness.client.createReconciliationMatch).toHaveBeenCalledWith(
      reconciliationId,
      {
        action: "confirm_manual",
        expected_version: 2,
        statement_line_id: "statement-line-1",
        journal_line_id: "journal-line-1",
      },
      "csrf-token",
      expect.stringMatching(/^web-bank-reconciliation-match-/),
    );
  });

  it("uses the server-derived opening balance when creating a manual reconciliation", async () => {
    const onOpen = vi.fn();
    await act(async () =>
      root.render(
        <BankingReconciliationWorkspace
          initialBankAccountId="bank-1"
          onBack={vi.fn()}
          onOpen={onOpen}
          onImportStatement={vi.fn()}
        />,
      ),
    );
    await settle();
    change("Reconciliation method", "manual_tick");
    change("Closing statement balance", "875.00");
    const load = [...container.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "Load Transactions",
    );
    await act(async () => load?.click());
    await settle();
    expect(harness.client.reconciliationSetup).toHaveBeenCalledWith(
      expect.objectContaining({ company_id: "company-1", bank_account_id: "bank-1" }),
    );
    expect(harness.client.createReconciliation).toHaveBeenCalledWith(
      expect.objectContaining({
        company_id: "company-1",
        bank_account_id: "bank-1",
        method: "manual_tick",
        import_id: null,
        reconciliation_date: expect.any(String),
      }),
      "csrf-token",
      expect.stringMatching(/^web-bank-reconciliation-create-/),
    );
    expect(harness.client.createReconciliation.mock.calls.at(-1)?.[0]).not.toHaveProperty("opening_statement_balance");
    expect(onOpen).toHaveBeenCalledWith(reconciliationId);
  });

  it("persists manual checkbox selections through the versioned server route", async () => {
    harness.client.reconciliation.mockResolvedValue({
      ...detail,
      method: "manual_tick",
      import_id: null,
      statement_lines: [],
    });
    await act(async () =>
      root.render(
        <BankingReconciliationWorkspace
          reconciliationId={reconciliationId}
          onBack={vi.fn()}
          onOpen={vi.fn()}
          onImportStatement={vi.fn()}
        />,
      ),
    );
    await settle();
    const checkbox = container.querySelector('[aria-label="Reconcile JRN-1"]');
    expect(checkbox).toBeInstanceOf(HTMLElement);
    await act(async () => (checkbox as HTMLElement).click());
    await settle();
    expect(harness.client.setReconciliationManualSelection).toHaveBeenCalledWith(
      reconciliationId,
      { journal_line_id: "journal-line-1", selected: true, expected_version: 2 },
      "csrf-token",
      expect.stringMatching(/^web-bank-reconciliation-manual-selection-/),
    );
  });

  it("submits only through the versioned server transition", async () => {
    harness.client.reconciliation.mockResolvedValue({
      ...detail,
      balances: { ...balances, difference: "0.00000000", unmatched_statement_count: 0 },
      version: 4,
    });
    await act(async () =>
      root.render(
        <BankingReconciliationWorkspace
          reconciliationId={reconciliationId}
          onBack={vi.fn()}
          onOpen={vi.fn()}
          onImportStatement={vi.fn()}
        />,
      ),
    );
    await settle();
    const submit = [...container.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "Reconcile / Submit for Approval",
    );
    await act(async () => submit?.click());
    await settle();
    expect(harness.client.submitReconciliation).toHaveBeenCalledWith(
      reconciliationId,
      { expected_version: 4 },
      "csrf-token",
      expect.stringMatching(/^web-bank-reconciliation-submit-/),
    );
  });

  it("creates a governed adjustment from the immutable selected statement amount", async () => {
    await act(async () =>
      root.render(
        <BankingReconciliationWorkspace
          reconciliationId={reconciliationId}
          onBack={vi.fn()}
          onOpen={vi.fn()}
          onImportStatement={vi.fn()}
        />,
      ),
    );
    await settle();
    change("Offset nominal", "nominal-1");
    change("Adjustment narrative", "Monthly bank charge");
    const createAdjustment = [...container.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "Create adjustment",
    );
    await act(async () => createAdjustment?.click());
    await settle();
    expect(harness.client.createReconciliationAdjustment).toHaveBeenCalledWith(
      reconciliationId,
      {
        expected_version: 2,
        statement_line_id: "statement-line-1",
        kind: "bank_charge",
        offset_nominal_id: "nominal-1",
        narrative: "Monthly bank charge",
      },
      "csrf-token",
      expect.stringMatching(/^web-bank-reconciliation-adjustment-create-/),
    );
  });

  it("uses the server decision route for approval and closes the persisted workspace", async () => {
    const onBack = vi.fn();
    harness.client.reconciliation.mockResolvedValue({ ...detail, state: "submitted", version: 4 });
    await act(async () =>
      root.render(
        <BankingReconciliationWorkspace
          reconciliationId={reconciliationId}
          onBack={onBack}
          onOpen={vi.fn()}
          onImportStatement={vi.fn()}
        />,
      ),
    );
    await settle();
    const approve = [...container.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "Approve & Close",
    );
    await act(async () => approve?.click());
    await settle();
    expect(harness.client.decideReconciliation).toHaveBeenCalledWith(
      reconciliationId,
      { action: "approve", expected_version: 4, reason: undefined },
      "csrf-token",
      expect.stringMatching(/^web-bank-reconciliation-decision-approve-/),
    );
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
