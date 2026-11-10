// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { financeNominalDetailSchema } from "../../packages/contracts/src/finance/index.js";
import { FinanceNominalDetail } from "../../app/features/finance/views/finance-nominals.js";
import { FinanceNominalRow } from "../../app/features/finance/components/finance-master-row.js";

const harness = vi.hoisted(() => ({
  api: {
    getFinanceNominal: vi.fn(),
    decideFinanceNominal: vi.fn(),
    listFinanceNominalOptions: vi.fn(),
    classifyChartNominal: vi.fn(),
    changeFinanceNominalStatus: vi.fn(),
  },
  notify: vi.fn(),
}));
vi.mock("@/lib/session/session-provider", () => ({
  useSession: () => ({
    api: harness.api,
    csrfToken: () => "synthetic-csrf",
    session: {
      user: {
        roles: ["super_administrator"],
        permissions: [
          "platform.approval.override",
          "finance.nominal.read",
          "finance.nominal.update",
          "finance.nominal.approve",
          "finance.nominal.status",
          "finance.chart_template.classify",
        ],
      },
    },
  }),
}));
vi.mock("@/shared/ui/action-feedback", () => ({ useActionFeedback: () => harness.notify }));
const detail = financeNominalDetailSchema.parse({
  id: "nominal-one",
  company_id: "company-one",
  code: "230901",
  name: "Receivables",
  description: "Review this nominal before approval",
  type: "asset",
  account_status: "inactive",
  is_header: false,
  category: { id: "category-one", code: "CAT-001", name: "Assets" },
  section: { id: "section-one", code: "2309", name: "Current assets" },
  currency: "USD",
  bank_account_id: null,
  identity_mode: "nominal_only",
  state: "pending_approval",
  version: 3,
  banking_available: false,
  created_at: "2026-11-05T00:00:00Z",
  self_decision_requires_override: false,
  super_admin_override_allowed: false,
  capabilities: { update: false, submit: false, decide: true, deactivate: false, activate: false },
  events: [],
});
let container: HTMLDivElement, root: Root;
async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 25));
  });
}
function click(label: string, parent: ParentNode = document.body) {
  const button = [...parent.querySelectorAll("button")].find((item) => item.textContent?.trim() === label);
  expect(button, `Missing button: ${label}`).toBeDefined();
  act(() => button!.click());
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("PointerEvent", MouseEvent);
  vi.resetAllMocks();
  harness.api.getFinanceNominal.mockResolvedValue(detail);
  harness.api.decideFinanceNominal.mockResolvedValue({ ...detail, state: "active" });
  harness.api.changeFinanceNominalStatus.mockResolvedValue({ ...detail, state: "active" });
  harness.api.listFinanceNominalOptions.mockResolvedValue({
    companies: [{ id: detail.company_id, code: "ONE", name: "Company" }],
    categories: [detail.category],
    sections: [],
    currencies: [{ code: "USD", name: "US Dollar" }],
    setup: { cash_and_bank_configured: true, code_policy_configured: true },
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
describe("Nominal review and approval", () => {
  it.each(["draft", "pending_approval"] as const)(
    "opens %s records for review while keeping Edit explicit",
    (state) => {
      const open = vi.fn(),
        edit = vi.fn();
      act(() => root.render(<FinanceNominalRow nominal={{ ...detail, state }} onOpen={open} onEdit={edit} />));
      act(() => container.querySelector<HTMLButtonElement>("[data-finance-master-trigger]")!.click());
      expect(open).toHaveBeenCalledWith(detail.id);
      expect(edit).not.toHaveBeenCalled();
      click("Review");
      click("Edit");
      expect(open).toHaveBeenCalledTimes(2);
      expect(edit).toHaveBeenCalledWith(detail.id);
    },
  );
  it("shows the record before approval and returns to the directory only after success", async () => {
    const back = vi.fn();
    act(() => root.render(<FinanceNominalDetail nominalId={detail.id} onBack={back} onEdit={vi.fn()} />));
    await settle();
    await settle();
    expect((container.querySelector("#nominal-description") as HTMLTextAreaElement).value).toBe(detail.description);
    expect((container.querySelector("#nominal-name") as HTMLInputElement).value).toBe(detail.name);
    expect((container.querySelector("#nominal-name") as HTMLInputElement).disabled).toBe(true);
    expect(container.textContent).toContain("pending approval");
    expect(harness.api.decideFinanceNominal).not.toHaveBeenCalled();
    expect(container.querySelector("form")).not.toBeNull();
    expect(container.textContent).not.toContain("Review posting eligibility");
    click("Approve & Close");
    await settle();
    expect(harness.api.decideFinanceNominal).toHaveBeenCalledWith(
      detail.id,
      { expected_version: 3, action: "approve" },
      "synthetic-csrf",
      expect.any(String),
    );
    expect(harness.notify).toHaveBeenCalledWith("Nominal account approved successfully.");
    expect(back).toHaveBeenCalledOnce();
  });
  it("keeps failed approvals open and reuses the request key for retry", async () => {
    harness.api.decideFinanceNominal.mockRejectedValueOnce(new Error("Synthetic failure"));
    const back = vi.fn();
    act(() => root.render(<FinanceNominalDetail nominalId={detail.id} onBack={back} onEdit={vi.fn()} />));
    await settle();
    await settle();
    click("Approve & Close");
    await settle();
    expect(back).not.toHaveBeenCalled();
    expect(harness.notify).not.toHaveBeenCalled();
    expect(container.textContent).toContain("Please retry");
    click("Approve & Close");
    await settle();
    expect(harness.api.decideFinanceNominal.mock.calls[1][3]).toBe(harness.api.decideFinanceNominal.mock.calls[0][3]);
    expect(back).toHaveBeenCalledOnce();
  });
  it("closes a review without approving and respects server decision capabilities", async () => {
    harness.api.getFinanceNominal.mockResolvedValue({
      ...detail,
      capabilities: { ...detail.capabilities, decide: false },
    });
    const back = vi.fn();
    act(() => root.render(<FinanceNominalDetail nominalId={detail.id} onBack={back} onEdit={vi.fn()} />));
    await settle();
    expect(container.textContent).not.toContain("Approve");
    click("Close", container);
    expect(back).toHaveBeenCalledOnce();
    expect(harness.api.decideFinanceNominal).not.toHaveBeenCalled();
  });
  it("keeps classification in the creation form and retries activation without repeating a saved classification", async () => {
    const imported = {
      ...detail,
      state: "draft" as const,
      chart_template_id: "template-one",
      posting_classification: "review_required" as const,
      capabilities: { ...detail.capabilities, update: true, decide: false },
    };
    harness.api.getFinanceNominal.mockResolvedValueOnce(imported).mockResolvedValue({
      ...imported,
      version: 4,
      posting_classification: "ordinary",
      capabilities: { ...imported.capabilities, activate: true },
    });
    harness.api.classifyChartNominal.mockResolvedValue({ version: 4 });
    harness.api.changeFinanceNominalStatus.mockRejectedValueOnce(new Error("Synthetic activation failure"));
    const back = vi.fn();
    act(() => root.render(<FinanceNominalDetail nominalId={detail.id} onBack={back} onEdit={vi.fn()} />));
    await settle();
    await settle();
    const approve = [...container.querySelectorAll("button")].find((b) => b.textContent === "Approve & Close")!;
    expect(approve.disabled).toBe(true);
    const select = container.querySelector<HTMLSelectElement>("#nominal-account-use")!;
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(select, "ordinary");
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    click("Approve & Close");
    await settle();
    expect(harness.api.classifyChartNominal).toHaveBeenCalledWith(
      detail.id,
      expect.objectContaining({ expected_version: 3, classification: "ordinary" }),
      "synthetic-csrf",
      expect.any(String),
    );
    expect(back).not.toHaveBeenCalled();
    click("Approve & Close");
    await settle();
    expect(harness.api.classifyChartNominal).toHaveBeenCalledTimes(1);
    expect(harness.api.changeFinanceNominalStatus.mock.calls[0][1]).toMatchObject({
      expected_version: 4,
      action: "activate",
    });
    expect(harness.api.changeFinanceNominalStatus.mock.calls[1][3]).toBe(
      harness.api.changeFinanceNominalStatus.mock.calls[0][3],
    );
    expect(back).toHaveBeenCalledOnce();
  });
  it("keeps module-controlled drafts blocked from direct approval", async () => {
    harness.api.getFinanceNominal.mockResolvedValue({
      ...detail,
      state: "draft",
      chart_template_id: "template-one",
      posting_classification: "module_controlled",
      capabilities: { ...detail.capabilities, update: true, decide: false },
    });
    act(() => root.render(<FinanceNominalDetail nominalId={detail.id} onBack={vi.fn()} onEdit={vi.fn()} />));
    await settle();
    await settle();
    expect([...container.querySelectorAll("button")].find((b) => b.textContent === "Approve & Close")!.disabled).toBe(
      true,
    );
    expect(harness.api.changeFinanceNominalStatus).not.toHaveBeenCalled();
  });
  it("requires reopening a concurrently changed record instead of approving details the user has not seen", async () => {
    harness.api.getFinanceNominal
      .mockResolvedValueOnce(detail)
      .mockResolvedValue({ ...detail, version: detail.version! + 1, name: "Changed by another user" });
    const back = vi.fn();
    act(() => root.render(<FinanceNominalDetail nominalId={detail.id} onBack={back} onEdit={vi.fn()} />));
    await settle();
    await settle();
    click("Approve & Close");
    await settle();
    expect(container.textContent).toContain("Close and reopen it before approving");
    expect(harness.api.decideFinanceNominal).not.toHaveBeenCalled();
    expect(back).not.toHaveBeenCalled();
  });
});
