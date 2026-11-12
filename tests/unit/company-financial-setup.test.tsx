// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
vi.mock("../../app/features/finance/views/finance-fiscal-periods.js", () => ({
  FinanceFiscalPeriods: () => <p>Existing company fiscal controls</p>,
}));
vi.mock("../../app/features/finance/views/company-currencies-workspace.js", () => ({
  FinanceCurrencies: ({ embedded }: { embedded?: boolean }) => (
    <p>{embedded ? "Existing company currency forms" : "Standalone currencies"}</p>
  ),
}));
import { CompanyFinancialSetup } from "../../app/features/finance/views/company-financial-setup.js";
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let container: HTMLDivElement, root: Root;
function Setup() {
  const [section, setSection] = useState<string>();
  return <CompanyFinancialSetup section={section} onSectionChange={setSection} />;
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
describe("company financial setup", () => {
  it("starts with fiscal setup and retains existing currency forms in company configuration", async () => {
    await act(async () => root.render(<Setup />));
    expect(container.querySelector("h1")?.textContent).toBe("Company Setup");
    expect(container.textContent).toContain("Existing company fiscal controls");
    const currencies = [...container.querySelectorAll("button")].find((b) => b.textContent === "Company currencies");
    await act(async () => currencies?.click());
    expect(container.textContent).toContain("Existing company currency forms");
    expect(container.textContent).not.toContain("Existing company fiscal controls");
    const fiscal = [...container.querySelectorAll("button")].find((b) => b.textContent === "Fiscal year & periods");
    await act(async () => fiscal?.click());
    expect(container.textContent).toContain("Existing company fiscal controls");
    expect(container.querySelectorAll("h1")).toHaveLength(1);
  });
});
