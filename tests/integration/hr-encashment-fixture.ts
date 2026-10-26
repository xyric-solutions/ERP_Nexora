import { randomUUID } from "node:crypto";
import type { DatabasePool } from "../../packages/db/src/index.js";
import { createLifecycleFixture, lifecycleActor, lifecyclePermissions } from "./hr-lifecycle-case-fixture.js";
import { sourceTestTenantId as tenant } from "./source-security-fixture.js";
import {
  createHrLeaveTypeRequestSchema,
  type HrSettlementEntitlementAction,
  hrSettlementEntitlementWorkspaceSchema,
} from "../../packages/contracts/src/hr/index.js";
export const encashmentPermissions = [
  ...lifecyclePermissions,
  "hr.leave.type.read",
  "hr.leave.type.manage",
  "hr.leave.balance.read",
  "hr.leave.balance.adjust",
];
export const encashmentActor = (who = "r06.maker") => lifecycleActor(who, encashmentPermissions);
export async function createEncashmentFixture(pool: DatabasePool, base?: Parameters<typeof createLifecycleFixture>[2]) {
  const f = await createLifecycleFixture(pool, false, base),
    month = f.today.slice(0, 7) + "-01";
  for (const policy of ["r06-uat-policy-maker", "r06-uat-policy-checker"])
    for (const key of encashmentPermissions) {
      await pool.query(
        "insert into security_role_permission_grant(tenant_id,role_policy_id,permission_key,field_allow_mode) values($1,$2,$3,'all') on conflict do nothing",
        [tenant, policy, key],
      );
      await pool.query(
        "insert into security_role_scope_grant(tenant_id,role_policy_id,permission_key,scope_kind,scope_value) values($1,$2,$3,'company',$4) on conflict do nothing",
        [tenant, policy, key, f.companyId],
      );
    }
  const type = await f.repo.createLeaveType(
    encashmentActor(),
    createHrLeaveTypeRequestSchema.parse({
      company_id: f.companyId,
      code: "CASHABLE",
      name: "Contractual cashable annual leave",
      paid: true,
      policy: {
        effective_from: month,
        annual_entitlement_days: "30",
        accrual_method: "annual_grant",
        carry_forward: false,
        maximum_carry_forward_days: "0",
        maximum_balance_days: "40",
        minimum_request_days: "0.5",
        maximum_request_days: "30",
        requires_hr_approval: true,
        applicable_category_ids: [],
        applicable_genders: [],
        document_required_after_days: null,
      },
      reason: "Reviewed synthetic paid leave policy for settlement acceptance",
    }),
    randomUUID(),
    "encashment-fixture",
  );
  const balance = async (date = f.today) =>
    (
      await f.repo.listLeaveBalances(encashmentActor(), {
        company_id: f.companyId,
        as_of: date,
        employee_id: f.person.employeeId,
        leave_type_id: type.id,
        limit: 25,
        offset: 0,
      })
    ).items[0]!;
  const posting = async (days = "12.3456", kind: "opening" | "adjustment" = "opening") =>
    f.repo.postLeaveBalance(
      encashmentActor(),
      {
        company_id: f.companyId,
        employee_id: f.person.employeeId,
        leave_type_id: type.id,
        effective_on: f.today,
        kind,
        days,
        period_start: null,
        period_end: null,
        expected_balance_hash: (await balance()).hash,
        reason: "Reviewed independent entitlement migration or balance correction",
      },
      randomUUID(),
      "encashment-test",
    );
  await posting();
  const exit = await f.save({
    kind: "resignation",
    relationship_id: f.relationshipId,
    last_working_date: f.today,
    notice_reference: "reviewed-exit-for-encashment",
    summary: "Independent approved exit for entitlement calculation",
  });
  await f.act(exit.id, "submit");
  await f.act(exit.id, "approve", "r06.checker");
  const statement = await f.save({
    kind: "settlement",
    exit_case_id: exit.id,
    currency: "PKR",
    notes: "Reviewed settlement with a zero reference before generated entitlements",
    lines: [
      {
        direction: "earning",
        description: "Other entitlements reviewed; no amount due",
        amount_minor: "0",
        source_reference: "reviewed-contractual-no-other-amount",
      },
    ],
  });
  const action = (input: HrSettlementEntitlementAction, who = "r06.maker", key = randomUUID()) =>
    f.repo.actOnSettlementEntitlement(encashmentActor(who), input, key, "encashment-test");
  const ruleTerms = {
    name: "Reviewed contractual leave encashment",
    leave_type_id: type.id,
    currency: "PKR",
    rate_minor: "10001",
    maximum_days: "10.2500",
    minimum_service_days: 0,
    effective_from: month,
    effective_to: f.today.slice(0, 4) + "-12-31",
    policy_reference: "Synthetic signed company policy; no statutory rate assumed",
  };
  const rule = await action({
    action: "create_rule",
    company_id: f.companyId,
    terms: ruleTerms,
    reason: "Reviewed contractual encashment policy and rates",
  });
  const decide = async (decision: "submit_rule" | "approve_rule" | "reject_rule", who = "r06.maker", id = rule.id) =>
    action(
      {
        action: decision,
        company_id: f.companyId,
        id,
        expected_version: (
          await pool.query("select version from hr_settlement_encashment_rule where tenant_id=$1 and id=$2", [
            tenant,
            id,
          ])
        ).rows[0].version,
        reason: "Independent contractual policy review and version decision",
      },
      who,
    );
  const preview = async (ruleId = rule.id) =>
    hrSettlementEntitlementWorkspaceSchema.parse(
      await f.repo.getSettlementEntitlements(encashmentActor(), {
        company_id: f.companyId,
        exit_case_id: exit.id,
        rule_id: ruleId,
        limit: 25,
        offset: 0,
      }),
    );
  const add = async (who = "r06.maker", hash?: string) =>
    action(
      {
        action: "add_to_statement",
        company_id: f.companyId,
        id: statement.id,
        expected_version: (
          await pool.query("select version from hr_lifecycle_case where tenant_id=$1 and id=$2", [tenant, statement.id])
        ).rows[0].version,
        rule_id: rule.id,
        source_hash: hash ?? (await preview()).preview!.source_hash,
        reason: "Reviewed available leave and approved policy calculation",
      },
      who,
    );
  const caseAction = async (decision: "submit" | "approve" | "return", who = "r06.maker", key = randomUUID()) =>
    f.repo.actOnLifecycleCase(
      encashmentActor(who),
      {
        action: decision,
        company_id: f.companyId,
        id: statement.id,
        expected_version: (
          await pool.query("select version from hr_lifecycle_case where tenant_id=$1 and id=$2", [tenant, statement.id])
        ).rows[0].version,
        reason: "Independent settlement review including leave consumption",
      },
      key,
      "encashment-test",
    );
  return { ...f, type, balance, posting, exit, statement, rule, ruleTerms, action, decide, preview, add, caseAction };
}
