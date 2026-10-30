// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  notify: vi.fn(),
  api: {
    getJournalOptions: vi.fn(),
    listJournals: vi.fn(),
    getJournal: vi.fn(),
    createJournal: vi.fn(),
    updateJournal: vi.fn(),
    deleteJournal: vi.fn(),
    submitJournal: vi.fn(),
    decideJournal: vi.fn(),
    reverseJournal: vi.fn(),
    listRecurringJournals: vi.fn(),
    createRecurringJournal: vi.fn(),
    updateRecurringJournal: vi.fn(),
    changeRecurringJournalStatus: vi.fn(),
    listRecurringJournalOccurrences: vi.fn(),
  },
  session: {
    tenant_id: "tenant-1",
    user: {
      id: "finance-admin-1",
      email: "finance@example.test",
      roles: ["finance_admin"],
      permissions: [
        "finance.journal.read",
        "finance.journal.create",
        "finance.journal.update",
        "finance.recurring_journal.read",
        "finance.recurring_journal.manage",
      ],
    },
  },
}));

vi.mock("@/lib/session/session-provider", () => ({
  useSession: () => ({ api: harness.api, session: harness.session, loading: false, csrfToken: () => "csrf" }),
}));
vi.mock("@/shared/ui/action-feedback", () => ({ useActionFeedback: () => harness.notify }));

import { FinanceJournalWorkspace } from "../../app/features/finance/views/finance-journals-workspace.js";

let container: HTMLDivElement;
let root: Root;
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const options = {
  companies: [{ id: "company-1", code: "C01", name: "Nexora" }],
  selected_company_id: "company-1",
  base_currency: "PKR",
  decimal_places: 2,
  nominals: [{ id: "nominal-1", code: "1000", name: "Cash", required_dimensions: [] }],
};

async function settle() {
  for (let index = 0; index < 4; index += 1)
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 25));
    });
}

function click(label: string) {
  const button = [...container.querySelectorAll("button")].find((item) => item.textContent?.trim() === label);
  if (!button) throw new Error(`Missing button: ${label}`);
  act(() => button.click());
}

function input(element: HTMLInputElement, value: string) {
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

describe("Finance Journal screens", () => {
  beforeEach(() => {
    harness.api.getJournalOptions.mockResolvedValue(options);
    harness.api.listJournals.mockResolvedValue({ items: [], next_cursor: null });
    harness.api.listRecurringJournals.mockResolvedValue({ items: [], next_cursor: null });
    harness.api.listRecurringJournalOccurrences.mockResolvedValue({ items: [], next_cursor: null });
    harness.api.changeRecurringJournalStatus.mockResolvedValue({});
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.resetAllMocks();
  });

  it("applies register filters and follows the server cursor", async () => {
    harness.api.listJournals.mockResolvedValue({ items: [], next_cursor: "next-page" });
    await act(async () => root.render(<FinanceJournalWorkspace page="journal-register" onNavigate={vi.fn()} />));
    await settle();

    const reference = container.querySelector('[aria-label="Reference search"]');
    const from = container.querySelector('[aria-label="Date from"]');
    if (!(reference instanceof HTMLInputElement) || !(from instanceof HTMLInputElement))
      throw new Error("Missing filters");
    input(reference, "PAY-26");
    input(from, "2026-10-01");
    click("Apply");
    await settle();

    expect(harness.api.listJournals).toHaveBeenLastCalledWith(expect.stringContaining("reference=PAY-26"));
    expect(harness.api.listJournals).toHaveBeenLastCalledWith(expect.stringContaining("date_from=2026-10-01"));
    click("Next");
    await settle();
    expect(harness.api.listJournals).toHaveBeenLastCalledWith(expect.stringContaining("cursor=next-page"));
  });

  it("shows recurring occurrence failures and confirms status changes before mutation", async () => {
    const template = {
      id: "template-1",
      company_id: "company-1",
      name: "Month end accrual",
      schedule: "monthly",
      status: "inactive",
      start_date: "2026-10-31",
      end_date: null,
      next_scheduled_date: "2026-10-31",
      last_generated_date: null,
      base_currency: "PKR",
      reference_pattern: null,
      narration: "Month end accrual",
      version: 1,
      lines: [
        { account_id: "nominal-1", description: "Debit", debit: "10.00", credit: "0", dimensions: {} },
        { account_id: "nominal-1", description: "Credit", debit: "0", credit: "10.00", dimensions: {} },
      ],
      updated_at: "2026-10-29T00:00:00.000Z",
    } as const;
    harness.api.listRecurringJournals.mockResolvedValue({ items: [template], next_cursor: null });
    harness.api.listRecurringJournalOccurrences.mockResolvedValue({
      items: [
        {
          id: "occurrence-1",
          scheduled_date: "2026-10-31",
          state: "exhausted",
          manual_journal_id: null,
          attempt_count: 5,
          last_error_code: "JOURNAL_NOMINAL_INVALID",
          updated_at: "2026-10-31T01:00:00.000Z",
        },
      ],
      next_cursor: null,
    });
    await act(async () => root.render(<FinanceJournalWorkspace page="recurring-journals" onNavigate={vi.fn()} />));
    await settle();

    click("History");
    await settle();
    expect(container.textContent).toContain("exhausted");
    expect(container.textContent).toContain("JOURNAL_NOMINAL_INVALID");

    click("Activate");
    expect(harness.api.changeRecurringJournalStatus).not.toHaveBeenCalled();
    const confirmation = container.querySelector('[aria-label="Confirm recurring status change"] input');
    if (!(confirmation instanceof HTMLInputElement)) throw new Error("Missing status reason");
    input(confirmation, "Reviewed schedule");
    click("Confirm status change");
    await settle();
    expect(harness.api.changeRecurringJournalStatus).toHaveBeenCalledWith(
      "template-1",
      expect.objectContaining({ action: "activate", expected_version: 1, reason: "Reviewed schedule" }),
      "csrf",
      expect.any(String),
    );
  });

  it("requires dimensions declared by the selected nominal before saving a draft", async () => {
    harness.api.getJournalOptions.mockResolvedValue({
      ...options,
      nominals: [{ ...options.nominals[0], required_dimensions: ["cost_center"] }],
    });
    await act(async () => root.render(<FinanceJournalWorkspace page="manual-journal" onNavigate={vi.fn()} />));
    await settle();

    const nominal = container.querySelector('[aria-label="Nominal account line 1"]');
    if (!(nominal instanceof HTMLSelectElement)) throw new Error("Missing nominal selector");
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set?.call(nominal, "nominal-1");
      nominal.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(container.querySelector('[aria-label="cost center dimension line 1"]')).not.toBeNull();
    click("Save draft");
    await settle();
    expect(container.textContent).toContain("enter the required cost center dimension");
    expect(harness.api.createJournal).not.toHaveBeenCalled();
  });
});
