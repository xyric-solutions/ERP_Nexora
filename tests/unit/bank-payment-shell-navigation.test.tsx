// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  contentProps: null as null | {
    onNavigate: (
      moduleId: string,
      pageId: string,
      recordRef?: string,
      options?: { replace?: boolean; bypassUnsavedGuard?: boolean },
    ) => void;
    onPaymentEntryDirtyChange?: (dirty: boolean) => void;
  },
}));

vi.mock("../../app/shell/prototype-content.js", () => ({
  PrototypeContent: (props: NonNullable<typeof harness.contentProps>) => {
    harness.contentProps = props;
    return <div data-testid="mock-prototype-content" />;
  },
}));

vi.mock("../../app/features/ai/components/nexora-intelligence.js", () => ({
  NexoraIntelligenceLayer: () => null,
}));

import { PrototypeShell } from "../../app/shell/prototype-shell.js";

let container: HTMLDivElement;
let root: Root;

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function button(name: string): HTMLButtonElement {
  const match = [...container.querySelectorAll("button")].find((candidate) => candidate.textContent?.includes(name));
  if (!(match instanceof HTMLButtonElement)) throw new Error(`Missing button: ${name}`);
  return match;
}

beforeEach(async () => {
  harness.contentProps = null;
  window.history.replaceState(null, "", "#/banking/add-bank-payment");
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

describe("Bank Payment shell navigation", () => {
  it("keeps sidebar and Identity navigation on the entry page when discard is declined", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    act(() => harness.contentProps?.onPaymentEntryDirtyChange?.(true));

    act(() => button("Identity & Access").click());
    expect(window.location.hash).toBe("#/banking/add-bank-payment");
    expect(confirm).toHaveBeenCalledTimes(1);

    act(() => harness.contentProps?.onNavigate("banking", "bank-receipts"));
    expect(window.location.hash).toBe("#/banking/add-bank-payment");
    expect(confirm).toHaveBeenCalledTimes(2);
  });

  it("restores the entry route when browser-history navigation is declined", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    act(() => harness.contentProps?.onPaymentEntryDirtyChange?.(true));

    act(() => {
      window.history.replaceState(null, "", "#/dashboard/ceo-executive-dashboard");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });

    expect(confirm).toHaveBeenCalledOnce();
    expect(window.location.hash).toBe("#/banking/add-bank-payment");
  });
});
