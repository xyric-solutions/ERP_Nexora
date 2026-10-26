import { randomUUID } from "node:crypto";

import type { AuthenticatedAccount } from "@nexora/auth";
import type { CreateSecurityRoleRequest } from "@nexora/contracts";
import { createDatabasePool, type DatabasePool } from "@nexora/db";

import { SourceTenantAuthenticationRepository } from "../server/api/src/modules/auth/source-repository.js";
import {
  SourceSecurityAdministrationRepository,
  type SecurityActorContext,
} from "../server/api/src/modules/security/source-administration-repository.js";

const roleCode = "shoaib_bank_reconciliation_uat";
const permissions = [
  "banking.statement_import.create",
  "banking.statement_import.finalize",
  "banking.statement_import.read",
  "banking.statement_import.update",
  "banking.statement_mapping.manage",
  "banking.statement_mapping.read",
  "banking.reconciliation.approve",
  "banking.reconciliation.create",
  "banking.reconciliation.match",
  "banking.reconciliation.read",
  "banking.reconciliation.submit",
  "banking.reconciliation.update",
  "banking.reconciliation_adjustment.approve",
  "banking.reconciliation_adjustment.create",
  "banking.reconciliation_adjustment.post",
  "banking.reconciliation_adjustment.read",
  "banking.reconciliation_adjustment.reverse",
  "banking.reconciliation_adjustment.submit",
  "banking.reconciliation_adjustment.update",
] as const;

const databaseUrl = requiredEnvironment("DATABASE_URL");
const tenantId = requiredEnvironment("NEXORA_BANK_RECONCILIATION_TENANT_ID");
const companyId = requiredEnvironment("NEXORA_BANK_RECONCILIATION_COMPANY_ID");
const makerUserId = requiredEnvironment("NEXORA_BANK_RECONCILIATION_MAKER_USER_ID");
const checkerUserId = requiredEnvironment("NEXORA_BANK_RECONCILIATION_CHECKER_USER_ID");
const shoaibUserId = requiredEnvironment("NEXORA_BANK_RECONCILIATION_SHOAIB_USER_ID");

if (process.env.NEXORA_ENVIRONMENT !== "uat" || process.env.NEXORA_UAT_CONFIRM !== tenantId) {
  throw new Error(`Set NEXORA_ENVIRONMENT=uat and NEXORA_UAT_CONFIRM=${tenantId}`);
}
if (makerUserId === checkerUserId) {
  throw new Error("Bank Reconciliation UAT provisioning requires a separate Security checker.");
}
if (makerUserId === shoaibUserId || checkerUserId === shoaibUserId) {
  throw new Error("Shoaib cannot create or approve his own Bank Reconciliation overlay assignment.");
}
assertLocalIsolatedDatabase(databaseUrl);

const roleDraft: CreateSecurityRoleRequest = {
  role_code: roleCode,
  display_name: "Shoaib - Bank Reconciliation UAT",
  description: "Company-scoped Bank Statement Import and Reconciliation authority for controlled local UAT.",
  permissions: [...permissions],
  scope: { mode: "companies", company_ids: [companyId] },
  field_rules: { allow: null, deny: [] },
  sod_rules: { conflicting_roles: [], distinct_actor_fields: [] },
  allowed_source_states: {},
  delegations: [],
};

interface RoleRow {
  policy_id: string;
  role_id: string;
  lifecycle_state: "draft" | "submitted" | "approved" | "active" | "archived";
  status: "active" | "inactive";
  row_version: number;
  permissions: string[];
  scope: { mode?: string; company_ids?: string[] };
}

interface ApprovalRequestRow {
  request_id: string;
  row_version: number;
  request_state: string;
}

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function assertLocalIsolatedDatabase(value: string): void {
  const target = new URL(value);
  const local = ["127.0.0.1", "localhost", "::1", "[::1]"].includes(target.hostname);
  const isolatedName = /(uat|test|codex|isolated|provision|reconciliation)/i.test(decodeURIComponent(target.pathname));
  if (!local || !isolatedName) {
    throw new Error("Bank Reconciliation UAT provisioning requires an explicitly named local isolated database.");
  }
}

function sorted(values: readonly string[]): string[] {
  return [...values].sort((left, right) => left.localeCompare(right));
}

function roleMatches(row: RoleRow): boolean {
  return (
    JSON.stringify(sorted(row.permissions)) === JSON.stringify(sorted(permissions)) &&
    row.scope.mode === "companies" &&
    JSON.stringify(sorted(row.scope.company_ids ?? [])) === JSON.stringify([companyId])
  );
}

async function loadActor(pool: DatabasePool, userId: string): Promise<AuthenticatedAccount> {
  const actor = await new SourceTenantAuthenticationRepository(pool).loadAuthenticatedAccount(
    tenantId,
    userId,
    new Date(),
  );
  if (!actor) throw new Error(`Active governed Security actor ${userId} was not found.`);
  return actor;
}

function actorContext(actor: AuthenticatedAccount, operation: string): SecurityActorContext {
  return {
    tenantId,
    actor,
    correlationId: `br12-bank-reconciliation-uat:${operation}:${randomUUID()}`,
  };
}

async function loadRole(pool: DatabasePool): Promise<RoleRow | null> {
  const result = await pool.query<RoleRow>(
    `select policy.id as policy_id,policy.role_id,policy.lifecycle_state,policy.status,
            policy.row_version::int,policy.permissions,policy.scope
       from security_role_policy policy
      where policy.tenant_id=$1 and policy.role=$2
      order by policy.version desc,policy.created_at desc`,
    [tenantId, roleCode],
  );
  if (result.rowCount && result.rowCount > 1) {
    throw new Error("Multiple Bank Reconciliation UAT overlay policies exist; manual Security review is required.");
  }
  return result.rows[0] ?? null;
}

async function pendingRoleApproval(
  pool: DatabasePool,
  policyId: string,
  requestedAction: "approve" | "activate",
): Promise<ApprovalRequestRow | null> {
  const result = await pool.query<ApprovalRequestRow>(
    `select request_id,row_version::int,request_state
      from security_role_approval_request
      where tenant_id=$1 and role_policy_id=$2 and requested_action=$3 and request_state='pending'
      order by request_id desc`,
    [tenantId, policyId, requestedAction],
  );
  if (result.rowCount && result.rowCount > 1) {
    throw new Error(`Multiple pending ${requestedAction} requests exist for the UAT overlay.`);
  }
  return result.rows[0] ?? null;
}

async function activeAssignmentCount(pool: DatabasePool, policyId: string): Promise<number> {
  const result = await pool.query<{ count: number }>(
    `select count(*)::int as count
       from security_user_role_assignment
      where tenant_id=$1 and user_id=$2 and role_policy_id=$3 and lifecycle_state='active'
        and valid_from<=now() and (valid_until is null or valid_until>now())`,
    [tenantId, shoaibUserId, policyId],
  );
  return result.rows[0]?.count ?? 0;
}

async function pendingAssignmentApproval(pool: DatabasePool, policyId: string): Promise<ApprovalRequestRow | null> {
  const result = await pool.query<ApprovalRequestRow>(
    `select request_id,row_version::int,request_state
       from security_assignment_approval_request
      where tenant_id=$1 and target_user_id=$2 and role_policy_id=$3
        and requested_action='create' and request_state in ('draft','submitted','pending')
      order by request_id desc`,
    [tenantId, shoaibUserId, policyId],
  );
  if (result.rowCount && result.rowCount > 1) {
    throw new Error("Multiple open Shoaib overlay assignment requests exist; manual Security review is required.");
  }
  return result.rows[0] ?? null;
}

async function verifyPrerequisites(pool: DatabasePool): Promise<void> {
  const result = await pool.query<{
    tenant_ok: boolean;
    company_ok: boolean;
    security_18: boolean;
    finance_29: boolean;
    permission_count: number;
    shoaib_company_access: boolean;
    override_allowed: boolean;
  }>(
    `select
       exists(select 1 from tenant where id=$1 and status='active' and region='uat-isolated') as tenant_ok,
       exists(select 1 from organization_unit
         where tenant_id=$1 and id=$2 and type='company' and status='active') as company_ok,
       exists(select 1 from nexora_schema_migration
         where module_name='security' and version=18) as security_18,
       exists(select 1 from nexora_schema_migration
         where module_name='finance' and version=29) as finance_29,
       (select count(*)::int from security_permission_definition
         where status='active' and permission_key=any($4::text[])) as permission_count,
       exists(select 1 from security_user_company_access
         where tenant_id=$1 and user_id=$3 and company_id=$2 and revoked_at is null) as shoaib_company_access,
       bank_has_live_permission($1,$2,$3,'platform.approval.override',true) as override_allowed`,
    [tenantId, companyId, shoaibUserId, permissions],
  );
  const row = result.rows[0];
  if (!row?.tenant_ok) throw new Error("The confirmed active isolated UAT tenant was not found.");
  if (!row.company_ok) throw new Error("The confirmed active UAT company was not found.");
  if (!row.security_18 || !row.finance_29) {
    throw new Error("Security 18 and Finance 29 must be applied before Bank Reconciliation UAT provisioning.");
  }
  if (row.permission_count !== permissions.length) {
    throw new Error("The complete Bank Reconciliation permission catalogue is unavailable.");
  }
  if (!row.shoaib_company_access) throw new Error("Shoaib requires existing active access to the target company.");
  if (!row.override_allowed) {
    throw new Error("Shoaib requires pre-existing tenant-scoped Super Administrator approval-writer authority.");
  }
}

async function verifyResult(pool: DatabasePool, policyId: string): Promise<void> {
  const role = await loadRole(pool);
  if (!role || role.policy_id !== policyId || role.lifecycle_state !== "active" || role.status !== "active") {
    throw new Error("The governed Bank Reconciliation UAT overlay is not active.");
  }
  if (!roleMatches(role))
    throw new Error("The active Bank Reconciliation UAT overlay has drifted from its approved scope.");

  const result = await pool.query<{
    permission_count: number;
    company_scope_count: number;
    non_company_scope_count: number;
    assignment_count: number;
    latest_assignment_count: number;
    live_permission_count: number;
    approval_writer_allowed: boolean;
    override_in_overlay: boolean;
  }>(
    `select
       (select count(*)::int from security_role_permission_grant
         where tenant_id=$1 and role_policy_id=$3) as permission_count,
       (select count(*)::int from security_role_scope_grant
         where tenant_id=$1 and role_policy_id=$3 and scope_kind='company' and scope_value=$2) as company_scope_count,
       (select count(*)::int from security_role_scope_grant
         where tenant_id=$1 and role_policy_id=$3
           and (scope_kind<>'company' or scope_value<>$2)) as non_company_scope_count,
       (select count(*)::int from security_user_role_assignment
         where tenant_id=$1 and user_id=$4 and role_policy_id=$3 and lifecycle_state='active') as assignment_count,
       (select count(*)::int from security_user_role_assignment_version version
         where version.tenant_id=$1 and version.user_id=$4 and version.role_policy_id=$3
           and version.version=(select max(latest.version)
             from security_user_role_assignment_version latest
            where latest.tenant_id=version.tenant_id and latest.assignment_id=version.assignment_id)
           and version.lifecycle_state='active') as latest_assignment_count,
       (select count(*)::int from unnest($5::text[]) permission
         where bank_has_live_permission($1,$2,$4,permission)) as live_permission_count,
       bank_has_live_permission($1,$2,$4,'platform.approval.override',true) as approval_writer_allowed,
       exists(select 1 from security_role_permission_grant
         where tenant_id=$1 and role_policy_id=$3 and permission_key='platform.approval.override') as override_in_overlay`,
    [tenantId, companyId, policyId, shoaibUserId, permissions],
  );
  const row = result.rows[0];
  if (
    !row ||
    row.permission_count !== permissions.length ||
    row.company_scope_count !== permissions.length ||
    row.non_company_scope_count !== 0 ||
    row.assignment_count !== 1 ||
    row.latest_assignment_count !== 1 ||
    row.live_permission_count !== permissions.length ||
    !row.approval_writer_allowed ||
    row.override_in_overlay
  ) {
    throw new Error(
      "Bank Reconciliation UAT normalized grants, assignment, or approval authority verification failed.",
    );
  }
}

async function main(): Promise<void> {
  const pool = createDatabasePool(databaseUrl);
  let created = false;
  try {
    await verifyPrerequisites(pool);
    const [maker, checker] = await Promise.all([loadActor(pool, makerUserId), loadActor(pool, checkerUserId)]);
    if (!maker.permissions.includes("security.authorization.administer")) {
      throw new Error("The configured Security maker is not a tenant-wide authorization administrator.");
    }
    if (!checker.permissions.includes("security.authorization.administer")) {
      throw new Error("The configured Security checker is not a tenant-wide authorization administrator.");
    }

    const security = new SourceSecurityAdministrationRepository(pool);
    let role = await loadRole(pool);
    if (!role) {
      const result = await security.createRole(
        actorContext(maker, "role-create"),
        roleDraft,
        `br12.role.create.${companyId}`,
      );
      created = !result.replayed;
      role = await loadRole(pool);
    }
    if (!role) throw new Error("The Bank Reconciliation UAT overlay draft could not be established.");
    if (!roleMatches(role)) {
      throw new Error(
        "The existing Bank Reconciliation UAT overlay differs from the approved permission or company scope.",
      );
    }
    if (role.lifecycle_state === "archived") {
      throw new Error("The Bank Reconciliation UAT overlay is archived; Security review is required.");
    }

    if (role.lifecycle_state === "draft") {
      await security.actOnRole(
        actorContext(maker, "role-submit"),
        { action: "submit", policy_id: role.policy_id, expected_version: role.row_version },
        `br12.role.submit.${role.policy_id}`,
      );
      role = (await loadRole(pool))!;
    }
    if (role.lifecycle_state === "submitted") {
      const approval = await pendingRoleApproval(pool, role.policy_id, "approve");
      if (!approval) throw new Error("The submitted UAT overlay has no pending governed approval request.");
      await security.decideApproval(
        actorContext(checker, "role-approve"),
        {
          resource_type: "role",
          request_id: approval.request_id,
          decision: "approved",
          reason: "Independent approval of the company-scoped Bank Reconciliation UAT overlay.",
          expected_version: approval.row_version,
        },
        `br12.role.approve.${approval.request_id}`,
      );
      role = (await loadRole(pool))!;
    }
    if (role.lifecycle_state === "approved") {
      let activation = await pendingRoleApproval(pool, role.policy_id, "activate");
      if (!activation) {
        await security.actOnRole(
          actorContext(maker, "role-request-activate"),
          { action: "request_activate", policy_id: role.policy_id, expected_version: role.row_version },
          `br12.role.request-activate.${role.policy_id}`,
        );
        activation = await pendingRoleApproval(pool, role.policy_id, "activate");
      }
      if (!activation) throw new Error("The approved UAT overlay has no pending activation request.");
      await security.decideApproval(
        actorContext(checker, "role-activate"),
        {
          resource_type: "role",
          request_id: activation.request_id,
          decision: "approved",
          reason: "Independent activation of the company-scoped Bank Reconciliation UAT overlay.",
          expected_version: activation.row_version,
        },
        `br12.role.activate.${activation.request_id}`,
      );
      role = (await loadRole(pool))!;
    }
    if (role.lifecycle_state !== "active") {
      throw new Error(`Unexpected Bank Reconciliation UAT overlay state: ${role.lifecycle_state}`);
    }

    const assignments = await activeAssignmentCount(pool, role.policy_id);
    if (assignments > 1) throw new Error("Multiple active Shoaib UAT overlay assignments require Security review.");
    if (assignments === 0) {
      let request = await pendingAssignmentApproval(pool, role.policy_id);
      if (!request) {
        const result = await security.createAssignmentRequest(
          actorContext(maker, "assignment-create"),
          {
            requested_action: "create",
            proposal: {
              target_user_id: shoaibUserId,
              role_policy_id: role.policy_id,
              assignment_id: null,
              valid_from: new Date().toISOString(),
              valid_until: null,
              revocation_reason: null,
            },
          },
          `br12.assignment.create.${role.policy_id}.${shoaibUserId}`,
        );
        request = {
          request_id: result.entity_id,
          request_state: "draft",
          row_version: 1,
        };
      }
      if (request.request_state === "draft") {
        await security.actOnAssignmentRequest(
          actorContext(maker, "assignment-submit"),
          { action: "submit", request_id: request.request_id, expected_version: request.row_version },
          `br12.assignment.submit.${request.request_id}`,
        );
        request = await pendingAssignmentApproval(pool, role.policy_id);
      }
      if (!request || !["submitted", "pending"].includes(request.request_state)) {
        throw new Error("The Shoaib overlay assignment did not reach governed approval.");
      }
      await security.decideApproval(
        actorContext(checker, "assignment-approve"),
        {
          resource_type: "assignment",
          request_id: request.request_id,
          decision: "approved",
          reason: "Independent approval of Shoaib's company-scoped Bank Reconciliation UAT assignment.",
          expected_version: request.row_version,
        },
        `br12.assignment.approve.${request.request_id}`,
      );
    }

    await verifyResult(pool, role.policy_id);
    process.stdout.write(
      `${JSON.stringify({
        tenantId,
        companyId,
        userId: shoaibUserId,
        roleCode,
        permissionCount: permissions.length,
        created,
        migrations: { security: 18, finance: 29 },
        approvalWriterAuthority: "pre-existing-super-administrator",
        syntheticFinancialDataCreated: false,
      })}\n`,
    );
  } finally {
    await pool.end();
  }
}

await main();
