import { z } from "zod";

const identifier = z.string().trim().min(1).max(128);
const permissionKey = z.string().regex(/^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+$/);
const reason = z.string().trim().min(1).max(512);

export const createSecurityDelegationSchema = z
  .strictObject({
    delegatee_id: identifier,
    permission_key: permissionKey,
    scope_kind: z.enum(["tenant", "company"]),
    scope_value: identifier,
    valid_from: z.string().datetime({ offset: true }),
    valid_until: z.string().datetime({ offset: true }),
    reason,
  })
  .refine((value) => new Date(value.valid_until).getTime() > new Date(value.valid_from).getTime(), {
    path: ["valid_until"],
    message: "valid_until must follow valid_from",
  });

export const securityDelegationActionSchema = z.discriminatedUnion("action", [
  z.strictObject({
    action: z.enum(["submit", "approve", "activate"]),
    delegation_id: identifier,
    expected_version: z.number().int().positive(),
  }),
  z.strictObject({
    action: z.enum(["reject", "revoke"]),
    delegation_id: identifier,
    expected_version: z.number().int().positive(),
    reason,
  }),
]);

export const securityDelegationListQuerySchema = z.strictObject({
  lifecycle_state: z.enum(["draft", "submitted", "approved", "active", "rejected", "revoked", "expired"]).optional(),
  principal_id: identifier.optional(),
  cursor: z.coerce.number().int().nonnegative().default(0),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

export type CreateSecurityDelegation = z.infer<typeof createSecurityDelegationSchema>;
export type SecurityDelegationAction = z.infer<typeof securityDelegationActionSchema>;
export type SecurityDelegationListQuery = z.infer<typeof securityDelegationListQuerySchema>;
