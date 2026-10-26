// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/shared/ui/searchable-select", async () => ({
  SearchableSelect: (await import("./searchable-select-double.js")).SearchableSelectDouble,
}));

const harness = vi.hoisted(() => ({
  api: {
    listBankingCompanies: vi.fn(),
    listBankTransferOptions: vi.fn(),
    listBankWorkflowOptions: vi.fn(),
    getBankTransfer: vi.fn(),
    createBankTransfer: vi.fn(),
    updateBankTransfer: vi.fn(),
    submitBankTransfer: vi.fn(),
    decideBankTransfer: vi.fn(),
  },
  session: {
    tenant_id: "tenant-1",
    user: {
      id: "maker-1",
      email: "maker@example.test",
      roles: ["transfer_maker"],
      permissions: [
        "banking.transfer.read",
        "banking.transfer.create",
        "banking.transfer.update",
        "banking.transfer.submit",
      ],
    },
  },
}));

vi.mock("@/lib/session/session-provider", () => ({
  useSession: () => ({ api: harness.api, session: harness.session, loading: false, csrfToken: () => "csrf-token" }),
}));

import { BankingTransferEntry } from "../../app/features/banking/views/banking-transfer-entry.js";

let container: HTMLDivElement;
let root: Root;
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

async function settle() {
  for (let index = 0; index < 4; index += 1)
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
}

async function settleWorkflow() {
  await settle();
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 250));
  });
  await settle();
}

function changeAt(label: string, index: number, value: string) {
  const element = container.querySelectorAll(`[aria-label="${label}"]`).item(index);
  if (!(
    element instanceof HTMLInputElement ||
    element instanceof HTMLSelectElement ||
    element instanceof HTMLTextAreaElement
  ))
    throw new Error(`Missing form control: ${label}`);
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

function change(label: string, value: string) {
  changeAt(label, 0, value);
}

describe("BankingTransferEntry", () => {
  beforeEach(() => {
    harness.session.user.roles = ["transfer_maker"];
    harness.session.user.permissions = [
      "banking.transfer.read",
      "banking.transfer.create",
      "banking.transfer.update",
      "banking.transfer.submit",
    ];
    harness.api.listBankingCompanies.mockResolvedValue({ items: [{ id: "company-1", code: "C01", name: "Nexora" }] });
    harness.api.listBankTransferOptions.mockResolvedValue({
      bank_accounts: [
        {
          id: "bank-a",
          reference: "BA-1",
          account_name: "Operating USD",
          bank_name: "Bank A",
          account_number_masked: "•••• 1001",
          currency: "USD",
          ledger_account_code: "1010",
          ledger_account_name: "Bank USD",
        },
        {
          id: "bank-b",
          reference: "BA-2",
          account_name: "Reserve USD",
          bank_name: "Bank B",
          account_number_masked: "•••• 1002",
          currency: "USD",
          ledger_account_code: "1020",
          ledger_account_name: "Bank Reserve",
        },
        {
          id: "bank-c",
          reference: "BA-3",
          account_name: "Reserve EUR",
          bank_name: "Bank C",
          account_number_masked: "•••• 1003",
          currency: "EUR",
          ledger_account_code: "1030",
          ledger_account_name: "Bank EUR",
        },
      ],
      transfer_modes: [{ value: "internal", label: "Internal" }],
    });
    harness.api.listBankWorkflowOptions.mockImplementation(async (_transaction: string, query: string) => {
      const kind = new URLSearchParams(query).get("kind");
      return {
        items:
          kind === "approver"
            ? [
                {
                  id: "approver-1",
                  code: null,
                  name: "Transfer Approver",
                  eligible: true,
                  self_approval: false,
                },
              ]
            : [],
        selected: null,
        next_cursor: null,
      };
    });
    harness.api.createBankTransfer.mockResolvedValue({
      id: "bank-transfer-123e4567-e89b-42d3-a456-426614174000",
      reference: "TRF-1",
      state: "draft",
      version: 1,
      audit_event_id: "audit-1",
      replayed: false,
    });
    harness.api.submitBankTransfer.mockResolvedValue({
      id: "bank-transfer-123e4567-e89b-42d3-a456-426614174000",
      reference: "TRF-1",
      state: "submitted",
      version: 2,
      audit_event_id: "audit-2",
      replayed: false,
    });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.resetAllMocks();
  });

  it("renders one Details control per line and persists the same-company bank movement", async () => {
    const onOpen = vi.fn();
    await act(async () => root.render(<BankingTransferEntry onBack={vi.fn()} onOpen={onOpen} />));
    await settleWorkflow();
    expect(container.querySelectorAll('[aria-label="Details"]')).toHaveLength(1);
    expect(container.querySelector('[aria-label="Details"]')?.tagName).toBe("TEXTAREA");
    expect(container.querySelector('[aria-label="Bank charge"]')).toBeNull();
    expect(container.querySelector("thead")?.textContent).not.toContain("Bank charge");
    change("From Bank", "bank-a");
    expect(container.textContent).toContain("Control: 1010 · Bank USD");
    change("To Bank", "bank-b");
    change("Details", "Move operating cash to reserve");
    change("Amount", "250.00");
    const addCharge = [...container.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "+ Add bank charge",
    );
    await act(async () => addCharge?.click());
    change("Bank charge", "2.50");
    const save = [...container.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "Save Draft",
    );
    await act(async () => save?.click());
    await settleWorkflow();
    expect(harness.api.createBankTransfer).toHaveBeenCalledWith(
      expect.objectContaining({
        company_id: "company-1",
        lines: [
          expect.objectContaining({
            from_bank_account_id: "bank-a",
            to_bank_account_id: "bank-b",
            details: "Move operating cash to reserve",
            source_amount: "250.00",
            bank_charge_amount: "2.50",
          }),
        ],
      }),
      "csrf-token",
      expect.stringMatching(/^web-bank-transfer-create-/),
    );
    expect(onOpen).toHaveBeenCalledWith("bank-transfer-123e4567-e89b-42d3-a456-426614174000");
  });

  it("shows grouped source totals and defers cross-currency calculation to the server", async () => {
    await act(async () => root.render(<BankingTransferEntry onBack={vi.fn()} onOpen={vi.fn()} />));
    await settle();

    changeAt("From Bank", 0, "bank-a");
    changeAt("To Bank", 0, "bank-b");
    changeAt("Amount", 0, "100.00");
    const addLine = [...container.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "+ Add More",
    );
    await act(async () => addLine?.click());

    changeAt("From Bank", 1, "bank-c");
    changeAt("To Bank", 1, "bank-b");
    changeAt("Amount", 1, "1.50");

    expect(container.querySelector("tfoot")?.textContent).toContain("EUR 1.50 · USD 100.00");
    expect(container.textContent).toContain(
      "Save the draft to calculate and lock the destination amount and exchange-rate evidence.",
    );
  });

  it("submits the persisted draft and opens its authoritative approval detail", async () => {
    const onOpen = vi.fn();
    await act(async () => root.render(<BankingTransferEntry onBack={vi.fn()} onOpen={onOpen} />));
    await settleWorkflow();

    change("From Bank", "bank-a");
    change("To Bank", "bank-b");
    change("Amount", "250.00");
    expect((container.querySelector('[aria-label="Approver"]') as HTMLSelectElement).disabled).toBe(false);
    change("Approver", "approver-1");
    expect((container.querySelector('[aria-label="Approver"]') as HTMLSelectElement).value).toBe("approver-1");
    await settleWorkflow();
    expect((container.querySelector('[aria-label="Approver"]') as HTMLSelectElement).value).toBe("approver-1");

    const submit = [...container.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "Submit for Approval",
    );
    expect(submit).toBeDefined();
    await act(async () => submit?.click());
    await settle();

    expect(harness.api.submitBankTransfer).toHaveBeenCalledWith(
      "bank-transfer-123e4567-e89b-42d3-a456-426614174000",
      { expected_version: 1 },
      "csrf-token",
      expect.stringMatching(/^web-bank-transfer-submit-/),
    );
    expect(onOpen).toHaveBeenCalledWith("bank-transfer-123e4567-e89b-42d3-a456-426614174000");
  });

  it("keeps Super Admin approval explicit, then approves and closes after authoritative revalidation", async () => {
    harness.session.user.roles = ["super_administrator"];
    harness.session.user.permissions = [
      "banking.transfer.read",
      "banking.transfer.create",
      "banking.transfer.update",
      "banking.transfer.submit",
      "banking.transfer.approve",
      "platform.approval.override",
    ];
    harness.api.listBankWorkflowOptions.mockImplementation(async (_transaction: string, query: string) => {
      const kind = new URLSearchParams(query).get("kind");
      return {
        items:
          kind === "approver"
            ? [{ id: "maker-1", code: null, name: "Shoaib", eligible: true, self_approval: true }]
            : [],
        selected: null,
        next_cursor: null,
      };
    });
    harness.api.getBankTransfer.mockResolvedValue({
      id: "bank-transfer-123e4567-e89b-42d3-a456-426614174000",
      reference: "TRF-1",
      state: "submitted",
      version: 2,
      approver_user_id: "maker-1",
      super_admin_override_allowed: true,
      delegated_self_approval_allowed: false,
    });
    harness.api.decideBankTransfer.mockResolvedValue({
      id: "bank-transfer-123e4567-e89b-42d3-a456-426614174000",
      reference: "TRF-1",
      state: "approved",
      version: 3,
      audit_event_id: "audit-3",
      replayed: false,
    });
    const onBack = vi.fn();
    const onOpen = vi.fn();
    await act(async () => root.render(<BankingTransferEntry onBack={onBack} onOpen={onOpen} />));
    await settleWorkflow();

    change("From Bank", "bank-a");
    change("To Bank", "bank-b");
    change("Amount", "250.00");
    expect((container.querySelector('[aria-label="Approver"]') as HTMLSelectElement).disabled).toBe(false);
    change("Approver", "maker-1");
    expect((container.querySelector('[aria-label="Approver"]') as HTMLSelectElement).value).toBe("maker-1");
    await settleWorkflow();
    expect((container.querySelector('[aria-label="Approver"]') as HTMLSelectElement).value).toBe("maker-1");

    const approve = [...container.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "Approve & Close",
    );
    expect(approve).toBeDefined();
    await act(async () => approve?.click());
    await settle();

    expect(harness.api.getBankTransfer).toHaveBeenCalledWith(
      "bank-transfer-123e4567-e89b-42d3-a456-426614174000",
    );
    expect(harness.api.decideBankTransfer).toHaveBeenCalledWith(
      "bank-transfer-123e4567-e89b-42d3-a456-426614174000",
      { action: "approve", expected_version: 2 },
      "csrf-token",
      expect.stringMatching(/^web-bank-transfer-approve-/),
    );
    expect(onBack).toHaveBeenCalledOnce();
    expect(onOpen).not.toHaveBeenCalled();
  });
});
