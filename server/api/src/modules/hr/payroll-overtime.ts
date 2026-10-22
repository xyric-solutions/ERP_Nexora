import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import type { HrAttendanceCloseEmployee } from "@nexora/contracts";
import { attendanceHash } from "./attendance-completion.js";
import {
  ExactPayrollAmount as Money,
  PayrollCalculationError,
  type PayrollCalculationSalary,
  type PayrollCalculationLine,
  type PayrollRounding,
} from "./payroll-calculation.js";

type Row = Record<string, unknown>;
function invalid(message: string): never {
  throw new PayrollCalculationError(message);
}
const zero = () => new Money(0n);
/** Exact intermediate quantization; final currency precision stays limited to four. */
export function overtimeDecimal(value: Money, scale: number, mode: PayrollRounding) {
  if (!Number.isInteger(scale) || scale < 0 || scale > 8) invalid("Overtime intermediate precision must be 0–8.");
  const factor = 10n ** BigInt(scale),
    digits = value.multiply(new Money(factor)).decimal(0, mode),
    negative = digits.startsWith("-"),
    unsigned = digits.replace("-", "").padStart(scale + 1, "0");
  return (negative ? "-" : "") + (scale ? unsigned.slice(0, -scale) + "." + unsigned.slice(-scale) : unsigned);
}
export type MonetaryOvertimeInput = {
  minutes: number;
  basis_amount: string;
  rate_basis_method: string;
  ordinary_hours: string | null;
  multiplier: string;
  minute_precision: number;
  hourly_rate_precision: number;
  intermediate_precision: number;
  rounding_mode: PayrollRounding;
  rounding_stage: string;
  final_currency_scale: number;
};
export function calculateOvertimeAmount(input: MonetaryOvertimeInput) {
  if (!Number.isInteger(input.minutes) || input.minutes < 1 || input.minutes > 1440)
    invalid("Approved overtime minutes must be 1–1440.");
  if (
    !["half_up", "half_even", "down", "up"].includes(input.rounding_mode) ||
    !["hourly_rate", "per_ot_day", "final_employee_period"].includes(input.rounding_stage)
  )
    invalid("Unsupported overtime rounding authority.");
  if (!Number.isInteger(input.final_currency_scale) || input.final_currency_scale < 0 || input.final_currency_scale > 4)
    invalid("Overtime currency precision must be 0–4.");
  const basis = Money.parse(input.basis_amount),
    multiplier = Money.parse(input.multiplier);
  if (basis.compare(zero()) < 0 || multiplier.compare(zero()) <= 0)
    invalid("Overtime basis must be nonnegative and multiplier positive.");
  let hourly: Money;
  if (input.rate_basis_method === "direct_hourly") {
    if (input.ordinary_hours !== null) invalid("A direct hourly option must not specify ordinary hours.");
    hourly = basis;
  } else if (["daily", "weekly", "monthly", "annual"].includes(input.rate_basis_method)) {
    if (input.ordinary_hours === null || Money.parse(input.ordinary_hours).compare(zero()) <= 0)
      invalid("Overtime conversion requires explicit positive ordinary hours.");
    hourly = basis.divide(Money.parse(input.ordinary_hours));
  } else invalid("Custom overtime conversion requires a separately verified step executor.");
  // The released policy controls conversion precision. Rate-stage rounding is
  // applied to the multiplied rate; other stages retain its exact product.
  const rate = Money.parse(overtimeDecimal(hourly, input.hourly_rate_precision, input.rounding_mode)),
    multiplied = rate.multiply(multiplier),
    appliedRate =
      input.rounding_stage === "hourly_rate"
        ? Money.parse(overtimeDecimal(multiplied, input.hourly_rate_precision, input.rounding_mode))
        : multiplied,
    minutes = Money.parse(
      overtimeDecimal(new Money(BigInt(input.minutes)), input.minute_precision, input.rounding_mode),
    ),
    hours = minutes.divide(new Money(60n)),
    raw = Money.parse(overtimeDecimal(appliedRate.multiply(hours), input.intermediate_precision, input.rounding_mode));
  return {
    engine_version: "monetary_overtime_v1",
    basis_amount: overtimeDecimal(basis, 6, input.rounding_mode),
    hourly_rate: overtimeDecimal(rate, 8, input.rounding_mode),
    overtime_hours: overtimeDecimal(hours, 8, input.rounding_mode),
    unrounded_amount: overtimeDecimal(raw, 8, input.rounding_mode),
    rounded_amount: raw.decimal(input.final_currency_scale, input.rounding_mode),
    exact_amount: raw,
  };
}
export type PayrollOvertimeLine = { line: PayrollCalculationLine; evidence: Row; salary_id: string; source: Row };
export async function calculatePublishedOvertime(
  client: PoolClient,
  tenant: string,
  company: string,
  payload: HrAttendanceCloseEmployee,
  salaries: PayrollCalculationSalary[],
  currency: string,
  scale: number,
): Promise<PayrollOvertimeLine[]> {
  const frozen = payload.days.flatMap((day) => day.overtime.map((ot) => ({ ...ot, work_date: day.on_date }))),
    ids = frozen.map((r) => r.id);
  const totals = { regular: 0, weekend: 0, holiday: 0 };
  for (const ot of frozen) totals[ot.category] += ot.minutes;
  if (
    totals.regular !== payload.overtime_regular_minutes ||
    totals.weekend !== payload.overtime_weekend_minutes ||
    totals.holiday !== payload.overtime_holiday_minutes ||
    new Set(ids).size !== ids.length
  )
    invalid("Frozen overtime totals or request identities do not reconcile.");
  if (!ids.length) return [];
  const requests = (
    await client.query(
      `select r.*,r.work_date::text,r.operational_rule_evidence_hash,rule.evidence_hash as rule_hash,rule.effective_from::text as rule_from,rule.effective_to::text as rule_to from hr_overtime_request r join hr_overtime_rule rule on rule.tenant_id=r.tenant_id and rule.company_id=r.company_id and rule.id=r.operational_rule_id where r.tenant_id=$1 and r.company_id=$2 and r.employee_id=$3 and r.id=any($4::text[]) order by r.work_date,r.id collate "C" for share of r,rule`,
      [tenant, company, payload.employee_id, ids],
    )
  ).rows;
  const authorities = (
    await client.query(
      `select a.*,a.effective_from::text as arrangement_from,a.effective_to::text as arrangement_to,a.direct_rate::text,o.*,o.id as option_id,a.id as arrangement_id,a.evidence_hash as arrangement_hash,a.state as arrangement_state,a.currency_code as arrangement_currency,a.approved_by as arrangement_approver,a.approved_at as arrangement_approved_at,v.id as version_id,v.category as policy_category,v.effective_from::text as policy_from,v.effective_to::text as policy_to,v.status as policy_status,v.evidence_hash as policy_hash,v.approved_by as policy_approver,v.approved_at as policy_approved_at,v.released_by,v.released_at,p.contractual_ot_allowed,c.id as earning_id,c.code as earning_code,c.name as earning_name,c.status as earning_status,c.kind as earning_kind,c.expense_account_id,c.liability_account_id from hr_employee_ot_arrangement a join hr_ot_monetary_policy_option o on o.tenant_id=a.tenant_id and o.company_id=a.company_id and o.id=a.policy_option_id and o.policy_version_id=a.policy_version_id join hr_ot_monetary_policy_version v on v.tenant_id=a.tenant_id and v.company_id=a.company_id and v.id=a.policy_version_id join hr_ot_monetary_policy p on p.tenant_id=v.tenant_id and p.company_id=v.company_id and p.id=v.policy_id join hr_pay_component c on c.tenant_id=o.tenant_id and c.company_id=o.company_id and c.id=o.earning_component_id where a.tenant_id=$1 and a.company_id=$2 and a.employee_id=$3 and a.state in('approved','effective') and a.effective_from<=$4::date and (a.effective_to is null or a.effective_to>=$5::date) order by a.id collate "C" for share of a,o,v,p,c`,
      [
        tenant,
        company,
        payload.employee_id,
        payload.days
          .map((d) => d.on_date)
          .sort()
          .at(-1)!,
        payload.days.map((d) => d.on_date).sort()[0]!,
      ],
    )
  ).rows;
  const selections = (
    await client.query(
      `select ac.arrangement_id,ac.component_id,ac.position from hr_employee_ot_arrangement_component ac join hr_ot_monetary_option_component oc on oc.tenant_id=ac.tenant_id and oc.company_id=ac.company_id and oc.component_id=ac.component_id join hr_employee_ot_arrangement a on a.tenant_id=ac.tenant_id and a.company_id=ac.company_id and a.id=ac.arrangement_id and oc.option_id=a.policy_option_id where ac.tenant_id=$1 and ac.company_id=$2 and a.employee_id=$3 and ac.arrangement_id=any($4::text[]) order by ac.arrangement_id,ac.position`,
      [tenant, company, payload.employee_id, authorities.map((a) => a.arrangement_id)],
    )
  ).rows;
  const lines: PayrollOvertimeLine[] = [];
  for (const ot of [...frozen].sort((a, b) => a.work_date.localeCompare(b.work_date) || a.id.localeCompare(b.id))) {
    const request = requests.find((r) => r.id === ot.id);
    if (
      !request ||
      request.status !== "approved" ||
      request.work_date !== ot.work_date ||
      request.category !== ot.category ||
      request.approved_minutes !== ot.minutes ||
      request.operational_rule_id !== ot.operational_rule_id ||
      !request.operational_rule_evidence_hash ||
      request.operational_rule_evidence_hash !== request.rule_hash ||
      request.rule_from > ot.work_date ||
      (request.rule_to && request.rule_to < ot.work_date)
    )
      invalid("Published overtime no longer matches its approved request and operational evidence.");
    const matching = authorities.filter(
      (a) =>
        a.category === ot.category &&
        a.policy_category === ot.category &&
        a.arrangement_from <= ot.work_date &&
        (!a.arrangement_to || a.arrangement_to >= ot.work_date) &&
        a.policy_from <= ot.work_date &&
        (!a.policy_to || a.policy_to >= ot.work_date),
    );
    if (matching.length !== 1)
      invalid("Each approved overtime day requires exactly one effective monetary arrangement and policy option.");
    const a = matching[0]!,
      salaryMatches = salaries.filter(
        (s) => s.effective_from <= ot.work_date && (!s.effective_to || s.effective_to >= ot.work_date),
      );
    if (salaryMatches.length !== 1) invalid("An overtime day requires exactly one effective approved salary snapshot.");
    const salary = salaryMatches[0]!;
    if (
      a.policy_status !== "released" ||
      !a.policy_hash ||
      !a.arrangement_hash ||
      !a.policy_approver ||
      !a.policy_approved_at ||
      !a.released_by ||
      !a.released_at ||
      !a.arrangement_approver ||
      !a.arrangement_approved_at
    )
      invalid("Overtime needs released monetary policy and approved arrangement evidence.");
    if (a.arrangement_currency !== currency || salary.currency_code !== currency || a.final_currency_scale !== scale)
      invalid("Overtime, salary and Payroll currency precision must match.");
    if (
      !a.allowed_compensation_types.includes(salary.compensation_type) ||
      !a.allowed_payment_bases.includes(salary.payment_basis) ||
      (salary.compensation_type === "contractual" && !a.contractual_ot_allowed)
    )
      invalid("This monetary overtime option does not permit the approved compensation basis.");
    if (a.earning_status !== "active" || a.earning_kind !== "earning" || !a.expense_account_id)
      invalid("The monetary overtime earning component is inactive or missing its expense mapping.");
    const selected = selections.filter((s) => s.arrangement_id === a.arrangement_id),
      basisComponents: Row[] = [];
    let basis = zero();
    if (a.basis_source === "direct_contractual_rate") {
      if (selected.length || !a.direct_rate)
        invalid("A direct contractual overtime rate must be explicit and have no component selection.");
      basis = Money.parse(a.direct_rate);
    } else if (a.basis_source === "selected_components") {
      if (a.direct_rate !== null || selected.length < a.minimum_components || selected.length > a.maximum_components)
        invalid("The overtime component selection does not satisfy its released option.");
      for (const selection of selected) {
        const component = salary.components.find((c) => c.id === selection.component_id);
        if (!component || component.kind !== "earning" || component.method !== "fixed" || component.amount === null)
          invalid("Overtime selected basis requires fixed earning amounts in the approved salary snapshot.");
        basis = basis.add(Money.parse(component.amount));
        basisComponents.push({ id: component.id, code: component.code, amount: component.amount });
      }
    } else invalid("Unsupported overtime basis source.");
    const method = String(a.rate_basis_method);
    if (
      (method !== "direct_hourly" && method !== salary.payment_basis) ||
      (a.basis_source === "selected_components" && method === "direct_hourly" && salary.payment_basis !== "hourly")
    )
      invalid("Overtime conversion and salary payment bases must match; no implicit basis conversion is allowed.");
    const policy: MonetaryOvertimeInput = {
        minutes: ot.minutes,
        basis_amount: overtimeDecimal(basis, 6, a.rounding_mode),
        rate_basis_method: method,
        ordinary_hours: a.ordinary_hours === null ? null : String(a.ordinary_hours),
        multiplier: String(a.multiplier),
        minute_precision: a.minute_precision,
        hourly_rate_precision: a.hourly_rate_precision,
        intermediate_precision: a.intermediate_precision,
        rounding_mode: a.rounding_mode,
        rounding_stage: a.rounding_stage,
        final_currency_scale: a.final_currency_scale,
      },
      calculation = calculateOvertimeAmount(policy),
      source = {
        request: {
          id: request.id,
          operational_rule_id: request.operational_rule_id,
          operational_rule_evidence_hash: request.operational_rule_evidence_hash,
          approved_minutes: request.approved_minutes,
          work_date: ot.work_date,
        },
        authority: a,
        basis_components: basisComponents,
        policy,
      };
    lines.push({
      salary_id: salary.id,
      source,
      line: {
        component_id: String(a.earning_id),
        component_code: String(a.earning_code),
        component_name: String(a.earning_name),
        kind: "earning",
        amount: calculation.rounded_amount,
        expense_account_id: String(a.expense_account_id),
        liability_account_id: null,
        source: "overtime:" + ot.id,
      },
      evidence: {
        ...ot,
        policy_version_id: a.version_id,
        policy_option_id: a.option_id,
        arrangement_id: a.arrangement_id,
        compensation_type: salary.compensation_type,
        payment_basis: salary.payment_basis,
        salary_assignment_id: salary.id,
        basis_components_json: basisComponents,
        ...calculation,
        exact_amount: undefined,
        currency_code: currency,
        conversion_method: method,
        ordinary_hours: policy.ordinary_hours,
        multiplier: policy.multiplier,
        rounding_mode: policy.rounding_mode,
        rounding_stage: policy.rounding_stage,
        minute_precision: policy.minute_precision,
        hourly_rate_precision: policy.hourly_rate_precision,
        intermediate_precision: policy.intermediate_precision,
        final_currency_scale: scale,
        earning_component_id: a.earning_id,
        calculation_json: { ...source, engine_version: calculation.engine_version, allocation: "per_request" },
      },
    });
  }
  // Period rounding is reconciled by cumulative rounding in date/request order.
  // Each delta is nonnegative and the evidence sums exactly to the result lines.
  const groups = new Map<string, { raw: Money; rounded: Money }>();
  for (const item of lines) {
    if (item.evidence.rounding_stage !== "final_employee_period") continue;
    const groupKey = String(item.evidence.policy_option_id),
      group = groups.get(groupKey) ?? { raw: zero(), rounded: zero() },
      mode = item.evidence.rounding_mode as PayrollRounding;
    group.raw = group.raw.add(Money.parse(String(item.evidence.unrounded_amount)));
    const rounded = Money.parse(group.raw.decimal(scale, mode));
    item.line.amount = rounded.subtract(group.rounded).decimal(scale);
    item.evidence.rounded_amount = item.line.amount;
    item.evidence.calculation_json = {
      ...(item.evidence.calculation_json as Row),
      allocation: "cumulative_option_employee_period",
      cumulative_raw: overtimeDecimal(group.raw, 8, mode),
      cumulative_rounded: rounded.decimal(scale),
    };
    group.rounded = rounded;
    groups.set(groupKey, group);
  }
  return lines;
}
export async function persistPayrollOvertime(
  client: PoolClient,
  tenant: string,
  company: string,
  employee: string,
  result: string,
  item: PayrollOvertimeLine,
  lineId: string,
  segmentId: string,
) {
  const e = item.evidence,
    id = "payroll-ot-" + randomUUID(),
    fields = [
      "id",
      "tenant_id",
      "company_id",
      "payroll_result_id",
      "payroll_result_item_id",
      "employee_id",
      "work_date",
      "approved_minutes",
      "category",
      "overtime_request_id",
      "operational_rule_id",
      "policy_version_id",
      "policy_option_id",
      "arrangement_id",
      "compensation_type",
      "payment_basis",
      "salary_assignment_id",
      "salary_segment_id",
      "basis_components_json",
      "basis_amount",
      "currency_code",
      "conversion_method",
      "ordinary_hours",
      "hourly_rate",
      "multiplier",
      "overtime_hours",
      "unrounded_amount",
      "rounded_amount",
      "rounding_mode",
      "rounding_stage",
      "minute_precision",
      "hourly_rate_precision",
      "intermediate_precision",
      "final_currency_scale",
      "earning_component_id",
      "calculation_json",
      "evidence_hash",
    ];
  const record: Row = {
    ...e,
    id,
    tenant_id: tenant,
    company_id: company,
    payroll_result_id: result,
    payroll_result_item_id: lineId,
    employee_id: employee,
    approved_minutes: e.minutes,
    overtime_request_id: e.id,
    salary_segment_id: segmentId,
    evidence_hash: attendanceHash({ evidence: e, source: item.source, amount: item.line.amount }),
  };
  await client.query(
    `insert into hr_payroll_ot_evidence(${fields.join(",")}) values(${fields.map((_, i) => "$" + (i + 1)).join(",")})`,
    fields.map((key) =>
      key === "basis_components_json" || key === "calculation_json" ? JSON.stringify(record[key]) : record[key],
    ),
  );
}
