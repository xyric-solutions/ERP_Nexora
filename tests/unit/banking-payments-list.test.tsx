// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "../../app/lib/api/generated.js";
import { BankingPayments } from "../../app/features/banking/views/banking-payments.js";

const state = vi.hoisted(() => ({
  loading: false,
  session: {
    tenant_id: "tenant-1",
    user: {
      id: "user-1",
      email: "maker@example.test",
      roles: [],
      permissions: ["banking.payment.read", "banking.payment.create"],
    },
  } as {
    tenant_id: string;
    user: { id: string; email: string; roles: string[]; permissions: string[] };
  } | null,
  api: {
    listBankingCompanies: vi.fn(),
    listBankPaymentOptions: vi.fn(),
    listBankPayments: vi.fn(),
  },
}));

vi.mock("../../app/lib/session/session-provider", () => ({
  useSession: () => ({ api: state.api, session: state.session, loading: state.loading }),
}));

const payment = {
  id: "payment-id-1",
  company_id: "company-1",
  reference: "BP-2026-0001",
  bank_account_id: "account-1",
  bank_account_name: "Operating USD",
  bank_name: "First Meridian Bank",
  account_number_masked: "•••• 4471",
  posting_date: "2026-10-19",
  value_date: "2026-10-20",
  currency: "USD",
  total_amount: "1250.50",
  line_count: 2,
  narration_summary: "October supplier payment",
  state: "approved",
  version: 3,
  created_at: "2026-10-19T08:00:00.000Z",
};

const accountOptions = {
  bank_accounts: [
    {
      id: "account-1",
      reference: "BA-0001",
      account_name: "Operating USD",
      bank_name: "First Meridian Bank",
      account_number_masked: "•••• 4471",
      currency: "USD",
      ledger_account_code: "10-01-00200",
      ledger_account_name: "Bank — Operating USD",
    },
  ],
};

let container: HTMLDivElement;
let root: Root;

async function settle() {
  for (let index = 0; index < 5; index += 1) {
    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });
  }
}

async function render(onOpenPayment = vi.fn(), onCreatePayment: (() => void) | undefined = vi.fn()) {
  await act(async () => {
    root.render(createElement(BankingPayments, { onOpenPayment, onCreatePayment }));
  });
  await settle();
  return { onOpenPayment, onCreatePayment };
}

function control<T extends HTMLInputElement | HTMLSelectElement>(label: string): T {
  const field = [...container.querySelectorAll("label")].find((item) =>
    item.querySelector("span")?.textContent?.includes(label),
  );
  const result = field?.querySelector("input, select");
  if (!result) throw new Error(`Missing control: ${label}`);
  return result as T;
}

async function change(element: HTMLInputElement | HTMLSelectElement, value: string) {
  await act(async () => {
    const descriptor = Object.getOwnPropertyDescriptor(element.constructor.prototype, "value");
    descriptor?.set?.call(element, value);
    element.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

async function click(label: string) {
  const button = [...container.querySelectorAll("button")].find((item) => item.textContent?.trim() === label);
  if (!button) throw new Error(`Missing button: ${label}`);
  await act(async () => button.click());
  await settle();
}

describe("BankingPayments", () => {
  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    state.loading = false;
    state.session = {
      tenant_id: "tenant-1",
      user: {
        id: "user-1",
        email: "maker@example.test",
        roles: [],
        permissions: ["banking.payment.read", "banking.payment.create"],
      },
    };
    state.api.listBankingCompanies.mockResolvedValue({
      items: [
        { id: "company-1", code: "NX", name: "Nexora Services" },
        { id: "company-2", code: "NX2", name: "Nexora Trading" },
      ],
    });
    state.api.listBankPaymentOptions.mockResolvedValue(accountOptions);
    state.api.listBankPayments.mockResolvedValue({ items: [payment], next_cursor: null });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.resetAllMocks();
    vi.unstubAllGlobals();
  });

  it("loads live company-scoped options and persisted payment rows", async () => {
    const { onOpenPayment, onCreatePayment } = await render();

    expect(state.api.listBankingCompanies).toHaveBeenCalledTimes(1);
    expect(state.api.listBankPaymentOptions).toHaveBeenCalledWith("?company_id=company-1");
    expect(state.api.listBankPayments).toHaveBeenCalledWith(
      "?company_id=company-1&sort_by=posting_date&sort_direction=desc&limit=50",
    );
    expect(container.textContent).toContain("BP-2026-0001");
    expect(container.textContent).toContain("Operating USD");
    expect(container.textContent).toContain("•••• 4471");
    expect(container.textContent).toContain("October supplier payment");
    expect(container.textContent).toContain("USD");
    expect(container.textContent).toContain("Approved");
    expect(container.querySelector("caption")?.textContent).toContain("Persisted bank payments");
    expect(container.textContent).toContain("Export is disabled because no governed payment export endpoint");
    expect(container.querySelector<HTMLButtonElement>("button[disabled]")?.textContent).toContain("Export unavailable");

    await click("BP-2026-0001");
    expect(onOpenPayment).toHaveBeenCalledWith("payment-id-1");
    expect(onOpenPayment).not.toHaveBeenCalledWith("BP-2026-0001");
    await click("Add bank payment");
    expect(onCreatePayment).toHaveBeenCalledTimes(1);
  });

  it("sends every directory filter, sort and cursor to the server", async () => {
    state.api.listBankPaymentOptions.mockImplementation(async (query: string) =>
      query.includes("company-2")
        ? {
            bank_accounts: [
              {
                ...accountOptions.bank_accounts[0],
                id: "account-2",
                account_name: "Trading USD",
              },
            ],
          }
        : accountOptions,
    );
    state.api.listBankPayments.mockResolvedValue({ items: [payment], next_cursor: "cursor-2" });
    await render();

    await change(control<HTMLSelectElement>("Company"), "company-2");
    await settle();
    await act(async () => {
      const values: Array<[HTMLInputElement | HTMLSelectElement, string]> = [
        [control<HTMLSelectElement>("Bank account"), "account-2"],
        [control<HTMLSelectElement>("Payment state"), "approved"],
        [control<HTMLInputElement>("Posting date from"), "2026-10-01"],
        [control<HTMLInputElement>("Posting date to"), "2026-10-31"],
        [control<HTMLInputElement>("Search payments"), "supplier"],
        [control<HTMLSelectElement>("Sort payments"), "total_amount"],
      ];
      for (const [element, value] of values) {
        const descriptor = Object.getOwnPropertyDescriptor(element.constructor.prototype, "value");
        descriptor?.set?.call(element, value);
        element.dispatchEvent(new Event("change", { bubbles: true }));
      }
    });
    await click("Descending ↓");

    const filtered = state.api.listBankPayments.mock.calls.at(-1)?.[0] as string;
    expect(filtered).toContain("company_id=company-2");
    expect(filtered).toContain("bank_account_id=account-2");
    expect(filtered).toContain("state=approved");
    expect(filtered).toContain("posting_date_from=2026-10-01");
    expect(filtered).toContain("posting_date_to=2026-10-31");
    expect(filtered).toContain("search=supplier");
    expect(filtered).toContain("sort_by=total_amount");
    expect(filtered).toContain("sort_direction=asc");

    await click("Load more");
    expect(state.api.listBankPayments.mock.calls.at(-1)?.[0]).toContain("cursor=cursor-2");
  });

  it("clears stale rows on API denial and recovers through retry", async () => {
    await render();
    expect(container.textContent).toContain("BP-2026-0001");

    state.api.listBankPayments.mockRejectedValueOnce(
      new ApiError(403, "Internal authorization detail", "BANKING_PAYMENT_ACCESS_DENIED", "correlation-1"),
    );
    await click("Refresh");

    expect(container.textContent).toContain("Bank payment access denied");
    expect(container.textContent).not.toContain("Internal authorization detail");
    expect(container.textContent).not.toContain("BP-2026-0001");
    await click("Retry");
    expect(container.textContent).toContain("BP-2026-0001");
  });

  it("renders session, permission and empty states without unauthorized API work", async () => {
    state.loading = true;
    await render();
    expect(container.textContent).toContain("Checking banking access");
    expect(state.api.listBankingCompanies).not.toHaveBeenCalled();

    state.loading = false;
    state.session = null;
    await render();
    expect(container.textContent).toContain("Sign in required");
    expect(state.api.listBankingCompanies).not.toHaveBeenCalled();

    state.session = {
      tenant_id: "tenant-1",
      user: { id: "user-2", email: "denied@example.test", roles: [], permissions: [] },
    };
    await render();
    expect(container.textContent).toContain("banking.payment.read");
    expect(container.textContent).not.toContain("Add bank payment");
    expect(state.api.listBankingCompanies).not.toHaveBeenCalled();

    state.session.user.permissions = ["banking.payment.read"];
    state.api.listBankPayments.mockResolvedValue({ items: [], next_cursor: null });
    await render();
    expect(container.textContent).toContain("No bank payments found");
    expect(container.textContent).not.toContain("Add bank payment");
  });
});
