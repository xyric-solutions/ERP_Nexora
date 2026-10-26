// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BankingPaymentDetail } from "../../app/features/banking/views/banking-payment-detail.js";
import { BankingReceiptDetail } from "../../app/features/banking/views/banking-receipt-detail.js";
import { ActionFeedbackProvider } from "../../app/shared/ui/action-feedback.js";

const state = vi.hoisted(() => ({
  api: {
    getBankPayment: vi.fn(),
    getBankReceipt: vi.fn(),
    decideBankPayment: vi.fn(),
    decideBankReceipt: vi.fn(),
  },
}));
vi.mock("../../app/lib/session/session-provider", () => ({
  useSession: () => ({
    api: state.api,
    csrfToken: () => "synthetic-csrf",
    loading: false,
    session: {
      tenant_id: "synthetic-tenant",
      user: {
        id: "synthetic-admin",
        roles: ["super_administrator"],
        permissions: [
          "banking.payment.read",
          "banking.payment.approve",
          "banking.receipt.read",
          "banking.receipt.approve",
        ],
      },
    },
  }),
}));

function detail(kind: "payment" | "receipt") {
  return {
    id: `bank-${kind}-synthetic`,
    reference: `${kind}-synthetic`,
    state: "submitted",
    version: 1,
    company_id: "synthetic-company",
    bank_account_id: "synthetic-bank",
    bank_account_name: "Synthetic Bank",
    bank_name: null,
    account_number_masked: null,
    currency: "USD",
    base_currency: "USD",
    exchange_rate: null,
    total_amount: "12.50",
    posting_date: "2026-10-20",
    value_date: null,
    created_at: "2026-10-20T00:00:00.000Z",
    lines: [],
    timeline: [],
    line_count: 0,
    accounting_preview: { lines: [] },
    self_decision_requires_override: true,
    super_admin_override_allowed: true,
  };
}

describe("Bank Payment and Receipt action feedback", () => {
  let container: HTMLDivElement, root: Root;
  const notify = vi.fn();
  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    state.api.getBankPayment.mockResolvedValue(detail("payment"));
    state.api.getBankReceipt.mockResolvedValue(detail("receipt"));
    state.api.decideBankPayment.mockResolvedValue({});
    state.api.decideBankReceipt.mockResolvedValue({});
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.resetAllMocks();
    notify.mockReset();
    vi.unstubAllGlobals();
  });
  async function render(kind: "payment" | "receipt") {
    const props = { onBack: vi.fn(), onEdit: vi.fn() };
    const child =
      kind === "payment"
        ? createElement(BankingPaymentDetail, { ...props, paymentId: detail(kind).id })
        : createElement(BankingReceiptDetail, { ...props, receiptId: detail(kind).id });
    await act(async () => root.render(<ActionFeedbackProvider onSuccess={notify}>{child}</ActionFeedbackProvider>));
    await act(async () => new Promise((resolve) => setTimeout(resolve, 10)));
  }
  function button(label: string) {
    const result = [...container.querySelectorAll("button")].find((button) => button.textContent?.trim() === label);
    expect(result).toBeDefined();
    return result!;
  }
  for (const kind of ["payment", "receipt"] as const) {
    it(`${kind} approval has no reason field and reports confirmed success`, async () => {
      await render(kind);
      expect(container.querySelector("textarea")).toBeNull();
      await act(async () => button("Approve").click());
      const operation = kind === "payment" ? state.api.decideBankPayment : state.api.decideBankReceipt;
      expect(operation.mock.calls[0]?.[1]).toEqual({ action: "approve", expected_version: 1 });
      expect(notify).toHaveBeenCalledWith(`${kind}-synthetic was approved.`);
    });
    it(`${kind} never reports success for a failed approval`, async () => {
      const operation = kind === "payment" ? state.api.decideBankPayment : state.api.decideBankReceipt;
      operation.mockRejectedValue(new Error("Synthetic denied action"));
      await render(kind);
      await act(async () => button("Approve").click());
      expect(notify).not.toHaveBeenCalled();
      expect(container.textContent).toContain("Action not completed");
    });
    it(`${kind} requests a reason only after Reject and prevents empty rejection`, async () => {
      await render(kind);
      expect(container.querySelector("textarea")).toBeNull();
      await act(async () => button("Reject").click());
      expect(container.querySelector("textarea")).not.toBeNull();
      expect(button("Confirm rejection").disabled).toBe(true);
      expect(notify).not.toHaveBeenCalled();
      expect(kind === "payment" ? state.api.decideBankPayment : state.api.decideBankReceipt).not.toHaveBeenCalled();
    });
  }
});
