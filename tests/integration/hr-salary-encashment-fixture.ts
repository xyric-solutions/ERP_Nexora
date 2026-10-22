import { grantSalaryBenefit as grantSalaryEncashment } from "./hr-salary-benefit-fixture.js";
import { randomUUID } from "node:crypto";
import type { DatabasePool } from "../../packages/db/src/index.js";
import { createEncashmentFixture } from "./hr-encashment-fixture.js";
import { createPayrollRunFixture, runPermissions } from "./hr-payroll-run-fixture.js";
import { lifecycleActor, lifecyclePermissions } from "./hr-lifecycle-case-fixture.js";
import { sourceTestTenantId as tenant } from "./source-security-fixture.js";
import {
  hrSettlementEntitlementWorkspaceSchema,
  type HrEncashmentRuleTerms,
  type HrSettlementEntitlementAction,
  type HrLifecycleCaseAction,
} from "../../packages/contracts/src/hr/index.js";
export const salaryEncashmentPermissions = [
  ...new Set([
    ...runPermissions,
    ...lifecyclePermissions,
    "hr.leave.type.read",
    "hr.leave.type.manage",
    "hr.leave.balance.read",
    "hr.leave.balance.adjust",
  ]),
];
export const salaryEncashmentActor = (id = "r06.maker") => lifecycleActor(id, salaryEncashmentPermissions);
export async function attachSalaryEncashment(
  pool: DatabasePool,
  f: Awaited<ReturnType<typeof createEncashmentFixture>>,
  componentId: string,
  termsOverride: Partial<HrEncashmentRuleTerms> = {},
) {
  await grantSalaryEncashment(pool, f.companyId);
  const terms: HrEncashmentRuleTerms = {
    ...f.ruleTerms,
    rate_minor: "0",
    salary_basis: { component_ids: [componentId], multiplier: 1, divisor: 30 },
    ...termsOverride,
  };
  const action = (input: HrSettlementEntitlementAction, who = "r06.maker", key = randomUUID()) =>
    f.repo.actOnSettlementEntitlement(salaryEncashmentActor(who), input, key, "salary-benefit-test");
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
          await pool.query("select version from hr_settlement_encashment_rule where tenant_id=$1 and id=$2", [
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
    hrSettlementEntitlementWorkspaceSchema.parse(
      await f.repo.getSettlementEntitlements(salaryEncashmentActor(who), {
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
      salaryEncashmentActor(who),
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
export async function createSalaryEncashmentFixture(pool: DatabasePool) {
  let f: Awaited<ReturnType<typeof createEncashmentFixture>>;
  const pay = await createPayrollRunFixture(pool, [], {
    beforeAttendanceClose: async (base) => {
      f = await createEncashmentFixture(pool, { fixture: base, person: base.person });
    },
  });
  return { ...(await attachSalaryEncashment(pool, f!, pay.component.id)), pay };
}
