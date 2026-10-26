// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  contentProps: null as null | {
    context: { moduleId: string; pageId: string; recordRef?: string };
    onNavigate: (moduleId: string, pageId: string, recordRef?: string) => void;
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

const reconciliationId = "bank-reconciliation-9f4b74f4-b118-4ac1-a531-54a0e61f6c89";
const importId = "9f4b74f4-b118-4ac1-a531-54a0e61f6c89";
let container: HTMLDivElement;
let root: Root;

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

beforeEach(async () => {
  harness.contentProps = null;
  window.history.replaceState(null, "", `#/banking/bank-reconciliation/${reconciliationId}`);
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

describe("Bank reconciliation shell navigation", () => {
  it("restores persisted reconciliation and statement-import identifiers from the route", async () => {
    expect(harness.contentProps?.context).toMatchObject({
      moduleId: "banking",
      pageId: "bank-reconciliation",
      recordRef: reconciliationId,
    });

    act(() => harness.contentProps?.onNavigate("banking", "import-statement", importId));
    await settle();

    expect(window.location.hash).toBe(`#/banking/import-statement/${importId}`);
    expect(harness.contentProps?.context).toMatchObject({
      moduleId: "banking",
      pageId: "import-statement",
      recordRef: importId,
    });
  });
});
