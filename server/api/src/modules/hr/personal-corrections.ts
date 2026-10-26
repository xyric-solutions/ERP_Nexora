import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import {
  hrPersonalProfileSchema,
  hrPersonalCorrectionWorkspaceSchema,
  type HrPersonalProfile,
  type HrPersonalCorrectionQuery,
  type CreateHrPersonalCorrection,
  type HrPersonalCorrectionAction,
  type HrPersonalCorrectionWorkspace,
} from "@nexora/contracts";
import { HrApiError, type HrActorContext } from "./source-repository.js";
import {
  requireSelfServiceEmployee as requirePersonalLeaveEmployee,
  canManageSelfService as canManagePersonalLeave,
} from "./employee-self-service-authority.js";
import { requireHrCompanyPermission } from "./company-authority.js";
import { attendanceHash } from "./attendance-completion.js";
import {
  withHrGovernedClient,
  runHrGovernedCommand,
  requireHrGovernedCompany,
  type HrGovernedDependencies,
} from "./governed.js";
type Dependencies = HrGovernedDependencies & {
  recordProfile: (
    client: PoolClient,
    c: HrActorContext,
    employee: string,
    profile: HrPersonalProfile & { work_email: string },
    reference: string,
  ) => Promise<void>;
};
type RecordRow = {
  id: string;
  company_id: string;
  employee_id: string;
  employee_number: string;
  employee_name: string;
  version: number;
  state: "submitted" | "approved" | "rejected" | "cancelled";
  before_profile: HrPersonalProfile;
  proposed_profile: HrPersonalProfile;
  source_hash: string;
  requested_by: string;
  reason: string;
  created_at: string;
  decided_by: string | null;
  decision_reason: string;
  review_reference: string;
  decided_at: string | null;
};
const denied = (): never => {
  throw new HrApiError(403, "PERMISSION_DENIED", "Independent current company-scoped HR authority is required.");
};
const conflict = (message: string): never => {
  throw new HrApiError(409, "HR_PERSONAL_CORRECTION_REVIEW_REQUIRED", message);
};
export class PersonalDataCorrections {
  constructor(private readonly d: Dependencies) {}
  private async current(client: PoolClient, c: HrActorContext, employee: string, lock = false) {
    const row = (
      await client.query<HrPersonalProfile & { work_email: string; joined_on: string }>(
        `select first_name,middle_name,last_name,preferred_name,date_of_birth::text,personal_email,phone,work_email,joined_on::text from employee where tenant_id=$1 and id=$2${lock ? " for update" : ""}`,
        [c.tenantId, employee],
      )
    ).rows[0];
    if (!row) throw new HrApiError(404, "HR_EMPLOYEE_NOT_FOUND", "The employee is unavailable.");
    const { work_email, joined_on, ...fields } = row,
      profile = hrPersonalProfileSchema.parse(fields);
    const contacts = (
      await client.query(
        `select id,channel,contact_value,effective_from::text from employee_contact where tenant_id=$1 and employee_id=$2 and contact_usage='personal' and channel in ('email','phone') and status='active' and is_primary and effective_to is null order by channel,id`,
        [c.tenantId, employee],
      )
    ).rows;
    const version =
      (
        await client.query(
          "select id,revision from hr_employee_profile_version where tenant_id=$1 and employee_id=$2 order by revision desc,recorded_at desc,id desc limit 1",
          [c.tenantId, employee],
        )
      ).rows[0] ?? null;
    return { profile, work_email, joined_on, hash: attendanceHash({ profile, contacts, version }) };
  }
  private async reviewRead(client: PoolClient, c: HrActorContext, company: string, lock = false) {
    await requireHrGovernedCompany(client, c, company, lock);
    for (const key of ["hr.employee.read", "hr.employee_contact.read"])
      await requireHrCompanyPermission(client, c, company, key);
  }
  private async reviewWrite(client: PoolClient, c: HrActorContext, company: string, lock = false) {
    await this.reviewRead(client, c, company, lock);
    for (const key of ["hr.employee.approve", "hr.employee_contact.manage"])
      await requireHrCompanyPermission(client, c, company, key);
  }
  private async independent(client: PoolClient, c: HrActorContext, row: RecordRow) {
    if (row.requested_by === c.actor.userId) return false;
    return !(
      await client.query(
        "select 1 from employee_user_binding where tenant_id=$1 and employee_id=$2 and user_id=$3 and ended_at is null and effective_from<=current_date and(effective_to is null or effective_to>=current_date) limit 1",
        [c.tenantId, row.employee_id, c.actor.userId],
      )
    ).rowCount;
  }
  private async records(
    client: PoolClient,
    c: HrActorContext,
    company: string,
    employee: string | null,
    state: string,
    limit: number,
    offset: number,
  ) {
    const where =
        "r.tenant_id=$1 and r.company_id=$2 and($3::text is null or r.employee_id=$3) and($4='all' or r.state=$4)",
      args = [c.tenantId, company, employee, state];
    const rows = (
      await client.query<RecordRow>(
        `select r.id,r.company_id,r.employee_id,r.version,r.state,r.before_profile,r.proposed_profile,r.source_hash,r.requested_by,r.reason,r.decided_by,r.decision_reason,r.review_reference,concat_ws(' ',e.first_name,e.middle_name,e.last_name) as employee_name,e.employee_number,r.created_at::text,r.decided_at::text from hr_personal_data_correction r join employee e on e.tenant_id=r.tenant_id and e.id=r.employee_id where ${where} order by r.created_at desc,r.id limit $5 offset $6`,
        [...args, limit, offset],
      )
    ).rows;
    const total = (
      await client.query<{ total: number }>(
        `select count(*)::int as total from hr_personal_data_correction r where ${where}`,
        args,
      )
    ).rows[0]!.total;
    return { rows, total };
  }
  async workspace(c: HrActorContext, q: HrPersonalCorrectionQuery): Promise<HrPersonalCorrectionWorkspace> {
    return withHrGovernedClient(this.d, c, true, async (client) => {
      const employee = q.mode === "mine" ? await requirePersonalLeaveEmployee(client, c, q.company_id) : null;
      if (q.mode === "review") await this.reviewRead(client, c, q.company_id);
      const current = employee ? await this.current(client, c, employee) : null,
        canRequest = !!employee && (await canManagePersonalLeave(client, c, q.company_id, employee));
      let reviewer = false;
      if (q.mode === "review") {
        try {
          await this.reviewWrite(client, c, q.company_id);
          reviewer = true;
        } catch (e) {
          if (!(e instanceof HrApiError && e.status === 403)) throw e;
        }
      }
      const { rows, total } = await this.records(client, c, q.company_id, employee, q.state, q.limit, q.offset),
        items = [];
      for (const row of rows) {
        const actions: HrPersonalCorrectionAction["action"][] = [];
        if (
          row.state === "submitted" &&
          !c.impersonationRequestId &&
          (!c.realActorId || c.realActorId === c.actor.userId)
        ) {
          if (q.mode === "mine" && canRequest && row.requested_by === c.actor.userId) actions.push("cancel");
          if (reviewer && (await this.independent(client, c, row))) {
            actions.push("reject");
            if (await canManagePersonalLeave(client, c, q.company_id, row.employee_id)) actions.push("approve");
          }
        }
        const { before_profile, proposed_profile, ...rest } = row;
        items.push({ ...rest, before: before_profile, proposed: proposed_profile, allowed_actions: actions });
      }
      return hrPersonalCorrectionWorkspaceSchema.parse({
        company_id: q.company_id,
        mode: q.mode,
        current: current?.profile ?? null,
        source_hash: current?.hash ?? null,
        can_request: canRequest,
        items,
        total,
        limit: q.limit,
        offset: q.offset,
      });
    });
  }
  async create(c: HrActorContext, input: CreateHrPersonalCorrection, key: string, corr: string) {
    const employee = await withHrGovernedClient(this.d, c, true, (client) =>
      requirePersonalLeaveEmployee(client, c, input.company_id),
    );
    return runHrGovernedCommand(
      this.d,
      c,
      {
        company: input.company_id,
        key,
        corr,
        path: "/api/v1/hr/personal_corrections",
        input: { ...input, employee_id: employee },
        lock: `nexora:hr:employee-contact:${c.tenantId}:${employee}`,
        type: "hr.personal_data.correction",
      },
      async (client) => {
        await requirePersonalLeaveEmployee(client, c, input.company_id, true, employee);
      },
      async (client) => {
        const current = await this.current(client, c, employee, true);
        if (current.hash !== input.expected_source_hash)
          conflict("Your profile changed. Refresh and review the current values before submitting.");
        if (attendanceHash(current.profile) === attendanceHash(input.profile))
          conflict("Change at least one personal profile field.");
        if (input.profile.date_of_birth && input.profile.date_of_birth >= current.joined_on)
          conflict("The date of birth must be earlier than the employee joining date.");
        const id = "personal-correction-" + randomUUID();
        await client.query(
          "insert into hr_personal_data_correction(tenant_id,id,company_id,employee_id,before_profile,proposed_profile,source_hash,requested_by,reason) values($1,$2,$3,$4,$5,$6,$7,$8,$9)",
          [
            c.tenantId,
            id,
            input.company_id,
            employee,
            current.profile,
            input.profile,
            current.hash,
            c.actor.userId,
            input.reason,
          ],
        );
        return {
          id,
          version: 1,
          status: "submitted",
          before: null,
          after: { employee_id: employee, action: "submitted", profile: input.profile, reason: input.reason },
        };
      },
    );
  }
  async action(c: HrActorContext, id: string, input: HrPersonalCorrectionAction, key: string, corr: string) {
    let target: RecordRow | null = null;
    const path = `/api/v1/hr/personal_corrections/${id}/actions`;
    // Determine the shared person lock without disclosing a different company's record.
    const employee = await withHrGovernedClient(this.d, c, true, async (client) => {
      if (input.action === "cancel") return requirePersonalLeaveEmployee(client, c, input.company_id);
      await this.reviewRead(client, c, input.company_id);
      const result = (
        await client.query<{ employee_id: string }>(
          "select employee_id from hr_personal_data_correction where tenant_id=$1 and company_id=$2 and id=$3",
          [c.tenantId, input.company_id, id],
        )
      ).rows[0];
      if (!result) throw new HrApiError(404, "HR_CORRECTION_NOT_FOUND", "This correction request is unavailable.");
      return result.employee_id;
    });
    return runHrGovernedCommand(
      this.d,
      c,
      {
        company: input.company_id,
        key,
        corr,
        path,
        input,
        lock: `nexora:hr:employee-contact:${c.tenantId}:${employee}`,
        type: "hr.personal_data.correction",
      },
      async (client) => {
        if (input.action === "cancel") await requirePersonalLeaveEmployee(client, c, input.company_id, true, employee);
        else await this.reviewWrite(client, c, input.company_id, true);
        target =
          (
            await client.query<RecordRow>(
              "select * from hr_personal_data_correction where tenant_id=$1 and company_id=$2 and id=$3 for update",
              [c.tenantId, input.company_id, id],
            )
          ).rows[0] ?? null;
        if (!target || target.employee_id !== employee)
          throw new HrApiError(404, "HR_CORRECTION_NOT_FOUND", "This correction request is unavailable.");
        if (input.action === "cancel") {
          if (target.requested_by !== c.actor.userId) denied();
        } else if (!(await this.independent(client, c, target))) denied();
      },
      async (client) => {
        const row = target!;
        if (row.state !== "submitted" || row.version !== input.expected_version)
          conflict("This request changed. Refresh its state and version.");
        if (input.action === "approve") {
          if (!(await canManagePersonalLeave(client, c, input.company_id, employee)))
            conflict("The employee needs active approved employment in this company.");
          const current = await this.current(client, c, employee, true);
          if (current.hash !== row.source_hash)
            conflict(
              "The source profile or contacts changed after submission. Reject this request and ask the employee to review a fresh correction.",
            );
          const p = hrPersonalProfileSchema.parse(row.proposed_profile);
          if (p.date_of_birth && p.date_of_birth >= current.joined_on)
            conflict("The date of birth conflicts with the current joining date.");
          await client.query(
            "update employee set first_name=$3,middle_name=$4,last_name=$5,preferred_name=$6,date_of_birth=$7::date where tenant_id=$1 and id=$2",
            [c.tenantId, employee, p.first_name, p.middle_name, p.last_name, p.preferred_name, p.date_of_birth],
          );
          for (const [channel, oldValue, value] of [
            ["email", current.profile.personal_email, p.personal_email],
            ["phone", current.profile.phone, p.phone],
          ])
            if (oldValue !== value) {
              await client.query(
                "update employee_contact set status='inactive',effective_to=greatest(effective_from,current_date) where tenant_id=$1 and employee_id=$2 and channel=$3 and contact_usage='personal' and is_primary and status='active' and effective_to is null",
                [c.tenantId, employee, channel],
              );
              if (value)
                await client.query(
                  "insert into employee_contact(tenant_id,id,employee_id,channel,contact_usage,contact_value,label,is_primary,status,effective_from,created_by,source_reference) values($1,$2,$3,$4,'personal',$5,'Approved personal correction',true,'active',current_date,$6,$7)",
                  [
                    c.tenantId,
                    "personal-contact-" + randomUUID(),
                    employee,
                    channel,
                    value,
                    c.actor.userId,
                    "hr:personal-data-correction:" + id,
                  ],
                );
            }
          await this.d.recordProfile(
            client,
            c,
            employee,
            { ...p, work_email: current.work_email },
            "hr:personal-data-correction:" + id,
          );
        }
        const status = input.action === "approve" ? "approved" : input.action === "reject" ? "rejected" : "cancelled";
        await client.query(
          "update hr_personal_data_correction set state=$3,version=version+1,decided_by=$4,decision_reason=$5,review_reference=$6,decided_at=now() where tenant_id=$1 and id=$2",
          [c.tenantId, id, status, c.actor.userId, input.reason, input.review_reference],
        );
        return {
          id,
          version: row.version + 1,
          status,
          before: { state: row.state, profile: row.before_profile },
          after: {
            employee_id: employee,
            state: status,
            action: input.action,
            profile: row.proposed_profile,
            review_reference: input.review_reference,
            reason: input.reason,
          },
        };
      },
    );
  }
}
