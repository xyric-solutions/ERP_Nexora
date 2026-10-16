import { z } from "zod";

const identifier = z.string().trim().min(1).max(128);
const reason = z.string().trim().min(1).max(512);

export const securitySessionPolicyValuesSchema = z
  .strictObject({
    password_minimum_length: z.number().int().min(8).max(64),
    password_require_uppercase: z.boolean(),
    password_require_lowercase: z.boolean(),
    password_require_number: z.boolean(),
    password_require_symbol: z.boolean(),
    session_idle_minutes: z.number().int().min(5).max(1440),
    session_absolute_hours: z.number().int().min(1).max(720),
    concurrent_session_limit: z.number().int().min(1).max(20),
    login_maximum_failures: z.number().int().min(3).max(20),
    login_window_minutes: z.number().int().min(1).max(120),
    login_block_minutes: z.number().int().min(1).max(1440),
    delegation_maximum_days: z.number().int().min(1).max(90),
    impersonation_maximum_minutes: z.number().int().min(5).max(60),
  })
  .refine((value) => value.session_idle_minutes * 60 <= value.session_absolute_hours * 3600, {
    path: ["session_idle_minutes"],
    message: "Idle timeout cannot exceed the absolute timeout.",
  });

export const createSecuritySessionPolicySchema = z.strictObject({
  values: securitySessionPolicyValuesSchema,
  change_summary: reason,
});

export const securitySessionPolicyActionSchema = z.discriminatedUnion("action", [
  z.strictObject({
    action: z.enum(["submit", "approve", "activate"]),
    policy_id: identifier,
    expected_version: z.number().int().positive(),
  }),
  z.strictObject({
    action: z.literal("reject"),
    policy_id: identifier,
    expected_version: z.number().int().positive(),
    reason,
  }),
]);

export type SecuritySessionPolicyValues = z.infer<typeof securitySessionPolicyValuesSchema>;
export type CreateSecuritySessionPolicy = z.infer<typeof createSecuritySessionPolicySchema>;
export type SecuritySessionPolicyAction = z.infer<typeof securitySessionPolicyActionSchema>;
