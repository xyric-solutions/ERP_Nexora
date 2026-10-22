import {
  loanRecoveries,
  recordedLoanRecoveries,
  sameLoanRecoveries,
  loanRecoveryBlockers,
  loanRecoveryLine,
  consumeLoanRecoveries,
} from "./payroll-loans.js";
import {
  executePublishedStatutory,
  persistStatutorySnapshot,
  type StatutoryExecutionMode,
} from "./payroll-statutory.js";
import { calculatePublishedOvertime, persistPayrollOvertime } from "./payroll-overtime.js";
import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { evaluateApprovalActor } from "@nexora/auth";
import {
  hrAttendanceCloseEmployeeSchema,
  type HrPayrollRunQuery,
  type HrPayrollRunAction,
  type HrPayrollRunWorkspace,
} from "@nexora/contracts";
import { attendanceHash, type AttendanceCompletionDependencies } from "./attendance-completion.js";
import { payrollUnits, PayrollWorkspace } from "./payroll-workspace.js";
import {
  ExactPayrollAmount,
  calculateMonthlyPayroll,
  PayrollCalculationError,
  type PayrollCalculationSalary,
} from "./payroll-calculation.js";
import { requireHrCompanyPermission } from "./company-authority.js";
import { HrApiError, type HrActorContext } from "./source-repository.js";
type Dependencies = Pick<AttendanceCompletionDependencies, "pool" | "read" | "company" | "override" | "audit"> & {
  statutoryMode?: StatutoryExecutionMode;
};
type Row = Record<string, unknown>;
const conflict = (message: string): never => {
  throw new HrApiError(409, "HR_PAYROLL_RUN_REVIEW_REQUIRED", message);
};
const denied = (message = "The required Payroll execution permission is missing."): never => {
  throw new HrApiError(403, "PERMISSION_DENIED", message);
};
const has = (c: HrActorContext, p: string) => c.actor.permissions.includes(p);
const string = (r: Row, k: string) => (r[k] == null ? null : String(r[k]));
export class PayrollRuns {
  private readonly writes: PayrollWorkspace;
  constructor(private readonly d: Dependencies) {
    this.writes = new PayrollWorkspace(d);
  }

  private async adjustments(client: PoolClient, c: HrActorContext, q: HrPayrollRunQuery, lock = false) {
    return (
      await client.query(
        `select a.id,a.employee_id,a.component_id,a.amount::text,a.version,a.state,a.created_by,a.approved_by,a.approved_at::text,a.effective_month::text,c.code,c.name,c.kind,c.status as component_status,c.expense_account_id,c.liability_account_id from hr_payroll_adjustment a join hr_pay_component c on c.tenant_id=a.tenant_id and c.company_id=a.company_id and c.id=a.component_id where a.tenant_id=$1 and a.company_id=$2 and a.effective_month=$3::date and a.state='approved' order by a.id collate "C" limit 1001${lock ? " for update of a" : ""}`,
        [c.tenantId, q.company_id, q.month],
      )
    ).rows;
  }
  private async recordedAdjustments(client: PoolClient, c: HrActorContext, q: HrPayrollRunQuery, p: Row) {
    const rows = (
      await client.query(
        `select id,employee_id,execution_evidence->'adjustments' as adjustments from hr_payroll_result where tenant_id=$1 and company_id=$2 and period_id=$3 and run_number=$4 order by employee_id collate "C",id collate "C"`,
        [c.tenantId, q.company_id, p.id, p.run_number],
      )
    ).rows;
    return rows.flatMap((r) =>
      (Array.isArray(r.adjustments) ? r.adjustments : []).map((a: Row) => ({ ...a, result_id: r.id })),
    );
  }
  private sameAdjustments(recorded: Row[], current: Row[]) {
    const clean = (rows: Row[]) =>
      rows
        .map((row) => {
          const value = { ...row };
          delete value.result_id;
          return value;
        })
        .sort((a, b) => String(a.id).localeCompare(String(b.id)));
    return attendanceHash(clean(recorded)) === attendanceHash(clean(current));
  }
  private async state(client: PoolClient, c: HrActorContext, q: HrPayrollRunQuery) {
    const scope = [c.tenantId, q.company_id, q.month];
    const period = (
      await client.query(
        `select p.*,p.month::text as month,pol.currency_code,pol.money_scale,pol.rounding_mode from hr_payroll_period p join hr_payroll_policy pol on pol.tenant_id=p.tenant_id and pol.company_id=p.company_id and pol.id=p.policy_id where p.tenant_id=$1 and p.company_id=$2 and p.month=$3::date`,
        scope,
      )
    ).rows[0] as Row | undefined;
    const attendance = (
      await client.query(
        `select p.id,p.state,p.source_hash,count(i.id)::int as input_count,coalesce(array_agg(distinct i.evidence_version) filter(where i.id is not null),'{}') as evidence_versions from hr_attendance_period p left join hr_payroll_input i on i.tenant_id=p.tenant_id and i.company_id=p.company_id and i.period_id=p.id where p.tenant_id=$1 and p.company_id=$2 and p.month=$3::date group by p.id,p.state,p.source_hash`,
        scope,
      )
    ).rows[0] as HrPayrollRunWorkspace["attendance"];
    const policies = (
      await client.query(
        `select id,currency_code,money_scale,rounding_mode,net_payable_account_id from hr_payroll_policy where tenant_id=$1 and company_id=$2 and status='active' and workflow_managed order by currency_code,id limit 100`,
        scope.slice(0, 2),
      )
    ).rows as HrPayrollRunWorkspace["policies"];
    const hashes = period
      ? (
          await client.query(
            `select r.id,r.employee_id,r.calculation_hash,count(*) over() as total_count,(select jsonb_build_object('id',s.id,'state',s.state,'input_hash',s.input_hash,'resolved_set_hash',s.resolved_set_hash,'context',s.context_segments_json) from hr_payroll_statutory_snapshot s where s.tenant_id=r.tenant_id and s.payroll_result_id=r.id) as statutory_evidence from hr_payroll_result r where r.tenant_id=$1 and r.company_id=$2 and r.period_id=$3 and r.run_number=$4 order by r.employee_id collate "C",r.id collate "C" limit 501`,
            [c.tenantId, q.company_id, period.id, period.run_number],
          )
        ).rows
      : [];
    const jurisdictionSetupChanged = period
      ? Boolean(
          (
            await client.query(
              `select 1 from hr_payroll_localization_request r join hr_payroll_period p on p.tenant_id=r.tenant_id and p.company_id=r.company_id and p.id=$3 where r.tenant_id=$1 and r.company_id=$2 and r.kind in('jurisdiction_override','jurisdiction_override_revocation') and(r.terms->>'effective_from')::date<(p.month+interval '1 month')::date and(coalesce(r.terms->>'effective_to','infinity'))::date>=p.month and(r.state in('draft','submitted') or(r.state='approved' and r.decided_at>p.calculated_at)) limit 1`,
              [c.tenantId, q.company_id, period.id],
            )
          ).rowCount,
        )
      : false;
    const adjustments = await this.adjustments(client, c, q),
      loans = await loanRecoveries(client, c, q);
    return {
      period,
      attendance: attendance ?? null,
      jurisdictionSetupChanged,
      policies,
      hashes,
      hash: attendanceHash({
        period: period ?? null,
        attendance: attendance ?? null,
        policies,
        hashes,
        adjustments,
        loans,
        jurisdictionSetupChanged,
      }),
    };
  }
  private async blockers(
    client: PoolClient,
    c: HrActorContext,
    q: HrPayrollRunQuery,
    state: Awaited<ReturnType<PayrollRuns["state"]>>,
    forCalculation = false,
  ) {
    const blocked: string[] = [];
    if (!forCalculation && state.jurisdictionSetupChanged)
      blocked.push(
        "Resolve pending or changed employee jurisdiction setup and recalculate this run before submission.",
      );
    if (state.attendance?.state !== "locked")
      blocked.push("Lock and review Attendance Period Close before opening Payroll.");
    if (
      state.attendance &&
      (!state.attendance.input_count || state.attendance.evidence_versions.some((v) => v !== "attendance_close_v5"))
    )
      blocked.push(
        "Every employee requires published attendance_close_v5 evidence; legacy summaries cannot be guessed.",
      );
    if (state.period && !state.period.workflow_managed)
      blocked.push("This historical Payroll period remains read-only.");
    if (state.period && Number(state.period.run_number) > 0 && !forCalculation) {
      if (
        ["calculated", "under_review"].includes(String(state.period.state)) &&
        (
          await client.query(
            "select 1 from hr_settlement_correction_execution x cross join lateral jsonb_array_elements(x.snapshot->'after') a where x.tenant_id=$1 and x.company_id=$2 and x.state='posted' and x.posted_at>$4::timestamptz and(a->>'month')::date<$3::date and exists(select 1 from hr_payroll_result affected where affected.tenant_id=x.tenant_id and affected.company_id=x.company_id and affected.id=a->>'result_id' and exists(select 1 from hr_payroll_result current_result where current_result.tenant_id=affected.tenant_id and current_result.company_id=affected.company_id and current_result.employee_id=affected.employee_id and current_result.period_id=$5)) limit 1",
            [c.tenantId, q.company_id, q.month, state.period.calculated_at, state.period.id],
          )
        ).rowCount
      )
        blocked.push(
          "A posted settlement correction changed prior taxable or withheld amounts. Return and recalculate this Payroll run before submission or approval.",
        );
      if (
        ["calculated", "under_review"].includes(String(state.period.state)) &&
        !this.sameAdjustments(
          await this.recordedAdjustments(client, c, q, state.period),
          await this.adjustments(client, c, q),
        )
      )
        blocked.push(
          "Approved Payroll adjustment evidence changed after calculation; return and recalculate this run.",
        );
      if (state.hashes.length !== state.attendance?.input_count)
        blocked.push("The current run must contain exactly one result per frozen attendance input.");
      if (
        (
          await client.query(
            `select 1 from hr_payroll_localization_request where tenant_id=$1 and company_id=$2 and kind<>'pack_release' and state='approved' and decided_at>$4::timestamptz and(terms->>'effective_from')::date<($3::date+interval '1 month') and(coalesce(terms->>'effective_to','infinity'))::date>=$3::date limit 1`,
            [c.tenantId, q.company_id, q.month, state.period.calculated_at],
          )
        ).rowCount
      )
        blocked.push(
          "Approved statutory setup changed after calculation. Return and recalculate this run before final approval.",
        );
      if (
        (
          await client.query(
            `select 1 from hr_payroll_localization_request where tenant_id=$1 and company_id=$2 and kind<>'pack_release' and state in('draft','submitted') and(terms->>'effective_from')::date<($3::date+interval '1 month') and(coalesce(terms->>'effective_to','infinity'))::date>=$3::date limit 1`,
            [c.tenantId, q.company_id, q.month],
          )
        ).rowCount
      )
        blocked.push("Resolve pending statutory setup requests for this period before final approval.");
      const unsealed = Number(
        (
          await client.query(
            `select count(*)::int as n from hr_payroll_result r where r.tenant_id=$1 and r.company_id=$2 and r.period_id=$3 and r.run_number=$4 and not exists(select 1 from hr_payroll_statutory_snapshot s where s.tenant_id=r.tenant_id and s.company_id=r.company_id and s.payroll_result_id=r.id and s.state='sealed' and s.calculation_engine_version=$5 and s.context_segments_json @> jsonb_build_array(jsonb_build_object('base_calculation_hash',r.calculation_hash)))`,
            [
              c.tenantId,
              q.company_id,
              state.period.id,
              state.period.run_number,
              this.d.statutoryMode === "test" ? "statutory_rules_v1_test" : "statutory_rules_v1",
            ],
          )
        ).rows[0].n,
      );
      if (unsealed)
        blocked.push(
          `${unsealed} employee result(s) require verified sealed statutory execution evidence before final approval.`,
        );
      const mismatched = Number(
        (
          await client.query(
            `select count(*)::int as n from (select r.id,l.component_code,l.line_kind,sum(case when l.line_kind='employer_contribution' then l.employer_amount else l.employee_amount end) as expected from hr_payroll_statutory_snapshot_line l join hr_payroll_statutory_snapshot s on s.tenant_id=l.tenant_id and s.id=l.snapshot_id join hr_payroll_result r on r.tenant_id=s.tenant_id and r.id=s.payroll_result_id where r.tenant_id=$1 and r.company_id=$2 and r.period_id=$3 and r.run_number=$4 and l.applicable and l.line_kind<>'informational' group by r.id,l.component_code,l.line_kind) grouped where grouped.expected<>coalesce((select sum(i.amount) from hr_payroll_result_item i where i.tenant_id=$1 and i.result_id=grouped.id and i.component_code=grouped.component_code and i.kind=grouped.line_kind),0)`,
            [c.tenantId, q.company_id, state.period.id, state.period.run_number],
          )
        ).rows[0].n,
      );
      if (mismatched)
        blocked.push("Statutory output amounts do not reconcile with the immutable Payroll result lines.");
    }
    blocked.push(...(await loanRecoveryBlockers(client, c, q)));
    if (
      state.period &&
      ["calculated", "under_review"].includes(String(state.period.state)) &&
      !forCalculation &&
      !sameLoanRecoveries(await recordedLoanRecoveries(client, c, q, state.period), await loanRecoveries(client, c, q))
    )
      blocked.push("Loan recovery evidence changed after calculation; return and recalculate this run.");
    const inputs = await client.query(
      `select (select count(*)::int from hr_payroll_adjustment where tenant_id=$1 and company_id=$2 and effective_month=$3::date and state in('draft','submitted')) as adjustments`,
      [c.tenantId, q.company_id, q.month],
    );
    if (inputs.rows[0].adjustments)
      blocked.push("Resolve pending one-off Payroll adjustments before calculation or final approval.");
    return blocked;
  }
  private async reviewActor(client: PoolClient, c: HrActorContext, q: HrPayrollRunQuery, p: Row) {
    const bindings = (
      await client.query(
        "select distinct b.user_id from employee_user_binding b join hr_payroll_result r on r.tenant_id=b.tenant_id and r.employee_id=b.employee_id where r.tenant_id=$1 and r.company_id=$2 and r.period_id=$3 and r.run_number=$4",
        [c.tenantId, q.company_id, p.id, p.run_number],
      )
    ).rows;
    const makers = [
      String(p.created_by),
      String(p.calculated_by ?? ""),
      String(p.submitted_by ?? ""),
      ...bindings.map((r) => r.user_id),
    ];
    return {
      makers,
      decision: evaluateApprovalActor({
        account: c.actor,
        normalDecisionPermission: "hr.payroll.period.approve",
        makerActorIds: makers,
      }),
    };
  }
  async workspace(c: HrActorContext, q: HrPayrollRunQuery): Promise<HrPayrollRunWorkspace> {
    return this.d.read(c, "hr.payroll.period.read", async (client) => {
      await this.d.company(client, c, q.company_id);
      return this.workspaceIn(client, c, q);
    });
  }
  private async workspaceIn(
    client: PoolClient,
    c: HrActorContext,
    q: HrPayrollRunQuery,
  ): Promise<HrPayrollRunWorkspace> {
    const state = await this.state(client, c, q),
      blocked = await this.blockers(client, c, q, state),
      p = state.period;
    const canReadResults = has(c, "hr.payroll.result.read");
    if (p && Number(p.run_number) > 0 && !canReadResults)
      blocked.push("Payroll result read permission is required to inspect and decide this run.");
    const employees =
      p && canReadResults
        ? (
            await client.query(
              `select (select jsonb_build_object('gross',corrected->>'gross','deductions',corrected->>'deductions','net',corrected->>'net','employer_contributions',corrected->>'employer_contributions') from(select effective_hr_payroll_correction(r.tenant_id,r.company_id,r.id) as corrected) c where corrected is not null) as supplemental,r.id,r.employee_id,e.employee_number,concat_ws(' ',e.first_name,e.middle_name,e.last_name) as display_name,r.currency_code,r.gross::text,r.deductions::text,r.net::text,r.employer_contributions::text,case when r.execution_evidence->'statutory'->>'status' in('ready','blocked') then jsonb_build_object('jurisdiction_overrides',coalesce((select jsonb_agg(jsonb_build_object('id',o->>'id','rule_scope',o->>'rule_scope','jurisdiction_id',o->>'jurisdiction_id','effective_from',o->>'effective_from','effective_to',o->>'effective_to')) from jsonb_array_elements(coalesce(r.execution_evidence->'statutory'->'overrides','[]'::jsonb)) o),'[]'::jsonb),'contexts',coalesce((select jsonb_agg(jsonb_build_object('effective_from',s->>'effective_from','effective_to',s->>'effective_to','calendar_days',(s->>'calendar_days')::int,'input_hash',s->>'input_hash','resolved_set_hash',s->>'resolved_set_hash')) from jsonb_array_elements(coalesce(r.execution_evidence->'statutory'->'context_segments','[]'::jsonb)) s),'[]'::jsonb),'status',r.execution_evidence->'statutory'->>'status','environment',r.execution_evidence->'statutory'->>'mode','state',(select s.state from hr_payroll_statutory_snapshot s where s.tenant_id=r.tenant_id and s.payroll_result_id=r.id),'engine_version',(select s.calculation_engine_version from hr_payroll_statutory_snapshot s where s.tenant_id=r.tenant_id and s.payroll_result_id=r.id),'snapshot_id',(select s.id from hr_payroll_statutory_snapshot s where s.tenant_id=r.tenant_id and s.payroll_result_id=r.id),'input_hash',r.execution_evidence->'statutory'->>'input_hash','resolved_set_hash',r.execution_evidence->'statutory'->>'resolved_set_hash','rule_count',jsonb_array_length(r.execution_evidence->'statutory'->'outputs'),'pack_count',jsonb_array_length(r.execution_evidence->'statutory'->'packs')) else null end as statutory,r.calculation_hash,r.attendance_source_hash,r.warnings,coalesce((select jsonb_agg(jsonb_build_object('component_name',i.component_name,'kind',i.kind,'amount',i.amount::text,'source',i.source,'overtime',(select jsonb_build_object('work_date',ot.work_date::text,'approved_minutes',ot.approved_minutes,'basis_amount',ot.basis_amount::text,'ordinary_hours',ot.ordinary_hours::text,'hourly_rate',ot.hourly_rate::text,'multiplier',ot.multiplier::text,'rounded_amount',ot.rounded_amount::text,'rounding_mode',ot.rounding_mode,'rounding_stage',ot.rounding_stage,'policy_version_id',ot.policy_version_id,'arrangement_id',ot.arrangement_id,'conversion_method',ot.conversion_method) from hr_payroll_ot_evidence ot where ot.tenant_id=i.tenant_id and ot.company_id=r.company_id and ot.payroll_result_id=r.id and ot.payroll_result_item_id=i.id)) order by i.position) from hr_payroll_result_item i where i.tenant_id=r.tenant_id and i.result_id=r.id),'[]'::jsonb) as lines from hr_payroll_result r join employee e on e.tenant_id=r.tenant_id and e.id=r.employee_id where r.tenant_id=$1 and r.company_id=$2 and r.period_id=$3 and r.run_number=$4 order by e.employee_number collate "C",r.id collate "C" limit $5 offset $6`,
              [c.tenantId, q.company_id, p.id, p.run_number, q.limit ?? 25, q.offset ?? 0],
            )
          ).rows
        : [];
    const totals =
      p && Number(p.run_number) > 0 && canReadResults
        ? (
            await client.query(
              `select coalesce(sum(gross),0)::text as gross,coalesce(sum(deductions),0)::text as deductions,coalesce(sum(net),0)::text as net,coalesce(sum(employer_contributions),0)::text as employer_contributions from hr_payroll_result where tenant_id=$1 and company_id=$2 and period_id=$3 and run_number=$4`,
              [c.tenantId, q.company_id, p.id, p.run_number],
            )
          ).rows[0]
        : null;
    const supplementalTotals =
      p && Number(p.run_number) > 0 && canReadResults
        ? (
            await client.query(
              "select case when bool_or(c.updated is not null) then jsonb_build_object('gross',sum(coalesce((c.updated->>'gross')::numeric,r.gross))::text,'deductions',sum(coalesce((c.updated->>'deductions')::numeric,r.deductions))::text,'net',sum(coalesce((c.updated->>'net')::numeric,r.net))::text,'employer_contributions',sum(coalesce((c.updated->>'employer_contributions')::numeric,r.employer_contributions))::text) else null end as totals from hr_payroll_result r left join lateral(select effective_hr_payroll_correction(r.tenant_id,r.company_id,r.id) as updated)c on true where r.tenant_id=$1 and r.company_id=$2 and r.period_id=$3 and r.run_number=$4",
              [c.tenantId, q.company_id, p.id, p.run_number],
            )
          ).rows[0].totals
        : null;
    const setup = has(c, "hr.payroll.setup.read"),
      accounts = setup
        ? (
            await client.query(
              `select id,code||' · '||name as label from account where tenant_id=$1 and company_id=$2 and type='liability' and status='active' and not is_header order by code,id limit 500`,
              [c.tenantId, q.company_id],
            )
          ).rows
        : [],
      currencies = setup
        ? (
            await client.query(
              `select code as id,code||' · '||name as label,decimal_places as scale from currency where tenant_id=$1 and status='active' and decimal_places<=4 order by code limit 100`,
              [c.tenantId],
            )
          ).rows
        : [];
    const actions: string[] = [];
    const review =
      p?.workflow_managed && p.state === "under_review" && canReadResults
        ? await this.reviewActor(client, c, q, p)
        : null;
    const reviewAccess: HrPayrollRunWorkspace["review_access"] = !review
      ? null
      : review.decision.kind === "forbidden"
        ? "forbidden"
        : review.decision.kind === "override"
          ? "override_required"
          : "independent";
    if (setup && has(c, "hr.payroll.setup.manage")) actions.push("policy");
    if (
      !p &&
      has(c, "hr.payroll.period.manage") &&
      state.policies.length &&
      state.attendance?.state === "locked" &&
      state.attendance.input_count &&
      state.attendance.evidence_versions.every((v) => v === "attendance_close_v5")
    )
      actions.push("open");
    if (p?.workflow_managed) {
      if (
        ["open", "calculated"].includes(String(p.state)) &&
        has(c, "hr.payroll.recalculate") &&
        has(c, "hr.payroll.salary.read") &&
        has(c, "hr.attendance.payroll_input.read") &&
        canReadResults
      )
        actions.push("calculate");
      if (
        p.state === "calculated" &&
        !state.jurisdictionSetupChanged &&
        has(c, "hr.payroll.period.manage") &&
        canReadResults &&
        [p.created_by, p.calculated_by].includes(c.actor.userId)
      )
        actions.push("submit");
      if (
        p.state === "under_review" &&
        has(c, "hr.payroll.period.approve") &&
        canReadResults &&
        reviewAccess !== "forbidden"
      ) {
        actions.push("return");
        if (!blocked.length) actions.push("approve");
      }
    }
    const history = p
      ? (
          await client.query(
            `select action,reason,actor_id,created_at::text as occurred_at,(override_id is not null) as override from hr_payroll_workspace_event where tenant_id=$1 and company_id=$2 and record_id=$3 order by created_at desc,id desc limit 100`,
            [c.tenantId, q.company_id, p.id],
          )
        ).rows
      : [];
    return {
      review_access: reviewAccess,
      company_id: q.company_id,
      month: q.month,
      source_hash: state.hash,
      period: p
        ? {
            id: String(p.id),
            state: String(p.state),
            version: Number(p.version),
            run_number: Number(p.run_number),
            currency_code: String(p.currency_code),
            created_by: String(p.created_by),
            calculated_by: string(p, "calculated_by"),
            submitted_by: string(p, "submitted_by"),
            approved_by: string(p, "approved_by"),
            review_hash: string(p, "review_hash"),
          }
        : null,
      attendance: state.attendance,
      policies: state.policies,
      accounts,
      currencies,
      employees,
      total: Number(state.hashes[0]?.total_count ?? 0),
      limit: q.limit ?? 25,
      offset: q.offset ?? 0,
      supplemental_totals: supplementalTotals,
      totals: totals ? { ...totals, currency_code: String(p!.currency_code) } : null,
      blocked,
      allowed_actions: actions,
      history,
    };
  }
  async action(c: HrActorContext, input: HrPayrollRunAction, key: string, corr: string) {
    const permission =
      input.action === "policy"
        ? "hr.payroll.setup.manage"
        : input.action === "calculate"
          ? "hr.payroll.recalculate"
          : ["approve", "return"].includes(input.action)
            ? "hr.payroll.period.approve"
            : "hr.payroll.period.manage";
    if (!has(c, "hr.payroll.period.read")) denied();
    return this.writes.runWrite(
      c,
      input.company_id,
      permission,
      key,
      corr,
      "/api/v1/hr/payroll_runs/actions",
      input,
      async (client) => {
        const state = await this.state(client, c, input),
          p = state.period;
        if (state.hash !== input.source_hash || Number(p?.version ?? 0) !== input.expected_version)
          conflict("Payroll context changed. Refresh the source and review again.");
        const update = async (sql: string, params: unknown[]) => {
          const changed = await client.query(sql, params);
          if (changed.rowCount !== 1) conflict("Payroll changed during this action. Refresh and review again.");
        };
        let id = String(p?.id ?? ""),
          status = String(p?.state ?? ""),
          version = Number(p?.version ?? 0),
          kind = "run",
          override: string | null = null;
        if (input.action === "policy") {
          if (!has(c, "hr.payroll.setup.read")) denied();
          if (
            !input.currency_code ||
            input.money_scale === undefined ||
            !input.net_payable_account_id ||
            !input.rounding_mode
          )
            conflict("Choose currency, precision, rounding and a net payable liability account.");
          const currency = (
            await client.query(
              `select decimal_places from currency where tenant_id=$1 and code=$2 and status='active'`,
              [c.tenantId, input.currency_code],
            )
          ).rows[0];
          if (!currency || currency.decimal_places !== input.money_scale)
            conflict("Use the active Finance currency and its exact configured precision.");
          const account = await client.query(
            `select 1 from account where tenant_id=$1 and company_id=$2 and id=$3 and type='liability' and status='active' and not is_header`,
            [c.tenantId, input.company_id, input.net_payable_account_id],
          );
          if (!account.rowCount) conflict("Choose an active company liability account.");
          id = "payroll-policy-" + randomUUID();
          kind = "policy";
          status = "active";
          version = 1;
          await client.query(
            `insert into hr_payroll_policy(id,tenant_id,company_id,currency_code,money_scale,net_payable_account_id,created_by,workflow_managed,rounding_mode) values($1,$2,$3,$4,$5,$6,$7,true,$8)`,
            [
              id,
              c.tenantId,
              input.company_id,
              input.currency_code,
              input.money_scale,
              input.net_payable_account_id,
              c.actor.userId,
              input.rounding_mode,
            ],
          );
        } else if (input.action === "open") {
          if (p) conflict("This company already has a Payroll period for the selected month.");
          if (
            state.attendance?.state !== "locked" ||
            !state.attendance.input_count ||
            state.attendance.evidence_versions.some((v) => v !== "attendance_close_v5")
          )
            conflict("Publish locked attendance_close_v5 inputs before opening Payroll.");
          const policy = state.policies.find((v) => v.id === input.policy_id);
          if (!policy) conflict("Choose an active governed Payroll policy.");
          id = "payroll-period-" + randomUUID();
          version = 1;
          status = "open";
          await client.query(
            `insert into hr_payroll_period(id,tenant_id,company_id,attendance_period_id,policy_id,month,source_hash,created_by,workflow_managed) values($1,$2,$3,$4,$5,$6,$7,$8,true)`,
            [
              id,
              c.tenantId,
              input.company_id,
              state.attendance!.id,
              policy!.id,
              input.month,
              state.attendance!.source_hash,
              c.actor.userId,
            ],
          );
        } else {
          if (!p?.workflow_managed) conflict("Select an open governed Payroll period.");
          if (!has(c, "hr.payroll.result.read")) denied();
          if (input.action === "calculate") {
            if (!["open", "calculated"].includes(String(p!.state)))
              conflict("Return the run from review before recalculating it.");
            if (!has(c, "hr.payroll.salary.read") || !has(c, "hr.attendance.payroll_input.read")) denied();
            const blocked = await this.blockers(client, c, input, state, true);
            if (blocked.length) conflict(blocked.join(" "));
            const result = await this.calculate(client, c, input, p!);
            status = "calculated";
            await update(
              `update hr_payroll_period set state='calculated',run_number=run_number+1,version=version+1,calculated_by=$4,calculated_at=clock_timestamp(),review_hash=$5,submitted_by=null,submitted_at=null,reviewed_by=null,reviewed_at=null where tenant_id=$1 and company_id=$2 and id=$3 and version=$6`,
              [c.tenantId, input.company_id, id, c.actor.userId, result, input.expected_version],
            );
          } else if (input.action === "submit") {
            if (p!.state !== "calculated" || !state.hashes.length)
              conflict("Calculate employee results before submission.");
            if (![p!.created_by, p!.calculated_by].includes(c.actor.userId))
              denied("The Payroll maker must submit this calculated run.");
            if (state.jurisdictionSetupChanged)
              conflict(
                "Resolve pending or changed employee jurisdiction setup and recalculate this run before submission.",
              );
            status = "under_review";
            await update(
              `update hr_payroll_period set state='under_review',version=version+1,submitted_by=$4,submitted_at=now() where tenant_id=$1 and company_id=$2 and id=$3 and version=$5`,
              [c.tenantId, input.company_id, id, c.actor.userId, input.expected_version],
            );
          } else {
            if (p!.state !== "under_review") conflict("Only a submitted Payroll run can be reviewed.");
            const { makers, decision } = await this.reviewActor(client, c, input, p!);
            if (decision.kind === "forbidden" || (decision.kind === "override" && !input.confirm_override))
              denied("Independent Payroll review or an explicit governed administrator override is required.");
            if (input.action === "approve") {
              if (
                !sameLoanRecoveries(
                  await recordedLoanRecoveries(client, c, input, p!),
                  await loanRecoveries(client, c, input, true),
                )
              )
                conflict("Loan recovery evidence changed; return and recalculate this run.");
              if (
                !this.sameAdjustments(
                  await this.recordedAdjustments(client, c, input, p!),
                  await this.adjustments(client, c, input, true),
                )
              )
                conflict("Approved input terms changed; return and recalculate this Payroll run.");
              const blocked = await this.blockers(client, c, input, state);
              if (blocked.length) conflict(blocked.join(" "));
            }
            override = await this.d.override(client, c, {
              normalDecisionPermission: permission,
              makerActorIds: makers,
              resourceType: "hr_payroll_period",
              resourceId: id,
              decisionAction: input.action === "approve" ? "approve" : "reject",
              reason: input.reason,
              correlationId: corr,
              idempotencyKey: key,
            });
            status = input.action === "approve" ? "approved" : "open";
            await update(
              `update hr_payroll_period set state=$4,version=version+1,reviewed_by=$5,reviewed_at=now(),review_hash=case when $4='open' then null else review_hash end,approved_by=case when $4='approved' then $5 else null end,approved_at=case when $4='approved' then now() else null end where tenant_id=$1 and company_id=$2 and id=$3 and version=$6`,
              [c.tenantId, input.company_id, id, status, c.actor.userId, input.expected_version],
            );
          }

          if (input.action === "approve") {
            for (const recovery of await consumeLoanRecoveries(client, c, input, p!)) {
              const afterRecovery = { ...recovery, state: "consumed" };
              await client.query(
                "insert into hr_payroll_workspace_event(tenant_id,id,company_id,record_id,record_type,action,reason,actor_id,before_json,after_json,source_hash,override_id) values($1,$2,$3,$4,'loan','recovered',$5,$6,$7::jsonb,$8::jsonb,$9,$10)",
                [
                  c.tenantId,
                  recovery.event_id,
                  input.company_id,
                  recovery.loan_id,
                  input.reason,
                  c.actor.userId,
                  JSON.stringify(recovery),
                  JSON.stringify(afterRecovery),
                  attendanceHash(afterRecovery),
                  override,
                ],
              );
              await this.d.audit(client, c, corr, String(recovery.loan_id), recovery, afterRecovery);
            }
            const adjustments = await this.recordedAdjustments(client, c, input, p!);
            for (const a of adjustments) {
              const changed = await client.query(
                `update hr_payroll_adjustment set state='consumed',consumed_result_id=$4,version=version+1 where tenant_id=$1 and company_id=$2 and id=$3 and version=$5 and state='approved'`,
                [c.tenantId, input.company_id, a.id, a.result_id, a.version],
              );
              if (changed.rowCount !== 1) conflict("An approved Payroll input changed during consumption.");
              const after = {
                ...a,
                state: "consumed",
                consumed_result_id: a.result_id,
                version: Number(a.version) + 1,
              };
              await client.query(
                `insert into hr_payroll_workspace_event(tenant_id,id,company_id,record_id,record_type,action,reason,actor_id,before_json,after_json,source_hash,override_id) values($1,$2,$3,$4,'adjustment','consumed',$5,$6,$7::jsonb,$8::jsonb,$9,$10)`,
                [
                  c.tenantId,
                  "payroll-input-consumed-" + randomUUID(),
                  input.company_id,
                  a.id,
                  input.reason,
                  c.actor.userId,
                  JSON.stringify(a),
                  JSON.stringify(after),
                  attendanceHash(after),
                  override,
                ],
              );
              await this.d.audit(client, c, corr, String(a.id), a, after);
            }
          }
          version = input.expected_version + 1;
        }
        const after = await this.workspaceIn(client, c, input);
        return { id, status, version, kind, before: { period: p ?? null, source_hash: state.hash }, after, override };
      },
      async (client) => {
        if (["approve", "return"].includes(input.action)) {
          for (const required of ["hr.payroll.period.read", "hr.payroll.result.read", "hr.payroll.period.approve"])
            await requireHrCompanyPermission(client, c, input.company_id, required);
        }
      },
    );
  }
  private async calculate(client: PoolClient, c: HrActorContext, q: HrPayrollRunQuery, p: Row) {
    const inputs = (
      await client.query(
        `select id,employee_id,evidence_version,source_hash,calendar_days::text,paid_days::text,unpaid_days::text,overtime_regular_minutes,overtime_weekend_minutes,overtime_holiday_minutes,correction_count,completion_payload from hr_payroll_input where tenant_id=$1 and company_id=$2 and period_id=$3 order by employee_id collate "C" limit 501`,
        [c.tenantId, q.company_id, p.attendance_period_id],
      )
    ).rows;
    if (!inputs.length || inputs.length > 500)
      conflict(
        "This synchronous calculation supports 1–500 employees. Larger periods require durable worker execution.",
      );
    const payloads = inputs.map((row) => {
      const parsed = hrAttendanceCloseEmployeeSchema.safeParse(row.completion_payload);
      if (
        row.evidence_version !== "attendance_close_v5" ||
        !parsed.success ||
        parsed.data.employee_id !== row.employee_id ||
        parsed.data.source_hash !== row.source_hash ||
        parsed.data.exception_count ||
        parsed.data.days.some((d) => d.issues.length)
      )
        conflict("A published attendance input is invalid or unresolved.");
      const payload = parsed.data!;
      const calendar = BigInt(payload.days.length) * 10000n,
        paid = payload.days.reduce((n, d) => n + payrollUnits(d.paid_days), 0n),
        unpaid = payload.days.reduce((n, d) => n + payrollUnits(d.unpaid_days), 0n);
      if (
        calendar !== payrollUnits(row.calendar_days) ||
        calendar !== payrollUnits(payload.calendar_days) ||
        paid !== payrollUnits(row.paid_days) ||
        paid !== payrollUnits(payload.paid_days) ||
        unpaid !== payrollUnits(row.unpaid_days) ||
        unpaid !== payrollUnits(payload.unpaid_days) ||
        paid + unpaid !== calendar ||
        payload.correction_count !== row.correction_count ||
        payload.overtime_regular_minutes !== row.overtime_regular_minutes ||
        payload.overtime_weekend_minutes !== row.overtime_weekend_minutes ||
        payload.overtime_holiday_minutes !== row.overtime_holiday_minutes
      )
        conflict("Frozen attendance header, daily quantities and source evidence do not reconcile.");

      return payload;
    });
    const salaries = (
      await client.query(
        `select s.id,s.employee_id,s.structure_id,s.currency_code,s.compensation_type,s.payment_basis,s.effective_from::text,s.effective_to::text from hr_salary_assignment s where s.tenant_id=$1 and s.company_id=$2 and s.employee_id=any($3::text[]) and s.state in('approved','effective') and s.effective_from<($4::date+interval '1 month') and (s.effective_to is null or s.effective_to>=$4::date) order by s.employee_id,s.effective_from,s.id`,
        [c.tenantId, q.company_id, inputs.map((i) => i.employee_id), q.month],
      )
    ).rows;
    const components = (
      await client.query(
        `select s.assignment_id,c.id,c.code,c.name,c.kind,s.method,s.amount::text,s.formula,c.prorated,c.expense_account_id,c.liability_account_id from hr_salary_assignment_component s join hr_pay_component c on c.tenant_id=s.tenant_id and c.company_id=s.company_id and c.id=s.component_id where s.tenant_id=$1 and s.company_id=$2 and s.assignment_id=any($3::text[]) order by s.assignment_id,s.position`,
        [c.tenantId, q.company_id, salaries.map((s) => s.id)],
      )
    ).rows;
    const adjustments = await this.adjustments(client, c, q, true);
    if (adjustments.length > 1000) conflict("More than 1000 approved inputs require durable worker execution.");
    if (adjustments.some((a) => !payloads.some((p) => p.employee_id === a.employee_id)))
      conflict("An approved adjustment employee has no published attendance input for this period.");
    const loans = await loanRecoveries(client, c, q, true);
    if (loans.length > 1000) conflict("More than 1000 loan instalments require durable worker execution.");
    if (loans.some((a) => !payloads.some((p) => p.employee_id === a.employee_id)))
      conflict("An active loan employee has no published attendance input for this period.");
    const hashes = [];
    for (const [index, payload] of payloads.entries()) {
      const sourceSalaries = salaries
        .filter((s) => s.employee_id === payload.employee_id)
        .map((s) => ({ ...s, components: components.filter((i) => i.assignment_id === s.id) }));
      if (
        sourceSalaries.some((s) =>
          s.components.some((i: { kind: string }) => !["earning", "deduction"].includes(i.kind)),
        )
      )
        conflict("Employer contribution components need statutory execution evidence.");
      let calculated;
      try {
        calculated = calculateMonthlyPayroll({
          days: payload.days,
          salaries: sourceSalaries as PayrollCalculationSalary[],
          month: q.month,
          currency_code: String(p.currency_code),
          money_scale: Number(p.money_scale),
          rounding: p.rounding_mode as "half_up" | "half_even" | "down" | "up",
        });
      } catch (error) {
        if (error instanceof PayrollCalculationError) conflict(`${payload.employee_number}: ${error.message}`);
        throw error;
      }

      let overtime;
      try {
        overtime = await calculatePublishedOvertime(
          client,
          c.tenantId,
          q.company_id,
          payload,
          sourceSalaries as PayrollCalculationSalary[],
          String(p.currency_code),
          Number(p.money_scale),
        );
      } catch (error) {
        if (error instanceof PayrollCalculationError) conflict(payload.employee_number + ": " + error.message);
        throw error;
      }
      calculated.lines.push(...overtime.map((item) => item.line));
      const employeeAdjustments = adjustments.filter((a) => a.employee_id === payload.employee_id);
      let gross = overtime.reduce(
          (sum, item) => sum.add(ExactPayrollAmount.parse(item.line.amount)),
          ExactPayrollAmount.parse(calculated.gross),
        ),
        deductions = ExactPayrollAmount.parse(calculated.deductions);
      for (const adjustment of employeeAdjustments) {
        if (
          adjustment.component_status !== "active" ||
          !["earning", "deduction"].includes(adjustment.kind) ||
          !adjustment.approved_by ||
          !adjustment.approved_at
        )
          conflict("An approved input needs an active earning/deduction component and retained approval evidence.");
        const amount = ExactPayrollAmount.parse(adjustment.amount).decimal(
          Number(p.money_scale),
          p.rounding_mode as "half_up" | "half_even" | "down" | "up",
        );
        if (adjustment.kind === "earning") gross = gross.add(ExactPayrollAmount.parse(amount));
        else deductions = deductions.add(ExactPayrollAmount.parse(amount));
        calculated.lines.push({
          component_id: adjustment.component_id,
          component_code: adjustment.code,
          component_name: adjustment.name,
          kind: adjustment.kind,
          amount,
          expense_account_id: adjustment.expense_account_id,
          liability_account_id: adjustment.liability_account_id,
          source: "adjustment:" + adjustment.id,
        });
      }
      const employeeLoans = loans.filter((a) => a.employee_id === payload.employee_id);
      for (const recovery of employeeLoans) {
        const line = loanRecoveryLine(recovery, String(p.currency_code), Number(p.money_scale));
        calculated.lines.push(line);
        deductions = deductions.add(ExactPayrollAmount.parse(line.amount));
      }
      if (gross.compare(deductions) < 0)
        conflict("Approved deductions exceed gross pay for " + payload.employee_number + ".");
      calculated.gross = gross.decimal(Number(p.money_scale));
      calculated.deductions = deductions.decimal(Number(p.money_scale));
      calculated.net = gross.subtract(deductions).decimal(Number(p.money_scale));
      const statutory = await executePublishedStatutory(
        client,
        c.tenantId,
        q.company_id,
        q.month,
        payload,
        calculated,
        String(p.currency_code),
        Number(p.money_scale),
        this.d.statutoryMode ?? "production",
      );
      calculated.lines.push(...statutory.lines);
      calculated.gross = statutory.gross;
      calculated.deductions = statutory.deductions;
      calculated.net = statutory.net;
      const id = "payroll-result-" + randomUUID(),
        input = inputs[index]!,
        hash = attendanceHash({
          calculated,
          attendance: input.source_hash,
          salaries: sourceSalaries,
          adjustments: employeeAdjustments,
          loans: employeeLoans,
          overtime: overtime.map((item) => ({ source: item.source, evidence: item.evidence, line: item.line })),
          statutory,
        }),
        run = Number(p.run_number) + 1;
      await client.query(
        `insert into hr_payroll_result(id,tenant_id,company_id,period_id,employee_id,salary_assignment_id,run_number,currency_code,gross,deductions,net,attendance_source_hash,calculation_hash,payroll_input_id,payroll_input_evidence_version,execution_evidence,employer_contributions,warnings) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'attendance_close_v5',$15::jsonb,$16,$17::jsonb)`,
        [
          id,
          c.tenantId,
          q.company_id,
          p.id,
          payload.employee_id,
          calculated.segments.length === 1 ? calculated.segments[0]!.salary_assignment_id : null,
          run,
          p.currency_code,
          calculated.gross,
          calculated.deductions,
          calculated.net,
          input.source_hash,
          hash,
          input.id,
          JSON.stringify({
            engine_version: calculated.engine_version,
            assembly_version: "payroll_statutory_v1",
            statutory,
            overtime: overtime.map((item) => ({ source: item.source, evidence: item.evidence, line: item.line })),
            adjustments: employeeAdjustments,
            loans: employeeLoans,
            rounding_stage: calculated.rounding_stage,
            calculation: calculated,
            source_salaries: sourceSalaries,
          }),
          statutory.employer_contributions,
          JSON.stringify(statutory.blockers),
        ],
      );
      const lineIds = new Map<string, string>();
      for (const [position, line] of calculated.lines.entries()) {
        const lineId = "payroll-line-" + randomUUID();
        lineIds.set(line.source, lineId);
        await client.query(
          `insert into hr_payroll_result_item(id,tenant_id,result_id,component_id,component_code,component_name,kind,amount,expense_account_id,liability_account_id,source,position) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
          [
            lineId,
            c.tenantId,
            id,
            line.component_id,
            line.component_code,
            line.component_name,
            line.kind,
            line.amount,
            line.expense_account_id,
            line.liability_account_id,
            line.source,
            position + 1,
          ],
        );
      }
      const segmentIds = new Map<string, string>();
      for (const [position, segment] of calculated.segments.entries()) {
        const segmentId = "payroll-segment-" + randomUUID();
        segmentIds.set(segment.salary_assignment_id, segmentId);
        await client.query(
          `insert into hr_payroll_result_salary_segment(id,tenant_id,company_id,result_id,salary_assignment_id,structure_id,position,effective_from,effective_to,paid_days,period_calendar_days,currency_code,gross,deductions,net,component_snapshot_json,calculation_hash) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16::jsonb,$17)`,
          [
            segmentId,
            c.tenantId,
            q.company_id,
            id,
            segment.salary_assignment_id,
            sourceSalaries.find((s) => s.id === segment.salary_assignment_id)!.structure_id,
            position + 1,
            segment.effective_from,
            segment.effective_to,
            segment.paid_days,
            segment.period_calendar_days,
            p.currency_code,
            segment.gross,
            segment.deductions,
            segment.net,
            JSON.stringify(segment.components),
            attendanceHash(segment),
          ],
        );
      }
      for (const item of overtime)
        await persistPayrollOvertime(
          client,
          c.tenantId,
          q.company_id,
          payload.employee_id,
          id,
          item,
          lineIds.get(item.line.source)!,
          segmentIds.get(item.salary_id)!,
        );
      await persistStatutorySnapshot(client, c.tenantId, q.company_id, id, hash, statutory);
      hashes.push({ employee: payload.employee_id, hash });
    }
    return attendanceHash(hashes);
  }
}
