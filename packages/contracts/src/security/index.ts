import { z } from "zod";

export * from "./administration.js";
export * from "./user-administration.js";

const identifierSchema = z
  .string()
  .trim()
  .regex(/^[a-z][a-z0-9_-]{1,63}$/);
export const exactPermissionKeySchema = z
  .string()
  .trim()
  .regex(/^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*){2}$/);
export const policyFieldPathSchema = z.string().regex(/^[A-Za-z][A-Za-z0-9]*(?:\.[A-Za-z][A-Za-z0-9]*)*$/);
export const policyLifecycleStatusSchema = z.enum(["active", "archived"]);
export const policyAssuranceLevelSchema = z.enum(["password", "mfa"]);

export const securityScopeSchema = z.strictObject({
  id: z.string().uuid(),
  scopeType: z.enum(["enterprise", "company", "branch", "organization_unit"]),
  code: identifierSchema,
  displayName: z.string().trim().min(1).max(200),
  parentScopeId: z.string().uuid().nullable(),
  enterpriseScopeId: z.string().uuid(),
  companyScopeId: z.string().uuid().nullable(),
  status: policyLifecycleStatusSchema,
  version: z.number().int().positive(),
});

export const securityRoleSchema = z.strictObject({
  id: z.string().uuid(),
  code: identifierSchema,
  displayName: z.string().trim().min(1).max(200),
  description: z.string().max(500),
  status: policyLifecycleStatusSchema,
  version: z.number().int().positive(),
});

export const securityPermissionSchema = z.strictObject({
  id: z.string().uuid(),
  key: exactPermissionKeySchema,
  module: identifierSchema,
  resource: identifierSchema,
  action: identifierSchema,
  description: z.string().trim().min(1).max(500),
  requiredAssurance: policyAssuranceLevelSchema,
  fieldBearing: z.boolean(),
  stateContextRequired: z.boolean(),
  sensitivity: z.enum(["standard", "sensitive", "restricted"]),
  allowedSourceStates: z.array(identifierSchema),
  availableFields: z.array(policyFieldPathSchema),
});

export const securityFieldGrantSchema = z.strictObject({
  roleId: z.string().uuid(),
  permissionKey: exactPermissionKeySchema,
  fieldPath: policyFieldPathSchema,
});

export const securityAssignmentScopeSchema = z.strictObject({
  scopeId: z.string().uuid(),
  includeDescendants: z.boolean(),
});

export const securityRoleAssignmentSchema = z
  .strictObject({
    id: z.string().uuid(),
    userId: z.string().uuid(),
    roleId: z.string().uuid(),
    status: z.enum(["active", "revoked"]),
    validFrom: z.string().datetime({ offset: true }),
    validUntil: z.string().datetime({ offset: true }).nullable(),
    scopes: z.array(securityAssignmentScopeSchema).min(1),
    version: z.number().int().positive(),
  })
  .refine((assignment) => assignment.validUntil === null || assignment.validUntil > assignment.validFrom, {
    message: "validUntil must be later than validFrom",
    path: ["validUntil"],
  });

const sodBaseSchema = {
  id: z.string().uuid(),
  code: identifierSchema,
  displayName: z.string().trim().min(1).max(200),
  status: policyLifecycleStatusSchema,
  version: z.number().int().positive(),
};

export const securitySodPolicySchema = z.discriminatedUnion("kind", [
  z.strictObject({
    ...sodBaseSchema,
    kind: z.literal("assignment_conflict"),
    firstRoleId: z.string().uuid(),
    secondRoleId: z.string().uuid(),
  }),
  z.strictObject({
    ...sodBaseSchema,
    kind: z.literal("transaction_conflict"),
    protectedPermissionKey: exactPermissionKeySchema,
    actorRelation: identifierSchema,
    applicableSourceStates: z.array(identifierSchema),
  }),
]);

export const policyDenialReasonSchema = z.enum([
  "authentication_required",
  "mfa_required",
  "assignment_inactive",
  "permission_denied",
  "scope_denied",
  "field_denied",
  "state_denied",
  "sod_conflict",
  "policy_unavailable",
]);

export const policyDecisionSchema = z.discriminatedUnion("allowed", [
  z.strictObject({
    allowed: z.literal(true),
    permissionKey: exactPermissionKeySchema,
    scopeId: z.string().uuid(),
    allowedFields: z.array(policyFieldPathSchema),
    assignmentIds: z.array(z.string().uuid()).min(1),
  }),
  z.strictObject({
    allowed: z.literal(false),
    permissionKey: exactPermissionKeySchema,
    reason: policyDenialReasonSchema,
  }),
]);

const commandEnvelope = {
  commandId: z.string().uuid(),
  expectedVersion: z.number().int().positive().optional(),
};

export const securityAdministrationCommandSchema = z.discriminatedUnion("operation", [
  z.strictObject({
    ...commandEnvelope,
    operation: z.literal("scope.create"),
    data: z.strictObject({
      code: identifierSchema,
      displayName: z.string().trim().min(1).max(200),
      scopeType: z.enum(["company", "branch", "organization_unit"]),
      parentScopeId: z.string().uuid(),
    }),
  }),
  z.strictObject({
    ...commandEnvelope,
    operation: z.enum(["scope.edit", "scope.archive", "role.edit", "role.archive"]),
    entityId: z.string().uuid(),
    data: z.record(z.string(), z.unknown()),
  }),
  z.strictObject({
    ...commandEnvelope,
    operation: z.literal("role.create"),
    data: z.strictObject({
      code: identifierSchema,
      displayName: z.string().trim().min(1).max(200),
      description: z.string().max(500),
    }),
  }),
  z.strictObject({
    ...commandEnvelope,
    operation: z.enum(["role_permission.edit", "field_grant.edit"]),
    roleId: z.string().uuid(),
    permissionKey: exactPermissionKeySchema,
    fields: z.array(policyFieldPathSchema).optional(),
  }),
  z.strictObject({
    ...commandEnvelope,
    operation: z.enum(["role_assignment.create", "role_assignment.edit", "role_assignment.archive"]),
    assignment: securityRoleAssignmentSchema,
  }),
  z.strictObject({
    ...commandEnvelope,
    operation: z.enum(["sod_policy.create", "sod_policy.edit", "sod_policy.archive"]),
    policy: securitySodPolicySchema,
  }),
]);

export type SecurityScope = z.infer<typeof securityScopeSchema>;
export type SecurityRole = z.infer<typeof securityRoleSchema>;
export type SecurityPermission = z.infer<typeof securityPermissionSchema>;
export type SecurityFieldGrant = z.infer<typeof securityFieldGrantSchema>;
export type SecurityRoleAssignment = z.infer<typeof securityRoleAssignmentSchema>;
export type SecuritySodPolicy = z.infer<typeof securitySodPolicySchema>;
export type SecurityAdministrationCommand = z.infer<typeof securityAdministrationCommandSchema>;
export type PolicyDecisionContract = z.infer<typeof policyDecisionSchema>;
