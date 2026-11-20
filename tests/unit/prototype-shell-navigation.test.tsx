// @vitest-environment jsdom

// Navigation is isolated from live activity; authenticated acceptance covers the real adapter.
vi.mock("../../app/features/sales/model/persistent-sales-activity.js", () => ({
  usePersistentSalesActivity: () => ({ counts: {}, notifications: [], markRead: vi.fn(), retry: vi.fn(), error: "" }),
}));

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../app/shell/prototype-content.js", () => ({
  PrototypeContent: ({ context }: { context: { recordRef?: string } }) => (
    <div data-testid="mock-prototype-content" data-record-ref={context.recordRef} />
  ),
}));

vi.mock("../../app/features/ai/components/nexora-intelligence.js", () => ({
  NexoraIntelligenceLayer: () => null,
}));

vi.mock("../../app/shell/workspace-company-select.js", () => ({
  WorkspaceCompanySelect: () => <div>Company selector</div>,
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
  it("hides the requested modules while retaining their registered destinations", () => {
    const hidden = [
      "operations",
      "quality",
      "crm",
      "projects",
      "resources",
      "support",
      "expenses",
      "documents",
      "portals",
      "migration",
      "approvals",
      "configuration",
      "notifications",
      "integrations",
      "audit",
      "mobile",
    ];
    const buttons = [...container.querySelectorAll<HTMLButtonElement>(".nx-module-button")];
    for (const id of hidden) {
      const entry = prototypeModules.find((item) => item.id === id)!;
      expect(buttons.some((button) => button.title === entry.label)).toBe(false);
      expect(findPrototypePage(id).module.id).toBe(id);
    }
    for (const id of ["banking", "finance", "budget", "hr", "administration"]) {
      const entry = prototypeModules.find((item) => item.id === id)!;
      expect(buttons.some((button) => button.title === entry.label)).toBe(true);
    }
  });

  it("opens notifications from the top bar and retains the full centre route", async () => {
    const trigger = container.querySelector<HTMLButtonElement>('.nx-topbar [aria-label="Open notifications"]');
    expect(trigger).not.toBeNull();
    expect(trigger?.className).not.toContain("max-sm:hidden");
    await act(async () => trigger?.click());
    const dialog = container.querySelector('[role="dialog"][aria-label="Prototype notifications"]');
    expect(dialog?.textContent).toContain("Notification centre");
    const open = [...(dialog?.querySelectorAll<HTMLButtonElement>("button") ?? [])].find(
      (button) => button.textContent?.trim() === "Open notification centre",
    );
    expect(open).toBeDefined();
    await act(async () => open?.click());
    await settle();
    expect(window.location.hash).toBe("#/notifications/notification-centre");
    expect(container.querySelector('[data-testid="mock-prototype-content"]')).not.toBeNull();
  });

  it.each([
    ["asset-return", "Purchase Returns"],
    ["asset-refund", "Vendor Refunds"],
  ])("preserves an asset reference when opening the retired %s link", async (page, label) => {
    await act(async () => {
      window.history.replaceState(null, "", `#/assets/${page}/asset-source-123`);
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });
    await settle();
    expect([...container.querySelectorAll(".nx-breadcrumbs li")].map((item) => item.textContent)).toEqual([
      "Workspace",
      "Purchases",
      label,
    ]);
    expect(window.location.hash).toContain("asset-source-123");
    expect(container.querySelector('[data-testid="mock-prototype-content"]')?.getAttribute("data-record-ref")).toBe(
      "asset-source-123",
    );
  });
  it("keeps the assistant trigger named when responsive styles hide its text", () => {
    expect(container.querySelector("button.nx-intelligence-trigger--ai")?.getAttribute("aria-label")).toBe("Nexora AI");
  });
  it("removes ledger and group-reporting groups while keeping Reports and company setup destinations", () => {
    const accounting = prototypeModules.find((module) => module.id === "finance");
    const groups = accounting?.groups.filter((group) => !group.hiddenFromNavigation).map((group) => group.id);
    expect(groups).toEqual(["chart-of-accounts", "taxes", "reporting-master-data", "journals"]);
    for (const [oldPage, reportPage] of [
      ["general-ledger", "general-ledger-detail-report"],
      ["trial-balance", "trial-balance-report"],
      ["financial-statements", "balance-sheet-report"],
      ["finance-audit", "journal-register-report"],
    ]) {
      const target = findPrototypePage("finance", oldPage);
      expect(target.module.id).toBe("reports");
      expect(target.page.id).toBe(reportPage);
    }
    for (const oldPage of ["fiscal-periods", "period-close"]) {
      const target = findPrototypePage("finance", oldPage);
      expect(target.module.id).toBe("configuration");
      expect(target.page.id).toBe("company-fiscal-currency");
      expect(target.redirectRecordRef).toBe("fiscal");
    }
    const valuation = findPrototypePage("finance", "finance-revaluation");
    expect(valuation.page.id).toBe("currencies-fx");
    expect(valuation.redirectRecordRef).toBe("revaluation");
  });

  it("hides Purchase/Sales currency menus while retaining their deep links", () => {
    for (const [moduleId, pageId] of [
      ["sales", "currency-balances"],
      ["purchases", "supplier-currency-accounts"],
    ]) {
      const target = findPrototypePage(moduleId!, pageId!);
      expect(target.page.id).toBe(pageId);
      expect(target.page.hiddenFromNavigation).toBe(true);
    }
  });
  it("has one currency submenu and redirects old multicurrency links into it", () => {
    const finance = prototypeModules.find((module) => module.id === "finance");
    const currencyPages = finance?.groups
      .flatMap((group) => group.pages)
      .filter((page) => ["currencies-fx", "multi-currency"].includes(page.id) && !page.hiddenFromNavigation);
    expect(currencyPages?.map((page) => page.label)).toEqual(["Currencies & Transfer FX"]);
    const legacy = findPrototypePage("finance", "multi-currency");
    expect(legacy.page.id).toBe("currencies-fx");
    expect(legacy.group.id).toBe("reporting-master-data");
    expect(legacy.redirectRecordRef).toBe("accounting");
    expect(findPrototypePage("finance", "general-ledger").page.id).toBe("general-ledger-detail-report");
  });

  it("keeps useful navigation without duplicated context chips or breadcrumb groups", () => {
    expect(container.querySelector(".nx-context-summary")).toBeNull();
    expect([...container.querySelectorAll(".nx-breadcrumbs li")].map((item) => item.textContent)).toEqual([
      "Workspace",
      "Bank",
      "Account Balances",
    ]);
  });
  it("renders every visible page in the active group exactly once after expanding it", async () => {
    const groupButton = [...container.querySelectorAll<HTMLButtonElement>(".nx-submenu-button")].find(
      (button) => button.querySelector("span")?.textContent === "Bank",
    );
    await act(async () => groupButton?.click());
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
