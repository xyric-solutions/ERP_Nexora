import { z } from "zod";

const identifier = z.string().trim().min(1).max(128);
const reason = z.string().trim().min(1).max(512);
const displayName = z.string().trim().min(1).max(200);
const username = z
  .string()
  .trim()
  .min(3)
  .max(128)
  .regex(/^[a-z0-9][a-z0-9._-]*$/);
const email = z.email().trim().max(320);

export const securityUserLifecycleStatusSchema = z.enum(["active", "inactive", "locked"]);

export const securityUserCompanySelectionSchema = z
  .strictObject({
    company_id: identifier,
    is_default: z.boolean(),
  })
  .array()
  .min(1)
  .max(128)
  .superRefine((companies, context) => {
    if (new Set(companies.map((company) => company.company_id)).size !== companies.length) {
      context.addIssue({ code: "custom", message: "company_id values must be unique" });
    }
    if (companies.filter((company) => company.is_default).length !== 1) {
      context.addIssue({ code: "custom", message: "exactly one company must be the default" });
    }
  });

const completeUserProposalSchema = z.strictObject({
  display_name: displayName,
  username,
  email,
  employee_id: identifier.nullable().default(null),
  companies: securityUserCompanySelectionSchema,
  initial_role_policy_ids: z.array(identifier).max(64).default([]),
});

export const createSecurityUserRequestSchema = z.discriminatedUnion("requested_action", [
  z.strictObject({
    requested_action: z.literal("create"),
    proposal: completeUserProposalSchema,
  }),
  z.strictObject({
    requested_action: z.literal("edit"),
    target_user_id: identifier,
    expected_user_version: z.number().int().positive(),
    proposal: z.strictObject({
      display_name: displayName,
      username,
      email,
    }),
  }),
  z.strictObject({
    requested_action: z.enum(["activate", "unlock"]),
    target_user_id: identifier,
    expected_user_version: z.number().int().positive(),
    proposal: z.strictObject({}),
  }),
  z.strictObject({
    requested_action: z.literal("archive"),
    target_user_id: identifier,
    expected_user_version: z.number().int().positive(),
    proposal: z.strictObject({ reason }),
  }),
  z.strictObject({
    requested_action: z.literal("reset_password"),
    target_user_id: identifier,
    expected_user_version: z.number().int().positive(),
    proposal: z.strictObject({ reason }),
  }),
  z.strictObject({
    requested_action: z.literal("company_access"),
    target_user_id: identifier,
    expected_user_version: z.number().int().positive(),
    proposal: z.strictObject({ companies: securityUserCompanySelectionSchema }),
  }),
  z.strictObject({
    requested_action: z.literal("employee_link"),
    target_user_id: identifier,
    expected_user_version: z.number().int().positive(),
    proposal: z.strictObject({ employee_id: identifier.nullable(), reason }),
  }),
]);

export const securityUserRequestActionSchema = z.discriminatedUnion("action", [
  z.strictObject({
    action: z.literal("update"),
    request_id: identifier,
    expected_version: z.number().int().positive(),
    request: createSecurityUserRequestSchema,
  }),
  z.strictObject({
    action: z.literal("submit"),
    request_id: identifier,
    expected_version: z.number().int().positive(),
  }),
]);

export const securityUserEmergencyActionSchema = z.strictObject({
  action: z.enum(["lock", "revoke_sessions"]),
  target_user_id: identifier,
  expected_user_version: z.number().int().positive(),
  reason,
});

export const securityUserListQuerySchema = z.strictObject({
  search: z.string().trim().max(200).optional(),
  status: securityUserLifecycleStatusSchema.optional(),
  company_id: identifier.optional(),
  role_policy_id: identifier.optional(),
  employee_linked: z.boolean().optional(),
  archived: z.boolean().optional(),
  cursor: z.string().min(1).max(512).optional(),
  limit: z.number().int().min(1).max(100).default(25),
});

export const securityUserCompanySchema = z.strictObject({
  id: identifier,
  name: z.string().trim().min(1).max(200),
  is_default: z.boolean(),
});

export const securityUserRoleSchema = z.strictObject({
  assignment_id: identifier,
  role_policy_id: identifier,
  role_code: z.string().min(1).max(64),
  display_name: z.string().min(1).max(128),
  valid_from: z.string().datetime({ offset: true }),
  valid_until: z.string().datetime({ offset: true }).nullable(),
});

export const securityUserSummarySchema = z.strictObject({
  id: identifier,
  display_name: z.string().min(1).max(200),
  username,
  email,
  status: securityUserLifecycleStatusSchema,
  row_version: z.number().int().positive(),
  default_company: securityUserCompanySchema.nullable(),
  role_names: z.array(z.string().min(1).max(128)),
  employee_linked: z.boolean(),
  pending_request_count: z.number().int().nonnegative(),
  updated_at: z.string().datetime({ offset: true }),
  archived_at: z.string().datetime({ offset: true }).nullable().optional(),
});

export const securityUserPageSchema = z.strictObject({
  items: z.array(securityUserSummarySchema),
  next_cursor: z.string().nullable(),
});

export const securityUserDetailSchema = securityUserSummarySchema.extend({
  companies: z.array(securityUserCompanySchema),
  roles: z.array(securityUserRoleSchema),
  employee: z
    .strictObject({
      id: identifier,
      employee_number: z.string().min(1).max(100),
      display_name: z.string().min(1).max(320),
    })
    .nullable(),
  must_change_password: z.boolean(),
});

export const securityUserOptionsSchema = z.strictObject({
  companies: z.array(
    z.strictObject({ id: identifier, code: z.string().min(1).max(64), name: z.string().min(1).max(200) }),
  ),
  employees: z.array(
    z.strictObject({
      id: identifier,
      employee_number: z.string().min(1).max(100),
      display_name: z.string().min(1).max(320),
    }),
  ),
  roles: z.array(
    z.strictObject({
      policy_id: identifier,
      role_code: z.string().min(1).max(64),
      display_name: z.string().min(1).max(128),
    }),
  ),
});

const baseUserAdministrationResult = {
  command_id: identifier,
  operation: z.string().regex(/^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+$/),
  outcome: z.enum(["completed", "rejected"]),
  entity_type: z.literal("user_account"),
  entity_id: identifier,
  projection: z.record(z.string(), z.unknown()),
  audit_event_id: identifier,
  replayed: z.boolean(),
} as const;

export const securityUserAdministrationResultSchema = z.discriminatedUnion("credential_delivery_available", [
  z.strictObject({
    ...baseUserAdministrationResult,
    replayed: z.literal(false),
    credential_delivery_available: z.literal(true),
    credential_delivery: z.strictObject({
      one_time_password: z.string().min(8).max(128),
    }),
  }),
  z.strictObject({
    ...baseUserAdministrationResult,
    credential_delivery_available: z.literal(false),
    credential_delivery: z.never().optional(),
  }),
]);

export type CreateSecurityUserRequest = z.infer<typeof createSecurityUserRequestSchema>;
export type SecurityUserRequestAction = z.infer<typeof securityUserRequestActionSchema>;
export type SecurityUserEmergencyAction = z.infer<typeof securityUserEmergencyActionSchema>;
export type SecurityUserListQuery = z.infer<typeof securityUserListQuerySchema>;
export type SecurityUserPage = z.infer<typeof securityUserPageSchema>;
export type SecurityUserDetail = z.infer<typeof securityUserDetailSchema>;
export type SecurityUserOptions = z.infer<typeof securityUserOptionsSchema>;
export type SecurityUserAdministrationResult = z.infer<typeof securityUserAdministrationResultSchema>;
