// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { purchaseFlowSchema, purchaseFlowDocumentSchema } from "../../packages/contracts/src/procurement/index.js";
import { PurchaseFlowHeader } from "../../app/features/purchasing/components/purchase-flow-header.js";
import { purchaseStageStatus } from "../../app/features/purchasing/model/purchase-flow.js";

const document = (id: string, kind: string, state: string, source: string | null = null) =>
  purchaseFlowDocumentSchema.parse({
    id,
    code: id.toUpperCase(),
    kind,
    state,
    source_id: source,
    source_code: source?.toUpperCase() ?? null,
    document_date: "2026-11-10",
    supplier_name: null,
    total_amount: "10.00",
    currency: "USD",
  });
const flow = () =>
  purchaseFlowSchema.parse({
    root_id: "prq-001",
    root_code: "PRQ-001",
    items: [document("prq-001", "request", "approved"), document("rfq-001", "rfq", "submitted", "prq-001")],
    stages: [
      { kind: "request", total: 1, draft: 0, submitted: 0, approved: 1, rejected: 0, cancelled: 0 },
      { kind: "rfq", total: 1, draft: 0, submitted: 1, approved: 0, rejected: 0, cancelled: 0 },
    ],
    next_cursor: null,
  });
let root: Root, container: HTMLDivElement;
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const onNavigate = vi.fn(),
  onMore = vi.fn(),
  onRetry = vi.fn();
const props = () => ({
  flow: flow(),
  kind: "rfq" as const,
  record: null,
  loading: false,
  error: "",
  disabled: false,
  canCreate: true,
  onNavigate,
  onMore,
  moreBusy: false,
  onRetry,
});
beforeEach(() => {
  vi.clearAllMocks();
  container = window.document.createElement("div");
  window.document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});
function button(text: string) {
  const found = [...container.querySelectorAll("button")].find(
    (item) => item.textContent?.trim() === text || item.getAttribute("aria-label") === text,
  );
  if (!found) throw new Error(`Missing ${text}`);
  return found;
}
describe("Purchase workflow progress", () => {
  it("shows current stage, real statuses and gated creation actions", async () => {
    await act(async () => root.render(<PurchaseFlowHeader {...props()} />));
    expect(container.textContent).toContain("Purchase flow · PRQ-001");
    expect(container.textContent).toContain("Latest stage with records: RFQ");
    expect(container.querySelector('[aria-current="step"]')?.textContent).toContain("RFQ");
    expect(button("Create RFQ").disabled).toBe(false);
    expect(button("Create Order").disabled).toBe(true);
    expect(button("Create Bill").disabled).toBe(true);
    await act(async () => button("Create RFQ").click());
    expect(onNavigate).toHaveBeenCalledWith("add-rfq", "from:prq-001");
  });
  it("opens existing records and disables stage switching while changes are unsaved", async () => {
    await act(async () => root.render(<PurchaseFlowHeader {...props()} />));
    await act(async () => button("Open PRQ-001").click());
    expect(onNavigate).toHaveBeenCalledWith("add-requisition", "prq-001");
    await act(async () => root.render(<PurchaseFlowHeader {...props()} disabled />));
    expect(button("Open PRQ-001").disabled).toBe(true);
    expect(button("Create RFQ").disabled).toBe(true);
  });
  it("lists multiple receipts instead of silently selecting one or declaring completion", async () => {
    const data = flow();
    data.items.push(
      document("grn-001", "receipt", "approved", "po-001"),
      document("grn-002", "receipt", "draft", "po-001"),
    );
    data.stages.push({ kind: "receipt", total: 2, draft: 1, submitted: 0, approved: 1, rejected: 0, cancelled: 0 });
    await act(async () => root.render(<PurchaseFlowHeader {...props()} flow={data} kind="receipt" />));
    await act(async () => button("Open documents (2)").click());
    expect(container.textContent).toContain("GRN-001 · Approved");
    expect(container.textContent).toContain("GRN-002 · Draft");
    expect(onNavigate).not.toHaveBeenCalled();
    expect(purchaseStageStatus(data.stages.at(-1))).toBe("1 draft · 1 approved");
  });
  it("keeps progress read-only for users without creation access and surfaces failures", async () => {
    await act(async () => root.render(<PurchaseFlowHeader {...props()} canCreate={false} />));
    expect(button("Create RFQ").disabled).toBe(true);
    expect(button("Open PRQ-001").disabled).toBe(false);
    await act(async () =>
      root.render(<PurchaseFlowHeader {...props()} canCreate={false} error="Workflow unavailable" />),
    );
    expect(button("Create RFQ").disabled).toBe(true);
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("Workflow unavailable");
    await act(async () => button("Retry workflow").click());
    expect(onRetry).toHaveBeenCalledOnce();
  });
});
