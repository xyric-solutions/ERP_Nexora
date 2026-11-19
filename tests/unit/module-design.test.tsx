// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DocumentList } from "../../app/features/sales/views/sales-document-list";
import { ModuleDesignSurface } from "../../app/shared/ui/module-design";
import { createSalesSeed } from "../../app/features/sales/model/sales-fixtures";
import type { SalesNav } from "../../app/features/sales/components/sales-nav";
import { AccessMatrix } from "../../app/features/administration/components/access-matrix";

let root: Root, container: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  window.localStorage.clear();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

const nav = (): SalesNav => ({
  actor: "Imran Sheikh",
  open: vi.fn(),
  openNew: vi.fn(),
  go: vi.fn(),
  back: vi.fn(),
  notify: vi.fn(),
});
function renderList() {
  const navigation = nav();
  act(() =>
    root.render(
      <ModuleDesignSurface moduleId="sales">
        <DocumentList kind="quotation" nav={navigation} />
      </ModuleDesignSurface>,
    ),
  );
  return navigation;
}

describe("Module design rollout", () => {
  it.each(["sales", "administration", "manufacturing"])("applies the shared design to %s", (moduleId) => {
    act(() =>
      root.render(
        <ModuleDesignSurface moduleId={moduleId}>
          <button>Existing action</button>
        </ModuleDesignSurface>,
      ),
    );
    expect(container.querySelector("[data-module-design]")?.getAttribute("data-module-design")).toBe(moduleId);
  });
  it("leaves other module layouts outside the rollout", () => {
    act(() =>
      root.render(
        <ModuleDesignSurface moduleId="hr">
          <button>Existing action</button>
        </ModuleDesignSurface>,
      ),
    );
    expect(container.querySelector("[data-module-design]")).toBeNull();
    expect(container.querySelector("button")?.textContent).toBe("Existing action");
  });
  it("shows the artifact's six quotation columns while retaining every record", () => {
    renderList();
    expect([...container.querySelectorAll("thead th")].map((cell) => cell.textContent)).toEqual([
      "Quotation",
      "Customer",
      "Valid until",
      "Amount",
      "Status",
      "Next step",
    ]);
    expect(container.querySelectorAll("tbody tr")).toHaveLength(createSalesSeed().quotation.length);
    expect(container.querySelector('[aria-label="Columns: choose the columns shown"]')).not.toBeNull();
    expect(container.textContent).toContain("Prototype only");
  });
  it("opens the linked order from Next step and keeps quotation navigation separate", () => {
    const navigation = renderList();
    const quotation = createSalesSeed().quotation.find((record) => record.links.order)!;
    const row = [...container.querySelectorAll("tbody tr")].find((row) => row.textContent?.includes(quotation.code))!;
    const buttons = row.querySelectorAll<HTMLButtonElement>("button");
    act(() => buttons[1].click());
    expect(navigation.open).toHaveBeenCalledExactlyOnceWith(quotation.links.order);
    act(() => buttons[0].click());
    expect(navigation.open).toHaveBeenLastCalledWith(quotation.code);
  });
  it("retains keyboard row navigation", () => {
    const navigation = renderList();
    const row = container.querySelector<HTMLTableRowElement>("tbody tr")!;
    act(() => row.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
    expect(navigation.open).toHaveBeenCalledExactlyOnceWith(row.querySelector("button")?.textContent);
  });

  it("searches the access matrix without changing access grants", () => {
    const onAccessChange = vi.fn();
    act(() =>
      root.render(
        <AccessMatrix
          access={{ sales: "user", hr: "view" }}
          superAdmin={false}
          onAccessChange={onAccessChange}
          onSuperAdminChange={vi.fn()}
        />,
      ),
    );
    const search = container.querySelector<HTMLInputElement>('input[type="search"]')!;
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(search, "Sales");
      search.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(container.querySelector('[aria-label="Sales & Billing: User"]')?.getAttribute("aria-checked")).toBe("true");
    expect(container.querySelector('[aria-label="HR & Payroll: View"]')).toBeNull();
    expect(onAccessChange).not.toHaveBeenCalled();
  });
});
