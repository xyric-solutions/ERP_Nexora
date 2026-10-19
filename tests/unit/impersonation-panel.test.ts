// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ImpersonationPanel from "../../app/features/security/impersonation-panel.js";

const state = vi.hoisted(() => ({
  api: {
    listSecurityImpersonations: vi.fn(),
    listSecurityUsers: vi.fn(),
    createSecurityImpersonation: vi.fn(),
    actOnSecurityImpersonation: vi.fn(),
  },
  refresh: vi.fn(),
  session: {
    tenant_id: "tenant-ui",
    user: { id: "admin-ui", roles: [] as string[], permissions: [] as string[] },
  },
}));

vi.mock("../../app/lib/session/session-provider", () => ({
  useSession: () => ({
    api: state.api,
    csrfToken: () => "synthetic-csrf",
    refresh: state.refresh,
    session: state.session,
  }),
}));

describe("ImpersonationPanel", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    state.api.listSecurityImpersonations.mockResolvedValue({ items: [], next_cursor: null });
    state.api.listSecurityUsers.mockResolvedValue({
      items: [{ id: "target-ui", display_name: "Target User", email: "target@example.test" }],
      next_cursor: null,
    });
    state.api.actOnSecurityImpersonation.mockResolvedValue({});
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

  it("allows the tenant-wide administrator to reach the live governed request form", async () => {
    await act(async () =>
      root.render(createElement(ImpersonationPanel, { permissions: new Set(["security.authorization.administer"]) })),
    );
    await act(async () => Promise.resolve());
    await act(async () => Promise.resolve());
    expect(state.api.listSecurityImpersonations).toHaveBeenCalledWith("?limit=100");
    const button = [...container.querySelectorAll("button")].find(
      (item) => item.textContent === "Request impersonation",
    )!;
    await act(async () => button.click());
    expect(container.textContent).toContain("Target User");
    expect(container.textContent).toContain("Purpose");
    expect(container.textContent).toContain("Create draft");
  });

  it("shows a permission-denied state without calling live APIs", async () => {
    await act(async () => root.render(createElement(ImpersonationPanel, { permissions: new Set() })));
    expect(container.textContent).toContain("do not have permission to view impersonation requests");
    expect(state.api.listSecurityImpersonations).not.toHaveBeenCalled();
  });

  it("shows the audited override path to an eligible super-admin maker", async () => {
    state.session.user.roles = ["super_administrator"];
    state.session.user.permissions = [
      "security.impersonation.read",
      "security.impersonation.approve",
      "platform.approval.override",
    ];
    state.api.listSecurityImpersonations.mockResolvedValue({
      items: [
        {
          request_id: "impersonation-own",
          actor_id: "admin-ui",
          submitted_by: "admin-ui",
          target_user_id: "target-ui",
          purpose: "Investigate a support incident",
          duration_minutes: 15,
          effective_state: "submitted",
          row_version: 2,
        },
      ],
      next_cursor: null,
    });
    await act(async () =>
      root.render(createElement(ImpersonationPanel, { permissions: new Set(state.session.user.permissions) })),
    );
    await act(async () => Promise.resolve());
    await act(async () => Promise.resolve());
    expect(container.textContent).toContain("Super-admin override");
    const approve = [...container.querySelectorAll("button")].find((button) => button.textContent === "Approve")!;
    expect(approve.disabled).toBe(true);
  });
});
