import { randomUUID } from "node:crypto";

import type {
  AuthenticatedAccount,
  LoginCandidate,
  TenantAuthenticationRepository,
  TenantPasswordCredential,
} from "@nexora/auth";
import { encodePbkdf2Sha256Credential, verifyCompatiblePassword } from "@nexora/auth";
import type { DatabasePool } from "@nexora/db";
import type { PoolClient } from "pg";

interface CredentialRow {
  tenant_id: string;
  user_id: string;
  email: string;
  status: TenantPasswordCredential["status"];
  iterations: number | null;
  salt: Buffer | null;
  password_hash: Buffer | null;
  argon2_hash: string | null;
  must_change_password: boolean;
  password_version: number;
}

interface AccountRow {
  id: string;
  tenant_id: string;
  email: string;
  status: string;
  organization_name: string;
  display_name: string | null;
  session_version: number;
}

function encodeCredential(row: CredentialRow): string {
  if (row.argon2_hash) return row.argon2_hash;
  if (row.iterations === null || row.salt === null || row.password_hash === null) {
    throw new Error("INVALID_CREDENTIAL_STATE");
  }
  return encodePbkdf2Sha256Credential(row.iterations, row.salt, row.password_hash);
}

async function beginTenantTransaction(client: PoolClient, tenantId: string, readOnly: boolean): Promise<void> {
  await client.query(`begin isolation level repeatable read ${readOnly ? "read only" : "read write"}`);
  await client.query("select set_config('nexora.tenant_id', $1, true)", [tenantId]);
}

function stable(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

function sameValues(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

export class SourceTenantAuthenticationRepository implements TenantAuthenticationRepository {
  constructor(private readonly pool: DatabasePool) {}

  async resolveLoginCandidates(input: {
    emailHmac: string;
    usernameHmac: string;
    limit: number;
  }): Promise<readonly LoginCandidate[]> {
    const result = await this.pool.query<{ tenant_id: string; user_id: string }>(
      "select tenant_id, user_id from resolve_security_login_candidates($1, $2, $3)",
      [input.emailHmac, input.usernameHmac, input.limit],
    );
    return result.rows.map((row) => ({ tenantId: row.tenant_id, userId: row.user_id }));
  }

  async findPasswordCredential(tenantId: string, userId: string): Promise<TenantPasswordCredential | null> {
    const client = await this.pool.connect();
    try {
      await beginTenantTransaction(client, tenantId, true);
      const result = await client.query<CredentialRow>(
        `select account.tenant_id, account.id as user_id, account.email, account.status,
                credential.iterations, credential.salt, credential.password_hash,
                credential.argon2_hash, credential.must_change_password,
                credential.password_version
         from security_user_account account
         join security_password_credential credential
           on credential.tenant_id = account.tenant_id and credential.user_id = account.id
         where account.tenant_id = $1
           and account.id = $2`,
        [tenantId, userId],
      );
      await client.query("commit");
      const row = result.rows[0];
      if (!row) return null;
      return {
        tenantId: row.tenant_id,
        userId: row.user_id,
        status: row.status,
        encodedPasswordHash: encodeCredential(row),
        mustChangePassword: row.must_change_password,
        passwordVersion: Number(row.password_version),
      };
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async loadAuthenticatedAccount(
    tenantId: string,
    userId: string,
    evaluatedAt: Date,
  ): Promise<AuthenticatedAccount | null> {
    const client = await this.pool.connect();
    try {
      await beginTenantTransaction(client, tenantId, true);
      const accountResult = await client.query<AccountRow>(
        `select account.id, account.tenant_id, account.email, account.status,
                tenant.name as organization_name, account.display_name,
                account.session_version
         from security_user_account account
         join tenant on tenant.id = account.tenant_id
         where account.tenant_id = $1 and account.id = $2`,
        [tenantId, userId],
      );
      const account = accountResult.rows[0];
      if (!account || account.status !== "active") {
        await client.query("commit");
        return null;
      }

      const normalized = await client.query<{ role: string; permissions: string[] }>(
        `select policy.role,
                coalesce(array_agg(distinct permission_grant.permission_key order by permission_grant.permission_key), '{}') as permissions
         from security_user_role_assignment_version version
         join security_role_policy policy
           on policy.tenant_id = version.tenant_id and policy.id = version.role_policy_id
         join security_tenant_role role
           on role.tenant_id = policy.tenant_id and role.role_id = policy.role_id
         join security_role_permission_grant permission_grant
           on permission_grant.tenant_id = policy.tenant_id and permission_grant.role_policy_id = policy.id
         join security_permission_definition definition
           on definition.permission_key = permission_grant.permission_key and definition.status = 'active'
         where version.tenant_id = $1 and version.user_id = $2
           and version.version = (
             select max(latest.version)
             from security_user_role_assignment_version latest
             where latest.tenant_id = version.tenant_id
               and latest.assignment_id = version.assignment_id
           )
           and version.lifecycle_state = 'active'
           and version.valid_from <= $3
           and (version.valid_until is null or version.valid_until > $3)
           and policy.status = 'active'
           and policy.lifecycle_state = 'active'
           and role.lifecycle_state = 'active'
         group by policy.id, policy.role
         order by policy.role, policy.id`,
        [tenantId, userId, evaluatedAt],
      );
      const compatibility = await client.query<{ role: string; permissions: string[] }>(
        `select policy.role, policy.permissions
         from security_user_role_assignment assignment
         join security_role_policy policy
           on policy.tenant_id = assignment.tenant_id and policy.id = assignment.role_policy_id
         where assignment.tenant_id = $1 and assignment.user_id = $2
           and assignment.lifecycle_state = 'active'
           and assignment.valid_from <= $3
           and (assignment.valid_until is null or assignment.valid_until > $3)
           and policy.status = 'active'
           and policy.lifecycle_state = 'active'
         order by policy.role, policy.id`,
        [tenantId, userId, evaluatedAt],
      );

      const normalizedRoles = stable(normalized.rows.map((row) => row.role));
      const normalizedPermissions = stable(normalized.rows.flatMap((row) => row.permissions));
      const compatibilityRoles = stable(compatibility.rows.map((row) => row.role));
      const compatibilityPermissions = stable(compatibility.rows.flatMap((row) => row.permissions));
      if (
        !sameValues(normalizedRoles, compatibilityRoles) ||
        !sameValues(normalizedPermissions, compatibilityPermissions)
      ) {
        throw new Error("AUTHORIZATION_PARITY_MISMATCH");
      }
      await client.query("commit");
      return {
        tenantId: account.tenant_id,
        organizationName: account.organization_name,
        userId: account.id,
        email: account.email,
        displayName: account.display_name ?? account.email,
        roles: normalizedRoles,
        permissions: normalizedPermissions,
        sessionVersion: Number(account.session_version),
      };
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async upgradePasswordHash(input: {
    tenantId: string;
    userId: string;
    expectedEncodedHash: string;
    argon2Hash: string;
    updatedAt: Date;
  }): Promise<boolean> {
    const client = await this.pool.connect();
    try {
      await beginTenantTransaction(client, input.tenantId, false);
      const selected = await client.query<CredentialRow>(
        `select account.tenant_id, account.id as user_id, account.email, account.status,
                credential.iterations, credential.salt, credential.password_hash,
                credential.argon2_hash, credential.must_change_password,
                credential.password_version
         from security_user_account account
         join security_password_credential credential
           on credential.tenant_id = account.tenant_id and credential.user_id = account.id
         where account.tenant_id = $1 and account.id = $2
         for update of credential`,
        [input.tenantId, input.userId],
      );
      const row = selected.rows[0];
      const current = row ? encodeCredential(row) : null;
      if (!row || current !== input.expectedEncodedHash) {
        await client.query("rollback");
        return false;
      }
      const updated = await client.query(
        `update security_password_credential
         set argon2_hash = $3, argon2_updated_at = $4, updated_at = $4
         where tenant_id = $1 and user_id = $2`,
        [input.tenantId, input.userId, input.argon2Hash, input.updatedAt],
      );
      await client.query("commit");
      return updated.rowCount === 1;
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async loadSessionVersion(tenantId: string, userId: string): Promise<number | null> {
    const client = await this.pool.connect();
    try {
      await beginTenantTransaction(client, tenantId, true);
      const result = await client.query<{ session_version: number }>(
        `select session_version
           from security_user_account
          where tenant_id=$1 and id=$2 and status='active'`,
        [tenantId, userId],
      );
      await client.query("commit");
      const value = result.rows[0]?.session_version;
      return value ? Number(value) : null;
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async changeInitialPassword(input: {
    tenantId: string;
    userId: string;
    expectedPasswordVersion: number;
    newPassword: string;
    argon2Hash: string;
    correlationId: string;
    changedAt: Date;
  }): Promise<boolean> {
    const client = await this.pool.connect();
    try {
      await client.query("begin isolation level serializable");
      await client.query("select set_config('nexora.tenant_id', $1, true)", [input.tenantId]);
      const selected = await client.query<CredentialRow & { credential_status: string; account_status: string }>(
        `select account.tenant_id, account.id as user_id, account.email,
                account.status, account.status as account_status,
                credential.iterations, credential.salt, credential.password_hash,
                credential.argon2_hash, credential.must_change_password,
                credential.password_version, credential.credential_status
           from security_user_account account
           join security_password_credential credential
             on credential.tenant_id=account.tenant_id and credential.user_id=account.id
          where account.tenant_id=$1 and account.id=$2
          for update of account,credential`,
        [input.tenantId, input.userId],
      );
      const row = selected.rows[0];
      if (
        !row ||
        row.account_status !== "active" ||
        !row.must_change_password ||
        row.credential_status !== "reset_required" ||
        Number(row.password_version) !== input.expectedPasswordVersion ||
        (await verifyCompatiblePassword(encodeCredential(row), input.newPassword))
      ) {
        await client.query("rollback");
        return false;
      }
      const credential = await client.query(
        `update security_password_credential
            set algorithm=null, iterations=null, salt=null, password_hash=null,
                argon2_hash=$3, argon2_updated_at=$4,
                must_change_password=false, credential_status='active',
                password_version=password_version+1,
                password_changed_at=$4, updated_at=$4
          where tenant_id=$1 and user_id=$2 and password_version=$5`,
        [input.tenantId, input.userId, input.argon2Hash, input.changedAt, input.expectedPasswordVersion],
      );
      if (credential.rowCount !== 1) {
        await client.query("rollback");
        return false;
      }
      await client.query(
        `update security_user_account
            set session_version=session_version+1, updated_at=$3
          where tenant_id=$1 and id=$2`,
        [input.tenantId, input.userId, input.changedAt],
      );
      await client.query(
        `insert into security_authentication_event
          (id,tenant_id,user_id,correlation_id,event_type,occurred_at)
         values ($1,$2,$3,$4,'initial_password_changed',$5)`,
        [randomUUID(), input.tenantId, input.userId, input.correlationId, input.changedAt],
      );
      await client.query("commit");
      return true;
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async appendAuthenticationEvent(input: {
    tenantId: string;
    userId: string;
    correlationId: string;
    eventType:
      | "credential_verified"
      | "tenant_selection_required"
      | "tenant_selected"
      | "initial_password_changed"
      | "session_issued";
    occurredAt: Date;
  }): Promise<void> {
    const client = await this.pool.connect();
    try {
      await beginTenantTransaction(client, input.tenantId, false);
      await client.query(
        `insert into security_authentication_event
           (id,tenant_id,user_id,correlation_id,event_type,occurred_at)
         values ($1,$2,$3,$4,$5,$6)`,
        [randomUUID(), input.tenantId, input.userId, input.correlationId, input.eventType, input.occurredAt],
      );
      await client.query("commit");
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
}
