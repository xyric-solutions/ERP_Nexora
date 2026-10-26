// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  client: { companies: vi.fn(), statementImportOptions: vi.fn(), reconciliations: vi.fn() },
  session: {
    tenant_id: "tenant-1",
    user: {
      id: "user-1",
      email: "user@example.test",
      roles: ["reconciliation_reader"],
      permissions: ["banking.reconciliation.read"],
    },
  },
}));

vi.mock("@/lib/session/session-provider", () => ({
  useSession: () => ({ api: {}, session: harness.session, loading: false, csrfToken: () => "csrf" }),
}));

vi.mock("../../app/features/banking/api/banking-client.js", () => ({
  BankingApiClient: class {
    constructor() {
      return harness.client;
    }
  },
}));

import {
  BankingReconciliationRegister,
  bankReconciliationStateLabel,
} from "../../app/features/banking/views/banking-reconciliation-register.js";

const reconciliationId = "bank-reconciliation-123e4567-e89b-42d3-a456-426614174000";
const reconciliation = {
  id: reconciliationId,
  company_id: "company-1",
  bank_account_id: "bank-1",
  bank_account_name: "Operating Account",
  method: "statement_import",
  import_id: "123e4567-e89b-42d3-a456-426614174000",
  statement_date: "2026-10-22",
  period_start: "2026-10-01",
  period_end: "2026-10-22",
  statement_reference: "OCT-2026",
  balances: {
    currency: "USD",
    opening_statement_balance: "1000.00",
    statement_money_in: "500.00",
    statement_money_out: "125.25",
    reconstructed_statement_balance: "1374.75",
    closing_statement_balance: "1374.75",
    ledger_balance_at_cutoff: "1374.75",
    unmatched_ledger_money_in: "0.00",
    unmatched_ledger_money_out: "0.00",
    adjusted_ledger_balance: "1374.75",
    difference: "0.00",
    matched_count: 2,
    unmatched_statement_count: 0,
    unmatched_ledger_count: 1,
    adjustment_count: 0,
  },
  state: "submitted",
  prepared_by: "maker-1",
  submitted_by: "maker-1",
  approved_by: null,
  version: 2,
  created_at: "2026-10-23T10:00:00.000Z",
  submitted_at: "2026-10-23T10:05:00.000Z",
  approved_at: null,
} as const;

let container: HTMLDivElement;
let root: Root;
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

async function settle() {
  for (let index = 0; index < 5; index += 1)
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
}

describe("live Bank Reconciliation register", () => {
  it("uses the approved business labels for every lifecycle state", () => {
    expect(bankReconciliationStateLabel("draft")).toBe("Draft");
    expect(bankReconciliationStateLabel("in_progress")).toBe("In progress");
    expect(bankReconciliationStateLabel("submitted")).toBe("Waiting for approval");
    expect(bankReconciliationStateLabel("approved")).toBe("Approved");
  });

  beforeEach(() => {
    harness.session.user.permissions = ["banking.reconciliation.read"];
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
    harness.client.reconciliations.mockResolvedValue({ items: [reconciliation], next_cursor: null });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.resetAllMocks();
  });

  it("renders bounded live status, totals, and persisted navigation", async () => {
    const onOpen = vi.fn();
    await act(async () => root.render(<BankingReconciliationRegister onOpen={onOpen} />));
    await settle();

    expect(harness.client.reconciliations).toHaveBeenCalledWith(
      expect.objectContaining({ company_id: "company-1", limit: 50 }),
    );
    expect(container.textContent).toContain("Waiting for approval");
    expect(container.textContent).toContain("OCT-2026");
    expect(container.textContent).toContain("Operating Account");
    const link = [...container.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === reconciliationId,
    );
    await act(async () => link?.click());
    expect(onOpen).toHaveBeenCalledWith(reconciliationId);
  });

  it("shows permission denial without querying business data", async () => {
    harness.session.user.permissions = [];
    await act(async () => root.render(<BankingReconciliationRegister onOpen={vi.fn()} />));
    await settle();
    expect(container.textContent).toContain("banking.reconciliation.read is required");
    expect(harness.client.reconciliations).not.toHaveBeenCalled();
  });
});
