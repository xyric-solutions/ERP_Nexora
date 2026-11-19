// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { PartyFinancialSetup } from "../../app/features/finance/components/party-financial-setup";
import type { SubledgerParty } from "@nexora/contracts";

const customer: SubledgerParty = {
  id: "customer-1",
  code: "CUS-001",
  company_id: "company-1",
  kind: "customer",
  name: "Configuration test customer",
  default_currency: "USD",
  financial_configuration: null,
};
let root: Root, container: HTMLDivElement;
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});
function render(element: ReactNode) {
  act(() => root.render(element));
}
function control(label: string) {
  const field = [...container.querySelectorAll("label")].find((item) => item.textContent?.trim().startsWith(label));
  const element = field && document.getElementById(field.htmlFor);
  if (!(element instanceof HTMLInputElement || element instanceof HTMLSelectElement))
    throw new Error(`Missing control ${label}`);
  return element;
}
function fill(label: string, value: string) {
  const element = control(label);
  act(() => {
    if (element instanceof HTMLInputElement)
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(element, value);
    else element.value = value;
    element.dispatchEvent(new Event(element instanceof HTMLInputElement ? "input" : "change", { bubbles: true }));
  });
}
function save() {
  act(() => container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
}
describe("financial party setup", () => {
  it("requires explicit credit and sends zero as a reviewed limit with the current version", () => {
    const onSave = vi.fn();
    render(
      <PartyFinancialSetup
        company="company-1"
        parties={[customer]}
        baseCurrency="PKR"
        disabled={false}
        onSave={onSave}
      />,
    );
    fill("Financial customer / supplier", customer.id);
    expect(container.querySelector<HTMLButtonElement>("button[type=submit]")?.disabled).toBe(true);
    fill("Customer credit limit", "0");
    fill("Default payment terms", "days_30");
    fill("Financial setup reason", "Approved cash-only customer");
    save();
    expect(onSave).toHaveBeenCalledWith(customer.id, {
      company_id: "company-1",
      expected_version: 0,
      payment_term: "days_30",
      credit_limit: "0",
      reason: "Approved cash-only customer",
    });
  });
  it("uses persisted settings/version and keeps supplier legacy defaults visible for review", () => {
    const supplier: SubledgerParty = {
      ...customer,
      id: "supplier-1",
      kind: "supplier",
      supplier_credit_days: 15,
      financial_configuration: {
        company_id: "company-1",
        party_id: "supplier-1",
        version: 2,
        credit_limit: null,
        credit_currency: "PKR",
        payment_term: "days_21",
        reason: "Reviewed supplier terms",
      },
    };
    const onSave = vi.fn();
    render(
      <PartyFinancialSetup
        company="company-1"
        parties={[supplier]}
        baseCurrency="PKR"
        disabled={false}
        onSave={onSave}
      />,
    );
    fill("Financial customer / supplier", supplier.id);
    expect(
      [...container.querySelectorAll("label")].some((item) => item.textContent?.startsWith("Customer credit limit")),
    ).toBe(false);
    expect(container.textContent).toContain("Supplier profile credit days: 15");
    expect(control("Default payment terms").value).toBe("days_21");
    fill("Financial setup reason", "Reviewed updated terms");
    save();
    expect(onSave).toHaveBeenCalledWith(
      supplier.id,
      expect.objectContaining({ expected_version: 2, credit_limit: null }),
    );
  });
  it("disables configuration without current management permission", () => {
    render(
      <PartyFinancialSetup company="company-1" parties={[customer]} baseCurrency="PKR" disabled onSave={vi.fn()} />,
    );
    expect(control("Financial customer / supplier").disabled).toBe(true);
  });
});
