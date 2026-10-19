import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { AuthenticatedAccount } from "../../packages/auth/src/index.js";
import { createDatabasePool, type DatabasePool } from "../../packages/db/src/index.js";
import {
  HrApiError,
  SourceHrRepository,
  type HrActorContext,
} from "../../server/api/src/modules/hr/source-repository.js";
import { ensureSourceSuperAdministratorFixture, sourceTestTenantId } from "./source-security-fixture.js";

const databaseUrl = process.env.TEST_SOURCE_BOOTSTRAP_DATABASE_URL;
const run = databaseUrl ? describe : describe.skip;
const companyId = "hr-override-company";
const superAdministratorId = "user-shoaib-super-admin";

function context(userId: string, roles: string[], permissions: string[]): HrActorContext {
  const actor: AuthenticatedAccount = {
    tenantId: sourceTestTenantId,
    organizationName: "Nexora R06 Controlled UAT",
    userId,
    email: `${userId}@uat.nexora.invalid`,
    displayName: userId,
    roles,
    permissions,
    sessionVersion: 1,
  };
  return { tenantId: sourceTestTenantId, actor };
}

run("HR global super-administrator approval override", () => {
  let pool: DatabasePool;
  let repository: SourceHrRepository;

  const superAdministrator = (permissions: string[]) =>
    context(superAdministratorId, ["super_administrator"], [...permissions, "platform.approval.override"]);

  beforeAll(async () => {
    pool = createDatabasePool(databaseUrl!);
    await ensureSourceSuperAdministratorFixture(pool);
    repository = new SourceHrRepository(pool);
    await pool.query(
      `insert into organization_unit (id,tenant_id,parent_id,type,code,name,status)
       values ($1,$2,null,'company','HR-OVERRIDE','HR Override Company','active')
       on conflict (tenant_id,id) do nothing`,
      [companyId, sourceTestTenantId],
    );
    await pool.query(
      `insert into security_user_company_access
        (tenant_id,access_id,user_id,company_id,is_default,granted_by,source_kind,source_reference)
       select $1,'hr-override-shoaib-access',$2,$3,false,$2,
              'governed_administration','hr-approval-override-test'
        where not exists (
          select 1 from security_user_company_access
           where tenant_id=$1 and user_id=$2 and company_id=$3 and revoked_at is null
        )`,
      [sourceTestTenantId, superAdministratorId, companyId],
    );
  });

  afterAll(async () => {
    await pool?.end();
  });

  it("keeps an ordinary maker blocked and writes no override evidence", async () => {
    const suffix = randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase();
    const ordinaryMaker = context(
      "r06.maker",
      ["hr_manager"],
      ["hr.employee.create", "hr.employee.submit", "hr.employee.approve"],
    );
    const employee = await repository.createEmployeeDraft(
      ordinaryMaker,
      {
        company_id: "nexora-r06-uat-company-two",
        employee_number: `O${suffix}`,
        first_name: "Ordinary",
        last_name: "Maker",
        joined_on: "2026-10-19",
      },
      `hr-override-ordinary-create-${suffix}`,
      `hr-override-ordinary-${suffix}`,
    );
    await repository.submitEmployeeDraft(
      ordinaryMaker,
      employee.id,
      { reason: "Ready for independent review." },
      `hr-override-ordinary-submit-${suffix}`,
      `hr-override-ordinary-${suffix}`,
    );
    const before = await pool.query<{ count: number }>(
      `select count(*)::int as count from approval_override_event
        where tenant_id=$1 and resource_type='hr.employee_draft_approval'`,
      [sourceTestTenantId],
    );
    await expect(
      repository.decideEmployeeDraftApproval(
        ordinaryMaker,
        employee.id,
        { decision: "approved", reason: "Self approval must remain blocked." },
        `hr-override-ordinary-decide-${suffix}`,
        `hr-override-ordinary-${suffix}`,
      ),
    ).rejects.toMatchObject({ status: 403, code: "HR_SELF_APPROVAL_FORBIDDEN" } satisfies Partial<HrApiError>);
    const after = await pool.query<{ count: number }>(
      `select count(*)::int as count from approval_override_event
        where tenant_id=$1 and resource_type='hr.employee_draft_approval'`,
      [sourceTestTenantId],
    );
    expect(after.rows[0]?.count).toBe(before.rows[0]?.count);
  });

  it("self-approves an employee draft with immutable governed evidence", async () => {
    const suffix = randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase();
    const actor = superAdministrator(["hr.employee.create", "hr.employee.submit", "hr.employee.approve"]);
    const employee = await repository.createEmployeeDraft(
      actor,
      {
        company_id: companyId,
        employee_number: `S${suffix}`,
        first_name: "Super",
        last_name: "Administrator",
        joined_on: "2026-10-19",
      },
      `hr-override-employee-create-${suffix}`,
      `hr-override-employee-${suffix}`,
    );
    await repository.submitEmployeeDraft(
      actor,
      employee.id,
      { reason: "Controlled profile submission." },
      `hr-override-employee-submit-${suffix}`,
      `hr-override-employee-${suffix}`,
    );
    await expect(
      repository.decideEmployeeDraftApproval(
        actor,
        employee.id,
        { decision: "approved", reason: "Operational continuity requires this documented override." },
        `hr-override-employee-decide-${suffix}`,
        `hr-override-employee-${suffix}`,
      ),
    ).resolves.toMatchObject({ id: employee.id, replayed: false });

    const evidence = await pool.query<{
      state: string;
      decided_by: string;
      approval_override_event_id: string;
      decision_action: string;
      normal_permission_key: string;
    }>(
      `select approval.state,approval.decided_by,approval.approval_override_event_id,
              event.decision_action,event.normal_permission_key
         from hr_employee_draft_approval approval
         join approval_override_event event
           on event.tenant_id=approval.tenant_id
          and event.event_id=approval.approval_override_event_id
        where approval.tenant_id=$1 and approval.employee_id=$2`,
      [sourceTestTenantId, employee.id],
    );
    expect(evidence.rows[0]).toMatchObject({
      state: "approved",
      decided_by: superAdministratorId,
      decision_action: "approve",
      normal_permission_key: "hr.employee.approve",
    });
    await expect(
      pool.query(
        `update approval_override_event set reason='tampered'
          where tenant_id=$1 and event_id=$2`,
        [sourceTestTenantId, evidence.rows[0]?.approval_override_event_id],
      ),
    ).rejects.toMatchObject({ code: "P0001" });
  });

  it("records separate approval and activation evidence for one lifecycle policy", async () => {
    const suffix = randomUUID().replaceAll("-", "").slice(0, 10).toUpperCase();
    const lifecycleCompanyId = `hr-override-company-${suffix.toLowerCase()}`;
    const actor = superAdministrator([
      "hr.employment_lifecycle_policy.manage",
      "hr.employment_lifecycle_policy.approve",
    ]);
    await pool.query(
      `insert into organization_unit (id,tenant_id,parent_id,type,code,name,status)
       values ($1,$2,null,'company',$3,'HR Lifecycle Override Company','active')`,
      [lifecycleCompanyId, sourceTestTenantId, `HR-OVR-${suffix}`],
    );
    await pool.query(
      `insert into security_user_company_access
        (tenant_id,access_id,user_id,company_id,is_default,granted_by,source_kind,source_reference)
       values ($1,$2,$3,$4,false,$3,'governed_administration','hr-approval-override-test')`,
      [
        sourceTestTenantId,
        `hr-override-shoaib-access-${suffix.toLowerCase()}`,
        superAdministratorId,
        lifecycleCompanyId,
      ],
    );
    const policy = await repository.createEmploymentLifecyclePolicy(
      actor,
      {
        company_id: lifecycleCompanyId,
        code: `OVR-${suffix}`,
        name: "Override evidence lifecycle",
        effective_from: "2026-10-19",
      },
      `hr-override-policy-create-${suffix}`,
      `hr-override-policy-${suffix}`,
    );
    await repository.submitEmploymentLifecyclePolicy(
      actor,
      policy.id,
      { reason: "Policy ready for governed review." },
      `hr-override-policy-submit-${suffix}`,
      `hr-override-policy-${suffix}`,
    );
    await repository.approveEmploymentLifecyclePolicy(
      actor,
      policy.id,
      { reason: "Documented self-approval for operational continuity." },
      `hr-override-policy-approve-${suffix}`,
      `hr-override-policy-${suffix}`,
    );
    await repository.activateEmploymentLifecyclePolicy(
      actor,
      policy.id,
      { reason: "Documented self-activation for operational continuity." },
      `hr-override-policy-activate-${suffix}`,
      `hr-override-policy-${suffix}`,
    );

    const evidence = await pool.query<{
      approval_override_event_id: string;
      activation_override_event_id: string;
      approval_action: string;
      activation_action: string;
    }>(
      `select policy.approval_override_event_id,policy.activation_override_event_id,
              approval.decision_action as approval_action,
              activation.decision_action as activation_action
         from hr_employment_lifecycle_policy policy
         join approval_override_event approval
           on approval.tenant_id=policy.tenant_id
          and approval.event_id=policy.approval_override_event_id
         join approval_override_event activation
           on activation.tenant_id=policy.tenant_id
          and activation.event_id=policy.activation_override_event_id
        where policy.tenant_id=$1 and policy.id=$2`,
      [sourceTestTenantId, policy.id],
    );
    expect(evidence.rows[0]).toMatchObject({ approval_action: "approve", activation_action: "activate" });
    expect(evidence.rows[0]?.approval_override_event_id).not.toBe(evidence.rows[0]?.activation_override_event_id);
    await expect(
      pool.query(
        `update hr_employment_lifecycle_policy
            set activation_override_event_id=$3
          where tenant_id=$1 and id=$2`,
        [sourceTestTenantId, policy.id, evidence.rows[0]?.approval_override_event_id],
      ),
    ).rejects.toMatchObject({ code: "23514" });
  });
});
