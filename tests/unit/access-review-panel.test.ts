// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import AccessReviewPanel from "../../app/features/security/access-review-panel.js";

const state = vi.hoisted(() => ({
  api: {
    listSecurityAccessReviewCampaigns: vi.fn(),
    listSecurityAccessReviewItems: vi.fn(),
    listSecurityUsers: vi.fn(),
    listSecurityUserOptions: vi.fn(),
    createSecurityAccessReviewCampaign: vi.fn(),
    actOnSecurityAccessReviewCampaign: vi.fn(),
    decideSecurityAccessReviewItem: vi.fn(),
  },
  session: {
    tenant_id: "tenant-ui",
    user: {
      id: "maker-ui",
      roles: ["super_administrator"],
      permissions: ["security.access_review.read", "security.access_review.approve", "platform.approval.override"],
    },
  },
}));

vi.mock("../../app/lib/session/session-provider", () => ({
  useSession: () => ({
    api: state.api,
    csrfToken: () => "synthetic-csrf",
    session: state.session,
  }),
}));

describe("AccessReviewPanel", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    state.api.listSecurityAccessReviewCampaigns.mockResolvedValue({
      items: [
        {
          campaign_id: "campaign-ui",
          name: "Quarterly access review",
          lifecycle_state: "submitted",
          owner_id: "maker-ui",
          submitted_by: "maker-ui",
          row_version: 2,
          decision_count: 0,
          item_count: 0,
        },
      ],
      next_cursor: null,
    });
    state.api.listSecurityAccessReviewItems.mockResolvedValue({ items: [], next_cursor: null });
    state.api.listSecurityUsers.mockResolvedValue({ items: [], next_cursor: null });
    state.api.listSecurityUserOptions.mockResolvedValue({ companies: [], employees: [], roles: [] });
    state.api.actOnSecurityAccessReviewCampaign.mockResolvedValue({});
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

  it("requires an audited reason for a super-admin campaign owner without changing item certification", async () => {
    await act(async () =>
      root.render(createElement(AccessReviewPanel, { permissions: new Set(state.session.user.permissions) })),
    );
    await act(async () => Promise.resolve());
    await act(async () => Promise.resolve());
    expect(container.textContent).toContain("Super-admin override");
    const approve = [...container.querySelectorAll("button")].find((button) => button.textContent === "Approve")!;
    expect(approve.disabled).toBe(true);
    expect(container.textContent).not.toContain("Record decision");
  });
});
