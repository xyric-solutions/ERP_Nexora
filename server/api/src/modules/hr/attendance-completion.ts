import { createHash, randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { evaluateApprovalActor } from "@nexora/auth";
import type { HrActorContext } from "./source-repository.js";
import { HrApiError } from "./source-repository.js";
import type {
  HrCorrectionEvidence,
  HrDailyAttendanceRow,
  HrOvertimeQuery,
  HrOvertimeContextQuery,
  HrOvertimeRuleRequest,
  HrOvertimeRule,
  HrOvertimeEvidence,
  HrOvertimeContext,
  CreateHrOvertimeRequest,
  HrOvertimeActionRequest,
  HrAttendanceCompletionResult,
  HrOvertimeSummary,
  HrOvertimeDetail,
  HrOvertimeDirectory,
  HrAttendancePeriodQuery,
  HrAttendancePeriodActionRequest,
  HrAttendanceCloseDay,
  HrAttendanceCloseEmployee,
  HrAttendancePeriod,
  HrAttendancePeriodWorkspace,
  HrAttendancePayrollInputs,
} from "@nexora/contracts";

export function attendanceHash(value: unknown): string {
  const canonical = (v: unknown): unknown =>
    v instanceof Date
      ? v.toISOString()
      : Array.isArray(v)
        ? v.map(canonical)
        : v && typeof v === "object"
          ? Object.fromEntries(
              Object.entries(v)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([k, x]) => [k, canonical(x)]),
            )
          : v;
  return createHash("sha256")
    .update(JSON.stringify(canonical(value)))
    .digest("hex");
}
const denied = (message: string): never => {
  throw new HrApiError(403, "PERMISSION_DENIED", message);
};
const conflict = (message: string): never => {
  throw new HrApiError(409, "HR_ATTENDANCE_REVIEW_REQUIRED", message);
};
type OverrideInput = {
  normalDecisionPermission: string;
  makerActorIds: readonly string[];
  resourceType: string;
  resourceId: string;
  decisionAction: "approve" | "reject" | "activate";
  reason: string;
  correlationId: string;
  idempotencyKey: string;
};
export type AttendanceCompletionDependencies = {
  pool: Pool;
  read: <T>(context: HrActorContext, permission: string, operation: (client: PoolClient) => Promise<T>) => Promise<T>;
  company: (client: PoolClient, context: HrActorContext, company: string) => Promise<void>;
  evidence: (
    client: PoolClient,
    context: HrActorContext,
    company: string,
    employee: string,
    date: string,
  ) => Promise<HrCorrectionEvidence>;
  employees: (
    client: PoolClient,
    context: HrActorContext,
    company: string,
    from: string,
    to: string,
    search: string | undefined,
    limit: number,
    offset: number,
  ) => Promise<{ ids: string[]; total: number }>;
  days: (
    client: PoolClient,
    context: HrActorContext,
    company: string,
    dates: string[],
    employees: string[],
    now: Date,
    today: string,
    raw: boolean,
  ) => Promise<{ on_date: string; row: HrDailyAttendanceRow }[]>;
  override: (client: PoolClient, context: HrActorContext, input: OverrideInput) => Promise<string | null>;
  audit: (
    client: PoolClient,
    context: HrActorContext,
    corr: string,
    id: string,
    before: unknown,
    after: unknown,
  ) => Promise<string>;
};
const otColumns = `o.id,o.reference,o.company_id,o.employee_id,e.employee_number,concat_ws(' ',e.first_name,e.middle_name,e.last_name) as display_name,o.work_date::text,o.category,o.requested_minutes,o.approved_minutes,o.reason,o.status,o.version,o.workflow_managed,o.requested_by,o.submitted_by,o.manager_user_id,o.manager_decided_by,o.hr_decided_by,o.subject_user_ids,o.review_source_hash`;
const periodColumns = `id,company_id,month::text,state,version,opened_by,submitted_by,locked_by,locked_at::text,source_hash,review_hash,employee_count,exception_count,processed_at::text`;
const ruleColumns = `id,category,version_number,effective_from::text,effective_to::text,minimum_minutes,daily_cap_minutes,evidence_hash`;
type SourceDay = {
  employee_id: string;
  on_date: string;
  leaves: { id: string; days: string; paid: boolean }[];
  corrections: { id: string }[];
  overtime: {
    id: string;
    category: "regular" | "weekend" | "holiday";
    minutes: number;
    operational_rule_id: string | null;
  }[];
  pending: string[];
  punches: unknown[];
  placements: unknown[];
  holidays: unknown[];
};
const units = (v: string) => {
  if (!/^\d+(\.\d{1,4})?$/.test(v)) conflict("An exact leave day allocation is required.");
  const [n, f = ""] = v.split(".");
  return Number(n) * 10000 + Number(f.padEnd(4, "0"));
};
const decimal = (n: number) => (n / 10000).toFixed(4);
/** Monetary amounts are intentionally absent. Each day balances in integer ten-thousandths. */
export function closeAttendanceEmployee(
  rows: { on_date: string; row: HrDailyAttendanceRow }[],
  sources: SourceDay[],
): HrAttendanceCloseEmployee {
  if (!rows[0]) throw new Error("Empty attendance employee batch");
  const person = rows[0].row;
  const days: HrAttendanceCloseDay[] = rows.map(({ on_date, row }) => {
    const source = sources.find((s) => s.employee_id === row.employee_id && s.on_date === on_date);
    const issues = [...row.issues, ...(source?.pending ?? []).map((v) => `Pending ${v} must be decided or cancelled.`)];
    if (["needs_review", "scheduled", "in_progress"].includes(row.status))
      issues.push("Attendance must be resolved and the shift completed.");
    const leave = (source?.leaves ?? []).reduce((n, l) => n + units(l.days), 0),
      unpaidLeave = (source?.leaves ?? []).filter((l) => !l.paid).reduce((n, l) => n + units(l.days), 0);
    if (leave > 10000) issues.push("Approved leave allocations overlap.");
    if (row.status === "on_leave" && leave !== 10000)
      issues.push("Partial leave requires a reconciled attendance day before close.");
    if (units(row.leave_days) !== leave) issues.push("Approved leave and exact daily allocations do not reconcile.");
    let paid = 0,
      present = 0,
      absent = 0;
    if (["present", "official_duty", "off_day", "holiday"].includes(row.status)) paid = 10000;
    if (row.status === "present" || row.status === "official_duty") present = 10000;
    if (row.status === "half_day") {
      paid = 5000;
      present = 5000;
      absent = 5000;
    }
    if (row.status === "absent") absent = 10000;
    if (row.status === "on_leave") paid = Math.max(0, Math.min(10000, leave - unpaidLeave));
    if (row.status === "partial_leave") {
      const workedPart = row.worked_minutes > 0 ? 5000 : 0;
      paid = Math.min(10000, Math.max(0, leave - unpaidLeave) + workedPart);
      present = workedPart;
      absent = 10000 - leave - workedPart;
    }
    const overtime = (source?.overtime ?? []).map((o) => ({
      id: o.id,
      category: o.category,
      minutes: o.minutes,
      operational_rule_id: o.operational_rule_id,
    }));
    if (overtime.length > 1) issues.push("Multiple overtime categories or approvals cover this day.");
    if (overtime.some((o) => !o.operational_rule_id))
      issues.push("Approved overtime is missing its operational rule evidence.");
    if (overtime.reduce((n, o) => n + o.minutes, 0) !== row.approved_overtime_minutes)
      issues.push("Approved overtime does not reconcile.");
    return {
      on_date,
      status: row.status,
      shift_id: row.shift_id,
      time_zone: row.time_zone,
      worked_minutes: row.worked_minutes,
      paid_days: decimal(paid),
      unpaid_days: decimal(10000 - paid),
      approved_leave_days: decimal(leave),
      unpaid_leave_days: decimal(unpaidLeave),
      present_days: decimal(present),
      absent_days: decimal(absent),
      correction_ids: (source?.corrections ?? []).map((c) => c.id),
      overtime,
      leave_ids: (source?.leaves ?? []).map((l) => l.id),
      issues: [...new Set(issues)],
    };
  });
  const sum = (
    key: "paid_days" | "unpaid_days" | "approved_leave_days" | "unpaid_leave_days" | "present_days" | "absent_days",
  ) => decimal(days.reduce((n, d) => n + units(d[key]), 0));
  const ot = (category: string) =>
    days.reduce((n, d) => n + d.overtime.filter((o) => o.category === category).reduce((a, o) => a + o.minutes, 0), 0);
  const payload = {
    employee_id: person.employee_id,
    employee_number: person.employee_number,
    display_name: person.display_name,
    calendar_days: decimal(days.length * 10000),
    paid_days: sum("paid_days"),
    unpaid_days: sum("unpaid_days"),
    approved_leave_days: sum("approved_leave_days"),
    unpaid_leave_days: sum("unpaid_leave_days"),
    present_days: sum("present_days"),
    absent_days: sum("absent_days"),
    overtime_regular_minutes: ot("regular"),
    overtime_weekend_minutes: ot("weekend"),
    overtime_holiday_minutes: ot("holiday"),
    correction_count: days.reduce((n, d) => n + d.correction_ids.length, 0),
    exception_count: days.reduce((n, d) => n + d.issues.length, 0),
    days,
  };
  return { ...payload, source_hash: attendanceHash({ payload, sources }) };
}
export class AttendanceCompletion {
  constructor(private readonly d: AttendanceCompletionDependencies) {}
  private require(context: HrActorContext, permission: string) {
    if (!context.actor.permissions.includes(permission)) denied(`Permission ${permission} is required.`);
  }
  private async history(client: PoolClient, context: HrActorContext, type: string, id: string) {
    return (
      await client.query<{
        action: string;
        reason: string;
        actor_name: string;
        occurred_at: string;
        source_hash: string | null;
        override_event_id: string | null;
      }>(
        `select ev.action,ev.reason,coalesce(u.display_name,ev.actor_id) as actor_name,ev.occurred_at::text,ev.source_hash,ev.override_event_id from hr_attendance_completion_event ev left join security_user_account u on u.tenant_id=ev.tenant_id and u.id=ev.actor_id where ev.tenant_id=$1 and ev.resource_type=$2 and ev.resource_id=$3 order by ev.version desc limit 50`,
        [context.tenantId, type, id],
      )
    ).rows;
  }
  private async event(
    client: PoolClient,
    context: HrActorContext,
    type: string,
    id: string,
    version: number,
    action: string,
    reason: string,
    before: unknown,
    after: unknown,
    hash: string | null,
    override: string | null,
  ) {
    await client.query(
      `insert into hr_attendance_completion_event(tenant_id,id,company_id,resource_type,resource_id,version,action,reason,before_snapshot,after_snapshot,source_hash,actor_id,override_event_id) values($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11,$12,$13)`,
      [
        context.tenantId,
        `attendance-event-${randomUUID()}`,
        (after as { company_id: string }).company_id,
        type,
        id,
        version,
        action,
        reason,
        JSON.stringify(before),
        JSON.stringify(after),
        hash,
        context.actor.userId,
        override,
      ],
    );
  }
  async runWrite(
    context: HrActorContext,
    company: string,
    permission: string,
    key: string,
    corr: string,
    path: string,
    input: unknown,
    operation: (client: PoolClient) => Promise<{
      id: string;
      version: number;
      status: string;
      before: unknown;
      after: unknown;
      type: string;
      hash: string | null;
      override: string | null;
      reason: string;
      action: string;
    }>,
    authorize?: (client: PoolClient) => Promise<void>,
  ): Promise<HrAttendanceCompletionResult> {
    if (!authorize) this.require(context, permission);
    if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/.test(key))
      throw new HrApiError(400, "INVALID_IDEMPOTENCY_KEY", "Use a valid idempotency key.");
    const client = await this.d.pool.connect();
    try {
      await client.query("begin");
      await client.query("select set_config('nexora.tenant_id',$1,true)", [context.tenantId]);
      await this.d.company(client, context, company);
      await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
        `nexora:hr:attendance:${context.tenantId}:${company}`,
      ]);
      if (authorize) await authorize(client);
      const hash = attendanceHash(input),
        prior = (
          await client.query<{ request_fingerprint: string; response_body: HrAttendanceCompletionResult }>(
            `select request_fingerprint,response_body from platform_admin_idempotency where tenant_id=$1 and actor_id=$2 and method='POST' and path=$3 and idempotency_key=$4`,
            [context.tenantId, context.actor.userId, path, key],
          )
        ).rows[0];
      if (prior) {
        if (prior.request_fingerprint !== hash) conflict("This idempotency key belongs to a different request.");
        await client.query("commit");
        return { ...prior.response_body, replayed: true };
      }
      const change = await operation(client);
      await this.event(
        client,
        context,
        change.type,
        change.id,
        change.version,
        change.action,
        change.reason,
        change.before,
        change.after,
        change.hash,
        change.override,
      );
      const audit = await this.d.audit(client, context, corr, change.id, change.before, change.after);
      const result = {
        id: change.id,
        company_id: company,
        version: change.version,
        status: change.status,
        audit_event_id: audit,
        replayed: false,
      };
      await client.query(
        `insert into platform_admin_idempotency(tenant_id,actor_id,method,path,idempotency_key,request_fingerprint,response_status,response_body,response_etag) values($1,$2,'POST',$3,$4,$5,200,$6,$7)`,
        [context.tenantId, context.actor.userId, path, key, hash, result, attendanceHash(result)],
      );
      await client.query("commit");
      return result;
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      if (error instanceof HrApiError) throw error;
      const code = (error as { code?: string }).code;
      if (["23505", "23514", "23P01", "P0001"].includes(code ?? ""))
        conflict(
          "The record conflicts with protected history, a locked period, an overlapping rule or another active request. Refresh and review.",
        );
      throw error;
    } finally {
      client.release();
    }
  }
  private async decision(client: PoolClient, context: HrActorContext, input: OverrideInput, confirmed: boolean) {
    const policy = evaluateApprovalActor({
      account: context.actor,
      normalDecisionPermission: input.normalDecisionPermission,
      makerActorIds: input.makerActorIds,
      impersonated: Boolean(
        context.impersonationRequestId || (context.realActorId && context.realActorId !== context.actor.userId),
      ),
    });
    if (policy.kind === "forbidden") denied("A different authorized approver must decide this record.");
    if (policy.kind === "override" && !confirmed)
      denied("Explicit super-administrator self-approval acknowledgement is required.");
    return this.d.override(client, context, input);
  }
  private async rules(client: PoolClient, context: HrActorContext, company: string, date: string) {
    return (
      await client.query<HrOvertimeRule>(
        `select ${ruleColumns} from hr_overtime_rule where tenant_id=$1 and company_id=$2 and status='active' and effective_from<=$3::date and (effective_to is null or effective_to>=$3::date) order by category,version_number`,
        [context.tenantId, company, date],
      )
    ).rows;
  }
  private async evidence(
    client: PoolClient,
    context: HrActorContext,
    company: string,
    employee: string,
    date: string,
  ): Promise<HrOvertimeEvidence> {
    const attendance = await this.d.evidence(client, context, company, employee, date);
    const blockers = attendance.blockers.filter((b) => !b.includes("approved correction already exists"));
    blockers.push(...attendance.day.issues);
    if (!attendance.day.scheduled_end || Date.parse(attendance.day.scheduled_end) > Date.now())
      blockers.push("Complete the shift before requesting overtime.");
    const category: HrOvertimeEvidence["category"] =
      attendance.day.status === "holiday" ? "holiday" : attendance.day.status === "off_day" ? "weekend" : "regular";
    const rule = (await this.rules(client, context, company, date)).find((r) => r.category === category) ?? null;
    if (!rule || !rule.evidence_hash)
      blockers.push("An evidenced operational overtime rule is required for this category and date.");
    const potential =
      category === "regular" ? attendance.day.potential_overtime_minutes : attendance.day.worked_minutes;
    const eligible = rule && potential >= rule.minimum_minutes ? Math.min(potential, rule.daily_cap_minutes) : 0;
    if (eligible < 1) blockers.push("No overtime minutes are eligible under the effective shift and operational rule.");
    const normalized = { ...attendance, hash: "", day: { ...attendance.day, approved_overtime_minutes: 0 } };
    const value = {
      attendance: normalized,
      category,
      eligible_minutes: eligible,
      rule,
      blockers: [...new Set(blockers)],
    };
    return { ...value, hash: attendanceHash(value) };
  }
  private publicEvidence(context: HrActorContext, e: HrOvertimeEvidence) {
    return context.actor.permissions.includes("hr.attendance.punch.read")
      ? e
      : { ...e, attendance: { ...e.attendance, day: { ...e.attendance.day, punches: null } } };
  }
  async overtimeContext(context: HrActorContext, q: HrOvertimeContextQuery): Promise<HrOvertimeContext> {
    return this.d.read(context, "hr.attendance.overtime.read", async (client) => {
      await this.d.company(client, context, q.company_id);
      const selection = await this.d.employees(client, context, q.company_id, q.on_date, q.on_date, q.search, 100, 0);
      const employees = (
        await client.query<{ id: string; code: string; name: string }>(
          `select id,employee_number as code,concat_ws(' ',first_name,middle_name,last_name) as name from employee where tenant_id=$1 and id=any($2::text[]) order by employee_number,id`,
          [context.tenantId, selection.ids],
        )
      ).rows;
      const evidence = q.employee_id
        ? await this.evidence(client, context, q.company_id, q.employee_id, q.on_date)
        : null;
      return {
        employees,
        employees_capped: selection.total > 100,
        rules: await this.rules(client, context, q.company_id, q.on_date),
        evidence: evidence ? this.publicEvidence(context, evidence) : null,
        can_manage_rules: context.actor.permissions.includes("hr.attendance.overtime_rule.manage"),
      };
    });
  }
  async listOvertime(context: HrActorContext, q: HrOvertimeQuery): Promise<HrOvertimeDirectory> {
    return this.d.read(context, "hr.attendance.overtime.read", async (client) => {
      await this.d.company(client, context, q.company_id);
      const values = [
        context.tenantId,
        q.company_id,
        q.month,
        q.search ? `%${q.search.replace(/[\\%_]/g, "\\$&")}%` : null,
      ];
      const where = `o.tenant_id=$1 and o.company_id=$2 and o.work_date>=$3::date and o.work_date<($3::date+interval '1 month') and ($4::text is null or e.employee_number ilike $4 escape '\\' or concat_ws(' ',e.first_name,e.middle_name,e.last_name) ilike $4 escape '\\' or o.reference ilike $4 escape '\\')`;
      const from = `from hr_overtime_request o join employee e on e.tenant_id=o.tenant_id and e.id=o.employee_id`;
      return {
        items: (
          await client.query<HrOvertimeSummary>(
            `select ${otColumns} ${from} where ${where} order by o.work_date desc,o.id limit $5 offset $6`,
            [...values, q.limit, q.offset],
          )
        ).rows,
        total: (await client.query<{ total: number }>(`select count(*)::int as total ${from} where ${where}`, values))
          .rows[0]!.total,
      };
    });
  }
  private async overtimeRow(client: PoolClient, context: HrActorContext, company: string, id: string) {
    const row = (
      await client.query<HrOvertimeSummary>(
        `select ${otColumns} from hr_overtime_request o join employee e on e.tenant_id=o.tenant_id and e.id=o.employee_id where o.tenant_id=$1 and o.company_id=$2 and o.id=$3`,
        [context.tenantId, company, id],
      )
    ).rows[0];
    if (!row)
      throw new HrApiError(404, "HR_OVERTIME_NOT_FOUND", "The overtime request is unavailable in your company scope.");
    return row;
  }
  private actions(context: HrActorContext, row: HrOvertimeSummary, evidence: HrOvertimeEvidence | null) {
    const actions: HrOvertimeActionRequest["action"][] = [];
    const makers = [
      row.requested_by,
      row.submitted_by ?? "",
      ...row.subject_user_ids,
      ...(evidence?.attendance.subject_user_ids ?? []),
      ...(row.status === "pending_hr" ? [row.manager_decided_by ?? ""] : []),
    ];
    if (row.workflow_managed && !evidence?.attendance.period_locked) {
      if (
        row.requested_by === context.actor.userId &&
        ["draft", "pending_manager", "pending_hr"].includes(row.status) &&
        context.actor.permissions.includes("hr.attendance.overtime.cancel")
      )
        actions.push("cancel");
      if (
        row.requested_by === context.actor.userId &&
        row.status === "draft" &&
        evidence &&
        !evidence.blockers.length &&
        evidence.attendance.manager_user_id &&
        context.actor.permissions.includes("hr.attendance.overtime.submit")
      )
        actions.push("submit");
      if (
        (row.status === "pending_manager" && row.manager_user_id === context.actor.userId) ||
        row.status === "pending_hr"
      )
        for (const decision of ["approve", "reject"] as const) {
          const action = `${row.status === "pending_manager" ? "manager" : "hr"}_${decision}` as const;
          const policy = evaluateApprovalActor({
            account: context.actor,
            normalDecisionPermission: `hr.attendance.overtime.${action}`,
            makerActorIds: makers,
            impersonated: Boolean(
              context.impersonationRequestId || (context.realActorId && context.realActorId !== context.actor.userId),
            ),
          });
          if (
            policy.kind !== "forbidden" &&
            (decision === "reject" ||
              (evidence && !evidence.blockers.length && evidence.attendance.manager_user_id === row.manager_user_id))
          )
            actions.push(action);
        }
    }
    return { allowed_actions: actions, self_decision_requires_override: makers.includes(context.actor.userId) };
  }
  async getOvertime(context: HrActorContext, company: string, id: string): Promise<HrOvertimeDetail> {
    return this.d.read(context, "hr.attendance.overtime.read", async (client) => {
      await this.d.company(client, context, company);
      const row = await this.overtimeRow(client, context, company, id);
      let evidence: HrOvertimeEvidence | null = null,
        unavailable: string | null = null;
      try {
        evidence = await this.evidence(client, context, company, row.employee_id, row.work_date);
      } catch (error) {
        if (error instanceof HrApiError && error.status === 409) unavailable = error.message;
        else throw error;
      }
      return {
        ...row,
        evidence: evidence ? this.publicEvidence(context, evidence) : null,
        evidence_unavailable: unavailable,
        ...this.actions(context, row, evidence),
        history: await this.history(client, context, "overtime", id),
      };
    });
  }
  async createOvertimeRule(context: HrActorContext, input: HrOvertimeRuleRequest, key: string, corr: string) {
    return this.runWrite(
      context,
      input.company_id,
      "hr.attendance.overtime_rule.manage",
      key,
      corr,
      "/api/v1/hr/attendance_overtime_rules",
      input,
      async (client) => {
        const id = `ot-rule-${randomUUID()}`,
          hash = attendanceHash(input);
        const version = (
          await client.query<{ version: number }>(
            `select coalesce(max(version_number),0)::int+1 as version from hr_overtime_rule where tenant_id=$1 and company_id=$2 and category=$3`,
            [context.tenantId, input.company_id, input.category],
          )
        ).rows[0]!.version;
        const locked = (
          await client.query(
            `select 1 from hr_attendance_period where tenant_id=$1 and company_id=$2 and state='locked' and daterange(month,(month+interval '1 month')::date,'[)') && daterange($3::date,coalesce($4::date,'infinity'::date),'[]')`,
            [context.tenantId, input.company_id, input.effective_from, input.effective_to],
          )
        ).rowCount;
        if (locked) conflict("A new operational rule cannot cover locked attendance.");
        const previous =
          (
            await client.query<HrOvertimeRule>(
              `select ${ruleColumns} from hr_overtime_rule where tenant_id=$1 and company_id=$2 and category=$3 and status='active' and effective_to is null and effective_from<$4::date for update`,
              [context.tenantId, input.company_id, input.category, input.effective_from],
            )
          ).rows[0] ?? null;
        if (previous)
          await client.query(
            `update hr_overtime_rule set effective_to=$3::date-1,updated_at=now() where tenant_id=$1 and id=$2`,
            [context.tenantId, previous.id, input.effective_from],
          );
        await client.query(
          `insert into hr_overtime_rule(tenant_id,id,company_id,category,multiplier,minimum_minutes,daily_cap_minutes,created_by,version_number,effective_from,effective_to,evidence_hash) values($1,$2,$3,$4,1,$5,$6,$7,$8,$9,$10,$11)`,
          [
            context.tenantId,
            id,
            input.company_id,
            input.category,
            input.minimum_minutes,
            input.daily_cap_minutes,
            context.actor.userId,
            version,
            input.effective_from,
            input.effective_to,
            hash,
          ],
        );
        return {
          id,
          version,
          status: "active",
          before: previous,
          after: { ...input, id, version, predecessor_id: previous?.id ?? null },
          type: "overtime_rule",
          hash,
          override: null,
          reason: input.reason,
          action: "create",
        };
      },
    );
  }
  async createOvertime(context: HrActorContext, input: CreateHrOvertimeRequest, key: string, corr: string) {
    this.require(context, "hr.attendance.overtime.read");
    return this.runWrite(
      context,
      input.company_id,
      "hr.attendance.overtime.create",
      key,
      corr,
      "/api/v1/hr/attendance_overtime",
      input,
      async (client) => {
        const evidence = await this.evidence(client, context, input.company_id, input.employee_id, input.work_date);
        this.validateEvidence(evidence, input.expected_evidence_hash, input.requested_minutes);
        const id = `overtime-${randomUUID()}`;
        await client.query(
          `insert into hr_overtime_request(tenant_id,id,company_id,employee_id,work_date,category,requested_minutes,reason,requested_by,operational_rule_id,operational_rule_evidence_hash,workflow_managed,review_source_hash) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,true,$12)`,
          [
            context.tenantId,
            id,
            input.company_id,
            input.employee_id,
            input.work_date,
            evidence.category,
            input.requested_minutes,
            input.reason,
            context.actor.userId,
            evidence.rule!.id,
            evidence.rule!.evidence_hash,
            evidence.hash,
          ],
        );
        const after = await this.overtimeRow(client, context, input.company_id, id);
        return {
          id,
          version: 1,
          status: "draft",
          before: null,
          after,
          type: "overtime",
          hash: evidence.hash,
          override: null,
          reason: input.reason,
          action: "create",
        };
      },
    );
  }
  private validateEvidence(evidence: HrOvertimeEvidence, expected: string | undefined, minutes: number) {
    if (evidence.blockers.length) conflict(evidence.blockers.join(" "));
    if (expected !== evidence.hash) conflict("Attendance evidence changed. Refresh and review before continuing.");
    if (minutes > evidence.eligible_minutes || minutes < (evidence.rule?.minimum_minutes ?? 1))
      conflict("Requested/approved minutes exceed the evidenced overtime or fall below the operational minimum.");
  }
  async actOnOvertime(context: HrActorContext, id: string, input: HrOvertimeActionRequest, key: string, corr: string) {
    if (input.approved_minutes !== undefined && input.action !== "hr_approve")
      throw new HrApiError(
        400,
        "HR_OVERTIME_FINAL_MINUTES_ONLY",
        "Only the final HR approval sets approved minutes. The manager reviews the requested minutes.",
      );
    this.require(context, "hr.attendance.overtime.read");
    return this.runWrite(
      context,
      input.company_id,
      `hr.attendance.overtime.${input.action}`,
      key,
      corr,
      `/api/v1/hr/attendance_overtime/${id}/actions`,
      input,
      async (client) => {
        await client.query(
          "select id from hr_overtime_request where tenant_id=$1 and company_id=$2 and id=$3 for update",
          [context.tenantId, input.company_id, id],
        );
        const before = await this.overtimeRow(client, context, input.company_id, id);
        if (before.version !== input.expected_version) conflict("This overtime request changed. Refresh its version.");
        let evidence: HrOvertimeEvidence | null = null;
        try {
          evidence = await this.evidence(client, context, input.company_id, before.employee_id, before.work_date);
        } catch (error) {
          if (!(error instanceof HrApiError && error.status === 409)) throw error;
        }
        if (!this.actions(context, before, evidence).allowed_actions.includes(input.action))
          denied("This action is unavailable for the request, reporting route or period state.");
        const approving = input.action.endsWith("_approve"),
          submitting = input.action === "submit";
        const minutes = input.approved_minutes ?? before.requested_minutes;
        if (approving || submitting) {
          if (!evidence) conflict("Attendance evidence is unavailable.");
          this.validateEvidence(
            evidence!,
            input.expected_evidence_hash,
            submitting ? before.requested_minutes : minutes,
          );
          if (
            evidence!.category !== before.category ||
            evidence!.rule?.id !==
              (
                await client.query<{ operational_rule_id: string }>(
                  "select operational_rule_id from hr_overtime_request where tenant_id=$1 and id=$2",
                  [context.tenantId, id],
                )
              ).rows[0]!.operational_rule_id
          )
            conflict("The category/rule changed; cancel this request and create a replacement.");
          if (minutes > before.requested_minutes) conflict("Approval cannot exceed the requested minutes.");
        }
        let override: string | null = null;
        const action = input.action;
        const status =
          action === "submit"
            ? "pending_manager"
            : action === "cancel"
              ? "cancelled"
              : action.endsWith("_reject")
                ? "rejected"
                : action === "manager_approve"
                  ? "pending_hr"
                  : "approved";
        if (action === "submit")
          await client.query(
            `update hr_overtime_request set status=$3,submitted_by=$4,manager_user_id=$5,subject_user_ids=$6,review_source_hash=$7,version=version+1 where tenant_id=$1 and id=$2`,
            [
              context.tenantId,
              id,
              status,
              context.actor.userId,
              evidence!.attendance.manager_user_id,
              evidence!.attendance.subject_user_ids,
              evidence!.hash,
            ],
          );
        else if (action === "cancel")
          await client.query(
            "update hr_overtime_request set status=$3,version=version+1,decision_comment=$4 where tenant_id=$1 and id=$2",
            [context.tenantId, id, status, input.reason],
          );
        else {
          const makers = [
            before.requested_by,
            before.submitted_by ?? "",
            ...before.subject_user_ids,
            ...(evidence?.attendance.subject_user_ids ?? []),
            ...(action.startsWith("hr_") ? [before.manager_decided_by ?? ""] : []),
          ];
          override = await this.decision(
            client,
            context,
            {
              normalDecisionPermission: `hr.attendance.overtime.${action}`,
              makerActorIds: makers,
              resourceType: "hr_overtime_request",
              resourceId: id,
              decisionAction: approving ? "approve" : "reject",
              reason: input.reason,
              correlationId: corr,
              idempotencyKey: key,
            },
            input.override_self_approval,
          );
          const stage = action.startsWith("manager_") ? "manager" : "hr";
          await client.query(
            `update hr_overtime_request set status=$3,${stage}_decided_by=$4,${stage}_decided_at=now(),${stage}_override_event_id=$5,approved_minutes=$6,decision_comment=$7,review_source_hash=coalesce($8,review_source_hash),version=version+1 where tenant_id=$1 and id=$2`,
            [
              context.tenantId,
              id,
              status,
              context.actor.userId,
              override,
              status === "approved" ? minutes : null,
              input.reason,
              evidence?.hash ?? null,
            ],
          );
        }
        const after = await this.overtimeRow(client, context, input.company_id, id);
        return {
          id,
          version: after.version,
          status,
          before,
          after,
          type: "overtime",
          hash: evidence?.hash ?? null,
          override,
          reason: input.reason,
          action,
        };
      },
    );
  }
  private async period(client: PoolClient, context: HrActorContext, company: string, month: string) {
    return (
      (
        await client.query<HrAttendancePeriod & { close_run_id: string | null; workflow_managed: boolean }>(
          `select ${periodColumns},close_run_id,workflow_managed from hr_attendance_period where tenant_id=$1 and company_id=$2 and month=$3`,
          [context.tenantId, company, month],
        )
      ).rows[0] ?? null
    );
  }
  private periodPublic(p: Awaited<ReturnType<AttendanceCompletion["period"]>>): HrAttendancePeriod | null {
    if (!p) return null;
    const { close_run_id: _run, workflow_managed: _managed, ...rest } = p;
    void _run;
    void _managed;
    return rest;
  }
  private periodActions(context: HrActorContext, p: Awaited<ReturnType<AttendanceCompletion["period"]>>) {
    const actions: ("open" | "process" | "lock")[] = [];
    const self = !!p && [p.opened_by, p.submitted_by].includes(context.actor.userId);
    if (!p) {
      if (context.actor.permissions.includes("hr.attendance.period.manage")) actions.push("open");
    } else if (p.workflow_managed && p.state !== "locked") {
      if (context.actor.permissions.includes("hr.attendance.period.manage")) actions.push("process");
      if (p.state === "hr_review" && p.exception_count === 0 && p.employee_count > 0) {
        const policy = evaluateApprovalActor({
          account: context.actor,
          normalDecisionPermission: "hr.attendance.period.lock",
          makerActorIds: [p.opened_by, p.submitted_by ?? ""],
          impersonated: Boolean(
            context.impersonationRequestId || (context.realActorId && context.realActorId !== context.actor.userId),
          ),
        });
        if (policy.kind !== "forbidden") actions.push("lock");
      }
    }
    return { allowed_actions: actions, self_decision_requires_override: self };
  }
  async periodWorkspace(context: HrActorContext, q: HrAttendancePeriodQuery): Promise<HrAttendancePeriodWorkspace> {
    return this.d.read(context, "hr.attendance.period.read", async (client) => {
      await this.d.company(client, context, q.company_id);
      const p = await this.period(client, context, q.company_id, q.month);
      const items = p?.close_run_id
        ? (
            await client.query<{ payload: HrAttendanceCloseEmployee }>(
              `select payload from hr_attendance_close_employee where tenant_id=$1 and period_id=$2 and run_id=$3 order by employee_number collate "C",employee_id collate "C" limit $4 offset $5`,
              [context.tenantId, p.id, p.close_run_id, q.limit, q.offset],
            )
          ).rows.map((r) => r.payload)
        : [];
      return {
        period: this.periodPublic(p),
        items,
        total: p?.employee_count ?? 0,
        ...this.periodActions(context, p),
        history: p ? await this.history(client, context, "period", p.id) : [],
      };
    });
  }
  async payrollInputs(context: HrActorContext, q: HrAttendancePeriodQuery): Promise<HrAttendancePayrollInputs> {
    return this.d.read(context, "hr.attendance.payroll_input.read", async (client) => {
      await this.d.company(client, context, q.company_id);
      const p = await this.period(client, context, q.company_id, q.month);
      const items =
        p?.state === "locked"
          ? (
              await client.query<{ completion_payload: HrAttendanceCloseEmployee | null }>(
                `select i.completion_payload from hr_payroll_input i join employee e on e.tenant_id=i.tenant_id and e.id=i.employee_id where i.tenant_id=$1 and i.company_id=$2 and i.period_id=$3 order by e.employee_number collate "C",e.id collate "C" limit $4 offset $5`,
                [context.tenantId, q.company_id, p.id, q.limit, q.offset],
              )
            ).rows.flatMap((r) => (r.completion_payload ? [r.completion_payload] : []))
          : [];
      const total =
        p?.state === "locked"
          ? (
              await client.query<{ total: number }>(
                "select count(*)::int as total from hr_payroll_input where tenant_id=$1 and company_id=$2 and period_id=$3 and completion_payload is not null",
                [context.tenantId, q.company_id, p.id],
              )
            ).rows[0]!.total
          : 0;
      return { period: this.periodPublic(p), items, total, locked: p?.state === "locked" };
    });
  }
  private async sources(
    client: PoolClient,
    context: HrActorContext,
    company: string,
    dates: string[],
    ids: string[],
  ): Promise<SourceDay[]> {
    return (
      await client.query<SourceDay>(
        `select e.id as employee_id,d.on_date::text,
 coalesce((select jsonb_agg(jsonb_build_object('id',l.request_id,'days',l.days::text,'paid',coalesce(l.paid_snapshot,t.paid)) order by l.request_id) from hr_leave_request_day l join hr_leave_request r on r.tenant_id=l.tenant_id and r.id=l.request_id and r.status='approved' join hr_leave_type t on t.tenant_id=l.tenant_id and t.id=l.leave_type_id where l.tenant_id=$1 and l.company_id=$2 and l.employee_id=e.id and l.leave_date=d.on_date),'[]') as leaves,
 coalesce((select jsonb_agg(to_jsonb(c) order by c.id) from hr_attendance_correction c where c.tenant_id=$1 and c.company_id=$2 and c.employee_id=e.id and c.work_date=d.on_date and c.status='approved'),'[]') as corrections,
 coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'category',o.category,'minutes',o.approved_minutes,'operational_rule_id',o.operational_rule_id) order by o.id) from hr_overtime_request o where o.tenant_id=$1 and o.company_id=$2 and o.employee_id=e.id and o.work_date=d.on_date and o.status='approved'),'[]') as overtime,
 coalesce((select jsonb_agg(x.kind order by x.kind) from (select 'correction' as kind from hr_attendance_correction c where c.tenant_id=$1 and c.company_id=$2 and c.employee_id=e.id and c.work_date=d.on_date and c.status in ('draft','pending_manager','pending_hr') union all select 'overtime' from hr_overtime_request o where o.tenant_id=$1 and o.company_id=$2 and o.employee_id=e.id and o.work_date=d.on_date and o.status in ('draft','pending_manager','pending_hr') union all select 'leave' from hr_leave_request l where l.tenant_id=$1 and l.company_id=$2 and l.employee_id=e.id and d.on_date between l.from_date and l.to_date and l.status in ('draft','pending_manager','pending_hr')) x),'[]') as pending,
 coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'direction',p.direction,'at',p.occurred_at) order by p.occurred_at,p.id) from hr_attendance_punch p where p.tenant_id=$1 and p.company_id=$2 and p.employee_id=e.id and p.work_date=d.on_date),'[]') as punches,
 coalesce((select jsonb_agg(to_jsonb(a) order by a.id) from employee_assignment a where a.tenant_id=$1 and a.company_id=$2 and a.employee_id=e.id and a.effective_from<=d.on_date and (a.effective_to is null or a.effective_to>=d.on_date)),'[]') as placements,
 coalesce((select jsonb_agg(to_jsonb(h) order by h.id) from hr_holiday h where h.tenant_id=$1 and h.company_id=$2 and h.holiday_date=d.on_date and h.status='active'),'[]') as holidays
 from employee e cross join unnest($3::date[]) d(on_date) where e.tenant_id=$1 and e.id=any($4::text[]) order by e.id,d.on_date`,
        [context.tenantId, company, dates, ids],
      )
    ).rows;
  }
  private async process(
    client: PoolClient,
    context: HrActorContext,
    company: string,
    month: string,
    periodId: string,
    persist: boolean,
  ) {
    const meta = (
      await client.query<{ today: string; now: Date; ended: boolean }>(
        `select current_date::text as today,now() as now,($1::date+interval '1 month')::date<current_date as ended`,
        [month],
      )
    ).rows[0]!;
    if (!meta.ended)
      conflict("Only a completed month can be processed and locked. Wait until all overnight shifts have finished.");
    const dates = (
      await client.query<{ date: string }>(
        `select d::date::text as date from generate_series($1::date,($1::date+interval '1 month - 1 day')::date,interval '1 day') d`,
        [month],
      )
    ).rows.map((r) => r.date);
    const run = `attendance-run-${randomUUID()}`,
      hash = createHash("sha256");
    let count = 0,
      exceptions = 0,
      offset = 0,
      total = 0;
    do {
      const selected = await this.d.employees(client, context, company, month, dates.at(-1)!, undefined, 25, offset);
      total = selected.total;
      if (!selected.ids.length) break;
      const days = await this.d.days(client, context, company, dates, selected.ids, meta.now, meta.today, false),
        sources = await this.sources(client, context, company, dates, selected.ids);
      for (const id of selected.ids) {
        const own = days.filter((d) => d.row.employee_id === id).sort((a, b) => a.on_date.localeCompare(b.on_date));
        if (!own.length) conflict("An operational employee has no attendance coverage in this period.");
        const payload = closeAttendanceEmployee(
          own,
          sources.filter((s) => s.employee_id === id && own.some((d) => d.on_date === s.on_date)),
        );
        count++;
        exceptions += payload.exception_count;
        hash.update(payload.employee_id + ":" + payload.source_hash + "\n");
        if (persist)
          await client.query(
            `insert into hr_attendance_close_employee(tenant_id,id,company_id,period_id,run_id,employee_id,employee_number,payload,source_hash) values($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9)`,
            [
              context.tenantId,
              `attendance-close-${randomUUID()}`,
              company,
              periodId,
              run,
              id,
              payload.employee_number,
              JSON.stringify(payload),
              payload.source_hash,
            ],
          );
      }
      offset += selected.ids.length;
    } while (offset < total);
    if (count < 1) conflict("No operational employees are covered by this month.");
    return { run, hash: hash.digest("hex"), count, exceptions };
  }
  async actOnPeriod(context: HrActorContext, input: HrAttendancePeriodActionRequest, key: string, corr: string) {
    this.require(context, "hr.attendance.period.read");
    return this.runWrite(
      context,
      input.company_id,
      input.action === "lock" ? "hr.attendance.period.lock" : "hr.attendance.period.manage",
      key,
      corr,
      "/api/v1/hr/attendance_periods/actions",
      input,
      async (client) => {
        await client.query(
          "select id from hr_attendance_period where tenant_id=$1 and company_id=$2 and month=$3 for update",
          [context.tenantId, input.company_id, input.month],
        );
        const before = await this.period(client, context, input.company_id, input.month);
        if ((before?.version ?? 0) !== input.expected_version)
          conflict("The period changed. Refresh before continuing.");
        if (!this.periodActions(context, before).allowed_actions.includes(input.action))
          denied("This period action is unavailable in the current state.");
        const id = before?.id ?? `attendance-period-${randomUUID()}`;
        let override: string | null = null;
        if (input.action === "open")
          await client.query(
            `insert into hr_attendance_period(tenant_id,id,company_id,month,opened_by,workflow_managed) values($1,$2,$3,$4,$5,true)`,
            [context.tenantId, id, input.company_id, input.month, context.actor.userId],
          );
        else if (input.action === "process") {
          const processed = await this.process(client, context, input.company_id, input.month, id, true);
          await client.query(
            `update hr_attendance_period set state=$3,review_hash=$4,close_run_id=$5,employee_count=$6,exception_count=$7,processed_at=now(),submitted_by=$8,submitted_at=now(),version=version+1 where tenant_id=$1 and id=$2`,
            [
              context.tenantId,
              id,
              processed.exceptions ? "exceptions" : "hr_review",
              processed.hash,
              processed.run,
              processed.count,
              processed.exceptions,
              context.actor.userId,
            ],
          );
        } else {
          if (!before) throw new HrApiError(409, "HR_PERIOD_REQUIRED", "Open and process the attendance period first.");
          if (!before.review_hash || input.expected_source_hash !== before.review_hash)
            conflict("Review the latest prepared source hash before locking.");
          const current = await this.process(client, context, input.company_id, input.month, id, false);
          if (current.hash !== before.review_hash || current.exceptions || current.count !== before.employee_count)
            conflict(
              "Attendance sources changed or have exceptions. Reprocess the period and review it before locking.",
            );
          override = await this.decision(
            client,
            context,
            {
              normalDecisionPermission: "hr.attendance.period.lock",
              makerActorIds: [before.opened_by, before.submitted_by ?? ""],
              resourceType: "hr_attendance_period",
              resourceId: id,
              decisionAction: "approve",
              reason: input.reason,
              correlationId: corr,
              idempotencyKey: key,
            },
            input.override_self_approval,
          );
          await client.query(
            `insert into hr_payroll_input(tenant_id,id,company_id,period_id,employee_id,calendar_days,paid_days,unpaid_days,approved_leave_days,unpaid_leave_days,overtime_regular_minutes,overtime_weekend_minutes,overtime_holiday_minutes,correction_count,source_hash,present_days,absent_days,evidence_version,source_snapshot_json,completion_payload)
    select tenant_id,'payroll-input-'||gen_random_uuid()::text,company_id,period_id,employee_id,(payload->>'calendar_days')::numeric,(payload->>'paid_days')::numeric,(payload->>'unpaid_days')::numeric,(payload->>'approved_leave_days')::numeric,(payload->>'unpaid_leave_days')::numeric,(payload->>'overtime_regular_minutes')::int,(payload->>'overtime_weekend_minutes')::int,(payload->>'overtime_holiday_minutes')::int,(payload->>'correction_count')::int,source_hash,(payload->>'present_days')::numeric,(payload->>'absent_days')::numeric,'attendance_close_v5',payload->'days',payload from hr_attendance_close_employee where tenant_id=$1 and period_id=$2 and run_id=$3`,
            [context.tenantId, id, before.close_run_id],
          );
          await client.query(
            `update hr_attendance_period set state='locked',locked_by=$3,locked_at=now(),source_hash=review_hash,lock_override_event_id=$4,version=version+1 where tenant_id=$1 and id=$2`,
            [context.tenantId, id, context.actor.userId, override],
          );
        }
        const after = await this.period(client, context, input.company_id, input.month);
        return {
          id,
          version: after!.version,
          status: after!.state,
          before: this.periodPublic(before),
          after: this.periodPublic(after),
          type: "period",
          hash: after!.review_hash,
          override,
          reason: input.reason,
          action: input.action,
        };
      },
    );
  }
}
