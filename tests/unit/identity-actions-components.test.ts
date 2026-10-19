// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import RoleForm, { roleDraftFromRow } from "../../app/features/security/role-form.js";
import GovernedTable from "../../app/features/security/governed-table.js";
import { ApiError } from "../../app/lib/api/generated.js";

const api = vi.hoisted(() => ({
  listSecurityPermissions: vi.fn(),
  actOnSecurityRole: vi.fn(),
  createSecurityAssignmentRequest: vi.fn(),
  actOnSecurityAssignmentRequest: vi.fn(),
  decideSecurityApproval: vi.fn(),
}));
const sessionState = vi.hoisted(() => ({
  session: {
    user: { id: "maker-ui", roles: [] as string[], permissions: [] as string[] },
  },
}));
vi.mock("../../app/lib/session/session-provider", () => ({
  useSession: () => ({ api, csrfToken: () => "synthetic-csrf", session: sessionState.session }),
}));
const definitions = [
  { permission_key: "hr.employee.read", module: "hr", resource: "employee", description: "View employees" },
  { permission_key: "hr.employee.edit", module: "hr", resource: "employee", description: "Edit employees" },
  {
    permission_key: "security.authorization.audit.read",
    module: "security",
    resource: "authorization.audit",
    description: "Read audit",
  },
];
const draft = {
  role_code: "role_existing",
  display_name: "Existing Role",
  description: "Existing",
  permissions: ["hr.employee.read"],
  scope: { mode: "companies" as const, company_ids: ["company-ui"] },
  field_rules: { allow: ["display_name"], deny: ["salary"] },
  sod_rules: { conflicting_roles: ["checker"], distinct_actor_fields: ["created_by"] },
  allowed_source_states: { "hr.employee.read": ["active"] },
  delegations: [{ permission: "hr.employee.read", scope_kind: "company" as const, scope_value: "company-ui" }],
};
let container: HTMLDivElement;
let root: Root;
function button(text: string) {
  const found = [...container.querySelectorAll("button")].find((item) => item.textContent?.trim() === text);
  if (!found) throw new Error(`Missing button: ${text}`);
  return found;
}
async function click(element: HTMLElement) {
  await act(async () => element.click());
}
async function input(element: HTMLInputElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function choose(label: string, value: string) {
  const element = container.querySelector<HTMLSelectElement>(`select[aria-label="${label}"]`);
  if (!element) throw new Error(`Missing action select: ${label}`);
  await act(async () => {
    element.value = value;
    element.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

describe("Identity & Access actions and permissions", () => {
  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.stubGlobal("PointerEvent", MouseEvent);
    api.listSecurityPermissions.mockResolvedValue({ items: definitions, next_cursor: null });
    api.actOnSecurityRole.mockResolvedValue({});
    api.decideSecurityApproval.mockResolvedValue({ credential_delivery_available: false });
    sessionState.session.user.roles = [];
    sessionState.session.user.permissions = [];
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

  it("automatically generates a stable role code and saves multiple checkbox permissions", async () => {
    const onSave = vi.fn(async () => false);
    await act(async () => root.render(createElement(RoleForm, { busy: false, onSave, onCancel: vi.fn() })));
    const fields = container.querySelectorAll<HTMLInputElement>("form > div > label > input");
    expect(fields[1]?.readOnly).toBe(true);
    expect(fields[1]?.value).toMatch(/^role_[a-f0-9]{32}$/);
    const code = fields[1]!.value;
    await input(fields[0]!, "HR Reader");
    const allHR = container.querySelector<HTMLInputElement>('input[aria-label="Select visible permissions in hr"]');
    if (!allHR) throw new Error("Group checkbox missing");
    await click(allHR);
    await click(button("Save draft"));
    await click(button("Save draft"));
    expect(onSave).toHaveBeenCalledTimes(2);
    expect(onSave.mock.calls[0]).toEqual(onSave.mock.calls[1]);
    expect(onSave.mock.calls[0]?.[0]).toMatchObject({
      role_code: code,
      display_name: "HR Reader",
      permissions: ["hr.employee.edit", "hr.employee.read"],
    });
  });

  it("searches real catalogue entries and toggles only matching permissions", async () => {
    await act(async () => root.render(createElement(RoleForm, { busy: false, onSave: vi.fn(), onCancel: vi.fn() })));
    const search = container.querySelector<HTMLInputElement>('input[type="search"]')!;
    await input(search, "employee.read");
    expect(container.querySelector('input[aria-label="hr.employee.edit"]')).toBeNull();
    await click(container.querySelector<HTMLInputElement>('input[aria-label="Select visible permissions in hr"]')!);
    await input(search, "");
    expect(
      container
        .querySelector<HTMLElement>('[data-slot="checkbox"][aria-label="hr.employee.read"]')
        ?.getAttribute("aria-checked"),
    ).toBe("true");
    expect(
      container
        .querySelector<HTMLElement>('[data-slot="checkbox"][aria-label="hr.employee.edit"]')
        ?.getAttribute("aria-checked"),
    ).toBe("false");
  });

  it("fails closed when permission catalogue loading fails", async () => {
    api.listSecurityPermissions.mockRejectedValue(new Error("denied"));
    await act(async () => root.render(createElement(RoleForm, { busy: false, onSave: vi.fn(), onCancel: vi.fn() })));
    expect(button("Save draft").disabled).toBe(true);
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("Saving is blocked");
  });

  it("blocks saving when an older backend returns an incomplete catalogue", async () => {
    api.listSecurityPermissions.mockResolvedValue({ items: definitions, next_cursor: "100" });
    await act(async () => root.render(createElement(RoleForm, { busy: false, onSave: vi.fn(), onCancel: vi.fn() })));
    expect(button("Save draft").disabled).toBe(true);
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("Saving is blocked");
  });

  it("preserves every policy constraint when editing draft permissions", async () => {
    const onSave = vi.fn(async () => true);
    expect(() => roleDraftFromRow({ ...draft, allowed_source_states: undefined })).toThrow();
    await act(async () =>
      root.render(createElement(RoleForm, { initial: draft, busy: false, onSave, onCancel: vi.fn() })),
    );
    await click(container.querySelector<HTMLElement>('[data-slot="checkbox"][aria-label="hr.employee.edit"]')!);
    await click(button("Save draft"));
    expect(onSave.mock.calls[0]?.[0]).toEqual({ ...draft, permissions: ["hr.employee.edit", "hr.employee.read"] });
  });

  it("adds a view-only Action column to the immutable audit list", async () => {
    await act(async () =>
      root.render(
        createElement(GovernedTable, {
          tab: "audit",
          rows: [
            {
              id: "audit-ui",
              sequence: 1,
              action: "create",
              entity_type: "role",
              entity_id: "role-ui",
              actor_id: "maker-ui",
            },
          ],
          permissions: new Set<string>(),
          approvalType: "role",
          onChanged: vi.fn(),
          onCredential: vi.fn(),
        }),
      ),
    );
    expect(container.querySelector("thead")?.textContent).toContain("Action");
    const options = [...container.querySelectorAll("select option")].map((option) => option.textContent);
    expect(options).toEqual(["Choose action", "View details"]);
    await choose("Action for audit-ui", "view");
    expect(container.querySelector('[aria-label="Record details"]')?.textContent).toContain("maker-ui");
  });

  it("soft-deletes selected active roles only after confirmation using archive requests", async () => {
    const rows = [1, 2].map((index) => ({
      policy_id: `policy-${index}`,
      display_name: `Role ${index}`,
      role_code: `role_${index}`,
      lifecycle_state: "active",
      row_version: 4,
    }));
    const onChanged = vi.fn();
    await act(async () =>
      root.render(
        createElement(GovernedTable, {
          tab: "roles",
          rows,
          permissions: new Set(["security.authorization.role.archive"]),
          approvalType: "role",
          onChanged,
          onCredential: vi.fn(),
        }),
      ),
    );
    await click(container.querySelector<HTMLInputElement>('[aria-label="Select all visible records"]')!);
    await choose("Action for selected records", "request_archive");
    expect(api.actOnSecurityRole).not.toHaveBeenCalled();
    await click(button("Confirm and submit"));
    expect(api.actOnSecurityRole).toHaveBeenCalledTimes(2);
    expect(api.actOnSecurityRole.mock.calls[0]?.[0]).toEqual({
      action: "request_archive",
      policy_id: "policy-1",
      expected_version: 4,
    });
    expect(onChanged).toHaveBeenCalledOnce();
    expect(container.textContent).toContain("2 of 2 operations submitted");
  });

  it("reports partial bulk failure and preserves the failed request's idempotency key on retry", async () => {
    api.actOnSecurityRole
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new ApiError(409, "Version changed", "ADMINISTRATION_CONFLICT", "correlation-ui"))
      .mockResolvedValueOnce({});
    const rows = [1, 2].map((index) => ({
      policy_id: `policy-${index}`,
      display_name: `Role ${index}`,
      lifecycle_state: "active",
      row_version: 4,
    }));
    await act(async () =>
      root.render(
        createElement(GovernedTable, {
          tab: "roles",
          rows,
          permissions: new Set(["security.authorization.role.archive"]),
          approvalType: "role",
          onChanged: vi.fn(),
          onCredential: vi.fn(),
        }),
      ),
    );
    await click(container.querySelector<HTMLInputElement>('[aria-label="Select all visible records"]')!);
    await choose("Action for selected records", "request_archive");
    await click(button("Confirm and submit"));
    expect(container.textContent).toContain("1 of 2 operations submitted");
    expect(container.textContent).toContain("Version changed");
    await click(button("Confirm and submit"));
    expect(api.actOnSecurityRole.mock.calls[1]).toEqual(api.actOnSecurityRole.mock.calls[2]);
    expect(api.actOnSecurityRole.mock.calls.filter((call) => call[0].policy_id === "policy-1")).toHaveLength(1);
  });

  it("hides approval mutations for the maker and prevents bulk user credential approval", async () => {
    const rows = [
      { request_id: "own", requested_by: "maker-ui", request_state: "submitted", row_version: 2 },
      { request_id: "other1", requested_by: "other", request_state: "submitted", row_version: 2 },
      { request_id: "other2", requested_by: "other", request_state: "submitted", row_version: 2 },
    ];
    await act(async () =>
      root.render(
        createElement(GovernedTable, {
          tab: "approvals",
          rows,
          permissions: new Set(["security.user_account.approve"]),
          approvalType: "user",
          onChanged: vi.fn(),
          onCredential: vi.fn(),
        }),
      ),
    );
    const own = container.querySelector<HTMLSelectElement>('[aria-label="Action for own"]');
    expect(own?.textContent).not.toContain("Approve");
    await click(container.querySelector<HTMLInputElement>('[aria-label="Select other1"]')!);
    await click(container.querySelector<HTMLInputElement>('[aria-label="Select other2"]')!);
    const bulk = container.querySelector<HTMLSelectElement>('[aria-label="Action for selected records"]');
    expect(bulk?.textContent).toContain("Reject");
    expect(bulk?.textContent).not.toContain("Approve");
    expect(container.textContent).toContain("Independent approver required");
  });

  it("requires an audited reason before a super administrator can decide their own request", async () => {
    sessionState.session.user.roles = ["super_administrator"];
    sessionState.session.user.permissions = ["platform.approval.override", "security.authorization.role.approve"];
    await act(async () =>
      root.render(
        createElement(GovernedTable, {
          tab: "approvals",
          rows: [
            {
              request_id: "own-role",
              requested_by: "maker-ui",
              submitted_by: "maker-ui",
              request_state: "pending",
              row_version: 2,
            },
          ],
          permissions: new Set(sessionState.session.user.permissions),
          approvalType: "role",
          onChanged: vi.fn(),
          onCredential: vi.fn(),
        }),
      ),
    );
    await choose("Action for own-role", "approved");
    expect(container.textContent).toContain("Super-admin override");
    const confirm = button("Confirm decision");
    expect(confirm.disabled).toBe(true);
    const reason = container.querySelector<HTMLInputElement>('form[aria-label="Confirm administration action"] input')!;
    await input(reason, "Emergency access recovery approved by the tenant owner.");
    expect(confirm.disabled).toBe(false);
    await click(confirm);
    expect(api.decideSecurityApproval).toHaveBeenCalledWith(
      expect.objectContaining({
        request_id: "own-role",
        decision: "approved",
        reason: "Emergency access recovery approved by the tenant owner.",
      }),
      "synthetic-csrf",
      expect.any(String),
    );
  });

  it("opens role-specific assignment/history views without offering contextual bulk mutations", async () => {
    const onOpenRoleSection = vi.fn();
    await act(async () =>
      root.render(
        createElement(GovernedTable, {
          tab: "roles",
          rows: [{ policy_id: "context-role", display_name: "Context role", lifecycle_state: "active" }],
          permissions: new Set(["security.authorization.assignment.read", "security.authorization.audit.read"]),
          approvalType: "role",
          onChanged: vi.fn(),
          onCredential: vi.fn(),
          onOpenRoleSection,
        }),
      ),
    );
    await choose("Action for Context role", "assignments");
    expect(onOpenRoleSection).toHaveBeenCalledWith("assignments", "context-role");
    await choose("Action for Context role", "audit");
    expect(onOpenRoleSection).toHaveBeenCalledWith("audit", "context-role");
    await click(container.querySelector<HTMLInputElement>('[aria-label="Select Context role"]')!);
    const bulk = container.querySelector<HTMLSelectElement>('[aria-label="Action for selected records"]');
    expect(bulk?.disabled).toBe(true);
    expect(bulk?.querySelectorAll("option")).toHaveLength(1);
    expect(api.actOnSecurityRole).not.toHaveBeenCalled();
  });
});
