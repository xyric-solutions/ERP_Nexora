import type { AuthenticatedAccount } from "./tenant-authentication.js";

export const SUPER_ADMINISTRATOR_ROLE = "super_administrator";
export const APPROVAL_OVERRIDE_PERMISSION = "platform.approval.override";

export type ApprovalActor = Pick<AuthenticatedAccount, "userId" | "roles" | "permissions"> & {
  status?: "active" | "inactive" | "locked" | "disabled";
};

export type ApprovalActorDecision =
  | { kind: "ordinary" }
  | { kind: "override" }
  | {
      kind: "forbidden";
      reason:
        | "account_unavailable"
        | "account_inactive"
        | "impersonation_forbidden"
        | "normal_permission_missing"
        | "maker_checker_required";
    };

export interface EvaluateApprovalActorInput {
  account: ApprovalActor | null | undefined;
  normalDecisionPermission: string;
  makerActorIds: readonly string[];
  impersonated?: boolean;
}

/**
 * Evaluates only the actor-separation rule for an approval decision.
 * Domain state, scope and persistence checks remain the caller's responsibility.
 */
export function evaluateApprovalActor(input: EvaluateApprovalActorInput): ApprovalActorDecision {
  const account = input.account;
  if (!account) return { kind: "forbidden", reason: "account_unavailable" };
  if (account.status !== undefined && account.status !== "active") {
    return { kind: "forbidden", reason: "account_inactive" };
  }
  if (input.impersonated) return { kind: "forbidden", reason: "impersonation_forbidden" };
  if (!account.permissions.includes(input.normalDecisionPermission)) {
    return { kind: "forbidden", reason: "normal_permission_missing" };
  }

  const actorIsMaker = new Set(input.makerActorIds.filter(Boolean)).has(account.userId);
  if (!actorIsMaker) return { kind: "ordinary" };

  if (account.roles.includes(SUPER_ADMINISTRATOR_ROLE) && account.permissions.includes(APPROVAL_OVERRIDE_PERMISSION)) {
    return { kind: "override" };
  }
  return { kind: "forbidden", reason: "maker_checker_required" };
}
