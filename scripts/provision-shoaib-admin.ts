import { createHash } from "node:crypto";

import { hashPassword, loginIdentifierHmac, validatePassword, verifyPassword } from "../packages/auth/src/index.js";
import { createDatabasePool } from "../packages/db/src/pool.js";

const tenantId = "nexora-r06-uat";
const userId = "user-shoaib-super-admin";
const username = "shoaib";
const email = "shoaib@nexora.ai";
const requestedRoleId = "role-super-administrator";
const roleCode = "super_administrator";
const policyId = "policy-super-administrator";
const assignmentId = "assignment-shoaib-super-administrator";
const sourceReference = "uat-provision-shoaib-admin";
const approvalOverridePermission = "platform.approval.override";

const databaseUrl = process.env.DATABASE_URL;
const password = process.env.NEXORA_SHOAIB_PASSWORD;
const loginDirectorySecret = process.env.AUTH_LOGIN_DIRECTORY_SECRET;

if (process.env.NEXORA_ENVIRONMENT !== "uat" || process.env.NEXORA_UAT_CONFIRM !== tenantId) {
  throw new Error(`Set NEXORA_ENVIRONMENT=uat and NEXORA_UAT_CONFIRM=${tenantId}`);
}
if (!databaseUrl) throw new Error("DATABASE_URL is required");
if (!password) throw new Error("NEXORA_SHOAIB_PASSWORD is required");
if (!loginDirectorySecret) throw new Error("AUTH_LOGIN_DIRECTORY_SECRET is required");

validatePassword(password, username);
validatePassword(password, email);

function companyAccessId(companyId: string): string {
  return `access-shoaib-${createHash("sha256").update(companyId).digest("hex").slice(0, 24)}`;
}

const pool = createDatabasePool(databaseUrl);
const client = await pool.connect();

try {
  await client.query("begin isolation level serializable");
  await client.query("select pg_advisory_xact_lock(hashtextextended($1, 0))", [
    `nexora:uat:provision-shoaib:${tenantId}`,
  ]);

  const tenant = await client.query("select 1 from tenant where id=$1 and status='active'", [tenantId]);
  if (tenant.rowCount !== 1) throw new Error(`Active tenant ${tenantId} was not found`);

  const permissions = await client.query<{ permission_key: string }>(
    "select permission_key from security_permission_definition where status='active' order by permission_key",
  );
  if (permissions.rowCount === 0) throw new Error("No active permissions are available");
  if (!permissions.rows.some((row) => row.permission_key === "security.authorization.administer")) {
    throw new Error("The tenant-wide administrator permission is unavailable");
  }
  if (!permissions.rows.some((row) => row.permission_key === approvalOverridePermission)) {
    throw new Error("The governed approval override permission is unavailable");
  }
  const permissionKeys = permissions.rows.map((row) => row.permission_key);

  const companies = await client.query<{ id: string }>(
    `select id from organization_unit
      where tenant_id=$1 and type='company' and status='active'
      order by id`,
    [tenantId],
  );
  if (companies.rowCount === 0) throw new Error("At least one active company is required");

  const conflict = await client.query<{ id: string }>(
    `select distinct account.id
       from security_user_account account
       left join security_password_credential credential
         on credential.tenant_id=account.tenant_id and credential.user_id=account.id
      where account.tenant_id=$1
        and account.id<>$2
        and (lower(account.email)=lower($3) or credential.username=$4)`,
    [tenantId, userId, email, username],
  );
  if (conflict.rowCount) throw new Error("The Shoaib email or username is already assigned to another account");

  await client.query(
    `insert into security_user_account
      (id,tenant_id,identity_subject,email,status,mfa_state,created_at,updated_at,display_name)
     values ($1,$2,$3,$4,'active','disabled',now(),now(),'Shoaib')
     on conflict (tenant_id,id) do update
       set email=excluded.email,status='active',mfa_state='disabled',display_name='Shoaib',
           archived_by=null,archived_at=null,archive_reason=null,
           row_version=security_user_account.row_version+1,updated_at=now()`,
    [userId, tenantId, `local:${userId}`, email],
  );

  const existingCredential = await client.query<{ argon2_hash: string | null }>(
    `select argon2_hash from security_password_credential
      where tenant_id=$1 and user_id=$2 for update`,
    [tenantId, userId],
  );
  const passwordMatches = existingCredential.rows[0]?.argon2_hash
    ? await verifyPassword(existingCredential.rows[0].argon2_hash, password)
    : false;
  if (!passwordMatches) {
    const verifier = await hashPassword(password);
    await client.query(
      `insert into security_password_credential
        (tenant_id,user_id,username,algorithm,iterations,salt,password_hash,updated_at,
         argon2_hash,argon2_updated_at,must_change_password,password_changed_at,credential_status)
       values ($1,$2,$3,null,null,null,null,now(),$4,now(),false,now(),'active')
       on conflict (tenant_id,user_id) do update
         set username=excluded.username,algorithm=null,iterations=null,salt=null,password_hash=null,
             argon2_hash=excluded.argon2_hash,argon2_updated_at=now(),must_change_password=false,
             credential_status='active',password_version=security_password_credential.password_version+1,
             password_changed_at=now(),updated_at=now()`,
      [tenantId, userId, username, verifier],
    );
    if (existingCredential.rowCount) {
      await client.query(
        `update security_user_account
            set session_version=session_version+1,row_version=row_version+1,updated_at=now()
          where tenant_id=$1 and id=$2`,
        [tenantId, userId],
      );
    }
  } else {
    await client.query(
      `update security_password_credential
          set username=$3,must_change_password=false,credential_status='active',updated_at=now()
        where tenant_id=$1 and user_id=$2`,
      [tenantId, userId, username],
    );
  }

  for (const [kind, value] of [
    ["email", email],
    ["username", username],
  ] as const) {
    const identifierHmac = loginIdentifierHmac(loginDirectorySecret, kind, value);
    const identifierConflict = await client.query<{ user_id: string }>(
      `select user_id from security_login_identifier
        where tenant_id=$1 and identifier_kind=$2 and identifier_hmac=$3
          and lifecycle_state='active' and user_id<>$4`,
      [tenantId, kind, identifierHmac, userId],
    );
    if (identifierConflict.rowCount) throw new Error(`The ${kind} login identifier belongs to another account`);
    await client.query(
      `insert into security_login_identifier
        (tenant_id,user_id,identifier_kind,identifier_hmac,lifecycle_state,source_reference)
       values ($1,$2,$3,$4,'active',$5)
       on conflict (tenant_id,user_id,identifier_kind) do update
         set identifier_hmac=excluded.identifier_hmac,lifecycle_state='active',
             source_reference=excluded.source_reference,updated_at=now()`,
      [tenantId, userId, kind, identifierHmac, sourceReference],
    );
  }

  const governedRole = await client.query<{ role_id: string }>(
    `insert into security_tenant_role
      (tenant_id,role_id,role_code,display_name,description,lifecycle_state,source_kind,source_reference)
     values ($1,$2,$3,'Super Administrator','Tenant-wide access to every active module permission.',
             'active','legacy_backfill',$4)
     on conflict (tenant_id,role_code) do update
       set display_name=excluded.display_name,
           description=excluded.description,lifecycle_state='active',
           archived_by=null,archived_at=null,source_kind='legacy_backfill',
           source_reference=excluded.source_reference,row_version=security_tenant_role.row_version+1
     returning role_id`,
    [tenantId, requestedRoleId, roleCode, sourceReference],
  );
  const governedRoleId = governedRole.rows[0]?.role_id;
  if (!governedRoleId) throw new Error("The governed super-administrator role is unavailable");

  await client.query(
    `insert into security_role_policy
      (id,tenant_id,role,scope,permissions,field_rules,sod_rules,version,status,created_at,
       role_id,lifecycle_state)
     values ($1,$2,$3,$4::jsonb,$5::jsonb,$6::jsonb,$7::jsonb,1,'active',now(),$8,'active')
     on conflict (tenant_id,id) do update
       set role=excluded.role,scope=excluded.scope,permissions=excluded.permissions,
           field_rules=excluded.field_rules,sod_rules=excluded.sod_rules,status='active',
           lifecycle_state='active',archived_by=null,archived_at=null,
           row_version=security_role_policy.row_version+1`,
    [
      policyId,
      tenantId,
      roleCode,
      JSON.stringify({ mode: "tenant" }),
      JSON.stringify(permissionKeys),
      JSON.stringify({ allow: null, deny: [] }),
      JSON.stringify({ conflicting_roles: [], distinct_actor_fields: [] }),
      governedRoleId,
    ],
  );

  for (const table of [
    "security_role_permission_delegation",
    "security_role_assignment_sod_rule",
    "security_role_transaction_sod_rule",
    "security_role_source_state",
    "security_role_field_grant",
    "security_role_scope_grant",
    "security_role_permission_grant",
  ]) {
    await client.query(`delete from ${table} where tenant_id=$1 and role_policy_id=$2`, [tenantId, policyId]);
  }
  await client.query(
    `insert into security_role_permission_grant
      (tenant_id,role_policy_id,permission_key,field_allow_mode)
     select $1,$2,permission_key,'all'
       from security_permission_definition where status='active'`,
    [tenantId, policyId],
  );
  await client.query(
    `insert into security_role_scope_grant
      (tenant_id,role_policy_id,permission_key,scope_kind,scope_value)
     select $1,$2,permission_key,'tenant',$1
       from security_permission_definition where status='active'`,
    [tenantId, policyId],
  );
  await client.query(
    `insert into security_role_source_state
      (tenant_id,role_policy_id,permission_key,source_state)
     select distinct $1,$2,source.permission_key,source.source_state
       from security_role_source_state source
       join security_permission_definition definition
         on definition.permission_key=source.permission_key and definition.status='active'
      where source.tenant_id=$1 and source.role_policy_id<>$2`,
    [tenantId, policyId],
  );

  const existingDefaultAccess = await client.query(
    `select 1 from security_user_company_access
      where tenant_id=$1 and user_id=$2 and revoked_at is null and is_default
      limit 1`,
    [tenantId, userId],
  );
  let hasDefaultAccess = existingDefaultAccess.rowCount === 1;
  for (const company of companies.rows) {
    const existingAccess = await client.query<{ access_id: string }>(
      `select access_id from security_user_company_access
        where tenant_id=$1 and user_id=$2 and company_id=$3 and revoked_at is null`,
      [tenantId, userId, company.id],
    );
    if (!existingAccess.rows[0]) {
      await client.query(
        `insert into security_user_company_access
          (tenant_id,access_id,user_id,company_id,is_default,granted_by,source_kind,source_reference)
         values ($1,$2,$3,$4,$5,$3,'compatibility_backfill',$6)`,
        [tenantId, companyAccessId(company.id), userId, company.id, !hasDefaultAccess, sourceReference],
      );
      hasDefaultAccess = true;
    }
  }

  const existingAssignment = await client.query<{
    assignment_id: string;
    lifecycle_state: string;
    role_policy_id: string;
  }>(
    `select assignment_id,lifecycle_state,role_policy_id
       from security_user_role_assignment
      where tenant_id=$1 and user_id=$2 and role_policy_id=$3 for update`,
    [tenantId, userId, policyId],
  );
  const assignmentChanged =
    !existingAssignment.rows[0] ||
    existingAssignment.rows[0].lifecycle_state !== "active" ||
    existingAssignment.rows[0].assignment_id !== assignmentId;
  await client.query(
    `insert into security_user_role_assignment
      (tenant_id,user_id,role_policy_id,assigned_by,assigned_at,assignment_id,lifecycle_state,valid_from)
     values ($1,$2,$3,$2,now(),$4,'active',now())
     on conflict (tenant_id,user_id,role_policy_id) do update
       set lifecycle_state='active',revoked_by=null,revoked_at=null,revocation_reason=null,
           row_version=security_user_role_assignment.row_version+1`,
    [tenantId, userId, policyId, assignmentId],
  );
  if (assignmentChanged) {
    const nextVersion = await client.query<{ version: number }>(
      `select coalesce(max(version),0)::int+1 as version
         from security_user_role_assignment_version
        where tenant_id=$1 and assignment_id=$2`,
      [tenantId, assignmentId],
    );
    const version = nextVersion.rows[0]?.version ?? 1;
    await client.query(
      `insert into security_user_role_assignment_version
        (tenant_id,assignment_id,version,supersedes_version,user_id,role_policy_id,
         lifecycle_state,valid_from,assigned_by,source_kind,source_reference)
       select tenant_id,assignment_id,$3,$4,user_id,role_policy_id,lifecycle_state,
              valid_from,assigned_by,'legacy_backfill',$5
         from security_user_role_assignment
        where tenant_id=$1 and assignment_id=$2`,
      [tenantId, assignmentId, version, version === 1 ? null : version - 1, sourceReference],
    );
  }

  const verification = await client.query<{
    permission_count: number;
    company_count: number;
    identifier_count: number;
    assignment_count: number;
    approval_override_grant_count: number;
  }>(
    `select
       (select count(*)::int from security_role_permission_grant
         where tenant_id=$1 and role_policy_id=$2) as permission_count,
       (select count(*)::int from security_user_company_access
         where tenant_id=$1 and user_id=$3 and revoked_at is null) as company_count,
       (select count(*)::int from security_login_identifier
         where tenant_id=$1 and user_id=$3 and lifecycle_state='active') as identifier_count,
       (select count(*)::int from security_user_role_assignment_version version
         where version.tenant_id=$1 and version.user_id=$3 and version.role_policy_id=$2
           and version.version=(select max(latest.version)
             from security_user_role_assignment_version latest
            where latest.tenant_id=version.tenant_id and latest.assignment_id=version.assignment_id)
           and version.lifecycle_state='active') as assignment_count,
       (select count(*)::int from security_role_permission_grant
         where tenant_id=$1 and role_policy_id=$2 and permission_key=$4)
         as approval_override_grant_count`,
    [tenantId, policyId, userId, approvalOverridePermission],
  );
  const verified = verification.rows[0];
  if (
    !verified ||
    Number(verified.permission_count) !== permissionKeys.length ||
    Number(verified.company_count) !== companies.rowCount ||
    Number(verified.identifier_count) !== 2 ||
    Number(verified.assignment_count) !== 1 ||
    Number(verified.approval_override_grant_count) !== 1
  ) {
    throw new Error("Shoaib administrator verification failed");
  }

  await client.query("commit");
  process.stdout.write(
    `${JSON.stringify({
      tenantId,
      userId,
      email,
      username,
      roleCode,
      permissionCount: permissionKeys.length,
      companyCount: companies.rowCount,
      passwordStored: false,
    })}\n`,
  );
} catch (error) {
  await client.query("rollback").catch(() => undefined);
  throw error;
} finally {
  client.release();
  await pool.end();
}
