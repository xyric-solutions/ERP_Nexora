// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { FinanceChartTemplates } from "../../app/features/finance/views/finance-chart-templates.js";
const harness = vi.hoisted(() => ({
  tenantId: "synthetic-one",
  api: { listChartTemplates: vi.fn(), listChartTemplateNodes: vi.fn() },
  permissions: ["finance.chart_template.read"],
}));
vi.mock("@/lib/session/session-provider", () => ({
  useSession: () => ({
    api: harness.api,
    loading: false,
    session: { tenant_id: harness.tenantId, user: { permissions: harness.permissions } },
  }),
}));
const revision = {
  id: "template-one",
  name: "Synthetic reference",
  revision: "v1",
  state: "published",
  version: 2,
  category_count: 1,
  section_count: 1,
  nominal_count: 2,
  source_filename: "approved.xlsx",
  source_sha256: "a".repeat(64),
  content_sha256: "b".repeat(64),
  published_at: "2026-10-20T00:00:00Z",
};
const category = {
  key: "category:expenses",
  kind: "category",
  code: null,
  name: "Expenses",
  parent_key: null,
  type: "expense",
  source_rows: [],
  review_note: null,
};
const section = {
  key: "section:7101",
  kind: "section",
  code: "7101",
  name: "Wages & Salaries",
  parent_key: category.key,
  type: "expense",
  source_rows: [],
  review_note: null,
};
const nominal = {
  key: "nominal:710103",
  kind: "nominal",
  code: "710103",
  name: "Staff Salaries",
  parent_key: section.key,
  type: "expense",
  source_rows: [{ source: "Screenshot 2", row: 3 }],
  review_note: "Verify original label.",
};
let container: HTMLDivElement, root: Root;
async function settle(ms = 300) {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
}
function change(id: string, value: string) {
  const element = container.querySelector(`#${id}`);
  if (!(element instanceof HTMLSelectElement || element instanceof HTMLInputElement))
    throw new Error("Control missing");
  act(() => {
    const proto = element instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(element, value);
    element.dispatchEvent(new Event(element instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
  });
}
function button(label: string) {
  const found = [...document.querySelectorAll("button")].find(
    (node) => node.textContent === label || node.getAttribute("aria-label") === label,
  );
  if (!found) throw new Error(`Button not found: ${label}`);
  return found;
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.resetAllMocks();
  harness.tenantId = "synthetic-one";
  harness.permissions.splice(0, harness.permissions.length, "finance.chart_template.read");
  harness.api.listChartTemplates.mockResolvedValue({ items: [revision], next_cursor: null });
  harness.api.listChartTemplateNodes.mockImplementation(async (_id: string, query: string) => {
    const params = new URLSearchParams(query);
    return {
      items: params.get("kind") === "category" ? [category] : params.get("kind") === "section" ? [section] : [nominal],
      next_cursor: null,
    };
  });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
async function render(kind: "category" | "section" | "nominal" = "category", onCompanyAccounts = vi.fn()) {
  await act(async () =>
    root.render(<FinanceChartTemplates initialKind={kind} onCompanyAccounts={onCompanyAccounts} />),
  );
  await settle(30);
  await settle();
}
describe("Central Chart Master Data browser", () => {
  it("loads live template metadata and keeps company accounts distinct", async () => {
    const navigate = vi.fn();
    await render("category", navigate);
    expect(container.textContent).toContain("Central Chart of Accounts");
    expect(container.textContent).toContain("not activate company accounts");
    expect(container.querySelector("table")?.textContent).toContain("Expenses");
    expect(harness.api.listChartTemplates).toHaveBeenCalled();
    expect(container.querySelector("#chart-revision")).toBeTruthy();
    act(() => button("Company accounts").click());
    expect(navigate).toHaveBeenCalledOnce();
  });
  it("makes no API calls when central-template permission is absent", async () => {
    harness.permissions.splice(0);
    await render();
    expect(container.textContent).toContain("Permission required");
    expect(harness.api.listChartTemplates).not.toHaveBeenCalled();
    expect(harness.api.listChartTemplateNodes).not.toHaveBeenCalled();
  });
  it("renders an empty tenant and recovers from a directory failure on Refresh", async () => {
    harness.api.listChartTemplates.mockRejectedValueOnce(new Error("network"));
    await render();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("could not be loaded");
    harness.api.listChartTemplates.mockResolvedValue({ items: [], next_cursor: null });
    await act(async () => button("Refresh central data").click());
    await settle(30);
    expect(container.textContent).toContain("No central templates are available");
  });
  it("passes category, section and name/code search to the API and resets pagination", async () => {
    await render("nominal");
    change("chart-category-nominal", category.key);
    change("chart-section", section.key);
    change("chart-search-nominal", "710103");
    await settle();
    const query = new URLSearchParams(harness.api.listChartTemplateNodes.mock.calls.at(-1)?.[1]);
    expect(query.get("category_key")).toBe(category.key);
    expect(query.get("parent_key")).toBe(section.key);
    expect(query.get("search")).toBe("710103");
    expect(query.has("cursor")).toBe(false);
  });
  it("supports bounded server pagination, previous-page navigation and filtering reset", async () => {
    await render("nominal");
    harness.api.listChartTemplateNodes.mockResolvedValueOnce({ items: [nominal], next_cursor: "50" });
    change("chart-search-nominal", "Staff");
    await settle();
    act(() => button("Next page").click());
    await settle();
    expect(harness.api.listChartTemplateNodes.mock.calls.at(-1)?.[1]).toContain("cursor=50");
    act(() => button("Previous page").click());
    await settle();
    expect(harness.api.listChartTemplateNodes.mock.calls.at(-1)?.[1]).not.toContain("cursor=");
  });
  it("keeps a late response from replacing a newer search result", async () => {
    await render("nominal");
    let resolveOld: ((value: unknown) => void) | undefined;
    harness.api.listChartTemplateNodes.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveOld = resolve;
        }),
    );
    change("chart-search-nominal", "old");
    await settle();
    harness.api.listChartTemplateNodes.mockResolvedValueOnce({ items: [], next_cursor: null });
    change("chart-search-nominal", "new");
    await settle();
    await act(async () => resolveOld?.({ items: [{ ...nominal, name: "STALE RESULT" }], next_cursor: null }));
    expect(container.textContent).not.toContain("STALE RESULT");
    expect(container.textContent).toContain("No definitions match");
  });
  it("shows failure instead of stale rows after a failed node read", async () => {
    await render("nominal");
    harness.api.listChartTemplateNodes.mockRejectedValueOnce(new Error("failed"));
    change("chart-search-nominal", "failed");
    await settle();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("could not be loaded");
    expect(container.querySelector("table")).toBeNull();
  });
  it("stops the loading state if hierarchy metadata cannot be read", async () => {
    harness.api.listChartTemplateNodes.mockRejectedValue(new Error("metadata unavailable"));
    await render();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("could not be loaded");
    expect(container.querySelector('[aria-label="Loading central definitions"]')).toBeNull();
  });
  it("clears cached definitions when the authenticated tenant changes", async () => {
    await render("nominal");
    expect(container.querySelector("table")?.textContent).toContain("Staff Salaries");
    harness.tenantId = "synthetic-two";
    harness.api.listChartTemplates.mockResolvedValueOnce({ items: [], next_cursor: null });
    await render("nominal");
    expect(container.textContent).toContain("No central templates are available");
    expect(container.textContent).not.toContain("Staff Salaries");
  });
});
