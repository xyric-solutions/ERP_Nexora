// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import IdentityWorkspace from "../../app/features/security/identity-workspace.js";

const state = vi.hoisted(() => ({
  session: {
    tenant_id: "workspace-tenant",
    user: { id: "checker", email: "checker@example.test", roles: [], permissions: [] as string[] },
  },
  api: {
    listSecurityRoles: vi.fn(),
    listSecurityAssignments: vi.fn(),
    listSecurityApprovals: vi.fn(),
    listSecurityPermissions: vi.fn(),
    listSecurityAudit: vi.fn(),
  },
  replace: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: state.replace }),
}));
vi.mock("@prototype/theme-provider", () => ({
  ThemeSelector: ({ label }: { label: string }) =>
    createElement("select", { "aria-label": label }, createElement("option", { value: "system" }, "System")),
}));
vi.mock("../../app/lib/session/session-provider", () => ({
  useSession: () => ({
    api: state.api,
    session: state.session,
    loading: false,
    logout: vi.fn(),
    csrfToken: () => "synthetic-csrf",
  }),
}));
vi.mock("../../app/features/security/users/user-management-panel", () => ({
  default: () => createElement("div", null, "User account list"),
}));
vi.mock("../../app/features/security/governed-table", () => ({
  default: ({ tab }: { tab: string }) => createElement("div", null, `Governed ${tab} records`),
}));
let container: HTMLDivElement;
let root: Root;
async function render(query: string) {
  window.history.replaceState(null, "", `/#/identity/access${query ? `?${query}` : ""}`);
  window.dispatchEvent(new PopStateEvent("popstate"));
  await act(async () => root.render(createElement(IdentityWorkspace)));
}
async function click(label: string) {
  const button = [...container.querySelectorAll("button")].find((item) => item.textContent?.trim() === label);
  if (!button) throw new Error(`Missing button: ${label}`);
  await act(async () => button.click());
  await act(async () => Promise.resolve());
}
describe("Users and Roles administrative workspace", () => {
  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    for (const method of Object.values(state.api))
      method.mockResolvedValue({ items: [{ id: "evidence" }], next_cursor: null });
    state.session.user.permissions = [];
    window.history.replaceState(null, "", "/admin/identity");
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.resetAllMocks();
    vi.unstubAllGlobals();
  });
  it("has exactly two main tabs with permissions inside Roles", async () => {
    await render("tab=roles");
    const main = container.querySelector('nav[aria-label="Identity and Access sections"]');
    expect([...main!.querySelectorAll("button")].map((button) => button.textContent)).toEqual([
      "Users",
      "Roles & Permissions",
      "Company-role Assignments",
      "Access Reviews",
      "Delegation & Impersonation",
      "Security & Session Policies",
    ]);
    await click("Permissions");
    expect(window.location.hash).toBe("#/identity/access?tab=roles&section=permissions");
    expect(state.api.listSecurityPermissions).toHaveBeenCalled();
    await click("Users");
    expect(container.textContent).toContain("User account list");
    expect(container.querySelector('nav[aria-label="Users Management sections"]')?.textContent).not.toContain(
      "Permissions",
    );
  });
  it("lets a checker reach all queues without selecting a user or role", async () => {
    await render("tab=users&section=approvals");
    expect(state.api.listSecurityApprovals).toHaveBeenLastCalledWith("?cursor=0&resource_type=user");
    expect(container.textContent).toContain("Governed approvals records");
    const select = container.querySelector<HTMLSelectElement>('select[aria-label="Approval resource type"]')!;
    await act(async () => {
      select.value = "assignment";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await render(window.location.search);
    expect(state.api.listSecurityApprovals).toHaveBeenLastCalledWith("?cursor=0&resource_type=assignment");
    await render("tab=roles&section=approvals");
    expect(state.api.listSecurityApprovals).toHaveBeenLastCalledWith("?cursor=0&resource_type=role");
  });
  it("preserves contextual history and pagination without frontend-only filtering", async () => {
    state.api.listSecurityAudit.mockResolvedValue({ items: [{ id: "evidence" }], next_cursor: "50" });
    await render("tab=users&section=audit&user=target");
    expect(state.api.listSecurityAudit).toHaveBeenLastCalledWith("?cursor=0&user_id=target&workspace=users");
    await click("Next");
    expect(state.api.listSecurityAudit).toHaveBeenLastCalledWith("?cursor=50&user_id=target&workspace=users");
    await click("Show all users");
    expect(state.api.listSecurityAudit).toHaveBeenLastCalledWith("?cursor=0&workspace=users");
  });
  it("maps legacy links and handles backend access denial explicitly", async () => {
    await render("tab=assignments&role_policy_id=policy");
    expect(state.api.listSecurityAssignments).toHaveBeenLastCalledWith("?cursor=0&role_policy_id=policy");
    state.api.listSecurityAudit.mockRejectedValue(new Error("Forbidden"));
    await render("tab=roles&section=audit&role=policy");
    expect(container.textContent).toContain("not authorized");
    expect(container.textContent).not.toContain("Governed audit records");
  });
});
