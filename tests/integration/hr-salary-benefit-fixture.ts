import { randomUUID } from "node:crypto";
import type { DatabasePool } from "../../packages/db/src/index.js";
import { createBenefitFixture } from "./hr-benefit-fixture.js";
import { createPayrollRunFixture, runPermissions } from "./hr-payroll-run-fixture.js";
import { lifecycleActor, lifecyclePermissions } from "./hr-lifecycle-case-fixture.js";
import { sourceTestTenantId as tenant } from "./source-security-fixture.js";
import {
  hrSettlementBenefitWorkspaceSchema,
  type HrBenefitRuleTerms,
  type HrSettlementBenefitAction,
  type HrLifecycleCaseAction,
} from "../../packages/contracts/src/hr/index.js";
export const salaryBenefitPermissions = [
  ...new Set([...runPermissions, ...lifecyclePermissions, "hr.leave.balance.read", "hr.leave.balance.adjust"]),
];
export const salaryBenefitActor = (id = "r06.maker") => lifecycleActor(id, salaryBenefitPermissions);
export async function grantSalaryBenefit(pool: DatabasePool, company: string) {
  for (const policy of ["r06-uat-policy-maker", "r06-uat-policy-checker"])
    for (const key of [
      "hr.payroll.setup.read",
      "hr.payroll.salary.read",
      "hr.payroll.adjustment.read",
      "hr.payroll.adjustment.manage",
      "hr.payroll.adjustment.approve",
      "hr.leave.balance.read",
      "hr.leave.balance.adjust",
    ]) {
      await pool.query(
        "insert into security_role_permission_grant(tenant_id,role_policy_id,permission_key,field_allow_mode) values($1,$2,$3,'all') on conflict do nothing",
        [tenant, policy, key],
      );
      await pool.query(
        "insert into security_role_scope_grant(tenant_id,role_policy_id,permission_key,scope_kind,scope_value) values($1,$2,$3,'company',$4) on conflict do nothing",
        [tenant, policy, key, company],
      );
    }
}
export async function attachSalaryBenefit(
  pool: DatabasePool,
  f: Awaited<ReturnType<typeof createBenefitFixture>>,
  componentId: string,
  termsOverride: Partial<HrBenefitRuleTerms> = {},
) {
  await grantSalaryBenefit(pool, f.companyId);
  const terms: HrBenefitRuleTerms = {
    ...f.terms,
    category: "severance",
    rate_minor: "0",
    salary_basis: { component_ids: [componentId], multiplier: 1, divisor: 3 },
    ...termsOverride,
  };
  const action = (input: HrSettlementBenefitAction, who = "r06.maker", key = randomUUID()) =>
    f.repo.actOnSettlementBenefit(salaryBenefitActor(who), input, key, "salary-benefit-test");
  const rule = await action({
    action: "create_rule",
    company_id: f.companyId,
    terms,
    reason: "Reviewed approved salary components and signed company benefit factors",
  });
  const decide = async (actionName: "submit_rule" | "approve_rule" | "reject_rule", who = "r06.maker") =>
    action(
      {
        action: actionName,
        company_id: f.companyId,
        id: rule.id,
        expected_version: (
          await pool.query("select version from hr_settlement_benefit_rule where tenant_id=$1 and id=$2", [
            tenant,
            rule.id,
          ])
        ).rows[0].version,
        reason: "Independent review of company salary basis and rational factors",
      },
      who,
    );
  const row = async () =>
    (await pool.query("select * from hr_lifecycle_case where tenant_id=$1 and id=$2", [tenant, f.statement.id]))
      .rows[0];
  const preview = async (who = "r06.maker") =>
    hrSettlementBenefitWorkspaceSchema.parse(
      await f.repo.getSettlementBenefits(salaryBenefitActor(who), {
        company_id: f.companyId,
        exit_case_id: f.exit.id,
        rule_id: rule.id,
        limit: 25,
        offset: 0,
      }),
    );
  const add = async (who = "r06.maker") =>
    action(
      {
        action: "add_to_statement",
        company_id: f.companyId,
        id: f.statement.id,
        expected_version: (await row()).version,
        rule_id: rule.id,
        source_hash: (await preview(who)).preview!.source_hash,
        reason: "Reviewed actual salary authority and exact single-rounding company entitlement",
      },
      who,
    );
  const caseAction = async (
    actionName: Exclude<HrLifecycleCaseAction["action"], "save" | "prepare_payroll" | "request_financial_correction" | "decide_financial_correction" | "calculate_payroll_correction" | "approve_payroll_correction" | "reject_payroll_correction" | "post_payroll_correction">,
    who = "r06.maker",
  ) =>
    f.repo.actOnLifecycleCase(
      salaryBenefitActor(who),
      {
        action: actionName,
        company_id: f.companyId,
        id: f.statement.id,
        expected_version: (await row()).version,
        reason: "Reviewed salary-based statement evidence and independent decision",
      },
      randomUUID(),
      "salary-benefit-test",
    );
  return {
    ...f,
    salaryTerms: terms,
    salaryRule: rule,
    salaryAction: action,
    decideSalary: decide,
    salaryRow: row,
    salaryPreview: preview,
    addSalary: add,
    salaryCaseAction: caseAction,
  };
}
export async function createSalaryBenefitFixture(pool: DatabasePool, years = false) {
  let f: Awaited<ReturnType<typeof createBenefitFixture>>;
  const start = years
    ? (await pool.query("select (current_date-interval '3 years 6 months')::date::text as day")).rows[0].day
    : undefined;
  const pay = await createPayrollRunFixture(pool, [], {
    beforeAttendanceClose: async (base) => {
      f = await createBenefitFixture(pool, { fixture: base, person: base.person }, start);
    },
  });
  return {
    ...(await attachSalaryBenefit(
      pool,
      f!,
      pay.component.id,
      years ? { basis: "completed_service_years", maximum_units: 2 } : {},
    )),
    pay,
  };
}
