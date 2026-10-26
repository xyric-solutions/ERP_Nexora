import { readSettlementCountry, settlementCountryOptions } from "./settlement-country.js";
import { readSettlementSalaryBasis, requireSettlementSalaryRead } from "./settlement-salary.js";
import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import {
  calculateHrSettlementMinor,
  hrLifecycleCaseTermsSchema,
  type HrSettlementEntitlementQuery,
  type HrSettlementEntitlementAction,
  type HrSettlementEntitlementWorkspace,
  type HrLifecycleCaseTerms,
} from "@nexora/contracts";
import { HrApiError, type HrActorContext } from "./source-repository.js";
import { attendanceHash } from "./attendance-completion.js";
import type { PayrollWorkspaceDependencies } from "./payroll-workspace.js";
import { requireHrCompanyPermission } from "./company-authority.js";
import { readLeaveBalances, leaveUnits, leaveDecimal } from "./leave-balances.js";
import { lifecycleSettlement } from "./settlement-calculation.js";
// PostgreSQL projections are validated by the shared contracts and retained source guards.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;
const fail = (message: string): never => {
  throw new HrApiError(409, "HR_ENCASHMENT_REVIEW_REQUIRED", message);
};
const deny = (message: string): never => {
  throw new HrApiError(403, "PERMISSION_DENIED", message);
};
async function permission(client: PoolClient, c: HrActorContext, company: string, key: string) {
  return requireHrCompanyPermission(client, c, company, key);
}
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
      "select *,effective_from::text,effective_to::text from hr_settlement_encashment_rule where tenant_id=$1 and company_id=$2 and id=$3",
      [c.tenantId, company, ruleId],
    )
  ).rows[0] as Row | undefined;
  const exit = (
    await client.query(
      "select x.id,x.version,x.state,x.relationship_id,x.employee_id,x.terms,r.effective_from::text as employed_from,r.status as employment_status,r.approval_state,concat_ws(' · ',e.employee_number,e.first_name,e.last_name) employee_name from hr_lifecycle_case x join hr_employment_relationship r on r.tenant_id=x.tenant_id and r.id=x.relationship_id join employee e on e.tenant_id=x.tenant_id and e.id=x.employee_id where x.tenant_id=$1 and x.company_id=$2 and x.id=$3 and x.kind in('resignation','termination')",
      [c.tenantId, company, exitId],
    )
  ).rows[0] as Row | undefined;
  if (!rule || !exit)
    throw new HrApiError(404, "HR_ENCASHMENT_NOT_FOUND", "Choose a company rule and approved exit from this company.");
  const asOf = exit.terms.last_working_date as string,
    today = (await client.query("select current_date::text today")).rows[0].today;
  const type = (
    await client.query(
      "select t.id,t.name,t.paid,t.status,p.id policy_id,p.version_number,p.applicable_category_ids,p.applicable_genders,p.effective_from::text,p.effective_to::text from hr_leave_type t left join hr_leave_policy_version p on p.tenant_id=t.tenant_id and p.company_id=t.company_id and p.leave_type_id=t.id and p.effective_from<=$4::date and(p.effective_to is null or p.effective_to>=$4::date) where t.tenant_id=$1 and t.company_id=$2 and t.id=$3",
      [c.tenantId, company, rule.leave_type_id, asOf],
    )
  ).rows[0];
  const balance = (
    await readLeaveBalances(client, c, company, [{ employee: exit.employee_id, type: rule.leave_type_id }], asOf)
  )[0]!;
  const currency = (
    await client.query(
      "select code,decimal_places from currency where tenant_id=$1 and code=$2 and status='active' and decimal_places<=4",
      [c.tenantId, rule.terms.currency],
    )
  ).rows[0];
  const serviceDays = (await client.query("select ($1::date-$2::date)::int days", [asOf, exit.employed_from])).rows[0]
    .days;
  const placement = (
    await client.query(
      "select employee_category_id from employee_assignment where tenant_id=$1 and company_id=$2 and employee_id=$3 and employment_relationship_id=$4 and assignment_status='active' and effective_from<=$5::date and(effective_to is null or effective_to>=$5::date)",
      [c.tenantId, company, exit.employee_id, exit.relationship_id, asOf],
    )
  ).rows[0];
  const payroll = (
    await client.query(
      "select id,state,version,run_number from hr_payroll_period where tenant_id=$1 and company_id=$2 and month>=date_trunc('month',$3::date)::date order by month,id",
      [c.tenantId, company, asOf],
    )
  ).rows;
  const blockers: string[] = [];
  if (payroll.some((p) => p.state !== "open"))
    blockers.push(
      "A calculated or finalized Payroll period requires the governed correction workflow before encashment approval.",
    );
  if (rule.state !== "approved") blockers.push("The company encashment rule needs independent approval.");
  if (
    exit.state !== "approved" ||
    exit.approval_state !== "approved" ||
    exit.employment_status !== "active" ||
    !placement
  )
    blockers.push("The exit and operational employment must be approved and active through the last working date.");
  if (asOf > today) blockers.push("Calculate and approve encashment on or after the last working date.");
  if (asOf < rule.effective_from || asOf > rule.effective_to)
    blockers.push("The rule does not cover the approved exit date.");
  if (!type?.paid || type.status !== "active" || !type.policy_id)
    blockers.push("An active paid leave type and effective leave policy are required.");
  if (
    type?.applicable_category_ids?.length &&
    !type.applicable_category_ids.includes(placement?.employee_category_id ?? "")
  )
    blockers.push("The effective employee category is outside this leave policy.");
  if (type?.applicable_genders?.length)
    blockers.push("Verified eligibility is required for this restricted legacy leave policy.");
  if (!currency) blockers.push("The rule currency must be active with supported precision.");
  if (serviceDays < rule.terms.minimum_service_days)
    blockers.push("The employee has not reached the rule’s minimum service days.");
  const territorial = await readSettlementCountry(
    client,
    c,
    company,
    exit.employee_id,
    exit.relationship_id,
    asOf,
    "encashment",
    rule.id,
  );
  blockers.push(...territorial.blockers);
  const derived = rule.terms.salary_basis
    ? await readSettlementSalaryBasis(
        client,
        c,
        company,
        exit.employee_id,
        asOf,
        rule.terms.currency,
        Number(currency?.decimal_places ?? 2),
        rule.terms.salary_basis,
      )
    : null;
  if (derived) blockers.push(...derived.blockers);
  const rawRate = derived?.salary?.basis_minor ?? rule.terms.rate_minor,
    divisor = rule.terms.salary_basis?.divisor ?? 1,
    multiplier = rule.terms.salary_basis?.multiplier ?? 1;
  const days = Math.max(0, Math.min(leaveUnits(balance.available), leaveUnits(rule.terms.maximum_days))),
    eligible = leaveDecimal(days),
    rate = String(rawRate);
  let amount = "0",
    unitRate = "0";
  try {
    amount = calculateHrSettlementMinor(eligible, rate, divisor, multiplier);
    unitRate = calculateHrSettlementMinor("1", rate, divisor, multiplier);
  } catch {
    fail("The salary-based encashment exceeds the supported exact amount. Review the approved company factors.");
  }
  if (days === 0 || amount === "0") blockers.push("No positive, unreserved encashment is available under this rule.");
  const source = {
    rule: { id: rule.id, version: rule.version, terms: rule.terms },
    exit: {
      id: exit.id,
      version: exit.version,
      terms: exit.terms,
      relationship_id: exit.relationship_id,
      employee_id: exit.employee_id,
      employed_from: exit.employed_from,
      status: exit.employment_status,
    },
    leave_policy: type ?? null,
    placement: placement ?? null,
    payroll_periods: payroll,
    balance,
    currency: currency ?? null,
    ...(derived ? { salary: derived } : {}),
    ...(territorial.context ? { country_scope: territorial.context } : {}),
  };
  const line = {
    direction: "earning" as const,
    description: ("Leave encashment · " + (type?.name ?? "Leave")).slice(0, 160),
    amount_minor: amount,
    calculation: {
      quantity: eligible,
      rate_minor: rate,
      rounding: "half_up" as const,
      ...(derived ? { rate_divisor: divisor, rate_multiplier: multiplier } : {}),
    },
    source_reference: (
      "Approved encashment rule " +
      rule.id +
      "; leave policy " +
      type?.policy_id +
      "; " +
      (derived?.salary
        ? "salary " +
          derived.salary.assignment_id +
          " v" +
          derived.salary.assignment_version +
          "; " +
          derived.salary.components.map((x) => x.name).join(", ") +
          "; factor " +
          multiplier +
          "/" +
          divisor +
          "; "
        : "") +
      (rule.terms.legal_scope
        ? "Country " +
          rule.terms.legal_scope.country_code +
          "; jurisdiction " +
          (rule.terms.legal_scope.jurisdiction_id ?? "national") +
          "; authority " +
          rule.terms.legal_scope.authority_reference +
          "; "
        : "") +
      rule.terms.policy_reference
    ).slice(0, 500),
  };
  return {
    preview: {
      rule_id: rule.id as string,
      exit_case_id: exit.id as string,
      employee_name: exit.employee_name as string,
      as_of: asOf,
      balance: balance.balance,
      reserved: balance.reserved,
      future_used: balance.future_used,
      available: balance.available,
      eligible_days: eligible,
      country_scope: territorial.evidence,
      salary: derived?.salary ?? null,
      rate_minor: unitRate!,
      amount_minor: amount,
      currency: String(rule.terms.currency),
      money_scale: Number(currency?.decimal_places ?? 2),
      source_hash: attendanceHash(source),
      blockers,
    },
    source: { ...source, line },
    line,
    exit,
    rule,
  };
}
export async function reviewSettlementEncashment(
  client: PoolClient,
  c: HrActorContext,
  company: string,
  caseId: string,
  terms: Extract<HrLifecycleCaseTerms, { kind: "settlement" }>,
  action: "save" | "submit" | "approve",
) {
  if (terms.lines.some((l) => l.source_reference.startsWith("Approved encashment rule ") && !l.encashment_source_id))
    fail("A calculated encashment reference cannot be detached from its source.");
  const lines = terms.lines.filter((l) => l.encashment_source_id);
  if (!lines.length) return;
  for (const key of ["hr.leave.balance.read", ...(action === "approve" ? ["hr.leave.balance.adjust"] : [])])
    await permission(client, c, company, key);
  await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
    "nexora:hr:attendance:" + c.tenantId + ":" + company,
  ]);
  await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
    "nexora:payroll:" + c.tenantId + ":" + company,
  ]);
  for (const line of lines) {
    const retained = (
      await client.query(
        "select *,as_of::text,days::text from hr_settlement_encashment_source where tenant_id=$1 and company_id=$2 and case_id=$3 and id=$4",
        [c.tenantId, company, caseId, line.encashment_source_id],
      )
    ).rows[0];
    if (retained?.snapshot.rule.terms.salary_basis) await requireSettlementSalaryRead(client, c, company);
    if (
      !retained ||
      attendanceHash({ ...line, encashment_source_id: undefined }) !== attendanceHash(retained.snapshot.line)
    ) {
      // JSON hashing omits undefined fields; the database additionally checks exact canonical line JSON.
      fail(
        "Calculated encashment terms cannot be edited. Refresh or remove the calculated line while the statement is a draft.",
      );
    }
    const current = await snapshot(client, c, company, terms.exit_case_id, retained.rule_id);
    if (current.preview.blockers.length) fail(current.preview.blockers.join(" "));
    if (current.preview.source_hash !== retained.source_hash)
      fail(
        "Leave balance, reservations, policy or Payroll evidence changed. Return to draft and refresh this calculated line.",
      );
    if (action === "approve") {
      if (retained.created_by === c.actor.userId)
        deny("The officer who calculated the settlement line cannot approve it.");
      await client.query(
        "insert into hr_leave_transaction(tenant_id,id,company_id,employee_id,leave_type_id,effective_on,kind,days,source_type,source_id,reason,created_by,policy_version_id,evidence_hash,evidence_json) values($1,$2,$3,$4,$5,$6,'encashed',$7,'final_settlement',$8,$9,$10,$11,$12,$13::jsonb)",
        [
          c.tenantId,
          "leave-encashment-" + randomUUID(),
          company,
          current.exit.employee_id,
          retained.leave_type_id,
          retained.as_of,
          "-" + retained.days,
          retained.id,
          "Approved final settlement " + caseId,
          c.actor.userId,
          retained.leave_policy_version_id,
          retained.source_hash,
          JSON.stringify({ case_id: caseId, rule_id: retained.rule_id, source_hash: retained.source_hash }),
        ],
      );
    }
  }
}
export class SettlementEntitlements {
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
      return ["submit_rule" as const];
    if (
      r.state === "submitted" &&
      ![r.created_by, r.submitted_by].includes(c.actor.userId) &&
      (await can(client, c, r.company_id, "hr.employment_lifecycle_policy.approve"))
    )
      return ["approve_rule" as const, "reject_rule" as const];
    return [];
  }
  async workspace(c: HrActorContext, q: HrSettlementEntitlementQuery): Promise<HrSettlementEntitlementWorkspace> {
    return this.d.read(c, "hr.employment_history.read", async (client) => {
      await this.d.company(client, c, q.company_id);
      for (const key of ["hr.employment_history.read", "hr.employment_lifecycle_policy.read", "hr.leave.type.read"])
        await permission(client, c, q.company_id, key);
      const rows = (
        await client.query(
          "select r.*,t.name leave_type,cu.decimal_places money_scale from hr_settlement_encashment_rule r join hr_leave_type t on t.tenant_id=r.tenant_id and t.id=r.leave_type_id left join currency cu on cu.tenant_id=r.tenant_id and cu.code=r.terms->>'currency' where r.tenant_id=$1 and r.company_id=$2 order by r.created_at desc,r.id desc limit $3 offset $4",
          [c.tenantId, q.company_id, q.limit, q.offset],
        )
      ).rows;
      let preview = null;
      if (q.rule_id && q.exit_case_id) {
        await permission(client, c, q.company_id, "hr.leave.balance.read");
        preview = (await snapshot(client, c, q.company_id, q.exit_case_id, q.rule_id)).preview;
      }
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
            leave_type: r.leave_type,
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
            "select count(*)::int n from hr_settlement_encashment_rule where tenant_id=$1 and company_id=$2",
            [c.tenantId, q.company_id],
          )
        ).rows[0].n,
        limit: q.limit,
        offset: q.offset,
        leave_types: (
          await client.query(
            "select id,name from hr_leave_type where tenant_id=$1 and company_id=$2 and paid and status='active' order by name,id limit 200",
            [c.tenantId, q.company_id],
          )
        ).rows,
        currencies: (
          await client.query(
            "select code,decimal_places from currency where tenant_id=$1 and status='active' and decimal_places<=4 order by code limit 200",
            [c.tenantId],
          )
        ).rows,
        preview,
      };
    });
  }
  async command(c: HrActorContext, input: HrSettlementEntitlementAction, key: string, corr: string) {
    if (c.impersonationRequestId || (c.realActorId && c.realActorId !== c.actor.userId))
      deny("Impersonated sessions cannot change settlement entitlements.");
    if (!/^[A-Za-z0-9._:-]{8,128}$/.test(key))
      throw new HrApiError(400, "INVALID_IDEMPOTENCY_KEY", "Use a valid idempotency key.");
    const client = await this.d.pool.connect();
    try {
      await client.query("begin");
      await client.query("select set_config('nexora.tenant_id',$1,true)", [c.tenantId]);
      await this.d.company(client, c, input.company_id);
      for (const grant of [
        "hr.employment_history.read",
        "hr.employment_lifecycle_policy.read",
        "hr.leave.type.read",
        input.action === "add_to_statement"
          ? "hr.employment_lifecycle.action"
          : ["approve_rule", "reject_rule"].includes(input.action)
            ? "hr.employment_lifecycle_policy.approve"
            : "hr.employment_lifecycle_policy.manage",
      ])
        await permission(client, c, input.company_id, grant);
      if (input.action === "add_to_statement") await permission(client, c, input.company_id, "hr.leave.balance.read");
      await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
        "nexora:hr:lifecycle-cases:" + c.tenantId + ":" + input.company_id,
      ]);
      await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
        "nexora:hr:attendance:" + c.tenantId + ":" + input.company_id,
      ]);
      await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
        "nexora:payroll:" + c.tenantId + ":" + input.company_id,
      ]);
      if (input.action === "create_rule" && input.terms.salary_basis)
        await permission(client, c, input.company_id, "hr.payroll.setup.read");
      if (
        ["submit_rule", "approve_rule", "reject_rule"].includes(input.action) &&
        (
          await client.query(
            "select 1 from hr_settlement_encashment_rule where tenant_id=$1 and company_id=$2 and id=$3 and terms ? 'salary_basis'",
            [c.tenantId, input.company_id, "id" in input ? input.id : ""],
          )
        ).rowCount
      )
        await permission(client, c, input.company_id, "hr.payroll.setup.read");
      if (
        input.action === "add_to_statement" &&
        (
          await client.query(
            "select 1 from hr_settlement_encashment_rule where tenant_id=$1 and company_id=$2 and id=$3 and terms ? 'salary_basis'",
            [c.tenantId, input.company_id, input.rule_id],
          )
        ).rowCount
      )
        await requireSettlementSalaryRead(client, c, input.company_id);
      const hash = attendanceHash(input),
        path = "/api/v1/hr/settlement_entitlements/actions";
      if (input.action === "approve_rule" || input.action === "reject_rule") {
        const r = (
          await client.query(
            "select created_by,submitted_by from hr_settlement_encashment_rule where tenant_id=$1 and company_id=$2 and id=$3",
            [c.tenantId, input.company_id, input.id],
          )
        ).rows[0];
        if (r && [r.created_by, r.submitted_by].includes(c.actor.userId))
          deny("A separate officer must decide this company rule.");
      }
      const prior = (
        await client.query(
          "select request_fingerprint,response_body from platform_admin_idempotency where tenant_id=$1 and actor_id=$2 and method='POST' and path=$3 and idempotency_key=$4",
          [c.tenantId, c.actor.userId, path, key],
        )
      ).rows[0];
      if (prior) {
        if (prior.request_fingerprint !== hash) fail("This key belongs to different entitlement terms.");
        await client.query("commit");
        return { ...prior.response_body, replayed: true };
      }
      let id: string,
        before: Row | null = null,
        after: Row;
      if (input.action === "create_rule") {
        const t = input.terms;
        if (t.salary_basis) {
          const components = await client.query(
            "select id from hr_pay_component where tenant_id=$1 and company_id=$2 and id=any($3::text[]) and kind='earning' and method='fixed' and status='active'",
            [c.tenantId, input.company_id, t.salary_basis.component_ids],
          );
          if (components.rowCount !== t.salary_basis.component_ids.length)
            fail("Select active fixed earning components in this company and rule currency.");
        }
        try {
          calculateHrSettlementMinor(t.maximum_days, t.rate_minor);
        } catch {
          fail("The maximum encashment exceeds the supported exact amount.");
        }
        id = "encashment-rule-" + randomUUID();
        if (
          !(
            await client.query(
              "select 1 from currency where tenant_id=$1 and code=$2 and status='active' and decimal_places<=4",
              [c.tenantId, t.currency],
            )
          ).rowCount
        )
          fail("Choose an active supported currency.");
        await client.query(
          "insert into hr_settlement_encashment_rule(tenant_id,company_id,id,leave_type_id,effective_from,effective_to,terms,created_by,reason) values($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9)",
          [
            c.tenantId,
            input.company_id,
            id,
            t.leave_type_id,
            t.effective_from,
            t.effective_to,
            JSON.stringify(t),
            c.actor.userId,
            input.reason,
          ],
        );
        after = (
          await client.query("select * from hr_settlement_encashment_rule where tenant_id=$1 and id=$2", [
            c.tenantId,
            id,
          ])
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
          fail("Open the current draft settlement before adding or refreshing a calculation.");
        const current = await snapshot(client, c, input.company_id, before!.terms.exit_case_id, input.rule_id);
        if (current.preview.blockers.length) fail(current.preview.blockers.join(" "));
        if (current.preview.source_hash !== input.source_hash)
          fail("The source changed. Refresh and review the current calculation.");
        if (before!.terms.currency !== current.preview.currency)
          fail("The statement currency must match the approved company rule.");
        const sourceId = "encashment-source-" + randomUUID(),
          terms = hrLifecycleCaseTermsSchema.parse(before!.terms) as Extract<
            HrLifecycleCaseTerms,
            { kind: "settlement" }
          >,
          otherSources = (
            await client.query(
              "select id,leave_type_id from hr_settlement_encashment_source where tenant_id=$1 and company_id=$2 and case_id=$3",
              [c.tenantId, input.company_id, id],
            )
          ).rows;
        const lines = terms.lines.filter(
          (l) =>
            !otherSources.some(
              (s) => s.id === l.encashment_source_id && s.leave_type_id === current.rule.leave_type_id,
            ),
        );
        if (lines.length >= 30) fail("The statement already has its maximum number of lines.");
        await client.query(
          "insert into hr_settlement_encashment_source(tenant_id,company_id,id,case_id,rule_id,leave_type_id,leave_policy_version_id,as_of,days,amount_minor,source_hash,snapshot,created_by) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13)",
          [
            c.tenantId,
            input.company_id,
            sourceId,
            id,
            current.rule.id,
            current.rule.leave_type_id,
            current.source.leave_policy.policy_id,
            current.preview.as_of,
            current.preview.eligible_days,
            current.preview.amount_minor,
            current.preview.source_hash,
            JSON.stringify(current.source),
            c.actor.userId,
          ],
        );
        lines.push({ ...current.line, encashment_source_id: sourceId });
        const next = hrLifecycleCaseTermsSchema.parse({ ...terms, lines });
        await client.query(
          "update hr_lifecycle_case set terms=$3::jsonb,version=version+1,updated_by=$4,updated_at=clock_timestamp(),evidence=$5::jsonb where tenant_id=$1 and id=$2",
          [
            c.tenantId,
            id,
            JSON.stringify(next),
            c.actor.userId,
            JSON.stringify({
              ...lifecycleSettlement(lines),
              currency: terms.currency,
              money_scale: current.preview.money_scale,
              reviewed_sources: lines.map((l) => l.source_reference),
            }),
          ],
        );
        after = (await client.query("select * from hr_lifecycle_case where tenant_id=$1 and id=$2", [c.tenantId, id]))
          .rows[0];
        await client.query(
          "insert into hr_lifecycle_case_event(tenant_id,company_id,id,record_id,version,action,reason,actor_id,before_json,after_json) values($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb)",
          [
            c.tenantId,
            input.company_id,
            "lifecycle-event-" + randomUUID(),
            id,
            after.version,
            "calculate_encashment",
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
            "select * from hr_settlement_encashment_rule where tenant_id=$1 and company_id=$2 and id=$3 for update",
            [c.tenantId, input.company_id, id],
          )
        ).rows[0];
        if (
          !before ||
          before.version !== input.expected_version ||
          !(await this.allowed(client, c, before)).includes(input.action)
        )
          fail("This rule changed or the decision is unavailable. Refresh and review.");
        const state = { submit_rule: "submitted", approve_rule: "approved", reject_rule: "rejected" }[input.action];
        await client.query(
          "update hr_settlement_encashment_rule set state=$3,version=version+1,submitted_by=case when $3='submitted' then $4 else submitted_by end,decided_by=case when $3 in('approved','rejected') then $4 else null end,reason=$5,updated_at=clock_timestamp() where tenant_id=$1 and id=$2",
          [c.tenantId, id, state, c.actor.userId, input.reason],
        );
        after = (
          await client.query("select * from hr_settlement_encashment_rule where tenant_id=$1 and id=$2", [
            c.tenantId,
            id,
          ])
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
            "HR_ENCASHMENT_REVIEW_REQUIRED",
            "Encashment conflicts with approved policy dates, independent decisions, exact source evidence or available leave. Refresh and review.",
          ),
          { cause: e },
        );
      throw e;
    } finally {
      client.release();
    }
  }
}

export async function requireSettlementEncashmentAuthority(
  client: PoolClient,
  c: HrActorContext,
  company: string,
  id: string,
  action: string,
) {
  if (!["approve", "submit"].includes(action)) return;
  const sources = (
    await client.query(
      "select s.created_by,s.snapshot from hr_settlement_encashment_source s join hr_lifecycle_case c on c.tenant_id=s.tenant_id and c.company_id=s.company_id and c.id=s.case_id where s.tenant_id=$1 and s.company_id=$2 and c.id=$3 and exists(select 1 from jsonb_array_elements(c.terms->'lines') l where l->>'encashment_source_id'=s.id)",
      [c.tenantId, company, id],
    )
  ).rows;
  if (!sources.length) return;
  if (sources.some((s) => s.snapshot.rule.terms.salary_basis)) await requireSettlementSalaryRead(client, c, company);
  await permission(client, c, company, "hr.leave.balance.read");
  if (action === "approve") {
    await permission(client, c, company, "hr.leave.balance.adjust");
    if (sources.some((s) => s.created_by === c.actor.userId))
      deny("The officer who calculated a settlement line cannot approve it.");
  }
}
