// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../app/shell/prototype-content.js", () => ({
  PrototypeContent: () => <div data-testid="mock-prototype-content" />,
}));

vi.mock("../../app/features/ai/components/nexora-intelligence.js", () => ({
  NexoraIntelligenceLayer: () => null,
}));

import { findPrototypePage, prototypeModules } from "../../app/shell/config/prototype-data.js";
import { PrototypeShell } from "../../app/shell/prototype-shell.js";

let container: HTMLDivElement;
let root: Root;

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

beforeEach(async () => {
  window.localStorage.clear();
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 1440 });
  window.history.replaceState(null, "", "#/banking/account-balances");
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(<PrototypeShell identityContent={<div>Identity workspace</div>} />));
  await settle();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

describe("Prototype shell module navigation", () => {
  it("keeps useful navigation without duplicated context chips or breadcrumb groups", () => {
    expect(container.querySelector(".nx-context-summary")).toBeNull();
    expect([...container.querySelectorAll(".nx-breadcrumbs li")].map((item) => item.textContent)).toEqual([
      "Workspace",
      "Bank",
      "Account Balances",
    ]);
  });
  it("renders every visible page in the active group exactly once", () => {
    const banking = prototypeModules.find((module) => module.id === "banking");
    const bankGroup = banking?.groups.find((group) => group.id === "bank");
    const expectedLabels = (bankGroup?.pages ?? [])
      .filter((page) => !page.hiddenFromNavigation)
      .map((page) => page.label);
    const renderedLabels = [...container.querySelectorAll<HTMLButtonElement>(".nx-submenu-link")].map(
      (link) => link.querySelector("span")?.textContent ?? "",
    );

    expect(renderedLabels).toEqual(expectedLabels);
    expect(new Set(renderedLabels).size).toBe(renderedLabels.length);
  });

  it("hides consolidated Bank groups while preserving their routes", () => {
    const renderedGroups = [...container.querySelectorAll<HTMLButtonElement>(".nx-submenu-button")].map(
      (button) => button.querySelector("span")?.textContent ?? "",
    );

    expect(renderedGroups).toEqual(["Bank"]);
    expect(findPrototypePage("banking", "add-bank-account").page.label).toBe("Bank Account Setup");
    expect(findPrototypePage("banking", "treasury-reports").page.label).toBe("Treasury Reports");
  });

  it("exposes only the three Chart of Accounts work pages while preserving form and detail routes", () => {
    const finance = prototypeModules.find((module) => module.id === "finance");
    const chart = finance?.groups.find((group) => group.id === "chart-of-accounts");

    expect(chart?.pages.filter((page) => !page.hiddenFromNavigation).map((page) => page.label)).toEqual([
      "Categories",
      "Sections",
      "Nominals",
    ]);
    expect(findPrototypePage("finance", "add-coa-category").page.hiddenFromNavigation).toBe(true);
    expect(findPrototypePage("finance", "add-coa-section").page.hiddenFromNavigation).toBe(true);
    expect(findPrototypePage("finance", "add-nominal").page.hiddenFromNavigation).toBe(true);
    expect(findPrototypePage("finance", "nominal-detail").page.hiddenFromNavigation).toBe(true);
    expect(findPrototypePage("finance", "central-chart-template").page.hiddenFromNavigation).toBe(true);
  });
});
