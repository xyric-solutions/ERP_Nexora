// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { BankReceiptDetail } from "@nexora/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "../../app/lib/api/generated.js";
import { BankingReceiptDetail } from "../../app/features/banking/views/banking-receipt-detail.js";

const harness = vi.hoisted(() => ({
  receipt: vi.fn(),
  submitReceipt: vi.fn(),
  decideReceipt: vi.fn(),
  postReceipt: vi.fn(),
  reverseReceipt: vi.fn(),
  session: null as unknown,
  csrfToken: vi.fn(() => "c".repeat(43)),
}));

vi.mock("../../app/lib/session/session-provider.js", () => ({
  useSession: () => harness.session,
}));

vi.mock("../../app/features/banking/api/banking-client.js", () => ({
  BankingApiClient: class {
    receipt = harness.receipt;
    submitReceipt = harness.submitReceipt;
    decideReceipt = harness.decideReceipt;
    postReceipt = harness.postReceipt;
    reverseReceipt = harness.reverseReceipt;
  },
}));

function session(permissions: string[]) {
  return {
    api: {},
    csrfToken: harness.csrfToken,
    session: {
      status: "authenticated" as const,
      tenant_id: "tenant-ui",
      user: {
        id: "checker-ui",
        email: "checker@example.test",
        display_name: "Checker UI",
        roles: ["finance_checker"],
        permissions,
      },
      csrf_token: "c".repeat(43),
      idle_expires_at: "2026-10-19T15:00:00.000Z",
      absolute_expires_at: "2026-10-19T20:00:00.000Z",
    },
    loading: false,
  };
}

function receipt(overrides: Partial<BankReceiptDetail> = {}): BankReceiptDetail {
  return {
    id: "receipt-ui-1",
    company_id: "company-ui",
    reference: "BR-2026-00000001",
    bank_account_id: "bank-ui",
    bank_account_name: "Operating Account",
    bank_name: "First Meridian Bank",
    account_number_masked: "•••• 1234",
    posting_date: "2026-10-19",
    value_date: "2026-10-20",
    currency: "USD",
    total_amount: "125.25000000",
    line_count: 1,
    payer_summary: "Atlas Customer",
    nominal_account_summary: "40-01-00010 - Service revenue",
    narration_summary: "Controlled customer receipt",
    state: "draft",
    version: 1,
    created_at: "2026-10-19T08:00:00.000Z",
    base_currency: "USD",
    exchange_rate: null,
    lines: [
      {
        id: "line-ui-1",
        line_order: 1,
        document_date: "2026-10-19",
        external_reference: "EXT-UI-1",
        document_reference: "INV-UI-1",
        receipt_method: "bank_transfer",
        payer_name: "Atlas Customer",
        nominal_account_id: "income-ui",
        narration: "Controlled customer receipt",
        amount: "125.25000000",
        dimensions: { department: "finance" },
      },
    ],
    timeline: [
      {
        id: "event-ui-created",
        action: "created",
        previous_state: null,
        resulting_state: "draft",
        actor_id: "maker-ui",
        actor_label: "Maker UI",
        reason: null,
        occurred_at: "2026-10-19T08:00:00.000Z",
      },
    ],
    accounting_preview: {
      currency: "USD",
      lines: [
        {
          line_order: 1,
          account_id: "bank-control-ui",
          account_code: "10-01-00010",
          account_name: "Bank control",
          side: "debit",
          amount: "125.25000000",
          is_bank_control: true,
        },
        {
          line_order: 2,
          account_id: "income-ui",
          account_code: "40-01-00010",
          account_name: "Service revenue",
          side: "credit",
          amount: "125.25000000",
          is_bank_control: false,
        },
      ],
      debit_total: "125.25000000",
      credit_total: "125.25000000",
    },
    created_by: "maker-ui",
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
    ...overrides,
  };
}

function button(container: HTMLElement, label: string): HTMLButtonElement {
  const match = [...container.querySelectorAll("button")].find((candidate) => candidate.textContent?.includes(label));
  if (!match) throw new Error(`Button not found: ${label}`);
  return match;
}

async function settle() {
  await act(async () => {
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function enter(textarea: HTMLTextAreaElement, value: string) {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
    setter?.call(textarea, value);
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

describe("BankingReceiptDetail", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.clearAllMocks();
    harness.session = session(["banking.receipt.read"]);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  async function render(receiptId = "receipt-ui-1") {
    await act(async () => {
      root.render(<BankingReceiptDetail receiptId={receiptId} onBack={vi.fn()} onEdit={vi.fn()} />);
    });
    await settle();
  }

  it("loads the persisted ID directly and renders masked live detail with a pre-posting preview", async () => {
    harness.session = session(["banking.receipt.read", "banking.receipt.update", "banking.receipt.submit"]);
    harness.receipt.mockResolvedValue(receipt());

    await render("direct-receipt-id");

    expect(harness.receipt).toHaveBeenCalledWith("direct-receipt-id");
    expect(container.textContent).toContain("BR-2026-00000001");
    expect(container.textContent).toContain("Operating Account · •••• 1234");
    expect(container.textContent).toContain("Atlas Customer");
    expect(container.textContent).toContain("Controlled customer receipt");
    expect(container.textContent).toContain("Accounting preview");
    expect(container.textContent).toContain("No journal exists yet");
    expect(button(container, "Edit draft").disabled).toBe(false);
    expect(button(container, "Submit").disabled).toBe(false);
    expect(button(container, "Print").disabled).toBe(true);
  });

  it("preserves maker-checker denial and enables governed super-admin approval without a reason", async () => {
    harness.session = session(["banking.receipt.read", "banking.receipt.approve", "platform.approval.override"]);
    harness.receipt.mockResolvedValue(
      receipt({
        state: "submitted",
        version: 3,
        submitted_by: "checker-ui",
        submitted_at: "2026-10-19T09:00:00.000Z",
        self_decision_requires_override: true,
        super_admin_override_allowed: false,
      }),
    );

    await render();

    expect(container.textContent).toContain("Independent checker required");
    expect(
      [...container.querySelectorAll("button")].some((candidate) => candidate.textContent?.includes("Approve")),
    ).toBe(false);

    harness.receipt.mockResolvedValue(
      receipt({
        state: "submitted",
        version: 3,
        submitted_by: "checker-ui",
        submitted_at: "2026-10-19T09:00:00.000Z",
        self_decision_requires_override: true,
        super_admin_override_allowed: true,
      }),
    );
    await act(async () => {
      root.render(<BankingReceiptDetail receiptId="receipt-ui-2" onBack={vi.fn()} onEdit={vi.fn()} />);
    });
    await settle();

    expect(container.textContent).toContain("Super-admin override");
    const reason = container.querySelector<HTMLTextAreaElement>("#bank-receipt-decision-reason");
    expect(reason).toBeNull();
    expect(button(container, "Approve").disabled).toBe(false);
    harness.decideReceipt.mockResolvedValue({});
    await act(async () => button(container, "Approve").click());
    await settle();
    expect(harness.decideReceipt).toHaveBeenCalledWith(
      "receipt-ui-1",
      { action: "approve", expected_version: 3 },
      "c".repeat(43),
      expect.stringContaining("web-bank-receipt-approve-"),
    );
  });

  it("requires explicit posting confirmation and preserves its idempotency key for a safe retry", async () => {
    harness.session = session(["banking.receipt.read", "banking.receipt.post"]);
    harness.receipt.mockResolvedValue(
      receipt({
        state: "approved",
        version: 4,
        approved_by: "checker-ui",
        approved_at: "2026-10-19T10:00:00.000Z",
      }),
    );
    harness.postReceipt.mockRejectedValue(new ApiError(500, "Posting was not completed", "RECEIPT_POSTING_FAILED"));

    await render();
    await act(async () => button(container, "Prepare posting").click());
    await act(async () => button(container, "Confirm post").click());
    await settle();
    await act(async () => button(container, "Confirm post").click());
    await settle();

    expect(harness.postReceipt).toHaveBeenCalledTimes(2);
    expect(harness.postReceipt.mock.calls[0]?.[3]).toBe(harness.postReceipt.mock.calls[1]?.[3]);
    expect(container.textContent).toContain("retry the same action safely");
  });

  it("reloads the current record after a stale-version conflict", async () => {
    harness.session = session(["banking.receipt.read", "banking.receipt.post"]);
    harness.receipt
      .mockResolvedValueOnce(receipt({ state: "approved", version: 4 }))
      .mockResolvedValueOnce(receipt({ state: "approved", version: 5 }));
    harness.postReceipt.mockRejectedValue(
      new ApiError(409, "The receipt version is stale", "RECEIPT_VERSION_CONFLICT", "corr-version"),
    );

    await render();
    await act(async () => button(container, "Prepare posting").click());
    await act(async () => button(container, "Confirm post").click());
    await settle();

    expect(harness.receipt).toHaveBeenCalledTimes(2);
    expect(container.textContent).toContain("Version conflict");
    expect(container.textContent).toContain("version 5");
  });

  it("requires a reversal reason and sends a compensating reversal separately", async () => {
    harness.session = session(["banking.receipt.read", "banking.receipt.reverse"]);
    harness.receipt.mockResolvedValue(receipt({ state: "posted", version: 6, journal_entry_number: "JE-2026-19" }));
    harness.reverseReceipt.mockResolvedValue({});
    await render();

    expect(button(container, "Review reversal").disabled).toBe(true);
    const reason = container.querySelector<HTMLTextAreaElement>("#bank-receipt-reversal-reason");
    expect(reason).not.toBeNull();
    await enter(reason!, "Duplicate customer receipt");
    await act(async () => button(container, "Review reversal").click());
    await act(async () => button(container, "Confirm reverse").click());
    await settle();

    expect(harness.reverseReceipt).toHaveBeenCalledWith(
      "receipt-ui-1",
      { expected_version: 6, reason: "Duplicate customer receipt" },
      "c".repeat(43),
      expect.stringContaining("web-bank-receipt-reverse-"),
    );
  });

  it("fails closed on denied receipt detail without exposing the API policy message", async () => {
    harness.receipt.mockRejectedValue(
      new ApiError(403, "internal authorization policy detail", "FORBIDDEN", "correlation-denied"),
    );
    await render();

    expect(container.textContent).toContain("Permission denied");
    expect(container.textContent).toContain("company-scoped Bank Receipt");
    expect(container.textContent).toContain("correlation-denied");
    expect(container.textContent).not.toContain("internal authorization policy detail");
  });
});
