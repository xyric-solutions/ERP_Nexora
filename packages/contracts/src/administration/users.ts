import { z } from "zod";

import { accessLevelSchema } from "./access-levels.js";
import { administrationModuleIdSchema, moduleAccessMapSchema } from "./module-catalogue.js";

const identifier = z.string().trim().min(1).max(128);
const displayName = z.string().trim().min(1).max(200);
const email = z.email().trim().max(320);
const username = z
  .string()
  .trim()
  .min(3)
  .max(128)
  .regex(/^[a-z0-9][a-z0-9._-]*$/);
const reason = z.string().trim().min(1).max(512);
const isoDate = z.iso.date();
const isoTimestamp = z.iso.datetime({ offset: true });
/** The server applies the tenant password policy; this is only the outer bound. */
const initialPassword = z.string().min(8).max(1_024);

export const adminUserStatusSchema = z.enum(["active", "inactive", "locked", "resigned"]);
export type AdminUserStatus = z.infer<typeof adminUserStatusSchema>;

export const adminUserCompanyAccessSchema = z
  .strictObject({ company_id: identifier, is_default: z.boolean() })
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

/** Level shown per module. `custom` = permissions that match no preset (pre-existing users). */
export const adminUserModuleAccessLevelSchema = z.union([accessLevelSchema, z.literal("custom")]);

export const adminUserSchema = z.strictObject({
  id: identifier,
  display_name: displayName,
  username,
  email,
  employee_id: identifier.nullable(),
  status: adminUserStatusSchema,
  super_admin: z.boolean(),
  must_change_password: z.boolean(),
  companies: z
    .strictObject({ company_id: identifier, company_name: z.string().max(200), is_default: z.boolean() })
    .array(),
  access: z.partialRecord(administrationModuleIdSchema, adminUserModuleAccessLevelSchema),
  last_login_at: isoTimestamp.nullable(),
  end_date: isoDate.nullable(),
  created_at: isoTimestamp,
  updated_at: isoTimestamp,
  row_version: z.number().int().nonnegative(),
});
export type AdminUser = z.infer<typeof adminUserSchema>;

/** Either a Super Admin-entered initial password or `generate: true`, never both. */
const initialCredentialSchema = z.union([
  z.strictObject({ generate: z.literal(true) }),
  z.strictObject({ generate: z.literal(false).default(false), password: initialPassword }),
]);

export const createAdminUserRequestSchema = z.strictObject({
  display_name: displayName,
  email,
  username,
  employee_id: identifier.nullable().default(null),
  credential: initialCredentialSchema,
  companies: adminUserCompanyAccessSchema,
  super_admin: z.boolean().default(false),
  access: moduleAccessMapSchema.default({}),
});
export type CreateAdminUserRequest = z.infer<typeof createAdminUserRequestSchema>;

export const updateAdminUserRequestSchema = z
  .strictObject({
    display_name: displayName.optional(),
    email: email.optional(),
    employee_id: identifier.nullable().optional(),
    companies: adminUserCompanyAccessSchema.optional(),
    super_admin: z.boolean().optional(),
    access: moduleAccessMapSchema.optional(),
    /** Required when a Super Admin removes their own Super Admin flag (plan §2 safety rules). */
    confirm_self_demotion: z.literal(true).optional(),
  })
  .refine((body) => Object.keys(body).some((key) => key !== "confirm_self_demotion"), {
    message: "at least one field must be changed",
  });
export type UpdateAdminUserRequest = z.infer<typeof updateAdminUserRequestSchema>;

export const adminUserActionSchema = z.discriminatedUnion("action", [
  z.strictObject({
    action: z.literal("reset_password"),
    credential: initialCredentialSchema.default({ generate: true }),
  }),
  z.strictObject({ action: z.literal("deactivate"), reason }),
  z.strictObject({ action: z.literal("reactivate"), reason: reason.optional() }),
  z.strictObject({ action: z.literal("mark_resigned"), end_date: isoDate, reason }),
]);
export type AdminUserAction = z.infer<typeof adminUserActionSchema>;

/** Returned once after create/reset. The password is never retrievable again. */
export const adminUserCredentialResultSchema = z.strictObject({
  user: adminUserSchema,
  one_time_password: z.string().min(8).max(1_024).nullable(),
  email_status: z.enum(["queued", "not_configured"]),
});
export type AdminUserCredentialResult = z.infer<typeof adminUserCredentialResultSchema>;

export const adminUserListQuerySchema = z.strictObject({
  q: z.string().trim().max(200).optional(),
  status: adminUserStatusSchema.optional(),
  module_id: administrationModuleIdSchema.optional(),
  level: adminUserModuleAccessLevelSchema.optional(),
  super_admin: z.stringbool().optional(),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  page_size: z.coerce.number().int().min(1).max(200).default(50),
});
export type AdminUserListQuery = z.infer<typeof adminUserListQuerySchema>;

export const adminUserListResponseSchema = z.strictObject({
  items: adminUserSchema.array(),
  page: z.number().int().min(1),
  page_size: z.number().int().min(1),
  total: z.number().int().nonnegative(),
});
export type AdminUserListResponse = z.infer<typeof adminUserListResponseSchema>;

/** Self-service change password for any signed-in user (`POST /auth/change-password`). */
export const changePasswordRequestSchema = z
  .strictObject({
    current_password: z.string().min(1).max(1_024),
    new_password: z.string().min(8).max(1_024),
  })
  .refine((body) => body.current_password !== body.new_password, {
    message: "new password must differ from the current password",
    path: ["new_password"],
  });
export type ChangePasswordRequest = z.infer<typeof changePasswordRequestSchema>;
