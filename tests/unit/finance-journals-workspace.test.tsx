// @vitest-environment jsdom

import { act } from "react";
import type { JournalDetail } from "@nexora/contracts";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prototypeModules } from "../../app/shell/config/prototype-data.js";

const harness = vi.hoisted(() => ({
  notify: vi.fn(),
  api: {
    getJournalOptions: vi.fn(),
    getJournalPostingEligibility: vi.fn(),
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
  nominals: [{ id: "nominal-1", code: "1000", name: "Cash", kind: "general" as const, required_dimensions: [] }],
};
const defaultPermissions = [...harness.session.user.permissions];
const defaultRoles = [...harness.session.user.roles];

const submittedJournal: JournalDetail = {
  id: "journal-1",
  company_id: "company-1",
  display_number: "MJ-2026-000001",
  journal_date: "2026-10-30",
  reference_number: "Capital deposited",
  source: "manual",
  source_label: "Manual Journal",
  state: "submitted",
  currency: "USD",
  total: "100000.00",
  version: 2,
  maker_user_id: "finance-admin-1",
  submitted_at: "2026-10-30T00:00:00.000Z",
  can_open_owner_workflow: true,
  base_decimal_places: 2,
  approval_note: null,
  rejection_reason: null,
  posted_entry_number: null,
  lines: [
    {
      id: "line-1",
      line_number: 1,
      account_id: "nominal-1",
      account_code: "1000",
      account_name: "Bank",
      description: "Capital",
      debit: "100000.00000000",
      credit: "0.00000000",
      dimensions: {},
    },
    {
      id: "line-2",
      line_number: 2,
      account_id: "nominal-2",
      account_code: "3100",
      account_name: "Capital",
      description: "Capital",
      debit: "0.00000000",
      credit: "100000.00000000",
      dimensions: {},
    },
  ],
  events: [],
  capabilities: {
    update: false,
    delete_draft: false,
    submit: false,
    approve: true,
    reject: true,
    reverse: false,
    self_approval_required: true,
    super_admin_override_available: false,
  },
};

async function settle() {
  for (let index = 0; index < 4; index += 1)
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 25));
    });
}

function click(label: string) {
  const button = [...document.body.querySelectorAll("button")].find((item) => item.textContent?.trim() === label || item.getAttribute("aria-label") === label);
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
    harness.session.user.permissions = [...defaultPermissions];
    harness.session.user.roles = [...defaultRoles];
    window.localStorage.clear();
    vi.stubGlobal("PointerEvent", MouseEvent);
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    const matches = Element.prototype.matches;
    vi.spyOn(Element.prototype, "matches").mockImplementation(function (selector) {
      return selector.includes(":fullscreen") ? false : matches.call(this, selector);
    });
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(() => new DOMRect(0, 0, 320, 40));
    HTMLElement.prototype.scrollIntoView = vi.fn();
    harness.api.getJournalOptions.mockResolvedValue(options);
    harness.api.getJournalPostingEligibility.mockImplementation(async () => ({company_id:"company-1",journal_date:"2026-11-17",eligible:true,blocker:null,period:null}));
    harness.api.listJournals.mockResolvedValue({ items: [], next_cursor: null });
    harness.api.listRecurringJournals.mockResolvedValue({ items: [], next_cursor: null });
    harness.api.listRecurringJournalOccurrences.mockResolvedValue({ items: [], next_cursor: null });
    harness.api.changeRecurringJournalStatus.mockResolvedValue({});
    harness.api.getJournal.mockResolvedValue(submittedJournal);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  it("allows an explicitly authorized preparer to approve after confirmation without an override reason", async () => {
    harness.api.listJournals.mockResolvedValue({ items: [submittedJournal], next_cursor: null });
    harness.api.decideJournal.mockImplementation(async () => {
      harness.api.listJournals.mockResolvedValue({ items: [], next_cursor: null });
      return { id: submittedJournal.id, state: "posted" };
    });
    await act(async () =>
      root.render(<FinanceJournalWorkspace page="journal-approval" recordRef="journal-1" onNavigate={vi.fn()} />),
    );
    await settle();
    expect(document.body.textContent).toContain("An override reason is not required");
    const approve = [...document.body.querySelectorAll("button")].find(
      (button) => button.textContent === "Approve and Post",
    );
    expect(approve?.disabled).toBe(true);
    const confirmation = document.body.querySelector("#journal-final-confirmation");
    if (!(confirmation instanceof HTMLElement)) throw new Error("Missing final confirmation");
    act(() => confirmation.click());
    await settle();
    expect(approve?.disabled).toBe(false);
    click("Approve and Post");
    await settle();
    expect(harness.api.decideJournal).toHaveBeenCalledWith(
      "journal-1",
      {
        expected_version: 2,
        action: "post",
        confirmed: true,
      },
      "csrf",
      expect.any(String),
    );
    expect(harness.notify).toHaveBeenCalledWith("Journal confirmed and posted.");
  });

  it("opens new and existing Journals in the unified transaction drawer", async () => {
    harness.api.listJournals.mockResolvedValue({ items: [submittedJournal], next_cursor: null });
    await act(async () => root.render(<FinanceJournalWorkspace page="journal-register" onNavigate={vi.fn()} />));
    await settle();

    expect(document.body.textContent).toContain("Transactions");
    expect(document.body.textContent).toContain("Recurring");
    click("＋ New Journal");
    await settle();
    expect(document.body.textContent).toContain("New Manual Journal");
    expect(document.body.querySelector("#journal-date")).not.toBeNull();

    click("Close");
    await settle();
    click("View");
    await settle();
    expect(document.body.textContent).toContain("Journal Details");
    expect(document.body.textContent).toContain(submittedJournal.display_number);
  });

  it("moves reversal into the selected posted Journal drawer", async () => {
    const postedJournal: JournalDetail = {
      ...submittedJournal,
      state: "posted",
      capabilities: { ...submittedJournal.capabilities, approve: false, reject: false, reverse: true },
    };
    harness.api.getJournal.mockResolvedValue(postedJournal);
    await act(async () =>
      root.render(<FinanceJournalWorkspace page="journal-detail" recordRef="journal-1" onNavigate={vi.fn()} />),
    );
    await settle();
    click("Reverse");
    await settle();
    expect(document.body.textContent).toContain("Reverse Journal");
    expect(document.body.textContent).toContain("Post compensating reversal");
    expect(document.body.querySelector("#reversal-date")).not.toBeNull();
  });

  it("explains and enforces the reason when self-approval actually requires an administrator override", async () => {
    harness.api.getJournal.mockResolvedValue({
      ...submittedJournal,
      capabilities: { ...submittedJournal.capabilities, super_admin_override_available: true },
    });
    await act(async () =>
      root.render(<FinanceJournalWorkspace page="journal-approval" recordRef="journal-1" onNavigate={vi.fn()} />),
    );
    await settle();
    expect(document.body.textContent).toContain("Enter an override reason of at least 3 characters");
    const confirmation = document.body.querySelector("#journal-final-confirmation");
    const reason = document.body.querySelector("#decision-reason");
    if (!(confirmation instanceof HTMLElement) || !(reason instanceof HTMLTextAreaElement))
      throw new Error("Missing approval controls");
    act(() => confirmation.click());
    const approve = [...document.body.querySelectorAll("button")].find(
      (button) => button.textContent === "Approve and Post",
    );
    expect(approve?.disabled).toBe(true);
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set?.call(
        reason,
        "Reviewed capital contribution",
      );
      reason.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await settle();
    expect(approve?.disabled).toBe(false);
    expect(harness.api.decideJournal).not.toHaveBeenCalled();
  });

  it("defaults to two decimals, remembers the display choice and leaves the journal data unchanged", async () => {
    await act(async () =>
      root.render(<FinanceJournalWorkspace page="journal-detail" recordRef="journal-1" onNavigate={vi.fn()} />),
    );
    await settle();
    expect(document.body.textContent).toContain("100,000.00");
    expect(document.body.textContent).not.toContain("100000.00000000");
    const precision = document.body.querySelector("#journal-display-decimals");
    if (!(precision instanceof HTMLSelectElement)) throw new Error("Missing display decimal selector");
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set?.call(precision, "4");
      precision.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await settle();
    expect(document.body.textContent).toContain("100,000.0000");
    expect(window.localStorage.getItem("nexora:journal:display-decimals:tenant-1:finance-admin-1")).toBe("4");
    await act(async () =>
      root.render(
        <FinanceJournalWorkspace key="new-screen" page="journal-detail" recordRef="journal-1" onNavigate={vi.fn()} />,
      ),
    );
    await settle();
    expect(document.body.textContent).toContain("100,000.0000");
    expect(submittedJournal.lines[0]?.debit).toBe("100000.00000000");
    expect(harness.api.updateJournal).not.toHaveBeenCalled();
    expect(harness.api.decideJournal).not.toHaveBeenCalled();
  });

  it("does not round draft amounts in the save payload when display decimals change", async () => {
    harness.api.getJournal.mockResolvedValue({
      ...submittedJournal,
      state: "draft",
      capabilities: { ...submittedJournal.capabilities, update: true },
      lines: submittedJournal.lines.map((line) => ({
        ...line,
        debit: line.debit === "0.00000000" ? line.debit : "100000.12000000",
        credit: line.credit === "0.00000000" ? line.credit : "100000.12000000",
      })),
    });
    harness.api.updateJournal.mockResolvedValue({ id: submittedJournal.id, state: "draft", version: 3 });
    await act(async () =>
      root.render(<FinanceJournalWorkspace page="manual-journal" recordRef="journal-1" onNavigate={vi.fn()} />),
    );
    await settle();
    const precision = document.body.querySelector("#journal-display-decimals");
    const debit = document.body.querySelector('[aria-label="Debit line 1"]');
    if (!(precision instanceof HTMLSelectElement) || !(debit instanceof HTMLInputElement))
      throw new Error("Missing amount controls");
    expect(debit.value).toBe("100,000.12");
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set?.call(precision, "0");
      precision.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await settle();
    expect(debit.value).toBe("100,000");
    click("Save Draft");
    await settle();
    expect(harness.api.updateJournal).toHaveBeenCalledWith(
      "journal-1",
      expect.objectContaining({
        lines: expect.arrayContaining([expect.objectContaining({ debit: "100000.12000000", credit: "0.00000000" })]),
      }),
      "csrf",
      expect.any(String),
    );
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.resetAllMocks();
  });

  it("applies register filters and follows the server cursor", async () => {
    harness.api.listJournals.mockResolvedValue({ items: [], next_cursor: "next-page" });
    await act(async () => root.render(<FinanceJournalWorkspace page="journal-register" onNavigate={vi.fn()} />));
    await settle();

    const reference = document.body.querySelector('[aria-label="Reference search"]');
    const from = document.body.querySelector('[aria-label="Date from"]');
    if (!(reference instanceof HTMLInputElement) || !(from instanceof HTMLInputElement))
      throw new Error("Missing filters");
    input(reference, "PAY-26");
    input(from, "2026-10-01");
    click("Apply");
    await settle();

    expect(harness.api.listJournals).toHaveBeenLastCalledWith(expect.stringContaining("reference=PAY-26"));
    expect(harness.api.listJournals).toHaveBeenLastCalledWith(expect.stringContaining("date_from=2026-10-01"));
    click("Next page");
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
    expect(document.body.textContent).toContain("exhausted");
    expect(document.body.textContent).toContain("JOURNAL_NOMINAL_INVALID");

    click("Activate");
    expect(harness.api.changeRecurringJournalStatus).not.toHaveBeenCalled();
    const confirmation = document.body.querySelector('[aria-label="Confirm recurring status change"] input');
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

    const nominal = document.body.querySelector('button[aria-label="Nominal account line 1"]');
    if (!(nominal instanceof HTMLButtonElement)) throw new Error("Missing nominal selector");
    act(() => nominal.click());
    await settle();
    const search = document.querySelector('[aria-label="Search nominal account line 1"]');
    if (!(search instanceof HTMLInputElement)) throw new Error("Missing nominal search");
    input(search, "1000");
    await settle();
    const option = [...document.querySelectorAll('[role="option"]')].find((item) => item.textContent?.includes("Cash"));
    if (!(option instanceof HTMLElement)) throw new Error("Missing nominal option");
    act(() => option.click());
    await settle();
    expect(document.body.querySelector('[aria-label="cost center dimension line 1"]')).not.toBeNull();
    expect([...document.querySelectorAll('[data-manual-journal-editor] th')].map(item => item.textContent?.trim()))
      .toEqual(["Nominal Account", "Description", "Debit", "Credit", "Action"]);
    expect(document.body.querySelector('[aria-label="cost center dimension line 1"]')?.closest("td"))
      .toBe(document.body.querySelector('[aria-label="Nominal account line 1"]')?.closest("td"));
    click("Save Draft");
    await settle();
    expect(document.body.textContent).toContain("enter the required cost center dimension");
    expect(harness.api.createJournal).not.toHaveBeenCalled();
  });

  it("searches and selects an eligible Bank nominal in a Manual Journal line", async () => {
    harness.api.getJournalOptions.mockResolvedValue({
      ...options,
      nominals: [
        ...options.nominals,
        { id: "bank-1", code: "230901", name: "Operating Bank", kind: "bank", required_dimensions: [] },
      ],
    });
    await act(async () => root.render(<FinanceJournalWorkspace page="manual-journal" onNavigate={vi.fn()} />));
    await settle();

    const nominal = document.body.querySelector('button[aria-label="Nominal account line 1"]');
    if (!(nominal instanceof HTMLButtonElement)) throw new Error("Missing nominal selector");
    act(() => nominal.click());
    await settle();
    const search = document.querySelector('[aria-label="Search nominal account line 1"]');
    if (!(search instanceof HTMLInputElement)) throw new Error("Missing nominal search");
    input(search, "Operating");
    await settle();
    const bank = [...document.querySelectorAll('[role="option"]')].find((item) =>
      item.textContent?.includes("Operating Bank"),
    );
    if (!(bank instanceof HTMLElement)) throw new Error("Missing Bank nominal option");
    expect(bank.textContent).toContain("Bank");
    act(() => bank.click());
    await settle();
    expect(nominal.getAttribute("data-value")).toBe("bank-1");
  });

  it("keeps Bank nominals out of the Recurring Journal line selector", async () => {
    harness.api.getJournalOptions.mockResolvedValue({
      ...options,
      nominals: [
        ...options.nominals,
        { id: "bank-1", code: "230901", name: "Operating Bank", kind: "bank", required_dimensions: [] },
      ],
    });
    await act(async () => root.render(<FinanceJournalWorkspace page="recurring-journals" onNavigate={vi.fn()} />));
    await settle();

    click("＋ New template");
    await settle();
    const nominal = document.body.querySelector('button[aria-label="Nominal account line 1"]');
    if (!(nominal instanceof HTMLButtonElement)) throw new Error("Missing recurring nominal selector");
    act(() => nominal.click());
    await settle();
    const labels = [...document.querySelectorAll('[role="option"]')].map((item) => item.textContent);
    expect(labels.some((label) => label?.includes("Cash"))).toBe(true);
    expect(labels.some((label) => label?.includes("Operating Bank"))).toBe(false);
  });

  it("shows only the two configured footer actions and submits a preparer's edited lines", async () => {
    harness.session.user.permissions.push("finance.journal.submit");
    const draft = { ...submittedJournal, state: "draft", version: 1,
      capabilities: { ...submittedJournal.capabilities, update: true, submit: true, approve: false } };
    harness.api.getJournal.mockResolvedValueOnce(draft).mockResolvedValue({ ...submittedJournal,
      version: 3, capabilities: { ...submittedJournal.capabilities, approve: false } });
    harness.api.updateJournal.mockResolvedValue({ id: "journal-1", state: "draft", version: 2 });
    harness.api.submitJournal.mockResolvedValue({ id: "journal-1", state: "submitted", version: 3 });
    await act(async () => root.render(<FinanceJournalWorkspace page="manual-journal" recordRef="journal-1" onNavigate={vi.fn()} />));
    await settle();
    expect([...document.querySelectorAll('footer[aria-label="Manual Journal actions"] button')].map(button => button.textContent))
      .toEqual(["Save Draft", "Approve & Close"]);
    expect(document.body.textContent).not.toContain("Submit for approval");
    expect(document.body.textContent).toContain("will remain Awaiting approval");
    const reference = document.body.querySelector('#journal-reference');
    if (!(reference instanceof HTMLInputElement)) throw new Error("Missing reference");
    input(reference,"Current edited reference");
    click("Approve & Close"); await settle();
    expect(harness.api.updateJournal).toHaveBeenCalledWith("journal-1",expect.objectContaining({reference_number:"Current edited reference"}),"csrf",expect.any(String));
    expect(harness.api.submitJournal).toHaveBeenCalledWith("journal-1",{expected_version:2},"csrf",expect.any(String));
    expect(harness.api.decideJournal).not.toHaveBeenCalled();
    expect(harness.notify).toHaveBeenCalledWith("Journal submitted. Awaiting approval.");
    expect(document.querySelector('[data-manual-journal-editor]')).toBeNull();
  });

  it("requires final review and resumes failed approval without saving or submitting again", async () => {
    harness.session.user.permissions.push("finance.journal.submit","finance.journal.approve","finance.journal.self_approve");
    harness.api.getJournal.mockResolvedValueOnce({ ...submittedJournal,state:"draft",version:1,
      capabilities:{...submittedJournal.capabilities,update:true,submit:true} }).mockResolvedValue({...submittedJournal,version:3});
    harness.api.updateJournal.mockResolvedValue({id:"journal-1",state:"draft",version:2});
    harness.api.submitJournal.mockResolvedValue({id:"journal-1",state:"submitted",version:3});
    harness.api.decideJournal.mockRejectedValueOnce(new Error("Response lost")).mockResolvedValue({id:"journal-1",state:"posted",version:4});
    await act(async () => root.render(<FinanceJournalWorkspace page="manual-journal" recordRef="journal-1" onNavigate={vi.fn()} />));
    await settle();
    const approve=[...document.querySelectorAll('button')].find(button=>button.textContent==="Approve & Close");
    expect(approve?.disabled).toBe(false);
    click("Approve & Close"); await settle();
    expect(document.body.textContent).toContain("Confirm the final review before approving this Journal.");
    expect(document.activeElement?.id).toBe("manual-journal-validation");
    expect(harness.api.updateJournal).not.toHaveBeenCalled();
    const confirmation=document.querySelector('#manual-journal-final-review');
    if (!(confirmation instanceof HTMLElement)) throw new Error("Missing final review");
    if (confirmation.getAttribute('aria-checked')!=="true") act(()=>confirmation.click());
    await settle(); click("Approve & Close"); await settle();
    expect(document.querySelector('#journal-reference')).toHaveProperty('disabled',true);
    expect(document.body.textContent).toContain("Retry the same action");
    click("Approve & Close"); await settle();
    expect(harness.api.updateJournal).toHaveBeenCalledTimes(1);
    expect(harness.api.submitJournal).toHaveBeenCalledTimes(1);
    expect(harness.api.decideJournal.mock.calls[0]).toEqual(harness.api.decideJournal.mock.calls[1]);
    expect(harness.notify).toHaveBeenCalledWith("Journal approved and posted.");
    expect(document.querySelector('[data-manual-journal-editor]')).toBeNull();
  });

  it("can hide optional actions without changing the editor or granting permission", async () => {
    harness.session.user.permissions.push("finance.journal.submit");
    await act(async () => root.render(<FinanceJournalWorkspace page="manual-journal" onNavigate={vi.fn()}
      actionVisibility={{saveDraft:false,approveAndClose:false}} />));
    await settle();
    expect(document.querySelector('#journal-date')).not.toBeNull();
    expect(document.querySelectorAll('footer[aria-label="Manual Journal actions"] button')).toHaveLength(0);
    expect(harness.api.createJournal).not.toHaveBeenCalled();
  });

  it("retains override reasons and invalidates final review when journal fields change", async () => {
    harness.session.user.roles = ["super_administrator"];
    harness.session.user.permissions.push("finance.journal.submit", "finance.journal.approve", "platform.approval.override");
    await act(async () => root.render(<FinanceJournalWorkspace page="manual-journal" onNavigate={vi.fn()} />));
    await settle();
    const approve = [...document.querySelectorAll("button")].find(button => button.textContent === "Approve & Close");
    const reason = document.querySelector("#manual-journal-override");
    const confirmation = document.querySelector("#manual-journal-final-review");
    const reference = document.querySelector("#journal-reference");
    if (!(reason instanceof HTMLInputElement) || !(confirmation instanceof HTMLElement) || !(reference instanceof HTMLInputElement))
      throw new Error("Missing review controls");
    expect(approve?.disabled).toBe(false);
    click("Approve & Close"); await settle();
    expect(document.body.textContent).toContain("Enter a self-approval override reason");
    act(() => confirmation.click()); await settle();
    expect(approve?.disabled).toBe(false);
    input(reason, "Authorized final review"); await settle();
    expect(approve?.disabled).toBe(false);
    input(reference, "Changed after review"); await settle();
    expect(approve?.disabled).toBe(false);
    click("Approve & Close"); await settle();
    expect(document.body.textContent).toContain("Confirm the final review before approving this Journal.");
    expect(harness.api.createJournal).not.toHaveBeenCalled();
  });

  it("does not create a replacement for an unreadable journal", async () => {
    harness.api.getJournal.mockRejectedValue(new Error("Read failed"));
    await act(async () => root.render(<FinanceJournalWorkspace page="manual-journal" recordRef="journal-1" onNavigate={vi.fn()} />));
    await settle();
    expect(document.body.textContent).toContain("Journal could not be loaded");
    expect(document.querySelector("[data-manual-journal-editor]")).toBeNull();
    expect(harness.api.createJournal).not.toHaveBeenCalled();
  });

  it("keeps confirmed permanent deletion in draft details, outside the entry footer", async () => {
    harness.api.getJournal.mockResolvedValue({ ...submittedJournal,state:"draft",
      capabilities:{...submittedJournal.capabilities,update:true,delete_draft:true,approve:false,reject:false} });
    harness.api.deleteJournal.mockResolvedValue({id:"journal-1",deleted:true});
    await act(async () => root.render(<FinanceJournalWorkspace page="journal-detail" recordRef="journal-1" onNavigate={vi.fn()} />));
    await settle();
    const reason=document.querySelector('#delete-reason'),confirmation=document.querySelector('#confirm-draft-delete');
    if (!(reason instanceof HTMLInputElement)||!(confirmation instanceof HTMLElement)) throw new Error("Missing deletion controls");
    input(reason,"Duplicate draft"); act(()=>confirmation.click()); await settle();
    click("Delete draft permanently"); await settle();
    expect(harness.api.deleteJournal).toHaveBeenCalledWith("journal-1",{expected_version:2,reason:"Duplicate draft"},"csrf",expect.any(String));
    expect(harness.notify).toHaveBeenCalledWith("Draft Journal content permanently deleted; audit tombstone retained.");
  });

  it("keeps one visible Journals menu item while retaining legacy route aliases", () => {
    const finance = prototypeModules.find((module) => module.id === "finance");
    const journals = finance?.groups.find((group) => group.id === "journals");
    expect(journals?.pages.filter((page) => !page.hiddenFromNavigation).map((page) => page.label)).toEqual([
      "Journals",
    ]);
    expect(journals?.pages.find((page) => page.id === "manual-journal")?.hiddenFromNavigation).toBe(true);
    expect(journals?.pages.find((page) => page.id === "recurring-journals")?.hiddenFromNavigation).toBe(true);
  });
  it('explains a submitted Journal and blocks posting in a closed period without losing review access', async () => {
    harness.api.getJournalPostingEligibility.mockResolvedValue({company_id:'company-1',journal_date:submittedJournal.journal_date,eligible:false,blocker:{code:'closed',message:'November is Soft Closed.'},period:null});
    harness.api.getJournal.mockResolvedValue({...submittedJournal,posting_eligibility:{company_id:'company-1',journal_date:submittedJournal.journal_date,eligible:false,blocker:{code:'FINANCE_PERIOD_CLOSED_POST_BLOCKED',message:'November is Soft Closed. An authorized period manager must open it before posting.'},period:null}});
    await act(async () => root.render(<FinanceJournalWorkspace page='journal-approval' recordRef='journal-1' onNavigate={vi.fn()} />));
    await settle();
    expect(document.body.textContent).toContain('Awaiting approval \u2014 not posted');
    expect(document.body.textContent).toContain('November is Soft Closed');
    expect(document.body.textContent).toContain('has not changed ledger or Bank balances');
    const confirmation=document.querySelector('#journal-final-confirmation');
    if(!(confirmation instanceof HTMLElement))throw new Error('Missing review');
    act(()=>confirmation.click()); await settle();
    click('Approve and Post'); await settle();
    expect(harness.api.decideJournal).not.toHaveBeenCalled();
    expect(harness.notify).not.toHaveBeenCalledWith('Journal confirmed and posted.');
    harness.api.getJournalPostingEligibility.mockResolvedValue({company_id:'company-1',journal_date:submittedJournal.journal_date,eligible:true,blocker:null,period:null});
    harness.api.decideJournal.mockResolvedValue({id:'journal-1',state:'posted',version:3});
    click('Approve and Post'); await settle();
    expect(harness.api.decideJournal).toHaveBeenCalledTimes(1);
    expect(harness.notify).toHaveBeenCalledWith('Journal confirmed and posted.');
  });

});
