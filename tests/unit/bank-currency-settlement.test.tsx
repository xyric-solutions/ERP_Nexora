// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SubledgerWorkspace } from "../../packages/contracts/src/index.js";
import { MultiCurrencyWorkspace } from "../../app/features/finance/views/multi-currency-workspace.js";

const harness = vi.hoisted(() => ({
  api: { getSubledgerWorkspace: vi.fn(), createSubledgerOperation: vi.fn(), createSubledgerParty: vi.fn() },
  company: "company-one",
}));
vi.mock("@/lib/session/session-provider", () => ({
  useSession: () => ({
    api: harness.api,
    activeCompany: { id: harness.company, name: "Test company" },
    csrfToken: () => "test-csrf",
    session: { user: { permissions: ["finance.subledger.read", "finance.subledger.manage"] } },
  }),
}));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root, container: HTMLDivElement;
const currencies = ["PKR", "AED", "USD"];
const workspace = (): SubledgerWorkspace => ({
  company_id: harness.company,
  base_currency: "PKR",
  base_decimal_places: 2,
  as_of: "2026-11-13",
  parties: [
    {
      id: "customer",
      code: "CUS-001",
      name: "Customer",
      company_id: harness.company,
      kind: "customer",
      default_currency: "USD",
    },
  ],
  policy: null,
  items: [],
  operations: [],
  balances: [],
  accounts: [],
  total_items: 0,
  total_operations: 0,
  total_balances: 0,
  carrying_total: "0.00",
  unrealized_total: "0.00",
  banks: currencies.map((currency) => ({ id: `bank-${currency}`, name: `${currency} bank`, currency })),
  currencies: currencies.map((code) => ({ code, decimal_places: 2 })),
});
async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}
function field(label: string) {
  const element = [...container.querySelectorAll("label")].find((item) => item.textContent === label);
  const input = element && document.getElementById(element.htmlFor);
  if (!(input instanceof HTMLInputElement || input instanceof HTMLSelectElement)) throw new Error(`Missing ${label}`);
  return input;
}
async function select(label: string, value: string) {
  await act(async () => {
    const element = field(label);
    element.value = value;
    element.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await settle();
}
function enter(label: string, value: string) {
  act(() => {
    const element = field(label);
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  harness.company = "company-one";
  harness.api.getSubledgerWorkspace.mockImplementation(async () => workspace());
  harness.api.createSubledgerOperation.mockResolvedValue({});
  harness.api.createSubledgerParty.mockResolvedValue({});
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe("bank-derived operational settlement", () => {
  it.each(currencies)("derives read-only %s from its bank and submits no editable currency", async (currency) => {
    await act(async () => root.render(<MultiCurrencyWorkspace operational initialTab="settlement" />));
    await settle();
    await select("Customer / supplier", "customer");
    await select("Bank account", `bank-${currency}`);
    expect(field("Payment currency")).toBeInstanceOf(HTMLInputElement);
    expect(field("Payment currency")).toHaveProperty("readOnly", true);
    expect(field("Payment currency").value).toBe(currency);
    expect(container.textContent).not.toContain("Accounting setup");
    expect(container.textContent).not.toContain("Bank deal rate");
    expect(field("Ledger")).toHaveProperty("disabled", true);
    enter("Payment amount before bank fee", "100.00");
    const form = field("Bank account").closest("form")!;
    await act(async () => form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(harness.api.createSubledgerOperation).toHaveBeenCalledOnce();
    const [payload] = harness.api.createSubledgerOperation.mock.calls[0]!;
    expect(payload).toMatchObject({
      type: "settlement",
      bank_account_id: `bank-${currency}`,
      payment_amount: "100.00",
    });
    expect(payload).not.toHaveProperty("payment_currency");
    expect(payload).not.toHaveProperty("conversion_rate");
  });
  it("clears amounts and fees when switching banks, and clears bank state on company change", async () => {
    await act(async () => root.render(<MultiCurrencyWorkspace operational initialTab="settlement" />));
    await settle();
    await select("Bank account", "bank-USD");
    enter("Payment amount before bank fee", "100.00");
    enter("Bank fee in payment currency", "2.00");
    await select("Bank account", "bank-AED");
    expect(field("Payment currency").value).toBe("AED");
    expect(field("Payment amount before bank fee").value).toBe("");
    expect(field("Bank fee in payment currency").value).toBe("0");
    harness.company = "company-two";
    await act(async () => root.render(<MultiCurrencyWorkspace operational initialTab="settlement" />));
    await settle();
    expect(field("Bank account").value).toBe("");
    expect(field("Payment currency").value).toBe("");
  });
  it.each([
    ["receivable", "Add customer", "customer"],
    ["payable", "Add supplier account", "supplier"],
  ] as const)("preserves %s party creation without exposing accounting policy", async (side, label, kind) => {
    await act(async () => root.render(<MultiCurrencyWorkspace operational initialSide={side} />));
    await settle();
    const button = [...container.querySelectorAll("button")].find((item) => item.textContent === label)!;
    await act(async () => button.click());
    await select("Original currency", "USD");
    expect(container.textContent).not.toContain("Control and exchange accounts");
    expect(container.textContent).not.toContain("Save accounting policy");
    enter("Name", "New financial party");
    await act(async () =>
      field("Name")
        .closest("form")!
        .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
    );
    expect(harness.api.createSubledgerParty).toHaveBeenCalledWith(
      expect.objectContaining({ kind, name: "New financial party", default_currency: "USD" }),
      "test-csrf",
      expect.any(String),
    );
  });
  it("retains accounting setup in the Accounting workspace", async () => {
    await act(async () => root.render(<MultiCurrencyWorkspace initialTab="settlement" />));
    await settle();
    expect(container.textContent).toContain("Accounting setup");
    expect(field("Ledger")).toHaveProperty("disabled", false);
  });
});
