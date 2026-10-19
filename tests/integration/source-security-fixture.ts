import type { DatabasePool } from "../../packages/db/src/index.js";
import { migrateSourceSchema } from "../../packages/db/src/source-migrations.js";

export const sourceTestTenantId = "nexora-r06-uat";

const users = ["r06.maker", "r06.checker", "r06.target", "r06.restricted", "r06.last-admin-a", "r06.last-admin-b"];

const makerPermissions = [
  "security.authorization.permission.read",
  "security.authorization.role.read",
  "security.authorization.role.create",
  "security.authorization.role.edit",
  "security.authorization.role.submit",
  "security.authorization.role.activate",
  "security.authorization.role.archive",
  "security.authorization.assignment.read",
  "security.authorization.assignment.create",
  "security.authorization.assignment.edit",
  "security.authorization.assignment.submit",
  "security.authorization.assignment.revoke",
  "security.authorization.audit.read",
  "security.user_account.read",
  "security.user_account.create",
  "security.user_account.edit",
  "security.user_account.submit",
  "security.user_account.activate",
  "security.user_account.archive",
  "security.user_account.lock",
  "security.user_account.reset_password",
  "security.user_account.revoke_sessions",
  "security.user_account.company_access",
  "security.access_review.read",
  "security.access_review.create",
  "security.access_review.submit",
  "security.access_review.activate",
  "security.access_review.close",
  "security.delegation.read",
  "security.delegation.create",
  "security.delegation.submit",
  "security.delegation.activate",
  "security.delegation.revoke",
  "security.impersonation.read",
  "security.impersonation.create",
  "security.impersonation.submit",
  "security.impersonation.activate",
  "security.impersonation.end",
  "security.session_policy.read",
  "security.session_policy.create",
  "security.session_policy.submit",
  "banking.bank_account.read",
  "banking.bank_account.create",
  "banking.bank_account.update",
  "banking.bank_account.submit",
  "banking.bank_account.status",
] as const;

const checkerPermissions = [
  "security.authorization.permission.read",
  "security.authorization.role.read",
  "security.authorization.role.approve",
  "security.authorization.assignment.read",
  "security.authorization.assignment.approve",
  "security.authorization.audit.read",
  "security.user_account.read",
  "security.user_account.approve",
  "security.access_review.read",
  "security.access_review.approve",
  "security.access_review.decide",
  "security.delegation.read",
  "security.delegation.approve",
  "security.impersonation.read",
  "security.impersonation.approve",
  "security.session_policy.read",
  "security.session_policy.approve",
  "banking.bank_account.read",
  "banking.bank_account.approve",
  "banking.bank_account.status",
] as const;

const roles = [
  {
    roleId: "r06-uat-role-maker",
    policyId: "r06-uat-policy-maker",
    code: "r06_uat_maker",
    name: "Authorization Admin / Maker",
    permissions: makerPermissions,
  },
  {
    roleId: "r06-uat-role-checker",
    policyId: "r06-uat-policy-checker",
    code: "r06_uat_checker",
    name: "Checker / Approver",
    permissions: checkerPermissions,
  },
  {
    roleId: "r06-uat-role-restricted",
    policyId: "r06-uat-policy-restricted",
    code: "r06_uat_restricted",
    name: "Restricted User",
    permissions: ["security.authorization.permission.read"] as const,
  },
  {
    roleId: "r06-uat-role-administrator",
    policyId: "r06-uat-policy-administrator",
    code: "r06_uat_administrator",
    name: "Tenant Administrator",
    permissions: ["security.authorization.administer"] as const,
  },
] as const;

const assignments = [
  ["r06-fixture-assignment-maker", "r06.maker", "r06-uat-policy-maker"],
  ["r06-fixture-assignment-checker", "r06.checker", "r06-uat-policy-checker"],
  ["r06-fixture-assignment-restricted", "r06.restricted", "r06-uat-policy-restricted"],
  ["r06-fixture-assignment-last-admin", "r06.last-admin-b", "r06-uat-policy-administrator"],
] as const;

const sourceStates: ReadonlyArray<readonly [string, string, string]> = [
  ["r06-uat-policy-maker", "security.authorization.role.edit", "draft"],
  ["r06-uat-policy-maker", "security.authorization.role.submit", "draft"],
  ["r06-uat-policy-maker", "security.authorization.role.activate", "approved"],
  ["r06-uat-policy-maker", "security.authorization.role.archive", "active"],
  ["r06-uat-policy-maker", "security.authorization.assignment.edit", "active"],
  ["r06-uat-policy-maker", "security.authorization.assignment.edit", "draft"],
  ["r06-uat-policy-maker", "security.authorization.assignment.submit", "draft"],
  ["r06-uat-policy-maker", "security.authorization.assignment.revoke", "active"],
  ["r06-uat-policy-checker", "security.authorization.role.approve", "submitted"],
  ["r06-uat-policy-checker", "security.authorization.role.approve", "approved"],
  ["r06-uat-policy-checker", "security.authorization.role.approve", "active"],
  ["r06-uat-policy-checker", "security.authorization.assignment.approve", "submitted"],
];

export async function ensureSourceTestTenant(pool: DatabasePool): Promise<void> {
  await migrateSourceSchema(pool);
  await pool.query(
    `insert into tenant (id,name,plan,region,status,default_locale)
     values ($1,'Nexora R06 Controlled UAT','enterprise','uat-isolated','active','en-US')
     on conflict (id) do nothing`,
    [sourceTestTenantId],
  );
  await pool.query(
    `insert into organization_unit (id,tenant_id,parent_id,type,code,name,status)
     values ('nexora-r06-uat-company',$1,null,'company','R06-UAT','Nexora R06 UAT Company','active')
     on conflict (tenant_id,id) do nothing`,
    [sourceTestTenantId],
  );
  await pool.query(
    `insert into account
      (id,tenant_id,company_id,code,name,type,is_header,status,manual_posting_allowed,
       is_system_account,reconciliation_required,created_at)
     values
      ('r06-uat-bank-operating-usd',$1,'nexora-r06-uat-company','10-01-00200','Bank — Operating USD','asset',false,'active',true,false,true,now()),
      ('r06-uat-bank-operating-pkr',$1,'nexora-r06-uat-company','10-01-00210','Bank — Operating PKR','asset',false,'active',true,false,true,now())
     on conflict (tenant_id,id) do update set
       status='active',manual_posting_allowed=true,reconciliation_required=true`,
    [sourceTestTenantId],
  );
  await pool.query(
    `insert into organization_unit (id,tenant_id,parent_id,type,code,name,status)
     values ('nexora-r06-uat-company-two',$1,null,'company','R06-UAT-2','Nexora R06 UAT Company Two','active')
     on conflict (tenant_id,id) do nothing`,
    [sourceTestTenantId],
  );
  for (const [id, number, firstName, lastName] of [
    ["r06-uat-employee-target", "R06-UAT-001", "Target", "Employee"],
    ["r06-uat-employee-candidate", "R06-UAT-002", "Candidate", "Employee"],
  ] as const) {
    await pool.query(
      `insert into employee
        (id,tenant_id,employee_number,first_name,last_name,joined_on,status,created_by)
       values ($1,$2,$3,$4,$5,date '2026-01-01','active','r06.last-admin-a')
       on conflict (tenant_id,id) do nothing`,
      [id, sourceTestTenantId, number, firstName, lastName],
    );
  }
  await pool.query(
    `insert into organization_unit (id,tenant_id,parent_id,type,code,name,status)
     values
       ('nexora-r06-uat-branch',$1,'nexora-r06-uat-company','branch','R06-BR','R06 UAT Branch','active'),
       ('nexora-r06-uat-department',$1,'nexora-r06-uat-branch','department','R06-DEPT','R06 UAT Department','active')
     on conflict (tenant_id,id) do nothing`,
    [sourceTestTenantId],
  );
  for (const [id, masterType, code, name] of [
    ["r06-uat-designation", "designation", "R06-DES", "R06 UAT Designation"],
    ["r06-uat-grade", "job_grade", "R06-GRD", "R06 UAT Grade"],
    ["r06-uat-cost-center", "cost_center", "R06-CC", "R06 UAT Cost Center"],
    ["r06-uat-location", "work_location", "R06-LOC", "R06 UAT Location"],
    ["r06-uat-employment-type", "employment_type", "R06-ET", "R06 UAT Employment Type"],
    ["r06-uat-category", "employee_category", "R06-CAT", "R06 UAT Category"],
  ] as const) {
    await pool.query(
      `insert into hr_master_record
        (id,tenant_id,company_id,master_type,code,name,status,created_by)
       values ($1,$2,'nexora-r06-uat-company',$3,$4,$5,'active','r06.last-admin-a')
       on conflict (tenant_id,id) do nothing`,
      [id, sourceTestTenantId, masterType, code, name],
    );
  }
  for (const employeeId of ["r06-uat-employee-target", "r06-uat-employee-candidate"] as const) {
    await pool.query(
      `insert into employee_assignment
        (id,tenant_id,employee_id,company_id,branch_id,department_id,designation_id,
         job_grade_id,cost_center_id,work_location_id,employment_type_id,
         employee_category_id,effective_from,change_reason,created_by,
         assignment_status,source_reference)
       values ($1,$2,$3,'nexora-r06-uat-company','nexora-r06-uat-branch',
               'nexora-r06-uat-department','r06-uat-designation','r06-uat-grade',
               'r06-uat-cost-center','r06-uat-location','r06-uat-employment-type',
               'r06-uat-category',date '2026-01-01','initial_appointment',
               'r06.last-admin-a','legacy_compatibility','controlled-test-fixture')
       on conflict (tenant_id,id) do nothing`,
      [`r06-uat-assignment-${employeeId}`, sourceTestTenantId, employeeId],
    );
  }
}

export async function ensureSourceAuthorizationFixture(pool: DatabasePool): Promise<void> {
  await ensureSourceTestTenant(pool);
  const client = await pool.connect();
  try {
    await client.query("begin");
    for (const userId of users) {
      await client.query(
        `insert into security_user_account
          (id,tenant_id,identity_subject,email,status,mfa_state,created_at,updated_at)
         values ($1,$2,$3,$4,'active','disabled',now(),now())
         on conflict (tenant_id,id) do nothing`,
        [userId, sourceTestTenantId, `r06-uat:${userId}`, `${userId}@uat.nexora.invalid`],
      );
    }

    for (const role of roles) {
      await client.query(
        `insert into security_tenant_role
          (tenant_id,role_id,role_code,display_name,description,lifecycle_state,source_kind,source_reference)
         values ($1,$2,$3,$4,'Controlled disposable integration fixture','active','legacy_backfill',$5)
         on conflict (tenant_id,role_id) do nothing`,
        [sourceTestTenantId, role.roleId, role.code, role.name, `test-fixture:${role.policyId}`],
      );
      await client.query(
        `insert into security_role_policy
          (id,tenant_id,role,scope,permissions,field_rules,sod_rules,version,status,created_at,role_id,lifecycle_state)
         values ($1,$2,$3,$4::jsonb,$5::jsonb,$6::jsonb,$7::jsonb,1,'active',now(),$8,'active')
         on conflict (tenant_id,id) do nothing`,
        [
          role.policyId,
          sourceTestTenantId,
          role.code,
          JSON.stringify({ mode: "tenant" }),
          JSON.stringify(role.permissions),
          JSON.stringify({ allow: null, deny: [] }),
          JSON.stringify({ conflicting_roles: [], distinct_actor_fields: [] }),
          role.roleId,
        ],
      );
      await client.query(
        `update security_role_policy set permissions=$3::jsonb
          where tenant_id=$1 and id=$2 and lifecycle_state='active'`,
        [sourceTestTenantId, role.policyId, JSON.stringify(role.permissions)],
      );
      for (const permission of role.permissions) {
        await client.query(
          `insert into security_role_permission_grant
            (tenant_id,role_policy_id,permission_key,field_allow_mode)
           values ($1,$2,$3,'all') on conflict do nothing`,
          [sourceTestTenantId, role.policyId, permission],
        );
        await client.query(
          `insert into security_role_scope_grant
            (tenant_id,role_policy_id,permission_key,scope_kind,scope_value)
           values ($1,$2,$3,'tenant',$1) on conflict do nothing`,
          [sourceTestTenantId, role.policyId, permission],
        );
      }
    }

    for (const [policyId, permission, state] of sourceStates) {
      await client.query(
        `insert into security_role_source_state
          (tenant_id,role_policy_id,permission_key,source_state)
         values ($1,$2,$3,$4) on conflict do nothing`,
        [sourceTestTenantId, policyId, permission, state],
      );
    }

    for (const permission of ["security.authorization.permission.read", "security.authorization.audit.read"]) {
      for (const policyId of ["r06-uat-policy-maker", "r06-uat-policy-checker"] as const) {
        await client.query(
          `insert into security_role_permission_delegation
            (tenant_id,role_policy_id,permission_key,scope_kind,scope_value)
           values ($1,$2,$3,'tenant',$1) on conflict do nothing`,
          [sourceTestTenantId, policyId, permission],
        );
      }
    }
    await client.query(
      `delete from security_role_permission_delegation
        where tenant_id=$1 and role_policy_id='r06-uat-policy-maker'
          and permission_key='security.authorization.administer'`,
      [sourceTestTenantId],
    );

    await client.query(
      `insert into security_role_assignment_sod_rule (tenant_id,role_policy_id,conflicting_role_id)
       values
         ($1,'r06-uat-policy-maker','r06-uat-role-checker'),
         ($1,'r06-uat-policy-checker','r06-uat-role-maker')
       on conflict do nothing`,
      [sourceTestTenantId],
    );

    for (const [assignmentId, userId, policyId] of assignments) {
      await client.query(
        `insert into security_user_role_assignment
          (tenant_id,user_id,role_policy_id,assigned_by,assigned_at,assignment_id,lifecycle_state,valid_from)
         values ($1,$2,$3,'r06.last-admin-a',now(),$4,'active',now())
         on conflict (tenant_id,user_id,role_policy_id) do nothing`,
        [sourceTestTenantId, userId, policyId, assignmentId],
      );
      await client.query(
        `insert into security_user_role_assignment_version
          (tenant_id,assignment_id,version,supersedes_version,user_id,role_policy_id,lifecycle_state,
           valid_from,valid_until,assigned_by,administration_command_id,source_kind,source_reference)
         select $1,$2,1,null,$3,$4,'active',assignment.valid_from,null,'r06.last-admin-a',null,
                'legacy_backfill',$5
         from security_user_role_assignment assignment
         where assignment.tenant_id=$1 and assignment.assignment_id=$2
         on conflict (tenant_id,assignment_id,version) do nothing`,
        [sourceTestTenantId, assignmentId, userId, policyId, `test-fixture:${assignmentId}`],
      );
    }
    await client.query(
      `insert into security_emergency_impersonation_principal
        (tenant_id,user_id,designated_by,source_reference)
       values ($1,'r06.last-admin-b','r06.last-admin-b','controlled-test-fixture')
       on conflict (tenant_id) do update set
         user_id=excluded.user_id,designated_by=excluded.designated_by,
         source_reference=excluded.source_reference,revoked_at=null`,
      [sourceTestTenantId],
    );
    for (const userId of users) {
      const companyIds = [
        "nexora-r06-uat-company",
        ...(userId === "r06.maker" || userId === "r06.checker" ? ["nexora-r06-uat-company-two"] : []),
      ];
      for (const companyId of companyIds) {
        await client.query(
          `insert into security_user_company_access
            (tenant_id,access_id,user_id,company_id,is_default,granted_by,source_kind,source_reference)
           select $1,$2,$3,$4,$5,'r06.last-admin-a',
                  'governed_administration','controlled-test-fixture'
            where not exists (
              select 1 from security_user_company_access
               where tenant_id=$1 and user_id=$3 and company_id=$4
                 and revoked_at is null
            )`,
          [
            sourceTestTenantId,
            `r06-fixture-company-access-${userId}-${companyId}`,
            userId,
            companyId,
            companyId === "nexora-r06-uat-company",
          ],
        );
      }
    }
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}
