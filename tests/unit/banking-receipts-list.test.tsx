// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "../../app/lib/api/generated.js";
import { BankingReceipts } from "../../app/features/banking/views/banking-receipts.js";

const state = vi.hoisted(() => ({
  loading: false,
  session: {
    tenant_id: "tenant-1",
    user: { id: "user-1", email: "maker@example.test", roles: [], permissions: ["banking.receipt.read", "banking.receipt.create"] },
  } as { tenant_id: string; user: { id: string; email: string; roles: string[]; permissions: string[] } } | null,
  api: { listBankingCompanies: vi.fn(), listBankReceiptOptions: vi.fn(), listBankReceipts: vi.fn() },
}));

vi.mock("../../app/lib/session/session-provider", () => ({
  useSession: () => ({ api: state.api, session: state.session, loading: state.loading }),
}));

const receipt = {
  id: "bank-receipt-123e4567-e89b-42d3-a456-426614174000",
  company_id: "company-1",
  reference: "BR-2026-00000001",
  bank_account_id: "account-1",
  bank_account_name: "Operating USD",
  bank_name: "First Meridian Bank",
  account_number_masked: "•••• 4471",
  posting_date: "2026-10-19",
  value_date: "2026-10-20",
  currency: "USD",
  total_amount: "1250.50",
  line_count: 2,
  payer_summary: "Atlas Customer",
  nominal_account_summary: "40-01-00100 - Service Revenue",
  narration_summary: "October customer receipt",
  state: "approved",
  version: 3,
  created_at: "2026-10-19T08:00:00.000Z",
};

const accountOptions = { bank_accounts: [{ id: "account-1", reference: "BA-0001", account_name: "Operating USD", bank_name: "First Meridian Bank", account_number_masked: "•••• 4471", currency: "USD", ledger_account_code: "10-01-00200", ledger_account_name: "Bank — Operating USD" }], receipt_methods: [] };
let container: HTMLDivElement;
let root: Root;

async function settle() {
  for (let index = 0; index < 5; index += 1) await act(async () => { await new Promise((resolve) => window.setTimeout(resolve, 0)); });
}

async function render(onOpenReceipt = vi.fn(), onCreateReceipt: (() => void) | undefined = vi.fn()) {
  await act(async () => { root.render(createElement(BankingReceipts, { onOpenReceipt, onCreateReceipt })); });
  await settle();
  return { onOpenReceipt, onCreateReceipt };
}

function control<T extends HTMLInputElement | HTMLSelectElement>(label: string): T {
  const field = [...container.querySelectorAll("label")].find((item) => item.querySelector("span")?.textContent?.includes(label));
  const result = field?.querySelector("input, select");
  if (!result) throw new Error(`Missing control: ${label}`);
  return result as T;
}

async function change(element: HTMLInputElement | HTMLSelectElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(element.constructor.prototype, "value")?.set?.call(element, value);
    element.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

async function click(label: string) {
  const button = [...container.querySelectorAll("button")].find((item) => item.textContent?.trim() === label);
  if (!button) throw new Error(`Missing button: ${label}`);
  await act(async () => button.click());
  await settle();
}

describe("BankingReceipts", () => {
  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    state.loading = false;
    state.session = { tenant_id: "tenant-1", user: { id: "user-1", email: "maker@example.test", roles: [], permissions: ["banking.receipt.read", "banking.receipt.create"] } };
    state.api.listBankingCompanies.mockResolvedValue({ items: [{ id: "company-1", code: "NX", name: "Nexora Services" }, { id: "company-2", code: "NX2", name: "Nexora Trading" }] });
    state.api.listBankReceiptOptions.mockResolvedValue(accountOptions);
    state.api.listBankReceipts.mockResolvedValue({ items: [receipt], next_cursor: null });
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

  it("loads persisted company-scoped receipt rows and opens by receipt identity", async () => {
    const { onOpenReceipt, onCreateReceipt } = await render();
    expect(state.api.listBankReceiptOptions).toHaveBeenCalledWith("?company_id=company-1");
    expect(state.api.listBankReceipts).toHaveBeenCalledWith("?company_id=company-1&sort_by=posting_date&sort_direction=desc&limit=50");
    expect(container.textContent).toContain("BR-2026-00000001");
    expect(container.textContent).toContain("Atlas Customer");
    expect(container.textContent).toContain("Service Revenue");
    expect(container.querySelector("caption")?.textContent).toContain("Persisted bank receipts");
    expect(container.textContent).toContain("Export is disabled because no governed receipt export endpoint");
    await click("BR-2026-00000001");
    expect(onOpenReceipt).toHaveBeenCalledWith(receipt.id);
    await click("Add bank receipt");
    expect(onCreateReceipt).toHaveBeenCalledOnce();
  });

  it("sends filters, sort and cursor to the receipt API", async () => {
    state.api.listBankReceiptOptions.mockImplementation(async (query: string) => query.includes("company-2") ? { ...accountOptions, bank_accounts: [{ ...accountOptions.bank_accounts[0], id: "account-2" }] } : accountOptions);
    state.api.listBankReceipts.mockResolvedValue({ items: [receipt], next_cursor: "cursor-2" });
    await render();
    await change(control<HTMLSelectElement>("Company"), "company-2");
    await settle();
    await change(control<HTMLSelectElement>("Bank account"), "account-2");
    await change(control<HTMLSelectElement>("Receipt state"), "approved");
    await change(control<HTMLInputElement>("Posting date from"), "2026-10-01");
    await change(control<HTMLInputElement>("Posting date to"), "2026-10-31");
    await change(control<HTMLInputElement>("Search receipts"), "Atlas");
    await change(control<HTMLSelectElement>("Sort receipts"), "total_amount");
    await click("Descending ↓");
    const filtered = state.api.listBankReceipts.mock.calls.at(-1)?.[0] as string;
    for (const part of ["company_id=company-2", "bank_account_id=account-2", "state=approved", "posting_date_from=2026-10-01", "posting_date_to=2026-10-31", "search=Atlas", "sort_by=total_amount", "sort_direction=asc"]) expect(filtered).toContain(part);
    await click("Load more");
    expect(state.api.listBankReceipts.mock.calls.at(-1)?.[0]).toContain("cursor=cursor-2");
  });

  it("clears stale rows after access denial and recovers through retry", async () => {
    await render();
    state.api.listBankReceipts.mockRejectedValueOnce(new ApiError(403, "Internal authorization detail", "BANKING_RECEIPT_ACCESS_DENIED", "correlation-1"));
    await click("Refresh");
    expect(container.textContent).toContain("Bank receipt access denied");
    expect(container.textContent).not.toContain("Internal authorization detail");
    expect(container.textContent).not.toContain("BR-2026-00000001");
    await click("Retry");
    expect(container.textContent).toContain("BR-2026-00000001");
  });

  it("renders session, permission and empty states without unauthorized API calls", async () => {
    state.loading = true;
    await render();
    expect(container.textContent).toContain("Checking banking access");
    expect(state.api.listBankingCompanies).not.toHaveBeenCalled();
    state.loading = false;
    state.session = null;
    await render();
    expect(container.textContent).toContain("Sign in required");
    state.session = { tenant_id: "tenant-1", user: { id: "user-2", email: "denied@example.test", roles: [], permissions: [] } };
    await render();
    expect(container.textContent).toContain("banking.receipt.read");
    state.session.user.permissions = ["banking.receipt.read"];
    state.api.listBankReceipts.mockResolvedValue({ items: [], next_cursor: null });
    await render();
    expect(container.textContent).toContain("No bank receipts found");
    expect(container.textContent).not.toContain("Add bank receipt");
  });
});
