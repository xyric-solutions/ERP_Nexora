// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/shared/ui/searchable-select", async () => ({
  SearchableSelect: (await import("./searchable-select-double.js")).SearchableSelectDouble,
}));
import type { BankWorkflowOptions } from "@nexora/contracts";
import {
  BankWorkflowControls,
  emptyBankWorkflowSelection,
} from "../../app/features/banking/components/bank-workflow-controls.js";
const harness = vi.hoisted(() => ({ list: vi.fn(), changed: vi.fn() }));
vi.mock("@/lib/session/session-provider", () => ({
  useSession: () => ({ api: { listBankWorkflowOptions: harness.list }, session: { tenant_id: "tenant-one" } }),
}));
const empty: BankWorkflowOptions = { items: [], selected: null, next_cursor: null };
let root: Root, container: HTMLDivElement;
function render(company = "company-one", selected = "") {
  act(() =>
    root.render(
      <BankWorkflowControls
        transaction="payments"
        company={company}
        value={{ ...emptyBankWorkflowSelection, project_id: selected }}
        disabled={false}
        onChange={harness.changed}
      />,
    ),
  );
}
async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 250));
  });
}
function project() {
  const control = container.querySelector('[aria-label="Project"]');
  if (!(control instanceof HTMLSelectElement)) throw new Error("Project selector missing");
  return control;
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.resetAllMocks();
  harness.list.mockResolvedValue(empty);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
describe("Bank workflow selectors", () => {
  it("uses bounded company/kind API projections without selecting an option implicitly", async () => {
    harness.list.mockImplementation(async (_transaction: string, query: string) => {
      const kind = new URLSearchParams(query).get("kind");
      return {
        ...empty,
        items: [{ id: `${kind}-one`, code: "ONE", name: "Authorized reference", eligible: true, self_approval: false }],
      };
    });
    render();
    await settle();
    expect(project().value).toBe("");
    expect(project().disabled).toBe(false);
    expect(harness.list).toHaveBeenCalledTimes(3);
    for (const call of harness.list.mock.calls) {
      expect(call[0]).toBe("payments");
      const query = new URLSearchParams(call[1]);
      expect(query.get("company_id")).toBe("company-one");
      expect(query.get("limit")).toBe("50");
    }
    act(() => {
      project().value = "project-one";
      project().dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(harness.changed).toHaveBeenCalledWith({ project_id: "project-one", location_id: "", approver_user_id: "" });
  });
  it("retains an inactive saved reference as a disabled historical option", async () => {
    harness.list.mockResolvedValue({
      ...empty,
      selected: { id: "historic", code: "OLD", name: "Historical project", eligible: false, self_approval: false },
    });
    render("company-one", "historic");
    await settle();
    expect(project().value).toBe("historic");
    expect(project().selectedOptions[0]?.disabled).toBe(true);
    expect(container.textContent).toContain("Historical details are retained");
    expect(harness.changed).not.toHaveBeenCalled();
  });
  it("fails closed on directory errors and retries through the real adapter", async () => {
    harness.list.mockRejectedValue(new Error("synthetic outage"));
    render();
    await settle();
    expect(project().disabled).toBe(true);
    harness.list.mockResolvedValue(empty);
    const retry = [...container.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("Retry project"),
    );
    expect(retry).toBeDefined();
    act(() => retry?.click());
    await settle();
    expect(project().disabled).toBe(false);
    expect(harness.changed).not.toHaveBeenCalled();
  });
  it("ignores late responses from the previous company", async () => {
    let resolveOld: ((result: BankWorkflowOptions) => void) | undefined;
    harness.list.mockImplementation((_transaction: string, query: string) => {
      const params = new URLSearchParams(query);
      return params.get("company_id") === "company-one" && params.get("kind") === "project"
        ? new Promise<BankWorkflowOptions>((resolve) => {
            resolveOld = resolve;
          })
        : Promise.resolve(empty);
    });
    render();
    await settle();
    render("company-two");
    await settle();
    await act(async () =>
      resolveOld?.({
        ...empty,
        items: [{ id: "foreign", code: "FOREIGN", name: "Wrong company", eligible: true, self_approval: false }],
      }),
    );
    expect(project().textContent).not.toContain("Wrong company");
    expect(project().disabled).toBe(false);
  });
});
