// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SessionPolicyPanel from "../../app/features/security/session-policy-panel.js";

const state = vi.hoisted(() => ({
  api: {
    listSecuritySessionPolicies: vi.fn(),
    createSecuritySessionPolicy: vi.fn(),
    actOnSecuritySessionPolicy: vi.fn(),
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

describe("SessionPolicyPanel", () => {
  let container: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    state.api.listSecuritySessionPolicies.mockResolvedValue({ items: [], next_cursor: null });
    state.api.actOnSecuritySessionPolicy.mockResolvedValue({});
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
  it("loads the PostgreSQL policy directory and exposes the bounded governed editor", async () => {
    const permissions = new Set(["security.session_policy.read", "security.session_policy.create"]);
    await act(async () => root.render(createElement(SessionPolicyPanel, { permissions })));
    await act(async () => new Promise((resolve) => window.setTimeout(resolve, 5)));
    expect(state.api.listSecuritySessionPolicies).toHaveBeenCalledOnce();
    expect(document.body.textContent).toContain("No tenant policy is active");
    const create = [...document.body.querySelectorAll("button")].find(
      (button) => button.textContent === "Create draft",
    )!;
    await act(async () => create.click());
    expect(document.body.textContent).toContain("Minimum password length");
    expect(document.body.textContent).toContain("Concurrent sessions");
    expect(document.body.textContent).toContain("Change summary");
  });
  it("shows permission denial without calling the API", async () => {
    await act(async () => root.render(createElement(SessionPolicyPanel, { permissions: new Set() })));
    expect(document.body.textContent).toContain("do not have permission to view security policies");
    expect(state.api.listSecuritySessionPolicies).not.toHaveBeenCalled();
  });

  it("retains invalid policy input in its sheet and rejects it before calling the API", async () => {
    const permissions = new Set(["security.session_policy.read", "security.session_policy.create"]);
    await act(async () => root.render(createElement(SessionPolicyPanel, { permissions })));
    await act(async () => new Promise((resolve) => window.setTimeout(resolve, 5)));
    const create = [...document.body.querySelectorAll("button")].find(
      (button) => button.textContent === "Create draft",
    )!;
    await act(async () => create.click());
    const input = async (id: string, value: string) => {
      const field = document.getElementById(id) as HTMLInputElement;
      await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(field, value);
        field.dispatchEvent(new Event("input", { bubbles: true }));
      });
    };
    await input("policy-summary", "Review timeout bounds");
    await input("session_idle_minutes", "1440");
    await act(async () =>
      document.body
        .querySelector("[role=dialog] form")!
        .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
    );
    expect(state.api.createSecuritySessionPolicy).not.toHaveBeenCalled();
    expect(document.body.querySelector("[role=dialog]")?.textContent).toContain(
      "Idle timeout cannot exceed the absolute timeout.",
    );
    expect((document.getElementById("session_idle_minutes") as HTMLInputElement).value).toBe("1440");
  });

  it("requires an audited reason for a super-admin maker to approve a submitted policy", async () => {
    state.session.user.roles = ["super_administrator"];
    state.session.user.permissions = [
      "security.session_policy.read",
      "security.session_policy.approve",
      "platform.approval.override",
    ];
    state.api.listSecuritySessionPolicies.mockResolvedValue({
      items: [
        {
          policy_id: "policy-ui",
          policy_version: 2,
          lifecycle_state: "submitted",
          row_version: 3,
          created_by: "maker-ui",
          submitted_by: "maker-ui",
          change_summary: "Harden access",
          password_minimum_length: 14,
          session_idle_minutes: 20,
          session_absolute_hours: 8,
          concurrent_session_limit: 2,
          login_maximum_failures: 5,
          login_block_minutes: 30,
        },
      ],
      next_cursor: null,
    });
    const permissions = new Set(state.session.user.permissions);
    await act(async () => root.render(createElement(SessionPolicyPanel, { permissions })));
    await act(async () => new Promise((resolve) => window.setTimeout(resolve, 5)));
    expect(document.body.textContent).toContain("Super-admin override");
    const approve = [...document.body.querySelectorAll("button")].find((button) => button.textContent === "Approve")!;
    expect(approve.disabled).toBe(true);
    const reason = document.body.querySelector<HTMLInputElement>('input[required][maxlength="512"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(
        reason,
        "Approved under outage response.",
      );
      reason.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(approve.disabled).toBe(false);
    await act(async () => approve.click());
    expect(state.api.actOnSecuritySessionPolicy).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "approve",
        policy_id: "policy-ui",
        reason: "Approved under outage response.",
      }),
      "synthetic-csrf",
      expect.any(String),
    );
  });

  it("applies the same audited override gate to policy activation", async () => {
    state.session.user.roles = ["super_administrator"];
    state.session.user.permissions = [
      "security.session_policy.read",
      "security.session_policy.activate",
      "platform.approval.override",
    ];
    state.api.listSecuritySessionPolicies.mockResolvedValue({
      items: [
        {
          policy_id: "policy-activation-ui",
          policy_version: 3,
          lifecycle_state: "approved",
          row_version: 4,
          created_by: "maker-ui",
          submitted_by: "maker-ui",
          change_summary: "Activate hardened controls",
          password_minimum_length: 14,
          session_idle_minutes: 20,
          session_absolute_hours: 8,
          concurrent_session_limit: 2,
          login_maximum_failures: 5,
          login_block_minutes: 30,
        },
      ],
      next_cursor: null,
    });
    await act(async () =>
      root.render(createElement(SessionPolicyPanel, { permissions: new Set(state.session.user.permissions) })),
    );
    await act(async () => new Promise((resolve) => window.setTimeout(resolve, 5)));
    expect(document.body.textContent).toContain("Super-admin override");
    const activate = [...document.body.querySelectorAll("button")].find((button) => button.textContent === "Activate")!;
    expect(activate.disabled).toBe(true);
  });
});
