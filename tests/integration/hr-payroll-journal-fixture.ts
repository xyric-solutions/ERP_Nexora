import { randomUUID } from "node:crypto";
import type { DatabasePool } from "../../packages/db/src/index.js";
import { createLoanFixture } from "./hr-payroll-loans-fixture.js";
import { runActor, runPermissions } from "./hr-payroll-run-fixture.js";
import { sourceTestTenantId as tenant } from "./source-security-fixture.js";
import { hrPayrollJournalWorkspaceSchema, type HrPayrollJournalAction } from "../../packages/contracts/src/hr/index.js";
export const journalPermissions = [
  ...runPermissions,
  "finance.journal.read",
  "finance.journal.create",
  "finance.journal.post",
  "workflow.approval.approve",
  "workflow.approval.reject",
];
export const journalActor = (who = "r06.maker", permissions = journalPermissions) => runActor(who, permissions);
export async function createJournalFixture(pool: DatabasePool, options: { fund?: boolean; approve?: boolean } = {}) {
  const f = await createLoanFixture(pool);
  await grantJournalFixtureAuthority(pool, f.companyId);
  if (options.fund !== false) await f.fund();
  if (options.approve !== false) {
    await f.act("calculate");
    await f.act("submit");
    await f.act("approve", "r06.checker");
  }
  const read = async (who = "r06.maker", extra: Record<string, string> = {}) =>
    hrPayrollJournalWorkspaceSchema.parse(
      await f.repo.getPayrollJournalWorkspace(journalActor(who), { ...f.query, ...extra }),
    );
  const act = async (action: HrPayrollJournalAction["action"], who = "r06.maker", key = randomUUID()) => {
    const workspace = await read(who);
    return f.repo.actOnPayrollJournal(
      journalActor(who),
      {
        ...f.query,
        posting_date: workspace.posting_date,
        action,
        expected_version: workspace.proposal?.version ?? 0,
        source_hash: workspace.source_hash,
        reason: "Independent governed Payroll accrual acceptance",
      },
      key,
      "journal-test",
    );
  };
  return { ...f, journalRead: read, journalAction: act };
}

export async function grantJournalFixtureAuthority(pool: DatabasePool, companyId: string) {
  for (const [policy, keys] of [
    ["r06-uat-policy-maker", ["finance.journal.read", "finance.journal.create"]],
    ["r06-uat-policy-checker", ["finance.journal.read", "workflow.approval.approve", "workflow.approval.reject"]],
    ["r06-uat-policy-payment-poster", ["finance.journal.read", "finance.journal.post"]],
  ] as const)
    for (const permission of keys) {
      await pool.query(
        `insert into security_role_permission_grant(tenant_id,role_policy_id,permission_key,field_allow_mode) values($1,$2,$3,'all') on conflict do nothing`,
        [tenant, policy, permission],
      );
      await pool.query(
        `insert into security_role_scope_grant(tenant_id,role_policy_id,permission_key,scope_kind,scope_value) values($1,$2,$3,'company',$4) on conflict do nothing`,
        [tenant, policy, permission, companyId],
      );
    }
}
