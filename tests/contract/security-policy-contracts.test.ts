import { describe, expect, it } from "vitest";

import {
  exactPermissionKeySchema,
  policyDecisionSchema,
  policyFieldPathSchema,
  securityRoleAssignmentSchema,
  securitySodPolicySchema,
} from "../../packages/contracts/src/index.js";

describe("security policy contracts", () => {
  it("accepts exact permission keys and rejects wildcard or incomplete keys", () => {
    expect(exactPermissionKeySchema.safeParse("hr.employee.edit").success).toBe(true);
    expect(exactPermissionKeySchema.safeParse("hr.employee.*").success).toBe(false);
    expect(exactPermissionKeySchema.safeParse("employee.edit").success).toBe(false);
  });

  it("accepts nested field paths and rejects wildcard paths", () => {
    expect(policyFieldPathSchema.safeParse("bankAccount.accountNumber").success).toBe(true);
    expect(policyFieldPathSchema.safeParse("bankAccount.*").success).toBe(false);
  });

  it("rejects invalid effective ranges and unknown assignment fields", () => {
    const assignment = {
      id: "40000000-0000-4000-8000-000000000001",
      userId: "40000000-0000-4000-8000-000000000002",
      roleId: "40000000-0000-4000-8000-000000000003",
      status: "active",
      validFrom: "2026-10-08T00:00:00.000Z",
      validUntil: "2026-10-07T00:00:00.000Z",
      scopes: [{ scopeId: "40000000-0000-4000-8000-000000000004", includeDescendants: true }],
      version: 1,
      unexpected: true,
    };
    expect(securityRoleAssignmentSchema.safeParse(assignment).success).toBe(false);
  });

  it("rejects incomplete segregation-of-duty policy shapes", () => {
    expect(
      securitySodPolicySchema.safeParse({
        id: "40000000-0000-4000-8000-000000000001",
        code: "maker_checker",
        displayName: "Maker checker",
        kind: "transaction_conflict",
        status: "active",
        version: 1,
        actorRelation: "submitted_by",
        applicableSourceStates: ["submitted"],
      }).success,
    ).toBe(false);
  });

  it("keeps authorization denials safe and rejects extra policy data", () => {
    expect(
      policyDecisionSchema.safeParse({
        allowed: false,
        permissionKey: "hr.employee.read",
        reason: "scope_denied",
        targetCompanyId: "sensitive",
      }).success,
    ).toBe(false);
  });
});
