// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FinanceNominalForm, FinanceNominals } from "../../app/features/finance/views/finance-nominals.js";
const harness = vi.hoisted(() => ({
  api: { listFinanceNominalOptions: vi.fn(), createFinanceNominal: vi.fn(), listFinanceNominals: vi.fn() },
  permissions: ["finance.nominal.read", "finance.nominal.create", "finance.nominal.submit"],
  roles: ["super_administrator"],
}));
vi.mock("@/lib/session/session-provider", () => ({
  useSession: () => ({
    api: harness.api,
    csrfToken: () => "synthetic",
    loading: false,
    session: { user: { roles: harness.roles, permissions: harness.permissions } },
  }),
}));
let container: HTMLDivElement, root: Root;
const settle = async () => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
};
function change(id: string, value: string) {
  const element = container.querySelector("#" + id) as HTMLInputElement | HTMLSelectElement;
  act(() => {
    const proto = element instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(element, value);
    element.dispatchEvent(new Event(element instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
  });
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.resetAllMocks();
  harness.roles = ["super_administrator"];
  harness.permissions.splice(
    0,
    harness.permissions.length,
    "finance.nominal.read",
    "finance.nominal.create",
    "finance.nominal.submit",
    "platform.approval.override",
  );
  harness.api.listFinanceNominalOptions.mockResolvedValue({
    companies: [{ id: "company-1", code: "C1", name: "Synthetic" }],
    categories: [
      { id: "expense", code: "E", name: "Expenses" },
      { id: "asset", code: "A", name: "Assets" },
    ],
    sections: [
      {
        id: "expense-section",
        code: "ES",
        name: "Operating Expenses",
        category_id: "expense",
        section_role: "general",
        creation_enabled: true,
      },
      {
        id: "bank-section",
        code: "BS",
        name: "Cash & Bank",
        category_id: "asset",
        section_role: "cash_and_bank",
        creation_enabled: true,
      },
    ],
    currencies: [{ code: "USD", name: "Synthetic USD", decimal_places: 2, is_base: true }],
    setup: { cash_and_bank_configured: true, code_policy_configured: true },
  });
  harness.api.createFinanceNominal.mockResolvedValue({
    id: "nominal-1",
    code: "EXP-1",
    version: 1,
    state: "active",
    bank_account_id: null,
  });
  harness.api.listFinanceNominals.mockResolvedValue({ items: [], next_cursor: null });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
describe("Shared Finance nominal form", () => {
  it("denies an ordinary user even with all nominal permissions and a claimed override permission", async () => {
    harness.roles = ["finance_administrator"];
    await act(async () => root.render(<FinanceNominalForm onSaved={vi.fn()} onCancel={vi.fn()} />));
    await settle();
    await settle();
    expect(container.querySelector("form")).toBeNull();
    expect(harness.api.createFinanceNominal).not.toHaveBeenCalled();
  });
  it("creates and activates an ordinary nominal as Super Admin and derives its category from master data", async () => {
    const saved = vi.fn();
    await act(async () => root.render(<FinanceNominalForm onSaved={saved} onCancel={vi.fn()} />));
    await settle();
    await settle();
    expect(container.textContent).toContain("New Nominal Account");
    change("nominal-name", "Synthetic expense");
    const button = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "Save & Activate",
    )!;
    await act(async () => button.click());
    await settle();
    expect(harness.api.createFinanceNominal).toHaveBeenCalledWith(
      expect.objectContaining({
        nominal_kind: "general",
        company_id: "company-1",
        category_id: "expense",
        section_id: "expense-section",
        name: "Synthetic expense",
        currency: "USD",
      }),
      "synthetic",
      expect.any(String),
    );
    expect(saved).toHaveBeenCalledWith("nominal-1");
  });
  it("keeps Banking entry points restricted to Bank sections", async () => {
    harness.permissions.push("banking.bank_account.create", "banking.bank_account.submit");
    await act(async () => root.render(<FinanceNominalForm bankOnly onSaved={vi.fn()} onCancel={vi.fn()} />));
    await settle();
    await settle();
    expect(container.textContent).toContain("New Bank Nominal");
    const section = container.querySelector("#nominal-section") as HTMLSelectElement;
    expect([...section.options].map((option) => option.value)).toEqual(["", "bank-section"]);
  });
  it("uses the selected Excel Bank code/name and requires an explicit currency choice", async () => {
    harness.permissions.push("banking.bank_account.create", "banking.bank_account.submit");
    const original = await harness.api.listFinanceNominalOptions();
    harness.api.listFinanceNominalOptions.mockResolvedValue({
      ...original,
      bank_definitions: [
        {
          template_id: "template-one",
          node_key: "nominal:230901",
          code: "230901",
          name: "Synthetic approved Bank",
          section_id: "bank-section",
          configured: false,
        },
      ],
    });
    await act(async () => root.render(<FinanceNominalForm bankOnly onSaved={vi.fn()} onCancel={vi.fn()} />));
    await settle();
    await settle();
    change("nominal-bank-definition", "nominal:230901");
    expect((container.querySelector("#nominal-code") as HTMLInputElement).value).toBe("230901");
    expect((container.querySelector("#nominal-name") as HTMLInputElement).readOnly).toBe(true);
    expect((container.querySelector("#nominal-currency") as HTMLSelectElement).value).toBe("");
    const save = [...container.querySelectorAll("button")].find((button) => button.textContent === "Save & Activate")!;
    act(() => save.click());
    await settle();
    expect(harness.api.createFinanceNominal).not.toHaveBeenCalled();
    change("nominal-currency", "USD");
    act(() => save.click());
    await settle();
    expect(harness.api.createFinanceNominal).toHaveBeenCalledWith(
      expect.objectContaining({
        nominal_kind: "bank",
        chart_template_id: "template-one",
        chart_node_key: "nominal:230901",
        name: "Synthetic approved Bank",
        currency: "USD",
      }),
      "synthetic",
      expect.any(String),
    );
  });
  it("uses a database directory for Chart of Accounts and limits Bank approvals to Bank nominals", async () => {
    await act(async () =>
      root.render(<FinanceNominals title="Chart of Accounts" approvals onOpen={vi.fn()} onCreate={vi.fn()} />),
    );
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 300));
    });
    expect(harness.api.listFinanceNominals).toHaveBeenCalledWith(expect.stringContaining("nominal_kind=bank"));
    expect(container.textContent).not.toContain("Revenue - manufactured goods");
  });
});
