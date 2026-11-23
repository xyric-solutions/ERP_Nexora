// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ComponentProps, ReactNode } from "react";
import type { SubledgerWorkspace } from "@nexora/contracts";
import { CustomerReceiptForm } from "../../app/features/finance/components/customer-receipt-form";

const api = vi.hoisted(() => ({ getCustomerMaster: vi.fn() }));
vi.mock("../../app/lib/session/session-provider", () => ({ useSession: () => ({ api }) }));
vi.mock("../../app/shared/ui/work-table", () => ({
  workSelectClass: "",
  WorkTable: ({ children, ...props }: { children: ReactNode; "aria-label"?: string }) => (
    <table aria-label={props["aria-label"]}>{children}</table>
  ),
}));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let container: HTMLDivElement, root: Root;
const data: SubledgerWorkspace = {
  company_id: "company",
  base_currency: "PKR",
  base_decimal_places: 2,
  as_of: "2026-11-23",
  parties: [],
  banks: [{ id: "bank", name: "Operating", currency: "PKR" }],
  currencies: [{ code: "PKR", decimal_places: 2 }],
  policy: null,
  accounts: [],
  operations: [],
  balances: [],
  total_items: 1,
  total_operations: 0,
  total_balances: 0,
  carrying_total: "0",
  unrealized_total: "0",
  items: [
    {
      id: "invoice",
      code: "INV-001",
      party_id: "customer",
      party_name: "Customer",
      side: "receivable",
      kind: "invoice",
      currency: "PKR",
      base_currency: "PKR",
      decimal_places: 2,
      base_decimal_places: 2,
      date: "2026-11-01",
      due_date: "2026-11-30",
      original_amount: "0.30",
      original_base: "0.30",
      outstanding: "0.30",
      carrying: "0.30",
      historical: "0.30",
      unrealized: "0",
      monetary: true,
      control_account_id: "control",
      journal_id: "journal",
      rate: "1",
      rate_id: null,
    },
  ],
};
function props(): ComponentProps<typeof CustomerReceiptForm> {
  return {
    data,
    party: "customer",
    bank: "bank",
    date: "2026-11-23",
    reference: "",
    amount: "0.30",
    fee: "0",
    notes: "Test receipt",
    allocations: { invoice: "0.10" },
    busy: false,
    canManage: true,
    contextFields: null,
    onParty: vi.fn(),
    onBank: vi.fn(),
    onDate: vi.fn(),
    onReference: vi.fn(),
    onAmount: vi.fn(),
    onFee: vi.fn(),
    onNotes: vi.fn(),
    onAllocate: vi.fn(),
    onSave: vi.fn(),
    onOffset: vi.fn(),
    onCancel: vi.fn(),
  };
}
beforeEach(() => {
  api.getCustomerMaster.mockResolvedValue({ address: "Billing street" });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.clearAllMocks();
});
it("loads the company customer address and calculates exact receipt balances", async () => {
  await act(async () => root.render(<CustomerReceiptForm {...props()} />));
  expect(api.getCustomerMaster).toHaveBeenCalledWith("customer", "company");
  expect(container.querySelector("textarea")?.value).toBe("Billing street");
  expect([...container.querySelectorAll("input")].some((input) => input.readOnly && input.value === "0.20")).toBe(true);
  expect(container.querySelector("tfoot")?.textContent).toContain("Total PKR0.30\u20140.100.10");
});
it("does not add unlike currencies or display a false zero for invalid allocations", async () => {
  const input = props();
  await act(async () => root.render(<CustomerReceiptForm {...input} allocations={{ invoice: "invalid" }} />));
  expect(container.querySelector("tfoot")?.textContent).toContain("\u2014");
  await act(async () =>
    root.render(
      <CustomerReceiptForm {...input} data={{ ...data, banks: [{ id: "bank", name: "Foreign", currency: "USD" }] }} />,
    ),
  );
  expect(
    container
      .querySelector('input[title="Calculated on draft review for cross-currency allocations."]')
      ?.getAttribute("value"),
  ).toBe("\u2014");
});
it("shows no invoices before customer selection and keeps unauthorized saves disabled", async () => {
  await act(async () => root.render(<CustomerReceiptForm {...props()} party="" canManage={false} />));
  expect(container.textContent).toContain("No data available in table");
  expect(container.querySelector('button[type="submit"]')?.hasAttribute("disabled")).toBe(true);
});
it("preserves draft submission and cancel callbacks", async () => {
  const input = props();
  await act(async () => root.render(<CustomerReceiptForm {...input} />));
  await act(async () =>
    container.querySelector("form")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
  );
  expect(input.onSave).toHaveBeenCalledWith("new");
  await act(async () =>
    [...container.querySelectorAll("button")].find((button) => button.textContent === "Cancel")?.click(),
  );
  expect(input.onCancel).toHaveBeenCalledOnce();
});

it.each(["print", "new", "close"] as const)("submits the selected %s draft action", async (action) => {
  const input = props();
  await act(async () => root.render(<CustomerReceiptForm {...input} />));
  const button = container.querySelector<HTMLButtonElement>(`button[value="${action}"]`)!;
  await act(async () =>
    container
      .querySelector("form")!
      .dispatchEvent(new SubmitEvent("submit", { bubbles: true, cancelable: true, submitter: button })),
  );
  expect(input.onSave).toHaveBeenCalledWith(action);
});
it("does not submit while busy", async () => {
  const input = props();
  await act(async () => root.render(<CustomerReceiptForm {...input} busy />));
  await act(async () =>
    container.querySelector("form")!.dispatchEvent(new SubmitEvent("submit", { bubbles: true, cancelable: true })),
  );
  expect(input.onSave).not.toHaveBeenCalled();
});
