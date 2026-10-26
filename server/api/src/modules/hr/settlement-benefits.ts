import { readSettlementCountry, settlementCountryOptions, projectSettlementCountry } from "./settlement-country.js";
import { readSettlementSalaryBasis, requireSettlementSalaryRead } from "./settlement-salary.js";
import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import {
  calculateHrSettlementMinor,
  hrLifecycleCaseTermsSchema,
  type HrSettlementBenefitAction,
  type HrSettlementBenefitQuery,
  type HrSettlementBenefitWorkspace,
  type HrLifecycleCaseTerms,
} from "@nexora/contracts";
import { HrApiError, type HrActorContext } from "./source-repository.js";
import { attendanceHash } from "./attendance-completion.js";
import { requireHrCompanyPermission } from "./company-authority.js";
import type { PayrollWorkspaceDependencies } from "./payroll-workspace.js";
import { lifecycleSettlement } from "./settlement-calculation.js";
// Scoped PostgreSQL projections are verified against contracts and immutable source guards.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;
const fail = (message: string): never => {
  throw new HrApiError(409, "HR_BENEFIT_REVIEW_REQUIRED", message);
};
const deny = (message: string): never => {
  throw new HrApiError(403, "PERMISSION_DENIED", message);
};
const permission = requireHrCompanyPermission;
async function can(client: PoolClient, c: HrActorContext, company: string, key: string) {
  try {
    await permission(client, c, company, key);
    return true;
  } catch (e) {
    if (e instanceof HrApiError && e.status === 403) return false;
    throw e;
  }
}
async function snapshot(client: PoolClient, c: HrActorContext, company: string, exitId: string, ruleId: string) {
  const rule = (
    await client.query(
      "select *,effective_from::text,effective_to::text from hr_settlement_benefit_rule where tenant_id=$1 and company_id=$2 and id=$3",
      [c.tenantId, company, ruleId],
    )
  ).rows[0] as Row | undefined;
  const exit = (
    await client.query(
      "select x.id,x.version,x.state,x.kind,x.terms,x.relationship_id,x.employee_id,r.effective_from::text employed_from,r.status employment_status,r.approval_state,concat_ws(' · ',e.employee_number,e.first_name,e.last_name) employee_name from hr_lifecycle_case x join hr_employment_relationship r on r.tenant_id=x.tenant_id and r.id=x.relationship_id join employee e on e.tenant_id=x.tenant_id and e.id=x.employee_id where x.tenant_id=$1 and x.company_id=$2 and x.id=$3 and x.kind in('resignation','termination')",
      [c.tenantId, company, exitId],
    )
  ).rows[0] as Row | undefined;
  if (!rule || !exit)
    throw new HrApiError(
      404,
      "HR_BENEFIT_NOT_FOUND",
      "Choose a company benefit rule and an approved exit in this company.",
    );
  const date = exit.terms.last_working_date as string;
  const dates = (
    await client.query(
      "select current_date::text today,($1::date-$2::date)::int service_days,extract(year from age($1::date,$2::date))::int service_years",
      [date, exit.employed_from],
    )
  ).rows[0];
  const placement = (
    await client.query(
      "select id,employee_category_id from employee_assignment where tenant_id=$1 and company_id=$2 and employee_id=$3 and employment_relationship_id=$4 and assignment_status='active' and effective_from<=$5::date and(effective_to is null or effective_to>=$5::date)",
      [c.tenantId, company, exit.employee_id, exit.relationship_id, date],
    )
  ).rows;
  const currency = (
    await client.query(
      "select code,decimal_places from currency where tenant_id=$1 and code=$2 and status='active' and decimal_places<=4",
      [c.tenantId, rule.terms.currency],
    )
  ).rows[0];
  const payroll = (
    await client.query(
      "select id,state,version,run_number from hr_payroll_period where tenant_id=$1 and company_id=$2 and month>=date_trunc('month',$3::date)::date order by month,id",
      [c.tenantId, company, date],
    )
  ).rows;
  const t = rule.terms,
    units = Math.max(
      0,
      Math.min(
        t.maximum_units,
        t.basis === "fixed_amount"
          ? 1
          : t.basis === "service_days"
            ? dates.service_days + (t.service_day_count === "inclusive" ? 1 : 0)
            : dates.service_years,
      ),
    ),
    blockers: string[] = [];
  const territorial = await readSettlementCountry(
    client,
    c,
    company,
    exit.employee_id,
    exit.relationship_id,
    date,
    "benefit",
    rule.id,
  );
  blockers.push(...territorial.blockers);
  const derived = t.salary_basis
    ? await readSettlementSalaryBasis(
        client,
        c,
        company,
        exit.employee_id,
        date,
        t.currency,
        Number(currency?.decimal_places ?? 2),
        t.salary_basis,
      )
    : null;
  if (derived) blockers.push(...derived.blockers);
  const rawRate = derived?.salary?.basis_minor ?? t.rate_minor,
    divisor = t.salary_basis?.divisor ?? t.rate_factors?.divisor ?? 1,
    multiplier = t.salary_basis?.multiplier ?? t.rate_factors?.multiplier ?? 1;
  let amount: string, unitRate: string;
  try {
    amount = calculateHrSettlementMinor(String(units), rawRate, divisor, multiplier);
    unitRate = calculateHrSettlementMinor("1", rawRate, divisor, multiplier);
  } catch {
    throw new HrApiError(
      409,
      "HR_BENEFIT_REVIEW_REQUIRED",
      "The salary-based amount exceeds the supported exact limit. Review the company rule.",
    );
  }
  if (rule.state !== "approved") blockers.push("The company benefit rule needs independent approval.");
  if (
    exit.state !== "approved" ||
    exit.approval_state !== "approved" ||
    exit.employment_status !== "active" ||
    placement.length !== 1
  )
    blockers.push("Approved exit and active operational employment through the last working date are required.");
  if (date > dates.today) blockers.push("Calculate and approve the benefit on or after the last working date.");
  if (date < rule.effective_from || date > rule.effective_to) blockers.push("The rule does not cover this exit date.");
  if (!t.exit_kinds.includes(exit.kind)) blockers.push("The rule does not cover this type of exit.");
  if (dates.service_days < t.minimum_service_days) blockers.push("Minimum service has not been reached.");
  if (!currency) blockers.push("An active currency with supported precision is required.");
  if (payroll.some((p) => p.state !== "open"))
    blockers.push("Calculated or finalized Payroll requires its governed correction workflow.");
  if (amount === "0" && units > 0)
    blockers.push("The calculated benefit rounds to zero at the rule currency precision.");
  if (units === 0)
    blockers.push(
      t.basis === "service_days"
        ? "No service days are eligible under this rule."
        : "No completed service units are eligible under this rule.",
    );
  const source = {
    rule: { id: rule.id, version: rule.version, terms: t },
    exit,
    placement,
    currency: currency ?? null,
    payroll,
    service_days: dates.service_days,
    completed_service_years: dates.service_years,
    eligible_units: units,
    ...(derived ? { salary: derived } : {}),
    ...(territorial.context ? { country_scope: territorial.context } : {}),
  };
  const line = {
    direction: t.direction as "earning" | "deduction",
    description: ("Company benefit · " + t.name).slice(0, 160),
    amount_minor: amount,
    calculation: {
      quantity: String(units),
      rate_minor: rawRate as string,
      rounding: "half_up" as const,
      ...(derived || t.rate_factors ? { rate_divisor: divisor, rate_multiplier: multiplier } : {}),
    },
    source_reference: (
      "Approved benefit rule " +
      rule.id +
      (derived?.salary
        ? "; approved salary " +
          derived.salary.assignment_id +
          " v" +
          derived.salary.assignment_version +
          "; " +
          derived.salary.components.map((x) => x.name).join(", ") +
          "; factor " +
          multiplier +
          "/" +
          divisor
        : "") +
      (t.rate_factors ? "; policy factor " + multiplier + "/" + divisor : "") +
      "; " +
      (t.legal_scope
        ? "Country " +
          t.legal_scope.country_code +
          "; jurisdiction " +
          (t.legal_scope.jurisdiction_id ?? "national") +
          "; authority " +
          t.legal_scope.authority_reference +
          "; "
        : "") +
      t.policy_reference
    ).slice(0, 500),
  };
  return {
    rule,
    source: { ...source, line },
    line,
    preview: {
      quantity_label:
        t.basis === "service_days"
          ? "service days (" + t.service_day_count + ")"
          : t.basis === "completed_service_years"
            ? "completed years"
            : "award",
      rule_id: rule.id as string,
      exit_case_id: exit.id as string,
      employee_name: exit.employee_name as string,
      as_of: date,
      employed_from: exit.employed_from as string,
      service_days: dates.service_days as number,
      completed_service_years: dates.service_years as number,
      eligible_units: units,
      country_scope: territorial.evidence,
      salary: derived?.salary ?? null,
      rate_minor: unitRate,
      amount_minor: amount,
      currency: t.currency as string,
      money_scale: Number(currency?.decimal_places ?? 2),
      direction: line.direction,
      source_hash: attendanceHash(source),
      blockers,
    },
  };
}
export async function requireSettlementBenefitAuthority(
  client: PoolClient,
  c: HrActorContext,
  company: string,
  id: string,
  action: string,
) {
  if (!["submit", "approve"].includes(action)) return;
  const sources = (
    await client.query(
      "select s.created_by from hr_settlement_benefit_source s join hr_lifecycle_case x on x.tenant_id=s.tenant_id and x.id=s.case_id where s.tenant_id=$1 and s.company_id=$2 and s.case_id=$3 and exists(select 1 from jsonb_array_elements(x.terms->'lines') l where l->>'benefit_source_id'=s.id)",
      [c.tenantId, company, id],
    )
  ).rows;
  if (!sources.length) return;
  await permission(client, c, company, "hr.employment_lifecycle_policy.read");
  if (
    (
      await client.query(
        "select 1 from (select tenant_id,company_id,case_id,id,snapshot,'benefit_source_id' source_key from hr_settlement_benefit_source union all select tenant_id,company_id,case_id,id,snapshot,'encashment_source_id' source_key from hr_settlement_encashment_source) s join hr_lifecycle_case x on x.tenant_id=s.tenant_id and x.id=s.case_id where s.tenant_id=$1 and s.company_id=$2 and s.case_id=$3 and s.snapshot->'rule'->'terms' ? 'salary_basis' and exists(select 1 from jsonb_array_elements(x.terms->'lines') l where l->>s.source_key=s.id)",
        [c.tenantId, company, id],
      )
    ).rowCount
  )
    await requireSettlementSalaryRead(client, c, company);
  if (
    action === "approve" &&
    (
      await client.query(
        "select 1 from hr_lifecycle_case x join employee_user_binding b on b.tenant_id=x.tenant_id and b.employee_id=x.employee_id and b.ended_at is null where x.tenant_id=$1 and x.company_id=$2 and x.id=$3 and b.user_id=$4",
        [c.tenantId, company, id, c.actor.userId],
      )
    ).rowCount
  )
    deny("The affected employee cannot approve their statement.");
  if (action === "approve" && sources.some((s) => s.created_by === c.actor.userId))
    deny("The officer who calculated a benefit cannot approve its statement.");
}
export async function reviewSettlementBenefits(
  client: PoolClient,
  c: HrActorContext,
  company: string,
  id: string,
  terms: Extract<HrLifecycleCaseTerms, { kind: "settlement" }>,
) {
  if (terms.lines.some((l) => l.benefit_source_id))
    for (const prefix of ["nexora:hr:attendance:", "nexora:payroll:"])
      await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [prefix + c.tenantId + ":" + company]);
  for (const line of terms.lines) {
    if (line.source_reference.startsWith("Approved benefit rule ") && !line.benefit_source_id)
      fail("A company benefit reference cannot be detached from its protected source.");
    if (!line.benefit_source_id) continue;
    await permission(client, c, company, "hr.employment_lifecycle_policy.read");
    const retained = (
      await client.query(
        "select * from hr_settlement_benefit_source where tenant_id=$1 and company_id=$2 and case_id=$3 and id=$4",
        [c.tenantId, company, id, line.benefit_source_id],
      )
    ).rows[0];
    if (
      !retained ||
      attendanceHash({ ...line, benefit_source_id: undefined }) !== attendanceHash(retained.snapshot.line)
    )
      fail("Refresh or remove this calculated benefit in the draft; its amount and source cannot be edited.");
    const current = await snapshot(client, c, company, terms.exit_case_id, retained.rule_id);
    if (current.preview.blockers.length) fail(current.preview.blockers.join(" "));
    if (current.preview.source_hash !== retained.source_hash)
      fail("Employment, policy or Payroll evidence changed. Return to draft and refresh this benefit.");
  }
}
export class SettlementBenefits {
  constructor(private readonly d: PayrollWorkspaceDependencies) {}
  private async allowed(
    client: PoolClient,
    c: HrActorContext,
    r: Row,
  ): Promise<Array<"submit_rule" | "approve_rule" | "reject_rule">> {
    if (
      r.state === "draft" &&
      r.created_by === c.actor.userId &&
      (await can(client, c, r.company_id, "hr.employment_lifecycle_policy.manage"))
    )
      return ["submit_rule"];
    if (
      r.state === "submitted" &&
      ![r.created_by, r.submitted_by].includes(c.actor.userId) &&
      (await can(client, c, r.company_id, "hr.employment_lifecycle_policy.approve"))
    )
      return ["approve_rule", "reject_rule"];
    return [];
  }
  async workspace(c: HrActorContext, q: HrSettlementBenefitQuery): Promise<HrSettlementBenefitWorkspace> {
    return this.d.read(c, "hr.employment_history.read", async (client) => {
      await this.d.company(client, c, q.company_id);
      for (const k of ["hr.employment_history.read", "hr.employment_lifecycle_policy.read"])
        await permission(client, c, q.company_id, k);
      const rows = (
        await client.query(
          "select r.*,(select decimal_places from currency where tenant_id=r.tenant_id and code=r.terms->>'currency') money_scale from hr_settlement_benefit_rule r where r.tenant_id=$1 and r.company_id=$2 order by r.created_at desc,r.id desc limit $3 offset $4",
          [c.tenantId, q.company_id, q.limit, q.offset],
        )
      ).rows;
      return {
        ...(await settlementCountryOptions(client, q.country_code)),
        can_configure_salary: await can(client, c, q.company_id, "hr.payroll.setup.read"),
        salary_components: (await can(client, c, q.company_id, "hr.payroll.setup.read"))
          ? (
              await client.query(
                "select id,code,name from hr_pay_component where tenant_id=$1 and company_id=$2 and kind='earning' and method='fixed' and status='active' order by name,id limit 200",
                [c.tenantId, q.company_id],
              )
            ).rows
          : [],
        company_id: q.company_id,
        can_create_rule: await can(client, c, q.company_id, "hr.employment_lifecycle_policy.manage"),
        items: await Promise.all(
          rows.map(async (r) => ({
            id: r.id,
            terms: r.terms,
            money_scale: r.money_scale ?? null,
            state: r.state,
            version: r.version,
            created_by: r.created_by,
            submitted_by: r.submitted_by,
            decided_by: r.decided_by,
            reason: r.reason,
            allowed_actions: await this.allowed(client, c, r),
          })),
        ),
        total: (
          await client.query(
            "select count(*)::int n from hr_settlement_benefit_rule where tenant_id=$1 and company_id=$2",
            [c.tenantId, q.company_id],
          )
        ).rows[0].n,
        limit: q.limit,
        offset: q.offset,
        currencies: (
          await client.query(
            "select code,decimal_places from currency where tenant_id=$1 and status='active' and decimal_places<=4 order by code limit 200",
            [c.tenantId],
          )
        ).rows,
        preview:
          q.exit_case_id && q.rule_id
            ? (await snapshot(client, c, q.company_id, q.exit_case_id, q.rule_id)).preview
            : null,
      };
    });
  }
  async command(c: HrActorContext, input: HrSettlementBenefitAction, key: string, corr: string) {
    if (c.impersonationRequestId || (c.realActorId && c.realActorId !== c.actor.userId))
      deny("Impersonated sessions cannot change company benefits.");
    if (!/^[A-Za-z0-9._:-]{8,128}$/.test(key))
      throw new HrApiError(400, "INVALID_IDEMPOTENCY_KEY", "Use a valid idempotency key.");
    const client = await this.d.pool.connect();
    try {
      await client.query("begin");
      await client.query("select set_config('nexora.tenant_id',$1,true)", [c.tenantId]);
      await this.d.company(client, c, input.company_id);
      for (const k of [
        "hr.employment_history.read",
        "hr.employment_lifecycle_policy.read",
        input.action === "add_to_statement"
          ? "hr.employment_lifecycle.action"
          : ["approve_rule", "reject_rule"].includes(input.action)
            ? "hr.employment_lifecycle_policy.approve"
            : "hr.employment_lifecycle_policy.manage",
      ])
        await permission(client, c, input.company_id, k);
      for (const prefix of ["nexora:hr:lifecycle-cases:", "nexora:payroll:"])
        await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
          prefix + c.tenantId + ":" + input.company_id,
        ]);
      if (input.action === "approve_rule" || input.action === "reject_rule") {
        const r = (
          await client.query(
            "select created_by,submitted_by from hr_settlement_benefit_rule where tenant_id=$1 and company_id=$2 and id=$3",
            [c.tenantId, input.company_id, input.id],
          )
        ).rows[0];
        if (r && [r.created_by, r.submitted_by].includes(c.actor.userId))
          deny("A separate officer must decide the company benefit rule.");
      }
      if (input.action === "create_rule" && input.terms.salary_basis)
        await permission(client, c, input.company_id, "hr.payroll.setup.read");
      if (
        ["submit_rule", "approve_rule", "reject_rule"].includes(input.action) &&
        (
          await client.query(
            "select 1 from hr_settlement_benefit_rule where tenant_id=$1 and company_id=$2 and id=$3 and terms ? 'salary_basis'",
            [c.tenantId, input.company_id, "id" in input ? input.id : ""],
          )
        ).rowCount
      )
        await permission(client, c, input.company_id, "hr.payroll.setup.read");
      if (
        input.action === "add_to_statement" &&
        (
          await client.query(
            "select 1 from hr_settlement_benefit_rule where tenant_id=$1 and company_id=$2 and id=$3 and terms ? 'salary_basis'",
            [c.tenantId, input.company_id, input.rule_id],
          )
        ).rowCount
      )
        await requireSettlementSalaryRead(client, c, input.company_id);
      const hash = attendanceHash(input),
        path = "/api/v1/hr/settlement_benefits/actions",
        prior = (
          await client.query(
            "select request_fingerprint,response_body from platform_admin_idempotency where tenant_id=$1 and actor_id=$2 and method='POST' and path=$3 and idempotency_key=$4",
            [c.tenantId, c.actor.userId, path, key],
          )
        ).rows[0];
      if (prior) {
        if (prior.request_fingerprint !== hash) fail("This key belongs to different benefit terms.");
        await client.query("commit");
        return { ...prior.response_body, replayed: true };
      }
      let id: string,
        before: Row | null = null,
        after: Row;
      if (input.action === "create_rule") {
        const t = input.terms;
        try {
          calculateHrSettlementMinor(
            String(t.maximum_units),
            t.rate_minor,
            t.rate_factors?.divisor,
            t.rate_factors?.multiplier,
          );
        } catch {
          fail("The maximum benefit exceeds the supported exact amount.");
        }
        if (
          !(
            await client.query(
              "select 1 from currency where tenant_id=$1 and code=$2 and status='active' and decimal_places<=4",
              [c.tenantId, t.currency],
            )
          ).rowCount
        )
          fail("Choose an active supported currency.");
        if (t.salary_basis) {
          const selected = (
            await client.query(
              "select id from hr_pay_component where tenant_id=$1 and company_id=$2 and id=any($3::text[]) and kind='earning' and method='fixed' and status='active'",
              [c.tenantId, input.company_id, t.salary_basis.component_ids],
            )
          ).rows;
          if (selected.length !== t.salary_basis.component_ids.length)
            fail("Choose active fixed earning components from this company.");
        }
        id = "benefit-rule-" + randomUUID();
        await client.query(
          "insert into hr_settlement_benefit_rule(tenant_id,company_id,id,category,effective_from,effective_to,terms,created_by,reason) values($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9)",
          [
            c.tenantId,
            input.company_id,
            id,
            t.category,
            t.effective_from,
            t.effective_to,
            JSON.stringify(t),
            c.actor.userId,
            input.reason,
          ],
        );
        after = (
          await client.query("select * from hr_settlement_benefit_rule where tenant_id=$1 and id=$2", [c.tenantId, id])
        ).rows[0];
      } else if (input.action === "add_to_statement") {
        id = input.id;
        before = (
          await client.query(
            "select * from hr_lifecycle_case where tenant_id=$1 and company_id=$2 and id=$3 and kind='settlement' for update",
            [c.tenantId, input.company_id, id],
          )
        ).rows[0];
        if (!before || before.state !== "draft" || before.version !== input.expected_version)
          fail("Open the current draft statement before calculating benefits.");
        const current = await snapshot(client, c, input.company_id, before!.terms.exit_case_id, input.rule_id);
        if (current.preview.blockers.length) fail(current.preview.blockers.join(" "));
        if (current.preview.source_hash !== input.source_hash)
          fail("The benefit source changed. Refresh and review the calculation.");
        if (before!.terms.currency !== current.preview.currency)
          fail("Statement and company benefit currencies must match.");
        const terms = hrLifecycleCaseTermsSchema.parse(before!.terms) as Extract<
            HrLifecycleCaseTerms,
            { kind: "settlement" }
          >,
          old = (
            await client.query(
              "select id,category from hr_settlement_benefit_source where tenant_id=$1 and company_id=$2 and case_id=$3",
              [c.tenantId, input.company_id, id],
            )
          ).rows;
        const lines = terms.lines.filter(
          (l) => !old.some((s) => s.id === l.benefit_source_id && s.category === current.rule.category),
        );
        if (lines.length >= 30) fail("The statement has reached its line limit.");
        const sourceId = "benefit-source-" + randomUUID();
        await client.query(
          "insert into hr_settlement_benefit_source(tenant_id,company_id,id,case_id,rule_id,category,as_of,units,amount_minor,source_hash,snapshot,created_by) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12)",
          [
            c.tenantId,
            input.company_id,
            sourceId,
            id,
            current.rule.id,
            current.rule.category,
            current.preview.as_of,
            current.preview.eligible_units,
            current.preview.amount_minor,
            current.preview.source_hash,
            JSON.stringify(current.source),
            c.actor.userId,
          ],
        );
        lines.push({ ...current.line, benefit_source_id: sourceId });
        const next = hrLifecycleCaseTermsSchema.parse({ ...terms, lines });
        await client.query(
          "update hr_lifecycle_case set terms=$3::jsonb,evidence=$4::jsonb,version=version+1,updated_by=$5,updated_at=clock_timestamp() where tenant_id=$1 and id=$2",
          [
            c.tenantId,
            id,
            JSON.stringify(next),
            JSON.stringify({
              ...lifecycleSettlement(lines),
              currency: terms.currency,
              money_scale: current.preview.money_scale,
              reviewed_sources: lines.map((l) => l.source_reference),
            }),
            c.actor.userId,
          ],
        );
        after = (await client.query("select * from hr_lifecycle_case where tenant_id=$1 and id=$2", [c.tenantId, id]))
          .rows[0];
        await client.query(
          "insert into hr_lifecycle_case_event(tenant_id,company_id,id,record_id,version,action,reason,actor_id,before_json,after_json) values($1,$2,$3,$4,$5,'calculate_benefit',$6,$7,$8::jsonb,$9::jsonb)",
          [
            c.tenantId,
            input.company_id,
            "lifecycle-event-" + randomUUID(),
            id,
            after.version,
            input.reason,
            c.actor.userId,
            JSON.stringify(before),
            JSON.stringify(after),
          ],
        );
      } else {
        id = input.id;
        before = (
          await client.query(
            "select * from hr_settlement_benefit_rule where tenant_id=$1 and company_id=$2 and id=$3 for update",
            [c.tenantId, input.company_id, id],
          )
        ).rows[0];
        if (
          !before ||
          before.version !== input.expected_version ||
          !(await this.allowed(client, c, before)).includes(input.action)
        )
          fail("This rule changed or the decision is unavailable.");
        const state = { submit_rule: "submitted", approve_rule: "approved", reject_rule: "rejected" }[input.action];
        await client.query(
          "update hr_settlement_benefit_rule set state=$3,version=version+1,submitted_by=case when $3='submitted' then $4 else submitted_by end,decided_by=case when $3 in('approved','rejected') then $4 else null end,reason=$5,updated_at=clock_timestamp() where tenant_id=$1 and id=$2",
          [c.tenantId, id, state, c.actor.userId, input.reason],
        );
        after = (
          await client.query("select * from hr_settlement_benefit_rule where tenant_id=$1 and id=$2", [c.tenantId, id])
        ).rows[0];
      }
      const audit = await this.d.audit(client, c, corr, id, before, {
          ...after,
          action: input.action,
          reason: input.reason,
        }),
        result = {
          id,
          company_id: input.company_id,
          status: after.state,
          version: after.version,
          audit_event_id: audit,
          replayed: false,
        };
      await client.query(
        "insert into platform_admin_idempotency(tenant_id,actor_id,method,path,idempotency_key,request_fingerprint,response_status,response_body,response_etag) values($1,$2,'POST',$3,$4,$5,200,$6,$7)",
        [c.tenantId, c.actor.userId, path, key, hash, result, attendanceHash(result)],
      );
      await client.query("commit");
      return result;
    } catch (e) {
      await client.query("rollback").catch(() => {});
      if (e instanceof HrApiError) throw e;
      const countryConflict = e as { constraint?: string; where?: string };
      if (countryConflict.constraint === "hr_country_settlement_obligation")
        throw new HrApiError(
          409,
          "HR_SETTLEMENT_COUNTRY_OBLIGATION_REVIEW",
          "This policy period covers settlement inputs already active or consumed in Payroll. Use a future effective date, or independently reject unprocessed inputs and correct the statement first. Finalized obligations require their governed financial correction process.",
        );
      if (
        countryConflict.constraint?.includes("_country_period") ||
        countryConflict.where?.includes("guard_hr_settlement_country_rule()") ||
        countryConflict.where?.includes("validate_hr_settlement_country_terms(")
      )
        throw new HrApiError(
          409,
          "HR_SETTLEMENT_COUNTRY_POLICY_REVIEW_REQUIRED",
          "Choose country and jurisdiction references valid for the entire rule period. Approved rules for the same benefit or leave type need one jurisdiction basis and non-overlapping dates within each country/regional scope.",
        );
      if (["23505", "23503", "23514", "23P01", "P0001"].includes(String((e as { code?: string }).code)))
        throw Object.assign(
          new HrApiError(
            409,
            "HR_BENEFIT_REVIEW_REQUIRED",
            "The benefit conflicts with approved policy dates, exact evidence or independent decisions. Refresh and review.",
          ),
          { cause: e },
        );
      throw e;
    } finally {
      client.release();
    }
  }
}

export async function requireSettlementBenefitRead(client: PoolClient, c: HrActorContext, company: string, id: string) {
  const sources = (
    await client.query(
      "select s.id,s.rule_id,s.family,coalesce(s.snapshot->'rule'->'terms' ? 'salary_basis',false) salary_protected,((s.snapshot->'country_scope')-'rule_set')||jsonb_build_object('rule_set',coalesce((select jsonb_agg(jsonb_build_object('id',r->>'id','terms',jsonb_build_object('name',r->'terms'->>'name'))) from jsonb_array_elements(s.snapshot->'country_scope'->'rule_set') r where r->>'id'=s.snapshot->'country_scope'->>'matched_rule_id'),'[]'::jsonb)) country_scope from (select tenant_id,company_id,case_id,id,rule_id,snapshot,'benefit' family,'benefit_source_id' source_key from hr_settlement_benefit_source union all select tenant_id,company_id,case_id,id,rule_id,snapshot,'encashment','encashment_source_id' from hr_settlement_encashment_source) s join hr_lifecycle_case x on x.tenant_id=s.tenant_id and x.company_id=s.company_id and x.id=s.case_id where s.tenant_id=$1 and s.company_id=$2 and s.case_id=$3 and(s.snapshot ? 'country_scope' or s.snapshot->'rule'->'terms' ? 'salary_basis') and exists(select 1 from jsonb_array_elements(x.terms->'lines') l where l->>s.source_key=s.id)",
      [c.tenantId, company, id],
    )
  ).rows;
  if (sources.some((s) => s.salary_protected)) await requireSettlementSalaryRead(client, c, company);
  return sources.flatMap((s) => {
    const evidence = projectSettlementCountry(s.country_scope, s.rule_id);
    return evidence ? [{ source_id: s.id as string, family: s.family as "benefit" | "encashment", evidence }] : [];
  });
}

export async function reviewSettlementSalaryHandoff(client: PoolClient, c: HrActorContext, row: Row) {
  const sources = (
    await client.query(
      "select s.* from (select tenant_id,company_id,case_id,id,snapshot,'benefit_source_id' source_key from hr_settlement_benefit_source union all select tenant_id,company_id,case_id,id,snapshot,'encashment_source_id' source_key from hr_settlement_encashment_source) s where s.tenant_id=$1 and s.company_id=$2 and s.case_id=$3 and s.snapshot->'rule'->'terms' ? 'salary_basis' and exists(select 1 from jsonb_array_elements($4::jsonb->'lines') l where l->>s.source_key=s.id)",
      [c.tenantId, row.company_id, row.id, JSON.stringify(row.terms)],
    )
  ).rows;
  for (const s of sources) {
    const t = s.snapshot.rule.terms,
      current = await readSettlementSalaryBasis(
        client,
        c,
        row.company_id,
        row.employee_id,
        String(s.snapshot.exit.terms.last_working_date),
        t.currency,
        Number(s.snapshot.currency.decimal_places),
        t.salary_basis,
      );
    if (current.blockers.length || attendanceHash(current.source) !== attendanceHash(s.snapshot.salary.source))
      throw new HrApiError(
        409,
        "HR_SETTLEMENT_SALARY_CORRECTION_REQUIRED",
        "The approved salary basis changed. Correct the statement independently before Payroll handoff.",
      );
  }
}
