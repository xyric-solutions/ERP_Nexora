// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/shared/ui/searchable-select", async () => ({
  SearchableSelect: (await import("./searchable-select-double.js")).SearchableSelectDouble,
}));

import { ApiError } from "../../app/lib/api/generated.js";
import { ActionFeedbackProvider } from "../../app/shared/ui/action-feedback.js";

const harness = vi.hoisted(() => ({
  api: {
    listBankWorkflowOptions: vi.fn(async () => ({ items: [], selected: null, next_cursor: null })),
    listBankingCompanies: vi.fn(),
    listBankReceiptOptions: vi.fn(),
    listBankReceiptNominalAccounts: vi.fn(),
    getBankReceipt: vi.fn(),
    createBankReceipt: vi.fn(),
    updateBankReceipt: vi.fn(),
    submitBankReceipt: vi.fn(),
    decideBankReceipt: vi.fn(),
    postBankReceipt: vi.fn(),
  },
  session: {
    status: "authenticated",
    tenant_id: "tenant-1",
    user: {
      id: "maker-1",
      email: "maker@example.test",
      display_name: "Receipt Maker",
      roles: ["receipt_maker"],
      permissions: [
        "banking.receipt.read",
        "banking.receipt.create",
        "banking.receipt.update",
        "banking.receipt.submit",
      ],
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
  for (let index = 0; index < 3; index += 1)
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
}

function control(label: string): HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement {
  const element = container.querySelector(`[aria-label="${label}"]`);
  if (!(
    element instanceof HTMLInputElement ||
    element instanceof HTMLSelectElement ||
    element instanceof HTMLTextAreaElement
  ))
    throw new Error(`Missing form control: ${label}`);
  return element;
}

function change(label: string, value: string) {
  const element = control(label);
  act(() => {
    const prototype =
      element instanceof HTMLInputElement
        ? HTMLInputElement.prototype
        : element instanceof HTMLTextAreaElement
          ? HTMLTextAreaElement.prototype
          : HTMLSelectElement.prototype;
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
  harness.api.listBankingCompanies.mockResolvedValue({
    items: [{ id: "company-1", code: "C01", name: "Nexora Services" }],
  });
  harness.api.listBankReceiptOptions.mockResolvedValue({
    bank_accounts: [
      {
        id: "bank-1",
        reference: "BA-2026-0001",
        account_name: "Operating USD",
        bank_name: "Synthetic Bank",
        account_number_masked: "•••• 7812",
        currency: "USD",
        ledger_account_code: "10-01-00200",
        ledger_account_name: "Bank — Operating USD",
      },
    ],
    receipt_methods: [
      { value: "bank_transfer", label: "Bank transfer" },
      { value: "cheque", label: "Cheque" },
      { value: "cash", label: "Cash" },
      { value: "online", label: "Online" },
      { value: "direct_debit", label: "Direct debit" },
      { value: "card", label: "Card" },
    ],
  });
  harness.api.listBankReceiptNominalAccounts.mockResolvedValue({
    items: [
      {
        id: "nominal-1",
        code: "40-01-00100",
        name: "Service revenue",
        account_type: "income",
        required_dimensions: ["department"],
      },
    ],
  });
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
    lines: [
      {
        id: "line-7",
        line_order: 1,
        document_date: "2026-10-18",
        external_reference: null,
        document_reference: "REC-7",
        receipt_method: "online",
        payer_name: "Atlas Customer",
        nominal_account_id: "nominal-1",
        narration: "Customer settlement",
        amount: "45.50",
        dimensions: { department: "SERVICES" },
      },
    ],
    timeline: [],
    accounting_preview: {
      currency: "USD",
      lines: [
        {
          line_order: 1,
          account_id: "ledger-1",
          account_code: "10-01-00200",
          account_name: "Bank — Operating USD",
          side: "debit",
          amount: "45.50",
          is_bank_control: true,
        },
        {
          line_order: 2,
          account_id: "nominal-1",
          account_code: "40-01-00100",
          account_name: "Service revenue",
          side: "credit",
          amount: "45.50",
          is_bank_control: false,
        },
      ],
      debit_total: "45.50",
      credit_total: "45.50",
    },
    created_by: "maker-1",
    submitted_by: null,
    approved_by: null,
    rejected_by: null,
    posted_by: null,
    reversed_by: null,
    submitted_at: null,
    approved_at: null,
    rejected_at: null,
    posted_at: null,
    reversed_at: null,
    accounting_event_id: null,
    journal_id: null,
    journal_entry_number: null,
    reversal_accounting_event_id: null,
    reversal_journal_id: null,
    reversal_journal_entry_number: null,
    self_decision_requires_override: false,
    super_admin_override_allowed: false,
  } as const;
}

beforeEach(() => {
  vi.resetAllMocks();
  harness.session.user.roles.splice(0, harness.session.user.roles.length, "receipt_maker");
  harness.session.user.permissions.splice(
    0,
    harness.session.user.permissions.length,
    "banking.receipt.read",
    "banking.receipt.create",
    "banking.receipt.update",
    "banking.receipt.submit",
  );
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
  it("retains the newly saved draft and explains a closed-period submission failure without approving or duplicating it", async () => {
    const navigate = vi.fn();
    harness.api.createBankReceipt.mockResolvedValue({
      id: receiptDraft().id,
      reference: receiptDraft().reference,
      state: "draft",
      version: 1,
      audit_event_id: "audit-create",
      replayed: false,
    });
    harness.api.submitBankReceipt.mockRejectedValue(
      new ApiError(
        409,
        "The Finance period for this posting date is not open.",
        "RECEIPT_PERIOD_LOCKED",
        "closed-period-reference",
      ),
    );
    await act(async () => root.render(<BankingReceiptEntry onNavigate={navigate} />));
    await settle();
    await settle();
    change("Line 1 receipt method", "bank_transfer");
    change("Line 1 nominal account", "nominal-1");
    change("Line 1 department", "SERVICES");
    change("Line 1 details", "Save before period validation");
    change("Line 1 amount", "25.50");
    click("Submit for Approval");
    await settle();
    await settle();
    expect(container.textContent).toContain(`Draft ${receiptDraft().reference} is saved`);
    expect(container.textContent).toContain("closed-period-reference");
    expect(container.textContent).toContain("Nothing was approved or posted");
    expect(navigate).not.toHaveBeenCalledWith("transaction-detail", receiptDraft().id);
    const key = harness.api.submitBankReceipt.mock.calls[0]?.[3];
    click("Submit for Approval");
    await settle();
    expect(harness.api.createBankReceipt).toHaveBeenCalledOnce();
    expect(harness.api.submitBankReceipt.mock.calls[1]?.[3]).toBe(key);
    expect(harness.api.decideBankReceipt).not.toHaveBeenCalled();
    expect(harness.api.postBankReceipt).not.toHaveBeenCalled();
  });
  it("preserves an existing document reference when editing the consolidated Details field", async () => {
    const draft = receiptDraft();
    harness.api.getBankReceipt.mockResolvedValue(draft);
    harness.api.updateBankReceipt.mockResolvedValue({
      id: draft.id,
      reference: draft.reference,
      state: "draft",
      version: 5,
      audit_event_id: "audit-update",
      replayed: false,
    });
    await act(async () => root.render(<BankingReceiptEntry receiptId={draft.id} />));
    await settle();
    expect(container.querySelector('[aria-label="Line 1 document reference"]')).toBeNull();
    change("Line 1 details", "Updated details only");
    click("Save Draft");
    await settle();
    expect(harness.api.updateBankReceipt).toHaveBeenCalledWith(
      draft.id,
      expect.objectContaining({
        lines: [
          expect.objectContaining({
            document_reference: "REC-7",
            payer_name: "Updated details only",
            narration: "Updated details only",
          }),
        ],
      }),
      "csrf-token",
      expect.any(String),
    );
  });
  it("explains pending company nominals and refreshes without inventing selectable options", async () => {
    const availability = {
      eligible_count: 0,
      matching_count: 0,
      pending_approval_count: 227,
      inactive_count: 4,
      protected_count: 14,
      has_more: false,
    };
    harness.api.listBankReceiptNominalAccounts.mockResolvedValueOnce({ items: [], availability });
    const review = vi.fn();
    harness.session.user.permissions.push("finance.nominal.read");
    await act(async () => root.render(<BankingReceiptEntry onReviewNominals={review} />));
    await settle();
    await settle();
    expect(container.textContent).toContain("227 awaiting Super Admin review/activation");
    expect(container.textContent).toContain("The company Chart of Accounts is connected");
    expect((control("Line 1 nominal account") as HTMLSelectElement).options).toHaveLength(1);
    click("Review Chart of Accounts");
    expect(review).toHaveBeenCalledOnce();
    click("Refresh nominal accounts");
    await settle();
    await settle();
    expect(harness.api.listBankReceiptNominalAccounts).toHaveBeenCalledTimes(2);
    expect((control("Line 1 nominal account") as HTMLSelectElement).options[1]?.textContent).toContain(
      "Service revenue",
    );
  });

  it("distinguishes failed directory access and permits a real retry without clearing the form", async () => {
    harness.api.listBankReceiptNominalAccounts.mockRejectedValueOnce(
      new ApiError(503, "Directory temporarily unavailable", "UNAVAILABLE"),
    );
    await act(async () => root.render(<BankingReceiptEntry />));
    await settle();
    await settle();
    expect(container.textContent).toContain("Receipt options unavailable");
    expect(container.textContent).not.toContain("No eligible nominal accounts");
    expect(control("Line 1 nominal account").disabled).toBe(true);
    change("Line 1 details", "Keep this unsaved description");
    click("Retry account options");
    await settle();
    await settle();
    expect(control("Line 1 details").value).toBe("Keep this unsaved description");
    expect(control("Line 1 nominal account").disabled).toBe(false);
    expect(harness.api.createBankReceipt).not.toHaveBeenCalled();
  });

  it("shows search misses separately and retains the selected nominal across search errors", async () => {
    await act(async () => root.render(<BankingReceiptEntry />));
    await settle();
    await settle();
    change("Line 1 nominal account", "nominal-1");
    harness.api.listBankReceiptNominalAccounts.mockResolvedValueOnce({
      items: [],
      availability: {
        eligible_count: 1,
        matching_count: 0,
        pending_approval_count: 0,
        inactive_count: 0,
        protected_count: 1,
        has_more: false,
      },
    });
    change("Search nominal accounts", "NoMatch");
    expect(control("Line 1 nominal account").disabled).toBe(true);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 300));
    });
    expect(container.textContent).toContain("No matching nominal accounts");
    expect(container.textContent).not.toContain("No eligible nominal accounts");
    expect(control("Line 1 nominal account").value).toBe("nominal-1");
    harness.api.listBankReceiptNominalAccounts.mockRejectedValueOnce(
      new ApiError(503, "Temporary directory failure", "UNAVAILABLE"),
    );
    change("Search nominal accounts", "Unavailable");
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 300));
    });
    expect(control("Line 1 nominal account").value).toBe("nominal-1");
    expect(control("Line 1 nominal account").disabled).toBe(true);
  });

  it("searches the server directory beyond the initial page and retains selected account identities", async () => {
    harness.api.listBankReceiptNominalAccounts.mockImplementation(async (query: string) => ({
      items: query.includes("search=Remote")
        ? [
            {
              id: "remote-nominal",
              code: "REMOTE-250",
              name: "Remote nominal",
              account_type: "expense",
              required_dimensions: [],
            },
          ]
        : [
            {
              id: "nominal-1",
              code: "INITIAL-1",
              name: "Initial nominal",
              account_type: "expense",
              required_dimensions: ["department"],
            },
          ],
    }));
    await act(async () => root.render(<BankingReceiptEntry />));
    await settle();
    await settle();
    change("Line 1 nominal account", "nominal-1");
    change("Search nominal accounts", "Remote 250");
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 300));
    });
    expect(harness.api.listBankReceiptNominalAccounts).toHaveBeenLastCalledWith(
      expect.stringContaining("search=Remote"),
    );
    const nominal = control("Line 1 nominal account") as HTMLSelectElement;
    expect([...nominal.options].map((option) => option.value)).toContain("remote-nominal");
    expect(nominal.value).toBe("nominal-1");
    expect([...nominal.options].map((option) => option.value)).toContain("nominal-1");
  });

  it("retains a newly saved transaction after approval failure and reports only confirmed phases", async () => {
    const draft = receiptDraft();
    harness.session.user.roles.splice(0, harness.session.user.roles.length, "super_administrator");
    harness.session.user.permissions.push("banking.receipt.approve", "platform.approval.override");
    harness.api.createBankReceipt.mockResolvedValue({
      id: draft.id,
      reference: draft.reference,
      state: "draft",
      version: 1,
    });
    harness.api.submitBankReceipt.mockResolvedValue({
      id: draft.id,
      reference: draft.reference,
      state: "submitted",
      version: 2,
    });
    harness.api.getBankReceipt.mockResolvedValue({
      ...draft,
      state: "submitted",
      version: 2,
      self_decision_requires_override: true,
      super_admin_override_allowed: true,
    });
    harness.api.decideBankReceipt
      .mockRejectedValueOnce(new ApiError(503, "Approval unavailable", "SERVICE_UNAVAILABLE"))
      .mockResolvedValue({ id: draft.id, reference: draft.reference, state: "approved", version: 3 });
    const navigate = vi.fn(),
      notify = vi.fn();
    await act(async () =>
      root.render(
        <ActionFeedbackProvider onSuccess={notify}>
          <BankingReceiptEntry onNavigate={navigate} />
        </ActionFeedbackProvider>,
      ),
    );
    await settle();
    await settle();
    change("Line 1 receipt method", "bank_transfer");
    change("Line 1 nominal account", "nominal-1");
    change("Line 1 department", "SERVICES");
    change("Line 1 details", "Synthetic entry acceptance");
    change("Line 1 amount", "12.50");
    click("Approve & Close");
    await settle();
    expect(notify).toHaveBeenCalledWith("Bank Receipt created successfully.");
    expect(notify).toHaveBeenCalledWith("Bank Receipt submitted for approval successfully.");
    expect(notify).not.toHaveBeenCalledWith("Bank Receipt approved successfully.");
    expect(navigate).not.toHaveBeenCalledWith("bank-receipts");
    click("Approve & Close");
    await settle();
    expect(harness.api.createBankReceipt).toHaveBeenCalledOnce();
    expect(harness.api.submitBankReceipt).toHaveBeenCalledOnce();
    expect(harness.api.updateBankReceipt).not.toHaveBeenCalled();
    expect(harness.api.postBankReceipt).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledWith("Bank Receipt approved successfully.");
    expect(navigate).toHaveBeenLastCalledWith("bank-receipts");
  });

  it("does not offer self-approval to an ordinary maker even with approval permission", async () => {
    harness.session.user.permissions.push("banking.receipt.approve", "platform.approval.override");
    await act(async () => root.render(<BankingReceiptEntry />));
    await settle();
    await settle();
    expect(container.textContent).not.toContain("Approve & Close");
    expect(container.textContent).toContain("Submit for Approval");
    expect(harness.api.decideBankReceipt).not.toHaveBeenCalled();
  });

  function configureApproval(overrideAllowed = true) {
    const draft = receiptDraft();
    harness.session.user.roles.splice(0, harness.session.user.roles.length, "super_administrator");
    harness.session.user.permissions.push("banking.receipt.approve", "platform.approval.override");
    harness.api.getBankReceipt.mockResolvedValueOnce(draft).mockResolvedValue({
      ...draft,
      state: "submitted",
      version: 5,
      self_decision_requires_override: true,
      super_admin_override_allowed: overrideAllowed,
    });
    harness.api.submitBankReceipt.mockResolvedValue({
      id: draft.id,
      reference: draft.reference,
      state: "submitted",
      version: 5,
    });
    harness.api.decideBankReceipt.mockResolvedValue({
      id: draft.id,
      reference: draft.reference,
      state: "approved",
      version: 6,
    });
    return draft;
  }

  it("uses the reference grid with visible dates and plain details, and adds/removes rows", async () => {
    await act(async () => root.render(<BankingReceiptEntry />));
    await settle();
    await settle();
    const table = container.querySelector('[aria-labelledby="receipt-lines-heading"] table');
    expect([...table!.querySelectorAll("thead th")].map((cell) => cell.textContent)).toEqual([
      "Date *",
      "Ref. No.",
      "Mode *",
      "Nominal Account *",
      "Details *",
      "Amount *",
      "Remove",
    ]);
    expect(control("Receive into").closest("label")?.textContent).toContain("Bank");
    expect(control("Posting date").closest("details")).toBeNull();
    expect(control("Value date").closest("details")).toBeNull();
    expect(control("Line 1 details")).toBeInstanceOf(HTMLTextAreaElement);
    expect(container.querySelector('[aria-label="Line 1 document reference"]')).toBeNull();
    expect(container.querySelector('[aria-label="Line 1 received from"]')).toBeNull();
    expect(container.querySelector('[aria-label="Line 1 narration"]')).toBeNull();
    expect(control("Line 1 details").classList.contains("h-10")).toBe(true);
    expect(table?.classList.contains("table-fixed")).toBe(true);
    change("Value date", "2026-10-21");
    expect(control("Value date").value).toBe("2026-10-21");
    expect(control("Receipt reference").closest("details")?.open).toBe(false);
    expect(container.querySelector('[aria-labelledby="journal-preview-heading"]')?.closest("details")?.open).toBe(
      false,
    );
    expect(container.textContent).not.toContain("WHT Payments");
    change("Line 1 amount", "10.25");
    click("+ Add More");
    change("Line 2 amount", "2.50");
    expect(table!.querySelector("tfoot")?.textContent).toContain("12.75");
    const remove = container.querySelector('[aria-label="Remove line 2"]') as HTMLButtonElement;
    act(() => remove.click());
    expect(table!.querySelectorAll("tbody tr")).toHaveLength(1);
    expect(table!.querySelector("tfoot")?.textContent).toContain("10.25");
  });

  it("approves and closes only after server eligibility and never posts", async () => {
    const draft = configureApproval();
    const navigate = vi.fn();
    await act(async () => root.render(<BankingReceiptEntry receiptId={draft.id} onNavigate={navigate} />));
    await settle();
    await settle();
    click("Approve & Close");
    await settle();
    expect(harness.api.submitBankReceipt).toHaveBeenCalledWith(
      draft.id,
      { expected_version: 4 },
      "csrf-token",
      expect.any(String),
    );
    expect(harness.api.decideBankReceipt).toHaveBeenCalledWith(
      draft.id,
      { action: "approve", expected_version: 5 },
      "csrf-token",
      expect.stringContaining("web-bank-receipt-approve-"),
    );
    expect(navigate).toHaveBeenLastCalledWith("bank-receipts");
    expect(harness.api.postBankReceipt).not.toHaveBeenCalled();
  });

  it("keeps a submitted transaction open when the API denies self-approval", async () => {
    const draft = configureApproval(false);
    const navigate = vi.fn();
    await act(async () => root.render(<BankingReceiptEntry receiptId={draft.id} onNavigate={navigate} />));
    await settle();
    await settle();
    click("Approve & Close");
    await settle();
    expect(container.textContent).toContain("approval is not available to this session");
    expect(harness.api.decideBankReceipt).not.toHaveBeenCalled();
    expect(harness.api.createBankReceipt).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });

  it("retries approval with the same key without saving or submitting again", async () => {
    const draft = configureApproval();
    harness.api.decideBankReceipt
      .mockRejectedValueOnce(
        new ApiError(503, "Temporary approval failure", "SERVICE_UNAVAILABLE", "synthetic-approval"),
      )
      .mockResolvedValue({ id: draft.id, reference: draft.reference, state: "approved", version: 6 });
    const navigate = vi.fn();
    await act(async () => root.render(<BankingReceiptEntry receiptId={draft.id} onNavigate={navigate} />));
    await settle();
    await settle();
    click("Approve & Close");
    await settle();
    expect(container.textContent).toContain("Temporary approval failure");
    expect(navigate).not.toHaveBeenCalled();
    const first = harness.api.decideBankReceipt.mock.calls[0];
    click("Approve & Close");
    await settle();
    expect(harness.api.decideBankReceipt.mock.calls[1]).toEqual(first);
    expect(harness.api.submitBankReceipt).toHaveBeenCalledOnce();
    expect(harness.api.createBankReceipt).not.toHaveBeenCalled();
    expect(harness.api.updateBankReceipt).not.toHaveBeenCalled();
    expect(harness.api.postBankReceipt).not.toHaveBeenCalled();
    expect(navigate).toHaveBeenLastCalledWith("bank-receipts");
  });

  it("recovers an approval whose response was lost by reading the committed state", async () => {
    const draft = configureApproval();
    harness.api.getBankReceipt.mockResolvedValueOnce({
      ...draft,
      state: "submitted",
      version: 5,
      self_decision_requires_override: true,
      super_admin_override_allowed: true,
    });
    harness.api.decideBankReceipt.mockRejectedValueOnce(
      new ApiError(503, "Response lost", "SERVICE_UNAVAILABLE", "synthetic-lost"),
    );
    const navigate = vi.fn();
    await act(async () => root.render(<BankingReceiptEntry receiptId={draft.id} onNavigate={navigate} />));
    await settle();
    await settle();
    click("Approve & Close");
    await settle();
    harness.api.getBankReceipt.mockResolvedValue({ ...draft, state: "approved", version: 6 });
    click("Approve & Close");
    await settle();
    expect(harness.api.decideBankReceipt).toHaveBeenCalledOnce();
    expect(harness.api.submitBankReceipt).toHaveBeenCalledOnce();
    expect(harness.api.postBankReceipt).not.toHaveBeenCalled();
    expect(navigate).toHaveBeenLastCalledWith("bank-receipts");
  });

  it("persists the payer snapshot with an exact retry key, updates, then submits independently", async () => {
    const navigate = vi.fn();
    harness.api.createBankReceipt
      .mockRejectedValueOnce(new ApiError(503, "Temporary API failure", "SERVICE_UNAVAILABLE", "correlation-1"))
      .mockResolvedValue({
        id: receiptDraft().id,
        reference: "BR-2026-00000001",
        state: "draft",
        version: 1,
        audit_event_id: "audit-1",
        replayed: false,
      });
    harness.api.updateBankReceipt.mockResolvedValue({
      id: receiptDraft().id,
      reference: "BR-2026-00000001",
      state: "draft",
      version: 2,
      audit_event_id: "audit-2",
      replayed: false,
    });
    harness.api.submitBankReceipt.mockResolvedValue({
      id: receiptDraft().id,
      reference: "BR-2026-00000001",
      state: "submitted",
      version: 3,
      audit_event_id: "audit-3",
      replayed: false,
    });
    await act(async () => root.render(<BankingReceiptEntry onNavigate={navigate} />));
    await settle();
    change("Line 1 receipt method", "bank_transfer");
    change("Line 1 nominal account", "nominal-1");
    change("Line 1 department", "SERVICES");
    change("Line 1 details", "Customer settlement");
    change("Line 1 amount", "1250.125");
    click("Save Draft");
    await settle();
    const firstKey = harness.api.createBankReceipt.mock.calls[0]?.[2];
    click("Save Draft");
    await settle();
    expect(harness.api.createBankReceipt.mock.calls[1]?.[2]).toBe(firstKey);
    expect(harness.api.createBankReceipt.mock.calls[1]?.[0]).toMatchObject({
      company_id: "company-1",
      bank_account_id: "bank-1",
      lines: [
        {
          payer_name: "Customer settlement",
          narration: "Customer settlement",
          external_reference: null,
          amount: "1250.125",
          dimensions: { department: "SERVICES" },
        },
      ],
    });
    change("Line 1 details", "Updated customer settlement");
    click("Submit for Approval");
    await settle();
    expect(harness.api.updateBankReceipt).toHaveBeenCalledWith(
      receiptDraft().id,
      expect.objectContaining({
        expected_version: 1,
        lines: [
          expect.objectContaining({
            payer_name: "Updated customer settlement",
            narration: "Updated customer settlement",
          }),
        ],
      }),
      "csrf-token",
      expect.stringContaining("web-bank-receipt-update-"),
    );
    expect(harness.api.submitBankReceipt).toHaveBeenCalledWith(
      receiptDraft().id,
      { expected_version: 2 },
      "csrf-token",
      expect.stringContaining("web-bank-receipt-submit-"),
    );
    expect(navigate).toHaveBeenLastCalledWith("transaction-detail", receiptDraft().id);
    expect(harness.api.decideBankReceipt).not.toHaveBeenCalled();
    expect(harness.api.postBankReceipt).not.toHaveBeenCalled();
  });

  it("reloads a persisted receipt draft with payer data and correct debit/credit preview", async () => {
    harness.api.getBankReceipt.mockResolvedValue(receiptDraft());
    await act(async () => root.render(<BankingReceiptEntry receiptId={receiptDraft().id} />));
    await settle();
    expect(control("Receipt reference").getAttribute("value")).toBe("BR-2026-00000007");
    expect(control("Line 1 details").value).toBe("Customer settlement");
    expect(container.querySelector('[aria-label="Line 1 received from"]')).toBeNull();
    expect(container.querySelector('[aria-label="Line 1 narration"]')).toBeNull();
    expect(container.textContent).toContain(
      "The server-projected Bank Account ledger is debited; nominal accounts are credited",
    );
    const previewRows = [...container.querySelectorAll('[aria-labelledby="journal-preview-heading"] tbody tr')];
    const bankRow = previewRows.find((row) => row.textContent?.includes("Bank — Operating USD"));
    const nominalRow = previewRows.find((row) => row.textContent?.includes("Service revenue"));
    expect(bankRow?.querySelectorAll("td")[1]?.textContent).toContain("45.50");
    expect(nominalRow?.querySelectorAll("td")[2]?.textContent).toContain("45.50");
    expect(nominalRow?.textContent).toContain("Customer settlement");
    expect(container.textContent).not.toContain("Approve and Close");
  });

  it("fails closed when the persisted receipt options are denied", async () => {
    harness.api.getBankReceipt.mockResolvedValue(receiptDraft());
    harness.api.listBankReceiptOptions.mockRejectedValue(
      new ApiError(403, "internal policy detail", "FORBIDDEN", "correlation-denied"),
    );
    await act(async () => root.render(<BankingReceiptEntry receiptId={receiptDraft().id} />));
    await settle();
    expect(container.textContent).toContain("Permission required");
    expect(container.textContent).toContain("The API denied access");
    expect(container.textContent).toContain("correlation-denied");
    expect(container.textContent).not.toContain("internal policy detail");
    expect(container.querySelector('[aria-label="Receipt reference"]')).toBeNull();
  });
});
