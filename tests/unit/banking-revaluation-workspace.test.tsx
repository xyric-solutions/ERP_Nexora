// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  banking: {
    companies: vi.fn(),
    accounts: vi.fn(),
    revaluations: vi.fn(),
    revaluation: vi.fn(),
    revaluationApprovers: vi.fn(),
    previewRevaluation: vi.fn(),
    createRevaluation: vi.fn(),
    updateRevaluation: vi.fn(),
    submitRevaluation: vi.fn(),
    approveRevaluation: vi.fn(),
    rejectRevaluation: vi.fn(),
    postRevaluation: vi.fn(),
    reverseRevaluation: vi.fn(),
    revaluationEvents: vi.fn(),
  },
  currencies: {
    companyCurrencies: vi.fn(),
    profile: vi.fn(),
  },
  session: {
    tenant_id: "tenant-1",
    user: {
      id: "maker-1",
      display_name: "Maker One",
      email: "maker@example.test",
      roles: ["treasury_maker"],
      permissions: [
        "banking.revaluation.read",
        "banking.revaluation.create",
        "banking.revaluation.update",
        "banking.revaluation.submit",
        "banking.revaluation.approve",
        "banking.revaluation.post",
        "banking.revaluation.reverse",
        "finance.company_currency.read",
        "finance.company_currency_profile.read",
      ],
    },
  },
}));

vi.mock("@/lib/session/session-provider", () => ({
  useSession: () => ({
    api: {},
    session: harness.session,
    loading: false,
    csrfToken: () => "csrf-token",
  }),
}));

vi.mock("../../app/features/banking/api/banking-client.js", () => ({
  BankingApiClient: class {
    constructor() {
      return harness.banking;
    }
  },
}));

vi.mock("../../app/features/finance/api/finance-currencies-client.js", () => ({
  FinanceCurrenciesClient: class {
    constructor() {
      return harness.currencies;
    }
  },
}));

vi.mock("@/shared/ui/action-feedback", () => ({ useActionFeedback: () => vi.fn() }));

import { BankingRevaluationWorkspace } from "../../app/features/banking/views/banking-revaluation-workspace.js";

let container: HTMLDivElement;
let root: Root;
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const summary = {
  id: "revaluation-1",
  company_id: "company-1",
  voucher_number: "BRV-2026-0001",
  external_reference: "OCT-USD",
  revaluation_date: "2026-10-23",
  base_currency: "PKR",
  currency: "USD",
  closing_rate: "277.500000",
  foreign_balance: "100.00000000",
  carrying_base_balance: "27500.00000000",
  revalued_base_balance: "27750.00000000",
  gain_loss_amount: "250.00000000",
  direction: "gain",
  account_count: 1,
  state: "draft",
  reversal_state: "not_scheduled",
  version: 1,
  created_at: "2026-10-23T10:00:00.000Z",
  updated_at: "2026-10-23T10:00:00.000Z",
} as const;

const preview = {
  company_id: "company-1",
  base_currency: "PKR",
  currency: "USD",
  revaluation_date: "2026-10-23",
  rate_snapshot: {
    rate_id: "rate-1",
    source_currency: "USD",
    target_currency: "PKR",
    rate: "277.500000",
    effective_date: "2026-10-23",
    revision_version: 2,
  },
  policy_snapshot: {
    policy_id: "policy-1",
    policy_version: 1,
    unrealized_gain_nominal_id: "nominal-gain",
    unrealized_loss_nominal_id: "nominal-loss",
    reversal_mode: "next_open_period_first_day",
  },
  lines: [
    {
      id: null,
      bank_account_id: "bank-1",
      bank_account_code: "BANK-USD",
      bank_account_name: "USD Operating",
      bank_name: "Example Bank",
      control_nominal_id: "bank-control-1",
      control_nominal_code: "110201",
      currency: "USD",
      foreign_balance: "100.00000000",
      carrying_base_balance: "27500.00000000",
      revalued_base_balance: "27750.00000000",
      adjustment: "250.00000000",
      direction: "gain",
    },
  ],
  totals: {
    foreign_balance: "100.00000000",
    carrying_base_balance: "27500.00000000",
    revalued_base_balance: "27750.00000000",
    total_gain: "250.00000000",
    total_loss: "0.00000000",
    net_gain_loss: "250.00000000",
  },
  source_fingerprint: "a".repeat(64),
  generated_at: "2026-10-23T10:01:00.000Z",
} as const;

const detail = {
  ...summary,
  narration: "October USD revaluation",
  rate_snapshot: preview.rate_snapshot,
  policy_snapshot: preview.policy_snapshot,
  lines: [{ ...preview.lines[0], id: "line-1" }],
  totals: preview.totals,
  accounting_preview: null,
  source_fingerprint: preview.source_fingerprint,
  maker_user_id: "maker-1",
  approver_user_id: "checker-1",
  submitted_by: null,
  submitted_at: null,
  decided_by: null,
  decided_at: null,
  decision_reason: null,
  super_admin_override_used: false,
  decision_evidence_id: null,
  posted_by: null,
  posted_at: null,
  journal_entry_id: null,
  reversal_scheduled_date: null,
  reversal_journal_entry_id: null,
  reversed_at: null,
} as const;

async function settle(rounds = 5) {
  for (let index = 0; index < rounds; index += 1)
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
}

function setValue(element: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement, value: string) {
  const descriptor = Object.getOwnPropertyDescriptor(
    element instanceof HTMLSelectElement
      ? HTMLSelectElement.prototype
      : element instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype,
    "value",
  );
  descriptor?.set?.call(element, value);
  element.dispatchEvent(new Event("change", { bubbles: true }));
}

function button(label: string) {
  return [...container.querySelectorAll("button")].find((item) => item.textContent?.trim() === label);
}

describe("BankingRevaluationWorkspace", () => {
  beforeEach(() => {
    harness.banking.companies.mockResolvedValue({
      items: [{ id: "company-1", code: "C01", name: "Nexora Pakistan" }],
    });
    harness.banking.accounts.mockResolvedValue({
      items: [
        {
          id: "bank-1",
          reference: "BANK-USD",
          account_name: "USD Operating",
          account_type: "current",
          bank_name: "Example Bank",
          branch: null,
          account_number_masked: "****1234",
          currency: "USD",
          ledger_account_id: "nominal-bank",
          ledger_account_code: "110201",
          ledger_account_name: "USD Operating",
          ledger_balance: "100.00000000",
          available_balance: null,
          unreconciled_count: 0,
          last_movement_on: "2026-10-23",
          state: "active",
          version: 1,
        },
      ],
      next_cursor: null,
    });
    harness.banking.revaluationApprovers.mockResolvedValue({
      items: [
        {
          id: "checker-1",
          code: "",
          name: "Checker One",
          eligible: true,
          self_approval: false,
        },
      ],
      selected: null,
      next_cursor: null,
    });
    harness.currencies.companyCurrencies.mockResolvedValue({
      items: [
        {
          id: "currency-usd",
          company_id: "company-1",
          currency_code: "USD",
          currency_name: "US Dollar",
          selected_country_code: "US",
          selected_country_name: "United States",
          decimal_places: 2,
          is_base: false,
          status: "active",
          latest_rate: "277.500000",
          latest_rate_effective_date: "2026-10-23",
          version: 1,
          created_at: "2026-10-01T00:00:00.000Z",
          updated_at: "2026-10-23T00:00:00.000Z",
        },
      ],
      next_cursor: null,
    });
    harness.currencies.profile.mockResolvedValue({
      id: "profile-1",
      company_id: "company-1",
      base_currency: "PKR",
      base_currency_name: "Pakistan Rupee",
      base_country_code: "PK",
      base_country_name: "Pakistan",
      status: "active",
      locked: true,
      locked_at: "2026-10-01T00:00:00.000Z",
      version: 1,
      created_at: "2026-10-01T00:00:00.000Z",
      updated_at: "2026-10-01T00:00:00.000Z",
    });
    harness.banking.revaluations.mockResolvedValue({ items: [summary], next_cursor: null });
    harness.banking.previewRevaluation.mockResolvedValue(preview);
    harness.banking.createRevaluation.mockResolvedValue({
      id: summary.id,
      voucher_number: summary.voucher_number,
      state: "draft",
      version: 1,
      audit_event_id: "event-created",
      journal_entry_id: null,
      reversal_scheduled_date: null,
      replayed: false,
    });
    harness.banking.revaluation.mockResolvedValue(detail);
    harness.banking.revaluationEvents.mockResolvedValue({ items: [], next_cursor: null });
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.resetAllMocks();
  });

  it("renders the persisted work page with bounded filters and opens records", async () => {
    const navigate = vi.fn();
    await act(async () => root.render(<BankingRevaluationWorkspace onNavigate={navigate} />));
    await settle();

    expect(container.textContent).toContain("Bank Revaluation");
    expect(container.textContent).toContain("BRV-2026-0001");
    expect(container.textContent).toContain("PKR 250.00 gain");
    expect(container.textContent).not.toContain("Prototype only");
    expect(harness.banking.revaluations).toHaveBeenCalledWith(expect.objectContaining({ limit: 50 }));

    await act(async () => button("Add New")?.click());
    expect(navigate).toHaveBeenCalledWith("new");
    await act(async () => button("BRV-2026-0001")?.click());
    expect(navigate).toHaveBeenCalledWith("revaluation-1");
  });

  it("applies an authoritative preview and saves only a draft", async () => {
    const navigate = vi.fn();
    await act(async () => root.render(<BankingRevaluationWorkspace recordRef="new" onNavigate={navigate} />));
    await settle();

    const currency = container.querySelector<HTMLSelectElement>("#revaluation-currency");
    const date = container.querySelector<HTMLInputElement>("#revaluation-date");
    expect(currency).not.toBeNull();
    expect(date).not.toBeNull();
    act(() => {
      setValue(currency!, "USD");
      setValue(date!, "2026-10-23");
      setValue(container.querySelector<HTMLSelectElement>("#revaluation-approver")!, "checker-1");
    });
    await act(async () => button("Apply")?.click());
    await settle();

    expect(harness.banking.previewRevaluation).toHaveBeenCalledWith(
      { company_id: "company-1", currency: "USD", revaluation_date: "2026-10-23" },
      "csrf-token",
      expect.stringContaining("web-bank-revaluation-preview-"),
    );
    expect(container.textContent).toContain("1 USD = 277.500000 PKR");
    expect(container.textContent).toContain("USD Operating");
    expect(container.textContent).toContain("PKR 250.00 gain");

    await act(async () => button("Save draft")?.click());
    await settle();
    expect(harness.banking.createRevaluation).toHaveBeenCalledWith(
      expect.objectContaining({
        company_id: "company-1",
        currency: "USD",
        revaluation_date: "2026-10-23",
        approver_user_id: "checker-1",
      }),
      "csrf-token",
      expect.stringContaining("web-bank-revaluation-create-"),
    );
    expect(navigate).toHaveBeenCalledWith("revaluation-1");
    expect(harness.banking.submitRevaluation).not.toHaveBeenCalled();
  });

  it("shows safe API failures instead of stale preview results", async () => {
    harness.banking.previewRevaluation.mockRejectedValue(new Error("No effective rate"));
    await act(async () => root.render(<BankingRevaluationWorkspace recordRef="new" onNavigate={vi.fn()} />));
    await settle();
    act(() => {
      setValue(container.querySelector<HTMLSelectElement>("#revaluation-currency")!, "USD");
      setValue(container.querySelector<HTMLInputElement>("#revaluation-date")!, "2026-10-23");
    });
    await act(async () => button("Apply")?.click());
    await settle();
    expect(container.textContent).toContain("The Bank Revaluation request failed safely.");
    expect(container.textContent).not.toContain("USD Operating");
  });

  it("reloads authoritative detail after submit, audited approval and post", async () => {
    const submitted = {
      ...detail,
      state: "submitted" as const,
      version: 2,
      submitted_by: "maker-1",
      submitted_at: "2026-10-23T10:05:00.000Z",
    };
    const approved = {
      ...submitted,
      state: "approved" as const,
      version: 3,
      decided_by: "maker-1",
      decided_at: "2026-10-23T10:06:00.000Z",
      super_admin_override_used: true,
      decision_evidence_id: "override-evidence-1",
    };
    const posted = {
      ...approved,
      state: "posted" as const,
      version: 4,
      posted_by: "poster-1",
      posted_at: "2026-10-23T10:07:00.000Z",
      journal_entry_id: "journal-1",
      reversal_scheduled_date: "2026-11-01",
    };
    harness.banking.revaluation
      .mockReset()
      .mockResolvedValueOnce(detail)
      .mockResolvedValueOnce(submitted)
      .mockResolvedValueOnce(approved)
      .mockResolvedValueOnce(posted);
    harness.banking.submitRevaluation.mockResolvedValue({});
    harness.banking.approveRevaluation.mockResolvedValue({});
    harness.banking.postRevaluation.mockResolvedValue({});

    await act(async () => root.render(<BankingRevaluationWorkspace recordRef="revaluation-1" onNavigate={vi.fn()} />));
    await settle();
    await act(async () => button("Submit for approval")?.click());
    await settle();
    expect(container.textContent).toContain("Waiting for approval");
    expect(harness.banking.submitRevaluation).toHaveBeenCalledWith(
      "revaluation-1",
      { expected_version: 1 },
      "csrf-token",
      expect.stringContaining("web-bank-revaluation-submit-"),
    );

    await act(async () => button("Approve with audited override")?.click());
    await settle();
    expect(container.textContent).toContain("Approved");
    expect(container.textContent).toContain("override-evidence-1");
    expect(harness.banking.approveRevaluation).toHaveBeenCalledWith(
      "revaluation-1",
      { expected_version: 2 },
      "csrf-token",
      expect.stringContaining("web-bank-revaluation-approve-"),
    );

    await act(async () => button("Post")?.click());
    await settle();
    expect(container.textContent).toContain("Posted");
    expect(container.textContent).toContain("journal-1");
    expect(container.textContent).toContain("2026-11-01");
    expect(harness.banking.postRevaluation).toHaveBeenCalledWith(
      "revaluation-1",
      { expected_version: 3 },
      "csrf-token",
      expect.stringContaining("web-bank-revaluation-post-"),
    );
    expect(harness.banking.revaluation).toHaveBeenCalledTimes(4);
  });
});
