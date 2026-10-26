// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { BankPaymentDetail } from "@nexora/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "../../app/lib/api/generated.js";
import { BankingPaymentDetail } from "../../app/features/banking/views/banking-payment-detail.js";

const harness = vi.hoisted(() => ({
  payment: vi.fn(),
  submitPayment: vi.fn(),
  decidePayment: vi.fn(),
  postPayment: vi.fn(),
  reversePayment: vi.fn(),
  session: null as unknown,
  csrfToken: vi.fn(() => "c".repeat(43)),
}));

vi.mock("../../app/lib/session/session-provider.js", () => ({
  useSession: () => harness.session,
}));

vi.mock("../../app/features/banking/api/banking-client.js", () => ({
  BankingApiClient: class {
    payment = harness.payment;
    submitPayment = harness.submitPayment;
    decidePayment = harness.decidePayment;
    postPayment = harness.postPayment;
    reversePayment = harness.reversePayment;
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

function payment(overrides: Partial<BankPaymentDetail> = {}): BankPaymentDetail {
  return {
    id: "payment-ui-1",
    company_id: "company-ui",
    reference: "BP-2026-00000001",
    bank_account_id: "bank-ui",
    bank_account_name: "Operating Account",
    bank_name: "First Meridian Bank",
    account_number_masked: "•••• 1234",
    posting_date: "2026-10-19",
    value_date: "2026-10-20",
    currency: "USD",
    total_amount: "125.25000000",
    line_count: 1,
    narration_summary: "Controlled supplier settlement",
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
        payment_method: "bank_transfer",
        nominal_account_id: "expense-ui",
        narration: "Controlled supplier settlement",
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
          account_id: "expense-ui",
          account_code: "60-01-00010",
          account_name: "Operating expense",
          side: "debit",
          amount: "125.25000000",
          is_bank_control: false,
        },
        {
          line_order: 2,
          account_id: "bank-control-ui",
          account_code: "10-01-00010",
          account_name: "Bank control",
          side: "credit",
          amount: "125.25000000",
          is_bank_control: true,
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

describe("BankingPaymentDetail", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.clearAllMocks();
    harness.session = session(["banking.payment.read"]);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  async function render(paymentId = "payment-ui-1") {
    await act(async () => {
      root.render(<BankingPaymentDetail paymentId={paymentId} onBack={vi.fn()} onEdit={vi.fn()} />);
    });
    await settle();
  }

  it("loads the persisted ID directly and renders masked live detail with a pre-posting preview", async () => {
    harness.session = session(["banking.payment.read", "banking.payment.update", "banking.payment.submit"]);
    harness.payment.mockResolvedValue(payment());

    await render("direct-payment-id");

    expect(harness.payment).toHaveBeenCalledWith("direct-payment-id");
    expect(container.textContent).toContain("BP-2026-00000001");
    expect(container.textContent).toContain("Operating Account · •••• 1234");
    expect(container.textContent).toContain("Controlled supplier settlement");
    expect(container.textContent).toContain("Accounting preview");
    expect(container.textContent).toContain("No journal exists yet");
    expect(button(container, "Edit draft").disabled).toBe(false);
    expect(button(container, "Submit").disabled).toBe(false);
    expect(button(container, "Print").disabled).toBe(true);
  });

  it("preserves maker-checker denial and enables governed super-admin approval without a reason", async () => {
    harness.session = session(["banking.payment.read", "banking.payment.approve", "platform.approval.override"]);
    harness.payment.mockResolvedValue(
      payment({
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

    harness.payment.mockResolvedValue(
      payment({
        state: "submitted",
        version: 3,
        submitted_by: "checker-ui",
        submitted_at: "2026-10-19T09:00:00.000Z",
        self_decision_requires_override: true,
        super_admin_override_allowed: true,
      }),
    );
    await act(async () => {
      root.render(<BankingPaymentDetail paymentId="payment-ui-2" onBack={vi.fn()} onEdit={vi.fn()} />);
    });
    await settle();

    expect(container.textContent).toContain("Super-admin override");
    const reason = container.querySelector<HTMLTextAreaElement>("#bank-payment-decision-reason");
    expect(reason).toBeNull();
    expect(button(container, "Approve").disabled).toBe(false);
  });

  it("requires explicit posting confirmation and preserves its idempotency key for a safe retry", async () => {
    harness.session = session(["banking.payment.read", "banking.payment.post"]);
    harness.payment.mockResolvedValue(
      payment({
        state: "approved",
        version: 4,
        approved_by: "checker-ui",
        approved_at: "2026-10-19T10:00:00.000Z",
      }),
    );
    harness.postPayment.mockRejectedValue(new ApiError(500, "Posting was not completed", "PAYMENT_POSTING_FAILED"));

    await render();
    await act(async () => button(container, "Prepare posting").click());
    await act(async () => button(container, "Confirm post").click());
    await settle();
    await act(async () => button(container, "Confirm post").click());
    await settle();

    expect(harness.postPayment).toHaveBeenCalledTimes(2);
    expect(harness.postPayment.mock.calls[0]?.[3]).toBe(harness.postPayment.mock.calls[1]?.[3]);
    expect(container.textContent).toContain("retry the same action safely");
  });

  it("reloads the current record after a stale-version conflict", async () => {
    harness.session = session(["banking.payment.read", "banking.payment.post"]);
    harness.payment
      .mockResolvedValueOnce(payment({ state: "approved", version: 4 }))
      .mockResolvedValueOnce(payment({ state: "approved", version: 5 }));
    harness.postPayment.mockRejectedValue(
      new ApiError(409, "The payment version is stale", "PAYMENT_VERSION_CONFLICT", "corr-version"),
    );

    await render();
    await act(async () => button(container, "Prepare posting").click());
    await act(async () => button(container, "Confirm post").click());
    await settle();

    expect(harness.payment).toHaveBeenCalledTimes(2);
    expect(container.textContent).toContain("Version conflict");
    expect(container.textContent).toContain("version 5");
  });
});
