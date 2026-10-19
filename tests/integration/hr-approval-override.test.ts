import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { AuthenticatedAccount } from "../../packages/auth/src/index.js";
import { createDatabasePool, type DatabasePool } from "../../packages/db/src/index.js";
import {
  HrApiError,
  SourceHrRepository,
  type HrActorContext,
} from "../../server/api/src/modules/hr/source-repository.js";
import { ensureSourceAuthorizationFixture, sourceTestTenantId } from "./source-security-fixture.js";

const databaseUrl = process.env.TEST_SOURCE_BOOTSTRAP_DATABASE_URL;
const run = databaseUrl ? describe : describe.skip;
const companyId = "hr-override-company";
const superAdministratorId = "hr.override.admin";

async function ensureHrOverrideAdministrator(pool: DatabasePool): Promise<void> {
  await ensureSourceAuthorizationFixture(pool);
  const client = await pool.connect();
  const policyId = "hr-override-super-admin-policy";
  const assignmentId = "hr-override-super-admin-assignment";
  const permissions = [
    "platform.approval.override",
    "hr.employee.create",
    "hr.employee.submit",
    "hr.employee.approve",
    "hr.employment_lifecycle_policy.manage",
    "hr.employment_lifecycle_policy.approve",
  ];
  try {
    await client.query("begin");
    await client.query("select set_config('nexora.tenant_id',$1,true)", [sourceTestTenantId]);
    await client.query(
      `insert into security_user_account
        (id,tenant_id,identity_subject,email,status,mfa_state,created_at,updated_at,display_name)
       values ($1,$2,$3,'hr-override-admin@uat.nexora.invalid','active','disabled',now(),now(),
               'HR Override Administrator')
       on conflict (tenant_id,id) do update set status='active',updated_at=now()`,
      [superAdministratorId, sourceTestTenantId, `local:${superAdministratorId}`],
    );
    await client.query(
      `insert into security_tenant_role
        (tenant_id,role_id,role_code,display_name,description,lifecycle_state,source_kind,source_reference)
       values ($1,'hr-override-super-admin-role','super_administrator','Super Administrator',
               'HR override integration fixture','active','legacy_backfill','hr-override-test')
       on conflict (tenant_id,role_code) do nothing`,
      [sourceTestTenantId],
    );
    const role = await client.query<{ role_id: string }>(
      `select role_id from security_tenant_role
        where tenant_id=$1 and role_code='super_administrator' and lifecycle_state='active'`,
      [sourceTestTenantId],
    );
    const roleId = role.rows[0]?.role_id;
    if (!roleId) throw new Error("The governed super-administrator role is unavailable");
    await client.query(
      `insert into security_role_policy
        (id,tenant_id,role,scope,permissions,field_rules,sod_rules,version,status,created_at,role_id,lifecycle_state)
       values ($2,$1,'super_administrator',jsonb_build_object('mode','tenant'),$3::jsonb,
               '{"allow":null,"deny":[]}'::jsonb,
               '{"conflicting_roles":[],"distinct_actor_fields":[]}'::jsonb,
               2147483646,'active',now(),$4,'active')
       on conflict (tenant_id,id) do update set
         permissions=excluded.permissions,status='active',lifecycle_state='active',archived_at=null`,
      [sourceTestTenantId, policyId, JSON.stringify(permissions), roleId],
    );
    await client.query(
      `insert into security_role_permission_grant
        (tenant_id,role_policy_id,permission_key,field_allow_mode)
       select $1,$2,permission_key,'all' from security_permission_definition
        where permission_key=any($3::text[]) and status='active'
       on conflict do nothing`,
      [sourceTestTenantId, policyId, permissions],
    );
    await client.query(
      `insert into security_user_role_assignment
        (tenant_id,user_id,role_policy_id,assigned_by,assigned_at,assignment_id,lifecycle_state,valid_from)
       values ($1,$2,$3,$2,now(),$4,'active',now())
       on conflict (tenant_id,user_id,role_policy_id) do update set
         lifecycle_state='active',revoked_by=null,revoked_at=null,revocation_reason=null`,
      [sourceTestTenantId, superAdministratorId, policyId, assignmentId],
    );
    await client.query(
      `insert into security_user_role_assignment_version
        (tenant_id,assignment_id,version,supersedes_version,user_id,role_policy_id,lifecycle_state,
         valid_from,valid_until,assigned_by,administration_command_id,source_kind,source_reference)
       select $1,$2,1,null,$3,$4,'active',assignment.valid_from,null,$3,null,
              'legacy_backfill','hr-override-test'
         from security_user_role_assignment assignment
        where assignment.tenant_id=$1 and assignment.assignment_id=$2
       on conflict (tenant_id,assignment_id,version) do nothing`,
      [sourceTestTenantId, assignmentId, superAdministratorId, policyId],
    );
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

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
    await ensureHrOverrideAdministrator(pool);
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
