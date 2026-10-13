import { describe, expect, it } from "vitest";

import {
  evaluatePolicy,
  PolicyService,
  type PolicyAssignment,
  type PolicyAuthorizationRequest,
  type PolicyPermissionGrant,
  type PolicySnapshot,
} from "../../packages/auth/src/index.js";

const now = new Date("2026-10-07T12:00:00.000Z");
const userId = "40000000-0000-4000-8000-000000000001";
const enterpriseId = "40000000-0000-4000-8000-000000000010";
const companyId = "40000000-0000-4000-8000-000000000011";
const branchId = "40000000-0000-4000-8000-000000000012";
const siblingId = "40000000-0000-4000-8000-000000000013";

function permission(overrides: Partial<PolicyPermissionGrant> = {}): PolicyPermissionGrant {
  return {
    permissionKey: "hr.employee.edit",
    requiredAssurance: "password",
    fieldBearing: true,
    stateContextRequired: true,
    allowedSourceStates: ["draft", "returned"],
    allowedFields: ["displayName", "workEmail"],
    ...overrides,
  };
}

function assignment(overrides: Partial<PolicyAssignment> = {}): PolicyAssignment {
  return {
    assignmentId: "40000000-0000-4000-8000-000000000020",
    roleId: "40000000-0000-4000-8000-000000000030",
    status: "active",
    validFrom: new Date("2026-01-01T00:00:00.000Z"),
    validUntil: null,
    scopeGrants: [{ scopeId: companyId, includeDescendants: true }],
    permissionGrants: [permission()],
    ...overrides,
  };
}

function snapshot(overrides: Partial<PolicySnapshot> = {}): PolicySnapshot {
  return {
    userId,
    userActive: true,
    assignments: [assignment()],
    assignmentConflicts: [],
    transactionConflicts: [],
    ...overrides,
  };
}

function request(overrides: Partial<PolicyAuthorizationRequest> = {}): PolicyAuthorizationRequest {
  return {
    permissionKey: "hr.employee.edit",
    targetScope: {
      scopeId: branchId,
      scopeType: "branch",
      status: "active",
      enterpriseScopeId: enterpriseId,
      companyScopeId: companyId,
      ancestorScopeIds: [enterpriseId, companyId],
    },
    requestedFields: ["displayName"],
    currentState: "draft",
    evaluatedAt: now,
    ...overrides,
  };
}

describe("authorization policy evaluator", () => {
  it("allows an exact permission, descendant scope, field, and source state", () => {
    expect(evaluatePolicy({ userId, assuranceLevel: "password" }, snapshot(), request())).toMatchObject({
      allowed: true,
      permissionKey: "hr.employee.edit",
      scopeId: branchId,
    });
  });

  it.each([
    ["unknown permission", request({ permissionKey: "hr.employee.*" }), "permission_denied"],
    [
      "cross-company scope",
      request({
        targetScope: {
          ...request().targetScope,
          scopeId: "40000000-0000-4000-8000-000000000099",
          companyScopeId: "40000000-0000-4000-8000-000000000098",
          ancestorScopeIds: [enterpriseId, "40000000-0000-4000-8000-000000000098"],
        },
      }),
      "scope_denied",
    ],
    [
      "archived target scope",
      request({ targetScope: { ...request().targetScope, status: "archived" } }),
      "scope_denied",
    ],
    ["unlisted field", request({ requestedFields: ["salaryPaisa"] }), "field_denied"],
    ["missing fields", request({ requestedFields: [] }), "field_denied"],
    ["wrong source state", request({ currentState: "approved" }), "state_denied"],
    ["missing source state", request({ currentState: undefined }), "state_denied"],
  ])("denies %s", (_label, policyRequest, reason) => {
    expect(evaluatePolicy({ userId, assuranceLevel: "password" }, snapshot(), policyRequest)).toEqual({
      allowed: false,
      permissionKey: policyRequest.permissionKey,
      reason,
    });
  });

  it("denies a sibling outside a branch-scoped assignment", () => {
    const branchScoped = snapshot({
      assignments: [
        assignment({
          scopeGrants: [{ scopeId: branchId, includeDescendants: true }],
        }),
      ],
    });
    expect(
      evaluatePolicy(
        { userId, assuranceLevel: "password" },
        branchScoped,
        request({ targetScope: { ...request().targetScope, scopeId: siblingId } }),
      ),
    ).toMatchObject({ allowed: false, reason: "scope_denied" });
  });

  it("enforces assurance from permission metadata", () => {
    const mfaSnapshot = snapshot({
      assignments: [assignment({ permissionGrants: [permission({ requiredAssurance: "mfa" })] })],
    });
    expect(evaluatePolicy({ userId, assuranceLevel: "password" }, mfaSnapshot, request())).toMatchObject({
      allowed: false,
      reason: "mfa_required",
    });
    expect(evaluatePolicy({ userId, assuranceLevel: "mfa" }, mfaSnapshot, request())).toMatchObject({ allowed: true });
  });

  it.each(["read", "create", "edit", "delete", "archive"])(
    "evaluates the exact dynamic-role %s permission without role-name semantics",
    (action) => {
      const permissionKey = `hr.employee.${action}`;
      const lifecycleSnapshot = snapshot({
        assignments: [
          assignment({
            roleId: "40000000-0000-4000-8000-000000000090",
            permissionGrants: [
              permission({
                permissionKey,
                fieldBearing: action !== "archive" && action !== "delete",
                stateContextRequired: action === "edit" || action === "archive" || action === "delete",
                allowedSourceStates: ["draft"],
              }),
            ],
          }),
        ],
      });
      expect(
        evaluatePolicy(
          { userId, assuranceLevel: "password" },
          lifecycleSnapshot,
          request({
            permissionKey,
            requestedFields: action === "archive" || action === "delete" ? [] : ["displayName"],
            ...(action === "edit" || action === "archive" || action === "delete" ? { currentState: "draft" } : {}),
          }),
        ),
      ).toMatchObject({ allowed: true });
    },
  );

  it.each([
    ["edit", "draft", true],
    ["edit", "approved", false],
    ["submit", "draft", true],
    ["submit", "submitted", false],
    ["return", "submitted", true],
    ["approve", "submitted", true],
    ["approve", "draft", false],
    ["reject", "submitted", true],
    ["cancel", "draft", true],
  ] as const)("applies the %s decision matrix from %s", (action, currentState, allowed) => {
    const permissionKey = `hr.employee.${action}`;
    const allowedSourceStates: Record<string, readonly string[]> = {
      edit: ["draft", "returned"],
      submit: ["draft", "returned"],
      return: ["submitted"],
      approve: ["submitted"],
      reject: ["submitted"],
      cancel: ["draft", "submitted"],
    };
    const matrixSnapshot = snapshot({
      assignments: [
        assignment({
          permissionGrants: [
            permission({
              permissionKey,
              fieldBearing: false,
              stateContextRequired: true,
              allowedSourceStates: allowedSourceStates[action] ?? [],
            }),
          ],
        }),
      ],
    });
    expect(
      evaluatePolicy(
        { userId, assuranceLevel: "password" },
        matrixSnapshot,
        request({ permissionKey, requestedFields: [], currentState }),
      ).allowed,
    ).toBe(allowed);
  });

  it("does not compose permission and scope across unrelated assignments", () => {
    const permissionOnly = assignment({ scopeGrants: [] });
    const scopeOnly = assignment({
      assignmentId: "40000000-0000-4000-8000-000000000021",
      roleId: "40000000-0000-4000-8000-000000000031",
      permissionGrants: [],
    });
    expect(
      evaluatePolicy(
        { userId, assuranceLevel: "mfa" },
        snapshot({ assignments: [permissionOnly, scopeOnly] }),
        request(),
      ),
    ).toMatchObject({ allowed: false, reason: "scope_denied" });
  });

  it("denies conflicting dynamic roles only when both cover the target", () => {
    const second = assignment({
      assignmentId: "40000000-0000-4000-8000-000000000021",
      roleId: "40000000-0000-4000-8000-000000000031",
    });
    const conflicted = snapshot({
      assignments: [assignment(), second],
      assignmentConflicts: [{ firstRoleId: assignment().roleId, secondRoleId: second.roleId }],
    });
    expect(evaluatePolicy({ userId, assuranceLevel: "password" }, conflicted, request())).toMatchObject({
      allowed: false,
      reason: "sod_conflict",
    });
  });

  it("does not require both conflicting roles to grant the requested permission", () => {
    const conflictingRoleId = "40000000-0000-4000-8000-000000000032";
    const conflicted = snapshot({
      assignments: [
        assignment(),
        assignment({
          assignmentId: "40000000-0000-4000-8000-000000000022",
          roleId: conflictingRoleId,
          permissionGrants: [],
        }),
      ],
      assignmentConflicts: [{ firstRoleId: assignment().roleId, secondRoleId: conflictingRoleId }],
    });
    expect(evaluatePolicy({ userId, assuranceLevel: "password" }, conflicted, request())).toMatchObject({
      allowed: false,
      reason: "sod_conflict",
    });
  });

  it("enforces maker-checker actor relations and fails closed when relation data is missing", () => {
    const protectedSnapshot = snapshot({
      assignments: [
        assignment({
          permissionGrants: [
            permission({
              permissionKey: "hr.employee.approve",
              fieldBearing: false,
              allowedSourceStates: ["submitted"],
            }),
          ],
        }),
      ],
      transactionConflicts: [
        {
          protectedPermissionKey: "hr.employee.approve",
          actorRelation: "submitted_by",
          applicableSourceStates: ["submitted"],
        },
      ],
    });
    const approval = request({
      permissionKey: "hr.employee.approve",
      requestedFields: [],
      currentState: "submitted",
      actorRelations: { submitted_by: userId },
    });
    expect(evaluatePolicy({ userId, assuranceLevel: "password" }, protectedSnapshot, approval)).toMatchObject({
      allowed: false,
      reason: "sod_conflict",
    });
    expect(
      evaluatePolicy({ userId, assuranceLevel: "password" }, protectedSnapshot, { ...approval, actorRelations: {} }),
    ).toMatchObject({ allowed: false, reason: "policy_unavailable" });
  });

  it("excludes future, expired, revoked, and inactive user assignments", () => {
    const cases: PolicySnapshot[] = [
      snapshot({ assignments: [assignment({ validFrom: new Date("2027-01-01T00:00:00.000Z") })] }),
      snapshot({ assignments: [assignment({ validUntil: now })] }),
      snapshot({ assignments: [assignment({ status: "revoked" })] }),
      snapshot({ userActive: false }),
    ];
    expect(
      cases.map((policySnapshot) => evaluatePolicy({ userId, assuranceLevel: "password" }, policySnapshot, request())),
    ).toEqual([
      expect.objectContaining({ allowed: false, reason: "assignment_inactive" }),
      expect.objectContaining({ allowed: false, reason: "assignment_inactive" }),
      expect.objectContaining({ allowed: false, reason: "assignment_inactive" }),
      expect.objectContaining({ allowed: false, reason: "authentication_required" }),
    ]);
  });

  it("converts repository failures into a fail-closed decision", async () => {
    const service = new PolicyService({
      loadSnapshot: async () => {
        throw new Error("database unavailable");
      },
    });
    await expect(service.authorize({ userId, assuranceLevel: "mfa" }, request())).resolves.toMatchObject({
      allowed: false,
      reason: "policy_unavailable",
    });
  });
});
