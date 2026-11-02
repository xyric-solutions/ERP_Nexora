/** Controlled isolated-UAT identity bootstrap; business records use the API seed. */
import { randomBytes, pbkdf2Sync } from "node:crypto";
import { hashPassword, verifyPassword } from "../packages/auth/src/index.js";
import { createDatabasePool } from "../packages/db/src/pool.js";
import { backfillLoginDirectory } from "../packages/db/src/login-directory-backfill.js";
const tenant = "nexora-r06-uat",
  company = "nexora-r06-uat-company";
const user = "uat-hr-demo-reviewer",
  username = "demo.hr.reviewer";
const database = new URL(process.env.DATABASE_URL ?? "");
if (
  !["localhost", "127.0.0.1"].includes(database.hostname) ||
  database.port !== "55433" ||
  database.pathname !== "/nexora_source_test" ||
  process.env.NEXORA_UAT_CONFIRM !== tenant
)
  throw new Error("Reviewer bootstrap is restricted to the isolated local UAT database.");
const password = process.env.NEXORA_UAT_REVIEWER_PASSWORD;
const secret = process.env.AUTH_LOGIN_DIRECTORY_SECRET;
if (!password || !secret) throw new Error("Reviewer password and login-directory secret are required.");
const pool = createDatabasePool(database.toString());
const client = await pool.connect();
try {
  await client.query("begin");
  await client.query("select set_config('nexora.tenant_id',$1,true)", [tenant]);
  const existing = (
    await client.query<{ argon2_hash: string }>(
      "select argon2_hash from security_password_credential where tenant_id=$1 and user_id=$2",
      [tenant, user],
    )
  ).rows[0];
  if (existing && !(await verifyPassword(existing.argon2_hash, password)))
    throw new Error("The existing demo reviewer uses a different password; its credential was preserved.");
  await client.query(
    "insert into security_user_account(id,tenant_id,identity_subject,email,display_name,status,mfa_state,created_at,updated_at) values($1,$2,$3,'reviewer@nexora-demo.example.test','Nadia Qureshi · Demo HR Reviewer','active','disabled',now(),now()) on conflict(tenant_id,id) do nothing",
    [user, tenant, `local:${user}`],
  );
  if (!existing) {
    const salt = randomBytes(16);
    await client.query(
      "insert into security_password_credential(tenant_id,user_id,username,algorithm,iterations,salt,password_hash,argon2_hash,argon2_updated_at,updated_at) values($1,$2,$3,'pbkdf2_sha256',310000,$4,$5,$6,now(),now())",
      [tenant, user, username, salt, pbkdf2Sync(password, salt, 310000, 32, "sha256"), await hashPassword(password)],
    );
  }
  const policy = "r06-uat-policy-checker",
    assignment = "uat-hr-demo-reviewer-assignment";
  const permissions = [
    "hr.employee.read",
    "hr.employee_draft.read",
    "hr.employee.approve",
    "hr.employee_assignment.read",
    "hr.employment_lifecycle_policy.read",
    "hr.employment_lifecycle_policy.approve",
    "hr.employment_lifecycle.approve",
    "hr.employment_relationship.read",
    "hr.learning.read",
    "hr.learning.manage",
    "hr.learning.hr_decide",
    "hr.learning.certify",
    "hr.performance.read",
    "hr.performance.review",
    "hr.performance.publish",
  ];
  for (const permission of permissions) {
    // The controlled role already exists; never invent unknown permission keys.
    const exists = await client.query(
      "select 1 from security_permission_definition where permission_key=$1 and status='active'",
      [permission],
    );
    if (!exists.rowCount) continue;
    await client.query(
      "insert into security_role_permission_grant(tenant_id,role_policy_id,permission_key,field_allow_mode) values($1,$2,$3,'all') on conflict do nothing",
      [tenant, policy, permission],
    );
    await client.query(
      "insert into security_role_scope_grant(tenant_id,role_policy_id,permission_key,scope_kind,scope_value) values($1,$2,$3,'company',$4) on conflict do nothing",
      [tenant, policy, permission, company],
    );
  }
  await client.query(
    "update security_role_policy p set permissions=(select jsonb_agg(g.permission_key order by g.permission_key) from security_role_permission_grant g where g.tenant_id=p.tenant_id and g.role_policy_id=p.id),row_version=row_version+1 where tenant_id=$1 and id=$2",
    [tenant, policy],
  );
  await client.query(
    "insert into security_user_role_assignment(tenant_id,user_id,role_policy_id,assigned_by,assigned_at,assignment_id,lifecycle_state,valid_from) values($1,$2,$3,'r06.last-admin-a',now(),$4,'active',now()) on conflict(tenant_id,user_id,role_policy_id) do nothing",
    [tenant, user, policy, assignment],
  );
  await client.query(
    "insert into security_user_role_assignment_version(tenant_id,assignment_id,version,user_id,role_policy_id,lifecycle_state,valid_from,assigned_by,source_kind,source_reference) select $1,$2,1,$3,$4,'active',a.valid_from,'r06.last-admin-a','legacy_backfill','isolated-hr-demo-reviewer' from security_user_role_assignment a where a.tenant_id=$1 and a.assignment_id=$2 on conflict(tenant_id,assignment_id,version) do nothing",
    [tenant, assignment, user, policy],
  );
  await client.query(
    "insert into security_user_company_access(tenant_id,access_id,user_id,company_id,is_default,granted_by,source_kind,source_reference) values($1,'access-uat-hr-demo-reviewer',$2,$3,true,'r06.last-admin-a','governed_administration','isolated-hr-demo-reviewer') on conflict do nothing",
    [tenant, user, company],
  );
  await client.query("commit");
  await backfillLoginDirectory(pool, secret);
  console.log(JSON.stringify({ tenant, username, reviewerReady: true, isolatedOnly: true }));
} catch (error) {
  await client.query("rollback");
  throw error;
} finally {
  client.release();
  await pool.end();
}
