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
}));
vi.mock("../../app/lib/session/session-provider", () => ({
  useSession: () => ({
    api: state.api,
    csrfToken: () => "synthetic-csrf",
    session: { tenant_id: "tenant-ui", user: { id: "maker-ui", permissions: [] } },
  }),
}));

describe("SessionPolicyPanel", () => {
  let container: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    state.api.listSecuritySessionPolicies.mockResolvedValue({ items: [], next_cursor: null });
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
    expect(container.textContent).toContain("No tenant policy is active");
    const create = [...container.querySelectorAll("button")].find((button) => button.textContent === "Create draft")!;
    await act(async () => create.click());
    expect(container.textContent).toContain("Minimum password length");
    expect(container.textContent).toContain("Concurrent sessions");
    expect(container.textContent).toContain("Change summary");
  });
  it("shows permission denial without calling the API", async () => {
    await act(async () => root.render(createElement(SessionPolicyPanel, { permissions: new Set() })));
    expect(container.textContent).toContain("do not have permission to view security policies");
    expect(state.api.listSecuritySessionPolicies).not.toHaveBeenCalled();
  });
});
