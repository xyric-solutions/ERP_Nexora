import type { PolicyPrincipal, PolicyTargetScope } from "./types.js";

export type PolicyAdministrationOperation =
  | "scope.create"
  | "scope.edit"
  | "scope.archive"
  | "role.create"
  | "role.edit"
  | "role.archive"
  | "role_permission.edit"
  | "field_grant.edit"
  | "role_assignment.create"
  | "role_assignment.edit"
  | "role_assignment.archive"
  | "sod_policy.create"
  | "sod_policy.edit"
  | "sod_policy.archive";

export interface PolicyAdministrationActor extends PolicyPrincipal {
  sessionId: string;
}

export interface PolicyAdministrationCommand {
  commandId: string;
  operation: PolicyAdministrationOperation;
  targetScope: PolicyTargetScope;
  entityId?: string;
  expectedVersion?: number;
  requestedFields: readonly string[];
  data: Readonly<Record<string, unknown>>;
  evaluatedAt: Date;
}

export type PolicyAdministrationResult =
  | {
      ok: true;
      commandId: string;
      entityId: string;
      version: number;
      replayed: boolean;
    }
  | {
      ok: false;
      commandId: string;
      code:
        "mfa_required" | "permission_denied" | "conflict" | "stale_version" | "invalid_command" | "policy_unavailable";
    };

export interface PolicyAdministrationRepository {
  executeAuthorized(
    actor: PolicyAdministrationActor,
    command: PolicyAdministrationCommand,
  ): Promise<PolicyAdministrationResult>;
}

export class PolicyAdministrationService {
  constructor(private readonly repository: PolicyAdministrationRepository) {}

  async execute(
    actor: PolicyAdministrationActor,
    command: PolicyAdministrationCommand,
  ): Promise<PolicyAdministrationResult> {
    if (actor.assuranceLevel !== "mfa") {
      return { ok: false, commandId: command.commandId, code: "mfa_required" };
    }
    try {
      return await this.repository.executeAuthorized(actor, command);
    } catch {
      return { ok: false, commandId: command.commandId, code: "policy_unavailable" };
    }
  }
}
