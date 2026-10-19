import { randomUUID } from "node:crypto";

import {
  APPROVAL_OVERRIDE_PERMISSION,
  evaluateApprovalActor,
  SUPER_ADMINISTRATOR_ROLE,
  type AuthenticatedAccount,
} from "@nexora/auth";
import type { PoolClient } from "pg";

const safeIdentity = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;

export class ApprovalOverrideWriterError extends Error {
  constructor(
    readonly code:
      | "APPROVAL_OVERRIDE_FORBIDDEN"
      | "APPROVAL_OVERRIDE_NOT_REQUIRED"
      | "APPROVAL_OVERRIDE_AUTHORITY_UNAVAILABLE"
      | "INVALID_APPROVAL_OVERRIDE_EVIDENCE"
      | "APPROVAL_OVERRIDE_IDEMPOTENCY_CONFLICT",
    message: string,
  ) {
    super(message);
    this.name = "ApprovalOverrideWriterError";
  }
}

export interface WriteApprovalOverrideEventInput {
  tenantId: string;
  account: AuthenticatedAccount;
  makerActorIds: readonly string[];
  normalDecisionPermission: string;
  resourceType: string;
  resourceId: string;
  decisionAction: "approve" | "reject" | "activate" | "post";
  reason: string;
  correlationId: string;
  idempotencyKey: string;
  metadata?: Readonly<Record<string, unknown>>;
  impersonated?: boolean;
}

export interface ApprovalOverrideWriteResult {
  eventId: string;
  replayed: boolean;
}

interface AssignmentEvidence {
  role_policy_id: string;
  assignment_id: string;
  assignment_version: string;
}

function requireBoundedIdentity(value: string, field: string, maximum: number): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > maximum || !safeIdentity.test(normalized)) {
    throw new ApprovalOverrideWriterError(
      "INVALID_APPROVAL_OVERRIDE_EVIDENCE",
      `${field} is not a valid approval override identifier.`,
    );
  }
  return normalized;
}

function validateInput(input: WriteApprovalOverrideEventInput): {
  reason: string;
  metadata: Readonly<Record<string, unknown>>;
} {
  requireBoundedIdentity(input.tenantId, "tenantId", 128);
  requireBoundedIdentity(input.resourceType, "resourceType", 128);
  if (input.resourceId.trim().length < 1 || input.resourceId.length > 256) {
    throw new ApprovalOverrideWriterError(
      "INVALID_APPROVAL_OVERRIDE_EVIDENCE",
      "resourceId is not a valid approval override identifier.",
    );
  }
  requireBoundedIdentity(input.normalDecisionPermission, "normalDecisionPermission", 255);
  if (!(["approve", "reject", "activate", "post"] as const).includes(input.decisionAction)) {
    throw new ApprovalOverrideWriterError(
      "INVALID_APPROVAL_OVERRIDE_EVIDENCE",
      "decisionAction is not a supported approval override action.",
    );
  }
  requireBoundedIdentity(input.correlationId, "correlationId", 128);
  requireBoundedIdentity(input.idempotencyKey, "idempotencyKey", 255);
  const reason = input.reason.trim();
  if (!reason || reason.length > 512) {
    throw new ApprovalOverrideWriterError(
      "INVALID_APPROVAL_OVERRIDE_EVIDENCE",
      "A non-empty approval override reason of at most 512 characters is required.",
    );
  }
  const metadata = input.metadata ?? {};
  if (Array.isArray(metadata) || metadata === null || typeof metadata !== "object") {
    throw new ApprovalOverrideWriterError(
      "INVALID_APPROVAL_OVERRIDE_EVIDENCE",
      "Approval override metadata must be an object.",
    );
  }
  const serializedMetadata = JSON.stringify(metadata);
  if (Buffer.byteLength(serializedMetadata, "utf8") > 4096) {
    throw new ApprovalOverrideWriterError(
      "INVALID_APPROVAL_OVERRIDE_EVIDENCE",
      "Approval override metadata exceeds the safe size limit.",
    );
  }
  return { reason, metadata };
}

export async function writeApprovalOverrideEvent(
  client: Pick<PoolClient, "query">,
  input: WriteApprovalOverrideEventInput,
): Promise<ApprovalOverrideWriteResult> {
  const policy = evaluateApprovalActor({
    account: input.account,
    normalDecisionPermission: input.normalDecisionPermission,
    makerActorIds: input.makerActorIds,
    ...(input.impersonated === undefined ? {} : { impersonated: input.impersonated }),
  });
  if (policy.kind === "ordinary") {
    throw new ApprovalOverrideWriterError(
      "APPROVAL_OVERRIDE_NOT_REQUIRED",
      "The approval actor is independent and does not require an override.",
    );
  }
  if (policy.kind === "forbidden") {
    throw new ApprovalOverrideWriterError(
      "APPROVAL_OVERRIDE_FORBIDDEN",
      `The approval override policy rejected this actor (${policy.reason}).`,
    );
  }
  if (input.account.tenantId !== input.tenantId) {
    throw new ApprovalOverrideWriterError(
      "APPROVAL_OVERRIDE_FORBIDDEN",
      "The authenticated account does not belong to the governed tenant.",
    );
  }

  const { reason, metadata } = validateInput(input);
  const assignment = await client.query<AssignmentEvidence>(
    `select policy.id as role_policy_id,assignment.assignment_id,
            assignment_version.version::text as assignment_version
       from security_user_role_assignment assignment
       join security_role_policy policy
         on policy.tenant_id=assignment.tenant_id and policy.id=assignment.role_policy_id
       join security_tenant_role role
         on role.tenant_id=policy.tenant_id and role.role_id=policy.role_id
       join security_role_permission_grant override_grant
         on override_grant.tenant_id=policy.tenant_id
        and override_grant.role_policy_id=policy.id
        and override_grant.permission_key=$3
       join security_role_permission_grant normal_grant
         on normal_grant.tenant_id=policy.tenant_id
        and normal_grant.role_policy_id=policy.id
        and normal_grant.permission_key=$4
       join lateral (
            select version.version,version.lifecycle_state,version.valid_from,version.valid_until
              from security_user_role_assignment_version version
             where version.tenant_id=assignment.tenant_id
               and version.assignment_id=assignment.assignment_id
               and version.user_id=assignment.user_id
               and version.role_policy_id=assignment.role_policy_id
             order by version.version desc limit 1
       ) assignment_version on true
      where assignment.tenant_id=$1 and assignment.user_id=$2
        and assignment.lifecycle_state='active'
        and assignment.valid_from<=now()
        and (assignment.valid_until is null or assignment.valid_until>now())
        and policy.role=$5 and policy.status='active' and policy.lifecycle_state='active'
        and role.role_code=$5 and role.lifecycle_state='active'
        and assignment_version.lifecycle_state='active'
        and assignment_version.valid_from<=now()
        and (assignment_version.valid_until is null or assignment_version.valid_until>now())
      order by assignment.assignment_id
      limit 1`,
    [
      input.tenantId,
      input.account.userId,
      APPROVAL_OVERRIDE_PERMISSION,
      input.normalDecisionPermission,
      SUPER_ADMINISTRATOR_ROLE,
    ],
  );
  const evidence = assignment.rows[0];
  if (!evidence) {
    throw new ApprovalOverrideWriterError(
      "APPROVAL_OVERRIDE_AUTHORITY_UNAVAILABLE",
      "No active governed super-administrator assignment authorizes this override.",
    );
  }

  const eventId = `approval-override-${randomUUID()}`;
  const values = [
    input.tenantId,
    eventId,
    input.resourceType,
    input.resourceId,
    input.decisionAction,
    input.account.userId,
    SUPER_ADMINISTRATOR_ROLE,
    evidence.role_policy_id,
    evidence.assignment_id,
    Number(evidence.assignment_version),
    input.normalDecisionPermission,
    reason,
    input.correlationId,
    input.idempotencyKey,
    JSON.stringify(metadata),
  ];
  const inserted = await client.query<{ event_id: string }>(
    `insert into approval_override_event
      (tenant_id,event_id,resource_type,resource_id,decision_action,actor_user_id,
       role_code,role_policy_id,role_assignment_id,role_assignment_version,
       normal_permission_key,reason,correlation_id,idempotency_key,metadata)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb)
     on conflict do nothing returning event_id`,
    values,
  );
  if (inserted.rows[0]) return { eventId: inserted.rows[0].event_id, replayed: false };

  const replay = await client.query<{ event_id: string; matches: boolean }>(
    `select event_id,
            resource_type=$3 and resource_id=$4 and decision_action=$5
            and actor_user_id=$6 and role_code=$7 and role_policy_id=$8
            and role_assignment_id=$9 and role_assignment_version=$10
            and normal_permission_key=$11 and reason=$12 and correlation_id=$13
            and idempotency_key=$14 and metadata=$15::jsonb as matches
       from approval_override_event
      where $2::text is not null and tenant_id=$1 and (
            (actor_user_id=$6 and idempotency_key=$14)
         or (resource_type=$3 and resource_id=$4 and decision_action=$5 and idempotency_key=$14)
      )
      order by occurred_at,event_id limit 1`,
    values,
  );
  if (replay.rows[0]?.matches) return { eventId: replay.rows[0].event_id, replayed: true };
  throw new ApprovalOverrideWriterError(
    "APPROVAL_OVERRIDE_IDEMPOTENCY_CONFLICT",
    "The approval override idempotency key was already used for another decision.",
  );
}
