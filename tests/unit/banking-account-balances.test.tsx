// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { BankAccountSummary } from "@nexora/contracts";
import { BankingAccountBalances } from "../../app/features/banking/views/banking-account-balances.js";

const harness = vi.hoisted(() => ({
  api: { listBankingCompanies: vi.fn(), listBankAccounts: vi.fn(), getBankAccountSummary: vi.fn() },
}));
vi.mock("@/lib/session/session-provider", () => ({
  useSession: () => ({
    api: harness.api,
    loading: false,
    session: { user: { permissions: ["banking.bank_account.read"] } },
  }),
}));
const cash: BankAccountSummary = {
  id: "bank-cash",
  reference: "230901",
  account_name: "Cash on hand",
  account_type: "current",
  identity_mode: "nominal_only",
  bank_name: null,
  branch: null,
  account_number_masked: null,
  currency: "PKR",
  ledger_account_id: "nominal-cash",
  ledger_account_code: "230901",
  ledger_account_name: "Cash on hand",
  ledger_balance: "0",
  available_balance: null,
  unreconciled_count: null,
  last_movement_on: null,
  state: "active",
  version: 2,
};
let container: HTMLDivElement, root: Root;
const settle = async () => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 30));
  });
};
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.resetAllMocks();
  harness.api.listBankingCompanies.mockResolvedValue({ items: [{ id: "company-a", code: "A", name: "Company A" }] });
  harness.api.listBankAccounts.mockResolvedValue({ items: [cash], next_cursor: null });
  harness.api.getBankAccountSummary.mockResolvedValue({ items: [] });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

it("shows Finance-created bank nominals by name in the Bank column and filter and opens their persisted bank identity", async () => {
  const open = vi.fn();
  await act(async () => root.render(<BankingAccountBalances onOpenAccount={open} />));
  await settle();
  await settle();
  const bank = container.querySelector<HTMLSelectElement>('select[aria-label="Bank"]')!;
  expect([...bank.options].map((option) => option.value)).toContain("Cash on hand");
  const button = container.querySelector<HTMLButtonElement>('button[aria-label="Open Cash on hand"]')!;
  expect(button.textContent).toBe("Cash on hand");
  act(() => button.click());
  expect(open).toHaveBeenCalledWith("bank-cash");
  act(() => {
    bank.value = "Cash on hand";
    bank.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await settle();
  const query = new URLSearchParams(harness.api.listBankAccounts.mock.lastCall?.[0]);
  expect(query.get("bank")).toBe("Cash on hand");
  harness.api.listBankAccounts.mockResolvedValue({ items: [], next_cursor: null });
  act(() => {
    [...container.querySelectorAll("button")].find((item) => item.textContent === "Refresh")?.click();
  });
  await settle();
  expect([...bank.options].map((option) => option.value)).toContain("Cash on hand");
  expect(bank.value).toBe("Cash on hand");
});

it("preserves the institution name for detailed Bank accounts", async () => {
  harness.api.listBankAccounts.mockResolvedValue({
    items: [{ ...cash, identity_mode: "legacy_detailed", bank_name: "Example Bank", account_name: "Operating" }],
    next_cursor: null,
  });
  await act(async () => root.render(<BankingAccountBalances onOpenAccount={vi.fn()} />));
  await settle();
  await settle();
  const bank = container.querySelector<HTMLSelectElement>('select[aria-label="Bank"]')!;
  expect([...bank.options].map((option) => option.value)).toContain("Example Bank");
  expect(container.querySelector('button[aria-label="Open Example Bank"]')?.textContent).toBe("Example Bank");
});
