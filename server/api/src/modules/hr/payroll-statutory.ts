import { resolvePayrollJurisdiction } from "./payroll-jurisdiction.js";
import { executeStatutoryContexts } from "./payroll-statutory-context.js";
import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { ZodError } from "zod";
import type { HrAttendanceCloseEmployee } from "@nexora/contracts";
import { attendanceHash } from "./attendance-completion.js";
import {
  ExactPayrollAmount as Money,
  PayrollCalculationError,
  type PayrollCalculationLine,
} from "./payroll-calculation.js";
import {
  executeStatutoryFormula,
  verifyStatutoryVectors,
  statutoryFormulaConfigurationSchema,
  type StatutoryRuleSource,
} from "./payroll-statutory-rules.js";
type Row = Record<string, unknown>;
export type StatutoryExecutionMode = "production" | "test";
export type StatutoryBaseline = { gross: string; deductions: string; net: string; lines: PayrollCalculationLine[] };
type Output = {
  rule: Row;
  component: Row | null;
  calculation: ReturnType<typeof executeStatutoryFormula>;
  inputs: Record<string, string>;
  sources: Row;
  input_hash: string;
  output_hash: string;
};
export type StatutoryExecution = {
  context_segments?: Row[];
  overrides?: Row[];
  jurisdiction_scopes?: Row[];
  status: "ready" | "blocked";
  blockers: string[];
  outputs: Output[];
  lines: PayrollCalculationLine[];
  gross: string;
  deductions: string;
  net: string;
  employer_contributions: string;
  taxable_gross: string;
  profile: Row | null;
  locations: Row[];
  packs: Row[];
  input_hash: string;
  resolved_set_hash: string;
  mode: StatutoryExecutionMode;
};
function fail(message: string): never {
  throw new PayrollCalculationError(message);
}
const covers = (r: Row, from: string, to: string) =>
  String(r.effective_from) <= from && (!r.effective_to || String(r.effective_to) >= to);
function one(rows: Row[], message: string) {
  if (rows.length !== 1) fail(message);
  return rows[0]!;
}
export async function executePublishedStatutory(
  client: PoolClient,
  tenant: string,
  company: string,
  month: string,
  payload: HrAttendanceCloseEmployee,
  baseline: StatutoryBaseline,
  currency: string,
  scale: number,
  mode: StatutoryExecutionMode,
): Promise<StatutoryExecution> {
  const original = await executeStableStatutory(
    client,
    tenant,
    company,
    month,
    payload,
    baseline,
    currency,
    scale,
    mode,
  );
  if (original.status === "ready") return original;
  return executeStatutoryContexts(client, tenant, company, payload, baseline, scale, original, (p) =>
    executeStableStatutory(
      client,
      tenant,
      company,
      month,
      p,
      baseline,
      currency,
      scale,
      mode,
      payload.days.length,
      true,
    ),
  );
}
async function executeStableStatutory(
  client: PoolClient,
  tenant: string,
  company: string,
  month: string,
  payload: HrAttendanceCloseEmployee,
  baseline: StatutoryBaseline,
  currency: string,
  scale: number,
  mode: StatutoryExecutionMode,
  earnedDays = payload.days.length,
  contextProbe = false,
): Promise<StatutoryExecution> {
  const blocked = (message: string): StatutoryExecution => ({
    status: "blocked",
    blockers: [message],
    outputs: [],
    lines: [],
    gross: baseline.gross,
    deductions: baseline.deductions,
    net: baseline.net,
    employer_contributions: "0",
    taxable_gross: "0",
    profile: null,
    locations: [],
    packs: [],
    input_hash: attendanceHash({ blocked: message }),
    resolved_set_hash: attendanceHash({ blocked: message }),
    mode,
  });
  try {
    const dates = payload.days.map((d) => d.on_date).sort(),
      from = dates[0]!,
      to = dates.at(-1)!,
      scope = [tenant, company, from, to];
    const profiles = (
      await client.query(
        `select id,country_code,registered_jurisdiction_id,legal_entity_type_id,effective_from::text,effective_to::text,state,approved_by,approved_at from company_legal_profile where tenant_id=$1 and company_id=$2 and state in('approved','active') and effective_from<=$4::date and (effective_to is null or effective_to>=$3::date) for share`,
        scope,
      )
    ).rows;
    const profile = one(
      profiles.filter((r) => covers(r, from, to)),
      "Statutory execution requires one approved company legal profile covering the earned period.",
    );
    if (profiles.length !== 1 || !profile.approved_by || !profile.approved_at)
      fail("Changing or unreviewed legal-employer context requires a segmented statutory executor.");
    const references = (
      await client.query(
        `select c.subnational_mode,c.status as country_status,c.valid_from::text as country_from,c.valid_to::text as country_to,e.status as entity_status,e.valid_from::text as entity_from,e.valid_to::text as entity_to from country c join legal_entity_type e on e.country_code=c.code and e.id=$2 where c.code=$1 for share of c,e`,
        [profile.country_code, profile.legal_entity_type_id],
      )
    ).rows;
    if (
      references.length !== 1 ||
      references.some(
        (r) =>
          r.country_status !== "active" ||
          r.entity_status !== "active" ||
          r.country_from > from ||
          (r.country_to && r.country_to < to) ||
          r.entity_from > from ||
          (r.entity_to && r.entity_to < to),
      )
    )
      fail("Country and legal-entity reference data must be active throughout the earned period.");
    const configurations = (
      await client.query(
        `select id,payroll_currency,payroll_frequency,effective_from::text,effective_to::text,status from company_payroll_configuration where tenant_id=$1 and company_id=$2 and status in('approved','active') and effective_from<=$4::date and (effective_to is null or effective_to>=$3::date) for share`,
        scope,
      )
    ).rows;
    const configuration = one(
      configurations.filter((r) => covers(r, from, to)),
      "Statutory execution requires one reviewed Payroll currency/frequency configuration.",
    );
    if (
      configurations.length !== 1 ||
      configuration.payroll_currency !== currency ||
      configuration.payroll_frequency !== "monthly"
    )
      fail("Statutory configuration must match this fixed monthly Payroll currency and period.");
    const assignments = (
      await client.query(
        `select id,work_location_id,effective_from::text,effective_to::text from employee_assignment where tenant_id=$1 and company_id=$2 and employee_id=$5 and assignment_status in('active','ended','legacy_compatibility') and effective_from<=$4::date and (effective_to is null or effective_to>=$3::date) for share`,
        [...scope, payload.employee_id],
      )
    ).rows;
    const assignment = one(
      assignments.filter((r) => covers(r, from, to)),
      "Statutory execution needs one effective employee placement covering the earned period.",
    );
    if (assignments.length !== 1)
      fail("A placement change within the earned period requires segmented statutory resolution.");
    const locations = (
      await client.query(
        `select id,work_location_id,country_code,jurisdiction_id,effective_from::text,effective_to::text,state,approved_by,approved_at from hr_work_location_profile where tenant_id=$1 and company_id=$2 and work_location_id=$5 and state in('approved','active') and effective_from<=$4::date and (effective_to is null or effective_to>=$3::date) for share`,
        [...scope, assignment.work_location_id],
      )
    ).rows;
    const location = one(
      locations.filter((r) => covers(r, from, to)),
      "Statutory execution needs one reviewed work-location jurisdiction profile.",
    );
    if (
      locations.length !== 1 ||
      location.country_code !== profile.country_code ||
      !location.approved_by ||
      !location.approved_at
    )
      fail("Changing or foreign work-location context requires explicit statutory jurisdiction resolution.");
    const jurisdiction = await resolvePayrollJurisdiction(
        client,
        tenant,
        company,
        payload.employee_id,
        from,
        to,
        assignment,
        profile,
        location,
        references[0]!.subnational_mode,
      ),
      { jurisdictions } = jurisdiction;
    let packs = (
      await client.query(
        `select a.id as activation_id,a.pack_version_id,a.effective_from::text as activation_from,a.effective_to::text as activation_to,a.approved_by,a.approved_at,v.pack_id,v.status as version_status,v.effective_from::text,v.effective_to::text,v.artifact_hash,v.content_hash,p.target_jurisdiction_id,p.publisher_scope,p.publisher_tenant_id,p.country_code,p.status as pack_status,r.report_json,r.artifact_hash as release_artifact from company_localization_activation a join localization_pack_version v on v.id=a.pack_version_id join localization_pack p on p.id=v.pack_id left join localization_import_release r on r.pack_version_id=v.id where a.tenant_id=$1 and a.company_id=$2 and a.legal_profile_id=$5 and a.state='active' and a.effective_from<=$4::date and (a.effective_to is null or a.effective_to>=$3::date) and a.target_jurisdiction_id=any($6::text[]) order by p.target_jurisdiction_id,v.pack_id,v.id for share of a,v,p`,
        [...scope, profile.id, jurisdictions.map((j) => j.id)],
      )
    ).rows;
    if (!packs.length || packs.length > 50 || new Set(packs.map((p) => p.pack_id)).size !== packs.length)
      fail(
        "Activate one bounded, unambiguous published statutory pack set for the legal employer and work jurisdiction.",
      );
    for (const p of packs) {
      const report = (p.report_json ?? {}) as Row;
      if (
        p.pack_status !== "active" ||
        !["approved", "active"].includes(p.version_status) ||
        !covers(p, from, to) ||
        p.activation_from > from ||
        (p.activation_to && p.activation_to < to) ||
        !p.approved_by ||
        !p.approved_at ||
        p.country_code !== profile.country_code ||
        (p.publisher_scope === "tenant" && p.publisher_tenant_id !== tenant) ||
        p.artifact_hash !== p.release_artifact
      )
        fail("Statutory activation and published pack provenance do not cover this employee period.");
      if (
        report.execution_contract !== "safe_formula_v1" ||
        !(report.classification === "production" || (mode === "test" && report.classification === "synthetic"))
      )
        fail("The activated statutory release is not approved for this execution contract/environment.");
    }
    const dependencies = (
      await client.query(
        `select dependent_pack_version_id,required_pack_version_id from localization_pack_dependency where dependent_pack_version_id=any($1::text[])`,
        [packs.map((p) => p.pack_version_id)],
      )
    ).rows;
    if (dependencies.some((d) => !packs.some((p) => p.pack_version_id === d.required_pack_version_id)))
      fail("The activated statutory pack set is missing a required published dependency.");
    let rules = (
      await client.query(
        `select v.*,v.effective_from::text,v.effective_to::text,r.category as rule_scope from hr_statutory_rule_version v join hr_statutory_rule r on r.id=v.rule_id and r.pack_id=(select pack_id from localization_pack_version where id=v.pack_version_id) where v.pack_version_id=any($1::text[]) and v.effective_from<=$3::date and (v.effective_to is null or v.effective_to>=$2::date) order by r.category,r.rule_key,v.id limit 201`,
        [packs.map((p) => p.pack_version_id), from, to],
      )
    ).rows;
    const scoped = jurisdiction.select(packs, rules);
    rules = scoped.rules;
    packs = scoped.packs;
    if (
      dependencies.some(
        (d) =>
          packs.some((p) => p.pack_version_id === d.dependent_pack_version_id) &&
          !packs.some((p) => p.pack_version_id === d.required_pack_version_id),
      )
    )
      fail("The scoped statutory pack set is missing a required published dependency.");
    if (
      !rules.length ||
      rules.length > 200 ||
      new Set(rules.map((r) => r.rule_id)).size !== rules.length ||
      rules.some((r) => !covers(r, from, to)) ||
      packs.some((p) => !rules.some((r) => r.pack_version_id === p.pack_version_id))
    )
      fail("Statutory rules are missing, ambiguous, too numerous or require within-period segmentation.");
    const components = (
      await client.query(
        `select c.id,c.code,c.name,c.kind,c.taxable,c.status,c.expense_account_id,c.liability_account_id,e.type as expense_type,e.status as expense_status,e.is_header as expense_header,l.type as liability_type,l.status as liability_status,l.is_header as liability_header from hr_pay_component c left join account e on e.tenant_id=c.tenant_id and e.company_id=c.company_id and e.id=c.expense_account_id left join account l on l.tenant_id=c.tenant_id and l.company_id=c.company_id and l.id=c.liability_account_id where c.tenant_id=$1 and c.company_id=$2`,
        [tenant, company],
      )
    ).rows;
    let taxable = new Money(0n);
    for (const line of baseline.lines) {
      const c = components.find((c) => c.id === line.component_id);
      if (!c) fail("A baseline pay component is missing from the legal-employer company.");
      if (line.kind === "earning" && c.taxable) taxable = taxable.add(Money.parse(line.amount));
    }
    const runtime: Record<string, string> = {
        GROSS: baseline.gross,
        TAXABLE_GROSS: taxable.decimal(scale),
        DEDUCTIONS_BEFORE_STATUTORY: baseline.deductions,
        NET_BEFORE_STATUTORY: baseline.net,
        PAID_DAYS: payload.paid_days,
        UNPAID_DAYS: payload.unpaid_days,
        CALENDAR_DAYS: payload.calendar_days,
      },
      outputs: Output[] = [],
      lines: PayrollCalculationLine[] = [];
    let gross = Money.parse(baseline.gross),
      deductions = Money.parse(baseline.deductions),
      employer = new Money(0n);
    for (const rule of rules) {
      if (
        !["additive", "independent"].includes(rule.stacking_operation) ||
        !Array.isArray(rule.source_references_json) ||
        !rule.source_references_json.length
      )
        fail("A statutory rule requires supported stacking and reviewed source references.");
      const vectors = (
        await client.query(
          `select vector_kind,canonical_inputs_json,expected_outputs_json,rounding_expectations_json from hr_statutory_rule_test_vector where rule_version_id=$1 and pack_version_id=$2 order by scenario_key limit 101`,
          [rule.id, rule.pack_version_id],
        )
      ).rows;
      verifyStatutoryVectors(rule as StatutoryRuleSource, vectors);
      const config = statutoryFormulaConfigurationSchema.parse(rule.configuration_json);
      if (config.currency_code !== currency || config.money_scale !== scale)
        fail("Released statutory rule currency/precision must match Payroll.");
      const names = new Set(
          (config.formula + " " + JSON.stringify(rule.applicability_json)).match(/[A-Z][A-Z0-9_]*/g) ?? [],
        ),
        inputs: Record<string, string> = {
          ...runtime,
          ...(config.context_basis ? { CONTEXT_DAYS: String(earnedDays), EARNED_PERIOD_DAYS: String(earnedDays) } : {}),
        },
        sources: Row = { jurisdiction_context: scoped.resolutions.find((s) => s.rule_scope === rule.rule_scope) };
      const needsDeclaration = [...names].some((n) =>
        [
          "ESTIMATED_ANNUAL_SALARY",
          "PRIOR_TAXABLE_SALARY",
          "PRIOR_SALARY_TAX_WITHHELD",
          "DOCUMENTED_TAX_CREDIT",
          "OTHER_TAX_WITHHELD",
          "EOBI_APPLICABLE",
          "EOBI_BASE",
          "TAX_YEAR",
        ].includes(n),
      );
      if (needsDeclaration) {
        if (!config.tax_year) fail("A declaration-dependent statutory rule must specify its tax year.");
        const declarations = (
          await client.query(
            `select id,effective_from::text,version_number,currency_code,estimated_annual_salary::text,prior_taxable_salary::text,prior_salary_tax_withheld::text,documented_tax_credit::text,other_tax_withheld::text,eobi_applicability,provincial_social_security_status,evidence_hash,approved_by,approved_at from hr_employee_statutory_declaration where tenant_id=$1 and company_id=$2 and employee_id=$3 and jurisdiction_id=$4 and tax_year=$5 and state='approved' and effective_from<=$6::date order by effective_from desc,version_number desc limit 2`,
            [
              tenant,
              company,
              payload.employee_id,
              packs.find((p) => p.pack_version_id === rule.pack_version_id)!.target_jurisdiction_id,
              config.tax_year,
              to,
            ],
          )
        ).rows;
        const declaration = declarations[0];
        if (
          !declaration ||
          declaration.currency_code !== currency ||
          !declaration.evidence_hash ||
          !declaration.approved_by ||
          !declaration.approved_at ||
          declaration.provincial_social_security_status !== "assessed_not_applicable"
        )
          fail("This statutory rule needs an unambiguous approved declaration and any required external scheme pack.");
        if (declaration.effective_from > from)
          fail("A declaration change inside the earned period requires segmented statutory execution.");
        sources.declaration = declaration;
        Object.assign(inputs, {
          ESTIMATED_ANNUAL_SALARY: declaration.estimated_annual_salary,
          PRIOR_TAXABLE_SALARY: declaration.prior_taxable_salary,
          PRIOR_SALARY_TAX_WITHHELD: declaration.prior_salary_tax_withheld,
          DOCUMENTED_TAX_CREDIT: declaration.documented_tax_credit,
          OTHER_TAX_WITHHELD: declaration.other_tax_withheld,
          EOBI_APPLICABLE: declaration.eobi_applicability === "applicable" ? "1" : "0",
          TAX_YEAR: String(config.tax_year),
        });
      }
      if (names.has("EOBI_BASE")) {
        if (inputs.EOBI_APPLICABLE === "0") {
          inputs.EOBI_BASE = "0";
        } else {
          const parameters = (
            await client.query(
              `select id,amount::text,currency_code,effective_from::text,effective_to::text,evidence_hash,approved_by,approved_at from hr_company_statutory_parameter where tenant_id=$1 and company_id=$2 and jurisdiction_id=$3 and scheme_code='eobi' and parameter_key='contribution_base' and state='approved' and effective_from<=$4::date and (effective_to is null or effective_to>=$5::date)`,
              [
                tenant,
                company,
                packs.find((p) => p.pack_version_id === rule.pack_version_id)!.target_jurisdiction_id,
                from,
                to,
              ],
            )
          ).rows;
          const parameter = one(
            parameters,
            "An applicable EOBI formula requires one approved explicit contribution base.",
          );
          if (parameter.currency_code !== currency || !parameter.evidence_hash)
            fail("The statutory contribution base currency/evidence is invalid.");
          inputs.EOBI_BASE = String(parameter.amount);
          sources.parameter = parameter;
        }
      }
      if (names.has("YTD_TAXABLE_SALARY") || names.has("YTD_SALARY_TAX_WITHHELD")) {
        if (
          !config.tax_year_start ||
          !config.ytd_states ||
          config.tax_year_start > from ||
          !config.tax_year_start.endsWith("-01")
        )
          fail("YTD statutory rules require explicit tax-year start and recognition states.");
        const prior = (
          await client.query(
            `select r.id,r.currency_code,coalesce(pc.corrected->'statutory'->>'taxable_gross',r.execution_evidence->'statutory'->>'taxable_gross') as taxable,r.execution_evidence->'statutory'->>'status' as statutory_status,case when pc.corrected is not null then coalesce((select sum((o->'calculation'->>'amount')::numeric)::text from jsonb_array_elements(pc.corrected->'statutory'->'outputs') o where o->'rule'->>'rule_id'=$7 and o->'calculation'->>'line_kind'='deduction'),'0') else coalesce((select sum(l.employee_amount)::text from hr_payroll_statutory_snapshot s join hr_payroll_statutory_snapshot_line l on l.tenant_id=s.tenant_id and l.snapshot_id=s.id join hr_statutory_rule_version rv on rv.id=l.rule_version_id where s.tenant_id=r.tenant_id and s.payroll_result_id=r.id and s.state='sealed' and l.line_kind='deduction' and rv.rule_id=$7),'0') end as withheld from hr_payroll_result r join hr_payroll_period p on p.tenant_id=r.tenant_id and p.company_id=r.company_id and p.id=r.period_id and p.run_number=r.run_number left join lateral(select effective_hr_payroll_correction(r.tenant_id,r.company_id,r.id) as corrected) pc on true where r.tenant_id=$1 and r.company_id=$2 and r.employee_id=$3 and p.month>=$4::date and p.month<$5::date and p.state=any($6::text[]) order by p.month,r.id`,
            [tenant, company, payload.employee_id, config.tax_year_start, month, config.ytd_states, rule.rule_id],
          )
        ).rows;
        if (prior.some((r) => r.currency_code !== currency || r.statutory_status !== "ready" || r.taxable === null))
          fail("Authoritative YTD results contain legacy or unresolved statutory evidence.");
        inputs.YTD_TAXABLE_SALARY = prior.reduce((n, r) => n.add(Money.parse(r.taxable)), new Money(0n)).decimal(scale);
        inputs.YTD_SALARY_TAX_WITHHELD = prior
          .reduce((n, r) => n.add(Money.parse(r.withheld)), new Money(0n))
          .decimal(scale);
        sources.prior_results = prior;
      }
      const calculation = executeStatutoryFormula(rule as StatutoryRuleSource, inputs),
        component =
          calculation.component_code === null
            ? null
            : (components.find((c) => c.code === calculation.component_code) ?? null);
      if (
        calculation.line_kind !== "informational" &&
        (!component ||
          component.status !== "active" ||
          component.kind !== calculation.line_kind ||
          baseline.lines.some((l) => l.component_code === calculation.component_code))
      )
        fail("A statutory output needs a distinct active company component of the matching kind.");
      if (component && calculation.line_kind !== "informational") {
        const expense = ["earning", "employer_contribution"].includes(calculation.line_kind),
          liability = ["deduction", "employer_contribution"].includes(calculation.line_kind);
        if (
          (expense &&
            (!component.expense_account_id ||
              component.expense_type !== "expense" ||
              component.expense_status !== "active" ||
              component.expense_header)) ||
          (liability &&
            (!component.liability_account_id ||
              component.liability_type !== "liability" ||
              component.liability_status !== "active" ||
              component.liability_header))
        )
          fail("Statutory output accounting mappings must be active non-header expense/liability accounts.");
        if (calculation.applicable) {
          const amount = Money.parse(calculation.amount);
          if (calculation.line_kind === "earning") gross = gross.add(amount);
          else if (calculation.line_kind === "deduction") deductions = deductions.add(amount);
          else employer = employer.add(amount);
          lines.push({
            component_id: component.id,
            component_code: component.code,
            component_name: component.name,
            kind: calculation.line_kind,
            amount: calculation.amount,
            expense_account_id: component.expense_account_id,
            liability_account_id: component.liability_account_id,
            source: "statutory:" + rule.id,
          });
        }
      }
      const input_hash = attendanceHash({ inputs, sources }),
        output_hash = attendanceHash({ calculation, rule_id: rule.id, input_hash });
      outputs.push({ rule, component, calculation, inputs, sources, input_hash, output_hash });
    }
    if (!contextProbe && gross.compare(deductions) < 0) fail("Statutory deductions exceed total employee earnings.");
    return {
      status: "ready",
      blockers: [],
      ...(jurisdiction.overrides.length
        ? { overrides: jurisdiction.overrides, jurisdiction_scopes: scoped.resolutions }
        : {}),
      outputs,
      lines,
      gross: gross.decimal(scale),
      deductions: deductions.decimal(scale),
      net: gross.subtract(deductions).decimal(scale),
      employer_contributions: employer.decimal(scale),
      taxable_gross: taxable.decimal(scale),
      profile,
      locations: [{ assignment, location }],
      packs,
      input_hash: attendanceHash({
        runtime,
        ...(jurisdiction.overrides.length ? { overrides: jurisdiction.overrides, scopes: scoped.resolutions } : {}),
        outputs: outputs.map((o) => o.input_hash),
        configuration,
        profile,
        locations,
      }),
      resolved_set_hash: attendanceHash({
        packs,
        rules,
        ...(jurisdiction.overrides.length ? { overrides: jurisdiction.overrides, scopes: scoped.resolutions } : {}),
      }),
      mode,
    };
  } catch (error) {
    if (error instanceof PayrollCalculationError) return blocked(error.message);
    if (error instanceof ZodError)
      return blocked("The activated statutory rule or reviewed vectors use an unsupported execution schema.");
    throw error;
  }
}
export async function persistStatutorySnapshot(
  client: PoolClient,
  tenant: string,
  company: string,
  result: string,
  hash: string,
  stat: StatutoryExecution,
) {
  if (stat.status !== "ready") return;
  const id = "stat-snapshot-" + randomUUID();
  await client.query(
    `insert into hr_payroll_statutory_snapshot(id,tenant_id,company_id,payroll_result_id,resolver_version,calculation_engine_version,context_segments_json,company_legal_profile_id,work_location_evidence_json,override_evidence_json,input_hash,resolved_set_hash,recalculation_mode) values($1,$2,$3,$4,$11,$5,$6::jsonb,$7,$8::jsonb,$12::jsonb,$9,$10,'original')`,
    [
      id,
      tenant,
      company,
      result,
      stat.mode === "test" ? "statutory_rules_v1_test" : "statutory_rules_v1",
      JSON.stringify([
        {
          base_calculation_hash: hash,
          execution_contract: "safe_formula_v1",
          environment: stat.mode,
          ...(stat.overrides?.length
            ? { jurisdiction_resolution: "category_override_v1", jurisdiction_scopes: stat.jurisdiction_scopes }
            : {}),
          ...(stat.context_segments
            ? { context_basis: "published_monthly_context_v1", segments: stat.context_segments }
            : {}),
        },
      ]),
      stat.profile!.id,
      JSON.stringify(stat.locations),
      stat.input_hash,
      stat.resolved_set_hash,
      stat.context_segments
        ? "dated_statutory_context_v1"
        : stat.overrides?.length
          ? "scoped_jurisdiction_v1"
          : "stable_jurisdiction_v1",
      JSON.stringify(stat.overrides ?? []),
    ],
  );
  for (const [index, p] of stat.packs.entries())
    await client.query(
      `insert into hr_payroll_statutory_snapshot_pack(tenant_id,snapshot_id,position,pack_version_id) values($1,$2,$3,$4)`,
      [tenant, id, index + 1, p.pack_version_id],
    );
  for (const [index, o] of stat.outputs.entries()) {
    const n = index + 1,
      c = o.calculation;
    await client.query(
      `insert into hr_payroll_statutory_snapshot_rule(tenant_id,snapshot_id,position,rule_version_id,rule_scope,stacking_operation,output_evidence_hash) values($1,$2,$3,$4,$5,$6,$7)`,
      [tenant, id, n, o.rule.id, o.rule.rule_scope, o.rule.stacking_operation, o.output_hash],
    );
    await client.query(
      `insert into hr_payroll_statutory_snapshot_line(tenant_id,snapshot_id,position,rule_version_id,line_code,line_name,line_kind,component_code,applicable,employee_amount,employer_amount,currency_code,input_evidence_hash,output_evidence_hash,input_evidence_json,calculation_evidence_json) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb,$16::jsonb)`,
      [
        tenant,
        id,
        n,
        o.rule.id,
        c.line_code,
        c.line_name,
        c.line_kind,
        c.component_code,
        c.applicable,
        c.line_kind === "employer_contribution" ? "0" : c.amount,
        c.line_kind === "employer_contribution" ? c.amount : "0",
        c.currency_code,
        o.input_hash,
        o.output_hash,
        JSON.stringify({ inputs: o.inputs, sources: o.sources }),
        JSON.stringify(c),
      ],
    );
  }
  await client.query(
    `update hr_payroll_statutory_snapshot set state='sealed',sealed_at=now() where tenant_id=$1 and id=$2 and state='building'`,
    [tenant, id],
  );
}
