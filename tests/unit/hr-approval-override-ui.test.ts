import { describe, expect, it } from "vitest";

import { approvalOverrideReviewState } from "../../app/features/hr/approval-override-ui.js";

describe("HR approval override UI policy", () => {
  it("keeps an ordinary maker blocked by independent approval", () => {
    expect(
      approvalOverrideReviewState(
        {
          self_decision_requires_override: true,
          super_admin_override_allowed: false,
        },
        true,
        false,
      ),
    ).toEqual({
      selfDecisionRequiresOverride: true,
      overrideAllowed: false,
      independentApproverRequired: true,
    });
  });

  it("enables the warning path only when the server allows the super-admin override", () => {
    expect(
      approvalOverrideReviewState(
        {
          self_decision_requires_override: true,
          super_admin_override_allowed: true,
        },
        true,
        false,
      ),
    ).toEqual({
      selfDecisionRequiresOverride: true,
      overrideAllowed: true,
      independentApproverRequired: false,
    });
  });

  it("prefers server metadata over compatibility fallbacks", () => {
    expect(
      approvalOverrideReviewState(
        {
          self_decision_requires_override: false,
          super_admin_override_allowed: false,
        },
        true,
        true,
      ),
    ).toEqual({
      selfDecisionRequiresOverride: false,
      overrideAllowed: false,
      independentApproverRequired: false,
    });
  });
});
