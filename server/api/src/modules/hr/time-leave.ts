import { requirePersonalLeaveEmployee, canManagePersonalLeave } from "./self-leave-authority.js";
import type { CreateHrSelfLeaveRequest } from "@nexora/contracts";
import { readLeaveBalances, leaveUnits, leaveDecimal } from "./leave-balances.js";
import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { evaluateApprovalActor } from "@nexora/auth";
import {
  AttendanceCompletion,
  attendanceHash,
  type AttendanceCompletionDependencies,
} from "./attendance-completion.js";
import { HrApiError, type HrActorContext } from "./source-repository.js";
import type {
  HrLeaveQuery,
  HrLeavePolicyInput,
  CreateHrLeaveTypeRequest,
  UpdateHrLeavePolicyRequest,
  HrLeaveTypeStatusRequest,
  HrLeavePolicy,
  HrLeaveType,
  HrLeaveTypeDirectory,
  HrLeaveAllocation,
  HrLeaveContextQuery,
  HrLeaveBalance,
  HrLeaveBalanceQuery,
  HrLeaveBalanceDirectory,
  HrLeaveLedgerQuery,
  HrLeaveLedger,
  HrLeaveBalancePostingRequest,
  HrLeaveContext,
  CreateHrLeaveRequest,
  HrLeaveRequestActionRequest,
  HrLeaveRequestQuery,
  HrLeaveRequestSummary,
  HrLeaveRequestDirectory,
  HrLeaveRequestDetail,
} from "@nexora/contracts";
const fail = (message: string): never => {
  throw new HrApiError(409, "HR_LEAVE_REVIEW_REQUIRED", message);
};
const deny = (message: string): never => {
  throw new HrApiError(403, "PERMISSION_DENIED", message);
};
export { leaveUnits, leaveDecimal } from "./leave-balances.js";
const policyColumns = `id,version_number,effective_from::text,effective_to::text,annual_entitlement_days::text,accrual_method,carry_forward,maximum_carry_forward_days::text,maximum_balance_days::text,minimum_request_days::text,maximum_request_days::text,requires_hr_approval,applicable_category_ids,applicable_genders,document_required_after_days::text,automation_ready`;
const requestColumns = `r.id,r.reference,r.company_id,r.employee_id,e.employee_number,concat_ws(' ',e.first_name,e.middle_name,e.last_name) as display_name,r.leave_type_id,t.name as leave_type,t.paid,r.from_date::text,r.to_date::text,r.requested_days::text,r.reason,r.document_id,r.status,r.version,r.workflow_managed,r.requested_by,r.submitted_by,r.manager_user_id,r.manager_decided_by,r.hr_decided_by,r.subject_user_ids,r.requires_hr_approval,r.review_source_hash`;
const operational = (date: string) =>
  `((a.assignment_status='legacy_compatibility' or (a.assignment_status='ended' and a.employment_relationship_id is null)) or (a.assignment_status in ('active','ended') and er.approval_state='approved' and (er.status='active' or ${date}<current_date)))`;
export class TimeLeave {
  private readonly writes: AttendanceCompletion;
  constructor(
    private readonly d: AttendanceCompletionDependencies,
    private readonly personal = false,
  ) {
    this.writes = new AttendanceCompletion(d);
  }
  private require(context: HrActorContext, permission: string) {
    if (!this.has(context, permission)) deny("The required Time & Leave authority is missing.");
  }
  private has(c: HrActorContext, permission: string) {
    return this.personal
      ? [
          "hr.leave.request.read",
          "hr.leave.request.create",
          "hr.leave.request.submit",
          "hr.leave.request.cancel",
        ].includes(permission)
      : c.actor.permissions.includes(permission);
  }
  private async requestRead<T>(
    c: HrActorContext,
    company: string,
    operation: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    if (!this.personal) return this.d.read(c, "hr.leave.request.read", operation);
    const client = await this.d.pool.connect();
    try {
      await client.query("begin isolation level repeatable read read only");
      await client.query("select set_config('nexora.tenant_id',$1,true)", [c.tenantId]);
      await requirePersonalLeaveEmployee(client, c, company);
      const result = await operation(client);
      await client.query("commit");
      return result;
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
  private writeAuthority(c: HrActorContext, company: string, employee?: string, id?: string) {
    if (!this.personal) return undefined;
    return async (client: PoolClient) => {
      const own = await requirePersonalLeaveEmployee(client, c, company, true, employee);
      if (id) {
        const row = await this.row(client, c, company, id);
        if (row.employee_id !== own || row.requested_by !== c.actor.userId)
          throw new HrApiError(404, "HR_LEAVE_REQUEST_NOT_FOUND", "This personal request is unavailable.");
      }
    };
  }
  async createOwnLeaveRequest(c: HrActorContext, input: CreateHrSelfLeaveRequest, key: string, corr: string) {
    if (!this.personal) deny("Use the personal leave boundary.");
    const employee = await this.requestRead(c, input.company_id, (client) =>
      requirePersonalLeaveEmployee(client, c, input.company_id),
    );
    return this.createLeaveRequest(c, { ...input, employee_id: employee, document_id: null }, key, corr);
  }
  private async types(
    client: PoolClient,
    c: HrActorContext,
    company: string,
    ids: string[],
    date: string,
  ): Promise<HrLeaveType[]> {
    if (!ids.length) return [];
    return (
      await client.query<HrLeaveType>(
        `select t.id,t.company_id,t.code,t.name,t.paid,t.status,t.version,p.policy from hr_leave_type t left join lateral(select row_to_json(x) as policy from(select ${policyColumns} from hr_leave_policy_version where tenant_id=t.tenant_id and company_id=t.company_id and leave_type_id=t.id and effective_from<=$4::date and (effective_to is null or effective_to>=$4::date)) x)p on true where t.tenant_id=$1 and t.company_id=$2 and t.id=any($3::text[]) order by t.code,t.id`,
        [c.tenantId, company, ids, date],
      )
    ).rows;
  }
  private async type(
    client: PoolClient,
    c: HrActorContext,
    company: string,
    id: string,
    date: string,
  ): Promise<HrLeaveType> {
    const row = (
      await client.query<Omit<HrLeaveType, "policy">>(
        "select id,company_id,code,name,paid,status,version from hr_leave_type where tenant_id=$1 and company_id=$2 and id=$3",
        [c.tenantId, company, id],
      )
    ).rows[0];
    if (!row)
      throw new HrApiError(404, "HR_LEAVE_TYPE_NOT_FOUND", "The leave type is unavailable in your company scope.");
    const policy =
      (
        await client.query<HrLeavePolicy>(
          `select ${policyColumns} from hr_leave_policy_version where tenant_id=$1 and company_id=$2 and leave_type_id=$3 and effective_from<=$4::date and (effective_to is null or effective_to>=$4::date)`,
          [c.tenantId, company, id, date],
        )
      ).rows[0] ?? null;
    return { ...row, policy };
  }
  async listLeaveTypes(c: HrActorContext, q: HrLeaveQuery): Promise<HrLeaveTypeDirectory> {
    return this.d.read(c, "hr.leave.type.read", async (client) => {
      await this.d.company(client, c, q.company_id);
      const search = q.search ? `%${q.search.replace(/[\\%_]/g, "\\$&")}%` : null,
        values = [c.tenantId, q.company_id, search];
      const where = `tenant_id=$1 and company_id=$2 and ($3::text is null or code ilike $3 escape '\\' or name ilike $3 escape '\\')`;
      const rows = (
        await client.query<{ id: string }>(
          `select id from hr_leave_type where ${where} order by code,id limit $4 offset $5`,
          [...values, q.limit, q.offset],
        )
      ).rows;
      const items = await this.types(
        client,
        c,
        q.company_id,
        rows.map((r) => r.id),
        q.as_of,
      );
      return {
        items,
        total: (
          await client.query<{ total: number }>(
            `select count(*)::int as total from hr_leave_type where ${where}`,
            values,
          )
        ).rows[0]!.total,
        categories: (
          await client.query<{ id: string; code: string; name: string }>(
            `select id,code,name from hr_master_record where tenant_id=$1 and company_id=$2 and master_type='employee_category' and status='active' order by name,id limit 101`,
            [c.tenantId, q.company_id],
          )
        ).rows,
      };
    });
  }
  private async validatePolicy(
    client: PoolClient,
    c: HrActorContext,
    company: string,
    paid: boolean,
    p: HrLeavePolicyInput,
  ) {
    if (!paid && (leaveUnits(p.annual_entitlement_days) !== 0 || !p.requires_hr_approval))
      fail("Unpaid leave has no paid entitlement and requires HR approval.");
    if (p.applicable_genders.length)
      fail(
        "Gender-restricted policies require a verified employee gender authority. No gender eligibility is inferred from names or identity documents.",
      );
    if (p.applicable_category_ids.length) {
      const count = (
        await client.query<{ n: number }>(
          `select count(*)::int as n from hr_master_record where tenant_id=$1 and company_id=$2 and master_type='employee_category' and status='active' and id=any($3::text[])`,
          [c.tenantId, company, [...new Set(p.applicable_category_ids)]],
        )
      ).rows[0]!.n;
      if (count !== new Set(p.applicable_category_ids).size) fail("Choose active employee categories in this company.");
    }
  }
  private async insertPolicy(
    client: PoolClient,
    c: HrActorContext,
    company: string,
    typeId: string,
    p: HrLeavePolicyInput,
    version: number,
  ) {
    const id = `leave-policy-${randomUUID()}`;
    await client.query(
      `insert into hr_leave_policy_version(tenant_id,id,company_id,leave_type_id,version_number,effective_from,annual_entitlement_days,accrual_method,carry_forward,maximum_carry_forward_days,maximum_balance_days,minimum_request_days,maximum_request_days,requires_hr_approval,applicable_category_ids,applicable_genders,document_required_after_days,automation_ready,created_by) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,false,$18)`,
      [
        c.tenantId,
        id,
        company,
        typeId,
        version,
        p.effective_from,
        p.annual_entitlement_days,
        p.accrual_method,
        p.carry_forward,
        p.maximum_carry_forward_days,
        p.maximum_balance_days,
        p.minimum_request_days,
        p.maximum_request_days,
        p.requires_hr_approval,
        p.applicable_category_ids,
        p.applicable_genders,
        p.document_required_after_days,
        c.actor.userId,
      ],
    );
    return id;
  }
  async createLeaveType(c: HrActorContext, input: CreateHrLeaveTypeRequest, key: string, corr: string) {
    return this.writes.runWrite(
      c,
      input.company_id,
      "hr.leave.type.manage",
      key,
      corr,
      "/api/v1/hr/leave_types",
      input,
      async (client) => {
        await this.validatePolicy(client, c, input.company_id, input.paid, input.policy);
        const id = `leave-type-${randomUUID()}`,
          p = input.policy;
        await client.query(
          `insert into hr_leave_type(tenant_id,id,company_id,code,name,paid,annual_entitlement_days,accrual_method,carry_forward,maximum_carry_forward_days,maximum_balance_days,minimum_request_days,maximum_request_days,requires_hr_approval,applicable_category_ids,applicable_genders,document_required_after_days,created_by) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
          [
            c.tenantId,
            id,
            input.company_id,
            input.code,
            input.name,
            input.paid,
            p.annual_entitlement_days,
            p.accrual_method,
            p.carry_forward,
            p.maximum_carry_forward_days,
            p.maximum_balance_days,
            p.minimum_request_days,
            p.maximum_request_days,
            p.requires_hr_approval,
            p.applicable_category_ids,
            p.applicable_genders,
            p.document_required_after_days,
            c.actor.userId,
          ],
        );
        await this.insertPolicy(client, c, input.company_id, id, p, 1);
        return {
          id,
          version: 1,
          status: "active",
          before: null,
          after: { ...(await this.type(client, c, input.company_id, id, p.effective_from)) },
          type: "leave_type",
          hash: attendanceHash(input),
          override: null,
          reason: input.reason,
          action: "create",
        };
      },
    );
  }
  async updateLeavePolicy(c: HrActorContext, id: string, input: UpdateHrLeavePolicyRequest, key: string, corr: string) {
    return this.writes.runWrite(
      c,
      input.company_id,
      "hr.leave.type.manage",
      key,
      corr,
      `/api/v1/hr/leave_types/${id}/policies`,
      input,
      async (client) => {
        await client.query("select id from hr_leave_type where tenant_id=$1 and company_id=$2 and id=$3 for update", [
          c.tenantId,
          input.company_id,
          id,
        ]);
        const before = await this.type(client, c, input.company_id, id, input.policy.effective_from);
        if (before.version !== input.expected_version) fail("The leave type changed. Refresh its version.");
        await this.validatePolicy(client, c, input.company_id, before.paid, input.policy);
        const prior = (
          await client.query<{
            id: string;
            effective_from: string;
            effective_to: string | null;
            version_number: number;
          }>(
            `select id,effective_from::text,effective_to::text,version_number from hr_leave_policy_version where tenant_id=$1 and company_id=$2 and leave_type_id=$3 order by effective_from desc limit 1 for update`,
            [c.tenantId, input.company_id, id],
          )
        ).rows[0];
        if (prior && (prior.effective_to !== null || input.policy.effective_from <= prior.effective_from))
          fail("Create a later policy version after the current open-ended version.");
        if (prior)
          await client.query(
            `update hr_leave_policy_version set effective_to=$3::date-1 where tenant_id=$1 and id=$2`,
            [c.tenantId, prior.id, input.policy.effective_from],
          );
        await this.insertPolicy(client, c, input.company_id, id, input.policy, (prior?.version_number ?? 0) + 1);
        await client.query("update hr_leave_type set version=version+1,updated_at=now() where tenant_id=$1 and id=$2", [
          c.tenantId,
          id,
        ]);
        const after = await this.type(client, c, input.company_id, id, input.policy.effective_from);
        return {
          id,
          version: after.version,
          status: after.status,
          before,
          after,
          type: "leave_type",
          hash: attendanceHash(input),
          override: null,
          reason: input.reason,
          action: "policy_version",
        };
      },
    );
  }
  async changeLeaveTypeStatus(
    c: HrActorContext,
    id: string,
    input: HrLeaveTypeStatusRequest,
    key: string,
    corr: string,
  ) {
    return this.writes.runWrite(
      c,
      input.company_id,
      "hr.leave.type.manage",
      key,
      corr,
      `/api/v1/hr/leave_types/${id}/status`,
      input,
      async (client) => {
        const today = (await client.query<{ date: string }>("select current_date::text as date")).rows[0]!.date;
        const before = await this.type(client, c, input.company_id, id, today);
        if (before.version !== input.expected_version) fail("The leave type changed. Refresh it.");
        if (
          input.status === "inactive" &&
          (
            await client.query(
              `select 1 from hr_leave_request where tenant_id=$1 and company_id=$2 and leave_type_id=$3 and (status in ('draft','pending_manager','pending_hr') or (status='approved' and to_date>=current_date)) limit 1`,
              [c.tenantId, input.company_id, id],
            )
          ).rowCount
        )
          fail("Resolve drafts/pending leave and preserve future approved leave before deactivating this type.");
        await client.query(
          "update hr_leave_type set status=$3,version=version+1,updated_at=now() where tenant_id=$1 and id=$2",
          [c.tenantId, id, input.status],
        );
        const after = await this.type(client, c, input.company_id, id, today);
        return {
          id,
          version: after.version,
          status: after.status,
          before,
          after,
          type: "leave_type",
          hash: attendanceHash(input),
          override: null,
          reason: input.reason,
          action: "status",
        };
      },
    );
  }
  private async balances(
    client: PoolClient,
    c: HrActorContext,
    company: string,
    pairs: { employee: string; type: string }[],
    date: string,
    exclude?: string,
  ): Promise<HrLeaveBalance[]> {
    return readLeaveBalances(client, c, company, pairs, date, exclude);
  }
  private async balance(
    client: PoolClient,
    c: HrActorContext,
    company: string,
    employee: string,
    typeId: string,
    date: string,
    exclude?: string,
  ): Promise<HrLeaveBalance> {
    return (await this.balances(client, c, company, [{ employee, type: typeId }], date, exclude))[0]!;
  }
  async listLeaveBalances(c: HrActorContext, q: HrLeaveBalanceQuery): Promise<HrLeaveBalanceDirectory> {
    return this.d.read(c, "hr.leave.balance.read", async (client) => {
      await this.d.company(client, c, q.company_id);
      const values = [
        c.tenantId,
        q.company_id,
        q.as_of,
        q.employee_id ?? null,
        q.leave_type_id ?? null,
        q.search ? `%${q.search.replace(/[\\%_]/g, "\\$&")}%` : null,
      ];
      const from = `from employee e cross join hr_leave_type t where e.tenant_id=$1 and t.tenant_id=$1 and t.company_id=$2 and ($4::text is null or e.id=$4) and ($5::text is null or t.id=$5) and ($6::text is null or e.employee_number ilike $6 escape '\\' or concat_ws(' ',e.first_name,e.middle_name,e.last_name) ilike $6 escape '\\' or t.name ilike $6 escape '\\') and exists(select 1 from employee_assignment a left join hr_employment_relationship er on er.tenant_id=a.tenant_id and er.id=a.employment_relationship_id where a.tenant_id=e.tenant_id and a.employee_id=e.id and a.company_id=$2 and a.effective_from<=$3::date and (a.effective_to is null or a.effective_to>=$3::date) and ${operational("$3::date")})`;
      const rows = (
        await client.query<{ employee: string; type: string }>(
          `select e.id as employee,t.id as type ${from} order by e.employee_number collate "C",e.id,t.code,t.id limit $7 offset $8`,
          [...values, q.limit, q.offset],
        )
      ).rows;
      const items = await this.balances(client, c, q.company_id, rows, q.as_of);
      return {
        items,
        total: (await client.query<{ n: number }>(`select count(*)::int as n ${from}`, values)).rows[0]!.n,
      };
    });
  }
  private async ensurePlacement(
    client: PoolClient,
    c: HrActorContext,
    company: string,
    employee: string,
    date: string,
  ) {
    const n = (
      await client.query<{ n: number }>(
        `select count(*)::int as n from employee_assignment a left join hr_employment_relationship er on er.tenant_id=a.tenant_id and er.id=a.employment_relationship_id where a.tenant_id=$1 and a.company_id=$2 and a.employee_id=$3 and a.effective_from<=$4::date and (a.effective_to is null or a.effective_to>=$4::date) and ${operational("$4::date")}`,
        [c.tenantId, company, employee, date],
      )
    ).rows[0]!.n;
    if (n !== 1) fail("Exactly one approved operational employment placement must cover this date.");
  }
  async leaveLedger(c: HrActorContext, q: HrLeaveLedgerQuery): Promise<HrLeaveLedger> {
    return this.d.read(c, "hr.leave.balance.read", async (client) => {
      await this.d.company(client, c, q.company_id);
      await this.ensurePlacement(client, c, q.company_id, q.employee_id, q.as_of);
      const values = [c.tenantId, q.company_id, q.employee_id, q.leave_type_id];
      return {
        balance: await this.balance(client, c, q.company_id, q.employee_id, q.leave_type_id, q.as_of),
        items: (
          await client.query<HrLeaveLedger["items"][number]>(
            `select t.id,t.effective_on::text,t.kind,t.days::text,t.reason,t.source_type,t.source_id,t.policy_version_id,coalesce(u.display_name,t.created_by) as actor_name,t.created_at::text from hr_leave_transaction t left join security_user_account u on u.tenant_id=t.tenant_id and u.id=t.created_by where t.tenant_id=$1 and t.company_id=$2 and t.employee_id=$3 and t.leave_type_id=$4 order by t.effective_on desc,t.id limit $5 offset $6`,
            [...values, q.limit, q.offset],
          )
        ).rows,
        total: (
          await client.query<{ n: number }>(
            `select count(*)::int as n from hr_leave_transaction where tenant_id=$1 and company_id=$2 and employee_id=$3 and leave_type_id=$4`,
            values,
          )
        ).rows[0]!.n,
      };
    });
  }
  async postLeaveBalance(c: HrActorContext, input: HrLeaveBalancePostingRequest, key: string, corr: string) {
    this.require(c, "hr.leave.balance.read");
    return this.writes.runWrite(
      c,
      input.company_id,
      "hr.leave.balance.adjust",
      key,
      corr,
      "/api/v1/hr/leave_balances/postings",
      input,
      async (client) => {
        const today = (await client.query<{ today: string }>("select current_date::text as today")).rows[0]!.today;
        if (input.effective_on > today) fail("Balance credits and adjustments cannot be posted in the future.");
        await this.ensurePlacement(client, c, input.company_id, input.employee_id, input.effective_on);
        const type = await this.type(client, c, input.company_id, input.leave_type_id, input.effective_on);
        if (type.status !== "active" || !type.policy || !type.paid)
          fail(
            "Choose an active paid leave type with an effective policy. Unpaid leave does not receive entitlement credits.",
          );
        const before = await this.balance(
          client,
          c,
          input.company_id,
          input.employee_id,
          input.leave_type_id,
          input.effective_on,
        );
        if (before.hash !== input.expected_balance_hash) fail("The balance changed. Refresh and review its ledger.");
        const amount = leaveUnits(input.days),
          p = type.policy!;
        if (input.kind === "expiry" ? amount >= 0 : input.kind !== "adjustment" && amount <= 0)
          fail("Opening/accrual/carry-forward must be positive; expiry must be negative.");
        if (amount < 0 && leaveUnits(before.available) + amount < 0)
          fail("The posting would consume reserved or approved leave or make the available balance negative.");
        if (
          amount > 0 &&
          leaveUnits(p.maximum_balance_days) > 0 &&
          leaveUnits(before.balance) + amount > leaveUnits(p.maximum_balance_days)
        )
          fail("The posting exceeds the effective maximum leave balance.");
        if (input.kind === "carry_forward" && (!p.carry_forward || amount > leaveUnits(p.maximum_carry_forward_days)))
          fail("Carry-forward exceeds the effective policy allowance.");
        const needsPeriod = ["accrual", "carry_forward", "expiry"].includes(input.kind);
        if (
          needsPeriod &&
          (!input.period_start ||
            !input.period_end ||
            input.period_end > today ||
            input.period_start > input.effective_on ||
            input.period_end > input.effective_on)
        )
          fail(
            "Accrual, carry-forward and expiry require a completed source period ending no later than the posting date.",
          );
        if (input.kind === "accrual") {
          const prior = (
            await client.query<{ days: string }>(
              `select coalesce(sum(days),0)::text as days from hr_leave_transaction where tenant_id=$1 and company_id=$2 and employee_id=$3 and leave_type_id=$4 and kind='accrual' and extract(year from effective_on)=extract(year from $5::date)`,
              [c.tenantId, input.company_id, input.employee_id, input.leave_type_id, input.effective_on],
            )
          ).rows[0]!.days;
          if (leaveUnits(prior) + amount > leaveUnits(p.annual_entitlement_days))
            fail("Accrual postings for this calendar year exceed the effective annual entitlement.");
        }
        const id = `leave-posting-${randomUUID()}`,
          source =
            input.kind === "opening"
              ? `opening:${input.employee_id}:${input.leave_type_id}`
              : needsPeriod
                ? `${input.kind}:${input.employee_id}:${input.leave_type_id}:${input.period_start}:${input.period_end}`
                : id;
        await client.query(
          `insert into hr_leave_transaction(tenant_id,id,company_id,employee_id,leave_type_id,effective_on,kind,days,source_type,source_id,reason,created_by,policy_version_id,period_start,period_end,evidence_hash,evidence_json) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17::jsonb)`,
          [
            c.tenantId,
            id,
            input.company_id,
            input.employee_id,
            input.leave_type_id,
            input.effective_on,
            input.kind,
            input.days,
            input.kind === "opening" ? "opening" : needsPeriod ? "policy" : "manual_adjustment",
            source,
            input.reason,
            c.actor.userId,
            p.id,
            input.period_start,
            input.period_end,
            attendanceHash(input),
            JSON.stringify({ input, before_hash: before.hash, policy: p }),
          ],
        );
        const after = await this.balance(
          client,
          c,
          input.company_id,
          input.employee_id,
          input.leave_type_id,
          input.effective_on,
        );
        return {
          id,
          version: 1,
          status: "posted",
          before,
          after: { company_id: input.company_id, ...after },
          type: "leave_balance",
          hash: after.hash,
          override: null,
          reason: input.reason,
          action: input.kind,
        };
      },
    );
  }
  private async context(client: PoolClient, c: HrActorContext, q: HrLeaveContextQuery): Promise<HrLeaveContext> {
    const dates = (
        await client.query<{ date: string }>(
          `select d::date::text as date from generate_series($1::date,$2::date,interval '1 day') d`,
          [q.from_date, q.to_date],
        )
      ).rows.map((d) => d.date),
      meta = (await client.query<{ now: Date; today: string }>("select now() as now,current_date::text as today"))
        .rows[0]!;
    const selected = this.personal
        ? { ids: q.employee_id ? [q.employee_id] : [], total: q.employee_id ? 1 : 0 }
        : await this.d.employees(client, c, q.company_id, q.from_date, q.to_date, q.search, 100, 0),
      employees = (
        await client.query<{ id: string; code: string; name: string }>(
          `select id,employee_number as code,concat_ws(' ',first_name,middle_name,last_name) as name from employee where tenant_id=$1 and id=any($2::text[]) order by employee_number,id`,
          [c.tenantId, selected.ids],
        )
      ).rows;
    const typeIds = (
        await client.query<{ id: string }>(
          `select id from hr_leave_type where tenant_id=$1 and company_id=$2 and status='active' order by case when id=$3 then 0 else 1 end,code,id limit 101`,
          [c.tenantId, q.company_id, q.leave_type_id ?? null],
        )
      ).rows,
      types = await this.types(
        client,
        c,
        q.company_id,
        typeIds.slice(0, 100).map((t) => t.id),
        q.from_date,
      );
    const blockers: string[] = [],
      days: HrLeaveContext["days"] = [];
    let manager: string | null = null,
      managerName: string | null = null,
      subjects: string[] = [],
      balance: HrLeaveBalance | null = null;
    let documents: HrLeaveContext["documents"] = [];
    let privateEvidence: unknown = null;
    if (q.employee_id) {
      const placements = (
        await client.query<{
          on_date: string;
          id: string;
          reporting_manager_id: string | null;
          employee_category_id: string;
        }>(
          `select d.on_date::text,a.id,a.reporting_manager_id,a.employee_category_id from unnest($4::date[]) d(on_date) join employee_assignment a on a.tenant_id=$1 and a.company_id=$2 and a.employee_id=$3 and a.effective_from<=d.on_date and (a.effective_to is null or a.effective_to>=d.on_date) left join hr_employment_relationship er on er.tenant_id=a.tenant_id and er.id=a.employment_relationship_id where ${operational("d.on_date")} order by d.on_date,a.id`,
          [c.tenantId, q.company_id, q.employee_id, dates],
        )
      ).rows;
      let archivedScope: { document_id: string | null } | null = null;
      if (!placements.length) {
        if (q.request_id)
          archivedScope =
            (
              await client.query<{ document_id: string | null }>(
                `select document_id from hr_leave_request where tenant_id=$1 and company_id=$2 and employee_id=$3 and id=$4`,
                [c.tenantId, q.company_id, q.employee_id, q.request_id],
              )
            ).rows[0] ?? null;
        if (!archivedScope)
          throw new HrApiError(
            404,
            "HR_LEAVE_EMPLOYEE_NOT_FOUND",
            "The employee is unavailable in the selected company and date range.",
          );
      }
      if (dates.some((date) => placements.filter((p) => p.on_date === date).length !== 1))
        blockers.push("Every calendar date must have exactly one approved operational employment placement.");
      const managers = [...new Set(placements.map((p) => p.reporting_manager_id))];
      if (managers.length !== 1 || !managers[0])
        blockers.push("Use a date range with one effective reporting manager. Split requests at reporting changes.");
      else {
        const route = (
          await client.query<{ user_id: string; display_name: string }>(
            `select b.user_id,u.display_name from employee_user_binding b join security_user_account u on u.tenant_id=b.tenant_id and u.id=b.user_id and u.status='active' and u.archived_at is null join security_user_company_access a on a.tenant_id=b.tenant_id and a.user_id=b.user_id and a.company_id=$3 and a.revoked_at is null where b.tenant_id=$1 and b.employee_id=$2 and b.ended_at is null and b.effective_from<=current_date and (b.effective_to is null or b.effective_to>=current_date)`,
            [c.tenantId, managers[0], q.company_id],
          )
        ).rows;
        if (route.length === 1) {
          manager = route[0]!.user_id;
          managerName = route[0]!.display_name;
        } else blockers.push("The reporting manager needs one active account binding and company access.");
      }
      subjects = (
        await client.query<{ user_id: string }>(
          `select distinct user_id from employee_user_binding where tenant_id=$1 and employee_id=$2 and (daterange(effective_from,coalesce(effective_to,'infinity'::date),'[]')&&daterange($3::date,$4::date,'[]') or current_date between effective_from and coalesce(effective_to,'infinity'::date)) order by user_id`,
          [c.tenantId, q.employee_id, q.from_date, q.to_date],
        )
      ).rows.map((r) => r.user_id);
      const attendance = await this.d.days(
          client,
          c,
          q.company_id,
          dates,
          [q.employee_id],
          meta.now,
          meta.today,
          false,
        ),
        locked = (
          await client.query<{ month: string }>(
            `select month::text from hr_attendance_period where tenant_id=$1 and company_id=$2 and state='locked' and daterange(month,(month+interval '1 month')::date,'[)')&&daterange($3::date,$4::date,'[]') order by month`,
            [c.tenantId, q.company_id, q.from_date, q.to_date],
          )
        ).rows;
      if (locked.length) blockers.push("The requested range overlaps a locked attendance period.");
      documents =
        !this.personal && c.actor.permissions.includes("hr.employee_document.read")
          ? (
              await client.query<HrLeaveContext["documents"][number]>(
                `select id,title as name,expires_on::text from employee_document where tenant_id=$1 and employee_id=$2 and status='active' and verification_status='verified' and (expires_on is null or expires_on>=$3::date) and ($4::boolean or id=$5) order by title,id limit 100`,
                [c.tenantId, q.employee_id, q.to_date, placements.length > 0, archivedScope?.document_id ?? null],
              )
            ).rows
          : [];
      if (q.document_id && !documents.some((d) => d.id === q.document_id))
        blockers.push("Select a verified, active employee document covering the requested dates.");
      const own = q.request_id
        ? (
            await client.query<{ id: string }>(
              `select id from hr_leave_request where tenant_id=$1 and company_id=$2 and employee_id=$3 and id=$4`,
              [c.tenantId, q.company_id, q.employee_id, q.request_id],
            )
          ).rows[0]
        : null;
      const conflicts = (
        await client.query<{ id: string }>(
          `select id from hr_leave_request where tenant_id=$1 and company_id=$2 and employee_id=$3 and status in ('pending_manager','pending_hr','approved') and daterange(from_date,to_date,'[]')&&daterange($4::date,$5::date,'[]') and ($6::text is null or id<>$6) order by id`,
          [c.tenantId, q.company_id, q.employee_id, q.from_date, q.to_date, own?.id ?? null],
        )
      ).rows;
      if (conflicts.length) blockers.push("Another pending or approved leave request overlaps this range.");
      const type = q.leave_type_id ? await this.type(client, c, q.company_id, q.leave_type_id, q.from_date) : null;
      const policies = type
        ? (
            await client.query<HrLeavePolicy>(
              `select ${policyColumns} from hr_leave_policy_version where tenant_id=$1 and company_id=$2 and leave_type_id=$3 and effective_from<=$5::date and (effective_to is null or effective_to>=$4::date) order by effective_from`,
              [c.tenantId, q.company_id, type.id, q.from_date, q.to_date],
            )
          ).rows
        : [];
      if (type && type.status !== "active") blockers.push("The leave type is inactive.");
      if (type) balance = await this.balance(client, c, q.company_id, q.employee_id, type.id, q.to_date, own?.id);
      for (const date of dates) {
        const row = attendance.find((a) => a.on_date === date)?.row,
          policy =
            policies.find((p) => p.effective_from <= date && (!p.effective_to || p.effective_to >= date)) ?? null;
        const issues: string[] = [];
        if (!row || !row.scheduled_start || !row.scheduled_end)
          issues.push("A configured effective shift is required to identify working days.");
        for (const issue of row?.issues ?? []) issues.push(issue);
        const chargeable = !!row && !["off_day", "holiday"].includes(row.status);
        if (chargeable && type && !policy) issues.push("No leave policy covers this date.");
        if (
          policy?.applicable_category_ids.length &&
          !policy.applicable_category_ids.includes(
            placements.find((p) => p.on_date === date)?.employee_category_id ?? "",
          )
        )
          issues.push("The effective employee category is outside this policy.");
        if (policy?.applicable_genders.length)
          issues.push("Verified employee gender eligibility is required for this restricted legacy policy.");
        days.push({
          on_date: date,
          chargeable,
          status: row?.status ?? "unavailable",
          shift_name: row?.shift_name ?? null,
          punch_count: row?.punch_count ?? 0,
          worked_minutes: row?.worked_minutes ?? 0,
          first_in: row?.first_in ?? null,
          last_out: row?.last_out ?? null,
          scheduled_start: row?.scheduled_start ?? null,
          scheduled_end: row?.scheduled_end ?? null,
          policy,
          issues,
        });
      }
      privateEvidence = { placements, attendance, locked, conflicts, documents };
    }
    const value = {
      employees,
      employees_capped: selected.total > 100,
      types,
      documents,
      manager_user_id: manager,
      manager_name: managerName,
      subject_user_ids: subjects,
      days,
      balance,
      blockers,
      today: meta.today,
    };
    // Employee search/options are presentation state, not approval authority.
    return {
      ...value,
      hash: attendanceHash({
        company: q.company_id,
        employee: q.employee_id ?? null,
        type: q.leave_type_id ?? null,
        from: q.from_date,
        to: q.to_date,
        document: q.document_id ?? null,
        manager,
        subjects,
        days,
        balance,
        blockers,
        privateEvidence,
      }),
    };
  }
  async leaveContext(c: HrActorContext, q: HrLeaveContextQuery): Promise<HrLeaveContext> {
    return this.requestRead(c, q.company_id, async (client) => {
      await this.d.company(client, c, q.company_id);
      const employee = this.personal ? await requirePersonalLeaveEmployee(client, c, q.company_id) : q.employee_id;
      return this.context(client, c, { ...q, employee_id: employee });
    });
  }
  private validate(context: HrLeaveContext, days: HrLeaveAllocation[], document: string | null) {
    if (context.blockers.length) fail(context.blockers.join(" "));
    if (!days.length) fail("Select at least one working day.");
    let total = 0;
    for (const day of days) {
      const source = context.days.find((d) => d.on_date === day.on_date);
      if (!source?.chargeable || !source.policy) fail("Leave may only charge effective working days with a policy.");
      if (source!.issues.length) fail(source!.issues.join(" "));
      if (source!.status === "official_duty" || (day.portion === "full" && source!.punch_count > 0))
        fail("Leave overlaps recorded work or official duty. Reconcile attendance before requesting this day.");
      if (day.portion !== "full" && source!.punch_count > 0) {
        const midpoint = (Date.parse(source!.scheduled_start!) + Date.parse(source!.scheduled_end!)) / 2;
        if (
          !source!.first_in ||
          !source!.last_out ||
          (day.portion === "first_half"
            ? Date.parse(source!.first_in) < midpoint
            : Date.parse(source!.last_out) > midpoint)
        )
          fail("Recorded work overlaps the selected leave half. Reconcile its timestamps first.");
      }
      total += day.portion === "full" ? 10000 : 5000;
    }
    for (const day of days) {
      const p = context.days.find((d) => d.on_date === day.on_date)!.policy!;
      if (total < leaveUnits(p.minimum_request_days) || total > leaveUnits(p.maximum_request_days))
        fail("Requested days are outside an effective policy request limit.");
      if (p.document_required_after_days !== null && total > leaveUnits(p.document_required_after_days) && !document)
        fail("This request requires a verified employee supporting document.");
    }
    if (context.balance?.paid && leaveUnits(context.balance.available) < total)
      fail("Insufficient unreserved leave balance. Post authorized entitlement before submitting the request.");
    return total;
  }
  private async row(client: PoolClient, c: HrActorContext, company: string, id: string) {
    const r = (
      await client.query<HrLeaveRequestSummary>(
        `select ${requestColumns} from hr_leave_request r join employee e on e.tenant_id=r.tenant_id and e.id=r.employee_id join hr_leave_type t on t.tenant_id=r.tenant_id and t.id=r.leave_type_id where r.tenant_id=$1 and r.company_id=$2 and r.id=$3`,
        [c.tenantId, company, id],
      )
    ).rows[0];
    if (!r)
      throw new HrApiError(
        404,
        "HR_LEAVE_REQUEST_NOT_FOUND",
        "The leave request is unavailable in your company scope.",
      );
    return r;
  }
  private async allocations(client: PoolClient, c: HrActorContext, id: string) {
    return (
      await client.query<HrLeaveRequestDetail["days"][number]>(
        `select leave_date::text as on_date,portion,days::text,policy_version_id from hr_leave_request_day where tenant_id=$1 and request_id=$2 order by leave_date,id`,
        [c.tenantId, id],
      )
    ).rows;
  }
  private actions(c: HrActorContext, r: HrLeaveRequestSummary, context: HrLeaveContext | null) {
    const actions: HrLeaveRequestActionRequest["action"][] = [],
      makers = [
        r.requested_by,
        r.submitted_by ?? "",
        ...r.subject_user_ids,
        ...(context?.subject_user_ids ?? []),
        ...(["pending_hr", "approved"].includes(r.status) ? [r.manager_decided_by ?? ""] : []),
        ...(r.status === "approved" ? [r.hr_decided_by ?? ""] : []),
      ],
      locked = context?.blockers.some((b) => b.includes("locked attendance")) ?? true;
    if (r.workflow_managed && !locked) {
      if (r.status === "approved" && this.has(c, "hr.leave.request.cancel")) {
        const policy = evaluateApprovalActor({
          account: c.actor,
          normalDecisionPermission: "hr.leave.request.hr_approve",
          makerActorIds: makers,
          impersonated: Boolean(c.impersonationRequestId || (c.realActorId && c.realActorId !== c.actor.userId)),
        });
        if (policy.kind !== "forbidden") actions.push("cancel_approved");
      }
      if (
        r.requested_by === c.actor.userId &&
        ["draft", "pending_manager", "pending_hr"].includes(r.status) &&
        this.has(c, "hr.leave.request.cancel")
      )
        actions.push("cancel");
      if (
        r.requested_by === c.actor.userId &&
        r.status === "draft" &&
        context &&
        !context.blockers.length &&
        this.has(c, "hr.leave.request.submit")
      )
        actions.push("submit");
      if ((r.status === "pending_manager" && r.manager_user_id === c.actor.userId) || r.status === "pending_hr")
        for (const decision of ["approve", "reject"] as const) {
          const action = `${r.status === "pending_manager" ? "manager" : "hr"}_${decision}` as const,
            policy = evaluateApprovalActor({
              account: c.actor,
              normalDecisionPermission: `hr.leave.request.${action}`,
              makerActorIds: makers,
              impersonated: Boolean(c.impersonationRequestId || (c.realActorId && c.realActorId !== c.actor.userId)),
            });
          if (
            policy.kind !== "forbidden" &&
            (decision === "reject" ||
              (context && !context.blockers.length && context.manager_user_id === r.manager_user_id))
          )
            actions.push(action);
        }
    }
    return {
      allowed_actions: this.personal ? actions.filter((a) => a === "submit" || a === "cancel") : actions,
      self_decision_requires_override: this.personal ? false : makers.includes(c.actor.userId),
    };
  }
  async listLeaveRequests(c: HrActorContext, q: HrLeaveRequestQuery): Promise<HrLeaveRequestDirectory> {
    return this.d.read(c, "hr.leave.request.read", async (client) => {
      await this.d.company(client, c, q.company_id);
      const values = [
        c.tenantId,
        q.company_id,
        q.status ?? null,
        q.search ? `%${q.search.replace(/[\\%_]/g, "\\$&")}%` : null,
        c.actor.userId,
        q.queue_only === "true",
      ];
      const from = `from hr_leave_request r join employee e on e.tenant_id=r.tenant_id and e.id=r.employee_id join hr_leave_type t on t.tenant_id=r.tenant_id and t.id=r.leave_type_id`;
      const where = `r.tenant_id=$1 and r.company_id=$2 and ($3::text is null or r.status=$3) and ($4::text is null or r.reference ilike $4 escape '\\' or e.employee_number ilike $4 escape '\\' or concat_ws(' ',e.first_name,e.middle_name,e.last_name) ilike $4 escape '\\') and (not $6::boolean or ((r.status='pending_manager' and r.manager_user_id=$5) or r.status='pending_hr'))`;
      return {
        items: (
          await client.query<HrLeaveRequestSummary>(
            `select ${requestColumns} ${from} where ${where} order by r.created_at desc,r.id limit $7 offset $8`,
            [...values, q.limit, q.offset],
          )
        ).rows,
        total: (await client.query<{ n: number }>(`select count(*)::int as n ${from} where ${where}`, values)).rows[0]!
          .n,
      };
    });
  }
  async getLeaveRequest(c: HrActorContext, company: string, id: string): Promise<HrLeaveRequestDetail> {
    return this.requestRead(c, company, async (client) => {
      await this.d.company(client, c, company);
      const row = await this.row(client, c, company, id);
      if (this.personal && row.employee_id !== (await requirePersonalLeaveEmployee(client, c, company)))
        throw new HrApiError(404, "HR_LEAVE_REQUEST_NOT_FOUND", "This personal request is unavailable.");
      let context: HrLeaveContext | null = null,
        unavailable: string | null = null;
      try {
        context = await this.context(client, c, {
          company_id: company,
          employee_id: row.employee_id,
          leave_type_id: row.leave_type_id,
          from_date: row.from_date,
          to_date: row.to_date,
          document_id: row.document_id ?? undefined,
          request_id: id,
        });
      } catch (error) {
        if (error instanceof HrApiError && [404, 409].includes(error.status)) unavailable = error.message;
        else throw error;
      }
      const history = (
        await client.query<HrLeaveRequestDetail["history"][number]>(
          `select ev.action,ev.reason,coalesce(u.display_name,ev.actor_id) as actor_name,ev.occurred_at::text,ev.source_hash,ev.override_event_id from hr_attendance_completion_event ev left join security_user_account u on u.tenant_id=ev.tenant_id and u.id=ev.actor_id where ev.tenant_id=$1 and ev.resource_type='leave_request' and ev.resource_id=$2 order by ev.version desc limit 50`,
          [c.tenantId, id],
        )
      ).rows;
      return {
        ...row,
        days: await this.allocations(client, c, id),
        context,
        context_unavailable: unavailable,
        ...(this.personal && !(await canManagePersonalLeave(client, c, company, row.employee_id))
          ? { allowed_actions: [], self_decision_requires_override: false }
          : this.actions(c, row, context)),
        history,
      };
    });
  }
  async createLeaveRequest(c: HrActorContext, input: CreateHrLeaveRequest, key: string, corr: string) {
    this.require(c, "hr.leave.request.read");
    return this.writes.runWrite(
      c,
      input.company_id,
      "hr.leave.request.create",
      key,
      corr,
      this.personal ? "/api/v1/hr/self_service/leave_requests" : "/api/v1/hr/leave_requests",
      input,
      async (client) => {
        const context = await this.context(client, c, {
          company_id: input.company_id,
          employee_id: input.employee_id,
          leave_type_id: input.leave_type_id,
          from_date: input.from_date,
          to_date: input.to_date,
          document_id: input.document_id ?? undefined,
        });
        if (context.hash !== input.expected_evidence_hash)
          fail("Leave context changed. Refresh and review the calendar, policy and balance.");
        const total = this.validate(context, input.days, input.document_id),
          id = `leave-request-${randomUUID()}`,
          requiresHR = input.days.some(
            (d) => context.days.find((x) => x.on_date === d.on_date)?.policy?.requires_hr_approval,
          );
        await client.query(
          `insert into hr_leave_request(tenant_id,id,company_id,employee_id,leave_type_id,document_id,from_date,to_date,requested_days,reason,requested_by,workflow_managed,requires_hr_approval,review_source_hash) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,true,$12,$13)`,
          [
            c.tenantId,
            id,
            input.company_id,
            input.employee_id,
            input.leave_type_id,
            input.document_id,
            input.from_date,
            input.to_date,
            leaveDecimal(total),
            input.reason,
            c.actor.userId,
            requiresHR,
            context.hash,
          ],
        );
        const paid = context.types.find((t) => t.id === input.leave_type_id)!.paid;
        for (const day of input.days)
          await client.query(
            `insert into hr_leave_request_day(tenant_id,id,company_id,request_id,employee_id,leave_type_id,policy_version_id,leave_date,days,portion,paid_snapshot) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
            [
              c.tenantId,
              `leave-day-${randomUUID()}`,
              input.company_id,
              id,
              input.employee_id,
              input.leave_type_id,
              context.days.find((d) => d.on_date === day.on_date)!.policy!.id,
              day.on_date,
              day.portion === "full" ? "1" : "0.5",
              day.portion,
              paid,
            ],
          );
        const after = await this.row(client, c, input.company_id, id);
        return {
          id,
          version: 1,
          status: "draft",
          before: null,
          after,
          type: "leave_request",
          hash: context.hash,
          override: null,
          reason: input.reason,
          action: "create",
        };
      },
      this.writeAuthority(c, input.company_id, input.employee_id),
    );
  }
  async actOnLeaveRequest(
    c: HrActorContext,
    id: string,
    input: HrLeaveRequestActionRequest,
    key: string,
    corr: string,
  ) {
    this.require(c, "hr.leave.request.read");
    if (this.personal && !["submit", "cancel"].includes(input.action))
      deny("Personal leave cannot approve, reject or reverse approved leave.");
    if (input.action === "cancel_approved") this.require(c, "hr.leave.request.hr_approve");
    return this.writes.runWrite(
      c,
      input.company_id,
      input.action === "cancel_approved" ? "hr.leave.request.cancel" : `hr.leave.request.${input.action}`,
      key,
      corr,
      this.personal
        ? `/api/v1/hr/self_service/leave_requests/${id}/actions`
        : `/api/v1/hr/leave_requests/${id}/actions`,
      input,
      async (client) => {
        await client.query(
          "select id from hr_leave_request where tenant_id=$1 and company_id=$2 and id=$3 for update",
          [c.tenantId, input.company_id, id],
        );
        const before = await this.row(client, c, input.company_id, id);
        if (before.version !== input.expected_version) fail("This request changed. Refresh its version.");
        const context = await this.context(client, c, {
          company_id: input.company_id,
          employee_id: before.employee_id,
          leave_type_id: before.leave_type_id,
          from_date: before.from_date,
          to_date: before.to_date,
          document_id: before.document_id ?? undefined,
          request_id: id,
        });
        if (!this.actions(c, before, context).allowed_actions.includes(input.action))
          deny("This action is unavailable for the owner, reporting route, approval stage or locked period.");
        const days = await this.allocations(client, c, id),
          checking = input.action === "submit" || input.action.endsWith("_approve");
        if (checking) {
          if (input.expected_evidence_hash !== context.hash)
            fail("Leave evidence changed. Refresh and review before deciding.");
          this.validate(context, days, before.document_id);
          if (days.some((d) => context.days.find((x) => x.on_date === d.on_date)?.policy?.id !== d.policy_version_id))
            fail("The policy changed. Cancel and replace this request with reviewed policy evidence.");
        }
        const action = input.action,
          status =
            action === "submit"
              ? "pending_manager"
              : action === "cancel" || action === "cancel_approved"
                ? "cancelled"
                : action.endsWith("_reject")
                  ? "rejected"
                  : action === "manager_approve" && before.requires_hr_approval
                    ? "pending_hr"
                    : "approved";
        let override: string | null = null;
        if (action === "submit")
          await client.query(
            `update hr_leave_request set status=$3,submitted_by=$4,manager_user_id=$5,subject_user_ids=$6,review_source_hash=$7,version=version+1 where tenant_id=$1 and id=$2`,
            [c.tenantId, id, status, c.actor.userId, context.manager_user_id, context.subject_user_ids, context.hash],
          );
        else if (action === "cancel")
          await client.query(
            `update hr_leave_request set status=$3,decision_comment=$4,version=version+1 where tenant_id=$1 and id=$2`,
            [c.tenantId, id, status, input.reason],
          );
        else if (action === "cancel_approved") {
          if (input.expected_evidence_hash !== context.hash)
            fail("Cancellation evidence changed. Refresh the request before deciding.");
          const makers = [
              before.requested_by,
              before.submitted_by ?? "",
              before.manager_decided_by ?? "",
              before.hr_decided_by ?? "",
              ...before.subject_user_ids,
              ...context.subject_user_ids,
            ],
            permission = "hr.leave.request.hr_approve",
            policy = evaluateApprovalActor({
              account: c.actor,
              normalDecisionPermission: permission,
              makerActorIds: makers,
              impersonated: Boolean(c.impersonationRequestId || (c.realActorId && c.realActorId !== c.actor.userId)),
            });
          if (policy.kind === "forbidden" || (policy.kind === "override" && !input.override_self_approval))
            deny(
              "Independent HR approval or an explicitly acknowledged governed override is required to cancel approved leave.",
            );
          override = await this.d.override(client, c, {
            normalDecisionPermission: permission,
            makerActorIds: makers,
            resourceType: "hr_leave_request_cancellation",
            resourceId: id,
            decisionAction: "approve",
            reason: input.reason,
            correlationId: corr,
            idempotencyKey: key,
          });
          await client.query(
            `update hr_leave_request set status='cancelled',cancellation_approved_by=$3,cancellation_approved_at=now(),cancellation_override_event_id=$4,decision_comment=$5,version=version+1 where tenant_id=$1 and id=$2`,
            [c.tenantId, id, c.actor.userId, override, input.reason],
          );
          for (const day of days) {
            const evidence = { request_id: id, version: before.version + 1, day, context_hash: context.hash };
            await client.query(
              `insert into hr_leave_transaction(tenant_id,id,company_id,employee_id,leave_type_id,effective_on,kind,days,source_type,source_id,reason,created_by,policy_version_id,evidence_hash,evidence_json) values($1,$2,$3,$4,$5,$6,'reversal',$7,'reversal',$8,$9,$10,$11,$12,$13::jsonb)`,
              [
                c.tenantId,
                "leave-reversal-" + randomUUID(),
                input.company_id,
                before.employee_id,
                before.leave_type_id,
                day.on_date,
                day.days,
                id + ":" + day.on_date,
                input.reason,
                c.actor.userId,
                day.policy_version_id,
                attendanceHash(evidence),
                JSON.stringify(evidence),
              ],
            );
          }
        } else {
          const makers = [
              before.requested_by,
              before.submitted_by ?? "",
              ...before.subject_user_ids,
              ...context.subject_user_ids,
              ...(action.startsWith("hr_") ? [before.manager_decided_by ?? ""] : []),
            ],
            permission = `hr.leave.request.${action}`,
            impersonated = Boolean(c.impersonationRequestId || (c.realActorId && c.realActorId !== c.actor.userId)),
            policy = evaluateApprovalActor({
              account: c.actor,
              normalDecisionPermission: permission,
              makerActorIds: makers,
              impersonated,
            });
          if (policy.kind === "forbidden") deny("An independent authorized approver must decide this request.");
          if (policy.kind === "override" && !input.override_self_approval)
            deny("Explicit acknowledgement is required for an audited super-administrator override.");
          override = await this.d.override(client, c, {
            normalDecisionPermission: permission,
            makerActorIds: makers,
            resourceType: "hr_leave_request",
            resourceId: id,
            decisionAction: action.endsWith("_approve") ? "approve" : "reject",
            reason: input.reason,
            correlationId: corr,
            idempotencyKey: key,
          });
          const stage = action.startsWith("manager_") ? "manager" : "hr";
          await client.query(
            `update hr_leave_request set status=$3,${stage}_decided_by=$4,${stage}_decided_at=now(),${stage}_override_event_id=$5,decision_comment=$6,review_source_hash=$7,version=version+1 where tenant_id=$1 and id=$2`,
            [c.tenantId, id, status, c.actor.userId, override, input.reason, context.hash],
          );
        }
        if (status === "approved")
          for (const day of days) {
            const evidence = { request_id: id, version: before.version + 1, day, context_hash: context.hash };
            await client.query(
              `insert into hr_leave_transaction(tenant_id,id,company_id,employee_id,leave_type_id,effective_on,kind,days,source_type,source_id,reason,created_by,policy_version_id,evidence_hash,evidence_json) values($1,$2,$3,$4,$5,$6,'used',$7,'leave_request',$8,$9,$10,$11,$12,$13::jsonb)`,
              [
                c.tenantId,
                `leave-used-${randomUUID()}`,
                input.company_id,
                before.employee_id,
                before.leave_type_id,
                day.on_date,
                leaveDecimal(-leaveUnits(day.days)),
                `${id}:${day.on_date}`,
                input.reason,
                c.actor.userId,
                day.policy_version_id,
                attendanceHash(evidence),
                JSON.stringify(evidence),
              ],
            );
          }
        const after = await this.row(client, c, input.company_id, id);
        return {
          id,
          version: after.version,
          status,
          before,
          after,
          type: "leave_request",
          hash: context.hash,
          override,
          reason: input.reason,
          action,
        };
      },
      this.writeAuthority(c, input.company_id, undefined, id),
    );
  }
}
