// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { SearchableSelect } from "../../app/shared/ui/searchable-select.js";
import { bankPeriodFailure } from "../../app/features/banking/components/bank-period-failure.js";
import { ApiError } from "../../app/lib/api/generated.js";
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
function host(disabled = false, loading = false) {
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
