// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { SearchableSelect } from "../../app/shared/ui/searchable-select.js";
import { bankPeriodFailure } from "../../app/features/banking/components/bank-period-failure.js";
import { ApiError } from "../../app/lib/api/generated.js";
import { LineItemsEditor } from "../../app/features/sales/components/line-items-editor";
import { blankLine } from "../../app/features/sales/model/sales-workflow";
let root: Root, container: HTMLDivElement;
const changed = vi.fn(),
  searched = vi.fn();
const options = [
  { value: "subscriptions", label: "711301 · Subscriptions" },
  { value: "historic", label: "Historical account", disabled: true },
];
const settle = async () => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 30));
  });
};
function host(disabled = false, loading = false, inlineSearch = false) {
  function Host() {
    const [value, setValue] = useState(""),
      [search, setSearch] = useState("");
    return (
      <SearchableSelect
        label="Nominal"
        value={value}
        options={options}
        placeholder="Select nominal"
        disabled={disabled}
        loading={loading}
        inlineSearch={inlineSearch}
        search={search}
        onSearchChange={(value) => {
          setSearch(value);
          searched(value);
        }}
        onValueChange={(value) => {
          setValue(value);
          changed(value);
        }}
      />
    );
  }
  act(() => root.render(<Host />));
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("PointerEvent", MouseEvent);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  // JSDOM 25's selector engine recursively re-enters :fullscreen matching.
  // No element can be fullscreen in JSDOM; leave all other selectors real.
  const matches = Element.prototype.matches;
  vi.spyOn(Element.prototype, "matches").mockImplementation(function (selector) {
    return selector.includes(":fullscreen") ? false : matches.call(this, selector);
  });
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(() => new DOMRect(0, 0, 320, 40));
  HTMLElement.prototype.scrollIntoView = vi.fn();
  vi.clearAllMocks();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
describe("Searchable directory dropdown", () => {
  it("searches and selects in the same field when inline search is requested", async () => {
    host(false, false, true);
    const input = container.querySelector('input[aria-label="Nominal"]') as HTMLInputElement;
    expect(input).not.toBeNull();
    act(() => {
      input.focus();
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "711301");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await settle();
    expect(searched).toHaveBeenLastCalledWith("711301");
    expect(document.querySelectorAll('input[role="combobox"]')).toHaveLength(1);
    const item = [...document.querySelectorAll('[role="option"]')].find((item) =>
      item.textContent?.includes("Subscriptions"),
    ) as HTMLElement;
    expect(item).toBeTruthy();
    act(() => item.click());
    await settle();
    expect(changed).toHaveBeenCalledWith("subscriptions");
    expect(input.value).toBe("711301 · Subscriptions");
    expect(document.querySelector('[aria-label="Search nominal"]')).toBeNull();
  });
  it("opens search inside the popup, selects an ID, and restores the selected label after closing", async () => {
    host();
    expect(document.querySelector('[aria-label="Search nominal"]')).toBeNull();
    const trigger = container.querySelector('button[aria-label="Nominal"]')!;
    act(() => (trigger as HTMLButtonElement).click());
    await settle();
    const input = document.querySelector('[aria-label="Search nominal"]') as HTMLInputElement;
    expect(input).not.toBeNull();
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "711301");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await settle();
    expect(searched).toHaveBeenLastCalledWith("711301");
    const item = [...document.querySelectorAll('[role="option"]')].find((item) =>
      item.textContent?.includes("Subscriptions"),
    ) as HTMLElement;
    act(() => item.click());
    await settle();
    expect(changed).toHaveBeenCalledWith("subscriptions");
    expect(trigger.textContent).toContain("711301 · Subscriptions");
    expect(document.querySelector('[aria-label="Search nominal"]')).toBeNull();
  });
  it("never exposes a popup for disabled controls", () => {
    host(true);
    const trigger = container.querySelector("button")!;
    act(() => trigger.click());
    expect(trigger.disabled).toBe(true);
    expect(document.querySelector('[aria-label="Search nominal"]')).toBeNull();
    expect(changed).not.toHaveBeenCalled();
  });
  it("retains disabled historical options without permitting selection", async () => {
    host();
    act(() => container.querySelector("button")!.click());
    await settle();
    const item = [...document.querySelectorAll('[role="option"]')].find((item) =>
      item.textContent?.includes("Historical"),
    ) as HTMLElement;
    expect(item.getAttribute("aria-disabled")).toBe("true");
    act(() => item.click());
    expect(changed).not.toHaveBeenCalled();
  });
  it("shows loading rather than offering stale directory options", async () => {
    host(false, true);
    act(() => container.querySelector("button")!.click());
    await settle();
    expect(document.querySelector('[role="status"]')?.textContent).toContain("Loading options");
    expect(document.querySelectorAll('[role="option"]')).toHaveLength(0);
  });
});
describe("Sales product selection", () => {
  function renderLines(currency = "PKR", fxRate = 1) {
    function Host() {
      const [lines, setLines] = useState([{ ...blankLine(), qty: 2 }, { ...blankLine(), qty: 3 }]);
      return <><LineItemsEditor lines={lines} onChange={setLines} currency={currency} fxRate={fxRate} formatAmount={(amount) => amount.toFixed(2)} /><output>{JSON.stringify(lines)}</output></>;
    }
    act(() => root.render(<Host />));
  }
  async function searchProducts(query: string) {
    act(() => container.querySelector<HTMLButtonElement>('[aria-label="Product, line 1"]')!.click());
    await settle();
    const input = document.querySelector<HTMLInputElement>('[aria-label="Search products, line 1"]')!;
    expect(input).not.toBeNull();
    expect(document.activeElement).toBe(input);
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, query);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await settle();
  }
  it.each(["ins-hrs", "commissioning"])("opens search and finds a product by %s without changing other lines", async (query) => {
    renderLines();
    await searchProducts(query);
    const options = [...document.querySelectorAll<HTMLElement>('[role="option"]')];
    expect(options).toHaveLength(1);
    expect(options[0].textContent).toContain("Installation & Commissioning");
    act(() => options[0].click());
    await settle();
    const lines = JSON.parse(container.querySelector("output")!.textContent!);
    expect(lines[0]).toMatchObject({ sku: "INS-HRS", desc: "Installation & Commissioning", qty: 2, rate: 6500, tax: 16, uom: "Hour" });
    expect(lines[1]).toMatchObject({ sku: "", qty: 3 });
    expect(container.textContent).toContain("15080.00");
    expect(document.querySelector('[aria-label="Search products, line 1"]')).toBeNull();
  });
  it("preserves foreign-currency price conversion when selecting a searched product", async () => {
    renderLines("USD", 280);
    await searchProducts("hydraulic");
    act(() => document.querySelector<HTMLElement>('[role="option"]')!.click());
    await settle();
    expect(JSON.parse(container.querySelector("output")!.textContent!)[0]).toMatchObject({ sku: "HPM-045", rate: 344.64, tax: 18, qty: 2 });
  });
  it("shows no matches without modifying lines", async () => {
    renderLines();
    await searchProducts("no-such-product");
    expect(document.querySelectorAll('[role="option"]')).toHaveLength(0);
    expect(document.body.textContent).toContain("No matching options.");
    expect(JSON.parse(container.querySelector("output")!.textContent!)[0]).toMatchObject({ sku: "", qty: 2 });
  });
});

describe("Saved draft versus period failure", () => {
  it("explains the persisted draft and retains the correlation reference without bypassing period controls", () => {
    expect(
      bankPeriodFailure(new ApiError(409, "Not open", "PAYMENT_PERIOD_LOCKED", "period-reference"), "BP-2026-0001"),
    ).toContain("Draft BP-2026-0001 is saved");
    expect(
      bankPeriodFailure(new ApiError(409, "Not open", "RECEIPT_PERIOD_LOCKED", "period-reference"), "BR-2026-0001"),
    ).toContain("Reference: period-reference");
  });
  it("does not claim a draft saved without a reference or for other failures", () => {
    expect(bankPeriodFailure(new ApiError(409, "Not open", "PAYMENT_PERIOD_LOCKED"), "")).toBeNull();
    expect(bankPeriodFailure(new ApiError(403, "Denied", "PERMISSION_DENIED"), "BP-1")).toBeNull();
  });
});
