// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SecurityUserDetail, SecurityUserOptions } from "@nexora/contracts";

import UserDetail from "../../app/features/security/users/user-detail.js";
import UserWizard from "../../app/features/security/users/user-wizard.js";
import UserManagementPanel from "../../app/features/security/users/user-management-panel.js";
import type { UserWizardDraft } from "../../app/features/security/users/user-wizard-draft.js";

const api = vi.hoisted(() => ({
  listSecurityUsers: vi.fn(),
  listSecurityUserOptions: vi.fn(),
  getSecurityUser: vi.fn(),
  createSecurityUserRequest: vi.fn(),
  actOnSecurityUserRequest: vi.fn(),
}));
vi.mock("../../app/lib/session/session-provider", () => ({
  useSession: () => ({
    api,
    csrfToken: () => "synthetic-csrf",
    session: { tenant_id: "tenant-ui", user: { id: "maker-ui" } },
  }),
}));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams() }));

const user: SecurityUserDetail = {
  id: "user-ui",
  display_name: "Sam Example",
  username: "sam.example",
  email: "sam@example.test",
  status: "active",
  row_version: 3,
  default_company: { id: "company-ui", name: "Example Company", is_default: true },
  role_names: [],
  employee_linked: false,
  pending_request_count: 0,
  updated_at: "2026-10-12T00:00:00.000Z",
  companies: [{ id: "company-ui", name: "Example Company", is_default: true }],
  roles: [],
  employee: null,
  must_change_password: false,
};
const options: SecurityUserOptions = {
  companies: [{ id: "company-ui", code: "EX", name: "Example Company" }],
  employees: [{ id: "employee-ui", employee_number: "EMP-001", display_name: "Sam Employee" }],
  roles: [],
};
const draft: UserWizardDraft = {
  version: 1,
  draftId: "draft-ui",
  step: 1,
  displayName: "Sam Example",
  username: "sam.example",
  email: "sam@example.test",
  employeeId: "",
  companyIds: ["company-ui"],
  defaultCompanyId: "company-ui",
  roleIds: [],
};

let container: HTMLDivElement;
let root: Root;

function button(label: string): HTMLButtonElement {
  const found = Array.from(container.querySelectorAll("button")).find((item) => item.textContent?.trim() === label);
  if (!found) throw new Error(`Button not found: ${label}`);
  return found;
}

async function click(element: HTMLElement): Promise<void> {
  await act(async () => element.click());
}

describe("user account forms and details", () => {
  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    window.sessionStorage.clear();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    api.listSecurityUsers.mockResolvedValue({ items: [user], next_cursor: null });
    api.listSecurityUserOptions.mockResolvedValue(options);
    api.getSecurityUser.mockResolvedValue(user);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it("shows separate account columns and opens the selected user's details", async () => {
    await act(async () => {
      root.render(createElement(UserManagementPanel, { permissions: new Set(["security.user_account.read"]) }));
    });
    await act(async () => new Promise((resolve) => setTimeout(resolve, 20)));
    expect(Array.from(container.querySelectorAll("thead th")).map((item) => item.textContent)).toEqual([
      "",
      "Name",
      "Username",
      "Email",
      "Status",
      "Employee link",
      "Roles",
      "Action",
    ]);
    expect(container.querySelector("tbody")?.textContent).toContain("sam@example.test");
    const openUser = container.querySelector<HTMLButtonElement>('button[aria-label="Open user Sam Example"]');
    if (!openUser) throw new Error("Open user action missing");
    await click(openUser);
    expect(api.getSecurityUser).toHaveBeenCalledWith("user-ui");
    expect(container.querySelector("dl")?.textContent).toContain("Sam Example");
  });

  it("requires an Employee Master record when Employee is chosen and submits that link", async () => {
    const onSubmit = vi.fn(async () => true);
    await act(async () =>
      root.render(
        createElement(UserWizard, {
          options,
          busy: false,
          draftKey: "draft-ui",
          initialDraft: draft,
          onCancel: vi.fn(),
          onSubmit,
        }),
      ),
    );
    const employeeChoice = container.querySelector<HTMLInputElement>('input[value="employee"]');
    if (!employeeChoice) throw new Error("Employee choice missing");
    await click(employeeChoice);
    expect(button("Continue").disabled).toBe(true);
    const selection = container.querySelector<HTMLSelectElement>("select");
    if (!selection) throw new Error("Employee Master selection missing");
    await act(async () => {
      selection.value = "employee-ui";
      selection.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(button("Continue").disabled).toBe(false);
    await click(button("Continue"));
    await click(button("Continue"));
    await click(button("Continue"));
    await click(button("Save and submit"));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        proposal: expect.objectContaining({ employee_id: "employee-ui" }),
      }),
      expect.any(String),
    );
    expect(window.sessionStorage.getItem("draft-ui")).toBeNull();
  });

  it("offers a permission-controlled soft delete and confirms selected users before submitting", async () => {
    api.listSecurityUsers.mockResolvedValue({
      items: [user, { ...user, id: "user-second", display_name: "Second User" }],
      next_cursor: null,
    });
    api.createSecurityUserRequest.mockResolvedValue({ entity_id: "request-ui" });
    api.actOnSecurityUserRequest.mockResolvedValue({});
    await act(async () =>
      root.render(
        createElement(UserManagementPanel, {
          permissions: new Set([
            "security.user_account.read",
            "security.user_account.archive",
            "security.user_account.submit",
          ]),
        }),
      ),
    );
    await act(async () => new Promise((resolve) => setTimeout(resolve, 20)));
    expect(api.listSecurityUsers).toHaveBeenCalledWith("?archived=false");
    const selectAll = container.querySelector<HTMLInputElement>('[aria-label="Select all visible users"]');
    if (!selectAll) throw new Error("Selection missing");
    await click(selectAll);
    const action = container.querySelector<HTMLSelectElement>('[aria-label="Action for selected users"]');
    if (!action) throw new Error("Bulk action missing");
    expect(action.textContent).toContain("Delete (soft)");
    await act(async () => {
      action.value = "archive";
      action.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(api.createSecurityUserRequest).not.toHaveBeenCalled();
    expect(button("Confirm action").disabled).toBe(true);
    const reason = container.querySelector<HTMLInputElement>('[aria-label="Confirm user action"] input');
    if (!reason) throw new Error("Confirmation reason missing");
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(
        reason,
        "Retire synthetic accounts",
      );
      reason.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await click(button("Confirm action"));
    expect(api.createSecurityUserRequest).toHaveBeenCalledTimes(2);
    expect(api.createSecurityUserRequest.mock.calls[0]?.[0]).toMatchObject({
      requested_action: "archive",
      target_user_id: user.id,
      expected_user_version: 3,
      proposal: { reason: "Retire synthetic accounts" },
    });
    expect(api.actOnSecurityUserRequest).toHaveBeenCalledTimes(2);
    expect(container.textContent).toContain("2 of 2 requests submitted for independent approval");
  });

  it("does not offer mutation actions to a read-only user", async () => {
    await act(async () =>
      root.render(createElement(UserManagementPanel, { permissions: new Set(["security.user_account.read"]) })),
    );
    await act(async () => new Promise((resolve) => setTimeout(resolve, 20)));
    const action = container.querySelector<HTMLSelectElement>('[aria-label="Action for user Sam Example"]');
    expect(Array.from(action?.options ?? []).map((option) => option.value)).toEqual(["", "view"]);
  });

  it("clears the employee link when User only is selected and preserves that choice on close", async () => {
    const onCancel = vi.fn();
    const onSubmit = vi.fn(async () => true);
    await act(async () =>
      root.render(
        createElement(UserWizard, {
          options,
          busy: false,
          draftKey: "draft-ui",
          initialDraft: { ...draft, employeeId: "employee-ui", accountType: "employee" },
          onCancel,
          onSubmit,
        }),
      ),
    );
    const userChoice = container.querySelector<HTMLInputElement>('input[value="user"]');
    if (!userChoice) throw new Error("User-only choice missing");
    await click(userChoice);
    expect(container.querySelector("select")).toBeNull();
    await click(button("Close and keep draft"));
    expect(onCancel).toHaveBeenCalledOnce();
    expect(JSON.parse(window.sessionStorage.getItem("draft-ui") ?? "{}")).toMatchObject({
      accountType: "user",
      employeeId: "",
    });
    await click(button("Continue"));
    await click(button("Continue"));
    await click(button("Continue"));
    await click(button("Save and submit"));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        proposal: expect.objectContaining({ employee_id: null }),
      }),
      expect.any(String),
    );
  });

  it("keeps a restored employee draft blocked if its Employee Master record is no longer available", async () => {
    const onSubmit = vi.fn(async () => true);
    await act(async () =>
      root.render(
        createElement(UserWizard, {
          options: { ...options, employees: [] },
          busy: false,
          draftKey: "draft-ui",
          initialDraft: { ...draft, step: 4, employeeId: "employee-ui", accountType: "employee" },
          onCancel: vi.fn(),
          onSubmit,
        }),
      ),
    );
    expect(button("Save and submit").disabled).toBe(true);
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("employee selection");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("offers identity editing and submits the existing approved password-reset contract", async () => {
    const onGovernedAction = vi.fn(async () => undefined);
    await act(async () =>
      root.render(
        createElement(UserDetail, {
          user,
          options,
          permissions: new Set(["security.user_account.edit", "security.user_account.reset_password"]),
          busy: false,
          onClose: vi.fn(),
          onGovernedAction,
          onEmergency: vi.fn(),
          onAssignRole: vi.fn(),
          onRevokeRole: vi.fn(),
        }),
      ),
    );
    await click(button("Edit name / username / email"));
    expect(container.querySelector('input[type="email"]')?.getAttribute("value")).toBe("sam@example.test");
    await click(button("Cancel"));
    await click(button("Reset password"));
    expect(container.textContent).toContain("one-time password");
    await click(button("Submit password reset"));
    expect(onGovernedAction).toHaveBeenCalledWith({
      requested_action: "reset_password",
      target_user_id: "user-ui",
      expected_user_version: 3,
      proposal: { reason: "Approved administrative change" },
    });
  });

  it("hides identity and password actions without their exact permissions", async () => {
    await act(async () =>
      root.render(
        createElement(UserDetail, {
          user,
          options,
          permissions: new Set<string>(),
          busy: false,
          onClose: vi.fn(),
          onGovernedAction: vi.fn(),
          onEmergency: vi.fn(),
          onAssignRole: vi.fn(),
          onRevokeRole: vi.fn(),
        }),
      ),
    );
    expect(container.textContent).not.toContain("Edit name / username / email");
    expect(container.textContent).not.toContain("Reset password");
    expect(container.querySelector("dl")?.textContent).toContain("sam@example.test");
  });

  it("opens user-specific approvals and history through row actions", async () => {
    api.listSecurityUsers.mockResolvedValue({ items: [user], next_cursor: null });
    api.listSecurityUserOptions.mockResolvedValue(options);
    const onOpenSection = vi.fn();
    await act(async () =>
      root.render(
        createElement(UserManagementPanel, {
          permissions: new Set([
            "security.user_account.read",
            "security.user_account.approve",
            "security.authorization.audit.read",
          ]),
          onOpenSection,
        }),
      ),
    );
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 25));
    });
    const select = container.querySelector<HTMLSelectElement>('select[aria-label="Action for user Sam Example"]');
    expect(select).not.toBeNull();
    await act(async () => {
      select!.value = "approvals";
      select!.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(onOpenSection).toHaveBeenCalledWith("approvals", "user-ui");
    await act(async () => {
      select!.value = "audit";
      select!.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(onOpenSection).toHaveBeenCalledWith("audit", "user-ui");
    expect(api.createSecurityUserRequest).not.toHaveBeenCalled();
  });
});
