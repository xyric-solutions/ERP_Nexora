import { createHash, randomUUID } from "node:crypto";

import { evaluateApprovalActor, type AuthenticatedAccount } from "@nexora/auth";
import type {
  CreateHrEmployeeDraftRequest,
  HrEmployeeDraftResult,
  HrEmployeeDetail,
  HrEmployeeDirectory,
  HrCompanyDirectory,
  HrDashboardSummary,
  HrFinancePayrollDashboard,
  HrPositionsOrganization,
  HrPositionsOrganizationQuery,
  HrManpowerRequisitionDirectory,
  HrManpowerRequisitionQuery,
  CreateHrManpowerRequisitionRequest,
  HrManpowerRequisitionResult,
  SubmitHrManpowerRequisitionRequest,
  DecideHrManpowerRequisitionRequest,
  HrJobOpeningDirectory,
  HrJobOpeningQuery,
  CreateHrJobOpeningRequest,
  ChangeHrJobOpeningStateRequest,
  HrJobOpeningResult,
  HrOrganizationUnitDirectory,
  HrOrganizationUnitDirectoryQuery,
  CreateHrOrganizationUnitRequest,
  UpdateHrOrganizationUnitRequest,
  ChangeHrOrganizationUnitStatusRequest,
  HrOrganizationUnitMutationResult,
  HrEmployeeDirectoryQuery,
  HrEmployeeDraftDirectory,
  HrEmployeeDraftDetail,
  HrEmployeeDraftDirectoryQuery,
  HrMasterDirectory,
  HrMasterDirectoryQuery,
  CreateHrMasterRequest,
  UpdateHrMasterRequest,
  ChangeHrMasterStatusRequest,
  HrMasterMutationResult,
  HrJobGradeDirectory,
  CreateHrJobGradeRequest,
  UpdateHrJobGradeRequest,
  UpdateHrEmployeeDraftRequest,
  SubmitHrEmployeeDraftRequest,
  HrEmployeeDraftApprovalQueue,
  HrEmployeeDraftApprovalDetail,
  HrEmployeeDraftApprovalQueueQuery,
  DecideHrEmployeeDraftApprovalRequest,
  CreateHrProfileDraftAssignmentRequest,
  HrProfileDraftAssignmentResult,
  HrEmployeeContactDirectory,
  CreateHrEmployeeContactRequest,
  HrEmployeeContactResult,
  HrEmployeeEmergencyContactDirectory,
  CreateHrEmployeeEmergencyContactRequest,
  HrEmployeeEmergencyContactResult,
  HrEmployeeDocumentDirectory,
  HrEmployeeAssignmentDirectory,
  HrEmployeeStatusHistoryDirectory,
  HrEmployeeHistoryQuery,
  HrEmployeeLifecycleEventDirectory,
  HrEmployeeProfileVersionDirectory,
  HrEmploymentLifecyclePolicyDirectory,
  HrEmploymentLifecyclePolicyDirectoryQuery,
  CreateHrEmploymentLifecyclePolicyRequest,
  HrEmploymentLifecyclePolicyResult,
  SubmitHrEmploymentLifecyclePolicyRequest,
  HrEmploymentLifecyclePolicySubmissionResult,
  ApproveHrEmploymentLifecyclePolicyRequest,
  HrEmploymentLifecyclePolicyApprovalResult,
  ActivateHrEmploymentLifecyclePolicyRequest,
  HrEmploymentLifecyclePolicyActivationResult,
  CreateHrJobRequest,
  HrJobResult,
  CreateHrEmployeeHireRequest,
  HrEmployeeHireRequestResult,
  DecideHrEmployeeHireRequest,
  HrEmployeeHireDecisionResult,
  HrEmployeeHireRequestDirectory,
  HrEmployeeHireRequestDirectoryQuery,
  HrEmployeeHireRequestReview,
  CreateHrEmployeeTransferRequest,
  HrEmployeeTransferRequestResult,
  DecideHrEmployeeTransferRequest,
  HrEmployeeTransferDecisionResult,
  HrEmployeeTransferRequestDirectory,
  HrEmployeeTransferRequestDirectoryQuery,
  HrEmployeeTransferRequestReview,
  CreateHrEmployeePromotionRequest,
  HrEmployeePromotionRequestResult,
  DecideHrEmployeePromotionRequest,
  HrEmployeePromotionDecisionResult,
  HrEmployeePromotionRequestDirectory,
  HrEmployeePromotionRequestDirectoryQuery,
  HrEmployeePromotionRequestReview,
  CreateHrEmployeeManagerChangeRequest,
  HrEmployeeManagerChangeRequestResult,
  DecideHrEmployeeManagerChangeRequest,
  HrEmployeeManagerChangeDecisionResult,
  HrEmployeeManagerChangeRequestDirectory,
  HrEmployeeManagerChangeRequestDirectoryQuery,
  HrEmployeeManagerChangeRequestReview,
  CreateHrEmployeeWorkLocationChangeRequest,
  HrEmployeeWorkLocationChangeRequestResult,
  DecideHrEmployeeWorkLocationChangeRequest,
  HrEmployeeWorkLocationChangeDecisionResult,
  HrEmployeeWorkLocationChangeRequestDirectory,
  HrEmployeeWorkLocationChangeRequestDirectoryQuery,
  HrEmployeeWorkLocationChangeRequestReview,
  CreateHrEmployeeOrganizationPlacementChangeRequest,
  HrEmployeeOrganizationPlacementChangeRequestResult,
  DecideHrEmployeeOrganizationPlacementChangeRequest,
  HrEmployeeOrganizationPlacementChangeDecisionResult,
  HrEmployeeOrganizationPlacementChangeRequestDirectory,
  HrEmployeeOrganizationPlacementChangeRequestDirectoryQuery,
  HrEmployeeOrganizationPlacementChangeRequestReview,
  HrOrganizationPlacementSnapshot,
} from "@nexora/contracts";
import type { Pool, PoolClient } from "pg";

import { ApprovalOverrideWriterError, writeApprovalOverrideEvent } from "../security/approval-override-writer.js";

export class HrApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export interface HrActorContext {
  tenantId: string;
  actor: AuthenticatedAccount;
  realActorId?: string;
  impersonationRequestId?: string;
}

type EmployeeSummaryRow = Omit<HrEmployeeDirectory["items"][number], "joined_on"> & { joined_on: string | Date };
type EmployeeDetailRow = Omit<HrEmployeeDetail, "joined_on" | "reporting_manager"> & {
  joined_on: string | Date;
  reporting_manager_id: string | null;
  reporting_manager_number: string | null;
  reporting_manager_name: string | null;
};
type EmployeeAssignmentRow = Omit<
  HrEmployeeAssignmentDirectory["items"][number],
  "effective_from" | "effective_to" | "created_at"
> & {
  effective_from: string | Date;
  effective_to: string | Date | null;
  created_at: string | Date;
};
type EmployeeStatusHistoryRow = Omit<
  HrEmployeeStatusHistoryDirectory["items"][number],
  "effective_on" | "created_at"
> & {
  effective_on: string | Date;
  created_at: string | Date;
};
type EmployeeLifecycleEventRow = Omit<
  HrEmployeeLifecycleEventDirectory["items"][number],
  "effective_on" | "recorded_at" | "approved_at"
> & {
  effective_on: string | Date;
  recorded_at: string | Date;
  approved_at: string | Date;
};
type EmployeeProfileVersionRow = Omit<
  HrEmployeeProfileVersionDirectory["items"][number],
  "effective_from" | "effective_to" | "recorded_at" | "capture_origin"
> & {
  effective_from: string | Date;
  effective_to: string | Date | null;
  recorded_at: string | Date;
};
type EmploymentLifecyclePolicyRow = Omit<
  HrEmploymentLifecyclePolicyDirectory["items"][number],
  "effective_from" | "effective_to" | "self_decision_requires_override" | "super_admin_override_allowed"
> & {
  effective_from: string | Date;
  effective_to: string | Date | null;
  created_by: string;
  submitted_by: string | null;
};
type EmployeeHireRequestReviewRow = Omit<
  HrEmployeeHireRequestReview,
  "effective_on" | "requested_at" | "decided_at"
> & {
  effective_on: string | Date;
  requested_at: string | Date;
  decided_at: string | Date | null;
};
type EmployeeTransferRequestReviewRow = Omit<
  HrEmployeeTransferRequestReview,
  "effective_on" | "requested_at" | "decided_at"
> & {
  effective_on: string | Date;
  requested_at: string | Date;
  decided_at: string | Date | null;
};
type EmployeePromotionRequestReviewRow = Omit<
  HrEmployeePromotionRequestReview,
  "effective_on" | "requested_at" | "decided_at"
> & {
  effective_on: string | Date;
  requested_at: string | Date;
  decided_at: string | Date | null;
};
type EmployeeManagerChangeRequestReviewRow = Omit<
  HrEmployeeManagerChangeRequestReview,
  "effective_on" | "requested_at" | "decided_at"
> & {
  effective_on: string | Date;
  requested_at: string | Date;
  decided_at: string | Date | null;
};
type EmployeeWorkLocationChangeRequestReviewRow = Omit<
  HrEmployeeWorkLocationChangeRequestReview,
  "effective_on" | "requested_at" | "decided_at"
> & {
  effective_on: string | Date;
  requested_at: string | Date;
  decided_at: string | Date | null;
};
type EmployeeOrganizationPlacementChangeRequestReviewRow = Omit<
  HrEmployeeOrganizationPlacementChangeRequestReview,
  "effective_on" | "requested_at" | "decided_at"
> & {
  effective_on: string | Date;
  requested_at: string | Date;
  decided_at: string | Date | null;
};

function dateOnly(value: string | Date): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : value.slice(0, 10);
}

function employeeSummary(row: EmployeeSummaryRow): HrEmployeeDirectory["items"][number] {
  return { ...row, joined_on: dateOnly(row.joined_on) };
}

function approvalOverrideReviewMetadata(
  context: HrActorContext,
  makerActorIds: readonly string[],
  normalDecisionPermission: string,
): { self_decision_requires_override: boolean; super_admin_override_allowed: boolean } {
  const selfDecisionRequiresOverride = makerActorIds.includes(context.actor.userId);
  const policy = evaluateApprovalActor({
    account: context.actor,
    makerActorIds,
    normalDecisionPermission,
    impersonated: Boolean(
      context.impersonationRequestId ||
      (context.realActorId !== undefined && context.realActorId !== context.actor.userId),
    ),
  });
  return {
    self_decision_requires_override: selfDecisionRequiresOverride,
    super_admin_override_allowed: selfDecisionRequiresOverride && policy.kind === "override",
  };
}

function employeeHireRequestReview(
  row: EmployeeHireRequestReviewRow,
  context: HrActorContext,
): HrEmployeeHireRequestReview {
  return {
    ...row,
    effective_on: dateOnly(row.effective_on),
    requested_at: new Date(row.requested_at).toISOString(),
    decided_at: row.decided_at === null ? null : new Date(row.decided_at).toISOString(),
    ...approvalOverrideReviewMetadata(context, [row.requested_by], "hr.employment_lifecycle.approve"),
  };
}

function employeeTransferRequestReview(
  row: EmployeeTransferRequestReviewRow,
  context: HrActorContext,
): HrEmployeeTransferRequestReview {
  return {
    ...row,
    effective_on: dateOnly(row.effective_on),
    requested_at: new Date(row.requested_at).toISOString(),
    decided_at: row.decided_at === null ? null : new Date(row.decided_at).toISOString(),
    ...approvalOverrideReviewMetadata(context, [row.requested_by], "hr.employee_assignment.change"),
  };
}

function employeePromotionRequestReview(
  row: EmployeePromotionRequestReviewRow,
  context: HrActorContext,
): HrEmployeePromotionRequestReview {
  return {
    ...row,
    effective_on: dateOnly(row.effective_on),
    requested_at: new Date(row.requested_at).toISOString(),
    decided_at: row.decided_at === null ? null : new Date(row.decided_at).toISOString(),
    ...approvalOverrideReviewMetadata(context, [row.requested_by], "hr.employee_assignment.change"),
  };
}

function employeeManagerChangeRequestReview(
  row: EmployeeManagerChangeRequestReviewRow,
  context: HrActorContext,
): HrEmployeeManagerChangeRequestReview {
  return {
    ...row,
    effective_on: dateOnly(row.effective_on),
    requested_at: new Date(row.requested_at).toISOString(),
    decided_at: row.decided_at === null ? null : new Date(row.decided_at).toISOString(),
    ...approvalOverrideReviewMetadata(context, [row.requested_by], "hr.employee_assignment.change"),
  };
}

function employeeWorkLocationChangeRequestReview(
  row: EmployeeWorkLocationChangeRequestReviewRow,
  context: HrActorContext,
): HrEmployeeWorkLocationChangeRequestReview {
  return {
    ...row,
    effective_on: dateOnly(row.effective_on),
    requested_at: new Date(row.requested_at).toISOString(),
    decided_at: row.decided_at === null ? null : new Date(row.decided_at).toISOString(),
    ...approvalOverrideReviewMetadata(context, [row.requested_by], "hr.employee_assignment.change"),
  };
}

function employeeOrganizationPlacementChangeRequestReview(
  row: EmployeeOrganizationPlacementChangeRequestReviewRow,
  context: HrActorContext,
): HrEmployeeOrganizationPlacementChangeRequestReview {
  return {
    ...row,
    effective_on: dateOnly(row.effective_on),
    requested_at: new Date(row.requested_at).toISOString(),
    decided_at: row.decided_at === null ? null : new Date(row.decided_at).toISOString(),
    ...approvalOverrideReviewMetadata(context, [row.requested_by], "hr.employee_assignment.change"),
  };
}

function canonicalValue(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonicalValue(child)]),
    );
  }
  return value;
}

function stateHash(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(canonicalValue(value)), "utf8")
    .digest("hex");
}

function validIdempotencyKey(value: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._:-]{0,254}$/.test(value);
}

type EmployeeHistoryCursor = { version: 1; kind: "lifecycle" | "profile"; recordedAt: string; id: string };

function encodeEmployeeHistoryCursor(
  kind: EmployeeHistoryCursor["kind"],
  recordedAt: string | Date,
  id: string,
): string {
  return Buffer.from(
    JSON.stringify({ version: 1, kind, recordedAt: new Date(recordedAt).toISOString(), id }),
    "utf8",
  ).toString("base64url");
}

function decodeEmployeeHistoryCursor(
  value: string | undefined,
  expectedKind: EmployeeHistoryCursor["kind"],
): EmployeeHistoryCursor | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Partial<EmployeeHistoryCursor>;
    if (
      parsed.version !== 1 ||
      parsed.kind !== expectedKind ||
      typeof parsed.recordedAt !== "string" ||
      !Number.isFinite(Date.parse(parsed.recordedAt)) ||
      typeof parsed.id !== "string" ||
      parsed.id.length < 1 ||
      parsed.id.length > 128
    )
      throw new Error("invalid cursor");
    return parsed as EmployeeHistoryCursor;
  } catch {
    throw new HrApiError(400, "HR_HISTORY_CURSOR_INVALID", "The employee history cursor is invalid.");
  }
}

export class SourceHrRepository {
  constructor(private readonly pool: Pool) {}

  async listCompanies(context: HrActorContext): Promise<HrCompanyDirectory> {
    return this.read(
      context,
      [
        "hr.employee.read",
        "hr.employee.create",
        "hr.employee.submit",
        "hr.employee.approve",
        "hr.employee_contact.read",
        "hr.employee_contact.manage",
        "hr.employee_emergency_contact.read",
        "hr.employee_emergency_contact.manage",
        "hr.employee_document.read",
        "hr.employee_document.manage",
        "hr.employee_assignment.read",
        "hr.employment_history.read",
        "hr.employment_lifecycle_policy.read",
        "hr.employment_lifecycle_policy.manage",
        "hr.employment_lifecycle_policy.approve",
        "hr.employment_lifecycle.action",
        "hr.employment_relationship.create",
        "hr.employee_assignment.transfer",
        "hr.employee_assignment.change",
        "hr.payroll.period.read",
        "hr.payroll.result.read",
        "hr.payroll.report.read",
        "hr.payroll.payment.read",
      ],
      async (client) => {
        const result = await client.query<HrCompanyDirectory["items"][number]>(
          `select company.id, company.code, company.name
           from organization_unit company
           join security_user_company_access access
             on access.tenant_id = company.tenant_id and access.company_id = company.id
          where company.tenant_id = $1 and access.user_id = $2 and access.revoked_at is null
            and company.type = 'company' and company.status = 'active'
          order by company.name, company.code, company.id
          limit 100`,
          [context.tenantId, context.actor.userId],
        );
        return { items: result.rows };
      },
    );
  }

  async listOrganizationUnits(
    context: HrActorContext,
    query: HrOrganizationUnitDirectoryQuery,
  ): Promise<HrOrganizationUnitDirectory> {
    return this.read(
      context,
      [
        "hr.organization.read",
        "hr.employee_assignment.read",
        "hr.employee_assignment.create",
        "hr.employee_assignment.transfer",
        "hr.employee_assignment.change",
      ],
      async (client) => {
        await this.requireCompanyAccess(client, context, query.company_id);
        const values: unknown[] = [context.tenantId, query.company_id];
        const filters = ["unit.id<>$2", "unit.type in ('business_unit','division','branch','department','warehouse')"];
        if (!query.include_inactive) filters.push("unit.status='active'");
        if (query.type) filters.push(`unit.type=$${values.push(query.type)}`);
        values.push(query.limit);
        const result = await client.query<HrOrganizationUnitDirectory["items"][number]>(
          `with recursive company_tree as (
           select id,parent_id,type,code,name,status,created_at
             from organization_unit
            where tenant_id=$1 and id=$2 and type='company' and status='active'
           union all
           select child.id,child.parent_id,child.type,child.code,child.name,child.status,child.created_at
             from organization_unit child
             join company_tree parent on child.parent_id=parent.id
            where child.tenant_id=$1
         )
         select unit.id,unit.parent_id,unit.type,unit.code,unit.name,unit.status,unit.created_at,
                (select concat_ws(' ',employee.first_name,employee.last_name)
                   from hr_organization_head_assignment head_assignment
                   join employee on employee.tenant_id=head_assignment.tenant_id and employee.id=head_assignment.employee_id
                  where head_assignment.tenant_id=$1 and head_assignment.organization_unit_id=unit.id
                    and head_assignment.effective_from<=current_date
                    and (head_assignment.effective_to_exclusive is null or head_assignment.effective_to_exclusive>current_date)
                  order by head_assignment.effective_from desc limit 1) as head_name,
                (select count(*)::int from employee_assignment assignment
                  join employee_assignment_org_unit placement
                    on placement.tenant_id=assignment.tenant_id and placement.assignment_id=assignment.id
                  where assignment.tenant_id=$1 and assignment.company_id=$2
                    and assignment.assignment_status in ('active','legacy_compatibility')
                    and assignment.effective_from<=current_date
                    and (assignment.effective_to is null or assignment.effective_to>=current_date)
                    and placement.organization_unit_id=unit.id) as employee_count
           from company_tree unit
          where ${filters.join(" and ")}
          order by unit.type,unit.name,unit.code,unit.id
          limit $${values.length}`,
          values,
        );
        return { items: result.rows };
      },
    );
  }

  async createOrganizationUnit(
    context: HrActorContext,
    input: CreateHrOrganizationUnitRequest,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<HrOrganizationUnitMutationResult> {
    return this.mutateOrganizationUnit(context, "create", undefined, input, idempotencyKey, correlationId);
  }

  async updateOrganizationUnit(
    context: HrActorContext,
    unitId: string,
    input: UpdateHrOrganizationUnitRequest,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<HrOrganizationUnitMutationResult> {
    return this.mutateOrganizationUnit(context, "update", unitId, input, idempotencyKey, correlationId);
  }

  async changeOrganizationUnitStatus(
    context: HrActorContext,
    unitId: string,
    input: ChangeHrOrganizationUnitStatusRequest,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<HrOrganizationUnitMutationResult> {
    return this.mutateOrganizationUnit(context, "status", unitId, input, idempotencyKey, correlationId);
  }

  private async mutateOrganizationUnit(
    context: HrActorContext,
    operation: "create" | "update" | "status",
    unitId: string | undefined,
    input: CreateHrOrganizationUnitRequest | UpdateHrOrganizationUnitRequest | ChangeHrOrganizationUnitStatusRequest,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<HrOrganizationUnitMutationResult> {
    if (!validIdempotencyKey(idempotencyKey))
      throw new HrApiError(400, "INVALID_IDEMPOTENCY_KEY", "The idempotency key is invalid.");
    if (!context.actor.permissions.includes("hr.organization.update"))
      throw new HrApiError(403, "PERMISSION_DENIED", "You are not permitted to maintain the organization structure.");
    const client = await this.pool.connect();
    const path = operation === "create" ? "/api/v1/hr/organization_units" : `/api/v1/hr/organization_units/${unitId}/${operation}`;
    try {
      await client.query("begin isolation level read committed");
      await client.query("select set_config('nexora.tenant_id',$1,true)", [context.tenantId]);
      await this.requireCompanyAccess(client, context, input.company_id);
      const fingerprint = stateHash({ unitId, input });
      const replay = await client.query<{ request_fingerprint: string; response_body: HrOrganizationUnitMutationResult }>(
        `select request_fingerprint,response_body from platform_admin_idempotency where tenant_id=$1 and actor_id=$2 and method='POST' and path=$3 and idempotency_key=$4 for update`,
        [context.tenantId, context.actor.userId, path, idempotencyKey],
      );
      if (replay.rows[0]) {
        if (replay.rows[0].request_fingerprint !== fingerprint)
          throw new HrApiError(409, "IDEMPOTENCY_CONFLICT", "The idempotency key was already used for another request.");
        await client.query("commit");
        return { ...replay.rows[0].response_body, replayed: true };
      }
      const before = unitId
        ? (await client.query(`select id,parent_id,type,code,name,status from organization_unit where tenant_id=$1 and id=$2 for update`, [context.tenantId, unitId])).rows[0]
        : null;
      if (unitId && !before) throw new HrApiError(404, "HR_ORGANIZATION_UNIT_NOT_FOUND", "Organization unit was not found.");
      if (before?.type === "company") throw new HrApiError(409, "HR_COMPANY_ADMIN_REQUIRED", "Company records are maintained by platform administration.");
      let id = unitId;
      if (operation === "create") {
        const create = input as CreateHrOrganizationUnitRequest;
        const parentType = await this.requireOrganizationParent(client, context, create.company_id, create.parent_id);
        this.assertOrganizationParentType(create.type, parentType);
        id = `org-${randomUUID()}`;
        await client.query(
          `insert into organization_unit (id,tenant_id,parent_id,type,code,name,status) values ($1,$2,$3,$4,$5,$6,'active')`,
          [id, context.tenantId, create.parent_id, create.type, create.code.toUpperCase(), create.name],
        );
      } else if (operation === "update") {
        const update = input as UpdateHrOrganizationUnitRequest;
        const parentType = await this.requireOrganizationParent(client, context, update.company_id, update.parent_id);
        this.assertOrganizationParentType(before.type, parentType);
        await client.query(`update organization_unit set parent_id=$3,code=$4,name=$5,updated_at=now() where tenant_id=$1 and id=$2`, [context.tenantId, unitId, update.parent_id, update.code.toUpperCase(), update.name]);
      } else {
        const change = input as ChangeHrOrganizationUnitStatusRequest;
        if (change.status === "inactive") {
          const usage = await client.query<{ used: boolean }>(
            `select exists(select 1 from organization_unit where tenant_id=$1 and parent_id=$2 and status='active')
                 or exists(select 1 from employee_assignment assignment
                   join employee_assignment_org_unit placement on placement.tenant_id=assignment.tenant_id and placement.assignment_id=assignment.id
                  where assignment.tenant_id=$1 and assignment.assignment_status in ('active','legacy_compatibility')
                    and assignment.effective_from<=current_date and (assignment.effective_to is null or assignment.effective_to>=current_date)
                    and placement.organization_unit_id=$2) as used`,
            [context.tenantId, unitId],
          );
          if (usage.rows[0]?.used) throw new HrApiError(409, "HR_ORGANIZATION_UNIT_IN_USE", "Move active children and employee assignments before deactivating this unit.");
        } else if (before?.parent_id) {
          await this.requireOrganizationParent(client, context, change.company_id, before.parent_id);
        }
        await client.query(`update organization_unit set status=$3,updated_at=now() where tenant_id=$1 and id=$2`, [context.tenantId, unitId, change.status]);
      }
      const after = (await client.query(`select id,parent_id,type,code,name,status from organization_unit where tenant_id=$1 and id=$2`, [context.tenantId, id])).rows[0];
      const audit = await this.appendPlatformAudit(client, context, correlationId, `hr.organization.${operation}`, { entityId: id!, entityType: "organization_unit", before, after });
      const result = { id: id!, company_id: input.company_id, audit_event_id: audit, replayed: false };
      await client.query(
        `insert into platform_admin_idempotency (tenant_id,actor_id,method,path,idempotency_key,request_fingerprint,response_status,response_body,response_etag) values ($1,$2,'POST',$3,$4,$5,200,$6,$7)`,
        [context.tenantId, context.actor.userId, path, idempotencyKey, fingerprint, result, stateHash(result)],
      );
      await client.query("commit");
      return result;
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
      if (code === "23505") throw new HrApiError(409, "HR_ORGANIZATION_UNIT_CODE_EXISTS", "That organization-unit code is already in use.");
      if (["23503", "23514"].includes(code)) throw new HrApiError(409, "HR_ORGANIZATION_HIERARCHY_INVALID", "The requested hierarchy change is invalid.");
      throw error;
    } finally {
      client.release();
    }
  }

  private async requireOrganizationParent(client: PoolClient, context: HrActorContext, companyId: string, parentId: string): Promise<string> {
    const parent = await client.query<{ id: string; type: string }>(
      `with recursive tree as (select id,parent_id,type,status from organization_unit where tenant_id=$1 and id=$2 and type='company'
        union all select child.id,child.parent_id,child.type,child.status from organization_unit child join tree parent on child.parent_id=parent.id where child.tenant_id=$1)
       select id,type from tree where id=$3 and status='active'`,
      [context.tenantId, companyId, parentId],
    );
    if (!parent.rows[0]) throw new HrApiError(409, "HR_ORGANIZATION_PARENT_INVALID", "The parent must be an active unit inside the selected company.");
    return parent.rows[0].type;
  }

  private assertOrganizationParentType(childType: string, parentType: string): void {
    const allowedParents: Record<string, readonly string[]> = {
      business_unit: ["company"],
      division: ["company", "business_unit"],
      branch: ["company", "business_unit", "division"],
      department: ["company", "business_unit", "division", "branch"],
      warehouse: ["company", "business_unit", "division", "branch"],
    };
    if (!allowedParents[childType]?.includes(parentType))
      throw new HrApiError(409, "HR_ORGANIZATION_PARENT_TYPE_INVALID", `A ${childType} cannot report to a ${parentType}.`);
  }

  async listEmployees(context: HrActorContext, query: HrEmployeeDirectoryQuery): Promise<HrEmployeeDirectory> {
    return this.read(context, "hr.employee.read", async (client) => {
      await this.requireCompanyAccess(client, context, query.company_id);
      const values: unknown[] = [context.tenantId, query.company_id];
      const filters = [
        "employee.tenant_id = $1",
        `assignment.company_id = $2`,
        "assignment.effective_from <= current_date",
        "(assignment.effective_to is null or assignment.effective_to >= current_date)",
      ];
      if (query.status) filters.push(`employee.status = $${values.push(query.status)}`);
      if (query.search) {
        const parameter = values.push(`%${query.search.replace(/[\\%_]/g, "\\$&")}%`);
        filters.push(
          `(employee.employee_number ilike $${parameter} escape '\\' or concat_ws(' ', employee.first_name, employee.middle_name, employee.last_name) ilike $${parameter} escape '\\')`,
        );
      }
      values.push(query.limit);
      const result = await client.query<EmployeeSummaryRow>(
        `select employee.id, employee.employee_number,
                concat_ws(' ', employee.first_name, employee.middle_name, employee.last_name) as display_name,
                employee.work_email, employee.status, employee.joined_on,
                assignment.company_id, assignment.branch_id, branch.name as branch,
                assignment.department_id, department.name as department,
                designation.name as designation
           from employee
           join employee_assignment assignment
             on assignment.tenant_id = employee.tenant_id and assignment.employee_id = employee.id
           join organization_unit branch
             on branch.tenant_id = assignment.tenant_id and branch.id = assignment.branch_id
           join organization_unit department
             on department.tenant_id = assignment.tenant_id and department.id = assignment.department_id
           join hr_master_record designation
             on designation.tenant_id = assignment.tenant_id and designation.id = assignment.designation_id
          where ${filters.join(" and ")}
          order by employee.last_name, employee.first_name, employee.employee_number, employee.id
          limit $${values.length}`,
        values,
      );
      return { items: result.rows.map(employeeSummary) };
    });
  }

  async getDashboard(context: HrActorContext, companyId: string): Promise<HrDashboardSummary> {
    return this.read(context, "hr.employee.read", async (client) => {
      await this.requireCompanyAccess(client, context, companyId);
      const summary = await client.query<{
        active_headcount: number;
        draft_profiles: number;
        pending_employee_approvals: number;
        pending_movements: number;
        active_departments: number;
        recent_joiners: number;
        master_configuration_gaps: number;
      }>(
        `with recursive org_tree as (
           select id,parent_id,type,status from organization_unit where tenant_id=$1 and id=$2 and type='company'
           union all
           select child.id,child.parent_id,child.type,child.status
             from organization_unit child join org_tree parent on child.parent_id=parent.id
            where child.tenant_id=$1
         ), current_people as (
           select distinct employee.id,employee.status,employee.joined_on
             from employee
             join employee_assignment assignment on assignment.tenant_id=employee.tenant_id and assignment.employee_id=employee.id
            where employee.tenant_id=$1 and assignment.company_id=$2
              and assignment.assignment_status in ('active','legacy_compatibility')
              and assignment.effective_from<=current_date
              and (assignment.effective_to is null or assignment.effective_to>=current_date)
         )
         select
           (select count(*)::int from current_people where status in ('active','probation','confirmed','suspended')) as active_headcount,
           (select count(*)::int from hr_employee_draft_scope scope join employee on employee.tenant_id=scope.tenant_id and employee.id=scope.employee_id where scope.tenant_id=$1 and scope.company_id=$2 and employee.status='draft') as draft_profiles,
           (select count(*)::int from hr_employee_draft_approval approval join hr_employee_draft_scope scope on scope.tenant_id=approval.tenant_id and scope.employee_id=approval.employee_id where approval.tenant_id=$1 and scope.company_id=$2 and approval.state='pending') as pending_employee_approvals,
           ((select count(*) from hr_employment_lifecycle_request request join hr_employment_relationship relationship on relationship.tenant_id=request.tenant_id and relationship.id=request.relationship_id where request.tenant_id=$1 and relationship.legal_employer_id=$2 and request.approval_state='pending')
            +(select count(*) from hr_employee_transfer_request where tenant_id=$1 and company_id=$2 and request_state='pending')
            +(select count(*) from hr_employee_promotion_request where tenant_id=$1 and company_id=$2 and request_state='pending')
            +(select count(*) from hr_employee_manager_change_request where tenant_id=$1 and company_id=$2 and request_state='pending')
            +(select count(*) from hr_employee_work_location_change_request where tenant_id=$1 and company_id=$2 and request_state='pending')
            +(select count(*) from hr_employee_organization_placement_change_request where tenant_id=$1 and company_id=$2 and request_state='pending'))::int as pending_movements,
           (select count(*)::int from org_tree where type='department' and status='active') as active_departments,
           (select count(*)::int from current_people where joined_on>=current_date-interval '90 days') as recent_joiners,
           (select count(*)::int from hr_master_record where tenant_id=$1 and company_id=$2 and master_type in ('cost_center','work_location','employment_type','employee_category') and status='active' and configuration_value is null) as master_configuration_gaps`,
        [context.tenantId, companyId],
      );
      const metrics = summary.rows[0]!;
      const distribution = await client.query<{ status: string; count: number }>(
        `select employee.status,count(distinct employee.id)::int as count
           from employee join employee_assignment assignment on assignment.tenant_id=employee.tenant_id and assignment.employee_id=employee.id
          where employee.tenant_id=$1 and assignment.company_id=$2
            and assignment.assignment_status in ('active','legacy_compatibility')
            and assignment.effective_from<=current_date and (assignment.effective_to is null or assignment.effective_to>=current_date)
          group by employee.status order by employee.status`,
        [context.tenantId, companyId],
      );
      return {
        company_id: companyId,
        generated_at: new Date().toISOString(),
        metrics,
        status_distribution: distribution.rows,
        action_items: [
          { key: "drafts", label: "Draft employee profiles", count: metrics.draft_profiles, page_id: "employee-drafts", tone: metrics.draft_profiles ? "attention" : "neutral" },
          { key: "approvals", label: "Employee approvals", count: metrics.pending_employee_approvals, page_id: "employee-approvals", tone: metrics.pending_employee_approvals ? "attention" : "neutral" },
          { key: "movements", label: "Movement approvals", count: metrics.pending_movements, page_id: "employee-approvals", tone: metrics.pending_movements ? "attention" : "neutral" },
          { key: "configuration", label: "Master configuration gaps", count: metrics.master_configuration_gaps, page_id: "work-locations", tone: metrics.master_configuration_gaps ? "attention" : "neutral" },
        ],
      };
    });
  }

  async getFinancePayrollDashboard(
    context: HrActorContext,
    companyId: string,
  ): Promise<HrFinancePayrollDashboard> {
    return this.read(
      context,
      ["hr.payroll.report.read", "hr.payroll.period.read", "hr.payroll.result.read"],
      async (client) => {
        await this.requireCompanyAccess(client, context, companyId);
        const metricsResult = await client.query<{
          current_employees: number;
          salary_covered_employees: number;
          salary_gaps: number;
          total_periods: number;
          review_queue: number;
          journal_queue: number;
          payment_exceptions: number;
        }>(
          `with current_people as (
             select distinct assignment.employee_id
               from employee_assignment assignment
              where assignment.tenant_id=$1 and assignment.company_id=$2
                and assignment.assignment_status in ('active','legacy_compatibility')
                and assignment.effective_from<=current_date
                and (assignment.effective_to is null or assignment.effective_to>=current_date)
           ), salary_covered as (
             select distinct salary.employee_id
               from hr_salary_assignment salary join current_people person on person.employee_id=salary.employee_id
              where salary.tenant_id=$1 and salary.company_id=$2
                and salary.state in ('approved','effective')
                and salary.effective_from<=current_date
                and (salary.effective_to is null or salary.effective_to>=current_date)
           )
           select
             (select count(*)::int from current_people) as current_employees,
             (select count(*)::int from salary_covered) as salary_covered_employees,
             ((select count(*) from current_people)-(select count(*) from salary_covered))::int as salary_gaps,
             (select count(*)::int from hr_payroll_period where tenant_id=$1 and company_id=$2) as total_periods,
             (select count(*)::int from hr_payroll_period where tenant_id=$1 and company_id=$2 and state in ('calculated','under_review')) as review_queue,
             (select count(*)::int from hr_payroll_period period
                where period.tenant_id=$1 and period.company_id=$2 and period.state in ('approved','posting_ready')
                  and not exists (select 1 from hr_payroll_journal_proposal proposal where proposal.tenant_id=period.tenant_id and proposal.period_id=period.id and proposal.state='posted')) as journal_queue,
             ((select count(*) from hr_payroll_payment_batch where tenant_id=$1 and company_id=$2 and state in ('failed','rejected'))
               +(select count(*) from hr_payroll_payment payment join hr_payroll_payment_batch batch on batch.tenant_id=payment.tenant_id and batch.id=payment.batch_id
                  where payment.tenant_id=$1 and batch.company_id=$2 and payment.state='failed'))::int as payment_exceptions`,
          [context.tenantId, companyId],
        );
        const periods = await client.query<{
          id: string;
          month: string | Date;
          state: HrFinancePayrollDashboard["recent_periods"][number]["state"];
          run_number: number;
          currency_code: string;
          employee_count: number;
          gross: string;
          deductions: string;
          net: string;
          warning_count: number;
          journal_state: HrFinancePayrollDashboard["recent_periods"][number]["journal_state"];
          journal_balanced: boolean | null;
          payment_state: string | null;
          payment_count: number;
          confirmed_payment_count: number;
          payment_total: string;
        }>(
          `select period.id,period.month,period.state,period.run_number,policy.currency_code,
                  coalesce(result.employee_count,0)::int as employee_count,
                  coalesce(result.gross,0)::text as gross,
                  coalesce(result.deductions,0)::text as deductions,
                  coalesce(result.net,0)::text as net,
                  coalesce(result.warning_count,0)::int as warning_count,
                  proposal.state as journal_state,
                  case when proposal.id is null then null
                       else coalesce(journal.line_count>=2 and journal.debit_total=journal.credit_total,false)
                  end as journal_balanced,
                  batch.state as payment_state,
                  coalesce(payment.payment_count,0)::int as payment_count,
                  coalesce(payment.confirmed_payment_count,0)::int as confirmed_payment_count,
                  coalesce(payment.payment_total,0)::text as payment_total
             from hr_payroll_period period
             join hr_payroll_policy policy on policy.tenant_id=period.tenant_id and policy.id=period.policy_id
             left join lateral (
               select count(*)::int as employee_count,coalesce(sum(gross),0) as gross,
                      coalesce(sum(deductions),0) as deductions,coalesce(sum(net),0) as net,
                      coalesce(sum(jsonb_array_length(warnings)),0)::int as warning_count
                 from hr_payroll_result
                where tenant_id=period.tenant_id and period_id=period.id and run_number=period.run_number
             ) result on true
             left join hr_payroll_journal_proposal proposal
               on proposal.tenant_id=period.tenant_id and proposal.period_id=period.id
             left join lateral (
               select count(*)::int as line_count,coalesce(sum(debit),0) as debit_total,coalesce(sum(credit),0) as credit_total
                 from hr_payroll_journal_line
                where tenant_id=proposal.tenant_id and proposal_id=proposal.id
             ) journal on proposal.id is not null
             left join lateral (
               select candidate.id,candidate.state from hr_payroll_payment_batch candidate
                where candidate.tenant_id=period.tenant_id and candidate.period_id=period.id
                  and candidate.state not in ('rejected','cancelled')
                order by candidate.created_at desc,candidate.id desc limit 1
             ) batch on true
             left join lateral (
               select count(*)::int as payment_count,
                      count(*) filter (where state in ('confirmed','paid'))::int as confirmed_payment_count,
                      coalesce(sum(amount),0) as payment_total
                 from hr_payroll_payment where tenant_id=period.tenant_id and batch_id=batch.id
             ) payment on batch.id is not null
            where period.tenant_id=$1 and period.company_id=$2
            order by period.month desc,period.created_at desc,period.id desc limit 6`,
          [context.tenantId, companyId],
        );
        const recentPeriods = periods.rows.map((period) => ({
          ...period,
          month: dateOnly(period.month),
          gross: String(period.gross),
          deductions: String(period.deductions),
          net: String(period.net),
          payment_total: String(period.payment_total),
        }));
        return {
          company_id: companyId,
          generated_at: new Date().toISOString(),
          metrics: metricsResult.rows[0]!,
          latest_period: recentPeriods[0] ?? null,
          recent_periods: recentPeriods,
        };
      },
    );
  }

  async getPositionsOrganization(
    context: HrActorContext,
    query: HrPositionsOrganizationQuery,
  ): Promise<HrPositionsOrganization> {
    return this.read(
      context,
      ["hr.organization.read", "hr.employee_assignment.read", "hr.employee.read"],
      async (client) => {
        await this.requireCompanyAccess(client, context, query.company_id);
        const values: unknown[] = [context.tenantId, query.company_id];
        const filters = [
          "assignment.tenant_id=$1",
          "assignment.company_id=$2",
          "assignment.assignment_status in ('active','legacy_compatibility')",
          "assignment.effective_from<=current_date",
          "(assignment.effective_to is null or assignment.effective_to>=current_date)",
        ];
        if (query.search) {
          const parameter = values.push(`%${query.search.replace(/[\\%_]/g, "\\$&")}%`);
          filters.push(
            `(employee.employee_number ilike $${parameter} escape '\\' or concat_ws(' ',employee.first_name,employee.middle_name,employee.last_name) ilike $${parameter} escape '\\' or job.name ilike $${parameter} escape '\\' or designation.name ilike $${parameter} escape '\\' or department.name ilike $${parameter} escape '\\')`,
          );
        }
        values.push(query.limit);
        const items = await client.query<{
          assignment_id: string;
          employee_id: string;
          employee_number: string;
          employee_name: string;
          employee_status: HrPositionsOrganization["items"][number]["employee_status"];
          branch_id: string;
          branch: string;
          department_id: string;
          department: string;
          job: string;
          designation: string;
          job_grade: string;
          reporting_manager: string | null;
          effective_from: string | Date;
        }>(
          `select assignment.id as assignment_id,employee.id as employee_id,employee.employee_number,
                  concat_ws(' ',employee.first_name,employee.middle_name,employee.last_name) as employee_name,
                  employee.status as employee_status,assignment.branch_id,branch.name as branch,
                  assignment.department_id,department.name as department,job.name as job,
                  designation.name as designation,job_grade.name as job_grade,
                  nullif(concat_ws(' ',manager.first_name,manager.middle_name,manager.last_name),'') as reporting_manager,
                  assignment.effective_from
             from employee_assignment assignment
             join employee on employee.tenant_id=assignment.tenant_id and employee.id=assignment.employee_id
             join organization_unit branch on branch.tenant_id=assignment.tenant_id and branch.id=assignment.branch_id
             join organization_unit department on department.tenant_id=assignment.tenant_id and department.id=assignment.department_id
             join hr_master_record job on job.tenant_id=assignment.tenant_id and job.id=assignment.job_id
             join hr_master_record designation on designation.tenant_id=assignment.tenant_id and designation.id=assignment.designation_id
             join hr_master_record job_grade on job_grade.tenant_id=assignment.tenant_id and job_grade.id=assignment.job_grade_id
             left join employee manager on manager.tenant_id=assignment.tenant_id and manager.id=assignment.reporting_manager_id
            where ${filters.join(" and ")}
            order by department.name,job.name,designation.name,employee.last_name,employee.first_name,employee.id
            limit $${values.length}`,
          values,
        );
        const departments = await client.query<HrPositionsOrganization["departments"][number]>(
          `select assignment.department_id,department.name as department,
                  count(distinct assignment.employee_id)::int as active_people,
                  count(distinct assignment.job_id)::int as job_count,
                  count(distinct assignment.reporting_manager_id)::int as manager_count
             from employee_assignment assignment
             join organization_unit department on department.tenant_id=assignment.tenant_id and department.id=assignment.department_id
            where assignment.tenant_id=$1 and assignment.company_id=$2
              and assignment.assignment_status in ('active','legacy_compatibility')
              and assignment.effective_from<=current_date
              and (assignment.effective_to is null or assignment.effective_to>=current_date)
            group by assignment.department_id,department.name
            order by active_people desc,department.name,assignment.department_id`,
          [context.tenantId, query.company_id],
        );
        const metrics = await client.query<HrPositionsOrganization["metrics"]>(
          `select count(distinct assignment.employee_id)::int as current_assignments,
                  count(distinct assignment.department_id)::int as active_departments,
                  count(distinct assignment.job_id)::int as represented_jobs,
                  count(distinct assignment.reporting_manager_id)::int as reporting_managers,
                  count(distinct assignment.employee_id) filter (where assignment.reporting_manager_id is null)::int as without_manager
             from employee_assignment assignment
            where assignment.tenant_id=$1 and assignment.company_id=$2
              and assignment.assignment_status in ('active','legacy_compatibility')
              and assignment.effective_from<=current_date
              and (assignment.effective_to is null or assignment.effective_to>=current_date)`,
          [context.tenantId, query.company_id],
        );
        return {
          company_id: query.company_id,
          generated_at: new Date().toISOString(),
          metrics: metrics.rows[0]!,
          departments: departments.rows,
          items: items.rows.map((item) => ({ ...item, effective_from: dateOnly(item.effective_from) })),
        };
      },
    );
  }

  async listManpowerRequisitions(context: HrActorContext, query: HrManpowerRequisitionQuery): Promise<HrManpowerRequisitionDirectory> {
    return this.read(context, "hr.employee.read", async (client) => {
      await this.requireCompanyAccess(client, context, query.company_id);
      const values: unknown[] = [context.tenantId, query.company_id];
      const filters = ["request.tenant_id=$1", "request.company_id=$2"];
      if (query.state) { values.push(query.state); filters.push(`request.state=$${values.length}`); }
      if (query.search) { values.push(`%${query.search.replace(/[\\%_]/g, "\\$&")}%`); filters.push(`(request.reference ilike $${values.length} escape '\\' or request.job_title ilike $${values.length} escape '\\' or department.name ilike $${values.length} escape '\\')`); }
      values.push(query.limit);
      const result = await client.query<HrManpowerRequisitionDirectory["items"][number] & { salary_minimum: string; salary_maximum: string; submitted_at: Date | null; decided_at: Date | null; created_at: Date }>(
        `select request.id,request.company_id,request.reference,request.job_title,designation.name as designation,grade.name as job_grade,
                employment_type.name as employment_type,branch.name as branch,department.name as department,request.positions_requested,
                request.position_type,request.salary_minimum::text,request.salary_maximum::text,request.currency_code,request.target_start_date::text,
                request.reason,request.required_skills,request.state,request.created_by,request.submitted_by,request.submitted_at,request.decided_by,
                request.decided_at,request.decision_reason,request.created_at
           from hr_manpower_requisition request
           join hr_master_record designation on designation.tenant_id=request.tenant_id and designation.id=request.designation_id
           join hr_master_record grade on grade.tenant_id=request.tenant_id and grade.id=request.job_grade_id
           join hr_master_record employment_type on employment_type.tenant_id=request.tenant_id and employment_type.id=request.employment_type_id
           join organization_unit branch on branch.tenant_id=request.tenant_id and branch.id=request.branch_id
           join organization_unit department on department.tenant_id=request.tenant_id and department.id=request.department_id
          where ${filters.join(" and ")} order by request.created_at desc,request.id desc limit $${values.length}`,
        values,
      );
      return { items: result.rows.map((row) => ({ ...row, submitted_at: row.submitted_at?.toISOString() ?? null, decided_at: row.decided_at?.toISOString() ?? null, created_at: row.created_at.toISOString() })) };
    });
  }

  async createManpowerRequisition(context: HrActorContext, input: CreateHrManpowerRequisitionRequest, idempotencyKey: string, correlationId: string): Promise<HrManpowerRequisitionResult> {
    if (!validIdempotencyKey(idempotencyKey)) throw new HrApiError(400, "INVALID_IDEMPOTENCY_KEY", "The idempotency key is invalid.");
    if (!context.actor.permissions.includes("hr.employee.create")) throw new HrApiError(403, "PERMISSION_DENIED", "You are not permitted to create manpower requisitions.");
    const client = await this.pool.connect();
    try {
      await client.query("begin"); await client.query("select set_config('nexora.tenant_id',$1,true)", [context.tenantId]); await this.requireCompanyAccess(client, context, input.company_id);
      const path = "/api/v1/hr/manpower_requisitions", fingerprint = stateHash(input);
      const replay = await client.query<{request_fingerprint:string;response_body:HrManpowerRequisitionResult}>("select request_fingerprint,response_body from platform_admin_idempotency where tenant_id=$1 and actor_id=$2 and method='POST' and path=$3 and idempotency_key=$4 for update", [context.tenantId,context.actor.userId,path,idempotencyKey]);
      if (replay.rows[0]) { if (replay.rows[0].request_fingerprint!==fingerprint) throw new HrApiError(409,"IDEMPOTENCY_CONFLICT","The idempotency key was already used for another request."); await client.query("commit"); return {...replay.rows[0].response_body,replayed:true}; }
      const id=`manpower-requisition-${randomUUID()}`, reference=`MRQ-${new Date().getUTCFullYear()}-${randomUUID().replaceAll("-","").slice(0,6).toUpperCase()}`;
      await client.query(`insert into hr_manpower_requisition (id,tenant_id,company_id,reference,job_title,designation_id,job_grade_id,employment_type_id,branch_id,department_id,positions_requested,position_type,replacement_employee_id,salary_minimum,salary_maximum,currency_code,target_start_date,reason,required_skills,created_by) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19::jsonb,$20)`, [id,context.tenantId,input.company_id,reference,input.job_title,input.designation_id,input.job_grade_id,input.employment_type_id,input.branch_id,input.department_id,input.positions_requested,input.position_type,input.replacement_employee_id??null,input.salary_minimum,input.salary_maximum,input.currency_code,input.target_start_date,input.reason,JSON.stringify(input.required_skills),context.actor.userId]);
      const audit = await this.appendPlatformAudit(client,context,correlationId,"hr.manpower_requisition.create",{entityId:id,entityType:"hr_manpower_requisition",before:null,after:{reference,...input,state:"draft"}});
      const result:HrManpowerRequisitionResult={id,reference,state:"draft",company_id:input.company_id,audit_event_id:audit,replayed:false};
      await client.query("insert into platform_admin_idempotency (tenant_id,actor_id,method,path,idempotency_key,request_fingerprint,response_status,response_body,response_etag) values ($1,$2,'POST',$3,$4,$5,201,$6,$7)",[context.tenantId,context.actor.userId,path,idempotencyKey,fingerprint,result,stateHash(result)]);
      await client.query("commit"); return result;
    } catch(error) { await client.query("rollback").catch(()=>undefined); throw error; } finally { client.release(); }
  }

  async submitManpowerRequisition(context: HrActorContext, id: string, input: SubmitHrManpowerRequisitionRequest, idempotencyKey: string, correlationId: string): Promise<HrManpowerRequisitionResult> {
    return this.mutateManpowerDecision(context,id,{decision:"submitted",reason:input.reason},idempotencyKey,correlationId);
  }
  async decideManpowerRequisition(context: HrActorContext, id: string, input: DecideHrManpowerRequisitionRequest, idempotencyKey: string, correlationId: string): Promise<HrManpowerRequisitionResult> {
    return this.mutateManpowerDecision(context,id,input,idempotencyKey,correlationId);
  }
  private async mutateManpowerDecision(context: HrActorContext, id: string, input: { decision: "submitted"|"approved"|"rejected"; reason:string }, idempotencyKey:string, correlationId:string): Promise<HrManpowerRequisitionResult> {
    if (!validIdempotencyKey(idempotencyKey)) throw new HrApiError(400,"INVALID_IDEMPOTENCY_KEY","The idempotency key is invalid.");
    const permission=input.decision==="submitted"?"hr.employee.submit":"hr.employee.approve";
    if (!context.actor.permissions.includes(permission)) throw new HrApiError(403,"PERMISSION_DENIED","You are not permitted to make this requisition decision.");
    const client=await this.pool.connect(); try { await client.query("begin"); await client.query("select set_config('nexora.tenant_id',$1,true)",[context.tenantId]); const path=`/api/v1/hr/manpower_requisitions/${id}/${input.decision}`; const fingerprint=stateHash(input);
      const replay=await client.query<{request_fingerprint:string;response_body:HrManpowerRequisitionResult}>("select request_fingerprint,response_body from platform_admin_idempotency where tenant_id=$1 and actor_id=$2 and method='POST' and path=$3 and idempotency_key=$4 for update",[context.tenantId,context.actor.userId,path,idempotencyKey]); if(replay.rows[0]){if(replay.rows[0].request_fingerprint!==fingerprint) throw new HrApiError(409,"IDEMPOTENCY_CONFLICT","The idempotency key was already used for another request.");await client.query("commit");return {...replay.rows[0].response_body,replayed:true};}
      const record=await client.query<{reference:string;company_id:string;state:string;created_by:string;submitted_by:string|null}>(`select request.reference,request.company_id,request.state,request.created_by,request.submitted_by from hr_manpower_requisition request where request.tenant_id=$1 and request.id=$2 and exists(select 1 from security_user_company_access access where access.tenant_id=request.tenant_id and access.user_id=$3 and access.company_id=request.company_id and access.revoked_at is null) for update`,[context.tenantId,id,context.actor.userId]); const before=record.rows[0]; if(!before) throw new HrApiError(404,"HR_MANPOWER_REQUISITION_NOT_FOUND","The manpower requisition is unavailable in your company scope.");
      if(input.decision==="submitted" && before.state!=="draft") throw new HrApiError(409,"HR_MANPOWER_REQUISITION_NOT_SUBMITTABLE","Only draft requisitions can be submitted."); if(input.decision!=="submitted" && before.state!=="submitted") throw new HrApiError(409,"HR_MANPOWER_REQUISITION_NOT_PENDING","Only submitted requisitions can be decided.");
      let override:string|null=null; if(input.decision!=="submitted") override=await this.resolveApprovalOverride(client,context,{normalDecisionPermission:permission,makerActorIds:[before.created_by,before.submitted_by].filter((value):value is string=>Boolean(value)),resourceType:"hr.manpower_requisition",resourceId:id,decisionAction:input.decision==="approved"?"approve":"reject",reason:input.reason,correlationId,idempotencyKey});
      if(input.decision==="submitted") await client.query("update hr_manpower_requisition set state='submitted',submitted_by=$3,submitted_at=now(),updated_at=now() where tenant_id=$1 and id=$2",[context.tenantId,id,context.actor.userId]); else await client.query("update hr_manpower_requisition set state=$3,decided_by=$4,decided_at=now(),decision_reason=$5,approval_override_event_id=$6,updated_at=now() where tenant_id=$1 and id=$2",[context.tenantId,id,input.decision,context.actor.userId,input.reason,override]);
      const audit=await this.appendPlatformAudit(client,context,correlationId,`hr.manpower_requisition.${input.decision}`,{entityId:id,entityType:"hr_manpower_requisition",before:{state:before.state},after:{state:input.decision,reason:input.reason,super_admin_override:override!==null}}); const result:HrManpowerRequisitionResult={id,reference:before.reference,state:input.decision,company_id:before.company_id,audit_event_id:audit,replayed:false}; await client.query("insert into platform_admin_idempotency (tenant_id,actor_id,method,path,idempotency_key,request_fingerprint,response_status,response_body,response_etag) values ($1,$2,'POST',$3,$4,$5,200,$6,$7)",[context.tenantId,context.actor.userId,path,idempotencyKey,fingerprint,result,stateHash(result)]); await client.query("commit");return result;
    } catch(error){await client.query("rollback").catch(()=>undefined);throw error;} finally{client.release();}
  }

  async listJobOpenings(context: HrActorContext, query: HrJobOpeningQuery): Promise<HrJobOpeningDirectory> {
    return this.read(context, "hr.employee.read", async (client) => {
      await this.requireCompanyAccess(client, context, query.company_id); const values: unknown[]=[context.tenantId,query.company_id]; const filters=["opening.tenant_id=$1","opening.company_id=$2"];
      if(query.state){values.push(query.state);filters.push(`opening.state=$${values.length}`)} if(query.search){values.push(`%${query.search.replace(/[\\%_]/g,"\\$&")}%`);filters.push(`(opening.reference ilike $${values.length} escape '\\' or opening.title ilike $${values.length} escape '\\' or requisition.reference ilike $${values.length} escape '\\')`)} values.push(query.limit);
      const result=await client.query<HrJobOpeningDirectory["items"][number] & {created_at:Date;closing_on:string|Date|null}>(`select opening.id,opening.company_id,opening.reference,opening.requisition_id,requisition.reference as requisition_reference,opening.title,opening.positions_requested,0::int as filled_positions,opening.positions_requested::int as remaining_positions,opening.channels,opening.closing_on,opening.state,opening.state_reason,opening.created_at from hr_job_opening opening join hr_manpower_requisition requisition on requisition.tenant_id=opening.tenant_id and requisition.id=opening.requisition_id where ${filters.join(" and ")} order by opening.created_at desc,opening.id desc limit $${values.length}`,values);
      return {items:result.rows.map(row=>({...row,closing_on:row.closing_on===null?null:dateOnly(row.closing_on),created_at:row.created_at.toISOString()}))};
    });
  }
  async createJobOpening(context: HrActorContext,input:CreateHrJobOpeningRequest,idempotencyKey:string,correlationId:string):Promise<HrJobOpeningResult>{
    if(!validIdempotencyKey(idempotencyKey)) throw new HrApiError(400,"INVALID_IDEMPOTENCY_KEY","The idempotency key is invalid."); if(!context.actor.permissions.includes("hr.employee.create")) throw new HrApiError(403,"PERMISSION_DENIED","You are not permitted to create job openings."); const client=await this.pool.connect();
    try{await client.query("begin");await client.query("select set_config('nexora.tenant_id',$1,true)",[context.tenantId]);await this.requireCompanyAccess(client,context,input.company_id);const path="/api/v1/hr/job_openings",fingerprint=stateHash(input);const replay=await client.query<{request_fingerprint:string;response_body:HrJobOpeningResult}>("select request_fingerprint,response_body from platform_admin_idempotency where tenant_id=$1 and actor_id=$2 and method='POST' and path=$3 and idempotency_key=$4 for update",[context.tenantId,context.actor.userId,path,idempotencyKey]);if(replay.rows[0]){if(replay.rows[0].request_fingerprint!==fingerprint)throw new HrApiError(409,"IDEMPOTENCY_CONFLICT","The idempotency key was already used for another request.");await client.query("commit");return {...replay.rows[0].response_body,replayed:true};}const id=`job-opening-${randomUUID()}`,reference=`JOP-${new Date().getUTCFullYear()}-${randomUUID().replaceAll("-","").slice(0,6).toUpperCase()}`;await client.query("insert into hr_job_opening (id,tenant_id,company_id,reference,requisition_id,title,positions_requested,channels,closing_on,created_by) values ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10)",[id,context.tenantId,input.company_id,reference,input.requisition_id,input.title,input.positions_requested,JSON.stringify(input.channels),input.closing_on??null,context.actor.userId]);const audit=await this.appendPlatformAudit(client,context,correlationId,"hr.job_opening.create",{entityId:id,entityType:"hr_job_opening",before:null,after:{reference,...input,state:"open"}});const result:HrJobOpeningResult={id,reference,state:"open",company_id:input.company_id,audit_event_id:audit,replayed:false};await client.query("insert into platform_admin_idempotency (tenant_id,actor_id,method,path,idempotency_key,request_fingerprint,response_status,response_body,response_etag) values ($1,$2,'POST',$3,$4,$5,201,$6,$7)",[context.tenantId,context.actor.userId,path,idempotencyKey,fingerprint,result,stateHash(result)]);await client.query("commit");return result;}catch(error){await client.query("rollback").catch(()=>undefined);throw error;}finally{client.release();}
  }
  async changeJobOpeningState(context:HrActorContext,id:string,input:ChangeHrJobOpeningStateRequest,idempotencyKey:string,correlationId:string):Promise<HrJobOpeningResult>{
    if(!validIdempotencyKey(idempotencyKey))throw new HrApiError(400,"INVALID_IDEMPOTENCY_KEY","The idempotency key is invalid.");if(!context.actor.permissions.includes("hr.employee.update"))throw new HrApiError(403,"PERMISSION_DENIED","You are not permitted to change job opening state.");const client=await this.pool.connect();try{await client.query("begin");await client.query("select set_config('nexora.tenant_id',$1,true)",[context.tenantId]);await this.requireCompanyAccess(client,context,input.company_id);const path=`/api/v1/hr/job_openings/${id}/state`,fingerprint=stateHash(input);const replay=await client.query<{request_fingerprint:string;response_body:HrJobOpeningResult}>("select request_fingerprint,response_body from platform_admin_idempotency where tenant_id=$1 and actor_id=$2 and method='POST' and path=$3 and idempotency_key=$4 for update",[context.tenantId,context.actor.userId,path,idempotencyKey]);if(replay.rows[0]){if(replay.rows[0].request_fingerprint!==fingerprint)throw new HrApiError(409,"IDEMPOTENCY_CONFLICT","The idempotency key was already used for another request.");await client.query("commit");return {...replay.rows[0].response_body,replayed:true};}const record=await client.query<{reference:string;company_id:string;state:HrJobOpeningResult["state"]}>("select reference,company_id,state from hr_job_opening where tenant_id=$1 and id=$2 and company_id=$3 for update",[context.tenantId,id,input.company_id]);const before=record.rows[0];if(!before)throw new HrApiError(404,"HR_JOB_OPENING_NOT_FOUND","The job opening is unavailable in your company scope.");if(before.state==="cancelled")throw new HrApiError(409,"HR_JOB_OPENING_FINAL","A cancelled job opening cannot change state.");await client.query("update hr_job_opening set state=$3,state_reason=$4,updated_at=now() where tenant_id=$1 and id=$2",[context.tenantId,id,input.state,input.reason]);const audit=await this.appendPlatformAudit(client,context,correlationId,"hr.job_opening.state",{entityId:id,entityType:"hr_job_opening",before:{state:before.state},after:{state:input.state,reason:input.reason}});const result:HrJobOpeningResult={id,reference:before.reference,state:input.state,company_id:before.company_id,audit_event_id:audit,replayed:false};await client.query("insert into platform_admin_idempotency (tenant_id,actor_id,method,path,idempotency_key,request_fingerprint,response_status,response_body,response_etag) values ($1,$2,'POST',$3,$4,$5,200,$6,$7)",[context.tenantId,context.actor.userId,path,idempotencyKey,fingerprint,result,stateHash(result)]);await client.query("commit");return result;}catch(error){await client.query("rollback").catch(()=>undefined);throw error;}finally{client.release();}
  }

  async getEmployee(context: HrActorContext, employeeId: string): Promise<HrEmployeeDetail> {
    return this.read(context, "hr.employee.read", async (client) => {
      const result = await client.query<EmployeeDetailRow>(
        `select employee.id, employee.employee_number,
                concat_ws(' ', employee.first_name, employee.middle_name, employee.last_name) as display_name,
                employee.work_email, employee.status, employee.joined_on, employee.preferred_name, employee.phone,
                assignment.company_id, assignment.branch_id, branch.name as branch,
                assignment.department_id, department.name as department,
                designation.name as designation, employment_type.name as employment_type,
                job_grade.name as job_grade, work_location.name as work_location,
                employee_category.name as employee_category,
                manager.id as reporting_manager_id, manager.employee_number as reporting_manager_number,
                concat_ws(' ', manager.first_name, manager.middle_name, manager.last_name) as reporting_manager_name,
                binding.user_id as user_account_id
           from employee
           join employee_assignment assignment
             on assignment.tenant_id = employee.tenant_id and assignment.employee_id = employee.id
            and assignment.effective_from <= current_date
            and (assignment.effective_to is null or assignment.effective_to >= current_date)
           join organization_unit branch
             on branch.tenant_id = assignment.tenant_id and branch.id = assignment.branch_id
           join organization_unit department
             on department.tenant_id = assignment.tenant_id and department.id = assignment.department_id
           join hr_master_record designation on designation.tenant_id = assignment.tenant_id and designation.id = assignment.designation_id
           join hr_master_record employment_type on employment_type.tenant_id = assignment.tenant_id and employment_type.id = assignment.employment_type_id
           join hr_master_record job_grade on job_grade.tenant_id = assignment.tenant_id and job_grade.id = assignment.job_grade_id
           join hr_master_record work_location on work_location.tenant_id = assignment.tenant_id and work_location.id = assignment.work_location_id
           join hr_master_record employee_category on employee_category.tenant_id = assignment.tenant_id and employee_category.id = assignment.employee_category_id
           left join employee manager on manager.tenant_id = assignment.tenant_id and manager.id = assignment.reporting_manager_id
           left join employee_user_binding binding
             on binding.tenant_id = employee.tenant_id and binding.employee_id = employee.id
            and binding.effective_from <= current_date and (binding.effective_to is null or binding.effective_to >= current_date)
          where employee.tenant_id = $1 and employee.id = $2
            and exists (
              select 1 from security_user_company_access access
               where access.tenant_id = employee.tenant_id and access.user_id = $3
                 and access.company_id = assignment.company_id and access.revoked_at is null
            )`,
        [context.tenantId, employeeId, context.actor.userId],
      );
      const row = result.rows[0];
      if (!row)
        throw new HrApiError(404, "HR_EMPLOYEE_NOT_FOUND", "The employee is unavailable in your company scope.");
      const { reporting_manager_id, reporting_manager_number, reporting_manager_name, joined_on, ...detail } = row;
      return {
        ...detail,
        joined_on: dateOnly(joined_on),
        reporting_manager:
          reporting_manager_id && reporting_manager_number && reporting_manager_name
            ? {
                id: reporting_manager_id,
                employee_number: reporting_manager_number,
                display_name: reporting_manager_name,
              }
            : null,
      };
    });
  }

  async listEmployeeDrafts(
    context: HrActorContext,
    query: HrEmployeeDraftDirectoryQuery,
  ): Promise<HrEmployeeDraftDirectory> {
    return this.read(context, "hr.employee.read", async (client) => {
      await this.requireCompanyAccess(client, context, query.company_id);
      const values: unknown[] = [context.tenantId, query.company_id];
      const filters = ["employee.tenant_id = $1", "scope.company_id = $2", "employee.status = 'draft'"];
      if (query.search) {
        const parameter = values.push(`%${query.search.replace(/[\\%_]/g, "\\$&")}%`);
        filters.push(
          `(employee.employee_number ilike $${parameter} escape '\\' or concat_ws(' ', employee.first_name, employee.middle_name, employee.last_name) ilike $${parameter} escape '\\')`,
        );
      }
      values.push(query.limit);
      const result = await client.query<{
        id: string;
        employee_number: string;
        display_name: string;
        work_email: string;
        joined_on: string | Date;
        company_id: string;
        created_at: string | Date;
      }>(
        `select employee.id,employee.employee_number,
                concat_ws(' ',employee.first_name,employee.middle_name,employee.last_name) as display_name,
                employee.work_email,employee.joined_on,scope.company_id,employee.created_at
           from hr_employee_draft_scope scope
           join employee on employee.tenant_id=scope.tenant_id and employee.id=scope.employee_id
          where ${filters.join(" and ")}
          order by employee.created_at desc, employee.id desc
          limit $${values.length}`,
        values,
      );
      return {
        items: result.rows.map((row) => ({
          ...row,
          joined_on: dateOnly(row.joined_on),
          created_at:
            row.created_at instanceof Date ? row.created_at.toISOString() : new Date(row.created_at).toISOString(),
        })),
      };
    });
  }

  async getEmployeeDraft(context: HrActorContext, employeeId: string): Promise<HrEmployeeDraftDetail> {
    return this.read(context, "hr.employee.read", async (client) => {
      const result = await client.query<{
        id: string;
        employee_number: string;
        first_name: string;
        middle_name: string;
        last_name: string;
        preferred_name: string;
        work_email: string;
        phone: string;
        joined_on: string | Date;
        company_id: string;
        created_at: string | Date;
      }>(
        `select employee.id,employee.employee_number,employee.first_name,employee.middle_name,employee.last_name,
                employee.preferred_name,employee.work_email,employee.phone,employee.joined_on,
                scope.company_id,employee.created_at
           from hr_employee_draft_scope scope
           join employee on employee.tenant_id=scope.tenant_id and employee.id=scope.employee_id
          where scope.tenant_id=$1 and employee.id=$2 and employee.status='draft'
            and exists (select 1 from security_user_company_access access
                         where access.tenant_id=scope.tenant_id and access.user_id=$3
                           and access.company_id=scope.company_id and access.revoked_at is null)`,
        [context.tenantId, employeeId, context.actor.userId],
      );
      const row = result.rows[0];
      if (!row)
        throw new HrApiError(
          404,
          "HR_EMPLOYEE_DRAFT_NOT_FOUND",
          "The employee draft is unavailable in your company scope.",
        );
      return {
        ...row,
        display_name: [row.first_name, row.middle_name, row.last_name].filter(Boolean).join(" "),
        joined_on: dateOnly(row.joined_on),
        created_at:
          row.created_at instanceof Date ? row.created_at.toISOString() : new Date(row.created_at).toISOString(),
      };
    });
  }

  async createEmployeeDraft(
    context: HrActorContext,
    input: CreateHrEmployeeDraftRequest,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<HrEmployeeDraftResult> {
    if (!validIdempotencyKey(idempotencyKey))
      throw new HrApiError(400, "INVALID_IDEMPOTENCY_KEY", "The idempotency key is invalid.");
    if (!context.actor.permissions.includes("hr.employee.create"))
      throw new HrApiError(403, "PERMISSION_DENIED", "You are not permitted to create employee drafts.");

    const client = await this.pool.connect();
    try {
      // A tenant-level lock makes the idempotency replay and the append-only
      // audit sequence deterministic under concurrent browser retries.
      await client.query("begin isolation level read committed");
      await client.query("select set_config('nexora.tenant_id', $1, true)", [context.tenantId]);
      await client.query("select pg_advisory_xact_lock(hashtextextended($1, 0))", [
        `nexora:hr:employee-draft:${context.tenantId}`,
      ]);
      await this.requireCompanyAccess(client, context, input.company_id);

      const requestPath = "/api/v1/hr/employees";
      const fingerprint = stateHash(input);
      const previous = await client.query<{
        request_fingerprint: string;
        response_body: HrEmployeeDraftResult;
      }>(
        `select request_fingerprint,response_body
           from platform_admin_idempotency
          where tenant_id=$1 and actor_id=$2 and method='POST' and path=$3 and idempotency_key=$4
          for update`,
        [context.tenantId, context.actor.userId, requestPath, idempotencyKey],
      );
      if (previous.rows[0]) {
        if (previous.rows[0].request_fingerprint !== fingerprint)
          throw new HrApiError(
            409,
            "IDEMPOTENCY_CONFLICT",
            "The idempotency key was already used for another request.",
          );
        await client.query("commit");
        return { ...previous.rows[0].response_body, replayed: true };
      }

      const employeeId = `employee-${randomUUID()}`;
      await client.query(
        `insert into employee
          (id,tenant_id,employee_number,first_name,middle_name,last_name,preferred_name,joined_on,work_email,phone,status,created_by)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'draft',$11)`,
        [
          employeeId,
          context.tenantId,
          input.employee_number,
          input.first_name,
          input.middle_name ?? "",
          input.last_name,
          input.preferred_name ?? "",
          input.joined_on,
          input.work_email ?? "",
          input.phone ?? "",
          context.actor.userId,
        ],
      );
      await client.query(
        `insert into hr_employee_draft_scope (tenant_id,employee_id,company_id,created_by)
         values ($1,$2,$3,$4)`,
        [context.tenantId, employeeId, input.company_id, context.actor.userId],
      );
      const auditEventId = await this.appendPlatformAudit(client, context, correlationId, "hr.employee.create", {
        entityId: employeeId,
        before: null,
        after: {
          id: employeeId,
          company_id: input.company_id,
          employee_number: input.employee_number,
          first_name: input.first_name,
          middle_name: input.middle_name ?? "",
          last_name: input.last_name,
          preferred_name: input.preferred_name ?? "",
          joined_on: input.joined_on,
          work_email: input.work_email ?? "",
          phone: input.phone ?? "",
          status: "draft",
        },
      });
      await this.recordEmployeeProfileVersion(
        client,
        context,
        employeeId,
        {
          first_name: input.first_name,
          middle_name: input.middle_name ?? "",
          last_name: input.last_name,
          preferred_name: input.preferred_name ?? "",
          work_email: input.work_email ?? "",
          date_of_birth: null,
          personal_email: "",
          phone: input.phone ?? "",
        },
        `platform-audit:${auditEventId}`,
      );
      const result: HrEmployeeDraftResult = {
        id: employeeId,
        employee_number: input.employee_number,
        status: "draft",
        company_id: input.company_id,
        audit_event_id: auditEventId,
        replayed: false,
      };
      await client.query(
        `insert into platform_admin_idempotency
          (tenant_id,actor_id,method,path,idempotency_key,request_fingerprint,response_status,response_body,response_etag)
         values ($1,$2,'POST',$3,$4,$5,201,$6,$7)`,
        [context.tenantId, context.actor.userId, requestPath, idempotencyKey, fingerprint, result, stateHash(result)],
      );
      await client.query("commit");
      return result;
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      if ((error as { code?: string }).code === "23505")
        throw new HrApiError(409, "HR_EMPLOYEE_ALREADY_EXISTS", "The employee number is already in use.");
      throw error;
    } finally {
      client.release();
    }
  }

  async updateEmployeeDraft(
    context: HrActorContext,
    employeeId: string,
    input: UpdateHrEmployeeDraftRequest,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<HrEmployeeDraftResult> {
    if (!validIdempotencyKey(idempotencyKey))
      throw new HrApiError(400, "INVALID_IDEMPOTENCY_KEY", "The idempotency key is invalid.");
    if (!context.actor.permissions.includes("hr.employee.update"))
      throw new HrApiError(403, "PERMISSION_DENIED", "You are not permitted to update employee drafts.");
    const client = await this.pool.connect();
    try {
      await client.query("begin isolation level read committed");
      await client.query("select set_config('nexora.tenant_id', $1, true)", [context.tenantId]);
      await client.query("select pg_advisory_xact_lock(hashtextextended($1, 0))", [
        `nexora:hr:employee-draft:${context.tenantId}`,
      ]);
      const requestPath = `/api/v1/hr/employee_drafts/${employeeId}`;
      const fingerprint = stateHash(input);
      const replay = await client.query<{ request_fingerprint: string; response_body: HrEmployeeDraftResult }>(
        `select request_fingerprint,response_body from platform_admin_idempotency
          where tenant_id=$1 and actor_id=$2 and method='POST' and path=$3 and idempotency_key=$4 for update`,
        [context.tenantId, context.actor.userId, requestPath, idempotencyKey],
      );
      if (replay.rows[0]) {
        if (replay.rows[0].request_fingerprint !== fingerprint)
          throw new HrApiError(
            409,
            "IDEMPOTENCY_CONFLICT",
            "The idempotency key was already used for another request.",
          );
        await client.query("commit");
        return { ...replay.rows[0].response_body, replayed: true };
      }
      const existing = await client.query<{
        employee_number: string;
        company_id: string;
        first_name: string;
        middle_name: string;
        last_name: string;
        preferred_name: string;
        joined_on: string;
        work_email: string;
        date_of_birth: string | Date | null;
        personal_email: string;
        phone: string;
      }>(
        `select employee.employee_number,scope.company_id,employee.first_name,employee.middle_name,employee.last_name,
                employee.preferred_name,employee.joined_on::text,employee.work_email,employee.date_of_birth,
                employee.personal_email,employee.phone
           from hr_employee_draft_scope scope join employee on employee.tenant_id=scope.tenant_id and employee.id=scope.employee_id
          where scope.tenant_id=$1 and employee.id=$2 and employee.status='draft'
            and exists (select 1 from security_user_company_access access where access.tenant_id=scope.tenant_id
              and access.user_id=$3 and access.company_id=scope.company_id and access.revoked_at is null) for update of employee`,
        [context.tenantId, employeeId, context.actor.userId],
      );
      const before = existing.rows[0];
      if (!before)
        throw new HrApiError(
          404,
          "HR_EMPLOYEE_DRAFT_NOT_FOUND",
          "The employee draft is unavailable in your company scope.",
        );
      const after = {
        ...before,
        first_name: input.first_name ?? before.first_name,
        middle_name: input.middle_name ?? before.middle_name,
        last_name: input.last_name ?? before.last_name,
        preferred_name: input.preferred_name ?? before.preferred_name,
        joined_on: input.joined_on ?? before.joined_on,
        work_email: input.work_email ?? before.work_email,
        phone: input.phone ?? before.phone,
      };
      await client.query(
        `update employee set first_name=$3,middle_name=$4,last_name=$5,preferred_name=$6,joined_on=$7,work_email=$8,phone=$9,updated_at=now()
          where tenant_id=$1 and id=$2`,
        [
          context.tenantId,
          employeeId,
          after.first_name,
          after.middle_name,
          after.last_name,
          after.preferred_name,
          after.joined_on,
          after.work_email,
          after.phone,
        ],
      );
      const auditEventId = await this.appendPlatformAudit(client, context, correlationId, "hr.employee.update", {
        entityId: employeeId,
        before,
        after,
      });
      await this.recordEmployeeProfileVersion(
        client,
        context,
        employeeId,
        {
          first_name: after.first_name,
          middle_name: after.middle_name,
          last_name: after.last_name,
          preferred_name: after.preferred_name,
          work_email: after.work_email,
          date_of_birth: after.date_of_birth,
          personal_email: after.personal_email,
          phone: after.phone,
        },
        `platform-audit:${auditEventId}`,
      );
      const result: HrEmployeeDraftResult = {
        id: employeeId,
        employee_number: before.employee_number,
        status: "draft",
        company_id: before.company_id,
        audit_event_id: auditEventId,
        replayed: false,
      };
      await client.query(
        `insert into platform_admin_idempotency (tenant_id,actor_id,method,path,idempotency_key,request_fingerprint,response_status,response_body,response_etag)
         values ($1,$2,'POST',$3,$4,$5,200,$6,$7)`,
        [context.tenantId, context.actor.userId, requestPath, idempotencyKey, fingerprint, result, stateHash(result)],
      );
      await client.query("commit");
      return result;
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async submitEmployeeDraft(
    context: HrActorContext,
    employeeId: string,
    input: SubmitHrEmployeeDraftRequest,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<HrEmployeeDraftResult> {
    if (!validIdempotencyKey(idempotencyKey))
      throw new HrApiError(400, "INVALID_IDEMPOTENCY_KEY", "The idempotency key is invalid.");
    if (!context.actor.permissions.includes("hr.employee.submit"))
      throw new HrApiError(403, "PERMISSION_DENIED", "You are not permitted to submit employee drafts.");
    const client = await this.pool.connect();
    try {
      await client.query("begin isolation level read committed");
      await client.query("select set_config('nexora.tenant_id', $1, true)", [context.tenantId]);
      await client.query("select pg_advisory_xact_lock(hashtextextended($1, 0))", [
        `nexora:hr:employee-draft:${context.tenantId}`,
      ]);
      const path = `/api/v1/hr/employee_drafts/${employeeId}/submit`;
      const fingerprint = stateHash(input);
      const replay = await client.query<{ request_fingerprint: string; response_body: HrEmployeeDraftResult }>(
        `select request_fingerprint,response_body from platform_admin_idempotency where tenant_id=$1 and actor_id=$2 and method='POST' and path=$3 and idempotency_key=$4 for update`,
        [context.tenantId, context.actor.userId, path, idempotencyKey],
      );
      if (replay.rows[0]) {
        if (replay.rows[0].request_fingerprint !== fingerprint)
          throw new HrApiError(
            409,
            "IDEMPOTENCY_CONFLICT",
            "The idempotency key was already used for another request.",
          );
        await client.query("commit");
        return { ...replay.rows[0].response_body, replayed: true };
      }
      const record = await client.query<{ employee_number: string; company_id: string; status: string }>(
        `select employee.employee_number,scope.company_id,employee.status from hr_employee_draft_scope scope
           join employee on employee.tenant_id=scope.tenant_id and employee.id=scope.employee_id
          where scope.tenant_id=$1 and employee.id=$2 and exists (select 1 from security_user_company_access access where access.tenant_id=scope.tenant_id and access.user_id=$3 and access.company_id=scope.company_id and access.revoked_at is null) for update of employee`,
        [context.tenantId, employeeId, context.actor.userId],
      );
      const before = record.rows[0];
      if (!before)
        throw new HrApiError(
          404,
          "HR_EMPLOYEE_DRAFT_NOT_FOUND",
          "The employee draft is unavailable in your company scope.",
        );
      if (before.status !== "draft")
        throw new HrApiError(409, "HR_DRAFT_NOT_SUBMITTABLE", "Only a draft employee can be submitted.");
      await client.query(
        "update employee set status='pending_approval',submitted_by=$3,updated_at=now() where tenant_id=$1 and id=$2",
        [context.tenantId, employeeId, context.actor.userId],
      );
      await client.query(
        `insert into employee_status_history (id,tenant_id,employee_id,from_status,to_status,effective_on,reason,actor_id)
         values ($1,$2,$3,'draft','pending_approval',current_date,$4,$5)`,
        [`employee-status-${randomUUID()}`, context.tenantId, employeeId, input.reason, context.actor.userId],
      );
      const auditEventId = await this.appendPlatformAudit(client, context, correlationId, "hr.employee.submit", {
        entityId: employeeId,
        before,
        after: { ...before, status: "pending_approval", reason: input.reason },
      });
      await client.query(
        `insert into hr_employee_draft_approval (id,tenant_id,employee_id,state,submitted_by,audit_event_id)
         values ($1,$2,$3,'pending',$4,$5)`,
        [`employee-draft-approval-${randomUUID()}`, context.tenantId, employeeId, context.actor.userId, auditEventId],
      );
      const result = {
        id: employeeId,
        employee_number: before.employee_number,
        status: "pending_approval" as const,
        company_id: before.company_id,
        audit_event_id: auditEventId,
        replayed: false,
      };
      await client.query(
        `insert into platform_admin_idempotency (tenant_id,actor_id,method,path,idempotency_key,request_fingerprint,response_status,response_body,response_etag) values ($1,$2,'POST',$3,$4,$5,200,$6,$7)`,
        [context.tenantId, context.actor.userId, path, idempotencyKey, fingerprint, result, stateHash(result)],
      );
      await client.query("commit");
      return result;
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async listEmployeeDraftApprovals(
    context: HrActorContext,
    query: HrEmployeeDraftApprovalQueueQuery,
  ): Promise<HrEmployeeDraftApprovalQueue> {
    return this.read(context, "hr.employee.approve", async (client) => {
      await this.requireCompanyAccess(client, context, query.company_id);
      const result = await client.query<{
        approval_id: string;
        employee_id: string;
        employee_number: string;
        display_name: string;
        company_id: string;
        submitted_by: string;
        submitted_at: string | Date;
      }>(
        `select approval.id as approval_id,employee.id as employee_id,employee.employee_number,
                concat_ws(' ',employee.first_name,employee.middle_name,employee.last_name) as display_name,
                scope.company_id,approval.submitted_by,approval.submitted_at
           from hr_employee_draft_approval approval
           join hr_employee_draft_scope scope on scope.tenant_id=approval.tenant_id and scope.employee_id=approval.employee_id
           join employee on employee.tenant_id=approval.tenant_id and employee.id=approval.employee_id
          where approval.tenant_id=$1 and scope.company_id=$2 and approval.state='pending'
          order by approval.submitted_at,approval.id limit $3`,
        [context.tenantId, query.company_id, query.limit],
      );
      return {
        items: result.rows.map((row) => ({
          ...row,
          submitted_at:
            row.submitted_at instanceof Date
              ? row.submitted_at.toISOString()
              : new Date(row.submitted_at).toISOString(),
        })),
      };
    });
  }

  async getEmployeeDraftApproval(context: HrActorContext, employeeId: string): Promise<HrEmployeeDraftApprovalDetail> {
    return this.read(context, "hr.employee.approve", async (client) => {
      const result = await client.query<{
        id: string;
        employee_number: string;
        first_name: string;
        middle_name: string;
        last_name: string;
        preferred_name: string;
        work_email: string;
        phone: string;
        joined_on: string | Date;
        company_id: string;
        created_at: string | Date;
        approval_id: string;
        created_by: string;
        submitted_by: string;
        submitted_at: string | Date;
      }>(
        `select employee.id,employee.employee_number,employee.first_name,employee.middle_name,
                employee.last_name,employee.preferred_name,employee.work_email,employee.phone,
                employee.joined_on,employee.created_at,employee.created_by,scope.company_id,
                approval.id as approval_id,approval.submitted_by,approval.submitted_at
           from hr_employee_draft_approval approval
           join employee on employee.tenant_id=approval.tenant_id and employee.id=approval.employee_id
           join hr_employee_draft_scope scope on scope.tenant_id=approval.tenant_id and scope.employee_id=approval.employee_id
          where approval.tenant_id=$1 and approval.employee_id=$2 and approval.state='pending'
            and employee.status='pending_approval'
            and exists (select 1 from security_user_company_access access
                         where access.tenant_id=scope.tenant_id and access.user_id=$3
                           and access.company_id=scope.company_id and access.revoked_at is null)`,
        [context.tenantId, employeeId, context.actor.userId],
      );
      const row = result.rows[0];
      if (!row)
        throw new HrApiError(
          404,
          "HR_APPROVAL_NOT_FOUND",
          "The pending approval is unavailable in your company scope.",
        );
      return {
        ...row,
        display_name: [row.first_name, row.middle_name, row.last_name].filter(Boolean).join(" "),
        joined_on: dateOnly(row.joined_on),
        created_at: new Date(row.created_at).toISOString(),
        submitted_at: new Date(row.submitted_at).toISOString(),
        ...approvalOverrideReviewMetadata(context, [row.created_by, row.submitted_by], "hr.employee.approve"),
      };
    });
  }

  async decideEmployeeDraftApproval(
    context: HrActorContext,
    employeeId: string,
    input: DecideHrEmployeeDraftApprovalRequest,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<HrEmployeeDraftResult> {
    if (!validIdempotencyKey(idempotencyKey))
      throw new HrApiError(400, "INVALID_IDEMPOTENCY_KEY", "The idempotency key is invalid.");
    if (!context.actor.permissions.includes("hr.employee.approve"))
      throw new HrApiError(403, "PERMISSION_DENIED", "You are not permitted to decide employee approvals.");
    const client = await this.pool.connect();
    try {
      await client.query("begin isolation level read committed");
      await client.query("select set_config('nexora.tenant_id', $1, true)", [context.tenantId]);
      await client.query("select pg_advisory_xact_lock(hashtextextended($1, 0))", [
        `nexora:hr:employee-approval:${context.tenantId}`,
      ]);
      const path = `/api/v1/hr/employee_drafts/${employeeId}/approval_decision`;
      const fingerprint = stateHash(input);
      const replay = await client.query<{ request_fingerprint: string; response_body: HrEmployeeDraftResult }>(
        `select request_fingerprint,response_body from platform_admin_idempotency where tenant_id=$1 and actor_id=$2 and method='POST' and path=$3 and idempotency_key=$4 for update`,
        [context.tenantId, context.actor.userId, path, idempotencyKey],
      );
      if (replay.rows[0]) {
        if (replay.rows[0].request_fingerprint !== fingerprint)
          throw new HrApiError(
            409,
            "IDEMPOTENCY_CONFLICT",
            "The idempotency key was already used for another request.",
          );
        await client.query("commit");
        return { ...replay.rows[0].response_body, replayed: true };
      }
      const record = await client.query<{
        approval_id: string;
        employee_number: string;
        company_id: string;
        submitted_by: string;
        created_by: string;
      }>(
        `select approval.id as approval_id,employee.employee_number,scope.company_id,
                approval.submitted_by,employee.created_by
           from hr_employee_draft_approval approval
           join hr_employee_draft_scope scope on scope.tenant_id=approval.tenant_id and scope.employee_id=approval.employee_id
           join employee on employee.tenant_id=approval.tenant_id and employee.id=approval.employee_id
          where approval.tenant_id=$1 and approval.employee_id=$2 and approval.state='pending'
            and employee.status='pending_approval'
            and exists (select 1 from security_user_company_access access where access.tenant_id=scope.tenant_id and access.user_id=$3 and access.company_id=scope.company_id and access.revoked_at is null)
          for update of approval,employee`,
        [context.tenantId, employeeId, context.actor.userId],
      );
      const before = record.rows[0];
      if (!before)
        throw new HrApiError(
          409,
          "HR_APPROVAL_NOT_PENDING",
          "The employee approval is not pending in your company scope.",
        );
      const approvalOverrideEventId = await this.resolveApprovalOverride(client, context, {
        normalDecisionPermission: "hr.employee.approve",
        makerActorIds: [before.created_by, before.submitted_by],
        resourceType: "hr.employee_draft_approval",
        resourceId: before.approval_id,
        decisionAction: input.decision === "approved" ? "approve" : "reject",
        reason: input.reason,
        correlationId,
        idempotencyKey,
      });
      const employeeStatus = input.decision === "rejected" ? "draft" : "pending_approval";
      await client.query(
        "update hr_employee_draft_approval set state=$3,decided_by=$4,decided_at=now(),decision_reason=$5,approval_override_event_id=$6 where tenant_id=$1 and id=$2",
        [
          context.tenantId,
          before.approval_id,
          input.decision,
          context.actor.userId,
          input.reason,
          approvalOverrideEventId,
        ],
      );
      if (input.decision === "rejected")
        await client.query(
          "update employee set status='draft',submitted_by=null,updated_at=now() where tenant_id=$1 and id=$2",
          [context.tenantId, employeeId],
        );
      await client.query(
        "insert into employee_status_history (id,tenant_id,employee_id,from_status,to_status,effective_on,reason,actor_id) values ($1,$2,$3,'pending_approval',$4,current_date,$5,$6)",
        [
          `employee-status-${randomUUID()}`,
          context.tenantId,
          employeeId,
          employeeStatus,
          input.reason,
          context.actor.userId,
        ],
      );
      const audit = await this.appendPlatformAudit(client, context, correlationId, "hr.employee.approve", {
        entityId: employeeId,
        before: { status: "pending_approval", approval: "pending" },
        after: {
          status: employeeStatus,
          approval: input.decision,
          reason: input.reason,
          super_admin_override: approvalOverrideEventId !== null,
        },
      });
      const result = {
        id: employeeId,
        employee_number: before.employee_number,
        status: employeeStatus as "draft" | "pending_approval",
        company_id: before.company_id,
        audit_event_id: audit,
        replayed: false,
      };
      await client.query("update hr_employee_draft_approval set audit_event_id=$3 where tenant_id=$1 and id=$2", [
        context.tenantId,
        before.approval_id,
        audit,
      ]);
      await client.query(
        `insert into platform_admin_idempotency (tenant_id,actor_id,method,path,idempotency_key,request_fingerprint,response_status,response_body,response_etag) values ($1,$2,'POST',$3,$4,$5,200,$6,$7)`,
        [context.tenantId, context.actor.userId, path, idempotencyKey, fingerprint, result, stateHash(result)],
      );
      await client.query("commit");
      return result;
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async createProfileDraftAssignment(
    context: HrActorContext,
    employeeId: string,
    input: CreateHrProfileDraftAssignmentRequest,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<HrProfileDraftAssignmentResult> {
    if (!validIdempotencyKey(idempotencyKey))
      throw new HrApiError(400, "INVALID_IDEMPOTENCY_KEY", "The idempotency key is invalid.");
    if (!context.actor.permissions.includes("hr.employee_assignment.create"))
      throw new HrApiError(403, "PERMISSION_DENIED", "You are not permitted to create employee assignments.");
    const client = await this.pool.connect();
    try {
      await client.query("begin isolation level read committed");
      await client.query("select set_config('nexora.tenant_id',$1,true)", [context.tenantId]);
      await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
        `nexora:hr:assignment:${context.tenantId}`,
      ]);
      await this.requireCompanyAccess(client, context, input.company_id);
      const path = `/api/v1/hr/employees/${employeeId}/profile_draft_assignment`,
        fingerprint = stateHash(input);
      const replay = await client.query<{ request_fingerprint: string; response_body: HrProfileDraftAssignmentResult }>(
        `select request_fingerprint,response_body from platform_admin_idempotency where tenant_id=$1 and actor_id=$2 and method='POST' and path=$3 and idempotency_key=$4 for update`,
        [context.tenantId, context.actor.userId, path, idempotencyKey],
      );
      if (replay.rows[0]) {
        if (replay.rows[0].request_fingerprint !== fingerprint)
          throw new HrApiError(
            409,
            "IDEMPOTENCY_CONFLICT",
            "The idempotency key was already used for another request.",
          );
        await client.query("commit");
        return { ...replay.rows[0].response_body, replayed: true };
      }
      const approved = await client.query(
        `select 1 from employee employee join hr_employee_draft_scope scope on scope.tenant_id=employee.tenant_id and scope.employee_id=employee.id join hr_employee_draft_approval approval on approval.tenant_id=employee.tenant_id and approval.employee_id=employee.id where employee.tenant_id=$1 and employee.id=$2 and scope.company_id=$3 and approval.state='approved'`,
        [context.tenantId, employeeId, input.company_id],
      );
      if (!approved.rowCount)
        throw new HrApiError(
          409,
          "HR_ASSIGNMENT_NOT_ALLOWED",
          "An approved employee draft in the selected company is required.",
        );
      const id = `employee-assignment-${randomUUID()}`;
      await client.query(
        `insert into employee_assignment (id,tenant_id,employee_id,company_id,branch_id,department_id,designation_id,job_grade_id,cost_center_id,work_location_id,employment_type_id,employee_category_id,reporting_manager_id,effective_from,change_reason,created_by,assignment_status,source_reference) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'initial_appointment',$15,'profile_draft','hr:profile-draft-assignment')`,
        [
          id,
          context.tenantId,
          employeeId,
          input.company_id,
          input.branch_id ?? null,
          input.department_id ?? null,
          input.designation_id,
          input.job_grade_id,
          input.cost_center_id,
          input.work_location_id,
          input.employment_type_id,
          input.employee_category_id,
          input.reporting_manager_id ?? null,
          input.effective_from,
          context.actor.userId,
        ],
      );
      const audit = await this.appendPlatformAudit(client, context, correlationId, "hr.employee_assignment.create", {
        entityId: id,
        before: null,
        after: { employee_id: employeeId, company_id: input.company_id, assignment_status: "profile_draft" },
      });
      const result = {
        id,
        employee_id: employeeId,
        company_id: input.company_id,
        assignment_status: "profile_draft" as const,
        audit_event_id: audit,
        replayed: false,
      };
      await client.query(
        `insert into platform_admin_idempotency (tenant_id,actor_id,method,path,idempotency_key,request_fingerprint,response_status,response_body,response_etag) values ($1,$2,'POST',$3,$4,$5,201,$6,$7)`,
        [context.tenantId, context.actor.userId, path, idempotencyKey, fingerprint, result, stateHash(result)],
      );
      await client.query("commit");
      return result;
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async listEmployeeContacts(context: HrActorContext, employeeId: string): Promise<HrEmployeeContactDirectory> {
    return this.read(context, "hr.employee_contact.read", async (client) => {
      await this.requireActiveEmployeeCompanyScope(client, context, employeeId);
      const result = await client.query<{
        id: string;
        employee_id: string;
        channel: "email" | "phone";
        contact_usage: "work" | "personal" | "other";
        contact_value: string;
        label: string;
        is_primary: boolean;
        effective_from: string | Date;
        created_at: string | Date;
      }>(
        `select id,employee_id,channel,contact_usage,contact_value,label,is_primary,effective_from,created_at
           from employee_contact
          where tenant_id=$1 and employee_id=$2 and channel in ('email','phone')
            and status='active' and effective_from<=current_date
            and (effective_to is null or effective_to>=current_date)
          order by channel,contact_usage,is_primary desc,effective_from desc,id
          limit 100`,
        [context.tenantId, employeeId],
      );
      return {
        items: result.rows.map((row) => ({
          ...row,
          effective_from: dateOnly(row.effective_from),
          created_at: new Date(row.created_at).toISOString(),
        })),
      };
    });
  }

  async createEmployeeContact(
    context: HrActorContext,
    employeeId: string,
    input: CreateHrEmployeeContactRequest,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<HrEmployeeContactResult> {
    if (!validIdempotencyKey(idempotencyKey))
      throw new HrApiError(400, "INVALID_IDEMPOTENCY_KEY", "The idempotency key is invalid.");
    if (!context.actor.permissions.includes("hr.employee_contact.manage"))
      throw new HrApiError(403, "PERMISSION_DENIED", "You are not permitted to manage employee contacts.");
    const client = await this.pool.connect();
    try {
      await client.query("begin isolation level read committed");
      await client.query("select set_config('nexora.tenant_id',$1,true)", [context.tenantId]);
      await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
        `nexora:hr:employee-contact:${context.tenantId}:${employeeId}`,
      ]);
      await this.requireActiveEmployeeCompanyScope(client, context, employeeId);
      const path = `/api/v1/hr/employees/${employeeId}/contacts`;
      const fingerprint = stateHash(input);
      const replay = await client.query<{ request_fingerprint: string; response_body: HrEmployeeContactResult }>(
        `select request_fingerprint,response_body from platform_admin_idempotency where tenant_id=$1 and actor_id=$2 and method='POST' and path=$3 and idempotency_key=$4 for update`,
        [context.tenantId, context.actor.userId, path, idempotencyKey],
      );
      if (replay.rows[0]) {
        if (replay.rows[0].request_fingerprint !== fingerprint)
          throw new HrApiError(
            409,
            "IDEMPOTENCY_CONFLICT",
            "The idempotency key was already used for another request.",
          );
        await client.query("commit");
        return { ...replay.rows[0].response_body, replayed: true };
      }
      if (input.is_primary) {
        const primary = await client.query(
          `select 1 from employee_contact where tenant_id=$1 and employee_id=$2 and channel=$3 and contact_usage=$4
             and is_primary and status='active' and effective_to is null for update`,
          [context.tenantId, employeeId, input.channel, input.contact_usage],
        );
        if (primary.rowCount)
          throw new HrApiError(
            409,
            "HR_CONTACT_PRIMARY_EXISTS",
            "Close the existing primary contact through the governed contact-change workflow before adding another.",
          );
      }
      const id = `employee-contact-${randomUUID()}`;
      await client.query(
        `insert into employee_contact
          (id,tenant_id,employee_id,channel,contact_usage,contact_value,label,is_primary,status,effective_from,created_by,source_reference)
         values ($1,$2,$3,$4,$5,$6,$7,$8,'active',current_date,$9,'hr:employee-contact-create')`,
        [
          id,
          context.tenantId,
          employeeId,
          input.channel,
          input.contact_usage,
          input.contact_value,
          input.label ?? "",
          input.is_primary,
          context.actor.userId,
        ],
      );
      const audit = await this.appendPlatformAudit(client, context, correlationId, "hr.employee_contact.create", {
        entityId: id,
        before: null,
        after: {
          employee_id: employeeId,
          channel: input.channel,
          contact_usage: input.contact_usage,
          is_primary: input.is_primary,
        },
      });
      const result = { id, employee_id: employeeId, audit_event_id: audit, replayed: false };
      await client.query(
        `insert into platform_admin_idempotency (tenant_id,actor_id,method,path,idempotency_key,request_fingerprint,response_status,response_body,response_etag)
         values ($1,$2,'POST',$3,$4,$5,201,$6,$7)`,
        [context.tenantId, context.actor.userId, path, idempotencyKey, fingerprint, result, stateHash(result)],
      );
      await client.query("commit");
      return result;
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async listEmployeeEmergencyContacts(
    context: HrActorContext,
    employeeId: string,
  ): Promise<HrEmployeeEmergencyContactDirectory> {
    return this.read(context, "hr.employee_emergency_contact.read", async (client) => {
      await this.requireActiveEmployeeCompanyScope(client, context, employeeId);
      const result = await client.query<{
        id: string;
        employee_id: string;
        name: string;
        relationship: string;
        phone: string;
        email: string;
        priority: number;
        is_primary: boolean;
        effective_from: string | Date;
        created_at: string | Date;
      }>(
        `select id,employee_id,name,relationship,phone,email,priority,is_primary,effective_from,created_at
           from employee_emergency_contact
          where tenant_id=$1 and employee_id=$2 and status='active' and effective_from<=current_date
            and (effective_to is null or effective_to>=current_date)
          order by priority,effective_from desc,id
          limit 99`,
        [context.tenantId, employeeId],
      );
      return {
        items: result.rows.map((row) => ({
          ...row,
          effective_from: dateOnly(row.effective_from),
          created_at: new Date(row.created_at).toISOString(),
        })),
      };
    });
  }

  async createEmployeeEmergencyContact(
    context: HrActorContext,
    employeeId: string,
    input: CreateHrEmployeeEmergencyContactRequest,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<HrEmployeeEmergencyContactResult> {
    if (!validIdempotencyKey(idempotencyKey))
      throw new HrApiError(400, "INVALID_IDEMPOTENCY_KEY", "The idempotency key is invalid.");
    if (!context.actor.permissions.includes("hr.employee_emergency_contact.manage"))
      throw new HrApiError(403, "PERMISSION_DENIED", "You are not permitted to manage emergency contacts.");
    const client = await this.pool.connect();
    try {
      await client.query("begin isolation level read committed");
      await client.query("select set_config('nexora.tenant_id',$1,true)", [context.tenantId]);
      await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
        `nexora:hr:employee-emergency-contact:${context.tenantId}:${employeeId}`,
      ]);
      await this.requireActiveEmployeeCompanyScope(client, context, employeeId);
      const path = `/api/v1/hr/employees/${employeeId}/emergency_contacts`;
      const fingerprint = stateHash(input);
      const replay = await client.query<{
        request_fingerprint: string;
        response_body: HrEmployeeEmergencyContactResult;
      }>(
        `select request_fingerprint,response_body from platform_admin_idempotency where tenant_id=$1 and actor_id=$2 and method='POST' and path=$3 and idempotency_key=$4 for update`,
        [context.tenantId, context.actor.userId, path, idempotencyKey],
      );
      if (replay.rows[0]) {
        if (replay.rows[0].request_fingerprint !== fingerprint)
          throw new HrApiError(
            409,
            "IDEMPOTENCY_CONFLICT",
            "The idempotency key was already used for another request.",
          );
        await client.query("commit");
        return { ...replay.rows[0].response_body, replayed: true };
      }
      const conflict = await client.query(
        `select 1 from employee_emergency_contact
          where tenant_id=$1 and employee_id=$2 and status='active' and effective_to is null
            and (priority=$3 or ($4 and is_primary))
          for update`,
        [context.tenantId, employeeId, input.priority, input.is_primary],
      );
      if (conflict.rowCount)
        throw new HrApiError(
          409,
          "HR_EMERGENCY_CONTACT_CONFLICT",
          "The active emergency-contact priority or primary designation already exists.",
        );
      const id = `employee-emergency-contact-${randomUUID()}`;
      await client.query(
        `insert into employee_emergency_contact
          (id,tenant_id,employee_id,name,relationship,phone,email,priority,is_primary,status,effective_from,created_by,source_reference)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,'active',current_date,$10,'hr:employee-emergency-contact-create')`,
        [
          id,
          context.tenantId,
          employeeId,
          input.name,
          input.relationship,
          input.phone,
          input.email ?? "",
          input.priority,
          input.is_primary,
          context.actor.userId,
        ],
      );
      const audit = await this.appendPlatformAudit(
        client,
        context,
        correlationId,
        "hr.employee_emergency_contact.create",
        {
          entityId: id,
          before: null,
          after: { employee_id: employeeId, priority: input.priority, is_primary: input.is_primary },
        },
      );
      const result = { id, employee_id: employeeId, audit_event_id: audit, replayed: false };
      await client.query(
        `insert into platform_admin_idempotency (tenant_id,actor_id,method,path,idempotency_key,request_fingerprint,response_status,response_body,response_etag)
         values ($1,$2,'POST',$3,$4,$5,201,$6,$7)`,
        [context.tenantId, context.actor.userId, path, idempotencyKey, fingerprint, result, stateHash(result)],
      );
      await client.query("commit");
      return result;
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async listEmployeeDocuments(context: HrActorContext, employeeId: string): Promise<HrEmployeeDocumentDirectory> {
    return this.read(context, "hr.employee_document.read", async (client) => {
      await this.requireActiveEmployeeCompanyScope(client, context, employeeId);
      const result = await client.query<{
        id: string;
        employee_id: string;
        document_type: string;
        title: string;
        reference: string;
        issued_on: string | Date | null;
        expires_on: string | Date | null;
        restricted: boolean;
        issuing_authority: string;
        verification_status: "unverified" | "pending" | "verified" | "rejected" | "expired";
        status: "active" | "inactive";
        created_at: string | Date;
      }>(
        `select id,employee_id,document_type,title,reference,issued_on,expires_on,restricted,
                issuing_authority,verification_status,status,created_at
           from employee_document
          where tenant_id=$1 and employee_id=$2
          order by status='active' desc,expires_on nulls last,created_at desc,id
          limit 100`,
        [context.tenantId, employeeId],
      );
      return {
        items: result.rows.map((row) => ({
          ...row,
          issued_on: row.issued_on === null ? null : dateOnly(row.issued_on),
          expires_on: row.expires_on === null ? null : dateOnly(row.expires_on),
          created_at: new Date(row.created_at).toISOString(),
        })),
      };
    });
  }

  async listEmployeeAssignments(context: HrActorContext, employeeId: string): Promise<HrEmployeeAssignmentDirectory> {
    return this.read(context, "hr.employee_assignment.read", async (client) => {
      await this.requireEmployeeAssignmentCompanyScope(client, context, employeeId);
      const result = await client.query<EmployeeAssignmentRow>(
        `select assignment.id,assignment.employee_id,assignment.company_id,
                assignment.employment_relationship_id,assignment.branch_id,assignment.department_id,
                assignment.job_id,assignment.designation_id,assignment.job_grade_id,assignment.cost_center_id,
                assignment.work_location_id,assignment.employment_type_id,assignment.employee_category_id,
                assignment.reporting_manager_id,
                jsonb_build_object(
                  'business_unit_id',(select organization_unit_id from employee_assignment_org_unit
                    where tenant_id=assignment.tenant_id and assignment_id=assignment.id and organization_type='business_unit'),
                  'division_id',(select organization_unit_id from employee_assignment_org_unit
                    where tenant_id=assignment.tenant_id and assignment_id=assignment.id and organization_type='division'),
                  'branch_id',(select organization_unit_id from employee_assignment_org_unit
                    where tenant_id=assignment.tenant_id and assignment_id=assignment.id and organization_type='branch'),
                  'department_id',(select organization_unit_id from employee_assignment_org_unit
                    where tenant_id=assignment.tenant_id and assignment_id=assignment.id and organization_type='department'),
                  'warehouse_id',(select organization_unit_id from employee_assignment_org_unit
                    where tenant_id=assignment.tenant_id and assignment_id=assignment.id and organization_type='warehouse')
                ) as organization_placements,
                designation.name as designation,coalesce(job.name,'') as job,
                job_grade.name as job_grade,employment_type.name as employment_type,
                work_location.name as work_location,assignment.change_reason,
                assignment.assignment_status,assignment.effective_from,assignment.effective_to,assignment.created_at
           from employee_assignment assignment
           join hr_master_record designation
             on designation.tenant_id=assignment.tenant_id and designation.id=assignment.designation_id
           left join hr_master_record job
             on job.tenant_id=assignment.tenant_id and job.id=assignment.job_id
           join hr_master_record job_grade
             on job_grade.tenant_id=assignment.tenant_id and job_grade.id=assignment.job_grade_id
           join hr_master_record employment_type
             on employment_type.tenant_id=assignment.tenant_id and employment_type.id=assignment.employment_type_id
           join hr_master_record work_location
             on work_location.tenant_id=assignment.tenant_id and work_location.id=assignment.work_location_id
          where assignment.tenant_id=$1 and assignment.employee_id=$2
          order by assignment.effective_from desc, assignment.created_at desc, assignment.id desc
          limit 100`,
        [context.tenantId, employeeId],
      );
      return {
        items: result.rows.map((row) => ({
          ...row,
          effective_from: dateOnly(row.effective_from),
          effective_to: row.effective_to ? dateOnly(row.effective_to) : null,
          created_at: new Date(row.created_at).toISOString(),
        })),
      };
    });
  }

  async listEmployeeStatusHistory(
    context: HrActorContext,
    employeeId: string,
  ): Promise<HrEmployeeStatusHistoryDirectory> {
    return this.read(context, "hr.employment_history.read", async (client) => {
      await this.requireActiveEmployeeCompanyScope(client, context, employeeId);
      const result = await client.query<EmployeeStatusHistoryRow>(
        `select id,employee_id,from_status,to_status,effective_on,reason,created_at
           from employee_status_history
          where tenant_id=$1 and employee_id=$2
          order by effective_on desc,created_at desc,id desc
          limit 100`,
        [context.tenantId, employeeId],
      );
      return {
        items: result.rows.map((row) => ({
          ...row,
          effective_on: dateOnly(row.effective_on),
          created_at: new Date(row.created_at).toISOString(),
        })),
      };
    });
  }

  async listEmployeeLifecycleEvents(
    context: HrActorContext,
    employeeId: string,
    query: HrEmployeeHistoryQuery,
  ): Promise<HrEmployeeLifecycleEventDirectory> {
    return this.read(context, "hr.employment_history.read", async (client) => {
      await this.requireActiveEmployeeCompanyScope(client, context, employeeId);
      const cursor = decodeEmployeeHistoryCursor(query.cursor, "lifecycle");
      const values: unknown[] = [context.tenantId, employeeId];
      const cursorFilter = cursor
        ? `and (event.recorded_at,event.id)<($${values.push(cursor.recordedAt)}::timestamptz,$${values.push(cursor.id)})`
        : "";
      values.push(query.limit + 1);
      const result = await client.query<EmployeeLifecycleEventRow>(
        `select event.id,event.relationship_id,event.sequence,event.event_type,event.effective_on,
                case when previous_state.id is null then null else jsonb_build_object(
                  'code',previous_state.code,'label',previous_state.label,
                  'canonical_class',previous_state.canonical_class
                ) end as previous_state,
                jsonb_build_object(
                  'code',resulting_state.code,'label',resulting_state.label,
                  'canonical_class',resulting_state.canonical_class
                ) as resulting_state,
                event.reason,event.source_reference,event.recorded_at,event.approved_at
           from hr_employment_event event
           join hr_employment_relationship relationship
             on relationship.tenant_id=event.tenant_id and relationship.id=event.relationship_id
           left join hr_employment_lifecycle_state previous_state
             on previous_state.tenant_id=event.tenant_id and previous_state.id=event.previous_state_id
           join hr_employment_lifecycle_state resulting_state
             on resulting_state.tenant_id=event.tenant_id and resulting_state.id=event.resulting_state_id
          where event.tenant_id=$1 and relationship.employee_id=$2 ${cursorFilter}
          order by event.recorded_at desc,event.id desc
          limit $${values.length}`,
        values,
      );
      const hasMore = result.rows.length > query.limit;
      const page = result.rows.slice(0, query.limit);
      const last = page.at(-1);
      return {
        items: page.map((row) => ({
          ...row,
          effective_on: dateOnly(row.effective_on),
          recorded_at: new Date(row.recorded_at).toISOString(),
          approved_at: new Date(row.approved_at).toISOString(),
        })),
        next_cursor: hasMore && last ? encodeEmployeeHistoryCursor("lifecycle", last.recorded_at, last.id) : null,
      };
    });
  }

  async listEmployeeProfileHistory(
    context: HrActorContext,
    employeeId: string,
    query: HrEmployeeHistoryQuery,
  ): Promise<HrEmployeeProfileVersionDirectory> {
    return this.read(context, "hr.employment_history.read", async (client) => {
      await this.requireActiveEmployeeCompanyScope(client, context, employeeId);
      const cursor = decodeEmployeeHistoryCursor(query.cursor, "profile");
      const values: unknown[] = [context.tenantId, employeeId];
      const cursorFilter = cursor
        ? `and (version.recorded_at,version.id)<($${values.push(cursor.recordedAt)}::timestamptz,$${values.push(cursor.id)})`
        : "";
      values.push(query.limit + 1);
      const result = await client.query<EmployeeProfileVersionRow>(
        `select version.id,version.revision,version.effective_from,version.effective_to,
                version.first_name,version.middle_name,version.last_name,version.preferred_name,
                version.work_email,version.source_reference,version.recorded_at
           from hr_employee_profile_version version
          where version.tenant_id=$1 and version.employee_id=$2 ${cursorFilter}
          order by version.recorded_at desc,version.id desc
          limit $${values.length}`,
        values,
      );
      const hasMore = result.rows.length > query.limit;
      const page = result.rows.slice(0, query.limit);
      const last = page.at(-1);
      return {
        items: page.map((row) => ({
          ...row,
          effective_from: dateOnly(row.effective_from),
          effective_to: row.effective_to === null ? null : dateOnly(row.effective_to),
          capture_origin: row.source_reference.startsWith("migration:") ? "migration_baseline" : "recorded_change",
          recorded_at: new Date(row.recorded_at).toISOString(),
        })),
        next_cursor: hasMore && last ? encodeEmployeeHistoryCursor("profile", last.recorded_at, last.id) : null,
      };
    });
  }

  async listEmploymentLifecyclePolicies(
    context: HrActorContext,
    query: HrEmploymentLifecyclePolicyDirectoryQuery,
  ): Promise<HrEmploymentLifecyclePolicyDirectory> {
    return this.read(context, "hr.employment_lifecycle_policy.read", async (client) => {
      await this.requireCompanyAccess(client, context, query.company_id);
      const result = await client.query<EmploymentLifecyclePolicyRow>(
        `select id,legal_employer_id as company_id,code,name,version,status,effective_from,effective_to,
                created_by,submitted_by
           from hr_employment_lifecycle_policy
          where tenant_id=$1 and legal_employer_id=$2
          order by effective_from desc,version desc,code,id
          limit $3`,
        [context.tenantId, query.company_id, query.limit],
      );
      return {
        items: result.rows.map((row) => {
          const { created_by, submitted_by, ...policy } = row;
          return {
            ...policy,
            effective_from: dateOnly(row.effective_from),
            effective_to: row.effective_to ? dateOnly(row.effective_to) : null,
            ...approvalOverrideReviewMetadata(
              context,
              [created_by, submitted_by ?? ""],
              "hr.employment_lifecycle_policy.approve",
            ),
          };
        }),
      };
    });
  }

  async createEmploymentLifecyclePolicy(
    context: HrActorContext,
    input: CreateHrEmploymentLifecyclePolicyRequest,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<HrEmploymentLifecyclePolicyResult> {
    if (!validIdempotencyKey(idempotencyKey))
      throw new HrApiError(400, "INVALID_IDEMPOTENCY_KEY", "The idempotency key is invalid.");
    if (!context.actor.permissions.includes("hr.employment_lifecycle_policy.manage"))
      throw new HrApiError(403, "PERMISSION_DENIED", "You are not permitted to manage lifecycle policies.");
    const client = await this.pool.connect();
    try {
      await client.query("begin isolation level read committed");
      await client.query("select set_config('nexora.tenant_id',$1,true)", [context.tenantId]);
      await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
        `nexora:hr:lifecycle-policy:${context.tenantId}:${input.company_id}:${input.code}`,
      ]);
      await this.requireCompanyAccess(client, context, input.company_id);
      const path = "/api/v1/hr/employment_lifecycle_policies";
      const fingerprint = stateHash(input);
      const replay = await client.query<{
        request_fingerprint: string;
        response_body: HrEmploymentLifecyclePolicyResult;
      }>(
        `select request_fingerprint,response_body from platform_admin_idempotency
          where tenant_id=$1 and actor_id=$2 and method='POST' and path=$3 and idempotency_key=$4 for update`,
        [context.tenantId, context.actor.userId, path, idempotencyKey],
      );
      if (replay.rows[0]) {
        if (replay.rows[0].request_fingerprint !== fingerprint)
          throw new HrApiError(
            409,
            "IDEMPOTENCY_CONFLICT",
            "The idempotency key was already used for another request.",
          );
        await client.query("commit");
        return { ...replay.rows[0].response_body, replayed: true };
      }
      const versionResult = await client.query<{ version: number }>(
        `select coalesce(max(version),0)::integer as version
           from hr_employment_lifecycle_policy
          where tenant_id=$1 and legal_employer_id=$2 and code=$3`,
        [context.tenantId, input.company_id, input.code],
      );
      const id = `employment-lifecycle-policy-${randomUUID()}`;
      const version = (versionResult.rows[0]?.version ?? 0) + 1;
      await client.query(
        `insert into hr_employment_lifecycle_policy
          (id,tenant_id,legal_employer_id,code,name,version,status,effective_from,effective_to,created_by)
         values ($1,$2,$3,$4,$5,$6,'draft',$7,$8,$9)`,
        [
          id,
          context.tenantId,
          input.company_id,
          input.code,
          input.name,
          version,
          input.effective_from,
          input.effective_to ?? null,
          context.actor.userId,
        ],
      );
      const preEmploymentStateId = `employment-lifecycle-state-${randomUUID()}`;
      const employedStateId = `employment-lifecycle-state-${randomUUID()}`;
      await client.query(
        `insert into hr_employment_lifecycle_state
          (id,tenant_id,policy_id,code,label,canonical_class,is_initial,display_order)
         values
          ($1,$2,$3,'pre_employment','Pre-employment','pre_employment',true,1),
          ($4,$2,$3,'employed','Employed','employed',false,2)`,
        [preEmploymentStateId, context.tenantId, id, employedStateId],
      );
      await client.query(
        `insert into hr_employment_lifecycle_transition
          (id,tenant_id,policy_id,event_type,from_state_id,to_state_id,requires_approval,workflow_trigger)
         values ($1,$2,$3,'hire',$4,$5,true,'hr_employment_hire')`,
        [
          `employment-lifecycle-transition-${randomUUID()}`,
          context.tenantId,
          id,
          preEmploymentStateId,
          employedStateId,
        ],
      );
      const audit = await this.appendPlatformAudit(
        client,
        context,
        correlationId,
        "hr.employment_lifecycle_policy.create",
        {
          entityId: id,
          entityType: "employment_lifecycle_policy",
          before: null,
          after: { company_id: input.company_id, code: input.code, version, status: "draft" },
        },
      );
      const result: HrEmploymentLifecyclePolicyResult = {
        id,
        company_id: input.company_id,
        code: input.code,
        name: input.name,
        version,
        status: "draft",
        audit_event_id: audit,
        replayed: false,
      };
      await client.query(
        `insert into platform_admin_idempotency
          (tenant_id,actor_id,method,path,idempotency_key,request_fingerprint,response_status,response_body,response_etag)
         values ($1,$2,'POST',$3,$4,$5,201,$6,$7)`,
        [context.tenantId, context.actor.userId, path, idempotencyKey, fingerprint, result, stateHash(result)],
      );
      await client.query("commit");
      return result;
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async submitEmploymentLifecyclePolicy(
    context: HrActorContext,
    policyId: string,
    input: SubmitHrEmploymentLifecyclePolicyRequest,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<HrEmploymentLifecyclePolicySubmissionResult> {
    if (!validIdempotencyKey(idempotencyKey))
      throw new HrApiError(400, "INVALID_IDEMPOTENCY_KEY", "The idempotency key is invalid.");
    if (!context.actor.permissions.includes("hr.employment_lifecycle_policy.manage"))
      throw new HrApiError(403, "PERMISSION_DENIED", "You are not permitted to submit lifecycle policies.");
    const client = await this.pool.connect();
    try {
      await client.query("begin isolation level read committed");
      await client.query("select set_config('nexora.tenant_id',$1,true)", [context.tenantId]);
      await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
        `nexora:hr:lifecycle-policy-submit:${context.tenantId}:${policyId}`,
      ]);
      const path = `/api/v1/hr/employment_lifecycle_policies/${policyId}/submit`;
      const fingerprint = stateHash(input);
      const replay = await client.query<{
        request_fingerprint: string;
        response_body: HrEmploymentLifecyclePolicySubmissionResult;
      }>(
        `select request_fingerprint,response_body from platform_admin_idempotency
          where tenant_id=$1 and actor_id=$2 and method='POST' and path=$3 and idempotency_key=$4 for update`,
        [context.tenantId, context.actor.userId, path, idempotencyKey],
      );
      if (replay.rows[0]) {
        if (replay.rows[0].request_fingerprint !== fingerprint)
          throw new HrApiError(
            409,
            "IDEMPOTENCY_CONFLICT",
            "The idempotency key was already used for another request.",
          );
        await client.query("commit");
        return { ...replay.rows[0].response_body, replayed: true };
      }
      const policy = await client.query<{
        company_id: string;
        code: string;
        name: string;
        version: number;
        status: "draft" | "pending_approval" | "approved" | "active" | "inactive";
      }>(
        `select legal_employer_id as company_id,code,name,version,status
           from hr_employment_lifecycle_policy
          where tenant_id=$1 and id=$2
            and exists (select 1 from security_user_company_access access where access.tenant_id=hr_employment_lifecycle_policy.tenant_id and access.user_id=$3 and access.company_id=hr_employment_lifecycle_policy.legal_employer_id and access.revoked_at is null)
          for update`,
        [context.tenantId, policyId, context.actor.userId],
      );
      const before = policy.rows[0];
      if (!before || before.status !== "draft")
        throw new HrApiError(
          409,
          "HR_LIFECYCLE_POLICY_NOT_DRAFT",
          "The lifecycle policy is not a draft in your company scope.",
        );
      await client.query(
        `update hr_employment_lifecycle_policy
            set status='pending_approval',submitted_by=$3,submitted_at=now(),updated_at=now()
          where tenant_id=$1 and id=$2`,
        [context.tenantId, policyId, context.actor.userId],
      );
      const audit = await this.appendPlatformAudit(
        client,
        context,
        correlationId,
        "hr.employment_lifecycle_policy.submit",
        {
          entityId: policyId,
          entityType: "employment_lifecycle_policy",
          before: { ...before, status: "draft" },
          after: { ...before, status: "pending_approval", reason: input.reason },
        },
      );
      const result: HrEmploymentLifecyclePolicySubmissionResult = {
        id: policyId,
        company_id: before.company_id,
        code: before.code,
        name: before.name,
        version: before.version,
        status: "pending_approval",
        audit_event_id: audit,
        replayed: false,
      };
      await client.query(
        `insert into platform_admin_idempotency
          (tenant_id,actor_id,method,path,idempotency_key,request_fingerprint,response_status,response_body,response_etag)
         values ($1,$2,'POST',$3,$4,$5,200,$6,$7)`,
        [context.tenantId, context.actor.userId, path, idempotencyKey, fingerprint, result, stateHash(result)],
      );
      await client.query("commit");
      return result;
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async approveEmploymentLifecyclePolicy(
    context: HrActorContext,
    policyId: string,
    input: ApproveHrEmploymentLifecyclePolicyRequest,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<HrEmploymentLifecyclePolicyApprovalResult> {
    if (!validIdempotencyKey(idempotencyKey))
      throw new HrApiError(400, "INVALID_IDEMPOTENCY_KEY", "The idempotency key is invalid.");
    if (!context.actor.permissions.includes("hr.employment_lifecycle_policy.approve"))
      throw new HrApiError(403, "PERMISSION_DENIED", "You are not permitted to approve lifecycle policies.");
    const client = await this.pool.connect();
    try {
      await client.query("begin isolation level read committed");
      await client.query("select set_config('nexora.tenant_id',$1,true)", [context.tenantId]);
      await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
        `nexora:hr:lifecycle-policy-approval:${context.tenantId}:${policyId}`,
      ]);
      const path = `/api/v1/hr/employment_lifecycle_policies/${policyId}/approval_decision`;
      const fingerprint = stateHash(input);
      const replay = await client.query<{
        request_fingerprint: string;
        response_body: HrEmploymentLifecyclePolicyApprovalResult;
      }>(
        `select request_fingerprint,response_body from platform_admin_idempotency
          where tenant_id=$1 and actor_id=$2 and method='POST' and path=$3 and idempotency_key=$4 for update`,
        [context.tenantId, context.actor.userId, path, idempotencyKey],
      );
      if (replay.rows[0]) {
        if (replay.rows[0].request_fingerprint !== fingerprint)
          throw new HrApiError(
            409,
            "IDEMPOTENCY_CONFLICT",
            "The idempotency key was already used for another request.",
          );
        await client.query("commit");
        return { ...replay.rows[0].response_body, replayed: true };
      }
      const policy = await client.query<{
        company_id: string;
        code: string;
        name: string;
        version: number;
        created_by: string;
        submitted_by: string | null;
      }>(
        `select legal_employer_id as company_id,code,name,version,created_by,submitted_by
           from hr_employment_lifecycle_policy
          where tenant_id=$1 and id=$2 and status='pending_approval'
            and exists (select 1 from security_user_company_access access where access.tenant_id=hr_employment_lifecycle_policy.tenant_id and access.user_id=$3 and access.company_id=hr_employment_lifecycle_policy.legal_employer_id and access.revoked_at is null)
          for update`,
        [context.tenantId, policyId, context.actor.userId],
      );
      const before = policy.rows[0];
      if (!before)
        throw new HrApiError(
          409,
          "HR_LIFECYCLE_POLICY_NOT_PENDING",
          "The lifecycle policy is not pending in your company scope.",
        );
      const approvalOverrideEventId = await this.resolveApprovalOverride(client, context, {
        normalDecisionPermission: "hr.employment_lifecycle_policy.approve",
        makerActorIds: [before.created_by, before.submitted_by ?? ""],
        resourceType: "hr.employment_lifecycle_policy",
        resourceId: policyId,
        decisionAction: "approve",
        reason: input.reason,
        correlationId,
        idempotencyKey,
      });
      await client.query(
        `update hr_employment_lifecycle_policy
            set status='approved',approved_by=$3,approved_at=now(),updated_at=now(),
                approval_override_event_id=$4
          where tenant_id=$1 and id=$2`,
        [context.tenantId, policyId, context.actor.userId, approvalOverrideEventId],
      );
      const audit = await this.appendPlatformAudit(
        client,
        context,
        correlationId,
        "hr.employment_lifecycle_policy.approve",
        {
          entityId: policyId,
          entityType: "employment_lifecycle_policy",
          before: { ...before, status: "pending_approval" },
          after: {
            ...before,
            status: "approved",
            reason: input.reason,
            super_admin_override: approvalOverrideEventId !== null,
          },
        },
      );
      const result: HrEmploymentLifecyclePolicyApprovalResult = {
        id: policyId,
        company_id: before.company_id,
        code: before.code,
        name: before.name,
        version: before.version,
        status: "approved",
        audit_event_id: audit,
        replayed: false,
      };
      await client.query(
        `insert into platform_admin_idempotency
          (tenant_id,actor_id,method,path,idempotency_key,request_fingerprint,response_status,response_body,response_etag)
         values ($1,$2,'POST',$3,$4,$5,200,$6,$7)`,
        [context.tenantId, context.actor.userId, path, idempotencyKey, fingerprint, result, stateHash(result)],
      );
      await client.query("commit");
      return result;
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async activateEmploymentLifecyclePolicy(
    context: HrActorContext,
    policyId: string,
    input: ActivateHrEmploymentLifecyclePolicyRequest,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<HrEmploymentLifecyclePolicyActivationResult> {
    if (!validIdempotencyKey(idempotencyKey))
      throw new HrApiError(400, "INVALID_IDEMPOTENCY_KEY", "The idempotency key is invalid.");
    if (!context.actor.permissions.includes("hr.employment_lifecycle_policy.approve"))
      throw new HrApiError(403, "PERMISSION_DENIED", "You are not permitted to activate lifecycle policies.");
    const client = await this.pool.connect();
    try {
      await client.query("begin isolation level read committed");
      await client.query("select set_config('nexora.tenant_id',$1,true)", [context.tenantId]);
      await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
        `nexora:hr:lifecycle-policy-activation:${context.tenantId}:${policyId}`,
      ]);
      const path = `/api/v1/hr/employment_lifecycle_policies/${policyId}/activate`;
      const fingerprint = stateHash(input);
      const replay = await client.query<{
        request_fingerprint: string;
        response_body: HrEmploymentLifecyclePolicyActivationResult;
      }>(
        `select request_fingerprint,response_body from platform_admin_idempotency where tenant_id=$1 and actor_id=$2 and method='POST' and path=$3 and idempotency_key=$4 for update`,
        [context.tenantId, context.actor.userId, path, idempotencyKey],
      );
      if (replay.rows[0]) {
        if (replay.rows[0].request_fingerprint !== fingerprint)
          throw new HrApiError(
            409,
            "IDEMPOTENCY_CONFLICT",
            "The idempotency key was already used for another request.",
          );
        await client.query("commit");
        return { ...replay.rows[0].response_body, replayed: true };
      }
      const policy = await client.query<{
        company_id: string;
        code: string;
        name: string;
        version: number;
        created_by: string;
        submitted_by: string | null;
      }>(
        `select legal_employer_id as company_id,code,name,version,created_by,submitted_by
           from hr_employment_lifecycle_policy
          where tenant_id=$1 and id=$2 and status='approved' and effective_from<=current_date and (effective_to is null or effective_to>=current_date)
            and exists (select 1 from security_user_company_access access where access.tenant_id=hr_employment_lifecycle_policy.tenant_id and access.user_id=$3 and access.company_id=hr_employment_lifecycle_policy.legal_employer_id and access.revoked_at is null)
          for update`,
        [context.tenantId, policyId, context.actor.userId],
      );
      const before = policy.rows[0];
      if (!before)
        throw new HrApiError(
          409,
          "HR_LIFECYCLE_POLICY_NOT_ACTIVATABLE",
          "The policy must be approved, currently effective, and within your company scope.",
        );
      const activationOverrideEventId = await this.resolveApprovalOverride(client, context, {
        normalDecisionPermission: "hr.employment_lifecycle_policy.approve",
        makerActorIds: [before.created_by, before.submitted_by ?? ""],
        resourceType: "hr.employment_lifecycle_policy",
        resourceId: policyId,
        decisionAction: "activate",
        reason: input.reason,
        correlationId,
        idempotencyKey,
      });
      const overlapping = await client.query(
        `select 1 from hr_employment_lifecycle_policy where tenant_id=$1 and legal_employer_id=$2 and status='active'
           and daterange(effective_from,effective_to,'[]') && daterange(current_date,current_date,'[]') limit 1`,
        [context.tenantId, before.company_id],
      );
      if (overlapping.rowCount)
        throw new HrApiError(
          409,
          "HR_LIFECYCLE_POLICY_ACTIVE_EXISTS",
          "An active lifecycle policy already governs this company today.",
        );
      await client.query(
        `update hr_employment_lifecycle_policy
            set status='active',activated_by=$3,activated_at=now(),updated_at=now(),
                activation_override_event_id=$4
          where tenant_id=$1 and id=$2`,
        [context.tenantId, policyId, context.actor.userId, activationOverrideEventId],
      );
      const audit = await this.appendPlatformAudit(
        client,
        context,
        correlationId,
        "hr.employment_lifecycle_policy.activate",
        {
          entityId: policyId,
          entityType: "employment_lifecycle_policy",
          before: { ...before, status: "approved" },
          after: {
            ...before,
            status: "active",
            reason: input.reason,
            super_admin_override: activationOverrideEventId !== null,
          },
        },
      );
      const result: HrEmploymentLifecyclePolicyActivationResult = {
        id: policyId,
        company_id: before.company_id,
        code: before.code,
        name: before.name,
        version: before.version,
        status: "active",
        audit_event_id: audit,
        replayed: false,
      };
      await client.query(
        `insert into platform_admin_idempotency (tenant_id,actor_id,method,path,idempotency_key,request_fingerprint,response_status,response_body,response_etag) values ($1,$2,'POST',$3,$4,$5,200,$6,$7)`,
        [context.tenantId, context.actor.userId, path, idempotencyKey, fingerprint, result, stateHash(result)],
      );
      await client.query("commit");
      return result;
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async createEmployeeHireRequest(
    context: HrActorContext,
    employeeId: string,
    input: CreateHrEmployeeHireRequest,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<HrEmployeeHireRequestResult> {
    if (!validIdempotencyKey(idempotencyKey))
      throw new HrApiError(400, "INVALID_IDEMPOTENCY_KEY", "The idempotency key is invalid.");
    if (
      !context.actor.permissions.includes("hr.employment_lifecycle.action") ||
      !context.actor.permissions.includes("hr.employment_relationship.create")
    )
      throw new HrApiError(403, "PERMISSION_DENIED", "You are not permitted to request an employee hire.");
    const client = await this.pool.connect();
    try {
      await client.query("begin isolation level serializable");
      await client.query("select set_config('nexora.tenant_id',$1,true)", [context.tenantId]);
      await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
        `nexora:hr:hire:${context.tenantId}:${employeeId}:${input.company_id}`,
      ]);
      await this.requireCompanyAccess(client, context, input.company_id);
      const path = `/api/v1/hr/employees/${employeeId}/hire_requests`,
        fingerprint = stateHash(input);
      const replay = await client.query<{ request_fingerprint: string; response_body: HrEmployeeHireRequestResult }>(
        `select request_fingerprint,response_body from platform_admin_idempotency where tenant_id=$1 and actor_id=$2 and method='POST' and path=$3 and idempotency_key=$4 for update`,
        [context.tenantId, context.actor.userId, path, idempotencyKey],
      );
      if (replay.rows[0]) {
        if (replay.rows[0].request_fingerprint !== fingerprint)
          throw new HrApiError(
            409,
            "IDEMPOTENCY_CONFLICT",
            "The idempotency key was already used for another request.",
          );
        await client.query("commit");
        return { ...replay.rows[0].response_body, replayed: true };
      }
      const eligibility = await client.query<{ policy_id: string; transition_id: string; resulting_state_id: string }>(
        `select policy.id as policy_id, transition.id as transition_id, transition.to_state_id as resulting_state_id
           from hr_employee_draft_approval approval
           join hr_employee_draft_scope scope on scope.tenant_id=approval.tenant_id and scope.employee_id=approval.employee_id
           join employee_assignment assignment on assignment.tenant_id=approval.tenant_id and assignment.id=$4
           join hr_master_record job on job.tenant_id=assignment.tenant_id and job.id=$5
           join hr_employment_lifecycle_policy policy on policy.tenant_id=approval.tenant_id and policy.legal_employer_id=scope.company_id
           join hr_employment_lifecycle_transition transition on transition.tenant_id=policy.tenant_id and transition.policy_id=policy.id and transition.event_type='hire'
          where approval.tenant_id=$1 and approval.employee_id=$2 and approval.state='approved'
            and scope.company_id=$3 and assignment.employee_id=$2 and assignment.company_id=$3 and assignment.assignment_status='profile_draft'
            and job.company_id=$3 and job.master_type='job' and job.status='active'
            and policy.status='active' and policy.effective_from<= $6 and (policy.effective_to is null or policy.effective_to >= $6)
            and transition.requires_approval=true
            and not exists (select 1 from hr_employment_relationship relationship join hr_employment_lifecycle_request request on request.tenant_id=relationship.tenant_id and request.relationship_id=relationship.id where relationship.tenant_id=$1 and relationship.employee_id=$2 and relationship.legal_employer_id=$3 and request.approval_state='pending')
          limit 1`,
        [
          context.tenantId,
          employeeId,
          input.company_id,
          input.profile_draft_assignment_id,
          input.job_id,
          input.effective_on,
        ],
      );
      const governing = eligibility.rows[0];
      if (!governing)
        throw new HrApiError(
          409,
          "HR_HIRE_NOT_ALLOWED",
          "An approved employee draft, active policy, active job, and matching profile draft assignment are required.",
        );
      const relationshipId = `employment-relationship-${randomUUID()}`;
      const requestId = `employment-lifecycle-request-${randomUUID()}`;
      await client.query(
        `insert into hr_employment_relationship (id,tenant_id,employee_id,legal_employer_id,relationship_number,status,effective_from,lifecycle_policy_id,approval_state,created_by)
         values ($1,$2,$3,$4,$5,'draft',$6,$7,'pending',$8)`,
        [
          relationshipId,
          context.tenantId,
          employeeId,
          input.company_id,
          `HIRE-${randomUUID()}`,
          input.effective_on,
          governing.policy_id,
          context.actor.userId,
        ],
      );
      await client.query(
        `insert into hr_employment_lifecycle_request (id,tenant_id,relationship_id,transition_id,effective_on,reason,source_reference,resulting_state_id,approval_state,requested_by,job_id,profile_draft_assignment_id)
         values ($1,$2,$3,$4,$5,$6,$7,$8,'pending',$9,$10,$11)`,
        [
          requestId,
          context.tenantId,
          relationshipId,
          governing.transition_id,
          input.effective_on,
          input.reason,
          `hr:hire-request:${employeeId}`,
          governing.resulting_state_id,
          context.actor.userId,
          input.job_id,
          input.profile_draft_assignment_id,
        ],
      );
      const audit = await this.appendPlatformAudit(
        client,
        context,
        correlationId,
        "hr.employment_lifecycle.hire.request",
        {
          entityId: requestId,
          entityType: "employment_relationship",
          before: null,
          after: {
            employee_id: employeeId,
            company_id: input.company_id,
            relationship_id: relationshipId,
            status: "pending_approval",
          },
        },
      );
      const result: HrEmployeeHireRequestResult = {
        id: requestId,
        employee_id: employeeId,
        company_id: input.company_id,
        relationship_id: relationshipId,
        lifecycle_request_id: requestId,
        status: "pending_approval",
        audit_event_id: audit,
        replayed: false,
      };
      await client.query(
        `insert into platform_admin_idempotency (tenant_id,actor_id,method,path,idempotency_key,request_fingerprint,response_status,response_body,response_etag)
         values ($1,$2,'POST',$3,$4,$5,201,$6,$7)`,
        [context.tenantId, context.actor.userId, path, idempotencyKey, fingerprint, result, stateHash(result)],
      );
      await client.query("commit");
      return result;
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async listEmployeeHireRequests(
    context: HrActorContext,
    query: HrEmployeeHireRequestDirectoryQuery,
  ): Promise<HrEmployeeHireRequestDirectory> {
    return this.read(context, "hr.employment_lifecycle.approve", async (client) => {
      await this.requireCompanyAccess(client, context, query.company_id);
      const values: unknown[] = [context.tenantId, query.company_id];
      const filters = [
        "request.tenant_id=$1",
        "relationship.legal_employer_id=$2",
        "request.approval_state='pending'",
        "transition.event_type='hire'",
      ];
      if (query.search) {
        const parameter = values.push(`%${query.search.replace(/[\\%_]/g, "\\$&")}%`);
        filters.push(
          `(employee.employee_number ilike $${parameter} escape '\\' or concat_ws(' ',employee.first_name,employee.middle_name,employee.last_name) ilike $${parameter} escape '\\' or job.code ilike $${parameter} escape '\\' or job.name ilike $${parameter} escape '\\')`,
        );
      }
      values.push(query.limit);
      const result = await client.query<EmployeeHireRequestReviewRow>(
        `${this.employeeHireRequestReviewSelect()}
          where ${filters.join(" and ")}
          order by request.requested_at,request.id
          limit $${values.length}`,
        values,
      );
      return { items: result.rows.map((row) => employeeHireRequestReview(row, context)) };
    });
  }

  async getEmployeeHireRequest(
    context: HrActorContext,
    employeeId: string,
    requestId: string,
  ): Promise<HrEmployeeHireRequestReview> {
    return this.read(context, "hr.employment_lifecycle.approve", async (client) => {
      const result = await client.query<EmployeeHireRequestReviewRow>(
        `${this.employeeHireRequestReviewSelect()}
          where request.tenant_id=$1 and request.id=$2 and employee.id=$3 and transition.event_type='hire'
            and exists (
              select 1 from security_user_company_access access
               where access.tenant_id=request.tenant_id and access.user_id=$4
                 and access.company_id=relationship.legal_employer_id and access.revoked_at is null
            )`,
        [context.tenantId, requestId, employeeId, context.actor.userId],
      );
      const row = result.rows[0];
      if (!row)
        throw new HrApiError(
          404,
          "HR_HIRE_REQUEST_NOT_FOUND",
          "The employee Hire request is unavailable in your company scope.",
        );
      return employeeHireRequestReview(row, context);
    });
  }

  async decideEmployeeHireRequest(
    context: HrActorContext,
    employeeId: string,
    requestId: string,
    input: DecideHrEmployeeHireRequest,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<HrEmployeeHireDecisionResult> {
    if (!validIdempotencyKey(idempotencyKey))
      throw new HrApiError(400, "INVALID_IDEMPOTENCY_KEY", "The idempotency key is invalid.");
    if (!context.actor.permissions.includes("hr.employment_lifecycle.approve"))
      throw new HrApiError(403, "PERMISSION_DENIED", "You are not permitted to decide employee hire requests.");
    const client = await this.pool.connect();
    try {
      await client.query("begin isolation level serializable");
      await client.query("select set_config('nexora.tenant_id',$1,true)", [context.tenantId]);
      await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
        `nexora:hr:hire-decision:${context.tenantId}:${requestId}`,
      ]);
      const path = `/api/v1/hr/employees/${employeeId}/hire_requests/${requestId}/decision`,
        fingerprint = stateHash(input);
      const replay = await client.query<{ request_fingerprint: string; response_body: HrEmployeeHireDecisionResult }>(
        `select request_fingerprint,response_body from platform_admin_idempotency where tenant_id=$1 and actor_id=$2 and method='POST' and path=$3 and idempotency_key=$4 for update`,
        [context.tenantId, context.actor.userId, path, idempotencyKey],
      );
      if (replay.rows[0]) {
        if (replay.rows[0].request_fingerprint !== fingerprint)
          throw new HrApiError(
            409,
            "IDEMPOTENCY_CONFLICT",
            "The idempotency key was already used for another request.",
          );
        await client.query("commit");
        return { ...replay.rows[0].response_body, replayed: true };
      }
      const pending = await client.query<{
        company_id: string;
        relationship_id: string;
        requested_by: string;
        effective_on: string;
        reason: string;
        resulting_state_id: string;
        job_id: string;
        profile_draft_assignment_id: string;
        branch_id: string | null;
        department_id: string | null;
        designation_id: string;
        job_grade_id: string;
        cost_center_id: string;
        work_location_id: string;
        employment_type_id: string;
        employee_category_id: string;
        reporting_manager_id: string | null;
      }>(
        `select relationship.legal_employer_id as company_id,request.relationship_id,request.requested_by,request.effective_on::text,request.reason,request.resulting_state_id,request.job_id,request.profile_draft_assignment_id,assignment.branch_id,assignment.department_id,assignment.designation_id,assignment.job_grade_id,assignment.cost_center_id,assignment.work_location_id,assignment.employment_type_id,assignment.employee_category_id,assignment.reporting_manager_id
           from hr_employment_lifecycle_request request join hr_employment_relationship relationship on relationship.tenant_id=request.tenant_id and relationship.id=request.relationship_id join employee_assignment assignment on assignment.tenant_id=request.tenant_id and assignment.id=request.profile_draft_assignment_id
          where request.tenant_id=$1 and request.id=$2 and relationship.employee_id=$3 and request.approval_state='pending'
            and exists (select 1 from security_user_company_access access where access.tenant_id=request.tenant_id and access.user_id=$4 and access.company_id=relationship.legal_employer_id and access.revoked_at is null) for update of request,relationship,assignment`,
        [context.tenantId, requestId, employeeId, context.actor.userId],
      );
      const row = pending.rows[0];
      if (!row)
        throw new HrApiError(409, "HR_HIRE_NOT_PENDING", "The hire request is not pending in your company scope.");
      const approvalOverrideEventId = await this.resolveApprovalOverride(client, context, {
        normalDecisionPermission: "hr.employment_lifecycle.approve",
        makerActorIds: [row.requested_by],
        resourceType: "hr.employment_lifecycle_request",
        resourceId: requestId,
        decisionAction: input.decision === "approved" ? "approve" : "reject",
        reason: input.reason,
        correlationId,
        idempotencyKey,
      });
      await client.query(
        `update hr_employment_lifecycle_request
            set approval_state=$3,decided_by=$4,decided_at=now(),decision_comment=$5,
                approval_override_event_id=$6
          where tenant_id=$1 and id=$2`,
        [context.tenantId, requestId, input.decision, context.actor.userId, input.reason, approvalOverrideEventId],
      );
      let assignmentId: string | null = null;
      if (input.decision === "approved") {
        await client.query(
          `insert into hr_employment_event (id,tenant_id,relationship_id,request_id,sequence,event_type,effective_on,previous_state_id,resulting_state_id,recorded_by,approved_by,approved_at,source_reference,reason) values ($1,$2,$3,$4,1,'hire',$5,(select id from hr_employment_lifecycle_state where tenant_id=$2 and policy_id=$6 and is_initial=true),$7,$8,$8,now(),$9,$10)`,
          [
            `employment-event-${randomUUID()}`,
            context.tenantId,
            row.relationship_id,
            requestId,
            row.effective_on,
            (
              await client.query<{ lifecycle_policy_id: string }>(
                `select lifecycle_policy_id from hr_employment_relationship where tenant_id=$1 and id=$2`,
                [context.tenantId, row.relationship_id],
              )
            ).rows[0]?.lifecycle_policy_id,
            row.resulting_state_id,
            context.actor.userId,
            `hr:hire-request:${requestId}`,
            row.reason,
          ],
        );
        await client.query(
          `update hr_employment_relationship set status='active',approval_state='approved',updated_at=now() where tenant_id=$1 and id=$2`,
          [context.tenantId, row.relationship_id],
        );
        assignmentId = `employee-assignment-${randomUUID()}`;
        await client.query(
          `insert into employee_assignment (id,tenant_id,employee_id,company_id,branch_id,department_id,designation_id,job_id,job_grade_id,cost_center_id,work_location_id,employment_type_id,employee_category_id,reporting_manager_id,effective_from,change_reason,created_by,employment_relationship_id,assignment_status,source_reference) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'initial_appointment',$16,$17,'active',$18)`,
          [
            assignmentId,
            context.tenantId,
            employeeId,
            row.company_id,
            row.branch_id,
            row.department_id,
            row.designation_id,
            row.job_id,
            row.job_grade_id,
            row.cost_center_id,
            row.work_location_id,
            row.employment_type_id,
            row.employee_category_id,
            row.reporting_manager_id,
            row.effective_on,
            context.actor.userId,
            row.relationship_id,
            `hr:hire-request:${requestId}`,
          ],
        );
        await client.query(`update employee set status='active',updated_at=now() where tenant_id=$1 and id=$2`, [
          context.tenantId,
          employeeId,
        ]);
      } else
        await client.query(
          `update hr_employment_relationship set approval_state='rejected',updated_at=now() where tenant_id=$1 and id=$2`,
          [context.tenantId, row.relationship_id],
        );
      const audit = await this.appendPlatformAudit(
        client,
        context,
        correlationId,
        "hr.employment_lifecycle.hire.decide",
        {
          entityId: requestId,
          entityType: "employment_relationship",
          before: { status: "pending" },
          after: {
            status: input.decision,
            relationship_id: row.relationship_id,
            assignment_id: assignmentId,
            super_admin_override: approvalOverrideEventId !== null,
          },
        },
      );
      const result: HrEmployeeHireDecisionResult = {
        id: requestId,
        employee_id: employeeId,
        company_id: row.company_id,
        relationship_id: row.relationship_id,
        status: input.decision,
        assignment_id: assignmentId,
        audit_event_id: audit,
        replayed: false,
      };
      await client.query(
        `insert into platform_admin_idempotency (tenant_id,actor_id,method,path,idempotency_key,request_fingerprint,response_status,response_body,response_etag) values ($1,$2,'POST',$3,$4,$5,200,$6,$7)`,
        [context.tenantId, context.actor.userId, path, idempotencyKey, fingerprint, result, stateHash(result)],
      );
      await client.query("commit");
      return result;
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async listEmployeeTransferRequests(
    context: HrActorContext,
    query: HrEmployeeTransferRequestDirectoryQuery,
  ): Promise<HrEmployeeTransferRequestDirectory> {
    return this.read(context, "hr.employee_assignment.change", async (client) => {
      await this.requireCompanyAccess(client, context, query.company_id);
      const values: unknown[] = [context.tenantId, query.company_id];
      const filters = ["request.tenant_id=$1", "request.company_id=$2", "request.request_state='pending'"];
      if (query.search) {
        const parameter = values.push(`%${query.search.replace(/[\\%_]/g, "\\$&")}%`);
        filters.push(
          `(employee.employee_number ilike $${parameter} escape '\\' or concat_ws(' ',employee.first_name,employee.middle_name,employee.last_name) ilike $${parameter} escape '\\')`,
        );
      }
      values.push(query.limit);
      const result = await client.query<EmployeeTransferRequestReviewRow>(
        `${this.employeeTransferRequestReviewSelect()}
          where ${filters.join(" and ")}
          order by request.requested_at,request.id
          limit $${values.length}`,
        values,
      );
      return { items: result.rows.map((row) => employeeTransferRequestReview(row, context)) };
    });
  }

  async getEmployeeTransferRequest(
    context: HrActorContext,
    employeeId: string,
    requestId: string,
  ): Promise<HrEmployeeTransferRequestReview> {
    return this.read(context, "hr.employee_assignment.change", async (client) => {
      const result = await client.query<EmployeeTransferRequestReviewRow>(
        `${this.employeeTransferRequestReviewSelect()}
          where request.tenant_id=$1 and request.id=$2 and request.employee_id=$3
            and exists (
              select 1 from security_user_company_access access
               where access.tenant_id=request.tenant_id and access.user_id=$4
                 and access.company_id=request.company_id and access.revoked_at is null
            )`,
        [context.tenantId, requestId, employeeId, context.actor.userId],
      );
      if (!result.rows[0])
        throw new HrApiError(
          404,
          "HR_TRANSFER_NOT_FOUND",
          "The transfer request is unavailable in your company scope.",
        );
      return employeeTransferRequestReview(result.rows[0], context);
    });
  }

  async createEmployeeTransferRequest(
    context: HrActorContext,
    employeeId: string,
    input: CreateHrEmployeeTransferRequest,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<HrEmployeeTransferRequestResult> {
    if (!validIdempotencyKey(idempotencyKey))
      throw new HrApiError(400, "INVALID_IDEMPOTENCY_KEY", "The idempotency key is invalid.");
    if (!context.actor.permissions.includes("hr.employee_assignment.transfer"))
      throw new HrApiError(403, "PERMISSION_DENIED", "You are not permitted to request employee transfers.");
    const client = await this.pool.connect();
    try {
      await client.query("begin isolation level serializable");
      await client.query("select set_config('nexora.tenant_id',$1,true)", [context.tenantId]);
      await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
        `nexora:hr:employee-transfer:${context.tenantId}:${input.source_assignment_id}`,
      ]);
      await this.requireCompanyAccess(client, context, input.company_id);
      const path = `/api/v1/hr/employees/${employeeId}/transfer_requests`;
      const fingerprint = stateHash(input);
      const replay = await client.query<{
        request_fingerprint: string;
        response_body: HrEmployeeTransferRequestResult;
      }>(
        `select request_fingerprint,response_body from platform_admin_idempotency
          where tenant_id=$1 and actor_id=$2 and method='POST' and path=$3 and idempotency_key=$4 for update`,
        [context.tenantId, context.actor.userId, path, idempotencyKey],
      );
      if (replay.rows[0]) {
        if (replay.rows[0].request_fingerprint !== fingerprint)
          throw new HrApiError(
            409,
            "IDEMPOTENCY_CONFLICT",
            "The idempotency key was already used for another request.",
          );
        await client.query("commit");
        return { ...replay.rows[0].response_body, replayed: true };
      }
      const currentDate = (await client.query<{ current_date: string }>("select current_date::text as current_date"))
        .rows[0]?.current_date;
      if (input.effective_on !== currentDate)
        throw new HrApiError(
          409,
          "HR_TRANSFER_EFFECTIVE_DATE_REQUIRED",
          "This transfer workflow currently requires today's effective date.",
        );
      const source = await client.query<{ relationship_id: string }>(
        `select assignment.employment_relationship_id as relationship_id
           from employee_assignment assignment
           join employee on employee.tenant_id=assignment.tenant_id and employee.id=assignment.employee_id
           join hr_employment_relationship relationship
             on relationship.tenant_id=assignment.tenant_id and relationship.id=assignment.employment_relationship_id
          where assignment.tenant_id=$1 and assignment.id=$2 and assignment.employee_id=$3
            and assignment.company_id=$4 and assignment.assignment_status='active'
            and assignment.effective_to is null and assignment.effective_from<current_date
            and employee.status in ('active','probation','confirmed','suspended')
            and relationship.status='active'
          for update of assignment,employee,relationship`,
        [context.tenantId, input.source_assignment_id, employeeId, input.company_id],
      );
      if (!source.rows[0]?.relationship_id)
        throw new HrApiError(
          409,
          "HR_TRANSFER_SOURCE_UNAVAILABLE",
          "The source assignment is no longer eligible for transfer.",
        );
      const pending = await client.query(
        `select 1 from hr_employee_transfer_request
          where tenant_id=$1 and source_assignment_id=$2 and request_state='pending'`,
        [context.tenantId, input.source_assignment_id],
      );
      if (pending.rowCount)
        throw new HrApiError(
          409,
          "HR_TRANSFER_ALREADY_PENDING",
          "A transfer request is already pending for this assignment.",
        );
      const id = `employee-transfer-request-${randomUUID()}`;
      await client.query(
        `insert into hr_employee_transfer_request
          (tenant_id,id,employee_id,company_id,relationship_id,source_assignment_id,
           proposed_branch_id,proposed_department_id,proposed_job_id,proposed_designation_id,
           proposed_job_grade_id,proposed_cost_center_id,proposed_work_location_id,
           proposed_employment_type_id,proposed_employee_category_id,proposed_reporting_manager_id,
           effective_on,reason,requested_by)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)`,
        [
          context.tenantId,
          id,
          employeeId,
          input.company_id,
          source.rows[0].relationship_id,
          input.source_assignment_id,
          input.branch_id ?? null,
          input.department_id ?? null,
          input.job_id,
          input.designation_id,
          input.job_grade_id,
          input.cost_center_id,
          input.work_location_id,
          input.employment_type_id,
          input.employee_category_id,
          input.reporting_manager_id ?? null,
          input.effective_on,
          input.reason,
          context.actor.userId,
        ],
      );
      const audit = await this.appendPlatformAudit(
        client,
        context,
        correlationId,
        "hr.employee_assignment.transfer.request",
        {
          entityId: id,
          before: null,
          after: {
            employee_id: employeeId,
            company_id: input.company_id,
            source_assignment_id: input.source_assignment_id,
            effective_on: input.effective_on,
            status: "pending",
          },
        },
      );
      const result: HrEmployeeTransferRequestResult = {
        id,
        employee_id: employeeId,
        company_id: input.company_id,
        source_assignment_id: input.source_assignment_id,
        status: "pending",
        audit_event_id: audit,
        replayed: false,
      };
      await client.query(
        `insert into platform_admin_idempotency
          (tenant_id,actor_id,method,path,idempotency_key,request_fingerprint,response_status,response_body,response_etag)
         values ($1,$2,'POST',$3,$4,$5,201,$6,$7)`,
        [context.tenantId, context.actor.userId, path, idempotencyKey, fingerprint, result, stateHash(result)],
      );
      await client.query("commit");
      return result;
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async decideEmployeeTransferRequest(
    context: HrActorContext,
    employeeId: string,
    requestId: string,
    input: DecideHrEmployeeTransferRequest,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<HrEmployeeTransferDecisionResult> {
    if (!validIdempotencyKey(idempotencyKey))
      throw new HrApiError(400, "INVALID_IDEMPOTENCY_KEY", "The idempotency key is invalid.");
    if (!context.actor.permissions.includes("hr.employee_assignment.change"))
      throw new HrApiError(403, "PERMISSION_DENIED", "You are not permitted to decide employee transfers.");
    const client = await this.pool.connect();
    try {
      await client.query("begin isolation level serializable");
      await client.query("select set_config('nexora.tenant_id',$1,true)", [context.tenantId]);
      await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
        `nexora:hr:employee-transfer:${context.tenantId}:${requestId}`,
      ]);
      const path = `/api/v1/hr/employees/${employeeId}/transfer_requests/${requestId}/decision`;
      const fingerprint = stateHash(input);
      const replay = await client.query<{
        request_fingerprint: string;
        response_body: HrEmployeeTransferDecisionResult;
      }>(
        `select request_fingerprint,response_body from platform_admin_idempotency
          where tenant_id=$1 and actor_id=$2 and method='POST' and path=$3 and idempotency_key=$4 for update`,
        [context.tenantId, context.actor.userId, path, idempotencyKey],
      );
      if (replay.rows[0]) {
        if (replay.rows[0].request_fingerprint !== fingerprint)
          throw new HrApiError(
            409,
            "IDEMPOTENCY_CONFLICT",
            "The idempotency key was already used for another request.",
          );
        await client.query("commit");
        return { ...replay.rows[0].response_body, replayed: true };
      }
      const pending = await client.query<{
        company_id: string;
        relationship_id: string;
        source_assignment_id: string;
        requested_by: string;
        effective_on: string;
        proposed_branch_id: string | null;
        proposed_department_id: string | null;
        proposed_job_id: string;
        proposed_designation_id: string;
        proposed_job_grade_id: string;
        proposed_cost_center_id: string;
        proposed_work_location_id: string;
        proposed_employment_type_id: string;
        proposed_employee_category_id: string;
        proposed_reporting_manager_id: string | null;
      }>(
        `select request.company_id,request.relationship_id,request.source_assignment_id,
                request.requested_by,request.effective_on::text,request.proposed_branch_id,
                request.proposed_department_id,request.proposed_job_id,request.proposed_designation_id,
                request.proposed_job_grade_id,request.proposed_cost_center_id,
                request.proposed_work_location_id,request.proposed_employment_type_id,
                request.proposed_employee_category_id,request.proposed_reporting_manager_id
           from hr_employee_transfer_request request
           join employee_assignment assignment
             on assignment.tenant_id=request.tenant_id and assignment.id=request.source_assignment_id
          where request.tenant_id=$1 and request.id=$2 and request.employee_id=$3
            and request.request_state='pending' and assignment.assignment_status='active'
            and assignment.effective_to is null
            and exists (
              select 1 from security_user_company_access access
               where access.tenant_id=request.tenant_id and access.user_id=$4
                 and access.company_id=request.company_id and access.revoked_at is null
            )
          for update of request,assignment`,
        [context.tenantId, requestId, employeeId, context.actor.userId],
      );
      const row = pending.rows[0];
      if (!row)
        throw new HrApiError(
          409,
          "HR_TRANSFER_NOT_PENDING",
          "The transfer request is not pending in your company scope.",
        );
      const approvalOverrideEventId = await this.resolveApprovalOverride(client, context, {
        normalDecisionPermission: "hr.employee_assignment.change",
        makerActorIds: [row.requested_by],
        resourceType: "hr.employee_transfer_request",
        resourceId: requestId,
        decisionAction: input.decision === "approved" ? "approve" : "reject",
        reason: input.reason,
        correlationId,
        idempotencyKey,
      });
      const currentDate = (await client.query<{ current_date: string }>("select current_date::text as current_date"))
        .rows[0]?.current_date;
      if (row.effective_on !== currentDate)
        throw new HrApiError(
          409,
          "HR_TRANSFER_EFFECTIVE_DATE_REQUIRED",
          "This transfer can only be decided on its effective date.",
        );
      let assignmentId: string | null = null;
      if (input.decision === "approved") {
        await client.query(
          `update employee_assignment
              set effective_to=($3::date - 1),assignment_status='ended',updated_at=now()
            where tenant_id=$1 and id=$2`,
          [context.tenantId, row.source_assignment_id, row.effective_on],
        );
        assignmentId = `employee-assignment-${randomUUID()}`;
        await client.query(
          `insert into employee_assignment
            (id,tenant_id,employee_id,company_id,branch_id,department_id,designation_id,job_id,
             job_grade_id,cost_center_id,work_location_id,employment_type_id,employee_category_id,
             reporting_manager_id,effective_from,change_reason,created_by,employment_relationship_id,
             assignment_status,source_reference)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'transfer',$16,$17,'active',$18)`,
          [
            assignmentId,
            context.tenantId,
            employeeId,
            row.company_id,
            row.proposed_branch_id,
            row.proposed_department_id,
            row.proposed_designation_id,
            row.proposed_job_id,
            row.proposed_job_grade_id,
            row.proposed_cost_center_id,
            row.proposed_work_location_id,
            row.proposed_employment_type_id,
            row.proposed_employee_category_id,
            row.proposed_reporting_manager_id,
            row.effective_on,
            context.actor.userId,
            row.relationship_id,
            `hr:transfer-request:${requestId}`,
          ],
        );
        await client.query(
          `insert into employee_assignment_org_unit
            (tenant_id,assignment_id,organization_type,organization_unit_id,created_by)
           select tenant_id,$3,organization_type,organization_unit_id,$4
             from employee_assignment_org_unit
            where tenant_id=$1 and assignment_id=$2
              and organization_type not in ('branch','department')
           on conflict do nothing`,
          [context.tenantId, row.source_assignment_id, assignmentId, context.actor.userId],
        );
      }
      await client.query(
        `update hr_employee_transfer_request
            set request_state=$3,decided_by=$4,decided_at=now(),decision_reason=$5,
                projected_assignment_id=$6,approval_override_event_id=$7,row_version=row_version+1
          where tenant_id=$1 and id=$2`,
        [
          context.tenantId,
          requestId,
          input.decision,
          context.actor.userId,
          input.reason,
          assignmentId,
          approvalOverrideEventId,
        ],
      );
      const audit = await this.appendPlatformAudit(
        client,
        context,
        correlationId,
        "hr.employee_assignment.transfer.decide",
        {
          entityId: requestId,
          before: { status: "pending", source_assignment_id: row.source_assignment_id },
          after: {
            status: input.decision,
            assignment_id: assignmentId,
            super_admin_override: approvalOverrideEventId !== null,
          },
        },
      );
      const result: HrEmployeeTransferDecisionResult = {
        id: requestId,
        employee_id: employeeId,
        company_id: row.company_id,
        source_assignment_id: row.source_assignment_id,
        status: input.decision,
        assignment_id: assignmentId,
        audit_event_id: audit,
        replayed: false,
      };
      await client.query(
        `insert into platform_admin_idempotency
          (tenant_id,actor_id,method,path,idempotency_key,request_fingerprint,response_status,response_body,response_etag)
         values ($1,$2,'POST',$3,$4,$5,200,$6,$7)`,
        [context.tenantId, context.actor.userId, path, idempotencyKey, fingerprint, result, stateHash(result)],
      );
      await client.query("commit");
      return result;
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async listEmployeePromotionRequests(
    context: HrActorContext,
    query: HrEmployeePromotionRequestDirectoryQuery,
  ): Promise<HrEmployeePromotionRequestDirectory> {
    return this.read(context, "hr.employee_assignment.change", async (client) => {
      await this.requireCompanyAccess(client, context, query.company_id);
      const values: unknown[] = [context.tenantId, query.company_id];
      const filters = ["request.tenant_id=$1", "request.company_id=$2", "request.request_state='pending'"];
      if (query.search) {
        const parameter = values.push(`%${query.search.replace(/[\\%_]/g, "\\$&")}%`);
        filters.push(
          `(employee.employee_number ilike $${parameter} escape '\\' or concat_ws(' ',employee.first_name,employee.middle_name,employee.last_name) ilike $${parameter} escape '\\')`,
        );
      }
      values.push(query.limit);
      const result = await client.query<EmployeePromotionRequestReviewRow>(
        `${this.employeePromotionRequestReviewSelect()}
          where ${filters.join(" and ")}
          order by request.requested_at,request.id
          limit $${values.length}`,
        values,
      );
      return { items: result.rows.map((row) => employeePromotionRequestReview(row, context)) };
    });
  }

  async getEmployeePromotionRequest(
    context: HrActorContext,
    employeeId: string,
    requestId: string,
  ): Promise<HrEmployeePromotionRequestReview> {
    return this.read(context, "hr.employee_assignment.change", async (client) => {
      const result = await client.query<EmployeePromotionRequestReviewRow>(
        `${this.employeePromotionRequestReviewSelect()}
          where request.tenant_id=$1 and request.id=$2 and request.employee_id=$3
            and exists (
              select 1 from security_user_company_access access
               where access.tenant_id=request.tenant_id and access.user_id=$4
                 and access.company_id=request.company_id and access.revoked_at is null
            )`,
        [context.tenantId, requestId, employeeId, context.actor.userId],
      );
      if (!result.rows[0])
        throw new HrApiError(
          404,
          "HR_PROMOTION_NOT_FOUND",
          "The promotion request is unavailable in your company scope.",
        );
      return employeePromotionRequestReview(result.rows[0], context);
    });
  }

  async createEmployeePromotionRequest(
    context: HrActorContext,
    employeeId: string,
    input: CreateHrEmployeePromotionRequest,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<HrEmployeePromotionRequestResult> {
    if (!validIdempotencyKey(idempotencyKey))
      throw new HrApiError(400, "INVALID_IDEMPOTENCY_KEY", "The idempotency key is invalid.");
    if (!context.actor.permissions.includes("hr.employee_assignment.change"))
      throw new HrApiError(403, "PERMISSION_DENIED", "You are not permitted to request employee promotions.");
    const client = await this.pool.connect();
    try {
      await client.query("begin isolation level serializable");
      await client.query("select set_config('nexora.tenant_id',$1,true)", [context.tenantId]);
      await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
        `nexora:hr:employee-promotion:${context.tenantId}:${input.source_assignment_id}`,
      ]);
      await this.requireCompanyAccess(client, context, input.company_id);
      const path = `/api/v1/hr/employees/${employeeId}/promotion_requests`;
      const fingerprint = stateHash(input);
      const replay = await client.query<{
        request_fingerprint: string;
        response_body: HrEmployeePromotionRequestResult;
      }>(
        `select request_fingerprint,response_body from platform_admin_idempotency
          where tenant_id=$1 and actor_id=$2 and method='POST' and path=$3 and idempotency_key=$4 for update`,
        [context.tenantId, context.actor.userId, path, idempotencyKey],
      );
      if (replay.rows[0]) {
        if (replay.rows[0].request_fingerprint !== fingerprint)
          throw new HrApiError(
            409,
            "IDEMPOTENCY_CONFLICT",
            "The idempotency key was already used for another request.",
          );
        await client.query("commit");
        return { ...replay.rows[0].response_body, replayed: true };
      }
      const currentDate = (await client.query<{ current_date: string }>("select current_date::text as current_date"))
        .rows[0]?.current_date;
      if (input.effective_on !== currentDate)
        throw new HrApiError(
          409,
          "HR_PROMOTION_EFFECTIVE_DATE_REQUIRED",
          "This promotion workflow currently requires today's effective date.",
        );
      const source = await client.query<{
        relationship_id: string;
        job_id: string;
        designation_id: string;
        job_grade_id: string;
      }>(
        `select assignment.employment_relationship_id as relationship_id,
                assignment.job_id,assignment.designation_id,assignment.job_grade_id
           from employee_assignment assignment
           join employee on employee.tenant_id=assignment.tenant_id and employee.id=assignment.employee_id
           join hr_employment_relationship relationship
             on relationship.tenant_id=assignment.tenant_id and relationship.id=assignment.employment_relationship_id
          where assignment.tenant_id=$1 and assignment.id=$2 and assignment.employee_id=$3
            and assignment.company_id=$4 and assignment.assignment_status='active'
            and assignment.effective_to is null and assignment.effective_from<current_date
            and employee.status in ('active','probation','confirmed','suspended')
            and relationship.status='active'
          for update of assignment,employee,relationship`,
        [context.tenantId, input.source_assignment_id, employeeId, input.company_id],
      );
      const sourceRow = source.rows[0];
      if (!sourceRow?.relationship_id)
        throw new HrApiError(
          409,
          "HR_PROMOTION_SOURCE_UNAVAILABLE",
          "The source assignment is no longer eligible for promotion.",
        );
      if (
        sourceRow.job_id === input.job_id &&
        sourceRow.designation_id === input.designation_id &&
        sourceRow.job_grade_id === input.job_grade_id
      )
        throw new HrApiError(
          409,
          "HR_PROMOTION_CHANGE_REQUIRED",
          "A promotion must change the job, designation, or job grade.",
        );
      const pending = await client.query(
        `select 1 from hr_employee_promotion_request
          where tenant_id=$1 and source_assignment_id=$2 and request_state='pending'`,
        [context.tenantId, input.source_assignment_id],
      );
      if (pending.rowCount)
        throw new HrApiError(
          409,
          "HR_PROMOTION_ALREADY_PENDING",
          "A promotion request is already pending for this assignment.",
        );
      const id = `employee-promotion-request-${randomUUID()}`;
      await client.query(
        `insert into hr_employee_promotion_request
          (tenant_id,id,employee_id,company_id,relationship_id,source_assignment_id,
           proposed_job_id,proposed_designation_id,proposed_job_grade_id,effective_on,reason,requested_by)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [
          context.tenantId,
          id,
          employeeId,
          input.company_id,
          sourceRow.relationship_id,
          input.source_assignment_id,
          input.job_id,
          input.designation_id,
          input.job_grade_id,
          input.effective_on,
          input.reason,
          context.actor.userId,
        ],
      );
      const audit = await this.appendPlatformAudit(
        client,
        context,
        correlationId,
        "hr.employee_assignment.promotion.request",
        {
          entityId: id,
          before: null,
          after: {
            employee_id: employeeId,
            company_id: input.company_id,
            source_assignment_id: input.source_assignment_id,
            effective_on: input.effective_on,
            status: "pending",
          },
        },
      );
      const result: HrEmployeePromotionRequestResult = {
        id,
        employee_id: employeeId,
        company_id: input.company_id,
        source_assignment_id: input.source_assignment_id,
        status: "pending",
        audit_event_id: audit,
        replayed: false,
      };
      await client.query(
        `insert into platform_admin_idempotency
          (tenant_id,actor_id,method,path,idempotency_key,request_fingerprint,response_status,response_body,response_etag)
         values ($1,$2,'POST',$3,$4,$5,201,$6,$7)`,
        [context.tenantId, context.actor.userId, path, idempotencyKey, fingerprint, result, stateHash(result)],
      );
      await client.query("commit");
      return result;
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
      if (["23503", "23514"].includes(code))
        throw new HrApiError(
          409,
          "HR_PROMOTION_CONTEXT_INVALID",
          "The promotion context is no longer valid. Refresh the employee assignment and active master data.",
        );
      if (code === "23505")
        throw new HrApiError(
          409,
          "HR_PROMOTION_ALREADY_PENDING",
          "A promotion request is already pending for this assignment.",
        );
      throw error;
    } finally {
      client.release();
    }
  }

  async decideEmployeePromotionRequest(
    context: HrActorContext,
    employeeId: string,
    requestId: string,
    input: DecideHrEmployeePromotionRequest,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<HrEmployeePromotionDecisionResult> {
    if (!validIdempotencyKey(idempotencyKey))
      throw new HrApiError(400, "INVALID_IDEMPOTENCY_KEY", "The idempotency key is invalid.");
    if (!context.actor.permissions.includes("hr.employee_assignment.change"))
      throw new HrApiError(403, "PERMISSION_DENIED", "You are not permitted to decide employee promotions.");
    const client = await this.pool.connect();
    try {
      await client.query("begin isolation level serializable");
      await client.query("select set_config('nexora.tenant_id',$1,true)", [context.tenantId]);
      await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
        `nexora:hr:employee-promotion:${context.tenantId}:${requestId}`,
      ]);
      const path = `/api/v1/hr/employees/${employeeId}/promotion_requests/${requestId}/decision`;
      const fingerprint = stateHash(input);
      const replay = await client.query<{
        request_fingerprint: string;
        response_body: HrEmployeePromotionDecisionResult;
      }>(
        `select request_fingerprint,response_body from platform_admin_idempotency
          where tenant_id=$1 and actor_id=$2 and method='POST' and path=$3 and idempotency_key=$4 for update`,
        [context.tenantId, context.actor.userId, path, idempotencyKey],
      );
      if (replay.rows[0]) {
        if (replay.rows[0].request_fingerprint !== fingerprint)
          throw new HrApiError(
            409,
            "IDEMPOTENCY_CONFLICT",
            "The idempotency key was already used for another request.",
          );
        await client.query("commit");
        return { ...replay.rows[0].response_body, replayed: true };
      }
      const pending = await client.query<{
        company_id: string;
        relationship_id: string;
        source_assignment_id: string;
        requested_by: string;
        effective_on: string;
        proposed_job_id: string;
        proposed_designation_id: string;
        proposed_job_grade_id: string;
        branch_id: string | null;
        department_id: string | null;
        cost_center_id: string;
        work_location_id: string;
        employment_type_id: string;
        employee_category_id: string;
        reporting_manager_id: string | null;
      }>(
        `select request.company_id,request.relationship_id,request.source_assignment_id,
                request.requested_by,request.effective_on::text,request.proposed_job_id,
                request.proposed_designation_id,request.proposed_job_grade_id,
                assignment.branch_id,assignment.department_id,assignment.cost_center_id,
                assignment.work_location_id,assignment.employment_type_id,
                assignment.employee_category_id,assignment.reporting_manager_id
           from hr_employee_promotion_request request
           join employee_assignment assignment
             on assignment.tenant_id=request.tenant_id and assignment.id=request.source_assignment_id
           join hr_employment_relationship relationship
             on relationship.tenant_id=request.tenant_id and relationship.id=request.relationship_id
          where request.tenant_id=$1 and request.id=$2 and request.employee_id=$3
            and request.request_state='pending' and assignment.assignment_status='active'
            and assignment.effective_to is null and relationship.status='active'
            and exists (
              select 1 from security_user_company_access access
               where access.tenant_id=request.tenant_id and access.user_id=$4
                 and access.company_id=request.company_id and access.revoked_at is null
            )
          for update of request,assignment,relationship`,
        [context.tenantId, requestId, employeeId, context.actor.userId],
      );
      const row = pending.rows[0];
      if (!row)
        throw new HrApiError(
          409,
          "HR_PROMOTION_NOT_PENDING",
          "The promotion request is not pending in your company scope.",
        );
      const approvalOverrideEventId = await this.resolveApprovalOverride(client, context, {
        normalDecisionPermission: "hr.employee_assignment.change",
        makerActorIds: [row.requested_by],
        resourceType: "hr.employee_promotion_request",
        resourceId: requestId,
        decisionAction: input.decision === "approved" ? "approve" : "reject",
        reason: input.reason,
        correlationId,
        idempotencyKey,
      });
      const currentDate = (await client.query<{ current_date: string }>("select current_date::text as current_date"))
        .rows[0]?.current_date;
      if (row.effective_on !== currentDate)
        throw new HrApiError(
          409,
          "HR_PROMOTION_EFFECTIVE_DATE_REQUIRED",
          "This promotion can only be decided on its effective date.",
        );
      let assignmentId: string | null = null;
      if (input.decision === "approved") {
        await client.query(
          `update employee_assignment
              set effective_to=($3::date - 1),assignment_status='ended',updated_at=now()
            where tenant_id=$1 and id=$2`,
          [context.tenantId, row.source_assignment_id, row.effective_on],
        );
        assignmentId = `employee-assignment-${randomUUID()}`;
        await client.query(
          `insert into employee_assignment
            (id,tenant_id,employee_id,company_id,branch_id,department_id,designation_id,job_id,
             job_grade_id,cost_center_id,work_location_id,employment_type_id,employee_category_id,
             reporting_manager_id,effective_from,change_reason,created_by,employment_relationship_id,
             assignment_status,source_reference)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'promotion',$16,$17,'active',$18)`,
          [
            assignmentId,
            context.tenantId,
            employeeId,
            row.company_id,
            row.branch_id,
            row.department_id,
            row.proposed_designation_id,
            row.proposed_job_id,
            row.proposed_job_grade_id,
            row.cost_center_id,
            row.work_location_id,
            row.employment_type_id,
            row.employee_category_id,
            row.reporting_manager_id,
            row.effective_on,
            context.actor.userId,
            row.relationship_id,
            `hr:promotion-request:${requestId}`,
          ],
        );
      }
      await client.query(
        `update hr_employee_promotion_request
            set request_state=$3,decided_by=$4,decided_at=now(),decision_reason=$5,
                projected_assignment_id=$6,approval_override_event_id=$7,row_version=row_version+1
          where tenant_id=$1 and id=$2`,
        [
          context.tenantId,
          requestId,
          input.decision,
          context.actor.userId,
          input.reason,
          assignmentId,
          approvalOverrideEventId,
        ],
      );
      const audit = await this.appendPlatformAudit(
        client,
        context,
        correlationId,
        "hr.employee_assignment.promotion.decide",
        {
          entityId: requestId,
          before: { status: "pending", source_assignment_id: row.source_assignment_id },
          after: {
            status: input.decision,
            assignment_id: assignmentId,
            super_admin_override: approvalOverrideEventId !== null,
          },
        },
      );
      const result: HrEmployeePromotionDecisionResult = {
        id: requestId,
        employee_id: employeeId,
        company_id: row.company_id,
        source_assignment_id: row.source_assignment_id,
        status: input.decision,
        assignment_id: assignmentId,
        audit_event_id: audit,
        replayed: false,
      };
      await client.query(
        `insert into platform_admin_idempotency
          (tenant_id,actor_id,method,path,idempotency_key,request_fingerprint,response_status,response_body,response_etag)
         values ($1,$2,'POST',$3,$4,$5,200,$6,$7)`,
        [context.tenantId, context.actor.userId, path, idempotencyKey, fingerprint, result, stateHash(result)],
      );
      await client.query("commit");
      return result;
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
      if (["23503", "23514"].includes(code))
        throw new HrApiError(
          409,
          "HR_PROMOTION_CONTEXT_INVALID",
          "The promotion context is no longer valid. Refresh the request and active assignment data.",
        );
      throw error;
    } finally {
      client.release();
    }
  }

  async listEmployeeManagerChangeRequests(
    context: HrActorContext,
    query: HrEmployeeManagerChangeRequestDirectoryQuery,
  ): Promise<HrEmployeeManagerChangeRequestDirectory> {
    return this.read(context, "hr.employee_assignment.change", async (client) => {
      await this.requireCompanyAccess(client, context, query.company_id);
      const values: unknown[] = [context.tenantId, query.company_id];
      const filters = ["request.tenant_id=$1", "request.company_id=$2", "request.request_state='pending'"];
      if (query.search) {
        const parameter = values.push(`%${query.search.replace(/[\\%_]/g, "\\$&")}%`);
        filters.push(
          `(employee.employee_number ilike $${parameter} escape '\\' or concat_ws(' ',employee.first_name,employee.middle_name,employee.last_name) ilike $${parameter} escape '\\')`,
        );
      }
      values.push(query.limit);
      const result = await client.query<EmployeeManagerChangeRequestReviewRow>(
        `${this.employeeManagerChangeRequestReviewSelect()}
          where ${filters.join(" and ")}
          order by request.requested_at,request.id
          limit $${values.length}`,
        values,
      );
      return { items: result.rows.map((row) => employeeManagerChangeRequestReview(row, context)) };
    });
  }

  async getEmployeeManagerChangeRequest(
    context: HrActorContext,
    employeeId: string,
    requestId: string,
  ): Promise<HrEmployeeManagerChangeRequestReview> {
    return this.read(context, "hr.employee_assignment.change", async (client) => {
      const result = await client.query<EmployeeManagerChangeRequestReviewRow>(
        `${this.employeeManagerChangeRequestReviewSelect()}
          where request.tenant_id=$1 and request.id=$2 and request.employee_id=$3
            and exists (
              select 1 from security_user_company_access access
               where access.tenant_id=request.tenant_id and access.user_id=$4
                 and access.company_id=request.company_id and access.revoked_at is null
            )`,
        [context.tenantId, requestId, employeeId, context.actor.userId],
      );
      if (!result.rows[0])
        throw new HrApiError(
          404,
          "HR_MANAGER_CHANGE_NOT_FOUND",
          "The manager-change request is unavailable in your company scope.",
        );
      return employeeManagerChangeRequestReview(result.rows[0], context);
    });
  }

  async createEmployeeManagerChangeRequest(
    context: HrActorContext,
    employeeId: string,
    input: CreateHrEmployeeManagerChangeRequest,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<HrEmployeeManagerChangeRequestResult> {
    if (!validIdempotencyKey(idempotencyKey))
      throw new HrApiError(400, "INVALID_IDEMPOTENCY_KEY", "The idempotency key is invalid.");
    if (!context.actor.permissions.includes("hr.employee_assignment.manager_change"))
      throw new HrApiError(403, "PERMISSION_DENIED", "You are not permitted to request reporting-manager changes.");
    const client = await this.pool.connect();
    try {
      await client.query("begin isolation level serializable");
      await client.query("select set_config('nexora.tenant_id',$1,true)", [context.tenantId]);
      await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
        `nexora:hr:employee-manager-change:${context.tenantId}:${input.source_assignment_id}`,
      ]);
      await this.requireCompanyAccess(client, context, input.company_id);
      const path = `/api/v1/hr/employees/${employeeId}/manager_change_requests`;
      const fingerprint = stateHash(input);
      const replay = await client.query<{
        request_fingerprint: string;
        response_body: HrEmployeeManagerChangeRequestResult;
      }>(
        `select request_fingerprint,response_body from platform_admin_idempotency
          where tenant_id=$1 and actor_id=$2 and method='POST' and path=$3 and idempotency_key=$4 for update`,
        [context.tenantId, context.actor.userId, path, idempotencyKey],
      );
      if (replay.rows[0]) {
        if (replay.rows[0].request_fingerprint !== fingerprint)
          throw new HrApiError(
            409,
            "IDEMPOTENCY_CONFLICT",
            "The idempotency key was already used for another request.",
          );
        await client.query("commit");
        return { ...replay.rows[0].response_body, replayed: true };
      }
      const currentDate = (await client.query<{ current_date: string }>("select current_date::text as current_date"))
        .rows[0]?.current_date;
      if (input.effective_on !== currentDate)
        throw new HrApiError(
          409,
          "HR_MANAGER_CHANGE_EFFECTIVE_DATE_REQUIRED",
          "This manager-change workflow currently requires today's effective date.",
        );
      const source = await client.query<{
        relationship_id: string;
        reporting_manager_id: string | null;
      }>(
        `select assignment.employment_relationship_id as relationship_id,assignment.reporting_manager_id
           from employee_assignment assignment
           join employee on employee.tenant_id=assignment.tenant_id and employee.id=assignment.employee_id
           join hr_employment_relationship relationship
             on relationship.tenant_id=assignment.tenant_id and relationship.id=assignment.employment_relationship_id
          where assignment.tenant_id=$1 and assignment.id=$2 and assignment.employee_id=$3
            and assignment.company_id=$4 and assignment.assignment_status='active'
            and assignment.effective_to is null and assignment.effective_from<current_date
            and employee.status in ('active','probation','confirmed','suspended')
            and relationship.status='active'
          for update of assignment,employee,relationship`,
        [context.tenantId, input.source_assignment_id, employeeId, input.company_id],
      );
      const sourceRow = source.rows[0];
      if (!sourceRow?.relationship_id)
        throw new HrApiError(
          409,
          "HR_MANAGER_CHANGE_SOURCE_UNAVAILABLE",
          "The source assignment is no longer eligible for a manager change.",
        );
      if (sourceRow.reporting_manager_id === input.reporting_manager_id)
        throw new HrApiError(
          409,
          "HR_MANAGER_CHANGE_REQUIRED",
          "A manager-change request must alter the reporting manager.",
        );
      if (input.reporting_manager_id === employeeId)
        throw new HrApiError(409, "HR_MANAGER_CHANGE_SELF_FORBIDDEN", "An employee cannot report to themselves.");
      if (input.reporting_manager_id !== null) {
        const manager = await client.query(
          `select 1
             from hr_employment_relationship relationship
             join employee_assignment assignment
               on assignment.tenant_id=relationship.tenant_id
              and assignment.employment_relationship_id=relationship.id
            where relationship.tenant_id=$1 and relationship.employee_id=$2
              and relationship.legal_employer_id=$3 and relationship.status='active'
              and relationship.effective_from<=$4::date
              and (relationship.effective_to is null or relationship.effective_to>=$4::date)
              and assignment.employee_id=$2 and assignment.company_id=$3
              and assignment.assignment_status='active' and assignment.effective_from<=$4::date
              and (assignment.effective_to is null or assignment.effective_to>=$4::date)
            limit 1`,
          [context.tenantId, input.reporting_manager_id, input.company_id, input.effective_on],
        );
        if (!manager.rowCount)
          throw new HrApiError(
            409,
            "HR_MANAGER_CHANGE_MANAGER_UNAVAILABLE",
            "The proposed reporting manager is not effective in this legal employer.",
          );
        const cycle = await client.query(
          `with recursive reporting_chain(employee_id,reporting_manager_id) as (
             select assignment.employee_id,assignment.reporting_manager_id
               from employee_assignment assignment
              where assignment.tenant_id=$1 and assignment.employee_id=$2
                and assignment.company_id=$3 and assignment.assignment_status='active'
                and assignment.effective_from<=$4::date
                and (assignment.effective_to is null or assignment.effective_to>=$4::date)
             union all
             select assignment.employee_id,assignment.reporting_manager_id
               from employee_assignment assignment
               join reporting_chain chain on assignment.employee_id=chain.reporting_manager_id
              where assignment.tenant_id=$1 and assignment.company_id=$3
                and assignment.assignment_status='active' and assignment.effective_from<=$4::date
                and (assignment.effective_to is null or assignment.effective_to>=$4::date)
           )
           select 1 from reporting_chain where reporting_manager_id=$5 limit 1`,
          [context.tenantId, input.reporting_manager_id, input.company_id, input.effective_on, employeeId],
        );
        if (cycle.rowCount)
          throw new HrApiError(
            409,
            "HR_MANAGER_CHANGE_CYCLE_FORBIDDEN",
            "The proposed reporting line would create a management cycle.",
          );
      }
      const pending = await client.query(
        `select 1 from hr_employee_manager_change_request
          where tenant_id=$1 and source_assignment_id=$2 and request_state='pending'`,
        [context.tenantId, input.source_assignment_id],
      );
      if (pending.rowCount)
        throw new HrApiError(
          409,
          "HR_MANAGER_CHANGE_ALREADY_PENDING",
          "A manager-change request is already pending for this assignment.",
        );
      const id = `employee-manager-change-request-${randomUUID()}`;
      await client.query(
        `insert into hr_employee_manager_change_request
          (tenant_id,id,employee_id,company_id,relationship_id,source_assignment_id,
           proposed_reporting_manager_id,clear_reporting_manager,effective_on,reason,requested_by)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [
          context.tenantId,
          id,
          employeeId,
          input.company_id,
          sourceRow.relationship_id,
          input.source_assignment_id,
          input.reporting_manager_id,
          input.clear_reporting_manager,
          input.effective_on,
          input.reason,
          context.actor.userId,
        ],
      );
      const audit = await this.appendPlatformAudit(
        client,
        context,
        correlationId,
        "hr.employee_assignment.manager_change.request",
        {
          entityId: id,
          before: { reporting_manager_id: sourceRow.reporting_manager_id },
          after: {
            employee_id: employeeId,
            company_id: input.company_id,
            source_assignment_id: input.source_assignment_id,
            reporting_manager_id: input.reporting_manager_id,
            clear_reporting_manager: input.clear_reporting_manager,
            effective_on: input.effective_on,
            status: "pending",
          },
        },
      );
      const result: HrEmployeeManagerChangeRequestResult = {
        id,
        employee_id: employeeId,
        company_id: input.company_id,
        source_assignment_id: input.source_assignment_id,
        status: "pending",
        audit_event_id: audit,
        replayed: false,
      };
      await client.query(
        `insert into platform_admin_idempotency
          (tenant_id,actor_id,method,path,idempotency_key,request_fingerprint,response_status,response_body,response_etag)
         values ($1,$2,'POST',$3,$4,$5,201,$6,$7)`,
        [context.tenantId, context.actor.userId, path, idempotencyKey, fingerprint, result, stateHash(result)],
      );
      await client.query("commit");
      return result;
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
      if (["23503", "23514"].includes(code))
        throw new HrApiError(
          409,
          "HR_MANAGER_CHANGE_CONTEXT_INVALID",
          "The manager-change context is no longer valid. Refresh the employee assignment and manager directory.",
        );
      if (code === "23505")
        throw new HrApiError(
          409,
          "HR_MANAGER_CHANGE_ALREADY_PENDING",
          "A manager-change request is already pending for this assignment.",
        );
      throw error;
    } finally {
      client.release();
    }
  }

  async decideEmployeeManagerChangeRequest(
    context: HrActorContext,
    employeeId: string,
    requestId: string,
    input: DecideHrEmployeeManagerChangeRequest,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<HrEmployeeManagerChangeDecisionResult> {
    if (!validIdempotencyKey(idempotencyKey))
      throw new HrApiError(400, "INVALID_IDEMPOTENCY_KEY", "The idempotency key is invalid.");
    if (!context.actor.permissions.includes("hr.employee_assignment.change"))
      throw new HrApiError(403, "PERMISSION_DENIED", "You are not permitted to decide reporting-manager changes.");
    const client = await this.pool.connect();
    try {
      await client.query("begin isolation level serializable");
      await client.query("select set_config('nexora.tenant_id',$1,true)", [context.tenantId]);
      await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
        `nexora:hr:employee-manager-change:${context.tenantId}:${requestId}`,
      ]);
      const path = `/api/v1/hr/employees/${employeeId}/manager_change_requests/${requestId}/decision`;
      const fingerprint = stateHash(input);
      const replay = await client.query<{
        request_fingerprint: string;
        response_body: HrEmployeeManagerChangeDecisionResult;
      }>(
        `select request_fingerprint,response_body from platform_admin_idempotency
          where tenant_id=$1 and actor_id=$2 and method='POST' and path=$3 and idempotency_key=$4 for update`,
        [context.tenantId, context.actor.userId, path, idempotencyKey],
      );
      if (replay.rows[0]) {
        if (replay.rows[0].request_fingerprint !== fingerprint)
          throw new HrApiError(
            409,
            "IDEMPOTENCY_CONFLICT",
            "The idempotency key was already used for another request.",
          );
        await client.query("commit");
        return { ...replay.rows[0].response_body, replayed: true };
      }
      const pending = await client.query<{
        company_id: string;
        relationship_id: string;
        source_assignment_id: string;
        requested_by: string;
        effective_on: string;
        proposed_reporting_manager_id: string | null;
        branch_id: string | null;
        department_id: string | null;
        designation_id: string;
        job_id: string;
        job_grade_id: string;
        cost_center_id: string;
        work_location_id: string;
        employment_type_id: string;
        employee_category_id: string;
      }>(
        `select request.company_id,request.relationship_id,request.source_assignment_id,
                request.requested_by,request.effective_on::text,request.proposed_reporting_manager_id,
                assignment.branch_id,assignment.department_id,assignment.designation_id,assignment.job_id,
                assignment.job_grade_id,assignment.cost_center_id,assignment.work_location_id,
                assignment.employment_type_id,assignment.employee_category_id
           from hr_employee_manager_change_request request
           join employee_assignment assignment
             on assignment.tenant_id=request.tenant_id and assignment.id=request.source_assignment_id
           join hr_employment_relationship relationship
             on relationship.tenant_id=request.tenant_id and relationship.id=request.relationship_id
          where request.tenant_id=$1 and request.id=$2 and request.employee_id=$3
            and request.request_state='pending' and assignment.assignment_status='active'
            and assignment.effective_to is null and relationship.status='active'
            and exists (
              select 1 from security_user_company_access access
               where access.tenant_id=request.tenant_id and access.user_id=$4
                 and access.company_id=request.company_id and access.revoked_at is null
            )
          for update of request,assignment,relationship`,
        [context.tenantId, requestId, employeeId, context.actor.userId],
      );
      const row = pending.rows[0];
      if (!row)
        throw new HrApiError(
          409,
          "HR_MANAGER_CHANGE_NOT_PENDING",
          "The manager-change request is not pending in your company scope.",
        );
      const approvalOverrideEventId = await this.resolveApprovalOverride(client, context, {
        normalDecisionPermission: "hr.employee_assignment.change",
        makerActorIds: [row.requested_by],
        resourceType: "hr.employee_manager_change_request",
        resourceId: requestId,
        decisionAction: input.decision === "approved" ? "approve" : "reject",
        reason: input.reason,
        correlationId,
        idempotencyKey,
      });
      const currentDate = (await client.query<{ current_date: string }>("select current_date::text as current_date"))
        .rows[0]?.current_date;
      if (row.effective_on !== currentDate)
        throw new HrApiError(
          409,
          "HR_MANAGER_CHANGE_EFFECTIVE_DATE_REQUIRED",
          "This manager change can only be decided on its effective date.",
        );
      let assignmentId: string | null = null;
      if (input.decision === "approved") {
        await client.query(
          `update employee_assignment
              set effective_to=($3::date - 1),assignment_status='ended',updated_at=now()
            where tenant_id=$1 and id=$2`,
          [context.tenantId, row.source_assignment_id, row.effective_on],
        );
        assignmentId = `employee-assignment-${randomUUID()}`;
        await client.query(
          `insert into employee_assignment
            (id,tenant_id,employee_id,company_id,branch_id,department_id,designation_id,job_id,
             job_grade_id,cost_center_id,work_location_id,employment_type_id,employee_category_id,
             reporting_manager_id,effective_from,change_reason,created_by,employment_relationship_id,
             assignment_status,source_reference)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'manager_change',$16,$17,'active',$18)`,
          [
            assignmentId,
            context.tenantId,
            employeeId,
            row.company_id,
            row.branch_id,
            row.department_id,
            row.designation_id,
            row.job_id,
            row.job_grade_id,
            row.cost_center_id,
            row.work_location_id,
            row.employment_type_id,
            row.employee_category_id,
            row.proposed_reporting_manager_id,
            row.effective_on,
            context.actor.userId,
            row.relationship_id,
            `hr:manager-change-request:${requestId}`,
          ],
        );
      }
      await client.query(
        `update hr_employee_manager_change_request
            set request_state=$3,decided_by=$4,decided_at=now(),decision_reason=$5,
                projected_assignment_id=$6,approval_override_event_id=$7,row_version=row_version+1
          where tenant_id=$1 and id=$2`,
        [
          context.tenantId,
          requestId,
          input.decision,
          context.actor.userId,
          input.reason,
          assignmentId,
          approvalOverrideEventId,
        ],
      );
      const audit = await this.appendPlatformAudit(
        client,
        context,
        correlationId,
        "hr.employee_assignment.manager_change.decide",
        {
          entityId: requestId,
          before: { status: "pending", source_assignment_id: row.source_assignment_id },
          after: {
            status: input.decision,
            assignment_id: assignmentId,
            reporting_manager_id: row.proposed_reporting_manager_id,
            super_admin_override: approvalOverrideEventId !== null,
          },
        },
      );
      const result: HrEmployeeManagerChangeDecisionResult = {
        id: requestId,
        employee_id: employeeId,
        company_id: row.company_id,
        source_assignment_id: row.source_assignment_id,
        status: input.decision,
        assignment_id: assignmentId,
        audit_event_id: audit,
        replayed: false,
      };
      await client.query(
        `insert into platform_admin_idempotency
          (tenant_id,actor_id,method,path,idempotency_key,request_fingerprint,response_status,response_body,response_etag)
         values ($1,$2,'POST',$3,$4,$5,200,$6,$7)`,
        [context.tenantId, context.actor.userId, path, idempotencyKey, fingerprint, result, stateHash(result)],
      );
      await client.query("commit");
      return result;
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
      if (["23503", "23514"].includes(code))
        throw new HrApiError(
          409,
          "HR_MANAGER_CHANGE_CONTEXT_INVALID",
          "The manager-change context is no longer valid. Refresh the request and active assignment data.",
        );
      throw error;
    } finally {
      client.release();
    }
  }

  async listEmployeeWorkLocationChangeRequests(
    context: HrActorContext,
    query: HrEmployeeWorkLocationChangeRequestDirectoryQuery,
  ): Promise<HrEmployeeWorkLocationChangeRequestDirectory> {
    return this.read(context, "hr.employee_assignment.change", async (client) => {
      await this.requireCompanyAccess(client, context, query.company_id);
      const values: unknown[] = [context.tenantId, query.company_id];
      const filters = ["request.tenant_id=$1", "request.company_id=$2", "request.request_state='pending'"];
      if (query.search) {
        const parameter = values.push(`%${query.search.replace(/[\\%_]/g, "\\$&")}%`);
        filters.push(
          `(employee.employee_number ilike $${parameter} escape '\\' or concat_ws(' ',employee.first_name,employee.middle_name,employee.last_name) ilike $${parameter} escape '\\')`,
        );
      }
      values.push(query.limit);
      const result = await client.query<EmployeeWorkLocationChangeRequestReviewRow>(
        `${this.employeeWorkLocationChangeRequestReviewSelect()}
          where ${filters.join(" and ")}
          order by request.requested_at,request.id
          limit $${values.length}`,
        values,
      );
      return { items: result.rows.map((row) => employeeWorkLocationChangeRequestReview(row, context)) };
    });
  }

  async getEmployeeWorkLocationChangeRequest(
    context: HrActorContext,
    employeeId: string,
    requestId: string,
  ): Promise<HrEmployeeWorkLocationChangeRequestReview> {
    return this.read(context, "hr.employee_assignment.change", async (client) => {
      const result = await client.query<EmployeeWorkLocationChangeRequestReviewRow>(
        `${this.employeeWorkLocationChangeRequestReviewSelect()}
          where request.tenant_id=$1 and request.id=$2 and request.employee_id=$3
            and exists (
              select 1 from security_user_company_access access
               where access.tenant_id=request.tenant_id and access.user_id=$4
                 and access.company_id=request.company_id and access.revoked_at is null
            )`,
        [context.tenantId, requestId, employeeId, context.actor.userId],
      );
      if (!result.rows[0])
        throw new HrApiError(
          404,
          "HR_WORK_LOCATION_CHANGE_NOT_FOUND",
          "The work-location-change request is unavailable in your company scope.",
        );
      return employeeWorkLocationChangeRequestReview(result.rows[0], context);
    });
  }

  async createEmployeeWorkLocationChangeRequest(
    context: HrActorContext,
    employeeId: string,
    input: CreateHrEmployeeWorkLocationChangeRequest,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<HrEmployeeWorkLocationChangeRequestResult> {
    if (!validIdempotencyKey(idempotencyKey))
      throw new HrApiError(400, "INVALID_IDEMPOTENCY_KEY", "The idempotency key is invalid.");
    if (!context.actor.permissions.includes("hr.employee_assignment.change"))
      throw new HrApiError(403, "PERMISSION_DENIED", "You are not permitted to request work-location changes.");
    const client = await this.pool.connect();
    try {
      await client.query("begin isolation level serializable");
      await client.query("select set_config('nexora.tenant_id',$1,true)", [context.tenantId]);
      await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
        `nexora:hr:employee-work-location-change:${context.tenantId}:${input.source_assignment_id}`,
      ]);
      await this.requireCompanyAccess(client, context, input.company_id);
      const path = `/api/v1/hr/employees/${employeeId}/work_location_change_requests`;
      const fingerprint = stateHash(input);
      const replay = await client.query<{
        request_fingerprint: string;
        response_body: HrEmployeeWorkLocationChangeRequestResult;
      }>(
        `select request_fingerprint,response_body from platform_admin_idempotency
          where tenant_id=$1 and actor_id=$2 and method='POST' and path=$3 and idempotency_key=$4 for update`,
        [context.tenantId, context.actor.userId, path, idempotencyKey],
      );
      if (replay.rows[0]) {
        if (replay.rows[0].request_fingerprint !== fingerprint)
          throw new HrApiError(
            409,
            "IDEMPOTENCY_CONFLICT",
            "The idempotency key was already used for another request.",
          );
        await client.query("commit");
        return { ...replay.rows[0].response_body, replayed: true };
      }
      const currentDate = (await client.query<{ current_date: string }>("select current_date::text as current_date"))
        .rows[0]?.current_date;
      if (input.effective_on !== currentDate)
        throw new HrApiError(
          409,
          "HR_WORK_LOCATION_CHANGE_EFFECTIVE_DATE_REQUIRED",
          "This work-location-change workflow currently requires today's effective date.",
        );
      const source = await client.query<{
        relationship_id: string;
        work_location_id: string;
      }>(
        `select assignment.employment_relationship_id as relationship_id,assignment.work_location_id
           from employee_assignment assignment
           join employee on employee.tenant_id=assignment.tenant_id and employee.id=assignment.employee_id
           join hr_employment_relationship relationship
             on relationship.tenant_id=assignment.tenant_id and relationship.id=assignment.employment_relationship_id
          where assignment.tenant_id=$1 and assignment.id=$2 and assignment.employee_id=$3
            and assignment.company_id=$4 and assignment.assignment_status='active'
            and assignment.effective_to is null and assignment.effective_from<current_date
            and employee.status in ('active','probation','confirmed','suspended')
            and relationship.status='active'
          for update of assignment,employee,relationship`,
        [context.tenantId, input.source_assignment_id, employeeId, input.company_id],
      );
      const sourceRow = source.rows[0];
      if (!sourceRow?.relationship_id)
        throw new HrApiError(
          409,
          "HR_WORK_LOCATION_CHANGE_SOURCE_UNAVAILABLE",
          "The source assignment is no longer eligible for a work-location change.",
        );
      if (sourceRow.work_location_id === input.work_location_id)
        throw new HrApiError(
          409,
          "HR_WORK_LOCATION_CHANGE_REQUIRED",
          "A work-location-change request must select a different work location.",
        );
      const target = await client.query<{ profile_id: string }>(
        `select profile.id as profile_id
           from hr_master_record location
           join hr_work_location_profile profile
             on profile.tenant_id=location.tenant_id
            and profile.company_id=location.company_id
            and profile.work_location_id=location.id
          where location.tenant_id=$1 and location.id=$2 and location.company_id=$3
            and location.master_type='work_location' and location.status='active'
            and profile.state in ('approved','active')
            and profile.effective_from<=$4::date
            and (profile.effective_to is null or profile.effective_to>=$4::date)
          order by profile.effective_from desc,profile.id
          limit 1
          for share of location,profile`,
        [context.tenantId, input.work_location_id, input.company_id, input.effective_on],
      );
      const profileId = target.rows[0]?.profile_id;
      if (!profileId)
        throw new HrApiError(
          409,
          "HR_WORK_LOCATION_JURISDICTION_REQUIRED",
          "The target work location requires an effective approved jurisdiction profile.",
        );
      const pending = await client.query(
        `select 1 from hr_employee_work_location_change_request
          where tenant_id=$1 and source_assignment_id=$2 and request_state='pending'`,
        [context.tenantId, input.source_assignment_id],
      );
      if (pending.rowCount)
        throw new HrApiError(
          409,
          "HR_WORK_LOCATION_CHANGE_ALREADY_PENDING",
          "A work-location-change request is already pending for this assignment.",
        );
      const id = `employee-work-location-change-request-${randomUUID()}`;
      await client.query(
        `insert into hr_employee_work_location_change_request
          (tenant_id,id,employee_id,company_id,relationship_id,source_assignment_id,
           current_work_location_id,proposed_work_location_id,proposed_work_location_profile_id,
           effective_on,reason,requested_by)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [
          context.tenantId,
          id,
          employeeId,
          input.company_id,
          sourceRow.relationship_id,
          input.source_assignment_id,
          sourceRow.work_location_id,
          input.work_location_id,
          profileId,
          input.effective_on,
          input.reason,
          context.actor.userId,
        ],
      );
      const audit = await this.appendPlatformAudit(
        client,
        context,
        correlationId,
        "hr.employee_assignment.work_location_change.request",
        {
          entityId: id,
          before: { work_location_id: sourceRow.work_location_id },
          after: {
            employee_id: employeeId,
            company_id: input.company_id,
            source_assignment_id: input.source_assignment_id,
            work_location_id: input.work_location_id,
            jurisdiction_profile_id: profileId,
            effective_on: input.effective_on,
            status: "pending",
          },
        },
      );
      const result: HrEmployeeWorkLocationChangeRequestResult = {
        id,
        employee_id: employeeId,
        company_id: input.company_id,
        source_assignment_id: input.source_assignment_id,
        status: "pending",
        audit_event_id: audit,
        replayed: false,
      };
      await client.query(
        `insert into platform_admin_idempotency
          (tenant_id,actor_id,method,path,idempotency_key,request_fingerprint,response_status,response_body,response_etag)
         values ($1,$2,'POST',$3,$4,$5,201,$6,$7)`,
        [context.tenantId, context.actor.userId, path, idempotencyKey, fingerprint, result, stateHash(result)],
      );
      await client.query("commit");
      return result;
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
      if (["23503", "23514"].includes(code))
        throw new HrApiError(
          409,
          "HR_WORK_LOCATION_CHANGE_CONTEXT_INVALID",
          "The work-location-change context is no longer valid. Refresh the assignment and location data.",
        );
      if (code === "23505")
        throw new HrApiError(
          409,
          "HR_WORK_LOCATION_CHANGE_ALREADY_PENDING",
          "A work-location-change request is already pending for this assignment.",
        );
      throw error;
    } finally {
      client.release();
    }
  }

  async decideEmployeeWorkLocationChangeRequest(
    context: HrActorContext,
    employeeId: string,
    requestId: string,
    input: DecideHrEmployeeWorkLocationChangeRequest,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<HrEmployeeWorkLocationChangeDecisionResult> {
    if (!validIdempotencyKey(idempotencyKey))
      throw new HrApiError(400, "INVALID_IDEMPOTENCY_KEY", "The idempotency key is invalid.");
    if (!context.actor.permissions.includes("hr.employee_assignment.change"))
      throw new HrApiError(403, "PERMISSION_DENIED", "You are not permitted to decide work-location changes.");
    const client = await this.pool.connect();
    try {
      await client.query("begin isolation level serializable");
      await client.query("select set_config('nexora.tenant_id',$1,true)", [context.tenantId]);
      await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
        `nexora:hr:employee-work-location-change:${context.tenantId}:${requestId}`,
      ]);
      const path = `/api/v1/hr/employees/${employeeId}/work_location_change_requests/${requestId}/decision`;
      const fingerprint = stateHash(input);
      const replay = await client.query<{
        request_fingerprint: string;
        response_body: HrEmployeeWorkLocationChangeDecisionResult;
      }>(
        `select request_fingerprint,response_body from platform_admin_idempotency
          where tenant_id=$1 and actor_id=$2 and method='POST' and path=$3 and idempotency_key=$4 for update`,
        [context.tenantId, context.actor.userId, path, idempotencyKey],
      );
      if (replay.rows[0]) {
        if (replay.rows[0].request_fingerprint !== fingerprint)
          throw new HrApiError(
            409,
            "IDEMPOTENCY_CONFLICT",
            "The idempotency key was already used for another request.",
          );
        await client.query("commit");
        return { ...replay.rows[0].response_body, replayed: true };
      }
      const pending = await client.query<{
        company_id: string;
        relationship_id: string;
        source_assignment_id: string;
        requested_by: string;
        effective_on: string;
        proposed_work_location_id: string;
        proposed_work_location_profile_id: string;
        profile_state: string;
        profile_effective_from: string;
        profile_effective_to: string | null;
        branch_id: string | null;
        department_id: string | null;
        designation_id: string;
        job_id: string;
        job_grade_id: string;
        cost_center_id: string;
        employment_type_id: string;
        employee_category_id: string;
        reporting_manager_id: string | null;
      }>(
        `select request.company_id,request.relationship_id,request.source_assignment_id,
                request.requested_by,request.effective_on::text,request.proposed_work_location_id,
                request.proposed_work_location_profile_id,profile.state as profile_state,
                profile.effective_from::text as profile_effective_from,
                profile.effective_to::text as profile_effective_to,
                assignment.branch_id,assignment.department_id,assignment.designation_id,assignment.job_id,
                assignment.job_grade_id,assignment.cost_center_id,assignment.employment_type_id,
                assignment.employee_category_id,assignment.reporting_manager_id
           from hr_employee_work_location_change_request request
           join employee_assignment assignment
             on assignment.tenant_id=request.tenant_id and assignment.id=request.source_assignment_id
           join hr_employment_relationship relationship
             on relationship.tenant_id=request.tenant_id and relationship.id=request.relationship_id
           join hr_work_location_profile profile
             on profile.tenant_id=request.tenant_id
            and profile.id=request.proposed_work_location_profile_id
            and profile.company_id=request.company_id
          where request.tenant_id=$1 and request.id=$2 and request.employee_id=$3
            and request.request_state='pending' and assignment.assignment_status='active'
            and assignment.effective_to is null and relationship.status='active'
            and exists (
              select 1 from security_user_company_access access
               where access.tenant_id=request.tenant_id and access.user_id=$4
                 and access.company_id=request.company_id and access.revoked_at is null
            )
          for update of request,assignment,relationship,profile`,
        [context.tenantId, requestId, employeeId, context.actor.userId],
      );
      const row = pending.rows[0];
      if (!row)
        throw new HrApiError(
          409,
          "HR_WORK_LOCATION_CHANGE_NOT_PENDING",
          "The work-location-change request is not pending in your company scope.",
        );
      const approvalOverrideEventId = await this.resolveApprovalOverride(client, context, {
        normalDecisionPermission: "hr.employee_assignment.change",
        makerActorIds: [row.requested_by],
        resourceType: "hr.employee_work_location_change_request",
        resourceId: requestId,
        decisionAction: input.decision === "approved" ? "approve" : "reject",
        reason: input.reason,
        correlationId,
        idempotencyKey,
      });
      const currentDate = (await client.query<{ current_date: string }>("select current_date::text as current_date"))
        .rows[0]?.current_date;
      if (row.effective_on !== currentDate)
        throw new HrApiError(
          409,
          "HR_WORK_LOCATION_CHANGE_EFFECTIVE_DATE_REQUIRED",
          "This work-location change can only be decided on its effective date.",
        );
      const jurisdictionReady =
        ["approved", "active"].includes(row.profile_state) &&
        row.profile_effective_from <= row.effective_on &&
        (row.profile_effective_to === null || row.profile_effective_to >= row.effective_on);
      if (input.decision === "approved" && !jurisdictionReady)
        throw new HrApiError(
          409,
          "HR_WORK_LOCATION_JURISDICTION_REQUIRED",
          "The target work location no longer has effective approved jurisdiction evidence.",
        );
      let assignmentId: string | null = null;
      if (input.decision === "approved") {
        await client.query(
          `update employee_assignment
              set effective_to=($3::date - 1),assignment_status='ended',updated_at=now()
            where tenant_id=$1 and id=$2`,
          [context.tenantId, row.source_assignment_id, row.effective_on],
        );
        assignmentId = `employee-assignment-${randomUUID()}`;
        await client.query(
          `insert into employee_assignment
            (id,tenant_id,employee_id,company_id,branch_id,department_id,designation_id,job_id,
             job_grade_id,cost_center_id,work_location_id,employment_type_id,employee_category_id,
             reporting_manager_id,effective_from,change_reason,created_by,employment_relationship_id,
             assignment_status,source_reference)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'work_location_change',$16,$17,'active',$18)`,
          [
            assignmentId,
            context.tenantId,
            employeeId,
            row.company_id,
            row.branch_id,
            row.department_id,
            row.designation_id,
            row.job_id,
            row.job_grade_id,
            row.cost_center_id,
            row.proposed_work_location_id,
            row.employment_type_id,
            row.employee_category_id,
            row.reporting_manager_id,
            row.effective_on,
            context.actor.userId,
            row.relationship_id,
            `hr:work-location-change-request:${requestId}`,
          ],
        );
        await client.query(
          `insert into employee_assignment_org_unit
            (tenant_id,assignment_id,organization_type,organization_unit_id,created_by)
           select tenant_id,$3,organization_type,organization_unit_id,$4
             from employee_assignment_org_unit
            where tenant_id=$1 and assignment_id=$2
           on conflict do nothing`,
          [context.tenantId, row.source_assignment_id, assignmentId, context.actor.userId],
        );
      }
      await client.query(
        `update hr_employee_work_location_change_request
            set request_state=$3,decided_by=$4,decided_at=now(),decision_reason=$5,
                projected_assignment_id=$6,approval_override_event_id=$7,row_version=row_version+1
          where tenant_id=$1 and id=$2`,
        [
          context.tenantId,
          requestId,
          input.decision,
          context.actor.userId,
          input.reason,
          assignmentId,
          approvalOverrideEventId,
        ],
      );
      const audit = await this.appendPlatformAudit(
        client,
        context,
        correlationId,
        "hr.employee_assignment.work_location_change.decide",
        {
          entityId: requestId,
          before: { status: "pending", source_assignment_id: row.source_assignment_id },
          after: {
            status: input.decision,
            assignment_id: assignmentId,
            work_location_id: row.proposed_work_location_id,
            jurisdiction_profile_id: row.proposed_work_location_profile_id,
            super_admin_override: approvalOverrideEventId !== null,
          },
        },
      );
      const result: HrEmployeeWorkLocationChangeDecisionResult = {
        id: requestId,
        employee_id: employeeId,
        company_id: row.company_id,
        source_assignment_id: row.source_assignment_id,
        status: input.decision,
        assignment_id: assignmentId,
        audit_event_id: audit,
        replayed: false,
      };
      await client.query(
        `insert into platform_admin_idempotency
          (tenant_id,actor_id,method,path,idempotency_key,request_fingerprint,response_status,response_body,response_etag)
         values ($1,$2,'POST',$3,$4,$5,200,$6,$7)`,
        [context.tenantId, context.actor.userId, path, idempotencyKey, fingerprint, result, stateHash(result)],
      );
      await client.query("commit");
      return result;
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
      if (["23503", "23514"].includes(code))
        throw new HrApiError(
          409,
          "HR_WORK_LOCATION_CHANGE_CONTEXT_INVALID",
          "The work-location-change context is no longer valid. Refresh the request and active assignment data.",
        );
      throw error;
    } finally {
      client.release();
    }
  }

  async listEmployeeOrganizationPlacementChangeRequests(
    context: HrActorContext,
    query: HrEmployeeOrganizationPlacementChangeRequestDirectoryQuery,
  ): Promise<HrEmployeeOrganizationPlacementChangeRequestDirectory> {
    return this.read(context, "hr.employee_assignment.change", async (client) => {
      await this.requireCompanyAccess(client, context, query.company_id);
      const values: unknown[] = [context.tenantId, query.company_id];
      const filters = ["request.tenant_id=$1", "request.company_id=$2", "request.request_state='pending'"];
      if (query.search) {
        const parameter = values.push(`%${query.search.replace(/[\\%_]/g, "\\$&")}%`);
        filters.push(
          `(employee.employee_number ilike $${parameter} escape '\\' or concat_ws(' ',employee.first_name,employee.middle_name,employee.last_name) ilike $${parameter} escape '\\')`,
        );
      }
      values.push(query.limit);
      const result = await client.query<EmployeeOrganizationPlacementChangeRequestReviewRow>(
        `${this.employeeOrganizationPlacementChangeRequestReviewSelect()}
          where ${filters.join(" and ")}
          order by request.requested_at,request.id
          limit $${values.length}`,
        values,
      );
      return {
        items: result.rows.map((row) => employeeOrganizationPlacementChangeRequestReview(row, context)),
      };
    });
  }

  async getEmployeeOrganizationPlacementChangeRequest(
    context: HrActorContext,
    employeeId: string,
    requestId: string,
  ): Promise<HrEmployeeOrganizationPlacementChangeRequestReview> {
    return this.read(context, "hr.employee_assignment.change", async (client) => {
      const result = await client.query<EmployeeOrganizationPlacementChangeRequestReviewRow>(
        `${this.employeeOrganizationPlacementChangeRequestReviewSelect()}
          where request.tenant_id=$1 and request.id=$2 and request.employee_id=$3
            and exists (
              select 1 from security_user_company_access access
               where access.tenant_id=request.tenant_id and access.user_id=$4
                 and access.company_id=request.company_id and access.revoked_at is null
            )`,
        [context.tenantId, requestId, employeeId, context.actor.userId],
      );
      if (!result.rows[0])
        throw new HrApiError(
          404,
          "HR_ORGANIZATION_PLACEMENT_CHANGE_NOT_FOUND",
          "The organization-placement-change request is unavailable in your company scope.",
        );
      return employeeOrganizationPlacementChangeRequestReview(result.rows[0], context);
    });
  }

  async createEmployeeOrganizationPlacementChangeRequest(
    context: HrActorContext,
    employeeId: string,
    input: CreateHrEmployeeOrganizationPlacementChangeRequest,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<HrEmployeeOrganizationPlacementChangeRequestResult> {
    if (!validIdempotencyKey(idempotencyKey))
      throw new HrApiError(400, "INVALID_IDEMPOTENCY_KEY", "The idempotency key is invalid.");
    if (!context.actor.permissions.includes("hr.employee_assignment.change"))
      throw new HrApiError(403, "PERMISSION_DENIED", "You are not permitted to request organization changes.");
    const client = await this.pool.connect();
    try {
      await client.query("begin isolation level serializable");
      await client.query("select set_config('nexora.tenant_id',$1,true)", [context.tenantId]);
      await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
        `nexora:hr:employee-organization-placement-change:${context.tenantId}:${input.source_assignment_id}`,
      ]);
      await this.requireCompanyAccess(client, context, input.company_id);
      const path = `/api/v1/hr/employees/${employeeId}/organization_placement_change_requests`;
      const fingerprint = stateHash(input);
      const replay = await client.query<{
        request_fingerprint: string;
        response_body: HrEmployeeOrganizationPlacementChangeRequestResult;
      }>(
        `select request_fingerprint,response_body from platform_admin_idempotency
          where tenant_id=$1 and actor_id=$2 and method='POST' and path=$3 and idempotency_key=$4 for update`,
        [context.tenantId, context.actor.userId, path, idempotencyKey],
      );
      if (replay.rows[0]) {
        if (replay.rows[0].request_fingerprint !== fingerprint)
          throw new HrApiError(
            409,
            "IDEMPOTENCY_CONFLICT",
            "The idempotency key was already used for another request.",
          );
        await client.query("commit");
        return { ...replay.rows[0].response_body, replayed: true };
      }
      const currentDate = (await client.query<{ current_date: string }>("select current_date::text as current_date"))
        .rows[0]?.current_date;
      if (input.effective_on !== currentDate)
        throw new HrApiError(
          409,
          "HR_ORGANIZATION_PLACEMENT_EFFECTIVE_DATE_REQUIRED",
          "This organization-placement workflow currently requires today's effective date.",
        );
      const source = await client.query<{
        relationship_id: string;
        business_unit_id: string | null;
        division_id: string | null;
        branch_id: string | null;
        department_id: string | null;
        warehouse_id: string | null;
      }>(
        `select assignment.employment_relationship_id as relationship_id,
                (select organization_unit_id from employee_assignment_org_unit
                  where tenant_id=assignment.tenant_id and assignment_id=assignment.id
                    and organization_type='business_unit') as business_unit_id,
                (select organization_unit_id from employee_assignment_org_unit
                  where tenant_id=assignment.tenant_id and assignment_id=assignment.id
                    and organization_type='division') as division_id,
                (select organization_unit_id from employee_assignment_org_unit
                  where tenant_id=assignment.tenant_id and assignment_id=assignment.id
                    and organization_type='branch') as branch_id,
                (select organization_unit_id from employee_assignment_org_unit
                  where tenant_id=assignment.tenant_id and assignment_id=assignment.id
                    and organization_type='department') as department_id,
                (select organization_unit_id from employee_assignment_org_unit
                  where tenant_id=assignment.tenant_id and assignment_id=assignment.id
                    and organization_type='warehouse') as warehouse_id
           from employee_assignment assignment
           join employee on employee.tenant_id=assignment.tenant_id and employee.id=assignment.employee_id
           join hr_employment_relationship relationship
             on relationship.tenant_id=assignment.tenant_id and relationship.id=assignment.employment_relationship_id
          where assignment.tenant_id=$1 and assignment.id=$2 and assignment.employee_id=$3
            and assignment.company_id=$4 and assignment.assignment_status='active'
            and assignment.effective_to is null and assignment.effective_from<current_date
            and employee.status in ('active','probation','confirmed','suspended')
            and relationship.status='active'
          for update of assignment,employee,relationship`,
        [context.tenantId, input.source_assignment_id, employeeId, input.company_id],
      );
      const sourceRow = source.rows[0];
      if (!sourceRow?.relationship_id)
        throw new HrApiError(
          409,
          "HR_ORGANIZATION_PLACEMENT_SOURCE_UNAVAILABLE",
          "The source assignment is no longer eligible for an organization-placement change.",
        );
      const current: HrOrganizationPlacementSnapshot = {
        business_unit_id: sourceRow.business_unit_id,
        division_id: sourceRow.division_id,
        branch_id: sourceRow.branch_id,
        department_id: sourceRow.department_id,
        warehouse_id: sourceRow.warehouse_id,
      };
      if (stateHash(current) === stateHash(input.proposed))
        throw new HrApiError(
          409,
          "HR_ORGANIZATION_PLACEMENT_CHANGE_REQUIRED",
          "The proposed organization hierarchy must differ from the current hierarchy.",
        );
      const readiness = await client.query<{ ready: boolean }>(
        `select hr_organization_placement_is_coherent($1,$2,$3,$4,$5,$6,$7) as ready`,
        [
          context.tenantId,
          input.company_id,
          input.proposed.business_unit_id,
          input.proposed.division_id,
          input.proposed.branch_id,
          input.proposed.department_id,
          input.proposed.warehouse_id,
        ],
      );
      if (!readiness.rows[0]?.ready)
        throw new HrApiError(
          409,
          "HR_ORGANIZATION_PLACEMENT_HIERARCHY_INVALID",
          "The proposed organization units must form one active hierarchy in the legal company.",
        );
      const pending = await client.query(
        `select 1 from hr_employee_organization_placement_change_request
          where tenant_id=$1 and source_assignment_id=$2 and request_state='pending'`,
        [context.tenantId, input.source_assignment_id],
      );
      if (pending.rowCount)
        throw new HrApiError(
          409,
          "HR_ORGANIZATION_PLACEMENT_ALREADY_PENDING",
          "An organization-placement-change request is already pending for this assignment.",
        );
      const id = `employee-organization-placement-change-request-${randomUUID()}`;
      await client.query(
        `insert into hr_employee_organization_placement_change_request
          (tenant_id,id,employee_id,company_id,relationship_id,source_assignment_id,
           current_business_unit_id,current_division_id,current_branch_id,current_department_id,current_warehouse_id,
           proposed_business_unit_id,proposed_division_id,proposed_branch_id,proposed_department_id,proposed_warehouse_id,
           effective_on,reason,requested_by)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)`,
        [
          context.tenantId,
          id,
          employeeId,
          input.company_id,
          sourceRow.relationship_id,
          input.source_assignment_id,
          current.business_unit_id,
          current.division_id,
          current.branch_id,
          current.department_id,
          current.warehouse_id,
          input.proposed.business_unit_id,
          input.proposed.division_id,
          input.proposed.branch_id,
          input.proposed.department_id,
          input.proposed.warehouse_id,
          input.effective_on,
          input.reason,
          context.actor.userId,
        ],
      );
      const audit = await this.appendPlatformAudit(
        client,
        context,
        correlationId,
        "hr.employee_assignment.organization_change.request",
        { entityId: id, before: current, after: { ...input.proposed, status: "pending" } },
      );
      const result: HrEmployeeOrganizationPlacementChangeRequestResult = {
        id,
        employee_id: employeeId,
        company_id: input.company_id,
        source_assignment_id: input.source_assignment_id,
        status: "pending",
        audit_event_id: audit,
        replayed: false,
      };
      await client.query(
        `insert into platform_admin_idempotency
          (tenant_id,actor_id,method,path,idempotency_key,request_fingerprint,response_status,response_body,response_etag)
         values ($1,$2,'POST',$3,$4,$5,201,$6,$7)`,
        [context.tenantId, context.actor.userId, path, idempotencyKey, fingerprint, result, stateHash(result)],
      );
      await client.query("commit");
      return result;
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
      if (["23503", "23514"].includes(code))
        throw new HrApiError(
          409,
          "HR_ORGANIZATION_PLACEMENT_CONTEXT_INVALID",
          "The organization-placement context is no longer valid. Refresh the assignment and hierarchy data.",
        );
      if (code === "23505")
        throw new HrApiError(
          409,
          "HR_ORGANIZATION_PLACEMENT_ALREADY_PENDING",
          "An organization-placement-change request is already pending for this assignment.",
        );
      throw error;
    } finally {
      client.release();
    }
  }

  async decideEmployeeOrganizationPlacementChangeRequest(
    context: HrActorContext,
    employeeId: string,
    requestId: string,
    input: DecideHrEmployeeOrganizationPlacementChangeRequest,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<HrEmployeeOrganizationPlacementChangeDecisionResult> {
    if (!validIdempotencyKey(idempotencyKey))
      throw new HrApiError(400, "INVALID_IDEMPOTENCY_KEY", "The idempotency key is invalid.");
    if (!context.actor.permissions.includes("hr.employee_assignment.change"))
      throw new HrApiError(403, "PERMISSION_DENIED", "You are not permitted to decide organization changes.");
    const client = await this.pool.connect();
    try {
      await client.query("begin isolation level serializable");
      await client.query("select set_config('nexora.tenant_id',$1,true)", [context.tenantId]);
      await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
        `nexora:hr:employee-organization-placement-change:${context.tenantId}:${requestId}`,
      ]);
      const path = `/api/v1/hr/employees/${employeeId}/organization_placement_change_requests/${requestId}/decision`;
      const fingerprint = stateHash(input);
      const replay = await client.query<{
        request_fingerprint: string;
        response_body: HrEmployeeOrganizationPlacementChangeDecisionResult;
      }>(
        `select request_fingerprint,response_body from platform_admin_idempotency
          where tenant_id=$1 and actor_id=$2 and method='POST' and path=$3 and idempotency_key=$4 for update`,
        [context.tenantId, context.actor.userId, path, idempotencyKey],
      );
      if (replay.rows[0]) {
        if (replay.rows[0].request_fingerprint !== fingerprint)
          throw new HrApiError(
            409,
            "IDEMPOTENCY_CONFLICT",
            "The idempotency key was already used for another request.",
          );
        await client.query("commit");
        return { ...replay.rows[0].response_body, replayed: true };
      }
      const pending = await client.query<{
        company_id: string;
        relationship_id: string;
        source_assignment_id: string;
        requested_by: string;
        effective_on: string;
        proposed_business_unit_id: string | null;
        proposed_division_id: string | null;
        proposed_branch_id: string | null;
        proposed_department_id: string | null;
        proposed_warehouse_id: string | null;
        designation_id: string;
        job_id: string;
        job_grade_id: string;
        cost_center_id: string;
        work_location_id: string;
        employment_type_id: string;
        employee_category_id: string;
        reporting_manager_id: string | null;
      }>(
        `select request.company_id,request.relationship_id,request.source_assignment_id,
                request.requested_by,request.effective_on::text,
                request.proposed_business_unit_id,request.proposed_division_id,
                request.proposed_branch_id,request.proposed_department_id,request.proposed_warehouse_id,
                assignment.designation_id,assignment.job_id,assignment.job_grade_id,
                assignment.cost_center_id,assignment.work_location_id,assignment.employment_type_id,
                assignment.employee_category_id,assignment.reporting_manager_id
           from hr_employee_organization_placement_change_request request
           join employee_assignment assignment
             on assignment.tenant_id=request.tenant_id and assignment.id=request.source_assignment_id
           join hr_employment_relationship relationship
             on relationship.tenant_id=request.tenant_id and relationship.id=request.relationship_id
          where request.tenant_id=$1 and request.id=$2 and request.employee_id=$3
            and request.request_state='pending' and assignment.assignment_status='active'
            and assignment.effective_to is null and relationship.status='active'
            and exists (
              select 1 from security_user_company_access access
               where access.tenant_id=request.tenant_id and access.user_id=$4
                 and access.company_id=request.company_id and access.revoked_at is null
            )
          for update of request,assignment,relationship`,
        [context.tenantId, requestId, employeeId, context.actor.userId],
      );
      const row = pending.rows[0];
      if (!row)
        throw new HrApiError(
          409,
          "HR_ORGANIZATION_PLACEMENT_NOT_PENDING",
          "The organization-placement-change request is not pending in your company scope.",
        );
      const approvalOverrideEventId = await this.resolveApprovalOverride(client, context, {
        normalDecisionPermission: "hr.employee_assignment.change",
        makerActorIds: [row.requested_by],
        resourceType: "hr.employee_organization_placement_change_request",
        resourceId: requestId,
        decisionAction: input.decision === "approved" ? "approve" : "reject",
        reason: input.reason,
        correlationId,
        idempotencyKey,
      });
      const currentDate = (await client.query<{ current_date: string }>("select current_date::text as current_date"))
        .rows[0]?.current_date;
      if (row.effective_on !== currentDate)
        throw new HrApiError(
          409,
          "HR_ORGANIZATION_PLACEMENT_EFFECTIVE_DATE_REQUIRED",
          "This organization-placement change can only be decided on its effective date.",
        );
      if (input.decision === "approved") {
        const readiness = await client.query<{ ready: boolean }>(
          `select hr_organization_placement_is_coherent($1,$2,$3,$4,$5,$6,$7) as ready`,
          [
            context.tenantId,
            row.company_id,
            row.proposed_business_unit_id,
            row.proposed_division_id,
            row.proposed_branch_id,
            row.proposed_department_id,
            row.proposed_warehouse_id,
          ],
        );
        if (!readiness.rows[0]?.ready)
          throw new HrApiError(
            409,
            "HR_ORGANIZATION_PLACEMENT_HIERARCHY_INVALID",
            "The proposed organization hierarchy is no longer active and coherent.",
          );
      }
      let assignmentId: string | null = null;
      if (input.decision === "approved") {
        await client.query(
          `update employee_assignment
              set effective_to=($3::date - 1),assignment_status='ended',updated_at=now()
            where tenant_id=$1 and id=$2`,
          [context.tenantId, row.source_assignment_id, row.effective_on],
        );
        assignmentId = `employee-assignment-${randomUUID()}`;
        await client.query(
          `insert into employee_assignment
            (id,tenant_id,employee_id,company_id,branch_id,department_id,designation_id,job_id,
             job_grade_id,cost_center_id,work_location_id,employment_type_id,employee_category_id,
             reporting_manager_id,effective_from,change_reason,created_by,employment_relationship_id,
             assignment_status,source_reference)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'organization_change',$16,$17,'active',$18)`,
          [
            assignmentId,
            context.tenantId,
            employeeId,
            row.company_id,
            row.proposed_branch_id,
            row.proposed_department_id,
            row.designation_id,
            row.job_id,
            row.job_grade_id,
            row.cost_center_id,
            row.work_location_id,
            row.employment_type_id,
            row.employee_category_id,
            row.reporting_manager_id,
            row.effective_on,
            context.actor.userId,
            row.relationship_id,
            `hr:organization-placement-change-request:${requestId}`,
          ],
        );
        await client.query(
          `insert into employee_assignment_org_unit
            (tenant_id,assignment_id,organization_type,organization_unit_id,created_by)
           select $1,$2,placement.organization_type,placement.organization_unit_id,$3
             from (values
               ('business_unit',$4::text),('division',$5::text),('branch',$6::text),
               ('department',$7::text),('warehouse',$8::text)
             ) placement(organization_type,organization_unit_id)
            where placement.organization_unit_id is not null
           on conflict do nothing`,
          [
            context.tenantId,
            assignmentId,
            context.actor.userId,
            row.proposed_business_unit_id,
            row.proposed_division_id,
            row.proposed_branch_id,
            row.proposed_department_id,
            row.proposed_warehouse_id,
          ],
        );
      }
      await client.query(
        `update hr_employee_organization_placement_change_request
            set request_state=$3,decided_by=$4,decided_at=now(),decision_reason=$5,
                projected_assignment_id=$6,approval_override_event_id=$7,row_version=row_version+1
          where tenant_id=$1 and id=$2`,
        [
          context.tenantId,
          requestId,
          input.decision,
          context.actor.userId,
          input.reason,
          assignmentId,
          approvalOverrideEventId,
        ],
      );
      const audit = await this.appendPlatformAudit(
        client,
        context,
        correlationId,
        "hr.employee_assignment.organization_change.decide",
        {
          entityId: requestId,
          before: { status: "pending", source_assignment_id: row.source_assignment_id },
          after: {
            status: input.decision,
            assignment_id: assignmentId,
            super_admin_override: approvalOverrideEventId !== null,
          },
        },
      );
      const result: HrEmployeeOrganizationPlacementChangeDecisionResult = {
        id: requestId,
        employee_id: employeeId,
        company_id: row.company_id,
        source_assignment_id: row.source_assignment_id,
        status: input.decision,
        assignment_id: assignmentId,
        audit_event_id: audit,
        replayed: false,
      };
      await client.query(
        `insert into platform_admin_idempotency
          (tenant_id,actor_id,method,path,idempotency_key,request_fingerprint,response_status,response_body,response_etag)
         values ($1,$2,'POST',$3,$4,$5,200,$6,$7)`,
        [context.tenantId, context.actor.userId, path, idempotencyKey, fingerprint, result, stateHash(result)],
      );
      await client.query("commit");
      return result;
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
      if (["23503", "23514"].includes(code))
        throw new HrApiError(
          409,
          "HR_ORGANIZATION_PLACEMENT_CONTEXT_INVALID",
          "The organization-placement context is no longer valid. Refresh the request and hierarchy data.",
        );
      throw error;
    } finally {
      client.release();
    }
  }

  async listMasters(context: HrActorContext, query: HrMasterDirectoryQuery): Promise<HrMasterDirectory> {
    return this.read(context, "hr.master.read", async (client) => {
      await this.requireCompanyAccess(client, context, query.company_id);
      const values: unknown[] = [context.tenantId, query.company_id];
      const filters = ["tenant_id = $1", "company_id = $2"];
      if (query.type) filters.push(`master_type = $${values.push(query.type)}`);
      if (query.active_only) filters.push("status = 'active'");
      values.push(query.limit);
      const result = await client.query<{
        id: string;
        company_id: string;
        type: HrMasterDirectory["items"][number]["type"];
        code: string;
        name: string;
        description: string;
        status: "active" | "inactive";
        configuration_key: HrMasterDirectory["items"][number]["configuration_key"];
        configuration_value: string | null;
      }>(
        `select id, company_id, master_type as type, code, name, description, status,
                configuration_key,configuration_value
           from hr_master_record where ${filters.join(" and ")}
          order by master_type, code, id limit $${values.length}`,
        values,
      );
      return { items: result.rows };
    });
  }

  async listJobGrades(context: HrActorContext, companyId: string): Promise<HrJobGradeDirectory> {
    return this.read(context, "hr.master.read", async (client) => {
      await this.requireCompanyAccess(client, context, companyId);
      const result = await client.query<HrJobGradeDirectory["items"][number]>(
        `select master.id,master.company_id,master.master_type as type,master.code,master.name,
                master.description,master.status,master.configuration_key,master.configuration_value,
                detail.grade_level,detail.currency_code,
                detail.band_minimum::text,detail.band_midpoint::text,detail.band_maximum::text
           from hr_master_record master
           join hr_job_grade_detail detail
             on detail.tenant_id=master.tenant_id and detail.master_record_id=master.id
          where master.tenant_id=$1 and master.company_id=$2 and master.master_type='job_grade'
          order by detail.grade_level,master.code,master.id
          limit 100`,
        [context.tenantId, companyId],
      );
      return { items: result.rows };
    });
  }

  async createJobGrade(
    context: HrActorContext,
    input: CreateHrJobGradeRequest,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<HrMasterMutationResult> {
    return this.mutateJobGrade(context, "create", undefined, input, idempotencyKey, correlationId);
  }

  async updateJobGrade(
    context: HrActorContext,
    gradeId: string,
    input: UpdateHrJobGradeRequest,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<HrMasterMutationResult> {
    return this.mutateJobGrade(context, "update", gradeId, input, idempotencyKey, correlationId);
  }

  private async mutateJobGrade(
    context: HrActorContext,
    operation: "create" | "update",
    gradeId: string | undefined,
    input: CreateHrJobGradeRequest | UpdateHrJobGradeRequest,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<HrMasterMutationResult> {
    if (!validIdempotencyKey(idempotencyKey)) throw new HrApiError(400, "INVALID_IDEMPOTENCY_KEY", "The idempotency key is invalid.");
    const permission = operation === "create" ? "hr.master.create" : "hr.master.update";
    if (!context.actor.permissions.includes(permission)) throw new HrApiError(403, "PERMISSION_DENIED", "You are not permitted to maintain job grades.");
    const client = await this.pool.connect();
    const path = operation === "create" ? "/api/v1/hr/job_grades" : `/api/v1/hr/job_grades/${gradeId}`;
    try {
      await client.query("begin isolation level read committed");
      await client.query("select set_config('nexora.tenant_id',$1,true)", [context.tenantId]);
      await this.requireCompanyAccess(client, context, input.company_id);
      const fingerprint = stateHash({ gradeId, input });
      const replay = await client.query<{ request_fingerprint: string; response_body: HrMasterMutationResult }>(
        `select request_fingerprint,response_body from platform_admin_idempotency where tenant_id=$1 and actor_id=$2 and method=$3 and path=$4 and idempotency_key=$5 for update`,
        [context.tenantId, context.actor.userId, operation === "create" ? "POST" : "PATCH", path, idempotencyKey],
      );
      if (replay.rows[0]) {
        if (replay.rows[0].request_fingerprint !== fingerprint) throw new HrApiError(409, "IDEMPOTENCY_CONFLICT", "The idempotency key was already used for another request.");
        await client.query("commit");
        return { ...replay.rows[0].response_body, replayed: true };
      }
      const before = gradeId ? (await client.query(
        `select master.id,master.code,master.name,master.description,master.status,detail.grade_level,
                detail.currency_code,detail.band_minimum::text,detail.band_midpoint::text,detail.band_maximum::text
           from hr_master_record master join hr_job_grade_detail detail
             on detail.tenant_id=master.tenant_id and detail.master_record_id=master.id
          where master.tenant_id=$1 and master.id=$2 and master.company_id=$3 and master.master_type='job_grade' for update`,
        [context.tenantId, gradeId, input.company_id],
      )).rows[0] : null;
      if (gradeId && !before) throw new HrApiError(404, "HR_JOB_GRADE_NOT_FOUND", "Job grade was not found.");
      let id = gradeId;
      if (operation === "create") {
        id = `hr-grade-${randomUUID()}`;
        await client.query(
          `insert into hr_master_record (id,tenant_id,company_id,master_type,code,name,description,status,created_by)
           values ($1,$2,$3,'job_grade',$4,$5,$6,'active',$7)`,
          [id, context.tenantId, input.company_id, input.code.toUpperCase(), input.name, input.description, context.actor.userId],
        );
        await client.query(
          `insert into hr_job_grade_detail (tenant_id,master_record_id,company_id,grade_level,currency_code,band_minimum,band_midpoint,band_maximum)
           values ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [context.tenantId, id, input.company_id, input.grade_level, input.currency_code.toUpperCase(), input.band_minimum, input.band_midpoint, input.band_maximum],
        );
      } else {
        await client.query(
          `update hr_master_record set code=$4,name=$5,description=$6,updated_at=now()
            where tenant_id=$1 and id=$2 and company_id=$3 and master_type='job_grade'`,
          [context.tenantId, gradeId, input.company_id, input.code.toUpperCase(), input.name, input.description],
        );
        await client.query(
          `update hr_job_grade_detail set grade_level=$4,currency_code=$5,band_minimum=$6,band_midpoint=$7,band_maximum=$8,updated_at=now()
            where tenant_id=$1 and master_record_id=$2 and company_id=$3`,
          [context.tenantId, gradeId, input.company_id, input.grade_level, input.currency_code.toUpperCase(), input.band_minimum, input.band_midpoint, input.band_maximum],
        );
      }
      const after = (await client.query(
        `select master.id,master.code,master.name,master.description,master.status,detail.grade_level,
                detail.currency_code,detail.band_minimum::text,detail.band_midpoint::text,detail.band_maximum::text
           from hr_master_record master join hr_job_grade_detail detail
             on detail.tenant_id=master.tenant_id and detail.master_record_id=master.id
          where master.tenant_id=$1 and master.id=$2`,
        [context.tenantId, id],
      )).rows[0];
      const audit = await this.appendPlatformAudit(client, context, correlationId, `hr.job_grade.${operation}`, { entityId: id!, entityType: "hr_master_record", before, after });
      const result = { id: id!, company_id: input.company_id, audit_event_id: audit, replayed: false };
      const method = operation === "create" ? "POST" : "PATCH";
      const responseStatus = operation === "create" ? 201 : 200;
      await client.query(
        `insert into platform_admin_idempotency (tenant_id,actor_id,method,path,idempotency_key,request_fingerprint,response_status,response_body,response_etag) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [context.tenantId, context.actor.userId, method, path, idempotencyKey, fingerprint, responseStatus, result, stateHash(result)],
      );
      await client.query("commit");
      return result;
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
      if (code === "23505") throw new HrApiError(409, "HR_JOB_GRADE_DUPLICATE", "The job-grade code, name, or level is already in use for this company.");
      if (["23503", "23514"].includes(code)) throw new HrApiError(409, "HR_JOB_GRADE_INVALID", "The job-grade details are invalid for this company.");
      throw error;
    } finally {
      client.release();
    }
  }

  async createJob(
    context: HrActorContext,
    input: CreateHrJobRequest,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<HrJobResult> {
    if (!validIdempotencyKey(idempotencyKey))
      throw new HrApiError(400, "INVALID_IDEMPOTENCY_KEY", "The idempotency key is invalid.");
    if (!context.actor.permissions.includes("hr.master.create"))
      throw new HrApiError(403, "PERMISSION_DENIED", "You are not permitted to create jobs.");
    const client = await this.pool.connect();
    try {
      await client.query("begin isolation level read committed");
      await client.query("select set_config('nexora.tenant_id',$1,true)", [context.tenantId]);
      await this.requireCompanyAccess(client, context, input.company_id);
      const path = "/api/v1/hr/jobs",
        fingerprint = stateHash(input);
      const replay = await client.query<{ request_fingerprint: string; response_body: HrJobResult }>(
        `select request_fingerprint,response_body from platform_admin_idempotency where tenant_id=$1 and actor_id=$2 and method='POST' and path=$3 and idempotency_key=$4 for update`,
        [context.tenantId, context.actor.userId, path, idempotencyKey],
      );
      if (replay.rows[0]) {
        if (replay.rows[0].request_fingerprint !== fingerprint)
          throw new HrApiError(
            409,
            "IDEMPOTENCY_CONFLICT",
            "The idempotency key was already used for another request.",
          );
        await client.query("commit");
        return { ...replay.rows[0].response_body, replayed: true };
      }
      const id = `hr-job-${randomUUID()}`;
      await client.query(
        `insert into hr_master_record (id,tenant_id,company_id,master_type,code,name,description,status,created_by) values ($1,$2,$3,'job',$4,$5,$6,'active',$7)`,
        [id, context.tenantId, input.company_id, input.code, input.name, input.description ?? "", context.actor.userId],
      );
      const audit = await this.appendPlatformAudit(client, context, correlationId, "hr.master.job.create", {
        entityId: id,
        entityType: "hr_master_record",
        before: null,
        after: { company_id: input.company_id, master_type: "job", code: input.code },
      });
      const result: HrJobResult = {
        id,
        company_id: input.company_id,
        code: input.code,
        name: input.name,
        audit_event_id: audit,
        replayed: false,
      };
      await client.query(
        `insert into platform_admin_idempotency (tenant_id,actor_id,method,path,idempotency_key,request_fingerprint,response_status,response_body,response_etag) values ($1,$2,'POST',$3,$4,$5,201,$6,$7)`,
        [context.tenantId, context.actor.userId, path, idempotencyKey, fingerprint, result, stateHash(result)],
      );
      await client.query("commit");
      return result;
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async createMaster(
    context: HrActorContext,
    input: CreateHrMasterRequest,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<HrMasterMutationResult> {
    return this.mutateMaster(context, "create", undefined, input, idempotencyKey, correlationId);
  }

  async updateMaster(
    context: HrActorContext,
    masterId: string,
    input: UpdateHrMasterRequest,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<HrMasterMutationResult> {
    return this.mutateMaster(context, "update", masterId, input, idempotencyKey, correlationId);
  }

  async changeMasterStatus(
    context: HrActorContext,
    masterId: string,
    input: ChangeHrMasterStatusRequest,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<HrMasterMutationResult> {
    return this.mutateMaster(context, "status", masterId, input, idempotencyKey, correlationId);
  }

  private async mutateMaster(
    context: HrActorContext,
    operation: "create" | "update" | "status",
    masterId: string | undefined,
    input: CreateHrMasterRequest | UpdateHrMasterRequest | ChangeHrMasterStatusRequest,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<HrMasterMutationResult> {
    if (!validIdempotencyKey(idempotencyKey)) throw new HrApiError(400, "INVALID_IDEMPOTENCY_KEY", "The idempotency key is invalid.");
    const permission = operation === "create" ? "hr.master.create" : "hr.master.update";
    if (!context.actor.permissions.includes(permission)) throw new HrApiError(403, "PERMISSION_DENIED", "You are not permitted to maintain HR master data.");
    const client = await this.pool.connect();
    const path = operation === "create" ? "/api/v1/hr/masters" : `/api/v1/hr/masters/${masterId}/${operation}`;
    try {
      await client.query("begin isolation level read committed");
      await client.query("select set_config('nexora.tenant_id',$1,true)", [context.tenantId]);
      await this.requireCompanyAccess(client, context, input.company_id);
      const fingerprint = stateHash({ masterId, input });
      const replay = await client.query<{ request_fingerprint: string; response_body: HrMasterMutationResult }>(
        `select request_fingerprint,response_body from platform_admin_idempotency where tenant_id=$1 and actor_id=$2 and method='POST' and path=$3 and idempotency_key=$4 for update`,
        [context.tenantId, context.actor.userId, path, idempotencyKey],
      );
      if (replay.rows[0]) {
        if (replay.rows[0].request_fingerprint !== fingerprint) throw new HrApiError(409, "IDEMPOTENCY_CONFLICT", "The idempotency key was already used for another request.");
        await client.query("commit");
        return { ...replay.rows[0].response_body, replayed: true };
      }
      const before = masterId ? (await client.query(`select id,company_id,master_type,code,name,description,status,configuration_key,configuration_value from hr_master_record where tenant_id=$1 and id=$2 and company_id=$3 for update`, [context.tenantId, masterId, input.company_id])).rows[0] : null;
      if (masterId && !before) throw new HrApiError(404, "HR_MASTER_NOT_FOUND", "HR master record was not found.");
      if (operation === "update" && before && ["cost_center", "work_location", "employment_type", "employee_category"].includes(String(before.master_type))) {
        const update = input as UpdateHrMasterRequest;
        if (!update.configuration_key || !update.configuration_value)
          throw new HrApiError(400, "HR_MASTER_CONFIGURATION_REQUIRED", "Configuration is required when updating this HR master type.");
      }
      let id = masterId;
      if (operation === "create") {
        const create = input as CreateHrMasterRequest;
        id = `hr-master-${randomUUID()}`;
        await client.query(`insert into hr_master_record (id,tenant_id,company_id,master_type,code,name,description,status,created_by,configuration_key,configuration_value) values ($1,$2,$3,$4,$5,$6,$7,'active',$8,$9,$10)`, [id, context.tenantId, create.company_id, create.type, create.code.toUpperCase(), create.name, create.description, context.actor.userId, create.configuration_key ?? null, create.configuration_value ?? null]);
      } else if (operation === "update") {
        const update = input as UpdateHrMasterRequest;
        await client.query(`update hr_master_record set code=$4,name=$5,description=$6,configuration_key=$7,configuration_value=$8,updated_at=now() where tenant_id=$1 and id=$2 and company_id=$3`, [context.tenantId, masterId, update.company_id, update.code.toUpperCase(), update.name, update.description, update.configuration_key ?? null, update.configuration_value ?? null]);
      } else {
        const change = input as ChangeHrMasterStatusRequest;
        await client.query(`update hr_master_record set status=$4,deactivated_by=case when $4='inactive' then $5 else null end,deactivated_at=case when $4='inactive' then now() else null end,updated_at=now() where tenant_id=$1 and id=$2 and company_id=$3`, [context.tenantId, masterId, change.company_id, change.status, context.actor.userId]);
      }
      const after = (await client.query(`select id,company_id,master_type,code,name,description,status,configuration_key,configuration_value from hr_master_record where tenant_id=$1 and id=$2`, [context.tenantId, id])).rows[0];
      const audit = await this.appendPlatformAudit(client, context, correlationId, `hr.master.${operation}`, { entityId: id!, entityType: "hr_master_record", before, after });
      const result = { id: id!, company_id: input.company_id, audit_event_id: audit, replayed: false };
      await client.query(`insert into platform_admin_idempotency (tenant_id,actor_id,method,path,idempotency_key,request_fingerprint,response_status,response_body,response_etag) values ($1,$2,'POST',$3,$4,$5,200,$6,$7)`, [context.tenantId, context.actor.userId, path, idempotencyKey, fingerprint, result, stateHash(result)]);
      await client.query("commit");
      return result;
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
      if (code === "23505") throw new HrApiError(409, "HR_MASTER_DUPLICATE", "That code or name already exists for this company and master type.");
      if (code === "23514") throw new HrApiError(409, "HR_MASTER_CONFIGURATION_INVALID", "The master configuration is invalid for this record type.");
      throw error;
    } finally {
      client.release();
    }
  }

  private async read<T>(
    context: HrActorContext,
    permission: string | readonly string[],
    operation: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    const allowed = typeof permission === "string" ? [permission] : permission;
    if (!allowed.some((item) => context.actor.permissions.includes(item)))
      throw new HrApiError(403, "PERMISSION_DENIED", "You are not permitted to access this HR data.");
    const client = await this.pool.connect();
    try {
      await client.query("begin isolation level repeatable read read only");
      await client.query("select set_config('nexora.tenant_id', $1, true)", [context.tenantId]);
      const output = await operation(client);
      await client.query("commit");
      return output;
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  private employeeHireRequestReviewSelect(): string {
    return `select request.id,employee.id as employee_id,employee.employee_number,
                   concat_ws(' ',employee.first_name,employee.middle_name,employee.last_name) as employee_name,
                   relationship.legal_employer_id as company_id,relationship.id as relationship_id,
                   job.id as job_id,job.code as job_code,job.name as job_name,
                   assignment.id as profile_draft_assignment_id,designation.name as designation,
                   job_grade.name as job_grade,employment_type.name as employment_type,
                   work_location.name as work_location,request.effective_on,request.requested_by,
                   request.requested_at,request.reason,request.approval_state as status,
                   request.decided_by,request.decided_at,request.decision_comment as decision_reason
              from hr_employment_lifecycle_request request
              join hr_employment_relationship relationship
                on relationship.tenant_id=request.tenant_id and relationship.id=request.relationship_id
              join employee
                on employee.tenant_id=relationship.tenant_id and employee.id=relationship.employee_id
              join hr_employment_lifecycle_transition transition
                on transition.tenant_id=request.tenant_id and transition.id=request.transition_id
              join hr_master_record job
                on job.tenant_id=request.tenant_id and job.id=request.job_id
              join employee_assignment assignment
                on assignment.tenant_id=request.tenant_id and assignment.id=request.profile_draft_assignment_id
              join hr_master_record designation
                on designation.tenant_id=assignment.tenant_id and designation.id=assignment.designation_id
              join hr_master_record job_grade
                on job_grade.tenant_id=assignment.tenant_id and job_grade.id=assignment.job_grade_id
              join hr_master_record employment_type
                on employment_type.tenant_id=assignment.tenant_id and employment_type.id=assignment.employment_type_id
              join hr_master_record work_location
                on work_location.tenant_id=assignment.tenant_id and work_location.id=assignment.work_location_id`;
  }

  private employeeTransferRequestReviewSelect(): string {
    return `select request.id,request.employee_id,employee.employee_number,
                   concat_ws(' ',employee.first_name,employee.middle_name,employee.last_name) as employee_name,
                   request.company_id,request.relationship_id,request.source_assignment_id,
                   coalesce(source_branch.name,'') as source_branch,
                   coalesce(source_department.name,'') as source_department,
                   coalesce(proposed_branch.name,'') as proposed_branch,
                   coalesce(proposed_department.name,'') as proposed_department,
                   proposed_job.name as proposed_job,
                   proposed_designation.name as proposed_designation,
                   proposed_job_grade.name as proposed_job_grade,
                   proposed_work_location.name as proposed_work_location,
                   request.effective_on,request.requested_by,request.requested_at,
                   request.reason,request.request_state as status,request.decided_by,
                   request.decided_at,request.decision_reason
              from hr_employee_transfer_request request
              join employee
                on employee.tenant_id=request.tenant_id and employee.id=request.employee_id
              join employee_assignment source_assignment
                on source_assignment.tenant_id=request.tenant_id and source_assignment.id=request.source_assignment_id
              left join organization_unit source_branch
                on source_branch.tenant_id=source_assignment.tenant_id and source_branch.id=source_assignment.branch_id
              left join organization_unit source_department
                on source_department.tenant_id=source_assignment.tenant_id and source_department.id=source_assignment.department_id
              left join organization_unit proposed_branch
                on proposed_branch.tenant_id=request.tenant_id and proposed_branch.id=request.proposed_branch_id
              left join organization_unit proposed_department
                on proposed_department.tenant_id=request.tenant_id and proposed_department.id=request.proposed_department_id
              join hr_master_record proposed_job
                on proposed_job.tenant_id=request.tenant_id and proposed_job.id=request.proposed_job_id
              join hr_master_record proposed_designation
                on proposed_designation.tenant_id=request.tenant_id and proposed_designation.id=request.proposed_designation_id
              join hr_master_record proposed_job_grade
                on proposed_job_grade.tenant_id=request.tenant_id and proposed_job_grade.id=request.proposed_job_grade_id
              join hr_master_record proposed_work_location
                on proposed_work_location.tenant_id=request.tenant_id and proposed_work_location.id=request.proposed_work_location_id`;
  }

  private employeePromotionRequestReviewSelect(): string {
    return `select request.id,request.employee_id,employee.employee_number,
                   concat_ws(' ',employee.first_name,employee.middle_name,employee.last_name) as employee_name,
                   request.company_id,request.relationship_id,request.source_assignment_id,
                   source_job.name as source_job,source_designation.name as source_designation,
                   source_job_grade.name as source_job_grade,proposed_job.name as proposed_job,
                   proposed_designation.name as proposed_designation,
                   proposed_job_grade.name as proposed_job_grade,request.effective_on,
                   request.requested_by,request.requested_at,request.reason,
                   request.request_state as status,request.decided_by,
                   request.decided_at,request.decision_reason
              from hr_employee_promotion_request request
              join employee
                on employee.tenant_id=request.tenant_id and employee.id=request.employee_id
              join employee_assignment source_assignment
                on source_assignment.tenant_id=request.tenant_id and source_assignment.id=request.source_assignment_id
              join hr_master_record source_job
                on source_job.tenant_id=source_assignment.tenant_id and source_job.id=source_assignment.job_id
              join hr_master_record source_designation
                on source_designation.tenant_id=source_assignment.tenant_id and source_designation.id=source_assignment.designation_id
              join hr_master_record source_job_grade
                on source_job_grade.tenant_id=source_assignment.tenant_id and source_job_grade.id=source_assignment.job_grade_id
              join hr_master_record proposed_job
                on proposed_job.tenant_id=request.tenant_id and proposed_job.id=request.proposed_job_id
              join hr_master_record proposed_designation
                on proposed_designation.tenant_id=request.tenant_id and proposed_designation.id=request.proposed_designation_id
              join hr_master_record proposed_job_grade
                on proposed_job_grade.tenant_id=request.tenant_id and proposed_job_grade.id=request.proposed_job_grade_id`;
  }

  private employeeManagerChangeRequestReviewSelect(): string {
    return `select request.id,request.employee_id,employee.employee_number,
                   concat_ws(' ',employee.first_name,employee.middle_name,employee.last_name) as employee_name,
                   request.company_id,request.relationship_id,request.source_assignment_id,
                   source_assignment.reporting_manager_id as current_reporting_manager_id,
                   case when current_manager.id is null then null
                        else concat_ws(' ',current_manager.first_name,current_manager.middle_name,current_manager.last_name)
                   end as current_reporting_manager_name,
                   request.proposed_reporting_manager_id,
                   case when proposed_manager.id is null then null
                        else concat_ws(' ',proposed_manager.first_name,proposed_manager.middle_name,proposed_manager.last_name)
                   end as proposed_reporting_manager_name,
                   request.clear_reporting_manager,request.effective_on,request.requested_by,
                   request.requested_at,request.reason,request.request_state as status,
                   request.decided_by,request.decided_at,request.decision_reason
              from hr_employee_manager_change_request request
              join employee
                on employee.tenant_id=request.tenant_id and employee.id=request.employee_id
              join employee_assignment source_assignment
                on source_assignment.tenant_id=request.tenant_id and source_assignment.id=request.source_assignment_id
              left join employee current_manager
                on current_manager.tenant_id=source_assignment.tenant_id
               and current_manager.id=source_assignment.reporting_manager_id
              left join employee proposed_manager
                on proposed_manager.tenant_id=request.tenant_id
               and proposed_manager.id=request.proposed_reporting_manager_id`;
  }

  private employeeWorkLocationChangeRequestReviewSelect(): string {
    return `select request.id,request.employee_id,employee.employee_number,
                   concat_ws(' ',employee.first_name,employee.middle_name,employee.last_name) as employee_name,
                   request.company_id,request.relationship_id,request.source_assignment_id,
                   request.current_work_location_id,current_location.name as current_work_location_name,
                   request.proposed_work_location_id,proposed_location.name as proposed_work_location_name,
                   request.proposed_work_location_profile_id as jurisdiction_profile_id,
                   profile.country_code as jurisdiction_country_code,profile.jurisdiction_id,
                   (profile.state in ('approved','active')
                     and profile.effective_from<=request.effective_on
                     and (profile.effective_to is null or profile.effective_to>=request.effective_on))
                     as jurisdiction_ready,
                   request.effective_on,request.requested_by,request.requested_at,
                   request.reason,request.request_state as status,request.decided_by,
                   request.decided_at,request.decision_reason
              from hr_employee_work_location_change_request request
              join employee
                on employee.tenant_id=request.tenant_id and employee.id=request.employee_id
              join hr_master_record current_location
                on current_location.tenant_id=request.tenant_id
               and current_location.id=request.current_work_location_id
              join hr_master_record proposed_location
                on proposed_location.tenant_id=request.tenant_id
               and proposed_location.id=request.proposed_work_location_id
              join hr_work_location_profile profile
                on profile.tenant_id=request.tenant_id
               and profile.id=request.proposed_work_location_profile_id
               and profile.company_id=request.company_id`;
  }

  private employeeOrganizationPlacementChangeRequestReviewSelect(): string {
    return `select request.id,request.employee_id,employee.employee_number,
                   concat_ws(' ',employee.first_name,employee.middle_name,employee.last_name) as employee_name,
                   request.company_id,request.relationship_id,request.source_assignment_id,
                   jsonb_build_object(
                     'business_unit_id',request.current_business_unit_id,
                     'division_id',request.current_division_id,
                     'branch_id',request.current_branch_id,
                     'department_id',request.current_department_id,
                     'warehouse_id',request.current_warehouse_id
                   ) as current,
                   jsonb_build_object(
                     'business_unit_id',request.proposed_business_unit_id,
                     'division_id',request.proposed_division_id,
                     'branch_id',request.proposed_branch_id,
                     'department_id',request.proposed_department_id,
                     'warehouse_id',request.proposed_warehouse_id
                   ) as proposed,
                   coalesce((
                     select jsonb_object_agg(placement.organization_type,unit.name)
                       from (values
                         ('business_unit',request.current_business_unit_id),
                         ('division',request.current_division_id),
                         ('branch',request.current_branch_id),
                         ('department',request.current_department_id),
                         ('warehouse',request.current_warehouse_id)
                       ) placement(organization_type,organization_unit_id)
                       join organization_unit unit
                         on unit.tenant_id=request.tenant_id
                        and unit.id=placement.organization_unit_id
                   ),'{}'::jsonb) as current_names,
                   coalesce((
                     select jsonb_object_agg(placement.organization_type,unit.name)
                       from (values
                         ('business_unit',request.proposed_business_unit_id),
                         ('division',request.proposed_division_id),
                         ('branch',request.proposed_branch_id),
                         ('department',request.proposed_department_id),
                         ('warehouse',request.proposed_warehouse_id)
                       ) placement(organization_type,organization_unit_id)
                       join organization_unit unit
                         on unit.tenant_id=request.tenant_id
                        and unit.id=placement.organization_unit_id
                   ),'{}'::jsonb) as proposed_names,
                   hr_organization_placement_is_coherent(
                     request.tenant_id,request.company_id,
                     request.proposed_business_unit_id,request.proposed_division_id,
                     request.proposed_branch_id,request.proposed_department_id,
                     request.proposed_warehouse_id
                   ) as hierarchy_ready,
                   request.effective_on,request.requested_by,request.requested_at,
                   request.reason,request.request_state as status,request.decided_by,
                   request.decided_at,request.decision_reason
              from hr_employee_organization_placement_change_request request
              join employee
                on employee.tenant_id=request.tenant_id and employee.id=request.employee_id`;
  }

  private async requireCompanyAccess(client: PoolClient, context: HrActorContext, companyId: string): Promise<void> {
    const access = await client.query(
      `select 1 from security_user_company_access
        where tenant_id = $1 and user_id = $2 and company_id = $3 and revoked_at is null`,
      [context.tenantId, context.actor.userId, companyId],
    );
    if (!access.rowCount)
      throw new HrApiError(403, "COMPANY_ACCESS_DENIED", "The company is outside your access scope.");
  }

  private async requireActiveEmployeeCompanyScope(
    client: PoolClient,
    context: HrActorContext,
    employeeId: string,
  ): Promise<void> {
    const result = await client.query(
      `select 1
         from employee employee
         join employee_assignment assignment
           on assignment.tenant_id=employee.tenant_id and assignment.employee_id=employee.id
         join security_user_company_access access
           on access.tenant_id=assignment.tenant_id and access.company_id=assignment.company_id
        where employee.tenant_id=$1 and employee.id=$2 and access.user_id=$3 and access.revoked_at is null
          and assignment.assignment_status in ('active','legacy_compatibility')
          and assignment.effective_from<=current_date
          and (assignment.effective_to is null or assignment.effective_to>=current_date)
        limit 1`,
      [context.tenantId, employeeId, context.actor.userId],
    );
    if (!result.rowCount)
      throw new HrApiError(404, "HR_EMPLOYEE_NOT_FOUND", "The employee is unavailable in your company scope.");
  }

  private async requireEmployeeAssignmentCompanyScope(
    client: PoolClient,
    context: HrActorContext,
    employeeId: string,
  ): Promise<void> {
    const result = await client.query(
      `select 1
         from employee_assignment assignment
         join security_user_company_access access
           on access.tenant_id=assignment.tenant_id and access.company_id=assignment.company_id
        where assignment.tenant_id=$1 and assignment.employee_id=$2 and access.user_id=$3
          and access.revoked_at is null
          and assignment.assignment_status in ('profile_draft','active','legacy_compatibility')
          and assignment.effective_from<=current_date
          and (assignment.effective_to is null or assignment.effective_to>=current_date)
        limit 1`,
      [context.tenantId, employeeId, context.actor.userId],
    );
    if (!result.rowCount)
      throw new HrApiError(404, "HR_EMPLOYEE_NOT_FOUND", "The employee is unavailable in your company scope.");
  }

  private async recordEmployeeProfileVersion(
    client: PoolClient,
    context: HrActorContext,
    employeeId: string,
    profile: {
      first_name: string;
      middle_name: string;
      last_name: string;
      preferred_name: string;
      work_email: string;
      date_of_birth: string | Date | null;
      personal_email: string;
      phone: string;
    },
    sourceReference: string,
  ): Promise<void> {
    const current = await client.query<{
      id: string;
      revision: number;
      effective_from: string | Date;
      effective_to: string | Date | null;
      first_name: string;
      middle_name: string;
      last_name: string;
      preferred_name: string;
      work_email: string;
      date_of_birth: string | Date | null;
      personal_email: string;
      phone: string;
    }>(
      `select id,revision,effective_from,effective_to,first_name,middle_name,last_name,
              preferred_name,work_email,date_of_birth,personal_email,phone
         from hr_employee_profile_version
        where tenant_id=$1 and employee_id=$2
        order by revision desc,recorded_at desc,id desc
        limit 1 for update`,
      [context.tenantId, employeeId],
    );
    const previous = current.rows[0];
    const sameProfile =
      previous !== undefined &&
      previous.first_name === profile.first_name &&
      previous.middle_name === profile.middle_name &&
      previous.last_name === profile.last_name &&
      previous.preferred_name === profile.preferred_name &&
      previous.work_email === profile.work_email &&
      (previous.date_of_birth === null ? null : dateOnly(previous.date_of_birth)) ===
        (profile.date_of_birth === null ? null : dateOnly(profile.date_of_birth)) &&
      previous.personal_email === profile.personal_email &&
      previous.phone === profile.phone;
    if (sameProfile && previous.effective_to === null) return;

    const captureDate = await client.query<{ value: string }>(
      "select greatest(coalesce($1::date,current_date),current_date)::text as value",
      [previous ? dateOnly(previous.effective_from) : null],
    );
    const effectiveFrom = captureDate.rows[0]?.value;
    if (!effectiveFrom) throw new Error("Unable to determine the employee profile capture date.");
    if (previous?.effective_to === null)
      await client.query("update hr_employee_profile_version set effective_to=$3 where tenant_id=$1 and id=$2", [
        context.tenantId,
        previous.id,
        effectiveFrom,
      ]);
    await client.query(
      `insert into hr_employee_profile_version (
         id,tenant_id,employee_id,effective_from,revision,supersedes_version_id,
         first_name,middle_name,last_name,preferred_name,work_email,date_of_birth,
         personal_email,phone,recorded_by,source_reference
       ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
      [
        `employee-profile-version-${randomUUID()}`,
        context.tenantId,
        employeeId,
        effectiveFrom,
        (previous?.revision ?? 0) + 1,
        previous?.id ?? null,
        profile.first_name,
        profile.middle_name,
        profile.last_name,
        profile.preferred_name,
        profile.work_email,
        profile.date_of_birth === null ? null : dateOnly(profile.date_of_birth),
        profile.personal_email,
        profile.phone,
        context.actor.userId,
        sourceReference,
      ],
    );
  }

  private async resolveApprovalOverride(
    client: PoolClient,
    context: HrActorContext,
    input: {
      normalDecisionPermission: string;
      makerActorIds: readonly string[];
      resourceType: string;
      resourceId: string;
      decisionAction: "approve" | "reject" | "activate";
      reason: string;
      correlationId: string;
      idempotencyKey: string;
    },
  ): Promise<string | null> {
    const impersonated = Boolean(
      context.impersonationRequestId ||
      (context.realActorId !== undefined && context.realActorId !== context.actor.userId),
    );
    const policy = evaluateApprovalActor({
      account: context.actor,
      normalDecisionPermission: input.normalDecisionPermission,
      makerActorIds: input.makerActorIds,
      impersonated,
    });
    if (policy.kind === "ordinary") return null;
    if (policy.kind === "forbidden") {
      const message =
        policy.reason === "impersonation_forbidden"
          ? "Approval overrides are unavailable during impersonation."
          : "A different HR approver must decide this request.";
      throw new HrApiError(403, "HR_SELF_APPROVAL_FORBIDDEN", message);
    }
    try {
      const evidence = await writeApprovalOverrideEvent(client, {
        tenantId: context.tenantId,
        account: context.actor,
        makerActorIds: input.makerActorIds,
        normalDecisionPermission: input.normalDecisionPermission,
        resourceType: input.resourceType,
        resourceId: input.resourceId,
        decisionAction: input.decisionAction,
        reason: input.reason,
        correlationId: input.correlationId,
        idempotencyKey: input.idempotencyKey,
        metadata: { module: "hr", super_admin_override: true },
        impersonated,
      });
      return evidence.eventId;
    } catch (error) {
      if (!(error instanceof ApprovalOverrideWriterError)) throw error;
      if (error.code === "INVALID_APPROVAL_OVERRIDE_EVIDENCE")
        throw new HrApiError(400, "INVALID_APPROVAL_OVERRIDE_EVIDENCE", error.message);
      if (error.code === "APPROVAL_OVERRIDE_IDEMPOTENCY_CONFLICT")
        throw new HrApiError(409, "IDEMPOTENCY_CONFLICT", error.message);
      throw new HrApiError(403, "HR_SELF_APPROVAL_FORBIDDEN", error.message);
    }
  }

  private async appendPlatformAudit(
    client: PoolClient,
    context: HrActorContext,
    correlationId: string,
    action:
      | "hr.employee.create"
      | "hr.employee.update"
      | "hr.employee.submit"
      | "hr.employee.approve"
      | "hr.employee_assignment.create"
      | "hr.employee_contact.create"
      | "hr.employee_emergency_contact.create"
      | "hr.employment_lifecycle_policy.create"
      | "hr.employment_lifecycle_policy.submit"
      | "hr.employment_lifecycle_policy.approve"
      | "hr.employment_lifecycle_policy.activate"
      | "hr.master.job.create"
      | "hr.job_grade.create"
      | "hr.job_grade.update"
      | "hr.master.create"
      | "hr.master.update"
      | "hr.master.status"
      | "hr.organization.create"
      | "hr.organization.update"
      | "hr.organization.status"
      | "hr.employment_lifecycle.hire.request"
      | "hr.employment_lifecycle.hire.decide"
      | "hr.employee_assignment.transfer.request"
      | "hr.employee_assignment.transfer.decide"
      | "hr.employee_assignment.promotion.request"
      | "hr.employee_assignment.promotion.decide"
      | "hr.employee_assignment.manager_change.request"
      | "hr.employee_assignment.manager_change.decide"
      | "hr.employee_assignment.work_location_change.request"
      | "hr.employee_assignment.work_location_change.decide"
      | "hr.employee_assignment.organization_change.request"
      | "hr.employee_assignment.organization_change.decide"
      | "hr.manpower_requisition.create"
      | "hr.manpower_requisition.submitted"
      | "hr.manpower_requisition.approved"
      | "hr.manpower_requisition.rejected"
      | "hr.job_opening.create"
      | "hr.job_opening.state",
    mutation: {
      entityId: string;
      entityType?: "employee" | "employment_lifecycle_policy" | "hr_master_record" | "employment_relationship" | "organization_unit" | "hr_manpower_requisition" | "hr_job_opening";
      before: unknown;
      after: unknown;
    },
  ): Promise<string> {
    await client.query("select pg_advisory_xact_lock(hashtextextended($1, 0))", [
      `nexora:platform:audit:${context.tenantId}`,
    ]);
    const latest = await client.query<{ sequence: string; event_hash: string }>(
      `select sequence,event_hash from platform_admin_audit_event
        where tenant_id=$1 order by sequence desc limit 1`,
      [context.tenantId],
    );
    const sequence = latest.rows[0] ? Number(latest.rows[0].sequence) + 1 : 1;
    const previousEventHash = latest.rows[0]?.event_hash ?? stateHash({ genesis: context.tenantId });
    const id = `audit-${randomUUID()}`;
    const occurredAt = new Date().toISOString();
    const payload = {
      id,
      tenant_id: context.tenantId,
      actor_id: context.actor.userId,
      correlation_id: correlationId,
      action,
      entity_type: mutation.entityType ?? "employee",
      entity_id: mutation.entityId,
      before_hash: stateHash(mutation.before),
      after_hash: stateHash(mutation.after),
      source_reference: "hr.employee.draft",
      approval_reference: null,
      occurred_at: occurredAt,
      sequence,
      previous_event_hash: previousEventHash,
    };
    const eventHash = stateHash(payload);
    await client.query(
      `insert into platform_admin_audit_event
       (id,tenant_id,sequence,actor_id,correlation_id,action,entity_type,entity_id,before_hash,after_hash,source_reference,approval_reference,occurred_at,previous_event_hash,event_hash)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
      [
        id,
        context.tenantId,
        sequence,
        context.actor.userId,
        correlationId,
        payload.action,
        payload.entity_type,
        mutation.entityId,
        payload.before_hash,
        payload.after_hash,
        payload.source_reference,
        null,
        occurredAt,
        previousEventHash,
        eventHash,
      ],
    );
    return id;
  }
}
