import type { PoolClient } from "pg";
import type { HrAttendanceCloseEmployee } from "@nexora/contracts";
import { attendanceHash } from "./attendance-completion.js";
import {
  ExactPayrollAmount as Money,
  PayrollCalculationError,
  type PayrollCalculationLine,
} from "./payroll-calculation.js";
import {
  executeStatutoryFormula,
  statutoryFormulaConfigurationSchema,
  type StatutoryRuleSource,
} from "./payroll-statutory-rules.js";
import type { StatutoryBaseline, StatutoryExecution } from "./payroll-statutory.js";

type Output = StatutoryExecution["outputs"][number];
type Row = Record<string, unknown>;
/** Resolve only dates at this employee/company's source boundaries. Failed segments never produce partial money. */
export async function executeStatutoryContexts(
  client: PoolClient,
  tenant: string,
  company: string,
  payload: HrAttendanceCloseEmployee,
  baseline: StatutoryBaseline,
  scale: number,
  original: StatutoryExecution,
  stable: (payload: HrAttendanceCloseEmployee) => Promise<StatutoryExecution>,
): Promise<StatutoryExecution> {
  const days = [...payload.days].sort((a, b) => a.on_date.localeCompare(b.on_date)),
    from = days[0]?.on_date,
    to = days.at(-1)?.on_date;
  if (!from || !to || days.length > 31 || new Set(days.map((d) => d.on_date)).size !== days.length) return original;
  const dates = (
    await client.query<{ on_date: string }>(
      `
    with ranges as (
      select effective_from,effective_to from company_legal_profile where tenant_id=$1 and company_id=$2 and state in('approved','active')
      union all select effective_from,effective_to from company_payroll_configuration where tenant_id=$1 and company_id=$2 and status in('approved','active')
      union all select effective_from,effective_to from employee_assignment where tenant_id=$1 and company_id=$2 and employee_id=$3 and assignment_status in('active','ended','legacy_compatibility')
      union all select effective_from,effective_to from hr_work_location_profile where tenant_id=$1 and company_id=$2 and state in('approved','active') and work_location_id in(select work_location_id from employee_assignment where tenant_id=$1 and company_id=$2 and employee_id=$3 and effective_from<=$5::date and(effective_to is null or effective_to>=$4::date))
      union all select effective_from,effective_to from company_localization_activation where tenant_id=$1 and company_id=$2 and state='active'
      union all select v.effective_from,v.effective_to from localization_pack_version v where v.id in(select pack_version_id from company_localization_activation where tenant_id=$1 and company_id=$2 and state='active')
      union all select v.effective_from,v.effective_to from hr_statutory_rule_version v where v.pack_version_id in(select pack_version_id from company_localization_activation where tenant_id=$1 and company_id=$2 and state='active')
      union all select effective_from,null::date from hr_employee_statutory_declaration where tenant_id=$1 and company_id=$2 and employee_id=$3 and state='approved'
      union all select effective_from,effective_to from hr_company_statutory_parameter where tenant_id=$1 and company_id=$2 and state='approved'
      union all select effective_from,effective_to from hr_employee_jurisdiction_override where tenant_id=$1 and company_id=$2 and employee_id=$3 and state='approved'
    ), edges as(select effective_from as on_date from ranges union select effective_to+1 from ranges where effective_to is not null)
    select on_date::text from edges where on_date>$4::date and on_date<=$5::date order by on_date limit 32`,
      [tenant, company, payload.employee_id, from, to],
    )
  ).rows;
  if (!dates.length) return original;
  const boundaries = dates.map((d) => d.on_date),
    parts: (typeof days)[] = [];
  for (const day of days) {
    const position = boundaries.filter((d) => d <= day.on_date).length;
    (parts[position] ??= []).push(day);
  }
  const contexts: { from: string; to: string; days: number; execution: StatutoryExecution }[] = [];
  for (const part of parts.filter((p) => p?.length)) {
    // Full-period header values remain the reviewed monthly basis; only context resolution uses the subrange.
    const execution = await stable({ ...payload, days: part });
    if (execution.status !== "ready")
      return {
        ...original,
        blockers: [`Statutory context ${part[0]!.on_date}–${part.at(-1)!.on_date}: ${execution.blockers.join(" ")}`],
      };
    contexts.push({ from: part[0]!.on_date, to: part.at(-1)!.on_date, days: part.length, execution });
  }
  const blocked = (message: string): StatutoryExecution => ({ ...original, blockers: [message] });
  if (contexts.length < 2 || contexts.reduce((n, c) => n + c.days, 0) !== days.length) return original;
  try {
    const groups = new Map<string, { output: Output; days: number; contexts: Row[] }>();
    for (const context of contexts)
      for (const output of context.execution.outputs) {
        const config = statutoryFormulaConfigurationSchema.parse(output.rule.configuration_json);
        const referenced = new Set(
          (config.formula + " " + JSON.stringify(output.rule.applicability_json)).match(/[A-Z][A-Z0-9_]*/g) ?? [],
        );
        const used = Object.fromEntries(Object.entries(output.inputs).filter(([k]) => referenced.has(k)));
        // Identity/date/evidence changes do not themselves duplicate an otherwise unchanged monthly liability.
        const key = attendanceHash({
          rule: output.rule.id,
          inputs: used,
          component: output.component?.id,
          calculation: output.calculation,
        });
        const group = groups.get(key) ?? { output, days: 0, contexts: [] };
        group.days += context.days;
        group.contexts.push({
          effective_from: context.from,
          effective_to: context.to,
          calendar_days: context.days,
          inputs: output.inputs,
          sources: output.sources,
          input_hash: output.input_hash,
          monthly_calculation: output.calculation,
        });
        groups.set(key, group);
      }
    if (groups.size > 200) return blocked("The resolved context set exceeds 200 statutory rule/input groups.");
    const aggregate = new Map<string, Output>();
    for (const group of groups.values()) {
      const o = group.output,
        config = statutoryFormulaConfigurationSchema.parse(o.rule.configuration_json);
      if (group.days > days.length) return blocked("Statutory rule coverage overlaps inside the earned period.");
      if (group.days !== days.length && !config.context_basis)
        return blocked(
          "A changing statutory rule or input needs a published calendar-weighted monthly context policy and reviewed partial-period vectors. No allocation is inferred.",
        );
      const inputs = {
        ...o.inputs,
        ...(config.context_basis ? { CONTEXT_DAYS: String(group.days), EARNED_PERIOD_DAYS: String(days.length) } : {}),
      };
      const calculation = executeStatutoryFormula(o.rule as StatutoryRuleSource, inputs);
      const evidence = {
        allocated_days: group.days,
        earned_period_days: days.length,
        context_basis: config.context_basis ?? "unchanged_monthly",
        contexts: group.contexts,
        calculation,
      };
      const prior = aggregate.get(String(o.rule.id));
      if (prior) {
        prior.calculation = {
          ...prior.calculation,
          applicable: prior.calculation.applicable || calculation.applicable,
          amount: Money.parse(prior.calculation.amount).add(Money.parse(calculation.amount)).decimal(scale),
        };
        (prior.sources.context_groups as Row[]).push(evidence);
      } else
        aggregate.set(String(o.rule.id), {
          ...o,
          calculation,
          inputs,
          sources: { context_groups: [evidence] },
          input_hash: "",
          output_hash: "",
        });
    }
    const outputs = [...aggregate.values()],
      lines: PayrollCalculationLine[] = [];
    let gross = Money.parse(baseline.gross),
      deductions = Money.parse(baseline.deductions),
      employer = Money.parse("0");
    for (const o of outputs) {
      o.input_hash = attendanceHash({ rule: o.rule.id, groups: o.sources.context_groups });
      o.output_hash = attendanceHash({ calculation: o.calculation, rule_id: o.rule.id, input_hash: o.input_hash });
      const c = o.calculation;
      if (c.applicable && c.line_kind !== "informational") {
        if (!o.component) throw new PayrollCalculationError("A context output has no retained company pay component.");
        const amount = Money.parse(c.amount);
        if (c.line_kind === "earning") gross = gross.add(amount);
        else if (c.line_kind === "deduction") deductions = deductions.add(amount);
        else employer = employer.add(amount);
        lines.push({
          component_id: String(o.component.id),
          component_code: String(o.component.code),
          component_name: String(o.component.name),
          kind: c.line_kind,
          amount: c.amount,
          expense_account_id: o.component.expense_account_id as string | null,
          liability_account_id: o.component.liability_account_id as string | null,
          source: "statutory:" + o.rule.id,
        });
      }
    }
    if (gross.compare(deductions) < 0) return blocked("Allocated statutory deductions exceed total employee earnings.");
    const retained = contexts.map((c) => ({
      effective_from: c.from,
      effective_to: c.to,
      calendar_days: c.days,
      legal_profile_id: c.execution.profile!.id,
      locations: c.execution.locations,
      ...(c.execution.overrides?.length
        ? { overrides: c.execution.overrides.map((o) => o.id), jurisdiction_scopes: c.execution.jurisdiction_scopes }
        : {}),
      packs: c.execution.packs.map((p) => p.pack_version_id),
      input_hash: c.execution.input_hash,
      resolved_set_hash: c.execution.resolved_set_hash,
    }));
    const packs = [...new Map(contexts.flatMap((c) => c.execution.packs).map((p) => [p.pack_version_id, p])).values()];
    if (packs.length > 50) return blocked("The resolved context set exceeds 50 published statutory packs.");
    return {
      ...contexts[0]!.execution,
      overrides: [...new Map(contexts.flatMap((c) => c.execution.overrides ?? []).map((o) => [o.id, o])).values()],
      jurisdiction_scopes: contexts.flatMap((c) => c.execution.jurisdiction_scopes ?? []),
      outputs,
      lines,
      gross: gross.decimal(scale),
      deductions: deductions.decimal(scale),
      net: gross.subtract(deductions).decimal(scale),
      employer_contributions: employer.decimal(scale),
      packs,
      locations: contexts.flatMap((c) => c.execution.locations),
      context_segments: retained,
      input_hash: attendanceHash({ contexts: retained, outputs: outputs.map((o) => o.input_hash) }),
      resolved_set_hash: attendanceHash({ contexts: retained, outputs: outputs.map((o) => o.rule.id) }),
    };
  } catch (error) {
    if (error instanceof PayrollCalculationError) return blocked(error.message);
    throw error;
  }
}
