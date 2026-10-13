import { z } from "zod";

export const loginIdentifierSchema = z.string().trim().min(3).max(254);
export const tenantIdentifierSchema = z.string().trim().min(1).max(128);
export const emailAddressSchema = z.email().trim().max(320);

export const bootstrapAdministratorRequestSchema = z.object({
  loginIdentifier: loginIdentifierSchema,
  displayName: z.string().trim().min(1).max(200),
  password: z.string().min(1).max(512),
});

export const bootstrapAdministratorResponseSchema = z.object({
  userId: z.string().uuid(),
  loginIdentifier: loginIdentifierSchema,
  displayName: z.string().min(1).max(200),
  completedAt: z.string().datetime({ offset: true }),
});

export const passwordLoginRequestSchema = z.object({
  identifier: z.string().trim().min(1).max(320),
  password: z.string().min(1).max(1_024),
});

export const authenticatedUserSchema = z.object({
  id: z.string().min(1).max(128),
  email: emailAddressSchema,
  display_name: z.string().min(1).max(320),
  roles: z.array(z.string().min(1).max(128)),
  permissions: z.array(z.string().regex(/^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*){2,}$/)),
});

export const sessionResponseSchema = z.object({
  status: z.literal("authenticated"),
  tenant_id: tenantIdentifierSchema,
  user: authenticatedUserSchema,
  csrf_token: z.string().min(43).max(43),
  idle_expires_at: z.string().datetime({ offset: true }),
  absolute_expires_at: z.string().datetime({ offset: true }),
});

export const tenantSelectionChoiceSchema = z.object({
  id: z.string().min(43).max(43),
  organization_name: z.string().trim().min(1).max(200),
});

export const tenantSelectionRequiredResponseSchema = z.object({
  status: z.literal("tenant_selection_required"),
  ticket: z.string().min(43).max(43),
  expires_at: z.string().datetime({ offset: true }),
  choices: z.array(tenantSelectionChoiceSchema).min(2).max(16),
});

export const passwordChangeRequiredResponseSchema = z.object({
  status: z.literal("password_change_required"),
  ticket: z.string().min(43).max(43),
  expires_at: z.string().datetime({ offset: true }),
});

export const authenticationCompletionResponseSchema = z.discriminatedUnion("status", [
  sessionResponseSchema,
  passwordChangeRequiredResponseSchema,
]);

export const passwordLoginResponseSchema = z.discriminatedUnion("status", [
  sessionResponseSchema,
  tenantSelectionRequiredResponseSchema,
  passwordChangeRequiredResponseSchema,
]);

export const selectTenantRequestSchema = z.object({
  ticket: z.string().min(43).max(43),
  choice_id: z.string().min(43).max(43),
});

export const cancelTenantSelectionRequestSchema = z.object({
  ticket: z.string().min(43).max(43),
});

export const changeInitialPasswordRequestSchema = z.object({
  ticket: z.string().min(43).max(43),
  new_password: z.string().min(12).max(128),
});

export type BootstrapAdministratorRequest = z.infer<typeof bootstrapAdministratorRequestSchema>;
export type BootstrapAdministratorResponse = z.infer<typeof bootstrapAdministratorResponseSchema>;
export type PasswordLoginRequest = z.infer<typeof passwordLoginRequestSchema>;
export type PasswordLoginResponse = z.infer<typeof passwordLoginResponseSchema>;
export type TenantSelectionRequiredResponse = z.infer<typeof tenantSelectionRequiredResponseSchema>;
export type TenantSelectionChoice = z.infer<typeof tenantSelectionChoiceSchema>;
export type SelectTenantRequest = z.infer<typeof selectTenantRequestSchema>;
export type CancelTenantSelectionRequest = z.infer<typeof cancelTenantSelectionRequestSchema>;
export type PasswordChangeRequiredResponse = z.infer<typeof passwordChangeRequiredResponseSchema>;
export type AuthenticationCompletionResponse = z.infer<typeof authenticationCompletionResponseSchema>;
export type ChangeInitialPasswordRequest = z.infer<typeof changeInitialPasswordRequestSchema>;
export type SessionResponse = z.infer<typeof sessionResponseSchema>;
export type AuthenticatedUser = z.infer<typeof authenticatedUserSchema>;
