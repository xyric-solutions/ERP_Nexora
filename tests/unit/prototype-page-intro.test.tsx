// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@prototype/features/banking/views/banking-account-balances", () => ({
  BankingAccountBalances: () => <div>Account directory</div>,
}));
import { PrototypeContent } from "../../app/shell/prototype-content.js";

let container: HTMLDivElement, root: Root;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

function render(status = "prototype", moduleId = "banking", pageId = "account-balances") {
  const navigate = vi.fn();
  act(() =>
    root.render(
      <PrototypeContent
        context={{
          moduleId,
          moduleLabel: "Module label",
          moduleCode: "TEST",
          moduleDescription: "Repeated module description",
          pageId,
          pageLabel: "Account Balances",
          archetype: "list",
          status,
          mode: "full",
          role: "Reviewer",
          roleId: "ceo",
          companyMode: "service",
        }}
        rows={[]}
        viewState="data"
        onAction={vi.fn()}
        onOpenPage={vi.fn()}
        onNavigate={navigate}
      />,
    ),
  );
  return navigate;
}

describe("Page introductions", () => {
  it("keeps the live page title and create action without technical filler", () => {
    const navigate = render();
    expect(container.querySelector("h1")?.textContent).toBe("Account Balances");
    expect(container.querySelector(".nx-page-intro .nx-status")).toBeNull();
    expect(container.textContent).not.toContain("Module label");
    expect(container.textContent).not.toContain("Repeated module description");
    expect(container.textContent).not.toContain("Export unavailable");
    act(() => container.querySelector<HTMLButtonElement>(".nx-page-actions button")!.click());
    expect(navigate).toHaveBeenCalledWith("banking", "add-bank-account");
  });
  it.each([
    ["prototype", "Prototype only"],
    ["read-only", "Read only"],
  ])("retains the %s limitation on unfinished or restricted pages", (status, label) => {
    // Keep this fixture on the generic prototype renderer; Inventory is API-backed.
    render(status, "prototype-test", "example-list");
    expect(container.querySelector(".nx-page-intro .nx-status")?.textContent).toBe(label);
    expect(container.querySelector(".nx-page-intro")?.textContent).not.toContain("Repeated module description");
  });
});
