import { z } from "zod";

const identifier = z.string().trim().min(1).max(128);
const reason = z.string().trim().min(1).max(512);

export const createSecurityImpersonationSchema = z.strictObject({
  target_user_id: identifier,
  purpose: reason,
  duration_minutes: z.number().int().min(5).max(60),
});

export const securityImpersonationActionSchema = z.discriminatedUnion("action", [
  z.strictObject({
    action: z.enum(["submit", "approve", "activate", "emergency_activate"]),
    request_id: identifier,
    expected_version: z.number().int().positive(),
    reason: reason.optional(),
  }),
  z.strictObject({
    action: z.enum(["reject", "end"]),
    request_id: identifier,
    expected_version: z.number().int().positive(),
    reason,
  }),
]);

export const securityImpersonationListQuerySchema = z.strictObject({
  lifecycle_state: z
    .enum(["draft", "submitted", "approved", "active", "rejected", "ended", "expired", "activation_failed"])
    .optional(),
  principal_id: identifier.optional(),
  cursor: z.coerce.number().int().nonnegative().default(0),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

export type CreateSecurityImpersonation = z.infer<typeof createSecurityImpersonationSchema>;
export type SecurityImpersonationAction = z.infer<typeof securityImpersonationActionSchema>;
export type SecurityImpersonationListQuery = z.infer<typeof securityImpersonationListQuerySchema>;
