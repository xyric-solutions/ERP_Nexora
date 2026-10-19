import { describe, expect, it } from "vitest";

import { actorMatchesAny, canUseSuperAdminApprovalOverride } from "../../app/features/security/approval-override-ui.js";

const normalPermission = "security.delegation.approve";

function session(overrides: Partial<Record<"roles" | "permissions", string[]>> = {}) {
  return {
    status: "authenticated" as const,
    tenant_id: "tenant-ui",
    user: {
      id: "maker-ui",
      email: "maker@example.test",
      display_name: "Maker",
      roles: overrides.roles ?? ["super_administrator"],
      permissions: overrides.permissions ?? ["platform.approval.override", normalPermission],
    },
    csrf_token: "x".repeat(43),
    idle_expires_at: "2026-10-19T12:00:00.000Z",
    absolute_expires_at: "2026-10-19T18:00:00.000Z",
  };
}

describe("Security approval override UI policy", () => {
  it("requires the super-administrator role, override permission, and normal decision permission", () => {
    expect(
      canUseSuperAdminApprovalOverride(
        session(),
        new Set(["platform.approval.override", normalPermission]),
        normalPermission,
      ),
    ).toBe(true);
    expect(
      canUseSuperAdminApprovalOverride(
        session({ roles: ["authorization_admin"] }),
        new Set(["platform.approval.override", normalPermission]),
        normalPermission,
      ),
    ).toBe(false);
    expect(canUseSuperAdminApprovalOverride(session(), new Set(["platform.approval.override"]), normalPermission)).toBe(
      false,
    );
  });

  it("fails closed during impersonation and matches every maker field", () => {
    const impersonated = {
      ...session(),
      impersonation: {
        request_id: "impersonation-ui",
        expected_version: 1,
        real_user: session().user,
        expires_at: "2026-10-19T11:30:00.000Z",
      },
    };
    expect(
      canUseSuperAdminApprovalOverride(
        impersonated,
        new Set(["platform.approval.override", normalPermission]),
        normalPermission,
      ),
    ).toBe(false);
    expect(
      actorMatchesAny({ requested_by: "other-ui", submitted_by: "maker-ui" }, "maker-ui", [
        "requested_by",
        "submitted_by",
      ]),
    ).toBe(true);
  });
});
