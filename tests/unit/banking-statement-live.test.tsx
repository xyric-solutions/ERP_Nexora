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
  },
  session: {
    tenant_id: "tenant-1",
    user: {
      id: "user-1",
      email: "user@example.test",
      roles: ["bank_statement_reader"],
      permissions: ["banking.statement_import.read"],
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

import { LiveBankStatement as BankStatement } from "../../app/features/banking/views/banking-statement-live.js";

const importId = "123e4567-e89b-42d3-a456-426614174000";
const summary = {
  id: importId,
  company_id: "company-1",
  bank_account_id: "bank-1",
  bank_account_name: "Operating Account",
  statement_reference: "OCT-2026",
  original_filename: "october.csv",
  file_format: "csv",
  detected_media_type: "text/csv",
  byte_size: 100,
  checksum_sha256: "a".repeat(64),
  state: "finalized",
  counts: { total: 2, valid: 2, warning: 0, error: 0, duplicate: 0, excluded: 0, finalized: 2 },
  version: 3,
  created_by: "user-1",
  created_at: "2026-10-23T10:00:00.000Z",
  finalized_by: "user-1",
  finalized_at: "2026-10-23T10:05:00.000Z",
} as const;

const detail = {
  ...summary,
  mapping_profile_id: null,
  mapping_snapshot: null,
  supersedes_import_id: null,
  lines: [
    {
      id: "line-1",
      import_id: importId,
      source_row_number: 2,
      raw_row: { Date: "22/10/2026" },
      transaction_date: "2026-10-22",
      direction: "money_in",
      amount: "500.00",
      currency: "USD",
      reference: "DEP-1",
      details: "Customer receipt",
      transaction_type: "Receipt",
      account_text: "Customer",
      payment_mode: "ACH",
      row_fingerprint: "b".repeat(64),
      inclusion_state: "included",
      exclusion_reason: null,
      validation_state: "valid",
      duplicate_disposition: "not_applicable",
      issues: [],
      version: 1,
    },
    {
      id: "line-2",
      import_id: importId,
      source_row_number: 3,
      raw_row: { Date: "23/10/2026" },
      transaction_date: "2026-10-23",
      direction: "money_out",
      amount: "125.25",
      currency: "USD",
      reference: "PAY-1",
      details: "Supplier payment",
      transaction_type: "Payment",
      account_text: "Supplier",
      payment_mode: "Wire",
      row_fingerprint: "c".repeat(64),
      inclusion_state: "included",
      exclusion_reason: null,
      validation_state: "valid",
      duplicate_disposition: "not_applicable",
      issues: [],
      version: 1,
    },
  ],
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

describe("live Bank Statement", () => {
  beforeEach(() => {
    harness.session.user.permissions = ["banking.statement_import.read"];
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
    harness.client.statementImports.mockResolvedValue({ items: [summary], next_cursor: null });
    harness.client.statementImport.mockResolvedValue(detail);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.resetAllMocks();
  });

  it("loads finalized imports and their persisted statement rows", async () => {
    const onReconcile = vi.fn();
    await act(async () =>
      root.render(
        <BankStatement accountId="bank-1" onAction={vi.fn()} onOpenTransaction={vi.fn()} onReconcile={onReconcile} />,
      ),
    );
    await settle();

    expect(harness.client.statementImports).toHaveBeenCalledWith(
      expect.objectContaining({ company_id: "company-1", bank_account_id: "bank-1", state: "finalized" }),
    );
    expect(harness.client.statementImport).toHaveBeenCalledWith(importId);
    expect(container.textContent).toContain("Customer receipt");
    expect(container.textContent).toContain("500.00");
    expect(container.textContent).toContain("125.25");

    const reconcile = [...container.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "Reconcile",
    );
    await act(async () => reconcile?.click());
    expect(onReconcile).toHaveBeenCalledWith("bank-1", importId);
  });

  it("fails closed when statement-read permission is missing", async () => {
    harness.session.user.permissions = [];
    await act(async () =>
      root.render(<BankStatement accountId="bank-1" onAction={vi.fn()} onOpenTransaction={vi.fn()} />),
    );
    await settle();
    expect(container.textContent).toContain("banking.statement_import.read is required");
    expect(harness.client.statementImports).not.toHaveBeenCalled();
  });
});
