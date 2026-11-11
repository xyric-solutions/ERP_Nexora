import type { Pool, PoolClient } from "pg";
import type { z } from "zod";

import {
  hrRequisitionStateMoves,
  type CreateHrManpowerRequisitionRequest,
  type HrRecruitmentMutationResult,
  type changeHrManpowerRequisitionStateRequestSchema,
  type updateHrCandidateRequestSchema,
  type updateHrJobOpeningRequestSchema,
} from "@nexora/contracts";

import { auditedWrite } from "./shared/audited-write.js";
import { HrApiError, type HrActorContext } from "./source-repository.js";

type StateInput = z.output<typeof changeHrManpowerRequisitionStateRequestSchema>;
type OpeningInput = z.output<typeof updateHrJobOpeningRequestSchema>;
type CandidateInput = z.output<typeof updateHrCandidateRequestSchema>;
type RequisitionState = keyof typeof hrRequisitionStateMoves;

export type HrRecruitmentAuditAction =
  | "hr.manpower_requisition.update"
  | "hr.manpower_requisition.state"
  | "hr.manpower_requisition.delete"
  | "hr.job_opening.update"
  | "hr.job_opening.delete"
  | "hr.candidate.update"
  | "hr.candidate.delete";

export type HrRecruitmentRecordsDependencies = {
  pool: Pool;
  audit: (
    client: PoolClient,
    context: HrActorContext,
    correlationId: string,
    action: HrRecruitmentAuditAction,
    entityType: "hr_manpower_requisition" | "hr_job_opening" | "hr_candidate",
    entityId: string,
    before: unknown,
    after: unknown,
  ) => Promise<string>;
};

async function requireCompany(client: PoolClient, context: HrActorContext, companyId: string) {
  const access = await client.query(
    "select 1 from security_user_company_access where tenant_id=$1 and company_id=$2 and user_id=$3 and revoked_at is null",
    [context.tenantId, companyId, context.actor.userId],
  );
  if (!access.rowCount) throw new HrApiError(404, "HR_COMPANY_NOT_FOUND", "The company is unavailable in your scope.");
}

/** Edits, state moves and deletes of recruitment records outside the approval decision. */
export class HrRecruitmentRecords {
  constructor(private readonly dependencies: HrRecruitmentRecordsDependencies) {}

  private write(
    context: HrActorContext,
    permission: string | readonly string[],
    path: string,
    input: unknown,
    key: string,
    lock: string,
    operation: (client: PoolClient) => Promise<Omit<HrRecruitmentMutationResult, "replayed">>,
    conflictMessage?: string,
  ): Promise<HrRecruitmentMutationResult> {
    return auditedWrite(
      this.dependencies.pool,
      context,
      { permission, path, input, idempotencyKey: key, lock, ...(conflictMessage ? { conflictMessage } : {}) },
      operation,
    );
  }

  // ------------------------------------------------------------ requisitions

  private async lockRequisition(client: PoolClient, context: HrActorContext, companyId: string, id: string) {
    await requireCompany(client, context, companyId);
    const row = await client.query<{ reference: string; state: RequisitionState }>(
      "select reference,state from hr_manpower_requisition where tenant_id=$1 and company_id=$2 and id=$3 for update",
      [context.tenantId, companyId, id],
    );
    if (!row.rows[0]) throw new HrApiError(404, "HR_MANPOWER_REQUISITION_NOT_FOUND", "The requisition is unavailable in your company scope.");
    return row.rows[0];
  }

  /** Draft requisitions stay fully editable; later states change through state moves. */
  async updateRequisition(context: HrActorContext, id: string, input: CreateHrManpowerRequisitionRequest, key: string, correlationId: string) {
    return this.write(context, "hr.employee.create", `/api/v1/hr/manpower_requisitions/${id}/update`, { id, input }, key, `nexora:hr:requisition:${context.tenantId}:${id}`, async (client) => {
      const before = await this.lockRequisition(client, context, input.company_id, id);
      if (before.state !== "draft")
        throw new HrApiError(409, "HR_MANPOWER_REQUISITION_NOT_EDITABLE", "Only draft requisitions can be edited. Move it back to Draft first.");
      await client.query(
        `update hr_manpower_requisition set job_title=$4,designation_id=$5,job_grade_id=$6,cost_center_id=$7,project_id=$8,hiring_basis=$9,
                work_arrangement=$10,department_id=$11,work_location_id=$12,positions_requested=$13,position_type=$14,replacement_employee_id=$15,
                salary_minimum=$16,salary_maximum=$17,currency_code=$18,target_start_date=$19,reason=$20,required_skills=$21::jsonb,updated_at=now()
          where tenant_id=$1 and company_id=$2 and id=$3`,
        [context.tenantId, input.company_id, id, input.job_title, input.designation_id, input.job_grade_id, input.cost_center_id, input.project_id, input.hiring_basis, input.work_arrangement, input.department_id, input.work_location_id ?? null, input.positions_requested, input.position_type, input.replacement_employee_id ?? null, input.salary_minimum, input.salary_maximum, input.currency_code, input.target_start_date, input.reason, JSON.stringify(input.required_skills)],
      );
      const audit = await this.dependencies.audit(client, context, correlationId, "hr.manpower_requisition.update", "hr_manpower_requisition", id, before, { ...input });
      return { id, company_id: input.company_id, audit_event_id: audit };
    });
  }

  /**
   * Draft -> Submitted, Submitted -> Draft (withdraw), Approved -> Cancelled
   * (no active openings), Rejected/Cancelled -> Draft (reopen). Approval and
   * rejection keep their independent-approver decision.
   */
  async changeRequisitionState(context: HrActorContext, id: string, input: StateInput, key: string, correlationId: string) {
    const permission = input.state === "cancelled" ? "hr.employee.approve" : input.state === "submitted" ? "hr.employee.submit" : ["hr.employee.create", "hr.employee.submit"];
    return this.write(context, permission, `/api/v1/hr/manpower_requisitions/${id}/state`, { id, input }, key, `nexora:hr:requisition:${context.tenantId}:${id}`, async (client) => {
      const before = await this.lockRequisition(client, context, input.company_id, id);
      const allowed = hrRequisitionStateMoves[before.state] as readonly string[];
      if (!allowed.includes(input.state))
        throw new HrApiError(409, "HR_MANPOWER_REQUISITION_STATE_INVALID", `A ${before.state} requisition cannot move to ${input.state}.`);
      if (input.state === "cancelled") {
        const openings = await client.query("select 1 from hr_job_opening where tenant_id=$1 and requisition_id=$2 and state<>'cancelled' limit 1", [context.tenantId, id]);
        if (openings.rowCount)
          throw new HrApiError(409, "HR_MANPOWER_REQUISITION_HAS_OPENINGS", "Cancel or close its job openings before cancelling this requisition.");
        await client.query("update hr_manpower_requisition set state='cancelled',decision_reason=coalesce(nullif($3,''),decision_reason),updated_at=now() where tenant_id=$1 and id=$2", [context.tenantId, id, input.reason]);
      } else if (input.state === "submitted") {
        await client.query("update hr_manpower_requisition set state='submitted',submitted_by=$3,submitted_at=now(),updated_at=now() where tenant_id=$1 and id=$2", [context.tenantId, id, context.actor.userId]);
      } else {
        await client.query(
          `update hr_manpower_requisition set state='draft',submitted_by=null,submitted_at=null,decided_by=null,decided_at=null,decision_reason=null,
                  approval_override_event_id=null,updated_at=now() where tenant_id=$1 and id=$2`,
          [context.tenantId, id],
        );
      }
      const audit = await this.dependencies.audit(client, context, correlationId, "hr.manpower_requisition.state", "hr_manpower_requisition", id, { state: before.state }, { state: input.state, reason: input.reason });
      return { id, company_id: input.company_id, audit_event_id: audit };
    });
  }

  async deleteRequisition(context: HrActorContext, id: string, companyId: string, key: string, correlationId: string) {
    return this.write(context, "hr.employee.create", `/api/v1/hr/manpower_requisitions/${id}/delete`, { id, companyId }, key, `nexora:hr:requisition:${context.tenantId}:${id}`, async (client) => {
      const before = await this.lockRequisition(client, context, companyId, id);
      if (!["draft", "rejected", "cancelled"].includes(before.state))
        throw new HrApiError(409, "HR_MANPOWER_REQUISITION_NOT_DELETABLE", "Only draft, rejected or cancelled requisitions can be deleted.");
      const openings = await client.query("select 1 from hr_job_opening where tenant_id=$1 and requisition_id=$2 limit 1", [context.tenantId, id]);
      if (openings.rowCount) throw new HrApiError(409, "HR_RECORD_IN_USE", "This requisition has job openings and cannot be deleted. Cancel it instead.");
      await client.query("delete from hr_manpower_requisition where tenant_id=$1 and id=$2", [context.tenantId, id]);
      const audit = await this.dependencies.audit(client, context, correlationId, "hr.manpower_requisition.delete", "hr_manpower_requisition", id, before, null);
      return { id, company_id: companyId, audit_event_id: audit };
    });
  }

  // ------------------------------------------------------------ job openings

  /** Every field and any state, including reopening a cancelled opening (headcount is re-checked). */
  async updateOpening(context: HrActorContext, id: string, input: OpeningInput, key: string, correlationId: string) {
    return this.write(context, "hr.employee.update", `/api/v1/hr/job_openings/${id}/update`, { id, input }, key, `nexora:hr:job-opening:${context.tenantId}:${id}`, async (client) => {
      await requireCompany(client, context, input.company_id);
      const current = await client.query<{ title: string; state: string; positions_requested: number }>(
        "select title,state,positions_requested from hr_job_opening where tenant_id=$1 and company_id=$2 and id=$3 for update",
        [context.tenantId, input.company_id, id],
      );
      const before = current.rows[0];
      if (!before) throw new HrApiError(404, "HR_JOB_OPENING_NOT_FOUND", "The job opening is unavailable in your company scope.");
      const reason = before.state === input.state ? null : input.reason || `Moved to ${input.state.replaceAll("_", " ")}.`;
      await client.query(
        `update hr_job_opening set title=$4,positions_requested=$5,channels=$6::jsonb,closing_on=$7,state=$8,
                state_reason=coalesce($9,state_reason),updated_at=now()
          where tenant_id=$1 and company_id=$2 and id=$3`,
        [context.tenantId, input.company_id, id, input.title, input.positions_requested, JSON.stringify(input.channels), input.closing_on, input.state, reason],
      );
      const audit = await this.dependencies.audit(client, context, correlationId, "hr.job_opening.update", "hr_job_opening", id, before, { ...input });
      return { id, company_id: input.company_id, audit_event_id: audit };
    });
  }

  async deleteOpening(context: HrActorContext, id: string, companyId: string, key: string, correlationId: string) {
    return this.write(context, "hr.employee.update", `/api/v1/hr/job_openings/${id}/delete`, { id, companyId }, key, `nexora:hr:job-opening:${context.tenantId}:${id}`, async (client) => {
      await requireCompany(client, context, companyId);
      const before = await client.query<{ reference: string; title: string }>(
        "select reference,title from hr_job_opening where tenant_id=$1 and company_id=$2 and id=$3 for update",
        [context.tenantId, companyId, id],
      );
      if (!before.rows[0]) throw new HrApiError(404, "HR_JOB_OPENING_NOT_FOUND", "The job opening is unavailable in your company scope.");
      const used = await client.query("select 1 from hr_recruitment_application where tenant_id=$1 and opening_id=$2 limit 1", [context.tenantId, id]);
      if (used.rowCount) throw new HrApiError(409, "HR_RECORD_IN_USE", "This opening has applications and cannot be deleted. Close or cancel it instead.");
      await client.query("delete from hr_job_opening where tenant_id=$1 and id=$2", [context.tenantId, id]);
      const audit = await this.dependencies.audit(client, context, correlationId, "hr.job_opening.delete", "hr_job_opening", id, before.rows[0], null);
      return { id, company_id: companyId, audit_event_id: audit };
    });
  }

  // ------------------------------------------------------------ candidates

  async updateCandidate(context: HrActorContext, id: string, input: CandidateInput, key: string, correlationId: string) {
    return this.write(
      context,
      "hr.employee.update",
      `/api/v1/hr/candidates/${id}/update`,
      { id, input },
      key,
      `nexora:hr:candidate:${context.tenantId}:${input.company_id}`,
      async (client) => {
        await requireCompany(client, context, input.company_id);
        const current = await client.query<{ email: string; status: string }>(
          "select email,status from hr_candidate where tenant_id=$1 and company_id=$2 and id=$3 for update",
          [context.tenantId, input.company_id, id],
        );
        if (!current.rows[0]) throw new HrApiError(404, "HR_CANDIDATE_NOT_FOUND", "The candidate is unavailable in your company scope.");
        await client.query(
          `update hr_candidate set first_name=$4,last_name=$5,email=$6,phone=$7,source=$8,status=$9,updated_at=now()
            where tenant_id=$1 and company_id=$2 and id=$3`,
          [context.tenantId, input.company_id, id, input.first_name, input.last_name, input.email.toLowerCase(), input.phone, input.source, input.status],
        );
        const audit = await this.dependencies.audit(client, context, correlationId, "hr.candidate.update", "hr_candidate", id, current.rows[0], { status: input.status, source: input.source });
        return { id, company_id: input.company_id, audit_event_id: audit };
      },
      "Another active candidate in this company already uses this email.",
    );
  }

  async deleteCandidate(context: HrActorContext, id: string, companyId: string, key: string, correlationId: string) {
    return this.write(context, "hr.employee.update", `/api/v1/hr/candidates/${id}/delete`, { id, companyId }, key, `nexora:hr:candidate:${context.tenantId}:${companyId}`, async (client) => {
      await requireCompany(client, context, companyId);
      const before = await client.query<{ reference: string }>("select reference from hr_candidate where tenant_id=$1 and company_id=$2 and id=$3 for update", [context.tenantId, companyId, id]);
      if (!before.rows[0]) throw new HrApiError(404, "HR_CANDIDATE_NOT_FOUND", "The candidate is unavailable in your company scope.");
      const used = await client.query("select 1 from hr_recruitment_application where tenant_id=$1 and candidate_id=$2 limit 1", [context.tenantId, id]);
      if (used.rowCount) throw new HrApiError(409, "HR_RECORD_IN_USE", "This candidate has applications and cannot be deleted. Deactivate the candidate instead.");
      await client.query("delete from hr_candidate where tenant_id=$1 and id=$2", [context.tenantId, id]);
      const audit = await this.dependencies.audit(client, context, correlationId, "hr.candidate.delete", "hr_candidate", id, before.rows[0], null);
      return { id, company_id: companyId, audit_event_id: audit };
    });
  }
}
