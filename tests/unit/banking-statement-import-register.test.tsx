// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  client: {
    companies: vi.fn(),
    statementImportOptions: vi.fn(),
    statementImports: vi.fn(),
  },
  session: {
    tenant_id: "tenant-1",
    user: {
      id: "reader-1",
      email: "reader@example.test",
      roles: ["statement_reader"],
      permissions: ["banking.statement_import.read", "banking.statement_import.create"],
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

import { BankingStatementImportRegister } from "../../app/features/banking/views/banking-statement-import-register.js";

const statementImport = {
  id: "bank-statement-import-123",
  company_id: "company-1",
  bank_account_id: "bank-1",
  bank_account_name: "Operating Account",
  statement_reference: "OCT-2026",
  statement_date_from: "2026-10-01",
  statement_date_to: "2026-10-31",
  original_filename: "october.csv",
  file_format: "csv",
  detected_media_type: "text/csv",
  byte_size: 128,
  checksum_sha256: "a".repeat(64),
  state: "validated",
  counts: { total: 2, valid: 2, warning: 0, error: 0, duplicate: 0, excluded: 0, finalized: 0 },
  version: 1,
  created_by: "maker-1",
  created_at: "2026-10-31T10:00:00.000Z",
  finalized_by: null,
  finalized_at: null,
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

describe("Bank Statement Import work page", () => {
  beforeEach(() => {
    harness.session.user.permissions = ["banking.statement_import.read", "banking.statement_import.create"];
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
    harness.client.statementImports.mockResolvedValue({ items: [statementImport], next_cursor: null });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.resetAllMocks();
  });

  it("loads the bounded live directory and opens persisted imports", async () => {
    const onOpen = vi.fn();
    await act(async () => root.render(<BankingStatementImportRegister onAddNew={vi.fn()} onOpen={onOpen} />));
    await settle();

    expect(harness.client.statementImports).toHaveBeenCalledWith({ company_id: "company-1", limit: 25 });
    expect(container.textContent).toContain("Operating Account");
    expect(container.textContent).toContain("01/10/2026");
    expect(container.textContent).toContain("31/10/2026");
    expect(container.textContent).toContain("OCT-2026");
    expect(container.textContent).not.toContain("Delete");

    const open = container.querySelector('[aria-label="Open statement OCT-2026"]');
    await act(async () => (open as HTMLButtonElement | null)?.click());
    expect(onOpen).toHaveBeenCalledWith(statementImport.id);
  });

  it("opens the approved new-import route and enforces read permission", async () => {
    const onAddNew = vi.fn();
    await act(async () => root.render(<BankingStatementImportRegister onAddNew={onAddNew} onOpen={vi.fn()} />));
    await settle();
    const add = [...container.querySelectorAll("button")].find((button) => button.textContent?.includes("Add New"));
    await act(async () => add?.click());
    expect(onAddNew).toHaveBeenCalledOnce();

    await act(async () => root.unmount());
    root = createRoot(container);
    harness.session.user.permissions = [];
    harness.client.statementImports.mockClear();
    await act(async () => root.render(<BankingStatementImportRegister onAddNew={vi.fn()} onOpen={vi.fn()} />));
    await settle();
    expect(container.textContent).toContain("banking.statement_import.read is required");
    expect(harness.client.statementImports).not.toHaveBeenCalled();
  });
});
