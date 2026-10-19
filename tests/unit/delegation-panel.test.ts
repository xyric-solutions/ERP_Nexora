// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import DelegationPanel from "../../app/features/security/delegation-panel.js";

const state = vi.hoisted(() => ({
  api: {
    listSecurityDelegations: vi.fn(),
    listSecurityUsers: vi.fn(),
    listSecurityUserOptions: vi.fn(),
    listSecurityPermissions: vi.fn(),
    createSecurityDelegation: vi.fn(),
    actOnSecurityDelegation: vi.fn(),
  },
  session: {
    tenant_id: "tenant-ui",
    user: { id: "maker-ui", roles: [] as string[], permissions: [] as string[] },
  },
}));

vi.mock("../../app/lib/session/session-provider", () => ({
  useSession: () => ({
    api: state.api,
    csrfToken: () => "synthetic-csrf",
    session: state.session,
  }),
}));

describe("DelegationPanel", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    state.api.listSecurityDelegations.mockResolvedValue({ items: [], next_cursor: null });
    state.api.listSecurityUsers.mockResolvedValue({
      items: [{ id: "delegatee-ui", display_name: "Delegate User", email: "delegate@example.test" }],
      next_cursor: null,
    });
    state.api.listSecurityUserOptions.mockResolvedValue({
      companies: [{ id: "company-ui", name: "UI Company" }],
      employees: [],
      roles: [],
    });
    state.api.listSecurityPermissions.mockResolvedValue({
      items: [{ permission_key: "security.authorization.audit.read" }],
      next_cursor: null,
    });
    state.api.actOnSecurityDelegation.mockResolvedValue({});
    state.session.user.roles = [];
    state.session.user.permissions = [];
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

  it("loads live delegation dependencies and exposes a governed creation form", async () => {
    const permissions = new Set([
      "security.delegation.read",
      "security.delegation.create",
      "security.authorization.audit.read",
    ]);
    await act(async () => root.render(createElement(DelegationPanel, { permissions })));
    await act(async () => Promise.resolve());
    await act(async () => Promise.resolve());

    expect(state.api.listSecurityDelegations).toHaveBeenCalledWith("?limit=100");
    expect(state.api.listSecurityUsers).toHaveBeenCalled();
    expect(state.api.listSecurityPermissions).toHaveBeenCalled();
    expect(container.textContent).toContain("No delegation records are available.");

    const create = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "Create delegation",
    )!;
    await act(async () => create.click());
    expect(container.textContent).toContain("Delegate User");
    expect(container.textContent).toContain("security.authorization.audit.read");
    expect(container.textContent).toContain("Business reason");
  });

  it("shows an explicit permission-denied state without loading data", async () => {
    await act(async () => root.render(createElement(DelegationPanel, { permissions: new Set() })));
    expect(container.textContent).toContain("do not have permission to view delegations");
    expect(state.api.listSecurityDelegations).not.toHaveBeenCalled();
  });

  it("does not treat every record as owned by a full administrator", async () => {
    state.api.listSecurityDelegations.mockResolvedValue({
      items: [
        {
          delegation_id: "delegation-other",
          delegator_id: "other-ui",
          delegatee_id: "delegatee-ui",
          permission_key: "security.authorization.audit.read",
          scope_kind: "tenant",
          scope_value: "tenant-ui",
          valid_from: "2026-10-19T09:00:00.000Z",
          valid_until: "2026-10-26T09:00:00.000Z",
          reason: "Coverage",
          effective_state: "submitted",
          row_version: 2,
        },
      ],
      next_cursor: null,
    });
    await act(async () =>
      root.render(createElement(DelegationPanel, { permissions: new Set(["security.authorization.administer"]) })),
    );
    await act(async () => Promise.resolve());
    await act(async () => Promise.resolve());
    expect([...container.querySelectorAll("button")].some((button) => button.textContent === "Approve")).toBe(true);
  });

  it("requires a business reason before a super-admin maker can decide a delegation", async () => {
    state.session.user.roles = ["super_administrator"];
    state.session.user.permissions = [
      "security.delegation.read",
      "security.delegation.approve",
      "platform.approval.override",
    ];
    state.api.listSecurityDelegations.mockResolvedValue({
      items: [
        {
          delegation_id: "delegation-own",
          delegator_id: "maker-ui",
          submitted_by: "maker-ui",
          delegatee_id: "delegatee-ui",
          permission_key: "security.authorization.audit.read",
          scope_kind: "tenant",
          scope_value: "tenant-ui",
          valid_from: "2026-10-19T09:00:00.000Z",
          valid_until: "2026-10-26T09:00:00.000Z",
          reason: "Coverage",
          effective_state: "submitted",
          row_version: 2,
        },
      ],
      next_cursor: null,
    });
    await act(async () =>
      root.render(createElement(DelegationPanel, { permissions: new Set(state.session.user.permissions) })),
    );
    await act(async () => new Promise((resolve) => window.setTimeout(resolve, 5)));
    expect(container.textContent).toContain("Super-admin override");
    const approve = [...container.querySelectorAll("button")].find((button) => button.textContent === "Approve")!;
    expect(approve.disabled).toBe(true);
  });
});
