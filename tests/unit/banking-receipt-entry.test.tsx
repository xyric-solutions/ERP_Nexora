// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "../../app/lib/api/generated.js";

const harness = vi.hoisted(() => ({
  api: {
    listBankingCompanies: vi.fn(),
    listBankReceiptOptions: vi.fn(),
    listBankReceiptNominalAccounts: vi.fn(),
    getBankReceipt: vi.fn(),
    createBankReceipt: vi.fn(),
    updateBankReceipt: vi.fn(),
    submitBankReceipt: vi.fn(),
  },
  session: {
    status: "authenticated",
    tenant_id: "tenant-1",
    user: {
      id: "maker-1",
      email: "maker@example.test",
      display_name: "Receipt Maker",
      roles: ["receipt_maker"],
      permissions: ["banking.receipt.read", "banking.receipt.create", "banking.receipt.update", "banking.receipt.submit"],
    },
    csrf_token: "c".repeat(43),
    idle_expires_at: "2026-10-20T00:00:00.000Z",
    absolute_expires_at: "2026-10-20T01:00:00.000Z",
  },
}));

vi.mock("@/lib/session/session-provider", () => ({
  useSession: () => ({ api: harness.api, session: harness.session, loading: false, csrfToken: () => "csrf-token" }),
}));

import { BankingReceiptEntry } from "../../app/features/banking/views/banking-receipt-entry.js";

let container: HTMLDivElement;
let root: Root;
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

async function settle() {
  for (let index = 0; index < 3; index += 1) await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
}

function control(label: string): HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement {
  const element = container.querySelector(`[aria-label="${label}"]`);
  if (!(element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement)) throw new Error(`Missing form control: ${label}`);
  return element;
}

function change(label: string, value: string) {
  const element = control(label);
  act(() => {
    const prototype = element instanceof HTMLInputElement ? HTMLInputElement.prototype : element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLSelectElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(element, value);
    element.dispatchEvent(new Event(element instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
  });
}

function click(name: string) {
  const button = [...container.querySelectorAll("button")].find((candidate) => candidate.textContent?.trim() === name);
  if (!button) throw new Error(`Missing button: ${name}`);
  act(() => button.click());
}

function directories() {
  harness.api.listBankingCompanies.mockResolvedValue({ items: [{ id: "company-1", code: "C01", name: "Nexora Services" }] });
  harness.api.listBankReceiptOptions.mockResolvedValue({
    bank_accounts: [{ id: "bank-1", reference: "BA-2026-0001", account_name: "Operating USD", bank_name: "Synthetic Bank", account_number_masked: "•••• 7812", currency: "USD", ledger_account_code: "10-01-00200", ledger_account_name: "Bank — Operating USD" }],
    receipt_methods: [{ value: "bank_transfer", label: "Bank transfer" }, { value: "cheque", label: "Cheque" }, { value: "cash", label: "Cash" }, { value: "online", label: "Online" }, { value: "direct_debit", label: "Direct debit" }, { value: "card", label: "Card" }],
  });
  harness.api.listBankReceiptNominalAccounts.mockResolvedValue({ items: [{ id: "nominal-1", code: "40-01-00100", name: "Service revenue", account_type: "income", required_dimensions: ["department"] }] });
}

function receiptDraft() {
  return {
    id: "bank-receipt-123e4567-e89b-42d3-a456-426614174000",
    company_id: "company-1",
    reference: "BR-2026-00000007",
    bank_account_id: "bank-1",
    bank_account_name: "Operating USD",
    bank_name: "Synthetic Bank",
    account_number_masked: "•••• 7812",
    posting_date: "2026-10-19",
    value_date: null,
    currency: "USD",
    base_currency: "USD",
    exchange_rate: null,
    total_amount: "45.50",
    line_count: 1,
    payer_summary: "Atlas Customer",
    nominal_account_summary: "40-01-00100 - Service revenue",
    narration_summary: "Customer settlement",
    state: "draft",
    version: 4,
    created_at: "2026-10-19T08:00:00.000Z",
    lines: [{ id: "line-7", line_order: 1, document_date: "2026-10-18", external_reference: null, document_reference: "REC-7", receipt_method: "online", payer_name: "Atlas Customer", nominal_account_id: "nominal-1", narration: "Customer settlement", amount: "45.50", dimensions: { department: "SERVICES" } }],
    timeline: [],
    accounting_preview: { currency: "USD", lines: [{ line_order: 1, account_id: "ledger-1", account_code: "10-01-00200", account_name: "Bank — Operating USD", side: "debit", amount: "45.50", is_bank_control: true }, { line_order: 2, account_id: "nominal-1", account_code: "40-01-00100", account_name: "Service revenue", side: "credit", amount: "45.50", is_bank_control: false }], debit_total: "45.50", credit_total: "45.50" },
    created_by: "maker-1", submitted_by: null, approved_by: null, rejected_by: null, posted_by: null, reversed_by: null,
    submitted_at: null, approved_at: null, rejected_at: null, posted_at: null, reversed_at: null,
    accounting_event_id: null, journal_id: null, journal_entry_number: null,
    reversal_accounting_event_id: null, reversal_journal_id: null, reversal_journal_entry_number: null,
    self_decision_requires_override: false, super_admin_override_allowed: false,
  } as const;
}

beforeEach(() => {
  vi.resetAllMocks();
  harness.session.user.permissions.splice(0, harness.session.user.permissions.length, "banking.receipt.read", "banking.receipt.create", "banking.receipt.update", "banking.receipt.submit");
  directories();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

describe("BankingReceiptEntry", () => {
  it("persists the payer snapshot with an exact retry key, updates, then submits independently", async () => {
    const navigate = vi.fn();
    harness.api.createBankReceipt.mockRejectedValueOnce(new ApiError(503, "Temporary API failure", "SERVICE_UNAVAILABLE", "correlation-1")).mockResolvedValue({ id: receiptDraft().id, reference: "BR-2026-00000001", state: "draft", version: 1, audit_event_id: "audit-1", replayed: false });
    harness.api.updateBankReceipt.mockResolvedValue({ id: receiptDraft().id, reference: "BR-2026-00000001", state: "draft", version: 2, audit_event_id: "audit-2", replayed: false });
    harness.api.submitBankReceipt.mockResolvedValue({ id: receiptDraft().id, reference: "BR-2026-00000001", state: "submitted", version: 3, audit_event_id: "audit-3", replayed: false });
    await act(async () => root.render(<BankingReceiptEntry onNavigate={navigate} />));
    await settle();
    change("Line 1 receipt method", "bank_transfer");
    change("Line 1 received from", "Atlas Customer");
    change("Line 1 nominal account", "nominal-1");
    change("Line 1 department", "SERVICES");
    change("Line 1 narration", "Customer settlement");
    change("Line 1 amount", "1250.125");
    click("Save Draft");
    await settle();
    const firstKey = harness.api.createBankReceipt.mock.calls[0]?.[2];
    click("Save Draft");
    await settle();
    expect(harness.api.createBankReceipt.mock.calls[1]?.[2]).toBe(firstKey);
    expect(harness.api.createBankReceipt.mock.calls[1]?.[0]).toMatchObject({ company_id: "company-1", bank_account_id: "bank-1", lines: [{ payer_name: "Atlas Customer", external_reference: null, amount: "1250.125", dimensions: { department: "SERVICES" } }] });
    change("Line 1 narration", "Updated customer settlement");
    click("Submit for Approval");
    await settle();
    expect(harness.api.updateBankReceipt).toHaveBeenCalledWith(receiptDraft().id, expect.objectContaining({ expected_version: 1, lines: [expect.objectContaining({ payer_name: "Atlas Customer", narration: "Updated customer settlement" })] }), "csrf-token", expect.stringContaining("web-bank-receipt-update-"));
    expect(harness.api.submitBankReceipt).toHaveBeenCalledWith(receiptDraft().id, { expected_version: 2 }, "csrf-token", expect.stringContaining("web-bank-receipt-submit-"));
    expect(navigate).toHaveBeenLastCalledWith("transaction-detail", receiptDraft().id);
    expect(Object.keys(harness.api)).not.toContain("decideBankReceipt");
    expect(Object.keys(harness.api)).not.toContain("postBankReceipt");
  });

  it("reloads a persisted receipt draft with payer data and correct debit/credit preview", async () => {
    harness.api.getBankReceipt.mockResolvedValue(receiptDraft());
    await act(async () => root.render(<BankingReceiptEntry receiptId={receiptDraft().id} />));
    await settle();
    expect(control("Receipt reference").getAttribute("value")).toBe("BR-2026-00000007");
    expect(control("Line 1 received from").value).toBe("Atlas Customer");
    expect(container.textContent).toContain("The server-projected Bank Account ledger is debited; nominal accounts are credited");
    const previewRows = [...container.querySelectorAll('[aria-labelledby="journal-preview-heading"] tbody tr')];
    const bankRow = previewRows.find((row) => row.textContent?.includes("Bank — Operating USD"));
    const nominalRow = previewRows.find((row) => row.textContent?.includes("Service revenue"));
    expect(bankRow?.querySelectorAll("td")[1]?.textContent).toContain("45.50");
    expect(nominalRow?.querySelectorAll("td")[2]?.textContent).toContain("45.50");
    expect(nominalRow?.textContent).toContain("Atlas Customer");
    expect(container.textContent).not.toContain("Approve and Close");
  });

  it("fails closed when the persisted receipt options are denied", async () => {
    harness.api.getBankReceipt.mockResolvedValue(receiptDraft());
    harness.api.listBankReceiptOptions.mockRejectedValue(new ApiError(403, "internal policy detail", "FORBIDDEN", "correlation-denied"));
    await act(async () => root.render(<BankingReceiptEntry receiptId={receiptDraft().id} />));
    await settle();
    expect(container.textContent).toContain("Permission required");
    expect(container.textContent).toContain("The API denied access");
    expect(container.textContent).toContain("correlation-denied");
    expect(container.textContent).not.toContain("internal policy detail");
    expect(container.querySelector('[aria-label="Receipt reference"]')).toBeNull();
  });
});
