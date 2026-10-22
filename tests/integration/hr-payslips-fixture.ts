import { randomUUID } from "node:crypto";
import type { DatabasePool } from "../../packages/db/src/index.js";
import { createProductionJournalFixture } from "./hr-payroll-production-journal-fixture.js";
import { journalActor, journalPermissions } from "./hr-payroll-journal-fixture.js";
import { sourceTestTenantId as tenant } from "./source-security-fixture.js";
import {
  hrPayslipQuerySchema,
  hrPayslipWorkspaceSchema,
  hrPayslipDetailSchema,
} from "../../packages/contracts/src/hr/index.js";
export const payslipPermissions = [...journalPermissions, "hr.payroll.payslip.release"];
export const payslipActor = (who = "r06.checker", permissions = payslipPermissions) => journalActor(who, permissions);
export async function createPayslipFixture(pool: DatabasePool, posted = true) {
  const f = await createProductionJournalFixture(pool);
  if (posted) {
    await f.journalAction("prepare");
    await f.journalAction("accept", "r06.checker");
    await f.journalAction("post", "r06.target");
  }
  for (const policy of ["r06-uat-policy-maker", "r06-uat-policy-checker", "r06-uat-policy-payment-poster"])
    for (const permission of ["hr.payroll.payslip.read", "hr.payroll.result.read", "hr.payroll.payslip.release"]) {
      await pool.query(
        `insert into security_role_permission_grant(tenant_id,role_policy_id,permission_key,field_allow_mode) values($1,$2,$3,'all') on conflict do nothing`,
        [tenant, policy, permission],
      );
      await pool.query(
        `insert into security_role_scope_grant(tenant_id,role_policy_id,permission_key,scope_kind,scope_value) values($1,$2,$3,'company',$4) on conflict do nothing`,
        [tenant, policy, permission, f.companyId],
      );
    }
  const read = async (who = "r06.checker", extra: Record<string, unknown> = {}) =>
    hrPayslipWorkspaceSchema.parse(
      await f.repo.getPayslipWorkspace(payslipActor(who), hrPayslipQuerySchema.parse({ ...f.query, ...extra })),
    );
  const detail = async (id: string, who = "r06.checker") =>
    hrPayslipDetailSchema.parse(await f.repo.getPayslipDetail(payslipActor(who), f.companyId, id));
  const release = async (who = "r06.checker", ids?: string[], key = randomUUID()) => {
    const w = await read(who);
    return f.repo.releasePayslips(
      payslipActor(who),
      {
        ...f.query,
        result_ids: ids ?? w.items.filter((i) => i.state === "pending").map((i) => i.result_id),
        source_hash: w.source_hash,
        reason: "Independent exact payslip publication acceptance",
      },
      key,
      "payslip-test",
    );
  };
  return { ...f, payslipRead: read, payslipDetail: detail, release };
}
