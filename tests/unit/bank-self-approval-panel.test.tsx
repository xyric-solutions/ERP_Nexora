// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import BankSelfApprovalPanel from "../../app/features/security/bank-self-approval-panel.js";
import { ApiError } from "../../app/lib/api/generated.js";
const harness = vi.hoisted(() => ({
  roles: ["super_administrator"],
  permissions: ["platform.approval.override", "security.bank_self_approval.read", "security.bank_self_approval.manage"],
  notify: vi.fn(),
  api: {
    listBankSelfApprovalOptions: vi.fn(),
    listBankSelfApprovalGrants: vi.fn(),
    changeBankSelfApprovalGrant: vi.fn(),
  },
}));
vi.mock("@/lib/session/session-provider", () => ({
  useSession: () => ({
    api: harness.api,
    session: { tenant_id: "synthetic", user: { id: "admin", roles: harness.roles, permissions: harness.permissions } },
    csrfToken: () => "synthetic-csrf",
  }),
}));
vi.mock("@/shared/ui/action-feedback", () => ({ useActionFeedback: () => harness.notify }));
let root: Root, container: HTMLDivElement;
async function settle(ms = 250) {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
}
function change(id: string, value: string) {
  const node = container.querySelector(`#${id}`);
  if (!(node instanceof HTMLSelectElement || node instanceof HTMLInputElement)) throw new Error(`Missing ${id}`);
  act(() => {
    Object.getOwnPropertyDescriptor(
      node instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype,
      "value",
    )!.set!.call(node, value);
    node.dispatchEvent(new Event(node instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
  });
}
function button(text: string) {
  const node = [...container.querySelectorAll("button")].find((item) => item.textContent?.trim() === text);
  if (!node) throw new Error(`Missing ${text}`);
  return node;
}
async function mount() {
  act(() => root.render(<BankSelfApprovalPanel />));
  await settle(0);
  await settle();
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.resetAllMocks();
  harness.roles.splice(0, harness.roles.length, "super_administrator");
  harness.permissions.splice(
    0,
    harness.permissions.length,
    "platform.approval.override",
    "security.bank_self_approval.read",
    "security.bank_self_approval.manage",
  );
  harness.api.listBankSelfApprovalOptions.mockResolvedValue({
    companies: [{ id: "company", code: "ONE", name: "Synthetic company" }],
    users: [{ id: "maker", name: "Synthetic maker" }],
    next_cursor: null,
  });
  harness.api.listBankSelfApprovalGrants.mockResolvedValue({ items: [], next_cursor: null });
  harness.api.changeBankSelfApprovalGrant.mockResolvedValue({ record: { version: 1 }, replayed: false });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
describe("Identity Bank self-approval panel", () => {
  it("fails closed without explicit global read authority and never requests private directories", async () => {
    harness.roles.splice(0);
    await mount();
    expect(container.textContent).toContain("explicit security.bank_self_approval.read");
    expect(harness.api.listBankSelfApprovalOptions).not.toHaveBeenCalled();
  });
  it("retains read-only history without manage controls", async () => {
    harness.permissions.splice(harness.permissions.indexOf("security.bank_self_approval.manage"), 1);
    await mount();
    expect(container.textContent).toContain("Bank self-approval grants");
    expect(container.textContent).not.toContain("Issue self-approval grant");
  });
  it("does not stall on unchanged selections and reuses the retry key without false success", async () => {
    await mount();
    change("bank-grant-kind", "payment");
    change("bank-grant-company", "company");
    await settle();
    expect((container.querySelector("#bank-grant-user") as HTMLSelectElement).disabled).toBe(false);
    change("bank-grant-user", "maker");
    await settle(0);
    change("bank-grant-user", "maker");
    change("bank-grant-reason", "Synthetic explicit authority");
    harness.api.changeBankSelfApprovalGrant.mockRejectedValueOnce(
      new ApiError(409, "Grant changed", "BANK_GRANT_VERSION_CONFLICT"),
    );
    act(() => button("Issue self-approval grant").click());
    await settle(0);
    expect(harness.notify).not.toHaveBeenCalled();
    expect(container.textContent).toContain("Grant changed");
    const first = harness.api.changeBankSelfApprovalGrant.mock.calls[0];
    expect(first?.[0]).toMatchObject({
      expected_version: 0,
      user_id: "maker",
      company_id: "company",
      transaction_kind: "payment",
    });
    act(() => button("Issue self-approval grant").click());
    await settle(0);
    expect(harness.api.changeBankSelfApprovalGrant.mock.calls[1]?.[2]).toBe(first?.[2]);
    expect(harness.notify).toHaveBeenCalledWith("Bank self-approval grant issued successfully.");
  });
});
