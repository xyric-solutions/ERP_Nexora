import { createDatabasePool } from "../packages/db/src/index.js";
import { sourceTestCompanyId, sourceTestTenantId } from "../tests/integration/source-security-fixture.js";

// Controlled synthetic UAT setup only. Never establishes a production code policy.
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl || process.env.NEXORA_ENVIRONMENT !== "uat" || process.env.NEXORA_UAT_CONFIRM !== sourceTestTenantId)
  throw new Error("Explicit isolated Bank Nominal UAT database and tenant confirmation are required.");
const target = new URL(databaseUrl);
if (
  !["127.0.0.1", "localhost", "::1", "[::1]"].includes(target.hostname) ||
  !/(uat|test|codex|isolated)/i.test(decodeURIComponent(target.pathname))
)
  throw new Error("Bank Nominal UAT provisioning requires an explicitly named local isolated database.");

const pool = createDatabasePool(databaseUrl),
  client = await pool.connect();
try {
  await client.query("begin isolation level serializable");
  await client.query("select set_config('nexora.tenant_id',$1,true)", [sourceTestTenantId]);
  await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
    `bank-nominals-uat:${sourceTestTenantId}`,
  ]);
  const tenant = await client.query("select id from tenant where id=$1 and status='active' and region='uat-isolated'", [
    sourceTestTenantId,
  ]);
  if (!tenant.rowCount) throw new Error("Provision the controlled isolated authentication fixture first.");
  const company = await client.query(
    "select id from organization_unit where tenant_id=$1 and id=$2 and type='company' and status='active'",
    [sourceTestTenantId, sourceTestCompanyId],
  );
  if (!company.rowCount) throw new Error("Controlled UAT company is unavailable.");
  const currency = await client.query("select code from currency where tenant_id=$1 and status='active' and is_base", [
    sourceTestTenantId,
  ]);
  if (currency.rowCount !== 1) throw new Error("An existing active base Currency Master record is required.");
  const policy = await client.query(
    "select section_id from finance_nominal_section_policy where tenant_id=$1 and company_id=$2 and section_role='cash_and_bank'",
    [sourceTestTenantId, sourceTestCompanyId],
  );
  if (!policy.rowCount) {
    await client.query(
      `insert into account (tenant_id,company_id,id,code,name,type,parent_id,is_header,status,manual_posting_allowed,created_at)
      values ($1,$2,'r06-uat-bn-category','UAT-BN-CA','Current Assets','asset',null,true,'active',false,now()),
             ($1,$2,'r06-uat-bn-section','UAT-BN-CB','Cash & Bank','asset','r06-uat-bn-category',true,'active',false,now())`,
      [sourceTestTenantId, sourceTestCompanyId],
    );
    await client.query(
      `insert into finance_nominal_section_policy
      (tenant_id,company_id,category_id,section_id,section_role,prefix,code_width,first_value,last_value,next_value)
      values ($1,$2,'r06-uat-bn-category','r06-uat-bn-section','cash_and_bank','UAT-BN-',6,1,999999,1)`,
      [sourceTestTenantId, sourceTestCompanyId],
    );
  }
  const all = ["read", "create", "update", "submit", "approve", "status"];
  if (process.env.NEXORA_GENERAL_NOMINAL_UAT_CALENDAR_YEAR) {
    const year = Number(process.env.NEXORA_GENERAL_NOMINAL_UAT_CALENDAR_YEAR);
    if (!Number.isInteger(year) || year < 2000 || year > 2100)
      throw new Error("An explicit bounded synthetic UAT calendar year is required.");
    const existing = await client.query(
      "select id from fiscal_calendar where tenant_id=$1 and company_id=$2 and year=$3",
      [sourceTestTenantId, sourceTestCompanyId, year],
    );
    if (!existing.rowCount)
      await client.query(
        `insert into fiscal_calendar(tenant_id,company_id,id,year,period_start,period_end,status)
      values($1,$2,$3,$4,make_date($4,1,1),make_date($4,12,31),'active')`,
        [sourceTestTenantId, sourceTestCompanyId, `synthetic-general-uat-calendar-${year}`, year],
      );
    // Deliberately creates no financial_period: live posting remains blocked.
  }
  // Explicitly requested synthetic setup only; never imports the prototype catalog.
  if (process.env.NEXORA_GENERAL_NOMINAL_UAT_SETUP === "true") {
    for (const type of ["asset", "liability", "equity", "revenue", "expense"]) {
      const categoryId = `r06-uat-general-${type}-category`;
      const sectionId = `r06-uat-general-${type}-section`;
      const existing = await client.query(
        "select section_id from finance_general_nominal_policy where tenant_id=$1 and company_id=$2 and section_id=$3",
        [sourceTestTenantId, sourceTestCompanyId, sectionId],
      );
      if (existing.rowCount) continue;
      await client.query(
        `insert into account (tenant_id,company_id,id,code,name,type,parent_id,is_header,status,manual_posting_allowed,created_at)
        values($1,$2,$3,$5,$7,$9,null,true,'active',false,now()),($1,$2,$4,$6,$8,$9,$3,true,'active',false,now())`,
        [
          sourceTestTenantId,
          sourceTestCompanyId,
          categoryId,
          sectionId,
          `UAT-G-${type}-C`,
          `UAT-G-${type}-S`,
          `Synthetic UAT ${type}`,
          `Synthetic UAT ${type} nominals`,
          type,
        ],
      );
      await client.query(
        `insert into finance_general_nominal_policy(tenant_id,company_id,category_id,section_id,prefix,code_width,next_value,last_value)
        values($1,$2,$3,$4,$5,6,1,999999)`,
        [sourceTestTenantId, sourceTestCompanyId, categoryId, sectionId, `UAT-${type.toUpperCase()}-`],
      );
    }
  }
  const policies = await client.query<{ id: string; role: string }>(
    `select policy.id,policy.role from security_role_policy policy
    join security_tenant_role role on role.tenant_id=policy.tenant_id and role.role_id=policy.role_id
    where policy.tenant_id=$1 and policy.status='active' and policy.lifecycle_state='active' and role.lifecycle_state='active'
      and (policy.id in ('r06-uat-policy-maker','r06-uat-policy-checker') or role.role_code='super_administrator')`,
    [sourceTestTenantId],
  );
  for (const required of ["r06-uat-policy-maker", "r06-uat-policy-checker"])
    if (!policies.rows.some((row) => row.id === required))
      throw new Error("Controlled maker and checker policies are required.");
  for (const policy of policies.rows) {
    const actions =
      policy.id === "r06-uat-policy-maker"
        ? ["read", "create", "update", "submit"]
        : policy.id === "r06-uat-policy-checker"
          ? ["read", "approve", "status"]
          : all;
    const transactionActions =
      policy.id === "r06-uat-policy-maker"
        ? ["read", "create", "update", "submit"]
        : policy.id === "r06-uat-policy-checker"
          ? ["read", "approve"]
          : ["read", "create", "update", "submit", "approve", "post", "reverse"];
    const permissions = [
      ...actions.flatMap((action) => [`finance.nominal.${action}`, `banking.bank_account.${action}`]),
      ...["payment", "receipt"].flatMap((kind) => transactionActions.map((action) => `banking.${kind}.${action}`)),
    ];
    await client.query(
      `insert into security_role_permission_grant (tenant_id,role_policy_id,permission_key,field_allow_mode)
      select $1,$2,permission,'all' from unnest($3::text[]) permission on conflict do nothing`,
      [sourceTestTenantId, policy.id, permissions],
    );
    await client.query(
      `insert into security_role_scope_grant (tenant_id,role_policy_id,permission_key,scope_kind,scope_value)
      select $1,$2,permission,'company',$3 from unnest($4::text[]) permission on conflict do nothing`,
      [sourceTestTenantId, policy.id, sourceTestCompanyId, permissions],
    );
    await client.query(
      `update security_role_policy set permissions=(select jsonb_agg(distinct permission order by permission)
      from jsonb_array_elements_text(permissions || to_jsonb($3::text[])) permission)
      where tenant_id=$1 and id=$2 and not permissions @> to_jsonb($3::text[])`,
      [sourceTestTenantId, policy.id, permissions],
    );
  }
  if (process.env.NEXORA_CENTRAL_TEMPLATE_UAT_SETUP === "true") {
    const administrators = await client.query<{id:string}>(`select policy.id from security_role_policy policy
      join security_tenant_role role on role.tenant_id=policy.tenant_id and role.role_id=policy.role_id
      where policy.tenant_id=$1 and policy.status='active' and policy.lifecycle_state='active'
      and role.lifecycle_state='active' and role.role_code='super_administrator'`,[sourceTestTenantId]);
    if (!administrators.rowCount) throw new Error("An existing controlled super-administrator policy is required.");
    const templatePermissions = ["finance.chart_template.read","finance.chart_template.admin"];
    const companyTemplatePermissions=["finance.chart_template.adopt","finance.chart_template.classify"];
    for (const administrator of administrators.rows) {
      await client.query(`insert into security_role_permission_grant(tenant_id,role_policy_id,permission_key,field_allow_mode)
       select $1,$2,p,'all' from unnest($3::text[]) p on conflict do nothing`,[sourceTestTenantId,administrator.id,templatePermissions]);
      await client.query(`insert into security_role_scope_grant(tenant_id,role_policy_id,permission_key,scope_kind,scope_value)
       select $1,$2,p,'tenant',$1 from unnest($3::text[]) p on conflict do nothing`,[sourceTestTenantId,administrator.id,templatePermissions]);
      await client.query(`insert into security_role_permission_grant(tenant_id,role_policy_id,permission_key,field_allow_mode)
       select $1,$2,p,'all' from unnest($3::text[]) p on conflict do nothing`,[sourceTestTenantId,administrator.id,companyTemplatePermissions]);
      await client.query(`insert into security_role_scope_grant(tenant_id,role_policy_id,permission_key,scope_kind,scope_value)
       select $1,$2,p,'company',$4 from unnest($3::text[]) p on conflict do nothing`,[sourceTestTenantId,administrator.id,companyTemplatePermissions,sourceTestCompanyId]);
      await client.query(`update security_role_policy set permissions=(select jsonb_agg(distinct permission order by permission)
       from jsonb_array_elements_text(permissions || to_jsonb($3::text[])) permission)
       where tenant_id=$1 and id=$2 and not permissions @> to_jsonb($3::text[])`,[sourceTestTenantId,administrator.id,[...templatePermissions,...companyTemplatePermissions]]);
    }
  }
  await client.query("commit");
  console.log(
    "Bank Nominal UAT hierarchy and company-scoped maker/checker permissions are available. No account, balance or journal was created.",
  );
} catch (error) {
  await client.query("rollback");
  throw error;
} finally {
  client.release();
  await pool.end();
}
