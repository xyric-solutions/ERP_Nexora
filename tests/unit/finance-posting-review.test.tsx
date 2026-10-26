// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { financeNominalDetailSchema } from "../../packages/contracts/src/finance/index.js";
import { FinancePostingReview } from "../../app/features/finance/views/finance-posting-review.js";
const harness = vi.hoisted(() => ({
  classify: vi.fn(),
  notify: vi.fn(),
  permissions: ["finance.chart_template.classify", "finance.nominal.update"],
}));
vi.mock("@/lib/session/session-provider", () => ({
  useSession: () => ({
    api: { classifyChartNominal: harness.classify },
    session: { user: { roles: ["super_administrator"], permissions: harness.permissions } },
    csrfToken: () => "synthetic-csrf",
  }),
}));
vi.mock("@/shared/ui/action-feedback", () => ({ useActionFeedback: () => harness.notify }));
const detail = financeNominalDetailSchema.parse({
  id: "nominal-one",
  company_id: "company-one",
  code: "711301",
  name: "Subscriptions",
  description: null,
  type: "expense",
  account_status: "inactive",
  is_header: false,
  category: { id: "category-one", code: "internal", name: "Expenses" },
  section: { id: "section-one", code: "7113", name: "Subscriptions" },
  currency: "USD",
  bank_account_id: null,
  identity_mode: null,
  state: "draft",
  version: 1,
  banking_available: false,
  posting_classification: "review_required",
  chart_template_id: "template-one",
  created_at: "2026-10-20T00:00:00.000Z",
  self_decision_requires_override: false,
  super_admin_override_allowed: false,
  capabilities: { update: true, submit: false, decide: false, deactivate: false },
  events: [],
});
let container: HTMLDivElement, root: Root;
const updated = vi.fn();
const settle = async () => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 25));
  });
};
const saveButton = () =>
  Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "Save posting review")!;
function choose() {
  const select = container.querySelector("select")!;
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(select, "ordinary");
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
  act(() => {
    (container.querySelector('[role="checkbox"]') as HTMLElement).click();
  });
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  // jsdom omits PointerEvent; Base UI forwards checkbox clicks with it.
  vi.stubGlobal("PointerEvent", MouseEvent);
  vi.clearAllMocks();
  harness.classify.mockReset();
  harness.permissions.splice(
    0,
    harness.permissions.length,
    "finance.chart_template.classify",
    "finance.nominal.update",
    "platform.approval.override",
  );
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
describe("Adopted nominal posting review UI", () => {
  it("requires explicit classification and confirmation before submitting", async () => {
    act(() => root.render(<FinancePostingReview detail={detail} onUpdated={updated} />));
    await settle();
    expect(saveButton().disabled).toBe(true);
    expect(container.querySelector("select")!.value).toBe("");
    choose();
    expect(saveButton().disabled).toBe(false);
    harness.classify.mockResolvedValueOnce({});
    act(() => saveButton().click());
    await settle();
    expect(harness.classify).toHaveBeenCalledWith(
      "nominal-one",
      { expected_version: 1, classification: "ordinary", reason: expect.any(String) },
      "synthetic-csrf",
      expect.stringMatching(/^chart-review-/),
    );
    expect(updated).toHaveBeenCalledOnce();
    expect(harness.notify).toHaveBeenCalledOnce();
  });
  it("preserves the idempotency key after a failed request and never reports false success", async () => {
    act(() => root.render(<FinancePostingReview detail={detail} onUpdated={updated} />));
    choose();
    harness.classify.mockRejectedValueOnce(new Error("Synthetic failure"));
    act(() => saveButton().click());
    await settle();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("could not be saved");
    expect(updated).not.toHaveBeenCalled();
    const firstKey = harness.classify.mock.calls[0]![3];
    harness.classify.mockResolvedValueOnce({});
    act(() => saveButton().click());
    await settle();
    expect(harness.classify.mock.calls[1]![3]).toBe(firstKey);
    expect(updated).toHaveBeenCalledOnce();
  });
  it("does not offer classification without the explicit permission or after submission", () => {
    harness.permissions.splice(0);
    act(() => root.render(<FinancePostingReview detail={detail} onUpdated={updated} />));
    expect(container.querySelector("select")).toBeNull();
    expect(container.textContent).toContain("review required");
    harness.permissions.push("finance.chart_template.classify", "finance.nominal.update");
    act(() =>
      root.render(<FinancePostingReview detail={{ ...detail, state: "pending_approval" }} onUpdated={updated} />),
    );
    expect(container.querySelector("select")).toBeNull();
  });
});
