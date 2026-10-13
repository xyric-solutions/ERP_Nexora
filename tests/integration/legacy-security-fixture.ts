import { randomUUID } from "node:crypto";

import type { DatabasePool } from "../../packages/db/src/index.js";

const bootstrapLockId = 8_351_901_441;
const policyMutationLockId = 4_894_133_722;
const enterpriseScopeId = "50000000-0000-4000-8000-000000000001";

export interface LegacyBootstrapAdministrator {
  userId: string;
  loginIdentifier: string;
  displayName: string;
  completedAt: Date;
}

/**
 * Creates the historical bootstrap policy used by legacy migration compatibility
 * tests. This fixture is intentionally test-only; the production API uses the
 * tenant-aware source-ledger authentication and authorization repositories.
 */
export async function createLegacyBootstrapAdministrator(
  pool: DatabasePool,
  input: {
    loginIdentifier: string;
    displayName: string;
    passwordHash: string;
    now: Date;
  },
): Promise<LegacyBootstrapAdministrator | null> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("select pg_advisory_xact_lock($1)", [bootstrapLockId]);
    await client.query("select pg_advisory_xact_lock($1)", [policyMutationLockId]);
    const existing = await client.query(
      "select exists(select 1 from security_bootstrap_state) or exists(select 1 from app_user) as completed",
    );
    if (existing.rows[0]?.completed === true) {
      await client.query("rollback");
      return null;
    }

    const userId = randomUUID();
    const roleId = randomUUID();
    const assignmentId = randomUUID();
    await client.query(
      `insert into app_user
        (id, login_identifier, display_name, status, bootstrap_administrator, created_at, updated_at)
       values ($1, $2, $3, 'active', true, $4, $4)`,
      [userId, input.loginIdentifier, input.displayName, input.now],
    );
    await client.query(
      `insert into password_credential (user_id, password_hash, hash_algorithm, changed_at)
       values ($1, $2, 'argon2id', $3)`,
      [userId, input.passwordHash, input.now],
    );
    await client.query(
      `insert into password_history (id, user_id, password_hash, hash_algorithm, changed_at)
       values ($1, $2, $3, 'argon2id', $4)`,
      [randomUUID(), userId, input.passwordHash, input.now],
    );
    await client.query(
      `insert into security_role
        (id, code, display_name, description, status, created_at, updated_at)
       values ($1, 'initial_administrator', 'Initial Administrator',
               'Dynamic role created during installation bootstrap.', 'active', $2, $2)`,
      [roleId, input.now],
    );
    await client.query(
      `insert into security_role_permission (role_id, permission_id, granted_at, granted_by_user_id)
       select $1, id, $2, $3 from security_permission where status = 'active'`,
      [roleId, input.now, userId],
    );
    await client.query(
      `insert into security_field_grant
        (role_id, permission_id, field_path, granted_at, granted_by_user_id)
       select $1, field.permission_id, field.field_path, $2, $3
       from security_permission_field field
       join security_permission permission on permission.id = field.permission_id
       where permission.status = 'active'`,
      [roleId, input.now, userId],
    );
    await client.query(
      `insert into security_role_assignment
        (id, user_id, role_id, status, valid_from, assigned_by_user_id, created_at, updated_at)
       values ($1, $2, $3, 'active', $4, $2, $4, $4)`,
      [assignmentId, userId, roleId, input.now],
    );
    await client.query(
      `insert into security_assignment_scope (assignment_id, scope_id, include_descendants)
       values ($1, $2, true)`,
      [assignmentId, enterpriseScopeId],
    );
    await client.query(
      `insert into security_policy_event
        (id, event_type, actor_user_id, entity_type, entity_id, occurred_at, after_summary, metadata)
       values ($1, 'security.bootstrap_policy.created', $2, 'role', $3, $4,
               jsonb_build_object('roleCode', 'initial_administrator'),
               jsonb_build_object('source', 'bootstrap'))`,
      [randomUUID(), userId, roleId, input.now],
    );
    await client.query(
      `insert into security_bootstrap_state (singleton, administrator_user_id, completed_at)
       values (true, $1, $2)`,
      [userId, input.now],
    );
    await client.query("commit");
    return {
      userId,
      loginIdentifier: input.loginIdentifier,
      displayName: input.displayName,
      completedAt: input.now,
    };
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
