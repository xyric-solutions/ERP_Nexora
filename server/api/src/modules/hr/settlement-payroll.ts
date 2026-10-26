import { reviewSettlementCountryHandoff } from "./settlement-country.js";
import { reviewSettlementSalaryHandoff } from "./settlement-benefits.js";
import { requireHrCompanyPermission } from "./company-authority.js";
import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import type { HrLifecycleCaseAction } from "@nexora/contracts";
import { HrApiError, type HrActorContext } from "./source-repository.js";
import { attendanceHash } from "./attendance-completion.js";
// Query projections are checked against retained approved source terms before insertion.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;
const fail = (message: string): never => {
  throw new HrApiError(409, "HR_SETTLEMENT_PAYROLL_REVIEW_REQUIRED", message);
};
export function settlementPayrollDecimal(minor: string, scale: number) {
  if (!/^(0|[1-9][0-9]{0,14})$/.test(minor) || !Number.isInteger(scale) || scale < 0 || scale > 4)
    fail("Unsupported exact settlement amount or currency precision.");
  const value = minor.padStart(scale + 1, "0");
  return scale ? value.slice(0, -scale) + "." + value.slice(-scale) : value;
}
export async function settlementPayrollLinks(client: PoolClient, c: HrActorContext, r: Row) {
  return (
    await client.query(
      `select distinct on(l.line_index) l.line_index,l.revision,l.adjustment_id,l.component_id,l.effective_month::text as month,l.exclusion_reason,l.reason,l.created_by,l.created_at::text,
    coalesce(a.state,'excluded') as state,a.consumed_result_id as result_id,p.state as period_state,
    je.status as finance_state,case when a.state='consumed' and p.state in('posted','paid','closed') and j.state='posted' and je.status='posted' then j.external_journal_id else null end as journal_id
    from hr_settlement_payroll_link l left join hr_payroll_adjustment a on a.tenant_id=l.tenant_id and a.id=l.adjustment_id
    left join hr_payroll_result res on res.tenant_id=a.tenant_id and res.id=a.consumed_result_id
    left join hr_payroll_period p on p.tenant_id=l.tenant_id and p.company_id=l.company_id and p.month=l.effective_month and(res.id is null or(p.id=res.period_id and p.run_number=res.run_number))
    left join hr_payroll_journal_proposal j on j.tenant_id=p.tenant_id and j.company_id=p.company_id and j.period_id=p.id and j.run_number=p.run_number and j.state='posted'
    left join journal_entry je on je.tenant_id=j.tenant_id and je.company_id=j.company_id and je.id=j.external_journal_id
    where l.tenant_id=$1 and l.company_id=$2 and l.case_id=$3 order by l.line_index,l.revision desc`,
      [c.tenantId, r.company_id, r.id],
    )
  ).rows;
}
export async function prepareSettlementPayroll(
  client: PoolClient,
  c: HrActorContext,
  r: Row,
  input: Extract<HrLifecycleCaseAction, { action: "prepare_payroll" }>,
) {
  if (input.unprocessed_entitlements_only !== true)
    fail("Confirm that included entitlements have not already been processed.");
  if (r.kind !== "settlement" || r.state !== "approved")
    fail("Independently approve the settlement statement before preparing Payroll inputs.");
  await client.query("select 1 from hr_lifecycle_case where tenant_id=$1 and id=$2 for update", [c.tenantId, r.id]);
  await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
    "nexora:payroll:" + c.tenantId + ":" + r.company_id,
  ]);
  if (
    (
      await client.query(
        "select 1 from hr_settlement_void_request where tenant_id=$1 and company_id=$2 and case_id=$3 and state='submitted'",
        [c.tenantId, r.company_id, r.id],
      )
    ).rowCount
  )
    fail("Resolve the pending settlement correction before Payroll handoff.");
  if (
    (
      await client.query(
        "select 1 from hr_settlement_correction_review where tenant_id=$1 and company_id=$2 and case_id=$3 and state='submitted'",
        [c.tenantId, r.company_id, r.id],
      )
    ).rowCount
  )
    fail(
      "An unresolved financial correction requires separate Payroll processing; the original statement cannot be handed off again.",
    );
  await reviewSettlementCountryHandoff(client, c, r as Parameters<typeof reviewSettlementCountryHandoff>[2]);
  await reviewSettlementSalaryHandoff(client, c, r);
  const month = input.month,
    lines = r.terms.lines as {
      direction: string;
      amount_minor: string;
      description: string;
      source_reference: string;
    }[];
  if (
    input.mappings.length !== lines.length ||
    new Set(input.mappings.map((m) => m.line_index)).size !== lines.length ||
    input.mappings.some((m) => m.line_index >= lines.length)
  )
    fail("Review every statement line exactly once; explicitly exclude amounts already processed or outside Payroll.");
  const exit = (
    await client.query(
      "select terms->>'last_working_date' as last_day from hr_lifecycle_case where tenant_id=$1 and company_id=$2 and id=$3 and kind in('resignation','termination') and state in('approved','closed')",
      [c.tenantId, r.company_id, r.parent_id],
    )
  ).rows[0];
  if (!exit || exit.last_day.slice(0, 7) !== month.slice(0, 7))
    fail("Use the approved exit month. Later corrections require the Payroll correction workflow.");
  const existing = await settlementPayrollLinks(client, c, r);
  if (existing.some((l) => l.month !== month)) fail("Replacement inputs must retain the original Payroll month.");
  if (
    (
      await client.query(
        "select 1 from hr_payroll_period where tenant_id=$1 and company_id=$2 and month>=$3::date and state<>'open' limit 1",
        [c.tenantId, r.company_id, month],
      )
    ).rowCount
  )
    fail(
      "A calculated or finalized Payroll period prevents new settlement inputs. Use the Payroll correction workflow.",
    );
  const currency = (
    await client.query(
      "select decimal_places from currency where tenant_id=$1 and code=$2 and status='active' and decimal_places<=4",
      [c.tenantId, r.terms.currency],
    )
  ).rows[0];
  if (!currency) fail("The statement currency is inactive or unsupported.");
  if (
    !(
      await client.query(
        "select 1 from hr_payroll_policy where tenant_id=$1 and company_id=$2 and currency_code=$3 and money_scale=$4 and status='active'",
        [c.tenantId, r.company_id, r.terms.currency, currency.decimal_places],
      )
    ).rowCount
  )
    fail("Set up a matching active Payroll currency policy first.");
  if (
    !(
      await client.query(
        `select 1 from employee_assignment a join hr_employment_relationship er on er.tenant_id=a.tenant_id and er.id=a.employment_relationship_id where a.tenant_id=$1 and a.company_id=$2 and a.employee_id=$3 and er.id=$5 and er.approval_state='approved' and er.status in('active','ended') and a.assignment_status in('active','ended') and a.effective_from<=$4::date and(a.effective_to is null or a.effective_to>=$4::date)`,
        [c.tenantId, r.company_id, r.employee_id, month, r.relationship_id],
      )
    ).rowCount
  )
    fail(
      "The employee needs an approved operational assignment on the Payroll month start; use governed Payroll corrections for other periods.",
    );
  let changes = 0;
  for (const map of [...input.mappings].sort((a, b) => a.line_index - b.line_index)) {
    const line = lines[map.line_index]!,
      old = existing.find((l) => l.line_index === map.line_index);
    if (old && !["rejected", "excluded"].includes(old.state)) {
      if (map.component_id !== old.component_id || map.exclusion_reason)
        fail("An existing active or consumed Payroll input cannot be replaced or excluded.");
      continue;
    }
    if (old?.state === "excluded" && !map.component_id && map.exclusion_reason === old.exclusion_reason) continue;
    let adjustment: string | null = null;
    if (map.component_id) {
      if (map.exclusion_reason) fail("Choose either a Payroll component or a documented exclusion.");
      if (BigInt(line.amount_minor) <= 0n) fail("Exclude zero-value lines; Payroll inputs must be positive.");
      const comp = (
        await client.query(
          `select c.* from hr_pay_component c join account a on a.tenant_id=c.tenant_id and a.company_id=c.company_id and a.id=coalesce(c.expense_account_id,c.liability_account_id) and a.status='active' and not a.is_header and a.type=case when c.kind='earning' then 'expense' else 'liability' end where c.tenant_id=$1 and c.company_id=$2 and c.id=$3 and c.status='active' and c.method='fixed' and c.kind=$4`,
          [c.tenantId, r.company_id, map.component_id, line.direction],
        )
      ).rows[0];
      if (!comp)
        fail("Choose an active fixed component with the matching direction and a valid company posting account.");
      if (
        (
          await client.query(
            "select 1 from hr_employee_loan where tenant_id=$1 and company_id=$2 and component_id=$3 and state in('approved','active','settled') limit 1",
            [c.tenantId, r.company_id, comp.id],
          )
        ).rowCount
      )
        fail(
          "Loan recovery uses its governed loan schedule. Exclude that reference rather than creating another deduction.",
        );
      adjustment = "settlement-adjustment-" + randomUUID();
      const amount = settlementPayrollDecimal(line.amount_minor, currency.decimal_places);
      const record = (
        await client.query(
          "insert into hr_payroll_adjustment(id,tenant_id,company_id,employee_id,component_id,effective_month,amount,reason,created_by,workflow_managed) values($1,$2,$3,$4,$5,$6,$7,$8,$9,true) returning *",
          [
            adjustment,
            c.tenantId,
            r.company_id,
            r.employee_id,
            comp.id,
            month,
            amount,
            ("Settlement " + r.id + " line " + (map.line_index + 1) + ": " + input.reason).slice(0, 500),
            c.actor.userId,
          ],
        )
      ).rows[0];
      await client.query(
        "insert into hr_payroll_workspace_event(tenant_id,id,company_id,record_id,record_type,action,reason,actor_id,before_json,after_json,source_hash) values($1,$2,$3,$4,'adjustment','create_from_settlement',$5,$6,null,$7::jsonb,$8)",
        [
          c.tenantId,
          "payroll-event-" + randomUUID(),
          r.company_id,
          adjustment,
          input.reason,
          c.actor.userId,
          JSON.stringify(record),
          attendanceHash(record),
        ],
      );
    } else if (map.exclusion_reason.trim().length < 5) fail("Record why each excluded line must not enter Payroll.");
    await client.query(
      "insert into hr_settlement_payroll_link(tenant_id,company_id,id,case_id,line_index,revision,adjustment_id,component_id,effective_month,source_version,source_terms,reason,exclusion_reason,created_by) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$13,$14)",
      [
        c.tenantId,
        r.company_id,
        "settlement-link-" + randomUUID(),
        r.id,
        map.line_index,
        (old?.revision ?? 0) + 1,
        adjustment,
        map.component_id,
        month,
        r.version,
        JSON.stringify(r.terms),
        input.reason,
        map.exclusion_reason,
        c.actor.userId,
      ],
    );
    changes++;
  }
  if (!changes)
    fail("These lines already have retained Payroll inputs or exclusions. Refresh to review their progress.");
  return {
    action: "prepare_payroll",
    reason: input.reason,
    statement_id: r.id,
    source_version: r.version,
    links: await settlementPayrollLinks(client, c, r),
    payment_status: "banking_deferred",
  };
}

/** Recheck derived-input authority before even replaying a Payroll decision. */
export async function requireSettlementPayrollDecision(
  client: PoolClient,
  c: HrActorContext,
  company: string,
  id: string,
  action: string,
) {
  if (!["approve", "reject"].includes(action)) return;
  const source = (
    await client.query(
      "select c.created_by,c.submitted_by,c.employee_id,l.created_by as prepared_by,exists(select 1 from hr_settlement_encashment_source src where src.tenant_id=c.tenant_id and src.case_id=c.id and src.created_by=$4 and exists(select 1 from jsonb_array_elements(c.terms->'lines') ln where ln->>'encashment_source_id'=src.id)) as encashment_calculated_by_actor,exists(select 1 from hr_settlement_benefit_source src where src.tenant_id=c.tenant_id and src.case_id=c.id and src.created_by=$4 and exists(select 1 from jsonb_array_elements(c.terms->'lines') ln where ln->>'benefit_source_id'=src.id)) as calculated_by_actor from hr_settlement_payroll_link l join hr_lifecycle_case c on c.tenant_id=l.tenant_id and c.id=l.case_id where l.tenant_id=$1 and l.company_id=$2 and l.adjustment_id=$3",
      [c.tenantId, company, id, c.actor.userId],
    )
  ).rows[0];
  if (!source) return;
  const key = "hr.payroll.adjustment.approve";
  await requireHrCompanyPermission(client, c, company, key);
  const self = (
    await client.query(
      "select 1 from employee_user_binding where tenant_id=$1 and employee_id=$2 and user_id=$3 and ended_at is null",
      [c.tenantId, source.employee_id, c.actor.userId],
    )
  ).rowCount;
  if (
    !c.actor.permissions.includes(key) ||
    self ||
    source.calculated_by_actor ||
    source.encashment_calculated_by_actor ||
    [source.created_by, source.submitted_by, source.prepared_by].includes(c.actor.userId)
  )
    throw new HrApiError(
      403,
      "HR_SETTLEMENT_INDEPENDENT_PAYROLL_REVIEW_REQUIRED",
      "A separate officer with current company Payroll approval authority must decide settlement inputs.",
    );
}
