export type PolicyAssuranceLevel = "password" | "mfa";
export type PolicyScopeType = "enterprise" | "company" | "branch" | "organization_unit";
export type PolicyLifecycleStatus = "active" | "archived";

export type PolicyDenialReason =
  | "authentication_required"
  | "mfa_required"
  | "assignment_inactive"
  | "permission_denied"
  | "scope_denied"
  | "field_denied"
  | "state_denied"
  | "sod_conflict"
  | "policy_unavailable";

export interface PolicyPrincipal {
  userId: string;
  assuranceLevel: PolicyAssuranceLevel;
}

export interface PolicyScopeGrant {
  scopeId: string;
  includeDescendants: boolean;
}

export interface PolicyPermissionGrant {
  permissionKey: string;
  requiredAssurance: PolicyAssuranceLevel;
  fieldBearing: boolean;
  stateContextRequired: boolean;
  allowedSourceStates: readonly string[];
  allowedFields: readonly string[];
}

export interface PolicyAssignment {
  assignmentId: string;
  roleId: string;
  status: "active" | "revoked";
  validFrom: Date;
  validUntil: Date | null;
  scopeGrants: readonly PolicyScopeGrant[];
  permissionGrants: readonly PolicyPermissionGrant[];
}

export interface PolicyAssignmentConflict {
  firstRoleId: string;
  secondRoleId: string;
}

export interface PolicyTransactionConflict {
  protectedPermissionKey: string;
  actorRelation: string;
  applicableSourceStates: readonly string[];
}

export interface PolicySnapshot {
  userId: string;
  userActive: boolean;
  assignments: readonly PolicyAssignment[];
  assignmentConflicts: readonly PolicyAssignmentConflict[];
  transactionConflicts: readonly PolicyTransactionConflict[];
}

export interface PolicyTargetScope {
  scopeId: string;
  scopeType: PolicyScopeType;
  status: PolicyLifecycleStatus;
  enterpriseScopeId: string;
  companyScopeId: string | null;
  ancestorScopeIds: readonly string[];
}

export interface PolicyAuthorizationRequest {
  permissionKey: string;
  targetScope: PolicyTargetScope;
  requestedFields?: readonly string[];
  currentState?: string;
  actorRelations?: Readonly<Record<string, string>>;
  evaluatedAt: Date;
}

export type PolicyDecision =
  | {
      allowed: true;
      permissionKey: string;
      scopeId: string;
      allowedFields: readonly string[];
      assignmentIds: readonly string[];
    }
  | {
      allowed: false;
      permissionKey: string;
      reason: PolicyDenialReason;
    };

export interface PolicySnapshotRepository {
  loadSnapshot(userId: string, evaluatedAt: Date): Promise<PolicySnapshot | null>;
}
