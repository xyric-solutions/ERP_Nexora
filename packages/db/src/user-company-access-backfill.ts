import { createHash } from "node:crypto";

import type pg from "pg";

export interface UserCompanyAccessBackfillResult {
  examinedUsers: number;
  inserted: number;
  updated: number;
  unchanged: number;
  skipped: number;
  ambiguousDefaults: number;
  conflicts: number;
}

export interface UserCompanyAccessShadowMismatch {
  tenantId: string;
  userId: string;
  companyId: string;
  kind: "missing_normalized_access" | "excess_normalized_access";
  classification: "mapping_issue" | "security_issue";
}

export interface UserCompanyAccessShadowResult {
  examinedUsers: number;
  comparisons: number;
  matches: number;
  mismatches: UserCompanyAccessShadowMismatch[];
}

interface ActiveAccountRow {
  tenant_id: string;
  user_id: string;
}

interface ActiveCompanyRow {
  tenant_id: string;
  company_id: string;
}

interface ScopeRow {
  tenant_id: string;
  user_id: string;
  assigned_by: string;
  scope_kind: "tenant" | "company" | "owner" | "record";
  scope_value: string;
}

interface EmployeeCompanyRow {
  tenant_id: string;
  user_id: string;
  company_id: string;
}

interface ExistingAccessRow {
  tenant_id: string;
  access_id: string;
  user_id: string;
  company_id: string;
  is_default: boolean;
  source_kind: "governed_administration" | "compatibility_backfill";
  source_reference: string;
}

interface DerivedAccess {
  tenantId: string;
  userId: string;
  companyId: string;
  grantedBy: string;
}

interface Projection {
  accounts: ActiveAccountRow[];
  derived: DerivedAccess[];
  employeeCompanies: Map<string, Set<string>>;
  skippedUsers: Set<string>;
  conflicts: number;
}

const RLS_TABLES = [
  "security_user_account",
  "security_user_role_assignment",
  "security_role_policy",
  "security_role_scope_grant",
  "security_user_company_access",
  "employee_user_binding",
  "employee_assignment",
  "organization_unit",
] as const;

function userKey(tenantId: string, userId: string): string {
  return `${tenantId}\0${userId}`;
}

function accessKey(tenantId: string, userId: string, companyId: string): string {
  return `${tenantId}\0${userId}\0${companyId}`;
}

function deterministicAccessId(tenantId: string, userId: string, companyId: string): string {
  const digest = createHash("sha256")
    .update(`nexora:user-company-access:v1\0${tenantId}\0${userId}\0${companyId}`, "utf8")
    .digest("hex")
    .slice(0, 40);
  return `company-access-${digest}`;
}

async function requireMigrationOwner(client: pg.PoolClient): Promise<void> {
  const ownership = await client.query<{ owns_sources: boolean }>(
    `select bool_and(pg_get_userbyid(relowner) = current_user) as owns_sources
       from pg_class
      where oid = any($1::regclass[])`,
    [RLS_TABLES],
  );
  if (!ownership.rows[0]?.owns_sources) {
    throw new Error("User company-access backfill requires the migration-owner database connection");
  }
}

async function relaxOwnerRls(client: pg.PoolClient): Promise<void> {
  for (const table of RLS_TABLES) {
    await client.query(`alter table ${table} no force row level security`);
  }
}

async function restoreOwnerRls(client: pg.PoolClient): Promise<void> {
  for (const table of [...RLS_TABLES].reverse()) {
    await client.query(`alter table ${table} force row level security`);
  }
}

async function readProjection(client: pg.PoolClient): Promise<Projection> {
  const accounts = await client.query<ActiveAccountRow>(
    `select tenant_id, id as user_id
       from security_user_account
      where status = 'active'
      order by tenant_id, id`,
  );
  const companies = await client.query<ActiveCompanyRow>(
    `select tenant_id, id as company_id
       from organization_unit
      where type = 'company' and status = 'active'
      order by tenant_id, id`,
  );
  const scopes = await client.query<ScopeRow>(
    `select distinct assignment.tenant_id,
            assignment.user_id,
            assignment.assigned_by,
            scope.scope_kind,
            scope.scope_value
       from security_user_role_assignment assignment
       join security_user_account account
         on account.tenant_id = assignment.tenant_id
        and account.id = assignment.user_id
       join security_role_policy policy
         on policy.tenant_id = assignment.tenant_id
        and policy.id = assignment.role_policy_id
       join security_role_scope_grant scope
         on scope.tenant_id = assignment.tenant_id
        and scope.role_policy_id = assignment.role_policy_id
      where account.status = 'active'
        and assignment.lifecycle_state = 'active'
        and assignment.valid_from <= now()
        and (assignment.valid_until is null or assignment.valid_until > now())
        and policy.status = 'active'
      order by assignment.tenant_id, assignment.user_id, assignment.assigned_by,
               scope.scope_kind, scope.scope_value`,
  );
  const employeeCompanies = await client.query<EmployeeCompanyRow>(
    `select distinct binding.tenant_id, binding.user_id, assignment.company_id
       from employee_user_binding binding
       join employee_assignment assignment
         on assignment.tenant_id = binding.tenant_id
        and assignment.employee_id = binding.employee_id
      where binding.effective_from <= current_date
        and (binding.effective_to is null or binding.effective_to >= current_date)
        and assignment.effective_from <= current_date
        and (assignment.effective_to is null or assignment.effective_to >= current_date)
        and assignment.assignment_status in ('active', 'legacy_compatibility')
      order by binding.tenant_id, binding.user_id, assignment.company_id`,
  );

  const companiesByTenant = new Map<string, Set<string>>();
  for (const row of companies.rows) {
    const values = companiesByTenant.get(row.tenant_id) ?? new Set<string>();
    values.add(row.company_id);
    companiesByTenant.set(row.tenant_id, values);
  }
  const employeeCompaniesByUser = new Map<string, Set<string>>();
  for (const row of employeeCompanies.rows) {
    const key = userKey(row.tenant_id, row.user_id);
    const values = employeeCompaniesByUser.get(key) ?? new Set<string>();
    values.add(row.company_id);
    employeeCompaniesByUser.set(key, values);
  }

  const derivedByAccess = new Map<string, DerivedAccess>();
  const skippedUsers = new Set<string>();
  let conflicts = 0;
  const add = (scope: ScopeRow, companyId: string): void => {
    const tenantCompanies = companiesByTenant.get(scope.tenant_id);
    if (!tenantCompanies?.has(companyId)) {
      conflicts += 1;
      skippedUsers.add(userKey(scope.tenant_id, scope.user_id));
      return;
    }
    const key = accessKey(scope.tenant_id, scope.user_id, companyId);
    const previous = derivedByAccess.get(key);
    if (!previous || scope.assigned_by.localeCompare(previous.grantedBy) < 0) {
      derivedByAccess.set(key, {
        tenantId: scope.tenant_id,
        userId: scope.user_id,
        companyId,
        grantedBy: scope.assigned_by,
      });
    }
  };

  for (const scope of scopes.rows) {
    if (scope.scope_kind === "tenant") {
      for (const companyId of companiesByTenant.get(scope.tenant_id) ?? []) add(scope, companyId);
      continue;
    }
    if (scope.scope_kind === "company") {
      add(scope, scope.scope_value);
      continue;
    }
    if (scope.scope_kind === "owner") {
      const ownedCompanies = employeeCompaniesByUser.get(userKey(scope.tenant_id, scope.user_id));
      if (ownedCompanies?.size === 1) add(scope, [...ownedCompanies][0]!);
      else {
        conflicts += 1;
        skippedUsers.add(userKey(scope.tenant_id, scope.user_id));
      }
      continue;
    }
    // Record-scoped authority cannot safely infer a company boundary.
    conflicts += 1;
    skippedUsers.add(userKey(scope.tenant_id, scope.user_id));
  }

  return {
    accounts: accounts.rows,
    derived: [...derivedByAccess.values()].sort((left, right) =>
      accessKey(left.tenantId, left.userId, left.companyId).localeCompare(
        accessKey(right.tenantId, right.userId, right.companyId),
      ),
    ),
    employeeCompanies: employeeCompaniesByUser,
    skippedUsers,
    conflicts,
  };
}

export async function backfillUserCompanyAccess(pool: pg.Pool): Promise<UserCompanyAccessBackfillResult> {
  const client = await pool.connect();
  try {
    await client.query("begin isolation level serializable");
    await client.query("select pg_advisory_xact_lock(hashtextextended($1, 0))", [
      "nexora:security:user-company-access-backfill",
    ]);
    await requireMigrationOwner(client);
    await relaxOwnerRls(client);

    const projection = await readProjection(client);
    const existing = await client.query<ExistingAccessRow>(
      `select tenant_id, access_id, user_id, company_id, is_default,
              source_kind, source_reference
         from security_user_company_access
        where revoked_at is null
        order by tenant_id, user_id, company_id`,
    );
    const existingByAccess = new Map(
      existing.rows.map((row) => [accessKey(row.tenant_id, row.user_id, row.company_id), row]),
    );
    const existingDefaultByUser = new Map(
      existing.rows.filter((row) => row.is_default).map((row) => [userKey(row.tenant_id, row.user_id), row.company_id]),
    );
    const derivedByUser = new Map<string, DerivedAccess[]>();
    for (const row of projection.derived) {
      const key = userKey(row.tenantId, row.userId);
      const values = derivedByUser.get(key) ?? [];
      values.push(row);
      derivedByUser.set(key, values);
    }

    let inserted = 0;
    let unchanged = 0;
    let ambiguousDefaults = 0;
    let conflicts = projection.conflicts;
    let skipped = 0;

    for (const account of projection.accounts) {
      const key = userKey(account.tenant_id, account.user_id);
      const derived = derivedByUser.get(key) ?? [];
      if (derived.length === 0) {
        skipped += 1;
        continue;
      }

      const existingDefault = existingDefaultByUser.get(key);
      let selectedDefault = existingDefault;
      if (existingDefault && !derived.some((row) => row.companyId === existingDefault)) {
        conflicts += 1;
        selectedDefault = undefined;
      }
      if (!selectedDefault && derived.length === 1) {
        selectedDefault = derived[0]!.companyId;
      } else if (!selectedDefault) {
        const employeeCompanies = projection.employeeCompanies.get(key) ?? new Set<string>();
        const matchingEmployeeCompanies = [...employeeCompanies].filter((companyId) =>
          derived.some((row) => row.companyId === companyId),
        );
        if (matchingEmployeeCompanies.length === 1) selectedDefault = matchingEmployeeCompanies[0];
        else ambiguousDefaults += 1;
      }

      for (const row of derived) {
        const rowKey = accessKey(row.tenantId, row.userId, row.companyId);
        const previous = existingByAccess.get(rowKey);
        const shouldBeDefault = row.companyId === selectedDefault;
        if (previous) {
          if (previous.is_default !== shouldBeDefault && !existingDefault) conflicts += 1;
          else unchanged += 1;
          continue;
        }
        const result = await client.query(
          `insert into security_user_company_access (
             tenant_id, access_id, user_id, company_id, is_default,
             granted_by, source_kind, source_reference
           ) values ($1,$2,$3,$4,$5,$6,'compatibility_backfill',$7)
           on conflict do nothing`,
          [
            row.tenantId,
            deterministicAccessId(row.tenantId, row.userId, row.companyId),
            row.userId,
            row.companyId,
            shouldBeDefault,
            row.grantedBy,
            "normalized-role-scope:v1",
          ],
        );
        if ((result.rowCount ?? 0) === 1) inserted += 1;
        else conflicts += 1;
      }
    }

    await restoreOwnerRls(client);
    await client.query("commit");
    return {
      examinedUsers: projection.accounts.length,
      inserted,
      updated: 0,
      unchanged,
      skipped,
      ambiguousDefaults,
      conflicts,
    };
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function readUserCompanyAccessShadowParity(pool: pg.Pool): Promise<UserCompanyAccessShadowResult> {
  const client = await pool.connect();
  try {
    // ALTER TABLE ... NO FORCE RLS is transactional metadata needed for the
    // migration owner to inspect forced-RLS relations. The transaction does
    // not mutate application rows, but therefore cannot be declared READ ONLY.
    await client.query("begin isolation level repeatable read");
    await client.query("select pg_advisory_xact_lock_shared(hashtextextended($1, 0))", [
      "nexora:security:user-company-access-backfill",
    ]);
    await requireMigrationOwner(client);
    await relaxOwnerRls(client);
    const projection = await readProjection(client);
    const normalized = await client.query<Pick<ExistingAccessRow, "tenant_id" | "user_id" | "company_id">>(
      `select tenant_id, user_id, company_id
         from security_user_company_access
        where revoked_at is null
        order by tenant_id, user_id, company_id`,
    );
    const legacyKeys = new Set(projection.derived.map((row) => accessKey(row.tenantId, row.userId, row.companyId)));
    const normalizedKeys = new Set(normalized.rows.map((row) => accessKey(row.tenant_id, row.user_id, row.company_id)));
    const mismatches: UserCompanyAccessShadowMismatch[] = [];
    for (const row of projection.derived) {
      if (!normalizedKeys.has(accessKey(row.tenantId, row.userId, row.companyId))) {
        mismatches.push({
          tenantId: row.tenantId,
          userId: row.userId,
          companyId: row.companyId,
          kind: "missing_normalized_access",
          classification: "mapping_issue",
        });
      }
    }
    for (const row of normalized.rows) {
      if (!legacyKeys.has(accessKey(row.tenant_id, row.user_id, row.company_id))) {
        mismatches.push({
          tenantId: row.tenant_id,
          userId: row.user_id,
          companyId: row.company_id,
          kind: "excess_normalized_access",
          classification: "security_issue",
        });
      }
    }
    await restoreOwnerRls(client);
    await client.query("commit");
    const comparisons = new Set([...legacyKeys, ...normalizedKeys]).size;
    return {
      examinedUsers: projection.accounts.length,
      comparisons,
      matches: comparisons - mismatches.length,
      mismatches,
    };
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
