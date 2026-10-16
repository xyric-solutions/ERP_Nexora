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
}));

vi.mock("../../app/lib/session/session-provider", () => ({
  useSession: () => ({
    api: state.api,
    csrfToken: () => "synthetic-csrf",
    session: {
      tenant_id: "tenant-ui",
      user: { id: "maker-ui", permissions: [] },
    },
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

    const create = [...container.querySelectorAll("button")].find((button) => button.textContent === "Create delegation")!;
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
});
