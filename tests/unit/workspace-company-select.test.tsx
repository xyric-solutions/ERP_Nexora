// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkspaceCompanySelect } from "../../app/shell/workspace-company-select.js";
const harness = vi.hoisted(() => ({
  activeCompany: { id: "a", code: "A", name: "Company A" },
  listCompanies: vi.fn(),
  selectCompany: vi.fn(),
}));
vi.mock("@/lib/session/session-provider", () => ({ useSession: () => harness }));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root, container: HTMLDivElement;
const beforeSwitch = vi.fn(),
  onSwitched = vi.fn();
async function render() {
  await act(async () => root.render(<WorkspaceCompanySelect beforeSwitch={beforeSwitch} onSwitched={onSwitched} />));
}
async function choose() {
  await act(async () => {
    const select = container.querySelector("select")!;
    select.value = "b";
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
}
beforeEach(() => {
  vi.resetAllMocks();
  beforeSwitch.mockReturnValue(true);
  harness.listCompanies.mockResolvedValue({
    items: [harness.activeCompany, { id: "b", code: "B", name: "Company B" }],
  });
  harness.selectCompany.mockResolvedValue({});
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});
describe("ERP operating company control", () => {
  it("loads the authenticated directory and switches only after the unsaved-form guard", async () => {
    await render();
    expect(container.querySelector("select")).toHaveProperty("value", "a");
    expect(container.querySelector("select")?.title).toBe("Company A");
    await choose();
    expect(beforeSwitch).toHaveBeenCalledOnce();
    expect(harness.selectCompany).toHaveBeenCalledWith("b");
    expect(onSwitched).toHaveBeenCalledOnce();
  });
  it("preserves company and form when discarding changes is cancelled", async () => {
    beforeSwitch.mockReturnValue(false);
    await render();
    await choose();
    expect(harness.selectCompany).not.toHaveBeenCalled();
    expect(onSwitched).not.toHaveBeenCalled();
    expect(container.querySelector("select")).toHaveProperty("value", "a");
  });
  it("retains the current company and unsaved guard after a failed switch, and allows retry", async () => {
    harness.selectCompany.mockRejectedValueOnce(new Error("Unavailable"));
    await render();
    await choose();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("current company and form are preserved");
    expect(onSwitched).not.toHaveBeenCalled();
    expect(container.querySelector("select")).toHaveProperty("value", "a");
    await choose();
    expect(beforeSwitch).toHaveBeenCalledTimes(2);
    expect(onSwitched).toHaveBeenCalledOnce();
  });
  it("keeps the current company visible and retries a failed directory read", async () => {
    harness.listCompanies.mockRejectedValueOnce(new Error("Unavailable"));
    await render();
    expect(container.querySelector("select")).toHaveProperty("disabled", true);
    expect(container.textContent).toContain("Company A");
    await act(async () => container.querySelector("button")!.click());
    expect(harness.listCompanies).toHaveBeenCalledTimes(2);
    expect(container.querySelector("select")).toHaveProperty("disabled", false);
  });
});
