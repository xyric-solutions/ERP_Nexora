import { randomUUID } from "node:crypto";
import { hashPassword, loginIdentifierHmac, validatePassword } from "@nexora/auth";
import { monthlyFiscalPeriods, registerOrganisationRequestSchema } from "@nexora/contracts";
import {
  enqueueCredentialEmail,
  loginDirectorySecretVerifier,
  readCredentialEmailConfig,
  type DatabasePool,
} from "@nexora/db";
import type { PoolClient } from "pg";
import { appendSecurityAuditEvent, securityStateHash } from "../auth/security-audit.js";
import { generateOneTimePassword } from "../security/source-user-administration.js";

const operation = "security.tenant.bootstrap";
const source = "operator-tenant-bootstrap";
const role = "super_administrator";

export class TenantBootstrapError extends Error {}

export function readTenantBootstrapConfig(environment: NodeJS.ProcessEnv = process.env) {
  if (environment.NEXORA_BOOTSTRAP_ENABLED !== "true") {
    throw new TenantBootstrapError("Set NEXORA_BOOTSTRAP_ENABLED=true before running the operator bootstrap");
  }
  const tenantId = environment.NEXORA_BOOTSTRAP_TENANT_ID?.trim() ?? "";
  if (!/^[a-z][a-z0-9-]{2,63}$/.test(tenantId)) {
    throw new TenantBootstrapError("NEXORA_BOOTSTRAP_TENANT_ID must be a lowercase tenant slug");
  }
  const username = environment.NEXORA_BOOTSTRAP_ADMIN_USERNAME?.trim().toLowerCase() || `admin-${tenantId}`;
  if (!/^[a-z0-9][a-z0-9._-]{2,127}$/.test(username)) {
    throw new TenantBootstrapError("NEXORA_BOOTSTRAP_ADMIN_USERNAME is invalid");
  }
  const emailDelivery = readCredentialEmailConfig(environment);
  const manualPassword = environment.NEXORA_BOOTSTRAP_ADMIN_PASSWORD || undefined;
  if (!manualPassword && !emailDelivery) {
    throw new TenantBootstrapError("Configure credential email or set NEXORA_BOOTSTRAP_ADMIN_PASSWORD");
  }
  const password = manualPassword ?? generateOneTimePassword();
  const registration = registerOrganisationRequestSchema.safeParse({
    organisation_type: environment.NEXORA_BOOTSTRAP_ORGANISATION_TYPE || "other",
    organisation_name: environment.NEXORA_BOOTSTRAP_ORGANISATION_NAME,
    country_code: environment.NEXORA_BOOTSTRAP_COUNTRY_CODE,
    financial_year_start_month: Number(environment.NEXORA_BOOTSTRAP_FINANCIAL_YEAR_START_MONTH),
    admin_full_name: environment.NEXORA_BOOTSTRAP_ADMIN_FULL_NAME,
    admin_email: environment.NEXORA_BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase(),
    admin_password: password,
    admin_password_confirmation: password,
  });
  if (!registration.success) {
    throw new TenantBootstrapError(
      `Check bootstrap fields: ${registration.error.issues.map((issue) => issue.path.join(".")).join(", ")}`,
    );
  }
  try {
    validatePassword(password, username, {
      minimumLength: 16,
      requireUppercase: false,
      requireLowercase: false,
      requireNumber: false,
      requireSymbol: false,
    });
    validatePassword(password, registration.data.admin_email);
  } catch {
    throw new TenantBootstrapError(
      "Use a new temporary password of at least 16 characters that does not contain the login identifier",
    );
  }
  const databaseUrl = environment.DATABASE_MIGRATION_URL;
  const loginDirectorySecret = environment.AUTH_LOGIN_DIRECTORY_SECRET;
  if (!databaseUrl || !loginDirectorySecret || Buffer.byteLength(loginDirectorySecret) < 32) {
    throw new TenantBootstrapError("DATABASE_MIGRATION_URL and AUTH_LOGIN_DIRECTORY_SECRET are required");
  }
  return {
    databaseUrl,
    loginDirectorySecret,
    tenantId,
    username,
    registration: registration.data,
    emailDelivery: manualPassword ? null : emailDelivery,
  };
}

type BootstrapConfig = ReturnType<typeof readTenantBootstrapConfig>;

type BootstrapResult = {
  tenantId: string;
  userId: string;
  companyId: string;
  calendarId: string;
  credentialEmailQueued: boolean;
};

async function verifyLoginDirectory(client: PoolClient, secret: string) {
  const verifier = loginDirectorySecretVerifier(secret);
  await client.query("select pg_advisory_xact_lock(hashtextextended('nexora:security:login-directory-backfill',0))");
  await client.query(
    `insert into security_login_directory_state (singleton, secret_verifier, last_reconciled_at)
     values (true,$1,now()) on conflict (singleton) do nothing`,
    [verifier],
  );
  const {
    rows: [state],
  } = await client.query<{ secret_verifier: string }>(
    "select secret_verifier from security_login_directory_state where singleton",
  );
  if (state?.secret_verifier !== verifier)
    throw new TenantBootstrapError("Login-directory secret does not match the database");
}

async function grantInitialAdministrator(client: PoolClient, tenantId: string, userId: string, commandId: string) {
  const roleId = `role-${randomUUID()}`;
  const policyId = `policy-${randomUUID()}`;
  const assignmentId = `assignment-${randomUUID()}`;
  await client.query(
    `insert into security_tenant_role (tenant_id,role_id,role_code,display_name,description,lifecycle_state,created_by)
     values ($1,$2,$3,'Super Administrator','Tenant-wide administrator','active',$4)`,
    [tenantId, roleId, role, userId],
  );
  const policy = await client.query(
    `insert into security_role_policy
      (id,tenant_id,role,role_id,scope,permissions,field_rules,sod_rules,version,status,created_at,created_by)
     select $2,$1,$3,$4,'{"mode":"tenant"}'::jsonb,jsonb_agg(permission_key order by permission_key),
            '{"allow":null,"deny":[]}'::jsonb,'{"conflicting_roles":[],"distinct_actor_fields":[]}'::jsonb,
            1,'active',now(),$5
       from security_permission_definition where status='active'
     having bool_or(permission_key='security.authorization.administer')`,
    [tenantId, policyId, role, roleId, userId],
  );
  if (policy.rowCount !== 1) throw new TenantBootstrapError("Administrator permission catalog is unavailable");
  await client.query(
    `insert into security_role_permission_grant (tenant_id,role_policy_id,permission_key,field_allow_mode)
     select $1,$2,permission_key,'all' from security_permission_definition where status='active'`,
    [tenantId, policyId],
  );
  await client.query(
    `insert into security_role_scope_grant (tenant_id,role_policy_id,permission_key,scope_kind,scope_value)
     select tenant_id,role_policy_id,permission_key,'tenant',tenant_id
       from security_role_permission_grant where tenant_id=$1 and role_policy_id=$2`,
    [tenantId, policyId],
  );
  await client.query(
    `insert into security_user_role_assignment
      (tenant_id,user_id,role_policy_id,assigned_by,assigned_at,assignment_id,lifecycle_state,valid_from,approved_command_id)
     values ($1,$2,$3,$2,now(),$4,'active',now(),$5)`,
    [tenantId, userId, policyId, assignmentId, commandId],
  );
  await client.query(
    `insert into security_user_role_assignment_version
      (tenant_id,assignment_id,version,user_id,role_policy_id,lifecycle_state,valid_from,assigned_by,administration_command_id)
     values ($1,$2,1,$3,$4,'active',now(),$3,$5)`,
    [tenantId, assignmentId, userId, policyId, commandId],
  );
}

export async function bootstrapTenant(
  pool: DatabasePool,
  config: BootstrapConfig,
  now = new Date(),
): Promise<BootstrapResult & { status: "created" | "already_bootstrapped" }> {
  const { tenantId, username, registration, loginDirectorySecret } = config;
  const { admin_email: email, admin_full_name: name, organisation_name: organisation } = registration;
  const profile = {
    organisation,
    type: registration.organisation_type,
    country: registration.country_code,
    financialYearStartMonth: registration.financial_year_start_month,
    email,
    name,
    username,
  };
  const fingerprint = securityStateHash(profile);
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [`${source}:${tenantId}`]);
    await client.query("select set_config('nexora.tenant_id',$1,true)", [tenantId]);
    const {
      rows: [existing],
    } = await client.query<{ request_fingerprint: string; result_projection: BootstrapResult }>(
      `select request_fingerprint,result_projection from security_administration_command
        where tenant_id=$1 and operation=$2 and idempotency_key=$3 and outcome='completed'`,
      [tenantId, operation, tenantId],
    );
    if (existing) {
      if (existing.request_fingerprint !== fingerprint)
        throw new TenantBootstrapError("This tenant ID was bootstrapped with different inputs");
      await client.query("commit");
      return { ...existing.result_projection, status: "already_bootstrapped" };
    }
    if ((await client.query("select 1 from tenant where id=$1", [tenantId])).rowCount) {
      throw new TenantBootstrapError("This tenant ID is already in use");
    }

    await verifyLoginDirectory(client, loginDirectorySecret);
    const userId = `user-${randomUUID()}`;
    const companyId = `company-${randomUUID()}`;
    const commandId = randomUUID();
    const result = { tenantId, userId, companyId, credentialEmailQueued: config.emailDelivery !== null };
    await client.query(
      `insert into tenant (id,name,plan,region,status,default_locale,organisation_type,country_code,
         financial_year_start_month,registered_at,registered_by)
       values ($1,$2,'enterprise',$3,'active','en-US',$4,$3,$5,now(),$6)`,
      [tenantId, organisation, profile.country, profile.type, profile.financialYearStartMonth, userId],
    );
    await client.query(
      `insert into organization_unit (tenant_id,id,type,code,name,status) values ($1,$2,'company','CO-001',$3,'active')`,
      [tenantId, companyId, organisation],
    );
    await client.query(
      `insert into security_user_account (tenant_id,id,identity_subject,email,status,mfa_state,created_at,display_name)
       values ($1,$2,$3,$4,'active','disabled',now(),$5)`,
      [tenantId, userId, `local:${userId}`, email, name],
    );
    await client.query(
      `insert into security_administration_command
        (tenant_id,command_id,actor_id,operation,correlation_id,idempotency_key,request_fingerprint)
       values ($1,$2,$3,$4,$2,$1,$5)`,
      [tenantId, commandId, userId, operation, fingerprint],
    );
    await client.query(
      `insert into security_password_credential
        (tenant_id,user_id,username,updated_at,argon2_hash,argon2_updated_at,must_change_password,credential_status)
       values ($1,$2,$3,now(),$4,now(),true,'reset_required')`,
      [tenantId, userId, username, await hashPassword(registration.admin_password)],
    );
    for (const [kind, value] of [
      ["email", email],
      ["username", username],
    ] as const) {
      await client.query(
        `insert into security_login_identifier (tenant_id,user_id,identifier_kind,identifier_hmac,lifecycle_state,source_reference)
         values ($1,$2,$3,$4,'active',$5)`,
        [tenantId, userId, kind, loginIdentifierHmac(loginDirectorySecret, kind, value), source],
      );
    }
    await grantInitialAdministrator(client, tenantId, userId, commandId);
    await client.query(
      `insert into security_user_company_access
         (tenant_id,access_id,user_id,company_id,is_default,granted_by,source_kind,source_reference)
       values ($1,$2,$3,$4,true,$3,'governed_administration',$5)`,
      [tenantId, `access-${randomUUID()}`, userId, companyId, source],
    );
    const month = profile.financialYearStartMonth;
    const year = now.getUTCFullYear() - Number(now.getUTCMonth() + 1 < month);
    const start = `${year}-${String(month).padStart(2, "0")}-01`;
    const periods = monthlyFiscalPeriods(start);
    const calendarId = `fiscal-calendar-${randomUUID()}`;
    await client.query(
      `insert into fiscal_calendar (tenant_id,id,company_id,year,period_start,period_end,status)
       values ($1,$2,$3,$4,$5,$6,'active')`,
      [tenantId, calendarId, companyId, year, start, periods[11]!.period_end],
    );
    if (config.emailDelivery) {
      await enqueueCredentialEmail(client, config.emailDelivery, {
        tenantId,
        userId,
        template: "account_created",
        temporaryPassword: registration.admin_password,
      });
    }
    const auditId = await appendSecurityAuditEvent(client, {
      tenantId,
      actorId: source,
      correlationId: commandId,
      action: operation,
      entityType: "tenant",
      entityId: tenantId,
      before: null,
      after: { ...result, calendarId },
      sourceReference: source,
      occurredAt: now,
    });
    await client.query(
      `update security_administration_command set outcome='completed',completed_at=now(),result_projection=$3,
        audit_event_id=$4,row_version=row_version+1 where tenant_id=$1 and command_id=$2`,
      [tenantId, commandId, { ...result, calendarId }, auditId],
    );
    await client.query("commit");
    return { ...result, calendarId, status: "created" };
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
