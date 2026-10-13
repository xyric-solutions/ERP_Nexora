import { z } from "zod";

const identifier = z.string().trim().min(1).max(128);
const permissionKey = z.string().regex(/^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+$/);
const roleCode = z.string().regex(/^[a-z][a-z0-9_]{0,63}$/);
const idempotencyKey = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,254}$/);

export const securityScopeContractSchema = z.discriminatedUnion("mode", [
  z.strictObject({ mode: z.literal("tenant"), company_ids: z.array(identifier).max(0).default([]) }),
  z.strictObject({ mode: z.literal("own"), company_ids: z.array(identifier).max(0).default([]) }),
  z.strictObject({ mode: z.literal("companies"), company_ids: z.array(identifier).min(1) }),
]);

export const securityFieldRulesContractSchema = z.strictObject({
  allow: z.array(z.string().min(1).max(256)).nullable().default(null),
  deny: z.array(z.string().min(1).max(256)).default([]),
});

export const securitySodRulesContractSchema = z.strictObject({
  conflicting_roles: z.array(roleCode).default([]),
  distinct_actor_fields: z.array(roleCode).default([]),
});

export const createSecurityRoleRequestSchema = z.strictObject({
  role_code: roleCode,
  display_name: z.string().trim().min(1).max(128),
  description: z.string().max(512).default(""),
  permissions: z.array(permissionKey).min(1),
  scope: securityScopeContractSchema.default({ mode: "tenant", company_ids: [] }),
  field_rules: securityFieldRulesContractSchema.default({ allow: null, deny: [] }),
  sod_rules: securitySodRulesContractSchema.default({ conflicting_roles: [], distinct_actor_fields: [] }),
  allowed_source_states: z.record(permissionKey, z.array(roleCode).min(1)).default({}),
  delegations: z
    .array(
      z.strictObject({
        permission: permissionKey,
        scope_kind: z.enum(["tenant", "company", "owner"]),
        scope_value: z.string().min(1).max(256),
      }),
    )
    .default([]),
});

export const securityRoleActionRequestSchema = z.discriminatedUnion("action", [
  z.strictObject({
    action: z.literal("edit"),
    policy_id: identifier,
    role_id: identifier,
    expected_version: z.number().int().positive(),
    draft: createSecurityRoleRequestSchema,
  }),
  z.strictObject({
    action: z.enum(["submit", "request_activate", "request_archive"]),
    policy_id: identifier,
    expected_version: z.number().int().positive(),
  }),
]);

const assignmentProposal = z
  .strictObject({
    target_user_id: identifier,
    role_policy_id: identifier,
    assignment_id: identifier.nullable().default(null),
    valid_from: z.string().datetime({ offset: true }),
    valid_until: z.string().datetime({ offset: true }).nullable().default(null),
    revocation_reason: z.string().trim().min(1).max(512).nullable().default(null),
  })
  .refine((value) => value.valid_until === null || value.valid_until > value.valid_from, {
    path: ["valid_until"],
    message: "valid_until must follow valid_from",
  });

export const createSecurityAssignmentRequestSchema = z.strictObject({
  requested_action: z.enum(["create", "edit", "revoke"]),
  proposal: assignmentProposal,
});

export const securityAssignmentRequestActionSchema = z.discriminatedUnion("action", [
  z.strictObject({
    action: z.literal("update"),
    request_id: identifier,
    expected_version: z.number().int().positive(),
    proposal: assignmentProposal,
  }),
  z.strictObject({
    action: z.literal("submit"),
    request_id: identifier,
    expected_version: z.number().int().positive(),
  }),
]);

export const securityApprovalActionSchema = z.strictObject({
  resource_type: z.enum(["role", "assignment", "user"]),
  request_id: identifier,
  decision: z.enum(["approved", "rejected"]),
  reason: z.string().trim().min(1).max(512).nullable().default(null),
  expected_version: z.number().int().positive(),
});

export const securityAdministrationResultSchema = z.strictObject({
  command_id: identifier,
  operation: permissionKey,
  outcome: z.enum(["completed", "rejected"]),
  entity_type: roleCode,
  entity_id: identifier,
  projection: z.record(z.string(), z.unknown()),
  audit_event_id: identifier,
  replayed: z.boolean(),
});

export const securityPageSchema = z.strictObject({
  items: z.array(z.record(z.string(), z.unknown())),
  next_cursor: z.string().nullable(),
});

export const securityMutationHeadersSchema = z.strictObject({
  idempotency_key: idempotencyKey,
  csrf_token: z.string().min(43).max(43),
});

export type CreateSecurityRoleRequest = z.infer<typeof createSecurityRoleRequestSchema>;
export type SecurityRoleActionRequest = z.infer<typeof securityRoleActionRequestSchema>;
export type CreateSecurityAssignmentRequest = z.infer<typeof createSecurityAssignmentRequestSchema>;
export type SecurityAssignmentRequestAction = z.infer<typeof securityAssignmentRequestActionSchema>;
export type SecurityApprovalAction = z.infer<typeof securityApprovalActionSchema>;
export type SecurityAdministrationResult = z.infer<typeof securityAdministrationResultSchema>;
export type SecurityPage = z.infer<typeof securityPageSchema>;
