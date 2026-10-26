// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FinanceNominals } from "../../app/features/finance/views/finance-nominals.js";

const harness = vi.hoisted(() => ({
  tenant: "tenant-one",
  permissions: ["finance.nominal.read"],
  api: { listFinanceNominalOptions: vi.fn(), listFinanceNominals: vi.fn() },
}));
vi.mock("@/lib/session/session-provider", () => ({
  useSession: () => ({
    api: harness.api,
    loading: false,
    session: { tenant_id: harness.tenant, user: { id: "reader", roles: [], permissions: harness.permissions } },
  }),
}));
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function directory(name: string, next_cursor: string | null = null) {
  return {
    items: [{ id: name, code: name, name, currency: "USD", state: "draft", banking_available: false }],
    next_cursor,
  };
}
let container: HTMLDivElement, root: Root;
const render = () => root.render(<FinanceNominals onCreate={vi.fn()} onOpen={vi.fn()} />);
async function settle(ms = 300) {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
}
function change(label: string, value: string) {
  const select = container.querySelector(`select[aria-label="${label}"]`);
  if (!(select instanceof HTMLSelectElement)) throw new Error("Select missing");
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(select, value);
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.clearAllMocks();
  harness.tenant = "tenant-one";
  harness.permissions.splice(0, harness.permissions.length, "finance.nominal.read");
  harness.api.listFinanceNominalOptions.mockResolvedValue({
    companies: [
      { id: "company-one", code: "ONE", name: "Company One" },
      { id: "company-two", code: "TWO", name: "Company Two" },
    ],
  });
  harness.api.listFinanceNominals.mockReset();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
describe("Company Chart of Accounts directory isolation", () => {
  it("ignores an older company response that arrives after the new company response", async () => {
    const old = deferred<ReturnType<typeof directory>>();
    harness.api.listFinanceNominals
      .mockReturnValueOnce(old.promise)
      .mockResolvedValueOnce(directory("New company nominal"));
    act(render);
    await settle(0);
    await settle();
    expect(harness.api.listFinanceNominals).toHaveBeenCalledTimes(1);
    change("Nominal company", "company-two");
    await settle();
    expect(container.textContent).toContain("New company nominal");
    await act(async () => old.resolve(directory("Old company nominal")));
    expect(container.textContent).not.toContain("Old company nominal");
    expect(container.textContent).toContain("New company nominal");
  });
  it("clears rows and pagination immediately when company selection is removed", async () => {
    harness.api.listFinanceNominals.mockResolvedValue(directory("Company nominal", "next-page"));
    act(render);
    await settle(0);
    await settle();
    expect(container.textContent).toContain("Company nominal");
    change("Nominal company", "");
    expect(container.textContent).not.toContain("Company nominal");
    expect(container.textContent).not.toContain("Next page");
    await settle();
    expect(harness.api.listFinanceNominals).toHaveBeenCalledTimes(1);
  });
  it("does not retain previous rows during the company-change debounce", async () => {
    harness.api.listFinanceNominals.mockResolvedValue(directory("Previous nominal"));
    act(render);
    await settle(0);
    await settle();
    change("Nominal company", "company-two");
    expect(container.textContent).not.toContain("Previous nominal");
  });
  it("ignores a stale pagination result after changing the status filter", async () => {
    const next = deferred<ReturnType<typeof directory>>();
    harness.api.listFinanceNominals
      .mockResolvedValueOnce(directory("Initial nominal", "cursor-one"))
      .mockReturnValueOnce(next.promise)
      .mockResolvedValueOnce(directory("Active nominal"));
    act(render);
    await settle(0);
    await settle();
    const button = [...container.querySelectorAll("button")].find((item) => item.textContent === "Next page")!;
    act(() => button.click());
    change("Nominal status", "active");
    await settle();
    await act(async () => next.resolve(directory("Stale page", "obsolete-cursor")));
    expect(container.textContent).toContain("Active nominal");
    expect(container.textContent).not.toContain("Stale page");
    expect(container.textContent).not.toContain("Next page");
    expect(harness.api.listFinanceNominals.mock.calls[2]![0]).toContain("state=active");
    expect(harness.api.listFinanceNominals.mock.calls[2]![0]).not.toContain("cursor=");
  });
  it("resets the directory on tenant change and ignores the previous tenant's response", async () => {
    const old = deferred<ReturnType<typeof directory>>();
    harness.api.listFinanceNominals
      .mockReturnValueOnce(old.promise)
      .mockResolvedValueOnce(directory("Current tenant nominal"));
    act(render);
    await settle(0);
    await settle();
    harness.tenant = "tenant-two";
    act(render);
    await settle(0);
    await settle();
    await act(async () => old.resolve(directory("Previous tenant nominal")));
    expect(container.textContent).toContain("Current tenant nominal");
    expect(container.textContent).not.toContain("Previous tenant nominal");
    expect(harness.api.listFinanceNominalOptions).toHaveBeenCalledTimes(2);
  });
  it("hides directory data immediately when read permission is revoked", async () => {
    harness.api.listFinanceNominals.mockResolvedValue(directory("Restricted nominal"));
    act(render);
    await settle(0);
    await settle();
    harness.permissions.splice(0);
    act(render);
    expect(container.textContent).not.toContain("Restricted nominal");
    expect(container.textContent).toContain("do not have permission");
  });
});
