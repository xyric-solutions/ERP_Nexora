import { describe, expect, it } from "vitest";

import {
  APPROVAL_OVERRIDE_PERMISSION,
  evaluateApprovalActor,
  SUPER_ADMINISTRATOR_ROLE,
  type ApprovalActor,
} from "../../packages/auth/src/index.js";

const normalPermission = "banking.bank_account.approve";

function actor(overrides: Partial<ApprovalActor> = {}): ApprovalActor {
  return {
    userId: "checker",
    roles: [],
    permissions: [normalPermission],
    status: "active",
    ...overrides,
  };
}

describe("approval actor policy", () => {
  it("allows a distinct actor with the normal decision permission", () => {
    expect(
      evaluateApprovalActor({
        account: actor(),
        normalDecisionPermission: normalPermission,
        makerActorIds: ["maker", "submitter"],
      }),
    ).toEqual({ kind: "ordinary" });
  });

  it("keeps ordinary same-actor approval forbidden", () => {
    expect(
      evaluateApprovalActor({
        account: actor({ userId: "maker" }),
        normalDecisionPermission: normalPermission,
        makerActorIds: ["maker"],
      }),
    ).toEqual({ kind: "forbidden", reason: "maker_checker_required" });
  });

  it.each([
    {
      name: "role without override permission",
      account: actor({ userId: "maker", roles: [SUPER_ADMINISTRATOR_ROLE] }),
      reason: "maker_checker_required",
    },
    {
      name: "override permission without role",
      account: actor({ userId: "maker", permissions: [normalPermission, APPROVAL_OVERRIDE_PERMISSION] }),
      reason: "maker_checker_required",
    },
    {
      name: "override authority without the normal decision permission",
      account: actor({
        userId: "maker",
        roles: [SUPER_ADMINISTRATOR_ROLE],
        permissions: [APPROVAL_OVERRIDE_PERMISSION],
      }),
      reason: "normal_permission_missing",
    },
  ])("rejects $name", ({ account, reason }) => {
    expect(
      evaluateApprovalActor({
        account,
        normalDecisionPermission: normalPermission,
        makerActorIds: ["maker"],
      }),
    ).toEqual({ kind: "forbidden", reason });
  });

  it("requires an explicit governed override for a same-actor super administrator", () => {
    expect(
      evaluateApprovalActor({
        account: actor({
          userId: "maker",
          roles: [SUPER_ADMINISTRATOR_ROLE],
          permissions: [normalPermission, APPROVAL_OVERRIDE_PERMISSION],
        }),
        normalDecisionPermission: normalPermission,
        makerActorIds: ["maker", "maker"],
      }),
    ).toEqual({ kind: "override" });
  });

  it.each([
    { name: "a missing account", account: null, reason: "account_unavailable" },
    { name: "an inactive account", account: actor({ status: "inactive" }), reason: "account_inactive" },
    { name: "a disabled account", account: actor({ status: "disabled" }), reason: "account_inactive" },
  ])("rejects $name", ({ account, reason }) => {
    expect(evaluateApprovalActor({ account, normalDecisionPermission: normalPermission, makerActorIds: [] })).toEqual({
      kind: "forbidden",
      reason,
    });
  });

  it("defensively rejects impersonation before considering override authority", () => {
    expect(
      evaluateApprovalActor({
        account: actor({
          userId: "maker",
          roles: [SUPER_ADMINISTRATOR_ROLE],
          permissions: [normalPermission, APPROVAL_OVERRIDE_PERMISSION],
        }),
        normalDecisionPermission: normalPermission,
        makerActorIds: ["maker"],
        impersonated: true,
      }),
    ).toEqual({ kind: "forbidden", reason: "impersonation_forbidden" });
  });
});
