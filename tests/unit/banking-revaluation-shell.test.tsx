// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../app/features/banking/views/banking-revaluation-workspace.js", () => ({
  BankingRevaluationWorkspace: ({
    recordRef,
    onNavigate,
  }: {
    recordRef?: string;
    onNavigate: (recordRef?: string) => void;
  }) => (
    <section data-testid="live-bank-revaluation">
      <span>Live Bank Revaluation {recordRef ?? "register"}</span>
      <button type="button" onClick={() => onNavigate("new")}>
        Open new
      </button>
    </section>
  ),
}));

import { PrototypeContent } from "../../app/shell/prototype-content.js";

let container: HTMLDivElement;
let root: Root;
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe("Bank Revaluation shell integration", () => {
  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.restoreAllMocks();
  });

  it("routes the Bank Revaluation page to the live workspace instead of the generic prototype form", async () => {
    const navigate = vi.fn();
    await act(async () =>
      root.render(
        <PrototypeContent
          context={{
            moduleId: "banking",
            moduleLabel: "Banking & Treasury",
            moduleCode: "BNK",
            moduleDescription: "Banking controls",
            pageLabel: "Revaluation",
            pageId: "revaluation",
            archetype: "form",
            status: "prototype",
            mode: "full",
            role: "Finance Manager",
            roleId: "finance-manager",
            companyMode: "trading",
            recordRef: "revaluation-1",
          }}
          rows={[]}
          viewState="loading"
          onAction={vi.fn()}
          onOpenPage={vi.fn()}
          onNavigate={navigate}
        />,
      ),
    );

    expect(container.textContent).toContain("Live Bank Revaluation revaluation-1");
    expect(container.textContent).not.toContain("Prototype only");
    expect(container.textContent).not.toContain("Supporting document");
    await act(async () => container.querySelector("button")?.click());
    expect(navigate).toHaveBeenCalledWith("banking", "revaluation", "new");
  });
});
