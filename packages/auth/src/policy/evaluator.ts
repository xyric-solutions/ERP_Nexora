import type {
  PolicyAssignment,
  PolicyAuthorizationRequest,
  PolicyDecision,
  PolicyPermissionGrant,
  PolicyPrincipal,
  PolicySnapshot,
} from "./types.js";

function deny(
  request: PolicyAuthorizationRequest,
  reason: Extract<PolicyDecision, { allowed: false }>["reason"],
): PolicyDecision {
  return { allowed: false, permissionKey: request.permissionKey, reason };
}

function isEffective(assignment: PolicyAssignment, at: Date): boolean {
  return (
    assignment.status === "active" &&
    assignment.validFrom <= at &&
    (assignment.validUntil === null || assignment.validUntil > at)
  );
}

function coversTarget(assignment: PolicyAssignment, request: PolicyAuthorizationRequest): boolean {
  if (request.targetScope.status !== "active") return false;
  return assignment.scopeGrants.some(
    (grant) =>
      grant.scopeId === request.targetScope.scopeId ||
      (grant.includeDescendants && request.targetScope.ancestorScopeIds.includes(grant.scopeId)),
  );
}

function permissionFor(assignment: PolicyAssignment, permissionKey: string): PolicyPermissionGrant | null {
  return assignment.permissionGrants.find((grant) => grant.permissionKey === permissionKey) ?? null;
}

function hasAssignmentConflict(snapshot: PolicySnapshot, assignments: readonly PolicyAssignment[]): boolean {
  const roleIds = new Set(assignments.map((assignment) => assignment.roleId));
  return snapshot.assignmentConflicts.some(
    (conflict) => roleIds.has(conflict.firstRoleId) && roleIds.has(conflict.secondRoleId),
  );
}

function normalizeDistinct(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

export function evaluatePolicy(
  principal: PolicyPrincipal,
  snapshot: PolicySnapshot | null,
  request: PolicyAuthorizationRequest,
): PolicyDecision {
  if (!snapshot || snapshot.userId !== principal.userId || !snapshot.userActive) {
    return deny(request, "authentication_required");
  }

  const effectiveAssignments = snapshot.assignments.filter((assignment) =>
    isEffective(assignment, request.evaluatedAt),
  );
  if (effectiveAssignments.length === 0) return deny(request, "assignment_inactive");

  const assignmentsWithPermission = effectiveAssignments
    .map((assignment) => ({ assignment, permission: permissionFor(assignment, request.permissionKey) }))
    .filter(
      (entry): entry is { assignment: PolicyAssignment; permission: PolicyPermissionGrant } =>
        entry.permission !== null,
    );
  if (assignmentsWithPermission.length === 0) return deny(request, "permission_denied");

  if (
    assignmentsWithPermission.every(
      ({ permission }) => permission.requiredAssurance === "mfa" && principal.assuranceLevel !== "mfa",
    )
  ) {
    return deny(request, "mfa_required");
  }

  const scoped = assignmentsWithPermission.filter(
    ({ assignment, permission }) =>
      coversTarget(assignment, request) &&
      (permission.requiredAssurance !== "mfa" || principal.assuranceLevel === "mfa"),
  );
  if (scoped.length === 0) return deny(request, "scope_denied");

  const requestedFields = normalizeDistinct(request.requestedFields ?? []);
  const fieldBearing = scoped.some(({ permission }) => permission.fieldBearing);
  const allowedFields = normalizeDistinct(scoped.flatMap(({ permission }) => permission.allowedFields));
  if (
    fieldBearing &&
    (requestedFields.length === 0 || requestedFields.some((field) => !allowedFields.includes(field)))
  ) {
    return deny(request, "field_denied");
  }

  const stateAware = scoped.filter(({ permission }) => permission.stateContextRequired);
  if (
    stateAware.length > 0 &&
    (!request.currentState ||
      !stateAware.some(({ permission }) => permission.allowedSourceStates.includes(request.currentState ?? "")))
  ) {
    return deny(request, "state_denied");
  }

  if (
    hasAssignmentConflict(
      snapshot,
      effectiveAssignments.filter((assignment) => coversTarget(assignment, request)),
    )
  ) {
    return deny(request, "sod_conflict");
  }

  for (const conflict of snapshot.transactionConflicts) {
    if (conflict.protectedPermissionKey !== request.permissionKey) continue;
    if (
      conflict.applicableSourceStates.length > 0 &&
      (!request.currentState || !conflict.applicableSourceStates.includes(request.currentState))
    ) {
      continue;
    }
    const relatedActor = request.actorRelations?.[conflict.actorRelation];
    if (!relatedActor) return deny(request, "policy_unavailable");
    if (relatedActor === principal.userId) return deny(request, "sod_conflict");
  }

  return {
    allowed: true,
    permissionKey: request.permissionKey,
    scopeId: request.targetScope.scopeId,
    allowedFields,
    assignmentIds: normalizeDistinct(scoped.map(({ assignment }) => assignment.assignmentId)),
  };
}
