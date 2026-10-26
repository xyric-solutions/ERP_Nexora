import { randomUUID } from "node:crypto";
import type { DatabasePool } from "../../packages/db/src/index.js";
import { createLifecycleFixture, lifecycleActor } from "./hr-lifecycle-case-fixture.js";
import { sourceTestTenantId as tenant } from "./source-security-fixture.js";
import {
  hrSettlementBenefitWorkspaceSchema,
  type HrSettlementBenefitAction,
  type HrBenefitRuleTerms,
} from "../../packages/contracts/src/hr/index.js";
export async function createBenefitFixture(
  pool: DatabasePool,
  base?: Parameters<typeof createLifecycleFixture>[2],
  employmentStart?: string,
) {
  const f = await createLifecycleFixture(pool, false, base, { employmentStart }),
    exit = await f.save({
      kind: "resignation",
      relationship_id: f.relationshipId,
      last_working_date: f.today,
      notice_reference: "signed-contractual-notice-reviewed",
      summary: "Approved synthetic company exit for benefit acceptance",
    });
  await f.act(exit.id, "submit");
  await f.act(exit.id, "approve", "r06.checker");
  const statement = await f.save({
    kind: "settlement",
    exit_case_id: exit.id,
    currency: "PKR",
    notes: "Reviewed other entitlements and company benefit sources",
    lines: [
      {
        direction: "earning",
        description: "Other amounts reviewed; no amount due",
        amount_minor: "0",
        source_reference: "signed-other-entitlements-reviewed",
      },
    ],
  });
  const terms: HrBenefitRuleTerms = {
    name: "Signed company contractual benefit",
    category: "gratuity" as const,
    basis: "fixed_amount" as "fixed_amount" | "completed_service_years",
    direction: "earning" as "earning" | "deduction",
    currency: "PKR",
    rate_minor: "12345",
    maximum_units: 1,
    minimum_service_days: 0,
    exit_kinds: ["resignation", "termination"] as Array<"resignation" | "termination">,
    effective_from: f.today.slice(0, 7) + "-01",
    effective_to: f.today.slice(0, 4) + "-12-31",
    policy_reference: "Synthetic signed company policy; no legal rates or entitlement assumed",
  };
  const action = (input: HrSettlementBenefitAction, who = "r06.maker", key = randomUUID()) =>
    f.repo.actOnSettlementBenefit(lifecycleActor(who), input, key, "benefit-test");
  const create = (overrides: Partial<typeof terms> = {}) =>
    action({
      action: "create_rule",
      company_id: f.companyId,
      terms: { ...terms, ...overrides },
      reason: "Reviewed contractual company benefit draft and external policy reference",
    });
  const rule = await create();
  const decide = async (actionName: "submit_rule" | "approve_rule" | "reject_rule", who = "r06.maker", id = rule.id) =>
    action(
      {
        action: actionName,
        company_id: f.companyId,
        id,
        expected_version: (
          await pool.query("select version from hr_settlement_benefit_rule where tenant_id=$1 and id=$2", [tenant, id])
        ).rows[0].version,
        reason: "Independent review of contractual benefit, scope and effective dates",
      },
      who,
    );
  const preview = async (id = rule.id) =>
    hrSettlementBenefitWorkspaceSchema.parse(
      await f.repo.getSettlementBenefits(lifecycleActor(), {
        company_id: f.companyId,
        exit_case_id: exit.id,
        rule_id: id,
        limit: 25,
        offset: 0,
      }),
    );
  const add = async (id = rule.id, who = "r06.maker", hash?: string) =>
    action(
      {
        action: "add_to_statement",
        company_id: f.companyId,
        id: statement.id,
        expected_version: (
          await pool.query("select version from hr_lifecycle_case where tenant_id=$1 and id=$2", [tenant, statement.id])
        ).rows[0].version,
        rule_id: id,
        source_hash: hash ?? (await preview(id)).preview!.source_hash,
        reason: "Reviewed company benefit, exact service units and approved company rate",
      },
      who,
    );
  return { ...f, exit, statement, terms, action, create, rule, decide, preview, add };
}
