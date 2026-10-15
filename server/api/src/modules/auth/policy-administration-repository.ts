import { createHash, randomUUID } from "node:crypto";

import {
  PolicyService,
  type PolicyAdministrationActor,
  type PolicyAdministrationCommand,
  type PolicyAdministrationRepository,
  type PolicyAdministrationResult,
  type PolicyTargetScope,
} from "@nexora/auth";
import type { DatabasePool } from "@nexora/db";
import type { PoolClient } from "pg";

import { PostgresPolicySnapshotRepository } from "./policy-repository.js";

const policyMutationLockId = 4_894_133_722;

interface StoredCommandRow {
  actor_user_id: string;
  request_fingerprint: string;
  result: PolicyAdministrationResult;
}

interface VersionRow {
  id: string;
  version: string | number;
}

function canonicalize(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonicalize(child)]),
    );
  }
  return value;
}

function fingerprint(actor: PolicyAdministrationActor, command: PolicyAdministrationCommand): string {
  return createHash("sha256")
    .update(JSON.stringify(canonicalize({ actorUserId: actor.userId, command })))
    .digest("hex");
}

function permissionKey(operation: PolicyAdministrationCommand["operation"]): string {
  const [resource, action] = operation.split(".");
  return `security.${resource}.${action}`;
}

function requiredString(data: Readonly<Record<string, unknown>>, key: string): string {
  const value = data[key];
  if (typeof value !== "string" || value.length === 0) throw new Error("SECURITY_INVALID_COMMAND");
  return value;
}

function optionalString(data: Readonly<Record<string, unknown>>, key: string): string | null {
  const value = data[key];
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") throw new Error("SECURITY_INVALID_COMMAND");
  return value;
}

function requiredBoolean(data: Readonly<Record<string, unknown>>, key: string): boolean {
  const value = data[key];
  if (typeof value !== "boolean") throw new Error("SECURITY_INVALID_COMMAND");
  return value;
}

function requiredStringArray(data: Readonly<Record<string, unknown>>, key: string): string[] {
  const value = data[key];
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
    throw new Error("SECURITY_INVALID_COMMAND");
  }
  return [...new Set(value as string[])].sort();
}

function hasOwn(data: Readonly<Record<string, unknown>>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(data, key);
}

async function loadTargetScope(client: PoolClient, scopeId: string): Promise<PolicyTargetScope | null> {
  const result = await client.query<{
    id: string;
    scope_type: PolicyTargetScope["scopeType"];
    status: PolicyTargetScope["status"];
    enterprise_scope_id: string;
    company_scope_id: string | null;
    ancestor_scope_ids: string[];
  }>(
    `with recursive ancestors as (
       select id, parent_id from security_scope where id = $1
       union all
       select parent.id, parent.parent_id
       from security_scope parent join ancestors child on child.parent_id = parent.id
     )
     select scope.id, scope.scope_type, scope.status, scope.enterprise_scope_id, scope.company_scope_id,
            coalesce(array_agg(ancestors.id order by ancestors.id)
              filter (where ancestors.id <> scope.id), '{}') as ancestor_scope_ids
     from security_scope scope
     left join ancestors on true
     where scope.id = $1
     group by scope.id`,
    [scopeId],
  );
  const row = result.rows[0];
  return row
    ? {
        scopeId: row.id,
        scopeType: row.scope_type,
        status: row.status,
        enterpriseScopeId: row.enterprise_scope_id,
        companyScopeId: row.company_scope_id,
        ancestorScopeIds: row.ancestor_scope_ids,
      }
    : null;
}

async function expectVersion(
  client: PoolClient,
  table: "security_scope" | "security_role" | "security_role_assignment" | "security_sod_policy",
  entityId: string,
  expected: number | undefined,
): Promise<number> {
  if (expected === undefined) throw new Error("SECURITY_STALE_VERSION");
  const result = await client.query<VersionRow>(`select id, version from ${table} where id = $1 for update`, [
    entityId,
  ]);
  const version = Number(result.rows[0]?.version);
  if (!Number.isSafeInteger(version) || version !== expected) throw new Error("SECURITY_STALE_VERSION");
  return version;
}

async function mutate(
  client: PoolClient,
  actor: PolicyAdministrationActor,
  command: PolicyAdministrationCommand,
): Promise<{ entityId: string; version: number }> {
  const data = command.data;
  const suppliedId = command.entityId;
  switch (command.operation) {
    case "scope.create": {
      const entityId = suppliedId ?? randomUUID();
      await client.query(
        `insert into security_scope
          (id, scope_type, code, display_name, parent_id, enterprise_scope_id, company_scope_id,
           status, created_at, updated_at)
         values ($1, $2, $3, $4, $5, $1, null, 'active', $6, $6)`,
        [
          entityId,
          requiredString(data, "scopeType"),
          requiredString(data, "code"),
          requiredString(data, "displayName"),
          requiredString(data, "parentScopeId"),
          command.evaluatedAt,
        ],
      );
      return { entityId, version: 1 };
    }
    case "scope.edit": {
      const entityId = requiredString({ entityId: suppliedId }, "entityId");
      const version = await expectVersion(client, "security_scope", entityId, command.expectedVersion);
      const result = await client.query(
        `update security_scope set
           code = coalesce($2, code), display_name = coalesce($3, display_name),
           parent_id = coalesce($4, parent_id), version = version + 1, updated_at = $5
         where id = $1 and status = 'active'`,
        [
          entityId,
          optionalString(data, "code"),
          optionalString(data, "displayName"),
          optionalString(data, "parentScopeId"),
          command.evaluatedAt,
        ],
      );
      if (result.rowCount !== 1) throw new Error("SECURITY_INVALID_COMMAND");
      return { entityId, version: version + 1 };
    }
    case "scope.archive": {
      const entityId = requiredString({ entityId: suppliedId }, "entityId");
      const version = await expectVersion(client, "security_scope", entityId, command.expectedVersion);
      const result = await client.query(
        `update security_scope set status = 'archived', archived_at = $2,
                 version = version + 1, updated_at = $2
         where id = $1 and status = 'active'`,
        [entityId, command.evaluatedAt],
      );
      if (result.rowCount !== 1) throw new Error("SECURITY_INVALID_COMMAND");
      return { entityId, version: version + 1 };
    }
    case "role.create": {
      const entityId = suppliedId ?? randomUUID();
      await client.query(
        `insert into security_role
          (id, code, display_name, description, status, created_at, updated_at)
         values ($1, $2, $3, $4, 'active', $5, $5)`,
        [
          entityId,
          requiredString(data, "code"),
          requiredString(data, "displayName"),
          optionalString(data, "description") ?? "",
          command.evaluatedAt,
        ],
      );
      return { entityId, version: 1 };
    }
    case "role.edit": {
      const entityId = requiredString({ entityId: suppliedId }, "entityId");
      const version = await expectVersion(client, "security_role", entityId, command.expectedVersion);
      const result = await client.query(
        `update security_role set code = coalesce($2, code), display_name = coalesce($3, display_name),
                 description = coalesce($4, description), version = version + 1, updated_at = $5
         where id = $1 and status = 'active'`,
        [
          entityId,
          optionalString(data, "code"),
          optionalString(data, "displayName"),
          optionalString(data, "description"),
          command.evaluatedAt,
        ],
      );
      if (result.rowCount !== 1) throw new Error("SECURITY_INVALID_COMMAND");
      return { entityId, version: version + 1 };
    }
    case "role.archive": {
      const entityId = requiredString({ entityId: suppliedId }, "entityId");
      const version = await expectVersion(client, "security_role", entityId, command.expectedVersion);
      const result = await client.query(
        `update security_role set status = 'archived', archived_at = $2,
                 version = version + 1, updated_at = $2
         where id = $1 and status = 'active'`,
        [entityId, command.evaluatedAt],
      );
      if (result.rowCount !== 1) throw new Error("SECURITY_INVALID_COMMAND");
      return { entityId, version: version + 1 };
    }
    case "role_permission.edit": {
      const roleId = requiredString(data, "roleId");
      const version = await expectVersion(client, "security_role", roleId, command.expectedVersion);
      const permission = await client.query<{ id: string }>(
        "select id from security_permission where permission_key = $1 and status = 'active'",
        [requiredString(data, "permissionKey")],
      );
      const permissionId = permission.rows[0]?.id;
      if (!permissionId) throw new Error("SECURITY_INVALID_COMMAND");
      if (requiredBoolean(data, "granted")) {
        await client.query(
          `insert into security_role_permission (role_id, permission_id, granted_at, granted_by_user_id)
           values ($1, $2, $3, $4) on conflict do nothing`,
          [roleId, permissionId, command.evaluatedAt, actor.userId],
        );
      } else {
        await client.query("delete from security_field_grant where role_id = $1 and permission_id = $2", [
          roleId,
          permissionId,
        ]);
        await client.query("delete from security_role_permission where role_id = $1 and permission_id = $2", [
          roleId,
          permissionId,
        ]);
      }
      await client.query("update security_role set version = version + 1, updated_at = $2 where id = $1", [
        roleId,
        command.evaluatedAt,
      ]);
      return { entityId: roleId, version: version + 1 };
    }
    case "field_grant.edit": {
      const roleId = requiredString(data, "roleId");
      const version = await expectVersion(client, "security_role", roleId, command.expectedVersion);
      const permission = await client.query<{ id: string }>(
        `select permission.id from security_permission permission
         join security_role_permission role_permission on role_permission.permission_id = permission.id
         where role_permission.role_id = $1 and permission.permission_key = $2 and permission.status = 'active'`,
        [roleId, requiredString(data, "permissionKey")],
      );
      const permissionId = permission.rows[0]?.id;
      if (!permissionId) throw new Error("SECURITY_INVALID_COMMAND");
      const fields = requiredStringArray(data, "fields");
      await client.query("delete from security_field_grant where role_id = $1 and permission_id = $2", [
        roleId,
        permissionId,
      ]);
      for (const field of fields) {
        await client.query(
          `insert into security_field_grant
            (role_id, permission_id, field_path, granted_at, granted_by_user_id)
           values ($1, $2, $3, $4, $5)`,
          [roleId, permissionId, field, command.evaluatedAt, actor.userId],
        );
      }
      await client.query("update security_role set version = version + 1, updated_at = $2 where id = $1", [
        roleId,
        command.evaluatedAt,
      ]);
      return { entityId: roleId, version: version + 1 };
    }
    case "role_assignment.create": {
      const entityId = suppliedId ?? randomUUID();
      await client.query(
        `insert into security_role_assignment
          (id, user_id, role_id, status, valid_from, valid_until, assigned_by_user_id, created_at, updated_at)
         values ($1, $2, $3, 'active', $4, $5, $6, $7, $7)`,
        [
          entityId,
          requiredString(data, "userId"),
          requiredString(data, "roleId"),
          new Date(requiredString(data, "validFrom")),
          optionalString(data, "validUntil"),
          actor.userId,
          command.evaluatedAt,
        ],
      );
      const scopes = data.scopes;
      if (!Array.isArray(scopes) || scopes.length === 0) throw new Error("SECURITY_INVALID_COMMAND");
      for (const scope of scopes) {
        if (!scope || typeof scope !== "object") throw new Error("SECURITY_INVALID_COMMAND");
        const value = scope as Record<string, unknown>;
        await client.query(
          `insert into security_assignment_scope (assignment_id, scope_id, include_descendants)
           values ($1, $2, $3)`,
          [entityId, requiredString(value, "scopeId"), requiredBoolean(value, "includeDescendants")],
        );
      }
      return { entityId, version: 1 };
    }
    case "role_assignment.edit": {
      const entityId = requiredString({ entityId: suppliedId }, "entityId");
      const version = await expectVersion(client, "security_role_assignment", entityId, command.expectedVersion);
      const result = await client.query(
        `update security_role_assignment set role_id = coalesce($2, role_id),
                 valid_from = coalesce($3, valid_from),
                 valid_until = case when $4 then $5 else valid_until end,
                 version = version + 1, updated_at = $6
         where id = $1 and status = 'active'`,
        [
          entityId,
          optionalString(data, "roleId"),
          optionalString(data, "validFrom"),
          hasOwn(data, "validUntil"),
          optionalString(data, "validUntil"),
          command.evaluatedAt,
        ],
      );
      if (result.rowCount !== 1) throw new Error("SECURITY_INVALID_COMMAND");
      if (hasOwn(data, "scopes")) {
        const scopes = data.scopes;
        if (!Array.isArray(scopes) || scopes.length === 0) throw new Error("SECURITY_INVALID_COMMAND");
        await client.query("delete from security_assignment_scope where assignment_id = $1", [entityId]);
        for (const scope of scopes) {
          if (!scope || typeof scope !== "object") throw new Error("SECURITY_INVALID_COMMAND");
          const value = scope as Record<string, unknown>;
          await client.query(
            `insert into security_assignment_scope (assignment_id, scope_id, include_descendants)
             values ($1, $2, $3)`,
            [entityId, requiredString(value, "scopeId"), requiredBoolean(value, "includeDescendants")],
          );
        }
      }
      return { entityId, version: version + 1 };
    }
    case "role_assignment.archive": {
      const entityId = requiredString({ entityId: suppliedId }, "entityId");
      const version = await expectVersion(client, "security_role_assignment", entityId, command.expectedVersion);
      const result = await client.query(
        `update security_role_assignment set status = 'revoked', revoked_at = $2,
                 version = version + 1, updated_at = $2
         where id = $1 and status = 'active'`,
        [entityId, command.evaluatedAt],
      );
      if (result.rowCount !== 1) throw new Error("SECURITY_INVALID_COMMAND");
      return { entityId, version: version + 1 };
    }
    case "sod_policy.create": {
      const entityId = suppliedId ?? randomUUID();
      const kind = requiredString(data, "kind");
      const applicableSourceStates =
        kind === "assignment_conflict" ? [] : requiredStringArray(data, "applicableSourceStates");
      await client.query(
        `insert into security_sod_policy
          (id, code, display_name, policy_kind, first_role_id, second_role_id,
           protected_permission_id, actor_relation, applicable_source_states,
           status, created_at, updated_at)
         values ($1, $2, $3, $4, $5, $6,
           (select id from security_permission where permission_key = $7), $8, $9,
           'active', $10, $10)`,
        [
          entityId,
          requiredString(data, "code"),
          requiredString(data, "displayName"),
          kind,
          optionalString(data, "firstRoleId"),
          optionalString(data, "secondRoleId"),
          optionalString(data, "protectedPermissionKey"),
          optionalString(data, "actorRelation"),
          applicableSourceStates,
          command.evaluatedAt,
        ],
      );
      return { entityId, version: 1 };
    }
    case "sod_policy.edit": {
      const entityId = requiredString({ entityId: suppliedId }, "entityId");
      const version = await expectVersion(client, "security_sod_policy", entityId, command.expectedVersion);
      const kind = optionalString(data, "kind");
      const result = kind
        ? await client.query(
            `update security_sod_policy set code = coalesce($2, code),
                     display_name = coalesce($3, display_name), policy_kind = $4,
                     first_role_id = $5, second_role_id = $6,
                     protected_permission_id = (
                       select id from security_permission where permission_key = $7 and status = 'active'
                     ), actor_relation = $8, applicable_source_states = $9,
                     version = version + 1, updated_at = $10
             where id = $1 and status = 'active'`,
            [
              entityId,
              optionalString(data, "code"),
              optionalString(data, "displayName"),
              kind,
              optionalString(data, "firstRoleId"),
              optionalString(data, "secondRoleId"),
              optionalString(data, "protectedPermissionKey"),
              optionalString(data, "actorRelation"),
              kind === "assignment_conflict" ? [] : requiredStringArray(data, "applicableSourceStates"),
              command.evaluatedAt,
            ],
          )
        : await client.query(
            `update security_sod_policy set code = coalesce($2, code),
                     display_name = coalesce($3, display_name), version = version + 1, updated_at = $4
             where id = $1 and status = 'active'`,
            [entityId, optionalString(data, "code"), optionalString(data, "displayName"), command.evaluatedAt],
          );
      if (result.rowCount !== 1) throw new Error("SECURITY_INVALID_COMMAND");
      return { entityId, version: version + 1 };
    }
    case "sod_policy.archive": {
      const entityId = requiredString({ entityId: suppliedId }, "entityId");
      const version = await expectVersion(client, "security_sod_policy", entityId, command.expectedVersion);
      const result = await client.query(
        `update security_sod_policy set status = 'archived', archived_at = $2,
                 version = version + 1, updated_at = $2
         where id = $1 and status = 'active'`,
        [entityId, command.evaluatedAt],
      );
      if (result.rowCount !== 1) throw new Error("SECURITY_INVALID_COMMAND");
      return { entityId, version: version + 1 };
    }
  }
}

function safeFailure(commandId: string, error: unknown): PolicyAdministrationResult {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("SECURITY_STALE_VERSION")) return { ok: false, commandId, code: "stale_version" };
  if (
    message.includes("SECURITY_INVALID_COMMAND") ||
    message.includes("SECURITY_SCOPE_") ||
    message.includes("SECURITY_ASSIGNMENT_")
  ) {
    return { ok: false, commandId, code: "invalid_command" };
  }
  if (message.includes("duplicate key") || message.includes("SECURITY_LAST_ADMINISTRATOR_REQUIRED")) {
    return { ok: false, commandId, code: "conflict" };
  }
  throw error;
}

export class PostgresPolicyAdministrationRepository implements PolicyAdministrationRepository {
  private readonly policyService: PolicyService;

  constructor(private readonly pool: DatabasePool) {
    this.policyService = new PolicyService(new PostgresPolicySnapshotRepository(pool));
  }

  async executeAuthorized(
    actor: PolicyAdministrationActor,
    command: PolicyAdministrationCommand,
  ): Promise<PolicyAdministrationResult> {
    const client = await this.pool.connect();
    const requestFingerprint = fingerprint(actor, command);
    try {
      await client.query("begin");
      await client.query("select pg_advisory_xact_lock($1)", [policyMutationLockId]);

      const stored = await client.query<StoredCommandRow>(
        `select actor_user_id, request_fingerprint, result
         from security_policy_command where id = $1 for update`,
        [command.commandId],
      );
      const replay = stored.rows[0];
      if (replay) {
        await client.query("commit");
        if (replay.actor_user_id !== actor.userId || replay.request_fingerprint !== requestFingerprint) {
          return { ok: false, commandId: command.commandId, code: "conflict" };
        }
        return { ...replay.result, replayed: true } as PolicyAdministrationResult;
      }

      const targetScope = await loadTargetScope(client, command.targetScope.scopeId);
      if (!targetScope) {
        await client.query("rollback");
        return { ok: false, commandId: command.commandId, code: "permission_denied" };
      }
      const decision = await this.policyService.authorize(actor, {
        permissionKey: permissionKey(command.operation),
        targetScope,
        requestedFields: command.requestedFields,
        ...(command.operation.endsWith(".create") ? {} : { currentState: "active" }),
        evaluatedAt: command.evaluatedAt,
      });
      if (!decision.allowed) {
        await client.query("rollback");
        return {
          ok: false,
          commandId: command.commandId,
          code: decision.reason === "policy_unavailable" ? "policy_unavailable" : "permission_denied",
        };
      }

      const changed = await mutate(client, actor, command);
      const eventId = randomUUID();
      const result: PolicyAdministrationResult = {
        ok: true,
        commandId: command.commandId,
        entityId: changed.entityId,
        version: changed.version,
        replayed: false,
      };
      await client.query(
        `insert into security_policy_event
          (id, event_type, actor_user_id, session_id, entity_type, entity_id,
           occurred_at, after_summary, metadata)
         values ($1, $2, $3, $4, $5, $6, $7,
                 jsonb_build_object('version', $8::integer),
                 jsonb_build_object('commandId', $9::text))`,
        [
          eventId,
          `security.${command.operation}`,
          actor.userId,
          actor.sessionId,
          command.operation.split(".")[0],
          changed.entityId,
          command.evaluatedAt,
          changed.version,
          command.commandId,
        ],
      );
      await client.query(
        `insert into security_policy_command
          (id, actor_user_id, operation, request_fingerprint, result, event_id, created_at)
         values ($1, $2, $3, $4, $5, $6, $7)`,
        [
          command.commandId,
          actor.userId,
          command.operation,
          requestFingerprint,
          JSON.stringify(result),
          eventId,
          command.evaluatedAt,
        ],
      );
      await client.query("commit");
      return result;
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      return safeFailure(command.commandId, error);
    } finally {
      client.release();
    }
  }
}
