import type { SessionResponse } from "@nexora/contracts";

export const APPROVAL_OVERRIDE_PERMISSION = "platform.approval.override";
export const SUPER_ADMINISTRATOR_ROLE = "super_administrator";

export const INDEPENDENT_APPROVER_REQUIRED = "Independent approver required. You created or submitted this record.";

export function canUseSuperAdminApprovalOverride(
  session: SessionResponse | null,
  permissions: ReadonlySet<string>,
  normalDecisionPermission: string,
): boolean {
  return Boolean(
    session &&
    !session.impersonation &&
    session.user.roles?.includes(SUPER_ADMINISTRATOR_ROLE) &&
    permissions.has(APPROVAL_OVERRIDE_PERMISSION) &&
    permissions.has(normalDecisionPermission),
  );
}

export function actorMatchesAny(
  row: Record<string, unknown>,
  actorId: string | undefined,
  fields: readonly string[],
): boolean {
  if (!actorId) return false;
  return fields.some((field) => row[field] != null && String(row[field]) === actorId);
}
