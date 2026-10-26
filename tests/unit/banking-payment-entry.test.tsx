// @vitest-environment jsdom

import { act, useState } from "react";
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
    listBankPaymentOptions: vi.fn(),
    listBankPaymentNominalAccounts: vi.fn(),
    getBankPayment: vi.fn(),
    createBankPayment: vi.fn(),
    updateBankPayment: vi.fn(),
    submitBankPayment: vi.fn(),
    decideBankPayment: vi.fn(),
    postBankPayment: vi.fn(),
  },
  session: {
    status: "authenticated",
    tenant_id: "tenant-1",
    user: {
      id: "maker-1",
      email: "maker@example.test",
      display_name: "Payment Maker",
      roles: ["payment_maker"],
      permissions: [
        "banking.payment.read",
        "banking.payment.create",
        "banking.payment.update",
        "banking.payment.submit",
      ],
    },
    csrf_token: "c".repeat(43),
    idle_expires_at: "2026-10-20T00:00:00.000Z",
    absolute_expires_at: "2026-10-20T01:00:00.000Z",
  },
}));

vi.mock("@/lib/session/session-provider", () => ({
  useSession: () => ({
    api: harness.api,
    session: harness.session,
    loading: false,
    csrfToken: () => "csrf-token",
  }),
}));

import { BankingPaymentEntry } from "../../app/features/banking/views/banking-payment-entry.js";

let container: HTMLDivElement;
let root: Root;

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

async function settle() {
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
  )) {
    throw new Error(`Missing form control: ${label}`);
  }
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
    const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
    setter?.call(element, value);
    element.dispatchEvent(new Event(element instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
  });
}

function click(name: string) {
  const button = [...container.querySelectorAll("button")].find((candidate) => candidate.textContent?.trim() === name);
  if (!button) throw new Error(`Missing button: ${name}`);
  act(() => button.click());
}

function standardDirectories() {
  harness.api.listBankingCompanies.mockResolvedValue({
    items: [{ id: "company-1", code: "C01", name: "Nexora Services" }],
  });
  harness.api.listBankPaymentOptions.mockResolvedValue({
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
  });
  harness.api.listBankPaymentNominalAccounts.mockResolvedValue({
    items: [
      {
        id: "nominal-1",
        code: "60-05-00100",
        name: "Travel expense",
        account_type: "expense",
        required_dimensions: ["department"],
      },
    ],
  });
}

function directDraft() {
  return {
    id: "payment-7",
    company_id: "company-1",
    reference: "BP-2026-000007",
    bank_account_id: "bank-1",
    bank_account_name: "Operating USD",
    bank_name: "Synthetic Bank",
    account_number_masked: "â€¢â€¢â€¢â€¢ 7812",
    posting_date: "2026-10-19",
    value_date: null,
    currency: "USD",
    base_currency: "USD",
    exchange_rate: null,
    total_amount: "45.50",
    line_count: 1,
    narration_summary: "Travel settlement",
    state: "draft",
    version: 4,
    created_at: "2026-10-19T08:00:00.000Z",
    lines: [
      {
        id: "line-7",
        line_order: 1,
        document_date: "2026-10-18",
        external_reference: "INV-7",
        document_reference: null,
        payment_method: "online",
        nominal_account_id: "nominal-1",
        narration: "Travel settlement",
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
          account_id: "nominal-1",
          account_code: "60-05-00100",
          account_name: "Travel expense",
          side: "debit",
          amount: "45.50",
          is_bank_control: false,
        },
        {
          line_order: 2,
          account_id: "ledger-1",
          account_code: "10-01-00200",
          account_name: "Bank â€” Operating USD",
          side: "credit",
          amount: "45.50",
          is_bank_control: true,
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
  harness.session.user.roles.splice(0, harness.session.user.roles.length, "payment_maker");
  harness.session.user.permissions.splice(
    0,
    harness.session.user.permissions.length,
    "banking.payment.read",
    "banking.payment.create",
    "banking.payment.update",
    "banking.payment.submit",
  );
  standardDirectories();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

describe("BankingPaymentEntry", () => {
  it("retains the newly saved draft and explains a closed-period submission failure without approving or duplicating it", async () => {
    const navigate = vi.fn();
    harness.api.createBankPayment.mockResolvedValue({
      id: "payment-created",
      reference: "BP-2026-000008",
      state: "draft",
      version: 1,
      audit_event_id: "audit-create",
      replayed: false,
    });
    harness.api.submitBankPayment.mockRejectedValue(
      new ApiError(
        409,
        "The Finance period for this posting date is not open.",
        "PAYMENT_PERIOD_LOCKED",
        "closed-period-reference",
      ),
    );
    await act(async () => root.render(<BankingPaymentEntry onNavigate={navigate} />));
    await settle();
    await settle();
    change("Line 1 external reference", "PERIOD-REGRESSION");
    change("Line 1 payment method", "bank_transfer");
    change("Line 1 nominal account", "nominal-1");
    change("Line 1 department", "SERVICES");
    change("Line 1 narration", "Save before period validation");
    change("Line 1 amount", "25.50");
    click("Submit for Approval");
    await settle();
    await settle();
    expect(container.textContent).toContain("Draft BP-2026-000008 is saved");
    expect(container.textContent).toContain("closed-period-reference");
    expect(container.textContent).toContain("Nothing was approved or posted");
    expect(control("Payment reference").getAttribute("value")).toBe("BP-2026-000008");
    expect(navigate).not.toHaveBeenCalledWith("transaction-detail", "payment-created");
    const key = harness.api.submitBankPayment.mock.calls[0]?.[3];
    click("Submit for Approval");
    await settle();
    expect(harness.api.createBankPayment).toHaveBeenCalledOnce();
    expect(harness.api.submitBankPayment.mock.calls[1]?.[3]).toBe(key);
    expect(harness.api.decideBankPayment).not.toHaveBeenCalled();
    expect(harness.api.postBankPayment).not.toHaveBeenCalled();
  });
  it("preserves an existing document reference when editing Details without a reference input", async () => {
    const original = directDraft();
    const draft = {
      ...original,
      lines: original.lines.map((line) => ({ ...line, document_reference: "LEGACY-PAY-7" })),
    };
    harness.api.getBankPayment.mockResolvedValue(draft);
    harness.api.updateBankPayment.mockResolvedValue({
      id: draft.id,
      reference: draft.reference,
      state: "draft",
      version: 5,
      audit_event_id: "audit-update",
      replayed: false,
    });
    await act(async () => root.render(<BankingPaymentEntry paymentId={draft.id} />));
    await settle();
    await settle();
    expect(container.querySelector('[aria-label="Line 1 document reference"]')).toBeNull();
    change("Line 1 narration", "Updated details only");
    click("Save Draft");
    await settle();
    expect(harness.api.updateBankPayment).toHaveBeenCalledWith(
      draft.id,
      expect.objectContaining({
        lines: [expect.objectContaining({ document_reference: "LEGACY-PAY-7", narration: "Updated details only" })],
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
    harness.api.listBankPaymentNominalAccounts.mockResolvedValueOnce({ items: [], availability });
    const review = vi.fn();
    harness.session.user.permissions.push("finance.nominal.read");
    await act(async () => root.render(<BankingPaymentEntry onReviewNominals={review} />));
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
    expect(harness.api.listBankPaymentNominalAccounts).toHaveBeenCalledTimes(2);
    expect((control("Line 1 nominal account") as HTMLSelectElement).options[1]?.textContent).toContain(
      "Travel expense",
    );
  });

  it("distinguishes failed directory access and permits a real retry without clearing the form", async () => {
    harness.api.listBankPaymentNominalAccounts.mockRejectedValueOnce(
      new ApiError(503, "Directory temporarily unavailable", "UNAVAILABLE"),
    );
    await act(async () => root.render(<BankingPaymentEntry />));
    await settle();
    await settle();
    expect(container.textContent).toContain("Payment options unavailable");
    expect(container.textContent).not.toContain("No eligible nominal accounts");
    expect(control("Line 1 nominal account").disabled).toBe(true);
    change("Line 1 narration", "Keep this unsaved description");
    click("Retry account options");
    await settle();
    await settle();
    expect(control("Line 1 narration").value).toBe("Keep this unsaved description");
    expect(control("Line 1 nominal account").disabled).toBe(false);
    expect(harness.api.createBankPayment).not.toHaveBeenCalled();
  });

  it("shows search misses separately and retains the selected nominal across search errors", async () => {
    await act(async () => root.render(<BankingPaymentEntry />));
    await settle();
    await settle();
    change("Line 1 nominal account", "nominal-1");
    harness.api.listBankPaymentNominalAccounts.mockResolvedValueOnce({
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
    harness.api.listBankPaymentNominalAccounts.mockRejectedValueOnce(
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
    harness.api.listBankPaymentNominalAccounts.mockImplementation(async (query: string) => ({
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
    await act(async () => root.render(<BankingPaymentEntry />));
    await settle();
    await settle();
    change("Line 1 nominal account", "nominal-1");
    change("Search nominal accounts", "Remote 250");
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 300));
    });
    expect(harness.api.listBankPaymentNominalAccounts).toHaveBeenLastCalledWith(
      expect.stringContaining("search=Remote"),
    );
    const nominal = control("Line 1 nominal account") as HTMLSelectElement;
    expect([...nominal.options].map((option) => option.value)).toContain("remote-nominal");
    expect(nominal.value).toBe("nominal-1");
    expect([...nominal.options].map((option) => option.value)).toContain("nominal-1");
  });

  it("retains a newly saved transaction after approval failure and reports only confirmed phases", async () => {
    const draft = directDraft();
    harness.session.user.roles.splice(0, harness.session.user.roles.length, "super_administrator");
    harness.session.user.permissions.push("banking.payment.approve", "platform.approval.override");
    harness.api.createBankPayment.mockResolvedValue({
      id: draft.id,
      reference: draft.reference,
      state: "draft",
      version: 1,
    });
    harness.api.submitBankPayment.mockResolvedValue({
      id: draft.id,
      reference: draft.reference,
      state: "submitted",
      version: 2,
    });
    harness.api.getBankPayment.mockResolvedValue({
      ...draft,
      state: "submitted",
      version: 2,
      self_decision_requires_override: true,
      super_admin_override_allowed: true,
    });
    harness.api.decideBankPayment
      .mockRejectedValueOnce(new ApiError(503, "Approval unavailable", "SERVICE_UNAVAILABLE"))
      .mockResolvedValue({ id: draft.id, reference: draft.reference, state: "approved", version: 3 });
    const navigate = vi.fn(),
      notify = vi.fn();
    await act(async () =>
      root.render(
        <ActionFeedbackProvider onSuccess={notify}>
          <BankingPaymentEntry onNavigate={navigate} />
        </ActionFeedbackProvider>,
      ),
    );
    await settle();
    await settle();
    change("Line 1 external reference", "SYNTHETIC-REF");
    change("Line 1 payment method", "bank_transfer");
    change("Line 1 nominal account", "nominal-1");
    change("Line 1 department", "SERVICES");
    change("Line 1 narration", "Synthetic entry acceptance");
    change("Line 1 amount", "12.50");
    click("Approve & Close");
    await settle();
    expect(notify).toHaveBeenCalledWith("Bank Payment created successfully.");
    expect(notify).toHaveBeenCalledWith("Bank Payment submitted for approval successfully.");
    expect(notify).not.toHaveBeenCalledWith("Bank Payment approved successfully.");
    expect(navigate).not.toHaveBeenCalledWith("bank-payments");
    click("Approve & Close");
    await settle();
    expect(harness.api.createBankPayment).toHaveBeenCalledOnce();
    expect(harness.api.submitBankPayment).toHaveBeenCalledOnce();
    expect(harness.api.updateBankPayment).not.toHaveBeenCalled();
    expect(harness.api.postBankPayment).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledWith("Bank Payment approved successfully.");
    expect(navigate).toHaveBeenLastCalledWith("bank-payments");
  });

  it("does not offer self-approval to an ordinary maker even with approval permission", async () => {
    harness.session.user.permissions.push("banking.payment.approve", "platform.approval.override");
    await act(async () => root.render(<BankingPaymentEntry />));
    await settle();
    await settle();
    expect(container.textContent).not.toContain("Approve & Close");
    expect(container.textContent).toContain("Submit for Approval");
    expect(harness.api.decideBankPayment).not.toHaveBeenCalled();
  });

  function configureApproval(overrideAllowed = true) {
    const draft = directDraft();
    harness.session.user.roles.splice(0, harness.session.user.roles.length, "super_administrator");
    harness.session.user.permissions.push("banking.payment.approve", "platform.approval.override");
    harness.api.getBankPayment.mockResolvedValueOnce(draft).mockResolvedValue({
      ...draft,
      state: "submitted",
      version: 5,
      self_decision_requires_override: true,
      super_admin_override_allowed: overrideAllowed,
    });
    harness.api.submitBankPayment.mockResolvedValue({
      id: draft.id,
      reference: draft.reference,
      state: "submitted",
      version: 5,
    });
    harness.api.decideBankPayment.mockResolvedValue({
      id: draft.id,
      reference: draft.reference,
      state: "approved",
      version: 6,
    });
    return draft;
  }

  it("uses the reference grid with visible dates and plain details, and adds/removes rows", async () => {
    await act(async () => root.render(<BankingPaymentEntry />));
    await settle();
    await settle();
    const table = container.querySelector('[aria-labelledby="payment-lines-heading"] table');
    expect([...table!.querySelectorAll("thead th")].map((cell) => cell.textContent)).toEqual([
      "Date *",
      "Ref. No. *",
      "Mode *",
      "Nominal Account *",
      "Details *",
      "Amount *",
      "Remove",
    ]);
    expect(control("Pay through").closest("label")?.textContent).toContain("Bank");
    expect(control("Posting date").closest("details")).toBeNull();
    expect(control("Value date").closest("details")).toBeNull();
    expect(control("Line 1 narration")).toBeInstanceOf(HTMLTextAreaElement);
    expect(container.querySelector('[aria-label="Line 1 document reference"]')).toBeNull();
    expect(control("Line 1 narration").classList.contains("h-10")).toBe(true);
    expect(table?.classList.contains("table-fixed")).toBe(true);
    change("Value date", "2026-10-21");
    expect(control("Value date").value).toBe("2026-10-21");
    expect(control("Payment reference").closest("details")?.open).toBe(false);
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
    await act(async () => root.render(<BankingPaymentEntry paymentId={draft.id} onNavigate={navigate} />));
    await settle();
    await settle();
    click("Approve & Close");
    await settle();
    expect(harness.api.submitBankPayment).toHaveBeenCalledWith(
      draft.id,
      { expected_version: 4 },
      "csrf-token",
      expect.any(String),
    );
    expect(harness.api.decideBankPayment).toHaveBeenCalledWith(
      draft.id,
      { action: "approve", expected_version: 5 },
      "csrf-token",
      expect.stringContaining("web-bank-payment-approve-"),
    );
    expect(navigate).toHaveBeenLastCalledWith("bank-payments");
    expect(harness.api.postBankPayment).not.toHaveBeenCalled();
  });

  it("keeps a submitted transaction open when the API denies self-approval", async () => {
    const draft = configureApproval(false);
    const navigate = vi.fn();
    await act(async () => root.render(<BankingPaymentEntry paymentId={draft.id} onNavigate={navigate} />));
    await settle();
    await settle();
    click("Approve & Close");
    await settle();
    expect(container.textContent).toContain("approval is not available to this session");
    expect(harness.api.decideBankPayment).not.toHaveBeenCalled();
    expect(harness.api.createBankPayment).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });

  it("retries approval with the same key without saving or submitting again", async () => {
    const draft = configureApproval();
    harness.api.decideBankPayment
      .mockRejectedValueOnce(
        new ApiError(503, "Temporary approval failure", "SERVICE_UNAVAILABLE", "synthetic-approval"),
      )
      .mockResolvedValue({ id: draft.id, reference: draft.reference, state: "approved", version: 6 });
    const navigate = vi.fn();
    await act(async () => root.render(<BankingPaymentEntry paymentId={draft.id} onNavigate={navigate} />));
    await settle();
    await settle();
    click("Approve & Close");
    await settle();
    expect(container.textContent).toContain("Temporary approval failure");
    expect(navigate).not.toHaveBeenCalled();
    const first = harness.api.decideBankPayment.mock.calls[0];
    click("Approve & Close");
    await settle();
    expect(harness.api.decideBankPayment.mock.calls[1]).toEqual(first);
    expect(harness.api.submitBankPayment).toHaveBeenCalledOnce();
    expect(harness.api.createBankPayment).not.toHaveBeenCalled();
    expect(harness.api.updateBankPayment).not.toHaveBeenCalled();
    expect(harness.api.postBankPayment).not.toHaveBeenCalled();
    expect(navigate).toHaveBeenLastCalledWith("bank-payments");
  });

  it("recovers an approval whose response was lost by reading the committed state", async () => {
    const draft = configureApproval();
    harness.api.getBankPayment.mockResolvedValueOnce({
      ...draft,
      state: "submitted",
      version: 5,
      self_decision_requires_override: true,
      super_admin_override_allowed: true,
    });
    harness.api.decideBankPayment.mockRejectedValueOnce(
      new ApiError(503, "Response lost", "SERVICE_UNAVAILABLE", "synthetic-lost"),
    );
    const navigate = vi.fn();
    await act(async () => root.render(<BankingPaymentEntry paymentId={draft.id} onNavigate={navigate} />));
    await settle();
    await settle();
    click("Approve & Close");
    await settle();
    harness.api.getBankPayment.mockResolvedValue({ ...draft, state: "approved", version: 6 });
    click("Approve & Close");
    await settle();
    expect(harness.api.decideBankPayment).toHaveBeenCalledOnce();
    expect(harness.api.submitBankPayment).toHaveBeenCalledOnce();
    expect(harness.api.postBankPayment).not.toHaveBeenCalled();
    expect(navigate).toHaveBeenLastCalledWith("bank-payments");
  });

  it("keeps an exact create retry key, persists edits before submit, and never approves or posts", async () => {
    const navigate = vi.fn();
    harness.api.createBankPayment
      .mockRejectedValueOnce(new ApiError(503, "Temporary API failure", "SERVICE_UNAVAILABLE", "correlation-1"))
      .mockResolvedValue({
        id: "payment-1",
        reference: "BP-2026-000001",
        state: "draft",
        version: 1,
        audit_event_id: "audit-1",
        replayed: false,
      });
    harness.api.updateBankPayment.mockResolvedValue({
      id: "payment-1",
      reference: "BP-2026-000001",
      state: "draft",
      version: 2,
      audit_event_id: "audit-2",
      replayed: false,
    });
    harness.api.submitBankPayment.mockResolvedValue({
      id: "payment-1",
      reference: "BP-2026-000001",
      state: "submitted",
      version: 3,
      audit_event_id: "audit-3",
      replayed: false,
    });

    await act(async () => root.render(<BankingPaymentEntry onNavigate={navigate} />));
    await settle();
    await settle();

    change("Line 1 external reference", "INV-1001");
    change("Line 1 payment method", "bank_transfer");
    change("Line 1 nominal account", "nominal-1");
    change("Line 1 department", "SERVICES");
    change("Line 1 narration", "Supplier settlement");
    change("Line 1 amount", "1250.125");

    click("Save Draft");
    await settle();
    expect(container.textContent).toContain("Temporary API failure");
    const firstKey = harness.api.createBankPayment.mock.calls[0]?.[2];

    click("Save Draft");
    await settle();
    const secondKey = harness.api.createBankPayment.mock.calls[1]?.[2];
    expect(secondKey).toBe(firstKey);
    expect(harness.api.createBankPayment.mock.calls[1]?.[0]).toMatchObject({
      company_id: "company-1",
      bank_account_id: "bank-1",
      lines: [
        {
          amount: "1250.125",
          dimensions: { department: "SERVICES" },
          narration: "Supplier settlement",
        },
      ],
    });
    expect(navigate).toHaveBeenCalledWith("add-bank-payment", "payment-1", { replace: true });

    change("Line 1 narration", "Updated supplier settlement");
    click("Submit for Approval");
    await settle();
    await settle();

    expect(harness.api.updateBankPayment).toHaveBeenCalledWith(
      "payment-1",
      expect.objectContaining({
        expected_version: 1,
        lines: [expect.objectContaining({ narration: "Updated supplier settlement", amount: "1250.125" })],
      }),
      "csrf-token",
      expect.stringContaining("web-bank-payment-update-"),
    );
    expect(harness.api.submitBankPayment).toHaveBeenCalledWith(
      "payment-1",
      { expected_version: 2 },
      "csrf-token",
      expect.stringContaining("web-bank-payment-submit-"),
    );
    expect(navigate).toHaveBeenLastCalledWith("transaction-detail", "payment-1");
    expect(harness.api.decideBankPayment).not.toHaveBeenCalled();
    expect(harness.api.postBankPayment).not.toHaveBeenCalled();
  });

  it("reloads a persisted draft and uses the server Bank Account ledger projection in the preview", async () => {
    harness.api.getBankPayment.mockResolvedValue({
      id: "payment-7",
      company_id: "company-1",
      reference: "BP-2026-000007",
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
      narration_summary: "Travel settlement",
      state: "draft",
      version: 4,
      created_at: "2026-10-19T08:00:00.000Z",
      lines: [
        {
          id: "line-7",
          line_order: 1,
          document_date: "2026-10-18",
          external_reference: "INV-7",
          document_reference: null,
          payment_method: "online",
          nominal_account_id: "nominal-1",
          narration: "Travel settlement",
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
            account_id: "nominal-1",
            account_code: "60-05-00100",
            account_name: "Travel expense",
            side: "debit",
            amount: "45.50",
            is_bank_control: false,
          },
          {
            line_order: 2,
            account_id: "ledger-1",
            account_code: "10-01-00200",
            account_name: "Bank — Operating USD",
            side: "credit",
            amount: "45.50",
            is_bank_control: true,
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
    });

    await act(async () => root.render(<BankingPaymentEntry paymentId="payment-7" />));
    await settle();
    await settle();

    expect(harness.api.getBankPayment).toHaveBeenCalledWith("payment-7");
    expect(control("Payment reference").getAttribute("value")).toBe("BP-2026-000007");
    expect(control("Line 1 narration").value).toBe("Travel settlement");
    expect(container.textContent).toContain("10-01-00200");
    expect(container.textContent).toContain("Bank — Operating USD · Bank Account control");
    expect(container.textContent).toContain("Preview only");
    expect(container.textContent).not.toContain("Approve and Close");
  });

  it("fails closed when a persisted payment directory is forbidden and does not leak the API detail", async () => {
    harness.api.getBankPayment.mockResolvedValue(directDraft());
    harness.api.listBankPaymentOptions.mockRejectedValue(
      new ApiError(403, "internal authorization policy detail", "FORBIDDEN", "correlation-denied"),
    );

    await act(async () => root.render(<BankingPaymentEntry paymentId="payment-7" />));
    await settle();
    await settle();

    expect(container.textContent).toContain("Permission required");
    expect(container.textContent).toContain("The API denied access");
    expect(container.textContent).toContain("correlation-denied");
    expect(container.textContent).not.toContain("internal authorization policy detail");
    expect(container.querySelector('[aria-label="Payment reference"]')).toBeNull();
    expect(container.textContent).not.toContain("Save Draft");
  });

  it("fails closed when the scoped persisted payment does not exist", async () => {
    harness.api.getBankPayment.mockRejectedValue(
      new ApiError(404, "database identity detail", "NOT_FOUND", "correlation-missing"),
    );

    await act(async () => root.render(<BankingPaymentEntry paymentId="payment-missing" />));
    await settle();
    await settle();

    expect(container.textContent).toContain("Bank Payment not found");
    expect(container.textContent).toContain("within your permitted company scope");
    expect(container.textContent).toContain("correlation-missing");
    expect(container.textContent).not.toContain("database identity detail");
    expect(container.querySelector('[aria-label="Payment reference"]')).toBeNull();
  });

  it("keeps the persisted editor closed until a failed company load is retried successfully", async () => {
    harness.api.listBankingCompanies
      .mockRejectedValueOnce(new ApiError(503, "upstream topology detail", "SERVICE_UNAVAILABLE", "correlation-load"))
      .mockResolvedValue({ items: [{ id: "company-1", code: "C01", name: "Nexora Services" }] });
    harness.api.getBankPayment.mockResolvedValue(directDraft());

    await act(async () => root.render(<BankingPaymentEntry paymentId="payment-7" />));
    await settle();
    await settle();

    expect(container.textContent).toContain("Bank Payment unavailable");
    expect(container.textContent).not.toContain("upstream topology detail");
    expect(container.querySelector('[aria-label="Payment reference"]')).toBeNull();

    click("Retry");
    await settle();
    await settle();

    expect(harness.api.listBankingCompanies).toHaveBeenCalledTimes(2);
    expect(harness.api.getBankPayment).toHaveBeenCalledTimes(2);
    expect(control("Payment reference").getAttribute("value")).toBe("BP-2026-000007");
    expect(control("Line 1 narration").value).toBe("Travel settlement");
  });

  it("keeps create and submit independent across replace-style route synchronization and retries submit exactly", async () => {
    const navigate = vi.fn();
    const dirtyChange = vi.fn();
    harness.api.createBankPayment.mockResolvedValue({
      id: "payment-created",
      reference: "BP-2026-000008",
      state: "draft",
      version: 1,
      audit_event_id: "audit-create",
      replayed: false,
    });
    harness.api.submitBankPayment
      .mockRejectedValueOnce(new ApiError(503, "Temporary submit failure", "SERVICE_UNAVAILABLE", "submit-failure"))
      .mockResolvedValue({
        id: "payment-created",
        reference: "BP-2026-000008",
        state: "submitted",
        version: 2,
        audit_event_id: "audit-submit",
        replayed: false,
      });

    function ShellLikeEntry() {
      const [routePaymentId, setRoutePaymentId] = useState<string | undefined>();
      return (
        <BankingPaymentEntry
          paymentId={routePaymentId}
          onDirtyChange={dirtyChange}
          onNavigate={(pageId, id, options) => {
            navigate(pageId, id, options);
            if (pageId === "add-bank-payment" && options?.replace) setRoutePaymentId(id);
          }}
        />
      );
    }

    await act(async () => root.render(<ShellLikeEntry />));
    await settle();
    await settle();

    change("Line 1 external reference", "INV-1008");
    change("Line 1 payment method", "bank_transfer");
    change("Line 1 nominal account", "nominal-1");
    change("Line 1 department", "SERVICES");
    change("Line 1 narration", "Persist then submit separately");
    change("Line 1 amount", "88.25");

    expect(dirtyChange).toHaveBeenLastCalledWith(true);
    click("Submit for Approval");
    await settle();
    await settle();

    expect(harness.api.createBankPayment).toHaveBeenCalledOnce();
    expect(harness.api.getBankPayment).not.toHaveBeenCalled();
    expect(harness.api.submitBankPayment).toHaveBeenCalledOnce();
    expect(container.textContent).toContain("Temporary submit failure");
    expect(navigate).toHaveBeenCalledWith("add-bank-payment", "payment-created", { replace: true });
    expect(navigate).not.toHaveBeenCalledWith("transaction-detail", "payment-created");
    expect(dirtyChange).toHaveBeenCalledWith(false);
    const firstSubmitKey = harness.api.submitBankPayment.mock.calls[0]?.[3];

    click("Submit for Approval");
    await settle();
    await settle();

    expect(harness.api.createBankPayment).toHaveBeenCalledOnce();
    expect(harness.api.getBankPayment).not.toHaveBeenCalled();
    expect(harness.api.submitBankPayment).toHaveBeenCalledTimes(2);
    expect(harness.api.submitBankPayment.mock.calls[1]?.[3]).toBe(firstSubmitKey);
    expect(navigate).toHaveBeenLastCalledWith("transaction-detail", "payment-created", undefined);
  });

  it("warns before abandoning unsaved edits", async () => {
    const onBack = vi.fn();
    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);

    await act(async () => root.render(<BankingPaymentEntry onBack={onBack} />));
    await settle();
    await settle();
    change("Line 1 narration", "Unsaved payment narration");

    click("Cancel");
    expect(confirm).toHaveBeenCalledWith("You have unsaved Bank Payment changes. Leave without saving them?");
    expect(onBack).not.toHaveBeenCalled();

    click("Cancel");
    expect(onBack).toHaveBeenCalledOnce();
  });

  it("reports dirty state to the shell and clears the guard when unmounted", async () => {
    const dirtyChange = vi.fn();

    await act(async () => root.render(<BankingPaymentEntry onDirtyChange={dirtyChange} />));
    await settle();
    await settle();
    expect(dirtyChange).toHaveBeenLastCalledWith(false);

    change("Line 1 narration", "Guard this unsaved payment");
    expect(dirtyChange).toHaveBeenLastCalledWith(true);

    act(() => root.unmount());
    expect(dirtyChange).toHaveBeenLastCalledWith(false);
    root = createRoot(container);
  });

  it("fails closed before directory calls without payment read permission", async () => {
    harness.session.user.permissions.splice(0, harness.session.user.permissions.length, "banking.payment.create");

    await act(async () => root.render(<BankingPaymentEntry />));
    await settle();

    expect(container.textContent).toContain("Permission required");
    expect(container.textContent).toContain("banking.payment.read");
    expect(harness.api.listBankingCompanies).not.toHaveBeenCalled();
  });
});
