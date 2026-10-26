// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  client: {
    companies: vi.fn(),
    statementImportOptions: vi.fn(),
    statementImport: vi.fn(),
    uploadStatementImport: vi.fn(),
    downloadStatementTemplate: vi.fn(),
    updateStatementImportMapping: vi.fn(),
    updateStatementLine: vi.fn(),
    validateStatementImport: vi.fn(),
    finalizeStatementImport: vi.fn(),
  },
  session: {
    tenant_id: "tenant-1",
    user: {
      id: "maker-1",
      email: "maker@example.test",
      roles: ["bank_statement_operator"],
      permissions: [
        "banking.statement_import.read",
        "banking.statement_import.create",
        "banking.statement_import.update",
        "banking.statement_import.finalize",
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

import { BankingStatementImport } from "../../app/features/banking/views/banking-statement-import.js";

let container: HTMLDivElement;
let root: Root;
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true, PointerEvent: MouseEvent });

const detail = {
  id: "123e4567-e89b-42d3-a456-426614174000",
  company_id: "company-1",
  bank_account_id: "bank-1",
  bank_account_name: "Operating Account",
  statement_reference: "OCT-2026",
  original_filename: "october.csv",
  file_format: "csv",
  detected_media_type: "text/csv",
  byte_size: 256,
  checksum_sha256: "a".repeat(64),
  state: "validated",
  counts: { total: 1, valid: 1, warning: 0, error: 0, duplicate: 0, excluded: 0, finalized: 0 },
  version: 2,
  created_by: "maker-1",
  created_at: "2026-10-23T10:00:00.000Z",
  finalized_by: null,
  finalized_at: null,
  mapping_profile_id: null,
  supersedes_import_id: null,
  mapping_snapshot: {
    file_format: "csv",
    delimiter: ",",
    encoding: "utf-8",
    worksheet: null,
    header_row: 1,
    date_format: "dd/MM/yyyy",
    amount_convention: "separate_debit_credit",
    signed_amount_direction: null,
    columns: {
      date: "Date",
      payment: "Payment",
      receipt: "Receipts",
      signed_amount: null,
      reference: "RefNo.",
      details: "Detail",
      transaction_type: "Transaction Type",
      account_text: "Account",
      payment_mode: "Payment Mode",
    },
  },
  lines: [
    {
      id: "line-1",
      import_id: "123e4567-e89b-42d3-a456-426614174000",
      source_row_number: 2,
      raw_row: { Date: "22/10/2026" },
      transaction_date: "2026-10-22",
      direction: "money_out",
      amount: "125.50",
      currency: "USD",
      reference: "PAY-1",
      details: "Supplier payment",
      transaction_type: "Payment",
      account_text: "Supplier",
      payment_mode: "Wire",
      row_fingerprint: "b".repeat(64),
      inclusion_state: "included",
      exclusion_reason: null,
      validation_state: "valid",
      duplicate_disposition: "not_applicable",
      issues: [],
      version: 1,
    },
  ],
} as const;

async function settle() {
  for (let index = 0; index < 5; index += 1)
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
}

function change(label: string, value: string) {
  const element = container.querySelector(`[aria-label="${label}"]`);
  if (!(element instanceof HTMLInputElement || element instanceof HTMLSelectElement))
    throw new Error(`Missing form control: ${label}`);
  act(() => {
    const prototype = element instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLSelectElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(element, value);
    element.dispatchEvent(new Event(element instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
  });
}

describe("BankingStatementImport", () => {
  beforeEach(() => {
    harness.session.user.permissions = [
      "banking.statement_import.read",
      "banking.statement_import.create",
      "banking.statement_import.update",
      "banking.statement_import.finalize",
    ];
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
      date_formats: ["dd/MM/yyyy", "MM/dd/yyyy", "yyyy-MM-dd", "dd-MM-yyyy"],
      max_file_bytes: 26_214_400,
      max_rows: 1_000,
    });
    harness.client.statementImport.mockResolvedValue(detail);
    harness.client.uploadStatementImport.mockResolvedValue({
      id: detail.id,
      state: "draft",
      version: 1,
      audit_event_id: "audit-1",
      replayed: false,
    });
    harness.client.finalizeStatementImport.mockResolvedValue({
      id: detail.id,
      state: "finalized",
      version: 3,
      audit_event_id: "audit-2",
      replayed: false,
    });
    harness.client.updateStatementImportMapping.mockResolvedValue({
      id: detail.id,
      state: "draft",
      version: 3,
      audit_event_id: "audit-3",
      replayed: false,
    });
    harness.client.updateStatementLine.mockResolvedValue({
      id: detail.id,
      state: "draft",
      version: 3,
      audit_event_id: "audit-4",
      replayed: false,
    });
    harness.client.validateStatementImport.mockResolvedValue({
      id: detail.id,
      state: "validated",
      version: 2,
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

  it("uploads an authenticated statement and renders its persisted preview", async () => {
    const onOpenImport = vi.fn();
    await act(async () =>
      root.render(
        <BankingStatementImport onCancel={vi.fn()} onOpenImport={onOpenImport} onStartReconciliation={vi.fn()} />,
      ),
    );
    await settle();

    expect(container.textContent).toContain("Search");
    expect(container.textContent).toContain("Export Sample File");
    expect(container.textContent).toContain("No parsed statement rows are available");
    expect(container.querySelector('[aria-label="Company"]')).toBeNull();
    for (const heading of [
      "Date",
      "Payment",
      "Receipts",
      "Transaction Type",
      "Account",
      "Payment Mode",
      "RefNo.",
      "Detail",
      "Status",
    ]) {
      expect([...container.querySelectorAll("th")].some((cell) => cell.textContent?.trim() === heading)).toBe(true);
    }

    change("Bank", "bank-1");
    change("Statement reference", "OCT-2026");
    const fileInput = container.querySelector('[aria-label="Statement file"]');
    const file = new File(["Date,Payment,Receipts\n22/10/2026,125.50,"], "october.csv", { type: "text/csv" });
    if (!(fileInput instanceof HTMLInputElement)) throw new Error("Missing statement file input");
    Object.defineProperty(fileInput, "files", { configurable: true, value: [file] });
    act(() => fileInput.dispatchEvent(new Event("change", { bubbles: true })));
    const upload = [...container.querySelectorAll("button")].find((button) => button.textContent?.trim() === "Upload");
    await act(async () => upload?.click());
    await settle();

    expect(harness.client.uploadStatementImport).toHaveBeenCalledWith(
      expect.objectContaining({
        company_id: "company-1",
        bank_account_id: "bank-1",
        statement_reference: "OCT-2026",
        date_format: "dd/MM/yyyy",
      }),
      file,
      "csrf-token",
      expect.stringMatching(/^web-bank-statement-upload-/),
    );
    expect(onOpenImport).toHaveBeenCalledWith(detail.id);
    expect(container.textContent).toContain("Supplier payment");
    expect(container.textContent).toContain("125.50");
    expect(container.querySelector('[aria-label="valid: 1"]')).not.toBeNull();
  });

  it("finalizes a validated import and hands it to reconciliation without posting the ledger", async () => {
    const onStartReconciliation = vi.fn();
    await act(async () =>
      root.render(
        <BankingStatementImport
          importId={detail.id}
          onCancel={vi.fn()}
          onOpenImport={vi.fn()}
          onStartReconciliation={onStartReconciliation}
        />,
      ),
    );
    await settle();

    expect(container.textContent).toContain(
      "Finalizing makes included rows available for reconciliation. It does not post to the ledger.",
    );
    const finalize = [...container.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "Post and Close",
    );
    await act(async () => finalize?.click());
    await settle();

    expect(harness.client.finalizeStatementImport).toHaveBeenCalledWith(
      detail.id,
      { expected_version: 2 },
      "csrf-token",
      expect.stringMatching(/^web-bank-statement-finalize-/),
    );
    expect(onStartReconciliation).toHaveBeenCalledWith({ importId: detail.id, bankAccountId: "bank-1" });
  });

  it("reloads the authoritative detail after validation returns a mutation result", async () => {
    await act(async () =>
      root.render(
        <BankingStatementImport
          importId={detail.id}
          onCancel={vi.fn()}
          onOpenImport={vi.fn()}
          onStartReconciliation={vi.fn()}
        />,
      ),
    );
    await settle();
    harness.client.statementImport.mockClear();
    const validate = [...container.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "Validate Statement",
    );
    await act(async () => validate?.click());
    await settle();

    expect(harness.client.validateStatementImport).toHaveBeenCalledWith(
      detail.id,
      { expected_version: 2 },
      "csrf-token",
      expect.stringMatching(/^web-bank-statement-validate-/),
    );
    expect(harness.client.statementImport).toHaveBeenCalledWith(detail.id);
    expect(container.textContent).toContain("Validation completed.");
  });

  it("saves native-bank mapping profiles and auditable row exclusions through guarded APIs", async () => {
    await act(async () =>
      root.render(
        <BankingStatementImport
          importId={detail.id}
          onCancel={vi.fn()}
          onOpenImport={vi.fn()}
          onStartReconciliation={vi.fn()}
        />,
      ),
    );
    await settle();

    const editMapping = [...container.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "Edit mapping",
    );
    await act(async () => editMapping?.click());
    change("Header row", "2");
    change("Mapping profile name", "Bank A native export");
    const saveMapping = [...container.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "Save mapping",
    );
    await act(async () => saveMapping?.click());
    await settle();

    expect(harness.client.updateStatementImportMapping).toHaveBeenCalledWith(
      detail.id,
      expect.objectContaining({
        expected_version: 2,
        mapping: expect.objectContaining({ header_row: 2 }),
        save_profile: { name: "Bank A native export" },
      }),
      "csrf-token",
      expect.stringMatching(/^web-bank-statement-mapping-/),
    );

    const include = container.querySelector('[aria-label="Include row 2"]');
    if (!(include instanceof HTMLElement)) throw new Error("Missing row inclusion control");
    await act(async () => include.click());
    change("Exclusion reason row 2", "Not a company transaction");
    const apply = [...container.querySelectorAll("button")].find((button) => button.textContent?.trim() === "Apply");
    await act(async () => apply?.click());
    await settle();

    expect(harness.client.updateStatementLine).toHaveBeenCalledWith(
      detail.id,
      "line-1",
      {
        expected_version: 1,
        inclusion_state: "excluded",
        exclusion_reason: "Not a company transaction",
        duplicate_disposition: "not_applicable",
      },
      "csrf-token",
      expect.stringMatching(/^web-bank-statement-line-/),
    );
  });

  it("keeps finalization unavailable when the authenticated user lacks that permission", async () => {
    harness.session.user.permissions = harness.session.user.permissions.filter(
      (permission) => permission !== "banking.statement_import.finalize",
    );
    await act(async () =>
      root.render(
        <BankingStatementImport
          importId={detail.id}
          onCancel={vi.fn()}
          onOpenImport={vi.fn()}
          onStartReconciliation={vi.fn()}
        />,
      ),
    );
    await settle();

    const finalize = [...container.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "Post and Close",
    );
    expect(finalize?.disabled).toBe(true);
  });
});
