// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("../../app/features/finance/views/company-currencies-workspace.js", () => ({
  FinanceCurrencies: ({ embedded }: { embedded?: boolean }) => (
    <p data-testid="currency-settings">{embedded ? "Existing currency forms" : "Standalone settings"}</p>
  ),
}));
vi.mock("../../app/features/finance/views/multi-currency-workspace.js", () => ({
  MultiCurrencyWorkspace: ({ embedded, initialTab }: { embedded?: boolean; initialTab?: string }) => (
    <p data-testid="currency-accounting" data-initial-tab={initialTab}>
      {embedded ? "Existing accounting workflows" : "Standalone accounting"}
    </p>
  ),
}));
import { FinanceCurrencyConsole } from "../../app/features/finance/views/finance-currency-console.js";
let container: HTMLDivElement, root: Root;
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
function Workspace({ initial }: { initial?: string }) {
  const [section, setSection] = useState(initial);
  return <FinanceCurrencyConsole section={section} onSectionChange={setSection} />;
}
beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});
describe("unified Currencies & Transfer FX", () => {
  it("opens the existing currency forms and switches to accounting under one heading", async () => {
    await act(async () => root.render(<Workspace />));
    expect(container.querySelector("h1")?.textContent).toBe("Currencies & Transfer FX");
    expect(container.textContent).toContain("Existing currency forms");
    const accounting = [...container.querySelectorAll("button")].find(
      (b) => b.textContent === "Balances & transactions",
    );
    await act(async () => accounting?.click());
    expect(container.textContent).toContain("Existing accounting workflows");
    expect(container.querySelectorAll("h1")).toHaveLength(1);
    expect(accounting?.getAttribute("aria-pressed")).toBe("true");
    const settings = [...container.querySelectorAll("button")].find(
      (b) => b.textContent === "Currencies & transfer rules",
    );
    await act(async () => settings?.click());
    expect(container.textContent).toContain("Existing currency forms");
    expect(container.querySelector('[data-testid="currency-accounting"]')).toBeNull();
  });
  it("opens the accounting view directly for a redirected bookmark", async () => {
    await act(async () => root.render(<Workspace initial="accounting" />));
    expect(container.textContent).toContain("Existing accounting workflows");
    expect(container.querySelector('[data-testid="currency-settings"]')).toBeNull();
  });
  it("opens valuation directly for the retired FX Revaluation bookmark", async () => {
    await act(async () => root.render(<Workspace initial="revaluation" />));
    expect(container.querySelector('[data-testid="currency-accounting"]')?.getAttribute("data-initial-tab")).toBe(
      "revaluation",
    );
    expect(container.querySelector('[data-testid="currency-settings"]')).toBeNull();
  });
});
