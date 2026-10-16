import { createHash, randomUUID } from "node:crypto";

import { hashPassword, loginIdentifierHmac } from "@nexora/auth";
import type { AuthenticatedAccount } from "@nexora/auth";
import type {
  CreateSecurityUserRequest,
  CreateSecurityAccessReviewCampaign,
  CreateSecurityDelegation,
  CreateSecurityImpersonation,
  CreateSecurityAssignmentRequest,
  CreateSecurityRoleRequest,
  SecurityAdministrationResult,
  SecurityAccessReviewCampaignAction,
  SecurityAccessReviewDecision,
  SecurityAccessReviewListQuery,
  SecurityDelegationAction,
  SecurityDelegationListQuery,
  SecurityImpersonationAction,
  SecurityImpersonationListQuery,
  SecurityApprovalAction,
  SecurityAssignmentRequestAction,
  SecurityPage,
  SecurityRoleActionRequest,
  SecurityUserAdministrationResult,
  SecurityUserDetail,
  SecurityUserEmergencyAction,
  SecurityUserListQuery,
  SecurityUserOptions,
  SecurityUserPage,
} from "@nexora/contracts";
import type { DatabasePool } from "@nexora/db";
import type { PoolClient } from "pg";

import {
  fieldsForUserRequest,
  generateOneTimePassword,
  permissionForUserRequest,
} from "./source-user-administration.js";

export class SecurityAdministrationError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export interface SecurityActorContext {
  tenantId: string;
  actor: AuthenticatedAccount;
  correlationId: string;
}

export interface SecurityListContext {
  workspace?: "users" | "roles";
  userId?: string;
  rolePolicyId?: string;
}

interface Mutation {
  entityType: string;
  entityId: string;
  before: unknown;
  after: unknown;
  approvalReference?: string | null;
  outcome?: "completed" | "rejected";
}

interface CommandRow {
  command_id: string;
  request_fingerprint: string;
  outcome: "pending" | "completed" | "rejected";
  result_projection: Record<string, unknown> | null;
  audit_event_id: string | null;
}

const roleFields = [
  "role_code",
  "display_name",
  "description",
  "permissions",
  "scope",
  "field_rules",
  "sod_rules",
  "allowed_source_states",
  "delegations",
] as const;
const assignmentFields = ["target_user_id", "role_policy_id", "valid_from", "valid_until"] as const;

function canonicalValue(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonicalValue(child)]),
    );
  }
  return value;
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalValue(value));
}

function stateHash(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value), "utf8").digest("hex");
}

function page(rows: readonly Record<string, unknown>[], limit: number, offset: number): SecurityPage {
  return {
    items: rows.slice(0, limit),
    next_cursor: rows.length > limit ? String(offset + limit) : null,
  };
}

function cleanRow(row: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [key, value instanceof Date ? value.toISOString() : value]),
  );
}

export class SourceSecurityAdministrationRepository {
  constructor(
    private readonly pool: DatabasePool,
    private readonly loginDirectorySecret?: string,
  ) {}

  async listPermissions(context: SecurityActorContext): Promise<SecurityPage> {
    return this.read(context, "security.authorization.permission.read", async (client) => {
      const result = await client.query(
        `select permission_key, module, resource, action, description, required_assurance,
                field_context_required, source_state_context_required, sensitivity
         from security_permission_definition where status = 'active' order by permission_key`,
      );
      // This catalogue endpoint has no cursor input. Return the complete result,
      // not a first page whose continuation clients cannot request.
      return { items: result.rows.map(cleanRow), next_cursor: null };
    });
  }

  async listCapabilities(context: SecurityActorContext): Promise<SecurityPage> {
    return this.read(context, "security.authorization.permission.read", async (client) => {
      const result = await client.query(
        `select distinct permission_grant.permission_key, definition.required_assurance,
                definition.field_context_required, definition.source_state_context_required,
                definition.sensitivity
         from security_user_role_assignment_version assignment
         join security_role_policy policy on policy.tenant_id = assignment.tenant_id and policy.id = assignment.role_policy_id
         join security_tenant_role role on role.tenant_id = policy.tenant_id and role.role_id = policy.role_id
         join security_role_permission_grant permission_grant on permission_grant.tenant_id = policy.tenant_id and permission_grant.role_policy_id = policy.id
         join security_permission_definition definition on definition.permission_key = permission_grant.permission_key and definition.status = 'active'
         where assignment.tenant_id = $1 and assignment.user_id = $2
           and assignment.version = (select max(latest.version) from security_user_role_assignment_version latest where latest.tenant_id = assignment.tenant_id and latest.assignment_id = assignment.assignment_id)
           and assignment.lifecycle_state = 'active' and assignment.valid_from <= now()
           and (assignment.valid_until is null or assignment.valid_until > now())
           and policy.status = 'active' and policy.lifecycle_state = 'active' and role.lifecycle_state = 'active'
           and permission_grant.permission_key like 'security.authorization.%'
         order by permission_grant.permission_key`,
        [context.tenantId, context.actor.userId],
      );
      return page(
        result.rows.map((row) => ({ ...cleanRow(row), assurance_satisfied: true })),
        100,
        0,
      );
    });
  }

  async listRoles(
    context: SecurityActorContext,
    offset: number,
    limit: number,
    lifecycle?: string,
  ): Promise<SecurityPage> {
    return this.read(context, "security.authorization.role.read", async (client) => {
      const parameters: unknown[] = [context.tenantId];
      const state = lifecycle ? `and policy.lifecycle_state = $${parameters.push(lifecycle)}` : "";
      parameters.push(limit + 1, offset);
      const result = await client.query(
        `select policy.id as policy_id, policy.role_id, policy.role as role_code,
                coalesce(role.display_name, policy.role) as display_name,
                coalesce(role.description, '') as description, policy.scope, policy.permissions,
                policy.field_rules, policy.sod_rules, policy.version, policy.status,
                policy.lifecycle_state, policy.row_version, policy.supersedes_policy_id,
                coalesce((select jsonb_object_agg(states.permission_key, states.allowed_states)
                  from (select permission_key, jsonb_agg(source_state order by source_state) as allowed_states
                    from security_role_source_state
                    where tenant_id=policy.tenant_id and role_policy_id=policy.id
                    group by permission_key) states), '{}'::jsonb) as allowed_source_states,
                coalesce((select jsonb_agg(jsonb_build_object('permission',permission_key,
                    'scope_kind',scope_kind,'scope_value',scope_value)
                    order by permission_key,scope_kind,scope_value)
                  from security_role_permission_delegation
                  where tenant_id=policy.tenant_id and role_policy_id=policy.id), '[]'::jsonb) as delegations,
                policy.created_by, policy.submitted_by, policy.submitted_at,
                policy.approved_by, policy.approved_at, policy.activated_by,
                policy.activated_at, policy.archived_by, policy.archived_at, policy.created_at
         from security_role_policy policy
         left join security_tenant_role role on role.tenant_id = policy.tenant_id and role.role_id = policy.role_id
         where policy.tenant_id = $1 ${state}
         order by policy.created_at desc, policy.id desc
         limit $${parameters.length - 1} offset $${parameters.length}`,
        parameters,
      );
      return page(result.rows.map(cleanRow), limit, offset);
    });
  }

  async listAssignments(
    context: SecurityActorContext,
    offset: number,
    limit: number,
    lifecycle?: string,
    userId?: string,
    rolePolicyId?: string,
  ): Promise<SecurityPage> {
    return this.read(context, "security.authorization.assignment.read", async (client) => {
      const parameters: unknown[] = [context.tenantId];
      const conditions = ["assignment.tenant_id = $1"];
      if (lifecycle) conditions.push(`assignment.lifecycle_state = $${parameters.push(lifecycle)}`);
      if (userId) conditions.push(`assignment.user_id = $${parameters.push(userId)}`);
      if (rolePolicyId) conditions.push(`assignment.role_policy_id = $${parameters.push(rolePolicyId)}`);
      parameters.push(limit + 1, offset);
      const result = await client.query(
        `select assignment.assignment_id, assignment.user_id, assignment.role_policy_id,
                policy.role_id, policy.role as role_code, assignment.lifecycle_state,
                assignment.valid_from, assignment.valid_until, assignment.assigned_by,
                assignment.assigned_at, assignment.row_version, assignment.revoked_by,
                assignment.revoked_at, assignment.revocation_reason
         from security_user_role_assignment assignment
         join security_role_policy policy on policy.tenant_id = assignment.tenant_id and policy.id = assignment.role_policy_id
         where ${conditions.join(" and ")}
         order by assignment.assigned_at desc, assignment.assignment_id
         limit $${parameters.length - 1} offset $${parameters.length}`,
        parameters,
      );
      return page(result.rows.map(cleanRow), limit, offset);
    });
  }

  async listApprovals(
    context: SecurityActorContext,
    resourceType: "role" | "assignment" | "user",
    offset: number,
    limit: number,
    state?: string,
    filter: SecurityListContext = {},
  ): Promise<SecurityPage> {
    const permission =
      resourceType === "user" ? "security.user_account.approve" : `security.authorization.${resourceType}.approve`;
    return this.read(context, permission, async (client) => {
      const parameters: unknown[] = [context.tenantId];
      const conditions = ["tenant_id = $1"];
      if (state) conditions.push(`request_state = $${parameters.push(state)}`);
      if (filter.userId) {
        if (resourceType === "role") conditions.push("false");
        else {
          const parameter = parameters.push(filter.userId);
          conditions.push(
            resourceType === "user"
              ? `(target_user_id = $${parameter} or applied_user_id = $${parameter})`
              : `target_user_id = $${parameter}`,
          );
        }
      }
      if (filter.rolePolicyId) {
        conditions.push(
          resourceType === "user" ? "false" : `role_policy_id = $${parameters.push(filter.rolePolicyId)}`,
        );
      }
      parameters.push(limit + 1, offset);
      const table =
        resourceType === "role"
          ? "security_role_approval_request"
          : resourceType === "assignment"
            ? "security_assignment_approval_request"
            : "security_user_change_request";
      const result = await client.query(
        `select *, $${parameters.push(resourceType)}::text as resource_type from ${table}
         where ${conditions.join(" and ")}
         order by requested_at desc, request_id
         limit $${parameters.length - 2} offset $${parameters.length - 1}`,
        parameters,
      );
      return page(result.rows.map(cleanRow), limit, offset);
    });
  }

  async listAudit(
    context: SecurityActorContext,
    offset: number,
    limit: number,
    entityType?: string,
    entityId?: string,
    filter: SecurityListContext = {},
  ): Promise<SecurityPage> {
    return this.read(context, "security.authorization.audit.read", async (client) => {
      const parameters: unknown[] = [context.tenantId];
      const conditions = ["event.tenant_id = $1", "source_reference = 'governed_authorization_administration'"];
      if (entityType) conditions.push(`entity_type = $${parameters.push(entityType)}`);
      if (entityId) conditions.push(`entity_id = $${parameters.push(entityId)}`);
      if (filter.workspace) {
        conditions.push(
          filter.workspace === "users"
            ? "entity_type in ('user_account','user_change_request','assignment_approval','role_assignment')"
            : "entity_type in ('role_policy','role_approval','assignment_approval','role_assignment')",
        );
      }
      if (filter.userId) {
        const parameter = parameters.push(filter.userId);
        conditions.push(`(
          (entity_type='user_account' and entity_id=$${parameter})
          or (entity_type='user_change_request' and exists (
            select 1 from security_user_change_request request where request.tenant_id=event.tenant_id
            and request.request_id=event.entity_id and (request.target_user_id=$${parameter} or request.applied_user_id=$${parameter})))
          or (entity_type='assignment_approval' and exists (
            select 1 from security_assignment_approval_request request where request.tenant_id=event.tenant_id
            and request.request_id=event.entity_id and request.target_user_id=$${parameter}))
          or (entity_type='role_assignment' and exists (
            select 1 from security_user_role_assignment assignment where assignment.tenant_id=event.tenant_id
            and assignment.assignment_id=event.entity_id and assignment.user_id=$${parameter})))`);
      }
      if (filter.rolePolicyId) {
        const parameter = parameters.push(filter.rolePolicyId);
        conditions.push(`(
          (entity_type='role_policy' and entity_id=$${parameter})
          or (entity_type='role_approval' and exists (
            select 1 from security_role_approval_request request where request.tenant_id=event.tenant_id
            and request.request_id=event.entity_id and request.role_policy_id=$${parameter}))
          or (entity_type='assignment_approval' and exists (
            select 1 from security_assignment_approval_request request where request.tenant_id=event.tenant_id
            and request.request_id=event.entity_id and request.role_policy_id=$${parameter}))
          or (entity_type='role_assignment' and exists (
            select 1 from security_user_role_assignment assignment where assignment.tenant_id=event.tenant_id
            and assignment.assignment_id=event.entity_id and assignment.role_policy_id=$${parameter})))`);
      }
      parameters.push(limit + 1, offset);
      const result = await client.query(
        `select id, actor_id, correlation_id, action, entity_type, entity_id,
                source_reference, approval_reference, occurred_at, sequence
         from security_audit_event event where ${conditions.join(" and ")}
         order by occurred_at desc, id desc limit $${parameters.length - 1} offset $${parameters.length}`,
        parameters,
      );
      return page(result.rows.map(cleanRow), limit, offset);
    });
  }

  async listUsers(context: SecurityActorContext, query: SecurityUserListQuery): Promise<SecurityUserPage> {
    return this.read(context, "security.user_account.read", async (client, fullAdmin) => {
      const offset = query.cursor ? Number.parseInt(query.cursor, 10) : 0;
      if (!Number.isSafeInteger(offset) || offset < 0) throw this.conflict("The user cursor is invalid.");
      const parameters: unknown[] = [context.tenantId];
      const conditions = ["account.tenant_id=$1"];
      if (!fullAdmin) {
        const actorIdParameter = parameters.push(context.actor.userId);
        conditions.push(
          `exists (select 1 from security_user_company_access target_access
                    where target_access.tenant_id=account.tenant_id
                      and target_access.user_id=account.id)
           and not exists (
             select 1 from security_user_company_access target_access
              where target_access.tenant_id=account.tenant_id
                and target_access.user_id=account.id
                and (target_access.revoked_at is null or not exists (
                  select 1 from security_user_company_access active_access
                   where active_access.tenant_id=account.tenant_id
                     and active_access.user_id=account.id and active_access.revoked_at is null))
                and not exists (
                  select 1 from security_user_company_access actor_access
                   where actor_access.tenant_id=target_access.tenant_id
                     and actor_access.user_id=$${actorIdParameter}
                     and actor_access.company_id=target_access.company_id
                     and actor_access.revoked_at is null))`,
        );
      }
      if (query.search) {
        parameters.push(`%${query.search.toLocaleLowerCase("en-US")}%`);
        conditions.push(
          `(lower(coalesce(account.display_name,'')) like $${parameters.length}
            or lower(account.email) like $${parameters.length}
            or lower(credential.username) like $${parameters.length})`,
        );
      }
      if (query.status) conditions.push(`account.status=$${parameters.push(query.status)}`);
      if (query.archived !== undefined) {
        conditions.push(`account.archived_at is ${query.archived ? "not " : ""}null`);
      }
      if (query.company_id) {
        conditions.push(
          `exists (select 1 from security_user_company_access access
                    where access.tenant_id=account.tenant_id and access.user_id=account.id
                      and access.company_id=$${parameters.push(query.company_id)} and access.revoked_at is null)`,
        );
      }
      if (query.role_policy_id) {
        conditions.push(
          `exists (select 1 from security_user_role_assignment assignment_filter
                    where assignment_filter.tenant_id=account.tenant_id
                      and assignment_filter.user_id=account.id
                      and assignment_filter.role_policy_id=$${parameters.push(query.role_policy_id)}
                      and assignment_filter.lifecycle_state='active'
                      and assignment_filter.valid_from<=now()
                      and (assignment_filter.valid_until is null or assignment_filter.valid_until>now()))`,
        );
      }
      if (query.employee_linked !== undefined) {
        conditions.push(
          `${query.employee_linked ? "" : "not "}exists (
             select 1 from employee_user_binding binding_filter
              where binding_filter.tenant_id=account.tenant_id and binding_filter.user_id=account.id
                and binding_filter.effective_from<=current_date
                and (binding_filter.effective_to is null or binding_filter.effective_to>=current_date))`,
        );
      }
      parameters.push(query.limit + 1, offset);
      const result = await client.query<Record<string, unknown>>(
        `select account.id,coalesce(account.display_name,account.email) as display_name,
                credential.username,account.email,account.status,account.row_version,account.updated_at,account.archived_at,
                (select jsonb_build_object('id',company.id,'name',company.name,'is_default',true)
                   from security_user_company_access access
                   join organization_unit company
                     on company.tenant_id=access.tenant_id and company.id=access.company_id
                  where access.tenant_id=account.tenant_id and access.user_id=account.id
                    and access.revoked_at is null and access.is_default limit 1) as default_company,
                coalesce((select array_agg(distinct role.display_name order by role.display_name)
                   from security_user_role_assignment assignment
                   join security_role_policy policy
                     on policy.tenant_id=assignment.tenant_id and policy.id=assignment.role_policy_id
                   join security_tenant_role role
                     on role.tenant_id=policy.tenant_id and role.role_id=policy.role_id
                  where assignment.tenant_id=account.tenant_id and assignment.user_id=account.id
                    and assignment.lifecycle_state='active' and assignment.valid_from<=now()
                    and (assignment.valid_until is null or assignment.valid_until>now())), '{}') as role_names,
                exists (select 1 from employee_user_binding binding
                  where binding.tenant_id=account.tenant_id and binding.user_id=account.id
                    and binding.effective_from<=current_date
                    and (binding.effective_to is null or binding.effective_to>=current_date)) as employee_linked,
                (select count(*)::int from security_user_change_request request
                  where request.tenant_id=account.tenant_id
                    and (request.target_user_id=account.id or request.applied_user_id=account.id)
                    and request.request_state in ('draft','submitted')) as pending_request_count
           from security_user_account account
           join security_password_credential credential
             on credential.tenant_id=account.tenant_id and credential.user_id=account.id
          where ${conditions.join(" and ")}
          order by lower(coalesce(account.display_name,account.email)),account.id
          limit $${parameters.length - 1} offset $${parameters.length}`,
        parameters,
      );
      const items = result.rows.slice(0, query.limit).map((row) => ({
        id: String(row.id),
        display_name: String(row.display_name),
        username: String(row.username),
        email: String(row.email),
        status: row.status as "active" | "inactive" | "locked",
        row_version: Number(row.row_version),
        default_company: (row.default_company as SecurityUserDetail["default_company"]) ?? null,
        role_names: row.role_names as string[],
        employee_linked: Boolean(row.employee_linked),
        pending_request_count: Number(row.pending_request_count),
        updated_at: new Date(row.updated_at as string | Date).toISOString(),
        archived_at: row.archived_at ? new Date(row.archived_at as string | Date).toISOString() : null,
      }));
      return {
        items,
        next_cursor: result.rows.length > query.limit ? String(offset + query.limit) : null,
      };
    });
  }

  async getUser(context: SecurityActorContext, userId: string): Promise<SecurityUserDetail> {
    return this.read(context, "security.user_account.read", async (client, fullAdmin) => {
      if (!fullAdmin) await this.requireUserCompanyBoundary(client, context, userId);
      const pageResult = await this.listUserRows(client, context.tenantId, userId);
      const account = pageResult.account;
      if (!account) throw new SecurityAdministrationError(404, "USER_NOT_FOUND", "The user was not found.");
      return {
        ...account,
        companies: pageResult.companies,
        roles: pageResult.roles,
        employee: pageResult.employee,
        must_change_password: pageResult.mustChangePassword,
      };
    });
  }

  async listUserOptions(context: SecurityActorContext): Promise<SecurityUserOptions> {
    return this.read(context, "security.user_account.read", async (client, fullAdmin) => {
      const [companies, employees, roles] = await Promise.all([
        client.query<{ id: string; code: string; name: string }>(
          `select company.id,company.code,company.name from organization_unit company
            where company.tenant_id=$1 and company.type='company' and company.status='active'
              and ($2::boolean or exists (
                select 1 from security_user_company_access access
                 where access.tenant_id=company.tenant_id and access.user_id=$3
                   and access.company_id=company.id and access.revoked_at is null))
            order by company.name,company.id`,
          [context.tenantId, fullAdmin, context.actor.userId],
        ),
        client.query<{ id: string; employee_number: string; display_name: string }>(
          `select employee.id,employee.employee_number,
                  concat_ws(' ',employee.first_name,employee.middle_name,employee.last_name) as display_name
             from employee
            where employee.tenant_id=$1
              and exists (
                select 1 from employee_assignment assignment
                 where assignment.tenant_id=employee.tenant_id and assignment.employee_id=employee.id
                   and assignment.effective_from<=current_date
                   and (assignment.effective_to is null or assignment.effective_to>=current_date)
                   and ($2::boolean or exists (
                     select 1 from security_user_company_access actor_access
                      where actor_access.tenant_id=assignment.tenant_id
                        and actor_access.user_id=$3 and actor_access.company_id=assignment.company_id
                        and actor_access.revoked_at is null)))
              and not exists (select 1 from employee_user_binding binding
                where binding.tenant_id=employee.tenant_id and binding.employee_id=employee.id
                  and binding.effective_from<=current_date
                  and (binding.effective_to is null or binding.effective_to>=current_date))
            order by employee.employee_number,employee.id`,
          [context.tenantId, fullAdmin, context.actor.userId],
        ),
        client.query<{ policy_id: string; role_code: string; display_name: string }>(
          `select policy.id as policy_id,policy.role as role_code,role.display_name
             from security_role_policy policy
             join security_tenant_role role
               on role.tenant_id=policy.tenant_id and role.role_id=policy.role_id
            where policy.tenant_id=$1 and policy.status='active'
              and policy.lifecycle_state='active' and role.lifecycle_state='active'
            order by role.display_name,policy.id`,
          [context.tenantId],
        ),
      ]);
      const visibleRoles = fullAdmin ? roles.rows : await this.filterDelegableRoles(client, context, roles.rows);
      return { companies: companies.rows, employees: employees.rows, roles: visibleRoles };
    });
  }

  createUserRequest(
    context: SecurityActorContext,
    request: CreateSecurityUserRequest,
    key: string,
  ): Promise<SecurityAdministrationResult> {
    return this.run(
      context,
      permissionForUserRequest(request.requested_action),
      key,
      request,
      fieldsForUserRequest(request.requested_action),
      async (client, _commandId, fullAdmin) => {
        await this.validateUserRequest(client, context, request, fullAdmin);
        const requestId = `user-request-${randomUUID()}`;
        const targetUserId = request.requested_action === "create" ? null : request.target_user_id;
        await client.query(
          `insert into security_user_change_request
            (tenant_id,request_id,target_user_id,requested_action,proposed_user,
             request_state,requested_by,source_reference)
           values ($1,$2,$3,$4,$5,'draft',$6,$7)`,
          [
            context.tenantId,
            requestId,
            targetUserId,
            request.requested_action,
            JSON.stringify(request),
            context.actor.userId,
            `governed-user-administration:${context.correlationId}`,
          ],
        );
        const after = await this.userRequestState(client, context.tenantId, requestId);
        return {
          entityType: "user_change_request",
          entityId: requestId,
          before: null,
          after,
          approvalReference: requestId,
        };
      },
    );
  }

  actOnUserRequest(
    context: SecurityActorContext,
    action: import("@nexora/contracts").SecurityUserRequestAction,
    key: string,
  ): Promise<SecurityAdministrationResult> {
    return this.run(
      context,
      action.action === "update" ? "security.user_account.edit" : "security.user_account.submit",
      key,
      action,
      action.action === "update" ? fieldsForUserRequest(action.request.requested_action) : [],
      async (client, _commandId, fullAdmin) => {
        const current = await this.lockUserRequest(client, context.tenantId, action.request_id);
        if (
          current.request_state !== "draft" ||
          current.requested_by !== context.actor.userId ||
          Number(current.row_version) !== action.expected_version
        ) {
          throw this.conflict("The user request draft state, maker, or version has changed.");
        }
        const before = cleanRow(current);
        if (action.action === "update") {
          const expectedTarget = action.request.requested_action === "create" ? null : action.request.target_user_id;
          if (
            action.request.requested_action !== current.requested_action ||
            expectedTarget !== current.target_user_id
          ) {
            throw this.conflict("The user request identity cannot be changed.");
          }
          await this.validateUserRequest(client, context, action.request, fullAdmin);
          await client.query(
            `update security_user_change_request
                set proposed_user=$3,row_version=row_version+1
              where tenant_id=$1 and request_id=$2`,
            [context.tenantId, action.request_id, JSON.stringify(action.request)],
          );
        } else {
          const request = current.proposed_user as CreateSecurityUserRequest;
          await this.validateUserRequest(client, context, request, fullAdmin);
          await client.query(
            `update security_user_change_request
                set request_state='submitted',submitted_by=$3,submitted_at=now(),
                    row_version=row_version+1
              where tenant_id=$1 and request_id=$2`,
            [context.tenantId, action.request_id, context.actor.userId],
          );
        }
        return {
          entityType: "user_change_request",
          entityId: action.request_id,
          before,
          after: await this.userRequestState(client, context.tenantId, action.request_id),
          approvalReference: action.request_id,
        };
      },
    );
  }

  async actOnUserEmergency(
    context: SecurityActorContext,
    action: SecurityUserEmergencyAction,
    key: string,
  ): Promise<SecurityUserAdministrationResult> {
    const permission =
      action.action === "lock" ? "security.user_account.lock" : "security.user_account.revoke_sessions";
    const result = await this.run(context, permission, key, action, [], async (client, _commandId, fullAdmin) => {
      if (!fullAdmin) await this.requireUserCompanyBoundary(client, context, action.target_user_id);
      const current = await this.lockUser(client, context.tenantId, action.target_user_id);
      if (Number(current.row_version) !== action.expected_user_version) {
        throw this.conflict("The user account version has changed.");
      }
      const before = cleanRow(current);
      if (action.action === "lock") {
        if (current.status !== "active") throw this.conflict("Only an active user can be locked.");
        await client.query(
          `update security_user_account
              set status='locked',session_version=session_version+1,
                  row_version=row_version+1,updated_at=now()
            where tenant_id=$1 and id=$2`,
          [context.tenantId, action.target_user_id],
        );
        await this.requireLastAdministrator(client, context.tenantId);
      } else {
        await client.query(
          `update security_user_account
              set session_version=session_version+1,row_version=row_version+1,updated_at=now()
            where tenant_id=$1 and id=$2`,
          [context.tenantId, action.target_user_id],
        );
      }
      return {
        entityType: "user_account",
        entityId: action.target_user_id,
        before,
        after: cleanRow(await this.lockUser(client, context.tenantId, action.target_user_id)),
      };
    });
    return {
      ...result,
      entity_type: "user_account",
      credential_delivery_available: false,
    };
  }

  createRole(
    context: SecurityActorContext,
    draft: CreateSecurityRoleRequest,
    key: string,
  ): Promise<SecurityAdministrationResult> {
    return this.run(
      context,
      "security.authorization.role.create",
      key,
      draft,
      roleFields,
      async (client, commandId, fullAdmin) => {
        await this.validateRoleDraft(client, context, draft, fullAdmin);
        const roleId = `role-${randomUUID()}`;
        const policyId = `policy-${randomUUID()}`;
        await client.query(
          `insert into security_tenant_role
          (tenant_id, role_id, role_code, display_name, description, lifecycle_state, created_by, source_kind)
         values ($1,$2,$3,$4,$5,'active',$6,'governed')`,
          [context.tenantId, roleId, draft.role_code, draft.display_name, draft.description, context.actor.userId],
        );
        await client.query(
          `insert into security_role_policy
          (id, tenant_id, role, scope, permissions, field_rules, sod_rules, version, status,
           role_id, lifecycle_state, created_by, created_at)
         values ($1,$2,$3,$4,$5,$6,$7,1,'inactive',$8,'draft',$9,now())`,
          [
            policyId,
            context.tenantId,
            draft.role_code,
            JSON.stringify(draft.scope),
            JSON.stringify(draft.permissions),
            JSON.stringify(draft.field_rules),
            JSON.stringify(draft.sod_rules),
            roleId,
            context.actor.userId,
          ],
        );
        await this.writeRoleProjection(client, context.tenantId, policyId, draft);
        const after = await this.roleState(client, context.tenantId, policyId);
        return { entityType: "role_policy", entityId: policyId, before: null, after };
      },
    );
  }

  actOnRole(
    context: SecurityActorContext,
    action: SecurityRoleActionRequest,
    key: string,
  ): Promise<SecurityAdministrationResult> {
    const permission =
      action.action === "edit"
        ? "edit"
        : action.action === "submit"
          ? "submit"
          : action.action === "request_activate"
            ? "activate"
            : "archive";
    return this.run(
      context,
      `security.authorization.role.${permission}`,
      key,
      action,
      action.action === "edit" ? roleFields : [],
      async (client, _commandId, fullAdmin) => {
        const current = await this.lockRole(client, context.tenantId, action.policy_id);
        if (Number(current.row_version) !== action.expected_version) throw this.conflict("Role version has changed.");
        const before = await this.roleState(client, context.tenantId, action.policy_id);
        if (action.action === "edit") {
          if (
            current.lifecycle_state !== "draft" ||
            current.role_id !== action.role_id ||
            current.role !== action.draft.role_code
          )
            throw this.conflict("Only the current role draft can be edited.");
          await this.validateRoleDraft(client, context, action.draft, fullAdmin);
          await client.query(
            `update security_role_policy set scope=$3, permissions=$4, field_rules=$5, sod_rules=$6, row_version=row_version+1
           where tenant_id=$1 and id=$2`,
            [
              context.tenantId,
              action.policy_id,
              JSON.stringify(action.draft.scope),
              JSON.stringify(action.draft.permissions),
              JSON.stringify(action.draft.field_rules),
              JSON.stringify(action.draft.sod_rules),
            ],
          );
          await this.clearRoleProjection(client, context.tenantId, action.policy_id);
          await this.writeRoleProjection(client, context.tenantId, action.policy_id, action.draft);
          return {
            entityType: "role_policy",
            entityId: action.policy_id,
            before,
            after: await this.roleState(client, context.tenantId, action.policy_id),
          };
        }
        if (action.action === "submit") {
          if (current.lifecycle_state !== "draft") throw this.conflict("Only role drafts can be submitted.");
          const requestId = `role-approval-${randomUUID()}`;
          await client.query(
            `update security_role_policy set lifecycle_state='submitted', submitted_by=$3, submitted_at=now(), row_version=row_version+1 where tenant_id=$1 and id=$2`,
            [context.tenantId, action.policy_id, context.actor.userId],
          );
          await client.query(
            `insert into security_role_approval_request (tenant_id,request_id,role_policy_id,requested_action,request_state,requested_by) values ($1,$2,$3,'approve','pending',$4)`,
            [context.tenantId, requestId, action.policy_id, context.actor.userId],
          );
          return {
            entityType: "role_policy",
            entityId: action.policy_id,
            before,
            after: await this.roleState(client, context.tenantId, action.policy_id),
            approvalReference: requestId,
          };
        }
        const requestedAction = action.action === "request_activate" ? "activate" : "archive";
        const expectedState = requestedAction === "activate" ? "approved" : "active";
        if (current.lifecycle_state !== expectedState)
          throw this.conflict(`Only ${expectedState} roles can request ${requestedAction}.`);
        const requestId = `role-approval-${randomUUID()}`;
        await client.query(
          `insert into security_role_approval_request (tenant_id,request_id,role_policy_id,requested_action,request_state,requested_by) values ($1,$2,$3,$4,'pending',$5)`,
          [context.tenantId, requestId, action.policy_id, requestedAction, context.actor.userId],
        );
        return {
          entityType: "role_approval",
          entityId: requestId,
          before: null,
          after: await this.roleState(client, context.tenantId, action.policy_id),
          approvalReference: requestId,
        };
      },
    );
  }

  createAssignmentRequest(
    context: SecurityActorContext,
    request: CreateSecurityAssignmentRequest,
    key: string,
  ): Promise<SecurityAdministrationResult> {
    return this.run(
      context,
      `security.authorization.assignment.${request.requested_action}`,
      key,
      request,
      request.requested_action === "revoke" ? [] : assignmentFields,
      async (client, _commandId, fullAdmin) => {
        const proposal = request.proposal;
        if (request.requested_action !== "revoke" && proposal.target_user_id === context.actor.userId)
          throw new SecurityAdministrationError(
            403,
            "MAKER_CHECKER_VIOLATION",
            "Self-grant requests are not permitted.",
          );
        await this.validateAssignment(client, context, request.requested_action, proposal, fullAdmin);
        const requestId = `assignment-approval-${randomUUID()}`;
        await client.query(
          `insert into security_assignment_approval_request
          (tenant_id,request_id,assignment_id,target_user_id,role_policy_id,requested_action,proposed_assignment,request_state,requested_by)
         values ($1,$2,$3,$4,$5,$6,$7,'draft',$8)`,
          [
            context.tenantId,
            requestId,
            proposal.assignment_id,
            proposal.target_user_id,
            proposal.role_policy_id,
            request.requested_action,
            JSON.stringify(proposal),
            context.actor.userId,
          ],
        );
        const after = await this.assignmentRequestState(client, context.tenantId, requestId);
        return {
          entityType: "assignment_approval",
          entityId: requestId,
          before: null,
          after,
          approvalReference: requestId,
        };
      },
    );
  }

  actOnAssignmentRequest(
    context: SecurityActorContext,
    action: SecurityAssignmentRequestAction,
    key: string,
  ): Promise<SecurityAdministrationResult> {
    const permission = action.action === "update" ? "edit" : "submit";
    return this.run(
      context,
      `security.authorization.assignment.${permission}`,
      key,
      action,
      action.action === "update" ? assignmentFields : [],
      async (client, _commandId, fullAdmin) => {
        const current = await this.lockAssignmentRequest(client, context.tenantId, action.request_id);
        if (
          current.request_state !== "draft" ||
          current.requested_by !== context.actor.userId ||
          Number(current.row_version) !== action.expected_version
        )
          throw this.conflict("Assignment draft state, maker, or version has changed.");
        const before = cleanRow(current);
        if (action.action === "update") {
          await this.validateAssignment(
            client,
            context,
            current.requested_action as "create" | "edit" | "revoke",
            action.proposal,
            fullAdmin,
          );
          await client.query(
            `update security_assignment_approval_request set assignment_id=$3,target_user_id=$4,role_policy_id=$5,proposed_assignment=$6,row_version=row_version+1 where tenant_id=$1 and request_id=$2`,
            [
              context.tenantId,
              action.request_id,
              action.proposal.assignment_id,
              action.proposal.target_user_id,
              action.proposal.role_policy_id,
              JSON.stringify(action.proposal),
            ],
          );
        } else {
          await client.query(
            `update security_assignment_approval_request set request_state='submitted',submitted_by=$3,submitted_at=now(),row_version=row_version+1 where tenant_id=$1 and request_id=$2`,
            [context.tenantId, action.request_id, context.actor.userId],
          );
        }
        return {
          entityType: "assignment_approval",
          entityId: action.request_id,
          before,
          after: await this.assignmentRequestState(client, context.tenantId, action.request_id),
          approvalReference: action.request_id,
        };
      },
    );
  }

  async decideApproval(
    context: SecurityActorContext,
    action: SecurityApprovalAction,
    key: string,
  ): Promise<SecurityAdministrationResult | SecurityUserAdministrationResult> {
    let credentialDelivery: string | undefined;
    const result = await this.run(
      context,
      action.resource_type === "user"
        ? "security.user_account.approve"
        : `security.authorization.${action.resource_type}.approve`,
      key,
      action,
      [],
      async (client, commandId, fullAdmin) => {
        if (action.resource_type === "role") return this.decideRole(client, context, action, commandId);
        if (action.resource_type === "assignment") {
          return this.decideAssignment(client, context, action, commandId, fullAdmin);
        }
        const decision = await this.decideUser(client, context, action, commandId, fullAdmin);
        credentialDelivery = decision.credentialDelivery;
        return decision.mutation;
      },
    );
    if (action.resource_type !== "user") return result;
    if (credentialDelivery && !result.replayed) {
      return {
        ...result,
        entity_type: "user_account",
        replayed: false,
        credential_delivery_available: true,
        credential_delivery: { one_time_password: credentialDelivery },
      };
    }
    return {
      ...result,
      entity_type: "user_account",
      credential_delivery_available: false,
    };
  }

  listAccessReviewCampaigns(
    context: SecurityActorContext,
    query: SecurityAccessReviewListQuery,
  ): Promise<SecurityPage> {
    return this.read(context, "security.access_review.read", async (client, fullAdmin) => {
      const parameters: unknown[] = [context.tenantId];
      const conditions = ["campaign.tenant_id=$1"];
      if (query.lifecycle_state) conditions.push(`campaign.lifecycle_state=$${parameters.push(query.lifecycle_state)}`);
      if (query.campaign_id) conditions.push(`campaign.campaign_id=$${parameters.push(query.campaign_id)}`);
      if (query.reviewer_id) {
        conditions.push(
          `exists (select 1 from security_access_review_reviewer reviewer
                    where reviewer.tenant_id=campaign.tenant_id and reviewer.campaign_id=campaign.campaign_id
                      and reviewer.reviewer_id=$${parameters.push(query.reviewer_id)})`,
        );
      }
      if (!fullAdmin) {
        const actorParameter = parameters.push(context.actor.userId);
        conditions.push(
          `(campaign.owner_id=$${actorParameter} or exists (
             select 1 from security_access_review_reviewer reviewer
              where reviewer.tenant_id=campaign.tenant_id and reviewer.campaign_id=campaign.campaign_id
                and reviewer.reviewer_id=$${actorParameter}))`,
        );
      }
      parameters.push(query.limit + 1, query.cursor);
      const result = await client.query<Record<string, unknown>>(
        `select campaign.*,
                coalesce((select jsonb_agg(company_id order by company_id)
                  from security_access_review_campaign_company company
                 where company.tenant_id=campaign.tenant_id and company.campaign_id=campaign.campaign_id),'[]'::jsonb) as company_ids,
                coalesce((select jsonb_agg(reviewer_id order by reviewer_id)
                  from security_access_review_reviewer reviewer
                 where reviewer.tenant_id=campaign.tenant_id and reviewer.campaign_id=campaign.campaign_id),'[]'::jsonb) as reviewer_ids,
                (select count(*)::int from security_access_review_item item
                  where item.tenant_id=campaign.tenant_id and item.campaign_id=campaign.campaign_id) as item_count,
                (select count(*)::int from security_access_review_decision decision
                  where decision.tenant_id=campaign.tenant_id and decision.campaign_id=campaign.campaign_id) as decision_count
           from security_access_review_campaign campaign
          where ${conditions.join(" and ")}
          order by campaign.created_at desc,campaign.campaign_id desc
          limit $${parameters.length - 1} offset $${parameters.length}`,
        parameters,
      );
      return page(result.rows.map(cleanRow), query.limit, query.cursor);
    });
  }

  listAccessReviewItems(
    context: SecurityActorContext,
    query: SecurityAccessReviewListQuery & { campaign_id: string },
  ): Promise<SecurityPage> {
    return this.read(context, "security.access_review.read", async (client, fullAdmin) => {
      const campaign = await this.accessReviewCampaignState(client, context.tenantId, query.campaign_id);
      if (!campaign)
        throw new SecurityAdministrationError(404, "ACCESS_REVIEW_NOT_FOUND", "The access review was not found.");
      const reviewers = Array.isArray(campaign.reviewer_ids) ? campaign.reviewer_ids.map(String) : [];
      if (!fullAdmin && campaign.owner_id !== context.actor.userId && !reviewers.includes(context.actor.userId))
        throw new SecurityAdministrationError(404, "ACCESS_REVIEW_NOT_FOUND", "The access review was not found.");
      const parameters: unknown[] = [context.tenantId, query.campaign_id];
      const reviewer =
        query.reviewer_id ?? (!fullAdmin && campaign.owner_id !== context.actor.userId ? context.actor.userId : null);
      const reviewerFilter = reviewer ? `and item.reviewer_id=$${parameters.push(reviewer)}` : "";
      parameters.push(query.limit + 1, query.cursor);
      const result = await client.query<Record<string, unknown>>(
        `select item.*,decision.decision_id,decision.decision,decision.reason,
                decision.remediation_resource_type,decision.remediation_request_id,decision.decided_at
           from security_access_review_item item
           left join security_access_review_decision decision
             on decision.tenant_id=item.tenant_id and decision.item_id=item.item_id
          where item.tenant_id=$1 and item.campaign_id=$2 ${reviewerFilter}
          order by item.captured_at,item.item_id
          limit $${parameters.length - 1} offset $${parameters.length}`,
        parameters,
      );
      return page(result.rows.map(cleanRow), query.limit, query.cursor);
    });
  }

  createAccessReviewCampaign(
    context: SecurityActorContext,
    request: CreateSecurityAccessReviewCampaign,
    key: string,
  ): Promise<SecurityAdministrationResult> {
    return this.run(
      context,
      "security.access_review.create",
      key,
      request,
      ["name", "company_ids", "reviewer_ids"],
      async (client, _commandId, fullAdmin) => {
        const companyIds = [...new Set(request.company_ids)].sort();
        const reviewerIds = [...new Set(request.reviewer_ids)].sort();
        if (companyIds.length !== request.company_ids.length || reviewerIds.length !== request.reviewer_ids.length)
          throw this.conflict("Access review companies and reviewers must be unique.");
        if (reviewerIds.includes(context.actor.userId))
          throw new SecurityAdministrationError(
            403,
            "MAKER_CHECKER_VIOLATION",
            "The campaign owner cannot review their own campaign.",
          );
        if (companyIds.length) {
          const companies = await client.query<{ id: string }>(
            `select company.id from organization_unit company
              where company.tenant_id=$1 and company.id=any($2::text[]) and company.type='company' and company.status='active'`,
            [context.tenantId, companyIds],
          );
          if (companies.rowCount !== companyIds.length)
            throw this.conflict("One or more review companies are unavailable.");
          if (!fullAdmin) {
            const allowed = await client.query(
              `select company_id from security_user_company_access
                where tenant_id=$1 and user_id=$2 and company_id=any($3::text[]) and revoked_at is null`,
              [context.tenantId, context.actor.userId, companyIds],
            );
            if (allowed.rowCount !== companyIds.length)
              throw new SecurityAdministrationError(
                403,
                "COMPANY_ACCESS_DENIED",
                "The campaign exceeds your company access.",
              );
          }
        }
        const reviewers = await client.query<{ id: string }>(
          `select id from security_user_account where tenant_id=$1 and id=any($2::text[]) and status='active' and archived_at is null`,
          [context.tenantId, reviewerIds],
        );
        if (reviewers.rowCount !== reviewerIds.length) throw this.conflict("One or more reviewers are unavailable.");
        const campaignId = `access-review-${randomUUID()}`;
        await client.query(
          `insert into security_access_review_campaign
            (tenant_id,campaign_id,name,description,scope_mode,review_starts_at,review_ends_at,owner_id)
           values ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [
            context.tenantId,
            campaignId,
            request.name,
            request.description,
            companyIds.length ? "companies" : "tenant",
            request.review_starts_at,
            request.review_ends_at,
            context.actor.userId,
          ],
        );
        for (const companyId of companyIds)
          await client.query(
            `insert into security_access_review_campaign_company (tenant_id,campaign_id,company_id) values ($1,$2,$3)`,
            [context.tenantId, campaignId, companyId],
          );
        for (const reviewerId of reviewerIds)
          await client.query(
            `insert into security_access_review_reviewer
              (tenant_id,campaign_id,reviewer_id,assigned_by) values ($1,$2,$3,$4)`,
            [context.tenantId, campaignId, reviewerId, context.actor.userId],
          );
        return {
          entityType: "access_review_campaign",
          entityId: campaignId,
          before: null,
          after: await this.accessReviewCampaignState(client, context.tenantId, campaignId),
        };
      },
    );
  }

  actOnAccessReviewCampaign(
    context: SecurityActorContext,
    action: SecurityAccessReviewCampaignAction,
    key: string,
  ): Promise<SecurityAdministrationResult> {
    const permission = action.action === "reject" ? "approve" : action.action;
    return this.run(context, `security.access_review.${permission}`, key, action, [], async (client) => {
      const locked = await client.query<Record<string, unknown>>(
        `select * from security_access_review_campaign where tenant_id=$1 and campaign_id=$2 for update`,
        [context.tenantId, action.campaign_id],
      );
      const current = locked.rows[0];
      if (!current)
        throw new SecurityAdministrationError(404, "ACCESS_REVIEW_NOT_FOUND", "The access review was not found.");
      if (Number(current.row_version) !== action.expected_version)
        throw this.conflict("The access review version has changed.");
      const before = cleanRow(current);
      if (action.action === "submit") {
        if (current.lifecycle_state !== "draft" || current.owner_id !== context.actor.userId)
          throw this.conflict("Only the campaign owner can submit a current draft.");
        await client.query(
          `update security_access_review_campaign set lifecycle_state='submitted',submitted_by=$3,submitted_at=now(),updated_at=now(),row_version=row_version+1 where tenant_id=$1 and campaign_id=$2`,
          [context.tenantId, action.campaign_id, context.actor.userId],
        );
      } else if (action.action === "approve" || action.action === "reject") {
        if (current.lifecycle_state !== "submitted") throw this.conflict("Only submitted campaigns can be decided.");
        if (current.owner_id === context.actor.userId)
          throw new SecurityAdministrationError(
            403,
            "MAKER_CHECKER_VIOLATION",
            "Campaign owners cannot approve their own campaign.",
          );
        if (action.action === "approve")
          await client.query(
            `update security_access_review_campaign set lifecycle_state='approved',approved_by=$3,approved_at=now(),updated_at=now(),row_version=row_version+1 where tenant_id=$1 and campaign_id=$2`,
            [context.tenantId, action.campaign_id, context.actor.userId],
          );
        else
          await client.query(
            `update security_access_review_campaign set lifecycle_state='rejected',rejected_by=$3,rejected_at=now(),rejection_reason=$4,updated_at=now(),row_version=row_version+1 where tenant_id=$1 and campaign_id=$2`,
            [context.tenantId, action.campaign_id, context.actor.userId, "reason" in action ? action.reason : null],
          );
      } else if (action.action === "activate") {
        if (current.lifecycle_state !== "approved") throw this.conflict("Only approved campaigns can be activated.");
        await this.captureAccessReviewItems(client, context, action.campaign_id);
        await client.query(
          `update security_access_review_campaign set lifecycle_state='active',activated_by=$3,activated_at=now(),updated_at=now(),row_version=row_version+1 where tenant_id=$1 and campaign_id=$2`,
          [context.tenantId, action.campaign_id, context.actor.userId],
        );
      } else {
        if (current.lifecycle_state !== "active") throw this.conflict("Only active campaigns can be closed.");
        const incomplete = await client.query(
          `select 1 from security_access_review_item item
              left join security_access_review_decision decision
                on decision.tenant_id=item.tenant_id and decision.item_id=item.item_id
             where item.tenant_id=$1 and item.campaign_id=$2
               and (decision.decision_id is null or (decision.decision<>'retain' and decision.remediation_request_id is null)) limit 1`,
          [context.tenantId, action.campaign_id],
        );
        if (incomplete.rowCount)
          throw this.conflict("Every review item must have a complete decision and remediation reference.");
        await client.query(
          `update security_access_review_campaign set lifecycle_state='closed',closed_by=$3,closed_at=now(),updated_at=now(),row_version=row_version+1 where tenant_id=$1 and campaign_id=$2`,
          [context.tenantId, action.campaign_id, context.actor.userId],
        );
      }
      return {
        entityType: "access_review_campaign",
        entityId: action.campaign_id,
        before,
        after: await this.accessReviewCampaignState(client, context.tenantId, action.campaign_id),
        outcome: action.action === "reject" ? "rejected" : "completed",
      };
    });
  }

  decideAccessReviewItem(
    context: SecurityActorContext,
    request: SecurityAccessReviewDecision,
    key: string,
  ): Promise<SecurityAdministrationResult> {
    return this.run(context, "security.access_review.decide", key, request, [], async (client) => {
      const result = await client.query<Record<string, unknown>>(
        `select item.*,campaign.lifecycle_state
             from security_access_review_item item
             join security_access_review_campaign campaign
               on campaign.tenant_id=item.tenant_id and campaign.campaign_id=item.campaign_id
            where item.tenant_id=$1 and item.item_id=$2 for update of item`,
        [context.tenantId, request.item_id],
      );
      const item = result.rows[0];
      if (!item || item.lifecycle_state !== "active")
        throw new SecurityAdministrationError(
          404,
          "ACCESS_REVIEW_ITEM_NOT_FOUND",
          "The active review item was not found.",
        );
      if (item.reviewer_id !== context.actor.userId)
        throw new SecurityAdministrationError(
          403,
          "REVIEWER_REQUIRED",
          "Only the assigned reviewer can decide this item.",
        );
      if (Number(item.row_version) !== request.expected_version)
        throw this.conflict("The review item version has changed.");
      const existing = await client.query(
        `select 1 from security_access_review_decision where tenant_id=$1 and item_id=$2`,
        [context.tenantId, request.item_id],
      );
      if (existing.rowCount) throw this.conflict("The review item already has an immutable decision.");
      let remediationRequestId: string | null = null;
      if (request.decision !== "retain") {
        if (!item.assignment_id || !item.role_policy_id)
          throw this.conflict("This account-only item requires a separate governed user change.");
        const assignment = await client.query<Record<string, unknown>>(
          `select user_id,role_policy_id,assignment_id,valid_from,valid_until,lifecycle_state
               from security_user_role_assignment where tenant_id=$1 and assignment_id=$2 for update`,
          [context.tenantId, item.assignment_id],
        );
        const current = assignment.rows[0];
        if (!current || current.lifecycle_state !== "active")
          throw this.conflict("The reviewed assignment is no longer active.");
        remediationRequestId = `assignment-approval-${randomUUID()}`;
        const proposal = {
          target_user_id: current.user_id,
          role_policy_id: current.role_policy_id,
          assignment_id: current.assignment_id,
          valid_from: new Date(String(current.valid_from)).toISOString(),
          valid_until: current.valid_until ? new Date(String(current.valid_until)).toISOString() : null,
          revocation_reason: request.reason,
        };
        await client.query(
          `insert into security_assignment_approval_request
              (tenant_id,request_id,assignment_id,target_user_id,role_policy_id,requested_action,proposed_assignment,request_state,requested_by)
             values ($1,$2,$3,$4,$5,'revoke',$6,'draft',$7)`,
          [
            context.tenantId,
            remediationRequestId,
            current.assignment_id,
            current.user_id,
            current.role_policy_id,
            JSON.stringify(proposal),
            context.actor.userId,
          ],
        );
      }
      const decisionId = `access-review-decision-${randomUUID()}`;
      await client.query(
        `insert into security_access_review_decision
            (tenant_id,decision_id,campaign_id,item_id,reviewer_id,decision,reason,remediation_resource_type,remediation_request_id)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          context.tenantId,
          decisionId,
          item.campaign_id,
          request.item_id,
          context.actor.userId,
          request.decision,
          request.reason,
          remediationRequestId ? "assignment" : null,
          remediationRequestId,
        ],
      );
      const after = await client.query<Record<string, unknown>>(
        `select * from security_access_review_decision where tenant_id=$1 and decision_id=$2`,
        [context.tenantId, decisionId],
      );
      return {
        entityType: "access_review_decision",
        entityId: decisionId,
        before: null,
        after: cleanRow(after.rows[0]!),
        approvalReference: remediationRequestId,
      };
    });
  }

  private async accessReviewCampaignState(
    client: PoolClient,
    tenantId: string,
    campaignId: string,
  ): Promise<Record<string, unknown> | null> {
    const result = await client.query<Record<string, unknown>>(
      `select campaign.*,
              coalesce((select jsonb_agg(company_id order by company_id) from security_access_review_campaign_company company
                where company.tenant_id=campaign.tenant_id and company.campaign_id=campaign.campaign_id),'[]'::jsonb) as company_ids,
              coalesce((select jsonb_agg(reviewer_id order by reviewer_id) from security_access_review_reviewer reviewer
                where reviewer.tenant_id=campaign.tenant_id and reviewer.campaign_id=campaign.campaign_id),'[]'::jsonb) as reviewer_ids
         from security_access_review_campaign campaign where campaign.tenant_id=$1 and campaign.campaign_id=$2`,
      [tenantId, campaignId],
    );
    return result.rows[0] ? cleanRow(result.rows[0]) : null;
  }

  private async captureAccessReviewItems(
    client: PoolClient,
    context: SecurityActorContext,
    campaignId: string,
  ): Promise<void> {
    const reviewers = await client.query<{ reviewer_id: string }>(
      `select reviewer_id from security_access_review_reviewer where tenant_id=$1 and campaign_id=$2 order by reviewer_id`,
      [context.tenantId, campaignId],
    );
    if (!reviewers.rowCount) throw this.conflict("The access review has no reviewers.");
    const rows = await client.query<Record<string, unknown>>(
      `select account.id as subject_user_id,account.display_name,account.email,account.status,
              assignment.assignment_id,assignment.role_policy_id,assignment.valid_from,assignment.valid_until,
              role.role_code,role.display_name as role_name,policy.permissions,
              coalesce((select jsonb_agg(jsonb_build_object('company_id',access.company_id,'is_default',access.is_default)
                order by access.company_id) from security_user_company_access access
                where access.tenant_id=account.tenant_id and access.user_id=account.id and access.revoked_at is null),'[]'::jsonb) as companies,
              (select jsonb_build_object('employee_id',binding.employee_id,'effective_from',binding.effective_from,'effective_to',binding.effective_to)
                 from employee_user_binding binding where binding.tenant_id=account.tenant_id and binding.user_id=account.id
                   and binding.effective_from<=current_date and (binding.effective_to is null or binding.effective_to>=current_date)
                 order by binding.effective_from desc limit 1) as employee_link
         from security_user_role_assignment_version assignment
         join security_user_account account on account.tenant_id=assignment.tenant_id and account.id=assignment.user_id
         join security_role_policy policy on policy.tenant_id=assignment.tenant_id and policy.id=assignment.role_policy_id
         join security_tenant_role role on role.tenant_id=policy.tenant_id and role.role_id=policy.role_id
        where assignment.tenant_id=$1 and account.status='active' and account.archived_at is null
          and assignment.version=(select max(latest.version) from security_user_role_assignment_version latest
            where latest.tenant_id=assignment.tenant_id and latest.assignment_id=assignment.assignment_id)
          and assignment.lifecycle_state='active' and assignment.valid_from<=now()
          and (assignment.valid_until is null or assignment.valid_until>now())
          and (not exists (select 1 from security_access_review_campaign_company scope
                where scope.tenant_id=$1 and scope.campaign_id=$2)
            or exists (select 1 from security_user_company_access access
                join security_access_review_campaign_company scope
                  on scope.tenant_id=access.tenant_id and scope.campaign_id=$2 and scope.company_id=access.company_id
               where access.tenant_id=account.tenant_id and access.user_id=account.id and access.revoked_at is null))
        order by account.id,assignment.assignment_id`,
      [context.tenantId, campaignId],
    );
    for (const [index, row] of rows.rows.entries()) {
      const snapshot = cleanRow(row);
      const reviewerId = reviewers.rows[index % reviewers.rows.length]!.reviewer_id;
      await client.query(
        `insert into security_access_review_item
          (tenant_id,item_id,campaign_id,reviewer_id,subject_user_id,assignment_id,role_policy_id,snapshot,snapshot_hash)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          context.tenantId,
          `access-review-item-${randomUUID()}`,
          campaignId,
          reviewerId,
          row.subject_user_id,
          row.assignment_id,
          row.role_policy_id,
          JSON.stringify(snapshot),
          stateHash(snapshot),
        ],
      );
    }
  }

  listDelegations(context: SecurityActorContext, query: SecurityDelegationListQuery): Promise<SecurityPage> {
    return this.read(context, "security.delegation.read", async (client, fullAdmin) => {
      const parameters: unknown[] = [context.tenantId];
      const conditions = ["delegation.tenant_id=$1"];
      if (query.lifecycle_state)
        conditions.push(`delegation.lifecycle_state=$${parameters.push(query.lifecycle_state)}`);
      if (query.principal_id) {
        const principal = parameters.push(query.principal_id);
        conditions.push(`(delegation.delegator_id=$${principal} or delegation.delegatee_id=$${principal})`);
      }
      const canApprove =
        fullAdmin ||
        (await this.hasDirectTenantPermission(client, context, "security.delegation.approve"));
      if (!canApprove) {
        const actor = parameters.push(context.actor.userId);
        conditions.push(`(delegation.delegator_id=$${actor} or delegation.delegatee_id=$${actor})`);
      }
      parameters.push(query.limit + 1, query.cursor);
      const result = await client.query<Record<string, unknown>>(
        `select delegation.*,
                case
                  when delegation.lifecycle_state='active' and delegation.valid_until<=now() then 'expired'
                  when delegation.lifecycle_state='active' and delegation.valid_from>now() then 'upcoming'
                  else delegation.lifecycle_state
                end as effective_state,
                coalesce((select jsonb_agg(jsonb_build_object('event_type',event.event_type,'actor_id',event.actor_id,
                  'reason',event.reason,'occurred_at',event.occurred_at) order by event.occurred_at,event.event_id)
                  from security_delegation_event event where event.tenant_id=delegation.tenant_id
                    and event.delegation_id=delegation.delegation_id),'[]'::jsonb) as history
           from security_delegation delegation where ${conditions.join(" and ")}
          order by delegation.created_at desc,delegation.delegation_id desc
          limit $${parameters.length - 1} offset $${parameters.length}`,
        parameters,
      );
      return page(result.rows.map(cleanRow), query.limit, query.cursor);
    });
  }

  createDelegation(
    context: SecurityActorContext,
    request: CreateSecurityDelegation,
    key: string,
  ): Promise<SecurityAdministrationResult> {
    return this.run(
      context,
      "security.delegation.create",
      key,
      request,
      ["delegatee_id", "permission_key", "scope_value"],
      async (client) => {
        if (request.delegatee_id === context.actor.userId)
          throw new SecurityAdministrationError(403, "SELF_DELEGATION_DENIED", "Self-delegation is not permitted.");
        if (new Date(request.valid_until).getTime() - new Date(request.valid_from).getTime() > 30 * 86_400_000)
          throw this.conflict("Delegation duration exceeds the platform maximum of 30 days.");
        await this.validateDelegationSource(client, context.tenantId, context.actor.userId, request);
        const delegationId = `delegation-${randomUUID()}`;
        await client.query(
          `insert into security_delegation
            (tenant_id,delegation_id,delegator_id,delegatee_id,permission_key,scope_kind,scope_value,
             valid_from,valid_until,reason)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [
            context.tenantId,
            delegationId,
            context.actor.userId,
            request.delegatee_id,
            request.permission_key,
            request.scope_kind,
            request.scope_value,
            request.valid_from,
            request.valid_until,
            request.reason,
          ],
        );
        const after = await this.delegationState(client, context.tenantId, delegationId);
        await this.appendDelegationEvent(client, context, delegationId, "created", request.reason, after!);
        return { entityType: "delegation", entityId: delegationId, before: null, after };
      },
    );
  }

  actOnDelegation(
    context: SecurityActorContext,
    action: SecurityDelegationAction,
    key: string,
  ): Promise<SecurityAdministrationResult> {
    const permission = action.action === "reject" ? "approve" : action.action;
    return this.run(
      context,
      `security.delegation.${permission}`,
      key,
      action,
      [],
      async (client, _commandId, fullAdmin) => {
        const result = await client.query<Record<string, unknown>>(
          `select * from security_delegation where tenant_id=$1 and delegation_id=$2 for update`,
          [context.tenantId, action.delegation_id],
        );
        const current = result.rows[0];
        if (!current) throw new SecurityAdministrationError(404, "DELEGATION_NOT_FOUND", "The delegation was not found.");
        if (Number(current.row_version) !== action.expected_version) throw this.conflict("The delegation version has changed.");
        const before = cleanRow(current);
        const eventReason: string | null = "reason" in action ? action.reason : null;
        if (action.action === "submit") {
          if (
            current.lifecycle_state !== "draft" ||
            (!fullAdmin && current.delegator_id !== context.actor.userId)
          )
            throw this.conflict("Only the delegator can submit a current draft.");
          await this.validateDelegationSource(client, context.tenantId, String(current.delegator_id), {
            delegatee_id: String(current.delegatee_id),
            permission_key: String(current.permission_key),
            scope_kind: current.scope_kind as "tenant" | "company",
            scope_value: String(current.scope_value),
            valid_from: new Date(String(current.valid_from)).toISOString(),
            valid_until: new Date(String(current.valid_until)).toISOString(),
            reason: String(current.reason),
          });
          await client.query(
            `update security_delegation set lifecycle_state='submitted',submitted_by=$3,submitted_at=now(),updated_at=now(),row_version=row_version+1 where tenant_id=$1 and delegation_id=$2`,
            [context.tenantId, action.delegation_id, context.actor.userId],
          );
        } else if (action.action === "approve" || action.action === "reject") {
          if (current.lifecycle_state !== "submitted") throw this.conflict("Only submitted delegations can be decided.");
          if (current.delegator_id === context.actor.userId)
            throw new SecurityAdministrationError(403, "MAKER_CHECKER_VIOLATION", "Delegators cannot approve their own request.");
          if (action.action === "approve") {
            await this.validateDelegationSource(client, context.tenantId, String(current.delegator_id), {
              delegatee_id: String(current.delegatee_id),
              permission_key: String(current.permission_key),
              scope_kind: current.scope_kind as "tenant" | "company",
              scope_value: String(current.scope_value),
              valid_from: new Date(String(current.valid_from)).toISOString(),
              valid_until: new Date(String(current.valid_until)).toISOString(),
              reason: String(current.reason),
            });
            await client.query(
              `update security_delegation set lifecycle_state='approved',approved_by=$3,approved_at=now(),updated_at=now(),row_version=row_version+1 where tenant_id=$1 and delegation_id=$2`,
              [context.tenantId, action.delegation_id, context.actor.userId],
            );
          } else {
            await client.query(
              `update security_delegation set lifecycle_state='rejected',rejected_by=$3,rejected_at=now(),rejection_reason=$4,updated_at=now(),row_version=row_version+1 where tenant_id=$1 and delegation_id=$2`,
              [context.tenantId, action.delegation_id, context.actor.userId, eventReason],
            );
          }
        } else if (action.action === "activate") {
          if (current.lifecycle_state !== "approved") throw this.conflict("Only approved delegations can be activated.");
          if (!fullAdmin && current.delegator_id !== context.actor.userId)
            throw new SecurityAdministrationError(403, "DELEGATION_ACTOR_DENIED", "Only the delegator can activate this delegation.");
          if (new Date(String(current.valid_until)) <= new Date()) throw this.conflict("The delegation has already expired.");
          await this.validateDelegationSource(client, context.tenantId, String(current.delegator_id), {
            delegatee_id: String(current.delegatee_id),
            permission_key: String(current.permission_key),
            scope_kind: current.scope_kind as "tenant" | "company",
            scope_value: String(current.scope_value),
            valid_from: new Date(String(current.valid_from)).toISOString(),
            valid_until: new Date(String(current.valid_until)).toISOString(),
            reason: String(current.reason),
          });
          await client.query(
            `update security_delegation set lifecycle_state='active',activated_by=$3,activated_at=now(),updated_at=now(),row_version=row_version+1 where tenant_id=$1 and delegation_id=$2`,
            [context.tenantId, action.delegation_id, context.actor.userId],
          );
        } else {
          if (current.lifecycle_state !== "active") throw this.conflict("Only active delegations can be revoked.");
          if (!fullAdmin && current.delegator_id !== context.actor.userId)
            throw new SecurityAdministrationError(403, "DELEGATION_ACTOR_DENIED", "Only the delegator can revoke this delegation.");
          await client.query(
            `update security_delegation set lifecycle_state='revoked',revoked_by=$3,revoked_at=now(),revocation_reason=$4,updated_at=now(),row_version=row_version+1 where tenant_id=$1 and delegation_id=$2`,
            [context.tenantId, action.delegation_id, context.actor.userId, eventReason],
          );
        }
        const after = await this.delegationState(client, context.tenantId, action.delegation_id);
        const eventType = {
          submit: "submitted",
          approve: "approved",
          reject: "rejected",
          activate: "activated",
          revoke: "revoked",
        }[action.action];
        await this.appendDelegationEvent(client, context, action.delegation_id, eventType, eventReason, after!);
        return {
          entityType: "delegation",
          entityId: action.delegation_id,
          before,
          after,
          outcome: action.action === "reject" ? "rejected" : "completed",
        };
      },
    );
  }

  private async validateDelegationSource(
    client: PoolClient,
    tenantId: string,
    delegatorId: string,
    request: CreateSecurityDelegation,
  ): Promise<void> {
    if (
      request.permission_key.startsWith("security.delegation.") ||
      request.permission_key.startsWith("security.impersonation.") ||
      request.permission_key.startsWith("security.session_policy.") ||
      /\.(approve|activate|administer|reset_password|revoke_sessions)$/.test(request.permission_key)
    )
      throw new SecurityAdministrationError(403, "DELEGATION_PROHIBITED", "This permission cannot be delegated.");
    const delegatee = await client.query(
      `select 1 from security_user_account where tenant_id=$1 and id=$2 and status='active' and archived_at is null`,
      [tenantId, request.delegatee_id],
    );
    if (!delegatee.rowCount) throw this.conflict("The delegatee is unavailable.");
    if (request.scope_kind === "tenant" && request.scope_value !== tenantId)
      throw new SecurityAdministrationError(403, "TENANT_ACCESS_DENIED", "The delegation tenant scope is invalid.");
    if (request.scope_kind === "company") {
      const company = await client.query(
        `select 1 from organization_unit where tenant_id=$1 and id=$2 and type='company' and status='active'`,
        [tenantId, request.scope_value],
      );
      if (!company.rowCount) throw this.conflict("The delegation company is unavailable.");
    }
    const source = await client.query<{ permission_key: string; scope_kind: string; scope_value: string; delegable: boolean }>(
      `select permission_grant.permission_key,scope.scope_kind,scope.scope_value,
              exists (select 1 from security_role_permission_delegation ceiling
                where ceiling.tenant_id=permission_grant.tenant_id and ceiling.role_policy_id=permission_grant.role_policy_id
                  and ceiling.permission_key=permission_grant.permission_key
                  and ceiling.scope_kind=$4 and ceiling.scope_value=$5) as delegable
         from security_user_role_assignment_version assignment
         join security_user_account account on account.tenant_id=assignment.tenant_id and account.id=assignment.user_id and account.status='active'
         join security_role_policy policy on policy.tenant_id=assignment.tenant_id and policy.id=assignment.role_policy_id and policy.lifecycle_state='active'
         join security_role_permission_grant permission_grant on permission_grant.tenant_id=policy.tenant_id and permission_grant.role_policy_id=policy.id
         join security_role_scope_grant scope on scope.tenant_id=permission_grant.tenant_id and scope.role_policy_id=permission_grant.role_policy_id and scope.permission_key=permission_grant.permission_key
        where assignment.tenant_id=$1 and assignment.user_id=$2 and permission_grant.permission_key=any($3::text[])
          and assignment.version=(select max(latest.version) from security_user_role_assignment_version latest
            where latest.tenant_id=assignment.tenant_id and latest.assignment_id=assignment.assignment_id)
          and assignment.lifecycle_state='active' and assignment.valid_from<=now()
          and (assignment.valid_until is null or assignment.valid_until>now())`,
      [tenantId, delegatorId, ["security.authorization.administer", request.permission_key], request.scope_kind, request.scope_value],
    );
    const fullAdmin = source.rows.some(
      (row) => row.permission_key === "security.authorization.administer" && row.scope_kind === "tenant" && row.scope_value === tenantId,
    );
    const matching = source.rows.some(
      (row) =>
        row.permission_key === request.permission_key &&
        row.delegable &&
        (row.scope_kind === "tenant" ||
          (row.scope_kind === request.scope_kind && row.scope_value === request.scope_value)),
    );
    if (!fullAdmin && !matching)
      throw new SecurityAdministrationError(403, "DELEGATION_DENIED", "The requested authority exceeds the delegator's current ceiling.");
    const transactionSod = await client.query(
      `select 1 from security_role_transaction_sod_rule rule
        join security_user_role_assignment_version assignment
          on assignment.tenant_id=rule.tenant_id and assignment.role_policy_id=rule.role_policy_id
       where assignment.tenant_id=$1 and assignment.user_id=$2 and rule.permission_key=$3
         and assignment.version=(select max(latest.version) from security_user_role_assignment_version latest
           where latest.tenant_id=assignment.tenant_id and latest.assignment_id=assignment.assignment_id)
         and assignment.lifecycle_state='active' and assignment.valid_from<=now()
         and (assignment.valid_until is null or assignment.valid_until>now())
       limit 1`,
      [tenantId, delegatorId, request.permission_key],
    );
    if (transactionSod.rowCount)
      throw new SecurityAdministrationError(
        403,
        "SOD_VIOLATION",
        "Permissions with transaction separation-of-duties controls cannot be delegated.",
      );
    const duplicate = await client.query(
      `select 1 from security_user_role_assignment_version assignment
        join security_role_permission_grant permission_grant on permission_grant.tenant_id=assignment.tenant_id and permission_grant.role_policy_id=assignment.role_policy_id
        join security_role_scope_grant scope on scope.tenant_id=permission_grant.tenant_id and scope.role_policy_id=permission_grant.role_policy_id and scope.permission_key=permission_grant.permission_key
       where assignment.tenant_id=$1 and assignment.user_id=$2 and permission_grant.permission_key=$3
         and assignment.version=(select max(latest.version) from security_user_role_assignment_version latest
           where latest.tenant_id=assignment.tenant_id and latest.assignment_id=assignment.assignment_id)
         and assignment.lifecycle_state='active' and assignment.valid_from<=now()
         and (assignment.valid_until is null or assignment.valid_until>now())
         and (scope.scope_kind='tenant' or (scope.scope_kind=$4 and scope.scope_value=$5)) limit 1`,
      [tenantId, request.delegatee_id, request.permission_key, request.scope_kind, request.scope_value],
    );
    if (duplicate.rowCount) throw this.conflict("The delegatee already holds this authority directly.");
  }

  private async delegationState(client: PoolClient, tenantId: string, delegationId: string) {
    const result = await client.query<Record<string, unknown>>(
      `select * from security_delegation where tenant_id=$1 and delegation_id=$2`,
      [tenantId, delegationId],
    );
    return result.rows[0] ? cleanRow(result.rows[0]) : null;
  }

  private async appendDelegationEvent(
    client: PoolClient,
    context: SecurityActorContext,
    delegationId: string,
    eventType: string,
    reason: string | null,
    state: Record<string, unknown>,
  ) {
    await client.query(
      `insert into security_delegation_event
        (tenant_id,event_id,delegation_id,event_type,actor_id,reason,state_snapshot)
       values ($1,$2,$3,$4,$5,$6,$7)`,
      [context.tenantId, `delegation-event-${randomUUID()}`, delegationId, eventType, context.actor.userId, reason, JSON.stringify(state)],
    );
  }

  listImpersonations(context: SecurityActorContext, query: SecurityImpersonationListQuery): Promise<SecurityPage> {
    return this.read(context, "security.impersonation.read", async (client, fullAdmin) => {
      const parameters: unknown[] = [context.tenantId];
      const conditions = ["request.tenant_id=$1"];
      if (query.lifecycle_state) conditions.push(`request.lifecycle_state=$${parameters.push(query.lifecycle_state)}`);
      if (query.principal_id) {
        const principal = parameters.push(query.principal_id);
        conditions.push(`(request.actor_id=$${principal} or request.target_user_id=$${principal})`);
      }
      const canApprove =
        fullAdmin || (await this.hasDirectTenantPermission(client, context, "security.impersonation.approve"));
      if (!canApprove) {
        const actor = parameters.push(context.actor.userId);
        conditions.push(`(request.actor_id=$${actor} or request.target_user_id=$${actor})`);
      }
      parameters.push(query.limit + 1, query.cursor);
      const result = await client.query<Record<string, unknown>>(
        `select request.*,
                case when request.lifecycle_state='active' and request.expires_at<=now() then 'expired'
                     else request.lifecycle_state end as effective_state,
                (principal.user_id=request.actor_id and principal.revoked_at is null) as emergency_principal,
                coalesce((select jsonb_agg(jsonb_build_object(
                  'event_type',event.event_type,'real_actor_id',event.real_actor_id,
                  'effective_actor_id',event.effective_actor_id,'reason',event.reason,
                  'occurred_at',event.occurred_at) order by event.occurred_at,event.event_id)
                  from security_impersonation_event event where event.tenant_id=request.tenant_id
                    and event.request_id=request.request_id),'[]'::jsonb) as history
           from security_impersonation_request request
           left join security_emergency_impersonation_principal principal on principal.tenant_id=request.tenant_id
          where ${conditions.join(" and ")}
          order by request.created_at desc,request.request_id desc
          limit $${parameters.length - 1} offset $${parameters.length}`,
        parameters,
      );
      return page(result.rows.map(cleanRow), query.limit, query.cursor);
    });
  }

  createImpersonation(
    context: SecurityActorContext,
    request: CreateSecurityImpersonation,
    key: string,
  ): Promise<SecurityAdministrationResult> {
    return this.run(
      context,
      "security.impersonation.create",
      key,
      request,
      ["target_user_id", "purpose"],
      async (client) => {
        await this.validateImpersonationTarget(client, context.tenantId, context.actor.userId, request.target_user_id);
        const requestId = `impersonation-${randomUUID()}`;
        await client.query(
          `insert into security_impersonation_request
            (tenant_id,request_id,actor_id,target_user_id,purpose,duration_minutes)
           values ($1,$2,$3,$4,$5,$6)`,
          [context.tenantId, requestId, context.actor.userId, request.target_user_id, request.purpose, request.duration_minutes],
        );
        const after = await this.impersonationState(client, context.tenantId, requestId);
        await this.appendImpersonationEvent(client, context, requestId, "created", request.purpose, context.actor.userId, after!);
        return { entityType: "impersonation", entityId: requestId, before: null, after };
      },
    );
  }

  actOnImpersonation(
    context: SecurityActorContext,
    action: SecurityImpersonationAction,
    key: string,
    sessionId: string,
  ): Promise<SecurityAdministrationResult> {
    const permission = action.action === "reject" ? "approve" : action.action;
    return this.run(
      context,
      `security.impersonation.${permission}`,
      key,
      action,
      [],
      async (client, _commandId, fullAdmin) => {
        const result = await client.query<Record<string, unknown>>(
          `select * from security_impersonation_request where tenant_id=$1 and request_id=$2 for update`,
          [context.tenantId, action.request_id],
        );
        const current = result.rows[0];
        if (!current)
          throw new SecurityAdministrationError(404, "IMPERSONATION_NOT_FOUND", "The impersonation request was not found.");
        if (Number(current.row_version) !== action.expected_version) throw this.conflict("The impersonation version has changed.");
        const before = cleanRow(current);
        const reason = "reason" in action ? action.reason : null;
        let eventType = "";
        if (action.action === "submit") {
          if (current.lifecycle_state !== "draft" || (!fullAdmin && current.actor_id !== context.actor.userId))
            throw this.conflict("Only the requesting actor can submit a current draft.");
          await this.validateImpersonationTarget(
            client,
            context.tenantId,
            String(current.actor_id),
            String(current.target_user_id),
          );
          await client.query(
            `update security_impersonation_request set lifecycle_state='submitted',submitted_by=$3,
              submitted_at=now(),updated_at=now(),row_version=row_version+1 where tenant_id=$1 and request_id=$2`,
            [context.tenantId, action.request_id, context.actor.userId],
          );
          eventType = "submitted";
        } else if (action.action === "approve" || action.action === "reject") {
          if (current.lifecycle_state !== "submitted") throw this.conflict("Only submitted impersonation can be decided.");
          if (current.actor_id === context.actor.userId)
            throw new SecurityAdministrationError(403, "MAKER_CHECKER_VIOLATION", "The requesting actor cannot approve impersonation.");
          if (action.action === "approve") {
            await this.validateImpersonationTarget(
              client,
              context.tenantId,
              String(current.actor_id),
              String(current.target_user_id),
            );
            await client.query(
              `update security_impersonation_request set lifecycle_state='approved',approved_by=$3,
                approved_at=now(),updated_at=now(),row_version=row_version+1 where tenant_id=$1 and request_id=$2`,
              [context.tenantId, action.request_id, context.actor.userId],
            );
            eventType = "approved";
          } else {
            await client.query(
              `update security_impersonation_request set lifecycle_state='rejected',rejected_by=$3,
                rejected_at=now(),rejection_reason=$4,updated_at=now(),row_version=row_version+1
               where tenant_id=$1 and request_id=$2`,
              [context.tenantId, action.request_id, context.actor.userId, reason],
            );
            eventType = "rejected";
          }
        } else if (action.action === "activate" || action.action === "emergency_activate") {
          if (!fullAdmin && current.actor_id !== context.actor.userId)
            throw new SecurityAdministrationError(403, "IMPERSONATION_ACTOR_DENIED", "Only the requesting actor can activate impersonation.");
          if (action.action === "activate" && current.lifecycle_state !== "approved")
            throw this.conflict("Only approved impersonation can be activated.");
          if (action.action === "emergency_activate") {
            if (current.lifecycle_state !== "draft" && current.lifecycle_state !== "submitted")
              throw this.conflict("Emergency activation requires a pending request.");
            const principal = await client.query(
              `select 1 from security_emergency_impersonation_principal
                where tenant_id=$1 and user_id=$2 and revoked_at is null`,
              [context.tenantId, context.actor.userId],
            );
            if (!principal.rowCount)
              throw new SecurityAdministrationError(
                403,
                "EMERGENCY_PRINCIPAL_REQUIRED",
                "The actor is not the tenant's designated emergency impersonation principal.",
              );
          }
          await this.validateImpersonationTarget(
            client,
            context.tenantId,
            String(current.actor_id),
            String(current.target_user_id),
          );
          const target = await client.query<{ session_version: number }>(
            `select session_version from security_user_account where tenant_id=$1 and id=$2`,
            [context.tenantId, current.target_user_id],
          );
          await client.query(
            `update security_impersonation_request set lifecycle_state='active',emergency_activation=$3,
              activated_by=$4,activated_at=now(),active_session_id=$5,target_session_version=$6,
              expires_at=now()+(duration_minutes * interval '1 minute'),updated_at=now(),row_version=row_version+1
             where tenant_id=$1 and request_id=$2`,
            [
              context.tenantId,
              action.request_id,
              action.action === "emergency_activate",
              context.actor.userId,
              sessionId,
              target.rows[0]!.session_version,
            ],
          );
          eventType = action.action === "emergency_activate" ? "emergency_activated" : "activated";
        } else {
          if (current.lifecycle_state !== "active") throw this.conflict("Only active impersonation can be ended.");
          if (!fullAdmin && current.actor_id !== context.actor.userId)
            throw new SecurityAdministrationError(403, "IMPERSONATION_ACTOR_DENIED", "Only the real actor can end impersonation.");
          await client.query(
            `update security_impersonation_request set lifecycle_state='ended',ended_by=$3,ended_at=now(),
              end_reason=$4,updated_at=now(),row_version=row_version+1 where tenant_id=$1 and request_id=$2`,
            [context.tenantId, action.request_id, context.actor.userId, reason],
          );
          eventType = "ended";
        }
        const after = await this.impersonationState(client, context.tenantId, action.request_id);
        await this.appendImpersonationEvent(
          client,
          context,
          action.request_id,
          eventType,
          reason,
          eventType === "activated" || eventType === "emergency_activated" || eventType === "ended"
            ? String(current.target_user_id)
            : context.actor.userId,
          after!,
        );
        return {
          entityType: "impersonation",
          entityId: action.request_id,
          before,
          after,
          outcome: action.action === "reject" ? "rejected" : "completed",
        };
      },
    );
  }

  async failImpersonationActivation(
    context: SecurityActorContext,
    requestId: string,
    sessionId: string,
  ): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      await client.query("select set_config('nexora.tenant_id', $1, true)", [context.tenantId]);
      const current = await client.query<Record<string, unknown>>(
        `select * from security_impersonation_request
          where tenant_id=$1 and request_id=$2 and lifecycle_state='active' and active_session_id=$3 for update`,
        [context.tenantId, requestId, sessionId],
      );
      if (current.rows[0]) {
        await client.query(
          `update security_impersonation_request set lifecycle_state='activation_failed',ended_by=$3,
            ended_at=now(),end_reason='Session context could not be established',updated_at=now(),row_version=row_version+1
           where tenant_id=$1 and request_id=$2`,
          [context.tenantId, requestId, context.actor.userId],
        );
        const after = await this.impersonationState(client, context.tenantId, requestId);
        await this.appendImpersonationEvent(
          client,
          context,
          requestId,
          "activation_failed",
          "Session context could not be established",
          context.actor.userId,
          after!,
        );
        await this.appendAudit(client, context, "security.impersonation.activation_failed", {
          entityType: "impersonation",
          entityId: requestId,
          before: cleanRow(current.rows[0]),
          after,
          outcome: "rejected",
        });
      }
      await client.query("commit");
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async validateImpersonationContext(input: {
    tenantId: string;
    sessionId: string;
    realUserId: string;
    requestId: string;
    targetUserId: string;
  }): Promise<boolean> {
    const client = await this.pool.connect();
    try {
      await client.query("begin isolation level repeatable read read only");
      await client.query("select set_config('nexora.tenant_id', $1, true)", [input.tenantId]);
      const result = await client.query(
        `select 1 from security_impersonation_request request
          join security_user_account actor on actor.tenant_id=request.tenant_id and actor.id=request.actor_id
            and actor.status='active' and actor.archived_at is null
          join security_user_account target on target.tenant_id=request.tenant_id and target.id=request.target_user_id
            and target.status='active' and target.archived_at is null
         where request.tenant_id=$1 and request.request_id=$2 and request.actor_id=$3 and request.target_user_id=$4
           and request.active_session_id=$5 and request.lifecycle_state='active' and request.expires_at>now()
           and exists (
             select 1 from security_user_role_assignment_version assignment
             join security_role_policy policy on policy.tenant_id=assignment.tenant_id and policy.id=assignment.role_policy_id
               and policy.status='active' and policy.lifecycle_state='active'
             join security_role_permission_grant permission_grant on permission_grant.tenant_id=policy.tenant_id
               and permission_grant.role_policy_id=policy.id
             join security_role_scope_grant scope on scope.tenant_id=permission_grant.tenant_id
               and scope.role_policy_id=permission_grant.role_policy_id and scope.permission_key=permission_grant.permission_key
               and scope.scope_kind='tenant' and scope.scope_value=request.tenant_id
            where assignment.tenant_id=request.tenant_id and assignment.user_id=request.actor_id
              and assignment.version=(select max(latest.version) from security_user_role_assignment_version latest
                where latest.tenant_id=assignment.tenant_id and latest.assignment_id=assignment.assignment_id)
              and assignment.lifecycle_state='active' and assignment.valid_from<=now()
              and (assignment.valid_until is null or assignment.valid_until>now())
              and (
                (not request.emergency_activation and permission_grant.permission_key in (
                  'security.authorization.administer','security.impersonation.activate'
                ))
                or (
                  request.emergency_activation
                  and permission_grant.permission_key in (
                    'security.authorization.administer','security.impersonation.emergency_activate'
                  )
                  and exists (select 1 from security_emergency_impersonation_principal principal
                    where principal.tenant_id=request.tenant_id and principal.user_id=request.actor_id and principal.revoked_at is null)
                )
              )
           )`,
        [input.tenantId, input.requestId, input.realUserId, input.targetUserId, input.sessionId],
      );
      await client.query("commit");
      return Boolean(result.rowCount);
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  private async validateImpersonationTarget(client: PoolClient, tenantId: string, actorId: string, targetId: string) {
    if (actorId === targetId)
      throw new SecurityAdministrationError(403, "SELF_IMPERSONATION_DENIED", "Self-impersonation is not permitted.");
    const target = await client.query(
      `select 1 from security_user_account where tenant_id=$1 and id=$2 and status='active' and archived_at is null`,
      [tenantId, targetId],
    );
    if (!target.rowCount) throw this.conflict("The impersonation target is unavailable.");
  }

  private async impersonationState(client: PoolClient, tenantId: string, requestId: string) {
    const result = await client.query<Record<string, unknown>>(
      `select * from security_impersonation_request where tenant_id=$1 and request_id=$2`,
      [tenantId, requestId],
    );
    return result.rows[0] ? cleanRow(result.rows[0]) : null;
  }

  private async appendImpersonationEvent(
    client: PoolClient,
    context: SecurityActorContext,
    requestId: string,
    eventType: string,
    reason: string | null,
    effectiveActorId: string,
    state: Record<string, unknown>,
  ) {
    await client.query(
      `insert into security_impersonation_event
        (tenant_id,event_id,request_id,event_type,real_actor_id,effective_actor_id,reason,state_snapshot)
       values ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        context.tenantId,
        `impersonation-event-${randomUUID()}`,
        requestId,
        eventType,
        context.actor.userId,
        effectiveActorId,
        reason,
        JSON.stringify(state),
      ],
    );
  }

  private async read<T>(
    context: SecurityActorContext,
    permission: string,
    operation: (client: PoolClient, fullAdmin: boolean) => Promise<T>,
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("begin isolation level repeatable read read only");
      await client.query("select set_config('nexora.tenant_id', $1, true)", [context.tenantId]);
      const fullAdmin = await this.authorize(client, context, permission, []);
      const result = await operation(client, fullAdmin);
      await client.query("commit");
      return result;
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  private async run(
    context: SecurityActorContext,
    operation: string,
    idempotencyKey: string,
    payload: unknown,
    requestedFields: readonly string[],
    mutation: (client: PoolClient, commandId: string, fullAdmin: boolean) => Promise<Mutation>,
  ): Promise<SecurityAdministrationResult> {
    if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,254}$/.test(idempotencyKey))
      throw new SecurityAdministrationError(400, "INVALID_IDEMPOTENCY_KEY", "The idempotency key is invalid.");
    const client = await this.pool.connect();
    try {
      // Tenant-wide advisory locking serializes governed mutations. READ COMMITTED
      // deliberately refreshes the snapshot after a waiter obtains that lock so
      // an idempotent retry can observe and replay the command that just committed.
      await client.query("begin isolation level read committed");
      await client.query("select set_config('nexora.tenant_id', $1, true)", [context.tenantId]);
      await client.query("select pg_advisory_xact_lock(hashtextextended($1, 0))", [
        `nexora:security:admin:${context.tenantId}`,
      ]);
      const fullAdmin = await this.authorize(client, context, operation, requestedFields);
      const fingerprint = stateHash(payload);
      const proposedCommandId = `command-${randomUUID()}`;
      await client.query(
        `insert into security_administration_command
          (tenant_id,command_id,actor_id,operation,correlation_id,idempotency_key,request_fingerprint)
         values ($1,$2,$3,$4,$5,$6,$7)
         on conflict (tenant_id,actor_id,operation,idempotency_key) do nothing`,
        [
          context.tenantId,
          proposedCommandId,
          context.actor.userId,
          operation,
          context.correlationId,
          idempotencyKey,
          fingerprint,
        ],
      );
      const existingResult = await client.query<CommandRow>(
        `select command_id,request_fingerprint,outcome,result_projection,audit_event_id
         from security_administration_command
         where tenant_id=$1 and actor_id=$2 and operation=$3 and idempotency_key=$4 for update`,
        [context.tenantId, context.actor.userId, operation, idempotencyKey],
      );
      const existing = existingResult.rows[0];
      if (!existing) throw this.conflict("The administration command could not be established.");
      if (existing.request_fingerprint !== fingerprint)
        throw new SecurityAdministrationError(
          409,
          "IDEMPOTENCY_CONFLICT",
          "The idempotency key was already used for another request.",
        );
      if (existing.outcome !== "pending") {
        const projection = existing.result_projection ?? {};
        await client.query("commit");
        return {
          command_id: existing.command_id,
          operation,
          outcome: existing.outcome,
          entity_type: String(projection.entity_type ?? "administration_command"),
          entity_id: String(projection.entity_id ?? existing.command_id),
          projection,
          audit_event_id: existing.audit_event_id ?? "missing-audit",
          replayed: true,
        };
      }
      const changed = await mutation(client, existing.command_id, fullAdmin);
      const auditEventId = await this.appendAudit(client, context, operation, changed);
      const projection = {
        entity_type: changed.entityType,
        entity_id: changed.entityId,
        previous_state: changed.before,
        new_state: changed.after,
        approval_state: changed.outcome ?? "completed",
        approval_reference: changed.approvalReference ?? null,
        authorization: {
          permission: operation,
          tenant_wide_administrator: fullAdmin,
          assurance: "password",
          target_tenant: context.tenantId,
        },
      };
      const outcome = changed.outcome ?? "completed";
      await client.query(
        `update security_administration_command
         set outcome=$3,result_projection=$4,audit_event_id=$5,completed_at=now(),row_version=row_version+1
         where tenant_id=$1 and command_id=$2 and outcome='pending'`,
        [context.tenantId, existing.command_id, outcome, JSON.stringify(projection), auditEventId],
      );
      await client.query("commit");
      return {
        command_id: existing.command_id,
        operation,
        outcome,
        entity_type: changed.entityType,
        entity_id: changed.entityId,
        projection,
        audit_event_id: auditEventId,
        replayed: false,
      };
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      if (error instanceof SecurityAdministrationError) throw error;
      const pg = error as { code?: string };
      if (pg.code === "40001" || pg.code === "23505" || pg.code === "23503" || pg.code === "23514")
        throw this.conflict("Authorization administration conflicts with current state.");
      throw error;
    } finally {
      client.release();
    }
  }

  private async authorize(
    client: PoolClient,
    context: SecurityActorContext,
    permission: string,
    fields: readonly string[],
  ): Promise<boolean> {
    if (context.actor.tenantId !== context.tenantId)
      throw new SecurityAdministrationError(403, "TENANT_ACCESS_DENIED", "The tenant boundary was rejected.");
    const result = await client.query<{
      permission_key: string;
      field_allow_mode: string;
      scope_kind: string;
      scope_value: string;
    }>(
      `select permission_grant.permission_key,permission_grant.field_allow_mode,scope.scope_kind,scope.scope_value
       from security_user_role_assignment_version assignment
       join security_user_account account on account.tenant_id=assignment.tenant_id and account.id=assignment.user_id and account.status='active'
       join security_role_policy policy on policy.tenant_id=assignment.tenant_id and policy.id=assignment.role_policy_id and policy.status='active' and policy.lifecycle_state='active'
       join security_tenant_role role on role.tenant_id=policy.tenant_id and role.role_id=policy.role_id and role.lifecycle_state='active'
       join security_role_permission_grant permission_grant on permission_grant.tenant_id=policy.tenant_id and permission_grant.role_policy_id=policy.id
       join security_role_scope_grant scope on scope.tenant_id=permission_grant.tenant_id and scope.role_policy_id=permission_grant.role_policy_id and scope.permission_key=permission_grant.permission_key
       where assignment.tenant_id=$1 and assignment.user_id=$2
         and assignment.version=(select max(latest.version) from security_user_role_assignment_version latest where latest.tenant_id=assignment.tenant_id and latest.assignment_id=assignment.assignment_id)
         and assignment.lifecycle_state='active' and assignment.valid_from<=now() and (assignment.valid_until is null or assignment.valid_until>now())
         and permission_grant.permission_key = any($3::text[])`,
      [context.tenantId, context.actor.userId, ["security.authorization.administer", permission]],
    );
    const fullAdmin = result.rows.some(
      (row) =>
        row.permission_key === "security.authorization.administer" &&
        row.scope_kind === "tenant" &&
        row.scope_value === context.tenantId,
    );
    if (fullAdmin) return true;
    const grants = result.rows.filter(
      (row) => row.permission_key === permission && row.scope_kind === "tenant" && row.scope_value === context.tenantId,
    );
    if (grants.length === 0) {
      const delegated =
        fields.length === 0 &&
        !permission.startsWith("security.delegation.") &&
        !permission.startsWith("security.impersonation.") &&
        !permission.startsWith("security.session_policy.") &&
        !/\.(approve|activate|administer|reset_password|revoke_sessions)$/.test(permission) &&
        (await this.hasActiveDelegatedTenantPermission(client, context, permission));
      if (!delegated)
        throw new SecurityAdministrationError(403, "PERMISSION_DENIED", "The security operation is not permitted.");
      return false;
    }
    if (fields.length > 0 && grants.every((grant) => grant.field_allow_mode !== "all")) {
      const fieldResult = await client.query<{ field_name: string; effect: string }>(
        `select field.field_name,field.effect from security_role_field_grant field
         join security_user_role_assignment_version assignment on assignment.tenant_id=field.tenant_id and assignment.role_policy_id=field.role_policy_id
         where field.tenant_id=$1 and assignment.user_id=$2 and field.permission_key=$3
           and assignment.version=(select max(latest.version) from security_user_role_assignment_version latest where latest.tenant_id=assignment.tenant_id and latest.assignment_id=assignment.assignment_id)
           and assignment.lifecycle_state='active'`,
        [context.tenantId, context.actor.userId, permission],
      );
      const denied = new Set(fieldResult.rows.filter((row) => row.effect === "deny").map((row) => row.field_name));
      const allowed = new Set(fieldResult.rows.filter((row) => row.effect === "allow").map((row) => row.field_name));
      if (fields.some((field) => denied.has(field) || !allowed.has(field)))
        throw new SecurityAdministrationError(
          403,
          "FIELD_ACCESS_DENIED",
          "One or more requested fields are not permitted.",
        );
    }
    return false;
  }

  private async hasDirectTenantPermission(
    client: PoolClient,
    context: SecurityActorContext,
    permission: string,
  ): Promise<boolean> {
    const result = await client.query(
      `select 1
         from security_user_role_assignment_version assignment
         join security_user_account account
           on account.tenant_id=assignment.tenant_id and account.id=assignment.user_id
          and account.status='active' and account.archived_at is null
         join security_role_policy policy
           on policy.tenant_id=assignment.tenant_id and policy.id=assignment.role_policy_id
          and policy.status='active' and policy.lifecycle_state='active'
         join security_tenant_role role
           on role.tenant_id=policy.tenant_id and role.role_id=policy.role_id and role.lifecycle_state='active'
         join security_role_permission_grant permission_grant
           on permission_grant.tenant_id=policy.tenant_id and permission_grant.role_policy_id=policy.id and permission_grant.permission_key=$3
         join security_role_scope_grant scope
           on scope.tenant_id=permission_grant.tenant_id and scope.role_policy_id=permission_grant.role_policy_id
          and scope.permission_key=permission_grant.permission_key and scope.scope_kind='tenant' and scope.scope_value=$1
        where assignment.tenant_id=$1 and assignment.user_id=$2
          and assignment.version=(select max(latest.version) from security_user_role_assignment_version latest
            where latest.tenant_id=assignment.tenant_id and latest.assignment_id=assignment.assignment_id)
          and assignment.lifecycle_state='active' and assignment.valid_from<=now()
          and (assignment.valid_until is null or assignment.valid_until>now())
        limit 1`,
      [context.tenantId, context.actor.userId, permission],
    );
    return Boolean(result.rowCount);
  }

  private async hasActiveDelegatedTenantPermission(
    client: PoolClient,
    context: SecurityActorContext,
    permission: string,
  ): Promise<boolean> {
    const result = await client.query(
      `select 1
         from security_delegation delegation
         join security_user_account delegatee
           on delegatee.tenant_id=delegation.tenant_id and delegatee.id=delegation.delegatee_id
          and delegatee.status='active' and delegatee.archived_at is null
         join security_user_account delegator
           on delegator.tenant_id=delegation.tenant_id and delegator.id=delegation.delegator_id
          and delegator.status='active' and delegator.archived_at is null
        where delegation.tenant_id=$1 and delegation.delegatee_id=$2 and delegation.permission_key=$3
          and delegation.scope_kind='tenant' and delegation.scope_value=$1
          and delegation.lifecycle_state='active'
          and delegation.valid_from<=now() and delegation.valid_until>now()
          and exists (
            select 1 from security_user_role_assignment_version assignment
            join security_role_policy policy
              on policy.tenant_id=assignment.tenant_id and policy.id=assignment.role_policy_id
             and policy.status='active' and policy.lifecycle_state='active'
            join security_tenant_role role
              on role.tenant_id=policy.tenant_id and role.role_id=policy.role_id and role.lifecycle_state='active'
            join security_role_permission_grant permission_grant
              on permission_grant.tenant_id=policy.tenant_id and permission_grant.role_policy_id=policy.id
            join security_role_scope_grant scope
              on scope.tenant_id=permission_grant.tenant_id and scope.role_policy_id=permission_grant.role_policy_id
             and scope.permission_key=permission_grant.permission_key and scope.scope_kind='tenant'
             and scope.scope_value=delegation.tenant_id
           where assignment.tenant_id=delegation.tenant_id and assignment.user_id=delegation.delegator_id
             and assignment.version=(select max(latest.version) from security_user_role_assignment_version latest
               where latest.tenant_id=assignment.tenant_id and latest.assignment_id=assignment.assignment_id)
             and assignment.lifecycle_state='active' and assignment.valid_from<=now()
             and (assignment.valid_until is null or assignment.valid_until>now())
             and (
               permission_grant.permission_key='security.authorization.administer'
               or (
                 permission_grant.permission_key=delegation.permission_key
                 and exists (
                   select 1 from security_role_permission_delegation ceiling
                    where ceiling.tenant_id=permission_grant.tenant_id
                      and ceiling.role_policy_id=permission_grant.role_policy_id
                      and ceiling.permission_key=permission_grant.permission_key
                      and ceiling.scope_kind=delegation.scope_kind
                      and ceiling.scope_value=delegation.scope_value
                 )
               )
             )
          )
        limit 1`,
      [context.tenantId, context.actor.userId, permission],
    );
    return Boolean(result.rowCount);
  }

  private async validateRoleDraft(
    client: PoolClient,
    context: SecurityActorContext,
    draft: CreateSecurityRoleRequest,
    fullAdmin: boolean,
  ): Promise<void> {
    const uniquePermissions = [...new Set(draft.permissions)].sort();
    if (uniquePermissions.length !== draft.permissions.length) throw this.conflict("Role permissions must be unique.");
    const known = await client.query<{ permission_key: string }>(
      `select permission_key from security_permission_definition where status='active' and permission_key=any($1::text[])`,
      [uniquePermissions],
    );
    if (known.rowCount !== uniquePermissions.length)
      throw this.conflict("The role contains unknown or inactive permissions.");
    if (
      Object.keys(draft.allowed_source_states).some((key) => !uniquePermissions.includes(key)) ||
      draft.delegations.some((item) => !uniquePermissions.includes(item.permission))
    )
      throw this.conflict("Role constraints require a granted permission.");
    if (fullAdmin) return;
    const targets: Array<[string, string, string]> = [];
    for (const permission of uniquePermissions) {
      if (draft.scope.mode === "tenant") targets.push([permission, "tenant", context.tenantId]);
      else if (draft.scope.mode === "own") targets.push([permission, "owner", "actor"]);
      else for (const companyId of draft.scope.company_ids) targets.push([permission, "company", companyId]);
    }
    targets.push(
      ...draft.delegations.map(
        (item) => [item.permission, item.scope_kind, item.scope_value] as [string, string, string],
      ),
    );
    await this.requireDelegation(client, context, targets);
  }

  private async validateAssignment(
    client: PoolClient,
    context: SecurityActorContext,
    action: "create" | "edit" | "revoke",
    proposal: CreateSecurityAssignmentRequest["proposal"],
    fullAdmin: boolean,
  ): Promise<void> {
    const user = await client.query<{ status: string }>(
      `select status from security_user_account where tenant_id=$1 and id=$2`,
      [context.tenantId, proposal.target_user_id],
    );
    if (!user.rows[0])
      throw new SecurityAdministrationError(404, "TARGET_NOT_FOUND", "The assignment target was not found.");
    if (!fullAdmin) await this.requireUserCompanyBoundary(client, context, proposal.target_user_id);
    if (action !== "revoke" && user.rows[0].status !== "active")
      throw this.conflict("The assignment target is not active.");
    const policy = await client.query<{ status: string; lifecycle_state: string }>(
      `select status,lifecycle_state from security_role_policy where tenant_id=$1 and id=$2`,
      [context.tenantId, proposal.role_policy_id],
    );
    if (!policy.rows[0]) throw new SecurityAdministrationError(404, "ROLE_NOT_FOUND", "The role policy was not found.");
    if (action !== "revoke" && (policy.rows[0].status !== "active" || policy.rows[0].lifecycle_state !== "active"))
      throw this.conflict("The role policy is not active.");
    if (action !== "create") {
      if (!proposal.assignment_id)
        throw new SecurityAdministrationError(400, "ASSIGNMENT_ID_REQUIRED", "The assignment identifier is required.");
      const current = await client.query<{ user_id: string; role_policy_id: string; lifecycle_state: string }>(
        `select user_id,role_policy_id,lifecycle_state from security_user_role_assignment where tenant_id=$1 and assignment_id=$2 for update`,
        [context.tenantId, proposal.assignment_id],
      );
      if (!current.rows[0])
        throw new SecurityAdministrationError(404, "ASSIGNMENT_NOT_FOUND", "The assignment was not found.");
      if (current.rows[0].user_id !== proposal.target_user_id)
        throw this.conflict("The assignment target cannot be changed.");
      if (action === "revoke" && current.rows[0].role_policy_id !== proposal.role_policy_id)
        throw this.conflict("The revocation role does not match the assignment.");
    }
    if (!fullAdmin && action !== "revoke") {
      const grants = await client.query<{ permission_key: string; scope_kind: string; scope_value: string }>(
        `select permission_key,scope_kind,scope_value from security_role_scope_grant where tenant_id=$1 and role_policy_id=$2 union select permission_key,scope_kind,scope_value from security_role_permission_delegation where tenant_id=$1 and role_policy_id=$2`,
        [context.tenantId, proposal.role_policy_id],
      );
      if (grants.rows.length === 0)
        throw new SecurityAdministrationError(403, "DELEGATION_DENIED", "The role has no grantable normalized scope.");
      await this.requireDelegation(
        client,
        context,
        grants.rows.map((row) => [row.permission_key, row.scope_kind, row.scope_value]),
      );
    }
  }

  private async requireUserCompanyBoundary(
    client: PoolClient,
    context: SecurityActorContext,
    targetUserId: string,
  ): Promise<void> {
    const boundary = await client.query(
      `select 1
         from security_user_account account
        where account.tenant_id=$1 and account.id=$2
          and exists (
            select 1 from security_user_company_access target_access
             where target_access.tenant_id=account.tenant_id
               and target_access.user_id=account.id)
          and not exists (
            select 1 from security_user_company_access target_access
             where target_access.tenant_id=account.tenant_id
               and target_access.user_id=account.id
               and (target_access.revoked_at is null or not exists (
                 select 1 from security_user_company_access active_access
                  where active_access.tenant_id=account.tenant_id
                    and active_access.user_id=account.id and active_access.revoked_at is null))
               and not exists (
                 select 1 from security_user_company_access actor_access
                  where actor_access.tenant_id=target_access.tenant_id
                    and actor_access.user_id=$3 and actor_access.company_id=target_access.company_id
                    and actor_access.revoked_at is null))`,
      [context.tenantId, targetUserId, context.actor.userId],
    );
    if (!boundary.rowCount) {
      throw new SecurityAdministrationError(404, "USER_NOT_FOUND", "The user was not found.");
    }
  }

  private async filterDelegableRoles(
    client: PoolClient,
    context: SecurityActorContext,
    roles: readonly { policy_id: string; role_code: string; display_name: string }[],
  ): Promise<Array<{ policy_id: string; role_code: string; display_name: string }>> {
    if (roles.length === 0) return [];
    const [available, targets] = await Promise.all([
      client.query<{ permission_key: string; scope_kind: string; scope_value: string }>(
        `select delegation.permission_key,delegation.scope_kind,delegation.scope_value
           from security_role_permission_delegation delegation
           join security_user_role_assignment_version assignment
             on assignment.tenant_id=delegation.tenant_id
            and assignment.role_policy_id=delegation.role_policy_id
           join security_role_policy policy
             on policy.tenant_id=assignment.tenant_id and policy.id=assignment.role_policy_id
           join security_tenant_role role
             on role.tenant_id=policy.tenant_id and role.role_id=policy.role_id
          where assignment.tenant_id=$1 and assignment.user_id=$2
            and assignment.version=(select max(latest.version)
              from security_user_role_assignment_version latest
             where latest.tenant_id=assignment.tenant_id
               and latest.assignment_id=assignment.assignment_id)
            and assignment.lifecycle_state='active' and assignment.valid_from<=now()
            and (assignment.valid_until is null or assignment.valid_until>now())
            and policy.status='active' and policy.lifecycle_state='active'
            and role.lifecycle_state='active'`,
        [context.tenantId, context.actor.userId],
      ),
      client.query<{
        role_policy_id: string;
        permission_key: string;
        scope_kind: string;
        scope_value: string;
      }>(
        `select role_policy_id,permission_key,scope_kind,scope_value
           from security_role_scope_grant
          where tenant_id=$1 and role_policy_id=any($2::text[])
         union
         select role_policy_id,permission_key,scope_kind,scope_value
           from security_role_permission_delegation
          where tenant_id=$1 and role_policy_id=any($2::text[])`,
        [context.tenantId, roles.map((role) => role.policy_id)],
      ),
    ]);
    const covers = (
      grant: { permission_key: string; scope_kind: string; scope_value: string },
      target: { permission_key: string; scope_kind: string; scope_value: string },
    ) =>
      grant.permission_key === target.permission_key &&
      (grant.scope_kind === "tenant" ||
        (grant.scope_kind === target.scope_kind && grant.scope_value === target.scope_value));
    return roles.filter((role) => {
      const required = targets.rows.filter((target) => target.role_policy_id === role.policy_id);
      return required.length > 0 && required.every((target) => available.rows.some((grant) => covers(grant, target)));
    });
  }

  private async requireDelegation(
    client: PoolClient,
    context: SecurityActorContext,
    targets: readonly (readonly [string, string, string])[],
  ): Promise<void> {
    const result = await client.query<{ permission_key: string; scope_kind: string; scope_value: string }>(
      `select delegation.permission_key,delegation.scope_kind,delegation.scope_value
       from security_role_permission_delegation delegation
       join security_user_role_assignment_version assignment on assignment.tenant_id=delegation.tenant_id and assignment.role_policy_id=delegation.role_policy_id
       join security_role_policy policy on policy.tenant_id=assignment.tenant_id and policy.id=assignment.role_policy_id
       join security_tenant_role role on role.tenant_id=policy.tenant_id and role.role_id=policy.role_id
       where assignment.tenant_id=$1 and assignment.user_id=$2
         and assignment.version=(select max(latest.version) from security_user_role_assignment_version latest where latest.tenant_id=assignment.tenant_id and latest.assignment_id=assignment.assignment_id)
         and assignment.lifecycle_state='active' and assignment.valid_from<=now() and (assignment.valid_until is null or assignment.valid_until>now())
         and policy.status='active' and policy.lifecycle_state='active' and role.lifecycle_state='active'`,
      [context.tenantId, context.actor.userId],
    );
    const covers = (
      available: { permission_key: string; scope_kind: string; scope_value: string },
      target: readonly [string, string, string],
    ) =>
      available.permission_key === target[0] &&
      (available.scope_kind === "tenant" ||
        (available.scope_kind === target[1] && available.scope_value === target[2]));
    if (targets.some((target) => !result.rows.some((available) => covers(available, target))))
      throw new SecurityAdministrationError(
        403,
        "DELEGATION_DENIED",
        "Requested authority exceeds the actor's delegation ceiling.",
      );
  }

  private requireLoginDirectorySecret(): string {
    if (!this.loginDirectorySecret) {
      throw new SecurityAdministrationError(
        503,
        "USER_ADMINISTRATION_UNAVAILABLE",
        "User administration is not configured.",
      );
    }
    return this.loginDirectorySecret;
  }

  private async validateUserRequest(
    client: PoolClient,
    context: SecurityActorContext,
    request: CreateSecurityUserRequest,
    fullAdmin: boolean,
  ): Promise<void> {
    if (request.requested_action === "create" || request.requested_action === "edit") {
      this.requireLoginDirectorySecret();
      const duplicate = await client.query(
        `select 1
           from security_user_account account
           join security_password_credential credential
             on credential.tenant_id=account.tenant_id and credential.user_id=account.id
          where account.tenant_id=$1
            and ($2::text is null or account.id<>$2)
            and (lower(account.email)=lower($3) or credential.username=$4)
          limit 1`,
        [
          context.tenantId,
          request.requested_action === "edit" ? request.target_user_id : null,
          request.proposal.email,
          request.proposal.username,
        ],
      );
      if (duplicate.rowCount) throw this.conflict("The username or email is already in use.");
    }
    if (request.requested_action !== "create") {
      const account = await client.query<{ row_version: string; status: string }>(
        `select row_version,status from security_user_account where tenant_id=$1 and id=$2`,
        [context.tenantId, request.target_user_id],
      );
      if (!account.rows[0]) throw new SecurityAdministrationError(404, "USER_NOT_FOUND", "The user was not found.");
      if (Number(account.rows[0].row_version) !== request.expected_user_version) {
        throw this.conflict("The user account version has changed.");
      }
      if (!fullAdmin) await this.requireUserCompanyBoundary(client, context, request.target_user_id);
    }
    const companies =
      request.requested_action === "create" || request.requested_action === "company_access"
        ? request.proposal.companies
        : null;
    if (companies) {
      const companyIds = companies.map((company) => company.company_id);
      const known = await client.query<{ id: string }>(
        `select id from organization_unit
          where tenant_id=$1 and type='company' and status='active' and id=any($2::text[])`,
        [context.tenantId, companyIds],
      );
      if (known.rowCount !== companyIds.length) throw this.conflict("One or more companies are unavailable.");
      if (!fullAdmin) {
        const delegated = await client.query<{ company_id: string }>(
          `select company_id from security_user_company_access
            where tenant_id=$1 and user_id=$2 and revoked_at is null and company_id=any($3::text[])`,
          [context.tenantId, context.actor.userId, companyIds],
        );
        if (delegated.rowCount !== companyIds.length) {
          throw new SecurityAdministrationError(
            403,
            "DELEGATION_DENIED",
            "Requested company access exceeds the actor's governed boundary.",
          );
        }
      }
    }
    const employeeId =
      request.requested_action === "create" || request.requested_action === "employee_link"
        ? request.proposal.employee_id
        : null;
    if (employeeId) {
      const employee = await client.query(`select 1 from employee where tenant_id=$1 and id=$2`, [
        context.tenantId,
        employeeId,
      ]);
      if (!employee.rowCount) throw this.conflict("The employee is unavailable.");
      const assignment = await client.query<{ company_id: string }>(
        `select company_id from employee_assignment
          where tenant_id=$1 and employee_id=$2 and effective_from<=current_date
            and (effective_to is null or effective_to>=current_date)
          order by effective_from desc limit 1`,
        [context.tenantId, employeeId],
      );
      if (!assignment.rows[0]) throw this.conflict("The employee company assignment is unavailable.");
      const allowedCompanyIds =
        request.requested_action === "create"
          ? request.proposal.companies.map((company) => company.company_id)
          : (
              await client.query<{ company_id: string }>(
                `select company_id from security_user_company_access
                  where tenant_id=$1 and user_id=$2 and revoked_at is null`,
                [context.tenantId, request.target_user_id],
              )
            ).rows.map((company) => company.company_id);
      if (!allowedCompanyIds.includes(assignment.rows[0].company_id)) {
        throw new SecurityAdministrationError(
          403,
          "COMPANY_ACCESS_DENIED",
          "The employee is outside the governed user company boundary.",
        );
      }
      const targetUserId = request.requested_action === "employee_link" ? request.target_user_id : null;
      const binding = await client.query(
        `select 1 from employee_user_binding
          where tenant_id=$1 and employee_id=$2
            and effective_from<=current_date
            and (effective_to is null or effective_to>=current_date)
            and ($3::text is null or user_id<>$3)`,
        [context.tenantId, employeeId, targetUserId],
      );
      if (binding.rowCount) throw this.conflict("The employee already has an active user binding.");
    }
    if (request.requested_action === "create") {
      const policyIds = [...new Set(request.proposal.initial_role_policy_ids)];
      if (policyIds.length !== request.proposal.initial_role_policy_ids.length) {
        throw this.conflict("Initial roles must be unique.");
      }
      if (policyIds.length > 0) {
        const policies = await client.query<{ id: string; role_id: string }>(
          `select id,role_id from security_role_policy
            where tenant_id=$1 and id=any($2::text[]) and status='active' and lifecycle_state='active'`,
          [context.tenantId, policyIds],
        );
        if (policies.rowCount !== policyIds.length) throw this.conflict("One or more initial roles are unavailable.");
        if (!fullAdmin) {
          for (const policyId of policyIds) {
            const grants = await client.query<{ permission_key: string; scope_kind: string; scope_value: string }>(
              `select permission_key,scope_kind,scope_value from security_role_scope_grant
                where tenant_id=$1 and role_policy_id=$2
               union
               select permission_key,scope_kind,scope_value from security_role_permission_delegation
                where tenant_id=$1 and role_policy_id=$2`,
              [context.tenantId, policyId],
            );
            await this.requireDelegation(
              client,
              context,
              grants.rows.map((row) => [row.permission_key, row.scope_kind, row.scope_value]),
            );
          }
        }
        const roleIds = policies.rows.map((row) => row.role_id);
        const conflict = await client.query(
          `select 1 from security_role_assignment_sod_rule rule
            where rule.tenant_id=$1
              and rule.role_policy_id=any($2::text[])
              and rule.conflicting_role_id=any($3::text[])
            limit 1`,
          [context.tenantId, policyIds, roleIds],
        );
        if (conflict.rowCount) {
          throw new SecurityAdministrationError(
            403,
            "SOD_VIOLATION",
            "The initial roles violate separation of duties.",
          );
        }
      }
    }
  }

  private async decideUser(
    client: PoolClient,
    context: SecurityActorContext,
    action: SecurityApprovalAction,
    commandId: string,
    fullAdmin: boolean,
  ): Promise<{ mutation: Mutation; credentialDelivery?: string }> {
    const requestRow = await this.lockUserRequest(client, context.tenantId, action.request_id);
    if (requestRow.request_state !== "submitted" || Number(requestRow.row_version) !== action.expected_version) {
      throw this.conflict("The user approval state or version has changed.");
    }
    if (
      [requestRow.requested_by, requestRow.submitted_by, requestRow.target_user_id]
        .filter(Boolean)
        .includes(context.actor.userId)
    ) {
      throw new SecurityAdministrationError(
        403,
        "MAKER_CHECKER_VIOLATION",
        "User approval requires a distinct checker.",
      );
    }
    if (action.decision === "rejected" && !action.reason) {
      throw new SecurityAdministrationError(400, "DECISION_REASON_REQUIRED", "A rejection reason is required.");
    }
    const request = requestRow.proposed_user as CreateSecurityUserRequest;
    const before =
      request.requested_action === "create"
        ? cleanRow(requestRow)
        : cleanRow(await this.lockUser(client, context.tenantId, request.target_user_id));
    let userId = request.requested_action === "create" ? null : request.target_user_id;
    let credentialDelivery: string | undefined;
    if (action.decision === "approved") {
      await this.validateUserRequest(client, context, request, fullAdmin);
      if (request.requested_action === "create") {
        const created = await this.createApprovedUser(
          client,
          context,
          request,
          commandId,
          action.request_id,
          String(requestRow.requested_by),
        );
        userId = created.userId;
        credentialDelivery = created.oneTimePassword;
      } else {
        const applied = await this.applyApprovedUserChange(client, context, request, commandId, action.request_id);
        credentialDelivery = applied.oneTimePassword;
      }
    }
    await client.query(
      `update security_user_change_request
          set request_state=$3,applied_user_id=$4,decided_by=$5,decided_at=now(),
              decision_reason=$6,row_version=row_version+1
        where tenant_id=$1 and request_id=$2`,
      [
        context.tenantId,
        action.request_id,
        action.decision,
        request.requested_action === "create" ? userId : null,
        context.actor.userId,
        action.reason,
      ],
    );
    const after = userId
      ? cleanRow(await this.lockUser(client, context.tenantId, userId))
      : await this.userRequestState(client, context.tenantId, action.request_id);
    return {
      mutation: {
        entityType: "user_account",
        entityId: userId ?? action.request_id,
        before,
        after,
        approvalReference: action.request_id,
        outcome: action.decision === "approved" ? "completed" : "rejected",
      },
      ...(credentialDelivery ? { credentialDelivery } : {}),
    };
  }

  private async createApprovedUser(
    client: PoolClient,
    context: SecurityActorContext,
    request: Extract<CreateSecurityUserRequest, { requested_action: "create" }>,
    commandId: string,
    requestId: string,
    requestedBy: string,
  ): Promise<{ userId: string; oneTimePassword: string }> {
    const secret = this.requireLoginDirectorySecret();
    const userId = `user-${randomUUID()}`;
    const oneTimePassword = generateOneTimePassword();
    const verifier = await hashPassword(oneTimePassword);
    await client.query(
      `insert into security_user_account
        (id,tenant_id,identity_subject,email,status,mfa_state,created_at,updated_at,display_name)
       values ($1,$2,$3,$4,'active','disabled',now(),now(),$5)`,
      [
        userId,
        context.tenantId,
        `local:${userId}`,
        request.proposal.email.toLocaleLowerCase("en-US"),
        request.proposal.display_name,
      ],
    );
    await client.query(
      `insert into security_password_credential
        (tenant_id,user_id,username,algorithm,iterations,salt,password_hash,updated_at,
         argon2_hash,argon2_updated_at,must_change_password,credential_status)
       values ($1,$2,$3,null,null,null,null,now(),$4,now(),true,'reset_required')`,
      [context.tenantId, userId, request.proposal.username, verifier],
    );
    for (const [kind, value] of [
      ["email", request.proposal.email],
      ["username", request.proposal.username],
    ] as const) {
      await client.query(
        `insert into security_login_identifier
          (tenant_id,user_id,identifier_kind,identifier_hmac,lifecycle_state,source_reference)
         values ($1,$2,$3,$4,'active',$5)`,
        [
          context.tenantId,
          userId,
          kind,
          loginIdentifierHmac(secret, kind, value),
          `governed-user-request:${requestId}`,
        ],
      );
    }
    for (const company of request.proposal.companies) {
      await client.query(
        `insert into security_user_company_access
          (tenant_id,access_id,user_id,company_id,is_default,granted_by,
           approved_request_id,source_kind,source_reference)
         values ($1,$2,$3,$4,$5,$6,$7,'governed_administration',$8)`,
        [
          context.tenantId,
          `company-access-${randomUUID()}`,
          userId,
          company.company_id,
          company.is_default,
          context.actor.userId,
          requestId,
          `security-command:${commandId}`,
        ],
      );
    }
    if (request.proposal.employee_id) {
      await client.query(
        `insert into employee_user_binding
          (id,tenant_id,user_id,employee_id,effective_from,reason,created_by)
         values ($1,$2,$3,$4,current_date,'Approved governed user creation',$5)`,
        [`employee-user-${randomUUID()}`, context.tenantId, userId, request.proposal.employee_id, context.actor.userId],
      );
    }
    for (const policyId of request.proposal.initial_role_policy_ids) {
      await this.validateAssignmentSod(client, context.tenantId, userId, policyId, null);
      const assignmentId = `assignment-${randomUUID()}`;
      await client.query(
        `insert into security_user_role_assignment
          (tenant_id,user_id,role_policy_id,assigned_by,assigned_at,assignment_id,
           lifecycle_state,valid_from,approved_command_id)
         values ($1,$2,$3,$4,now(),$5,'active',now(),$6)`,
        [context.tenantId, userId, policyId, requestedBy, assignmentId, commandId],
      );
      await this.appendAssignmentVersion(client, context.tenantId, assignmentId, commandId);
    }
    return { userId, oneTimePassword };
  }

  private async applyApprovedUserChange(
    client: PoolClient,
    context: SecurityActorContext,
    request: Exclude<CreateSecurityUserRequest, { requested_action: "create" }>,
    commandId: string,
    requestId: string,
  ): Promise<{ oneTimePassword?: string }> {
    const account = await this.lockUser(client, context.tenantId, request.target_user_id);
    if (Number(account.row_version) !== request.expected_user_version) {
      throw this.conflict("The user account version has changed.");
    }
    if (request.requested_action === "edit") {
      const secret = this.requireLoginDirectorySecret();
      await client.query(
        `update security_user_account
            set display_name=$3,email=$4,row_version=row_version+1,updated_at=now()
          where tenant_id=$1 and id=$2`,
        [
          context.tenantId,
          request.target_user_id,
          request.proposal.display_name,
          request.proposal.email.toLocaleLowerCase("en-US"),
        ],
      );
      await client.query(
        `update security_password_credential set username=$3,updated_at=now()
          where tenant_id=$1 and user_id=$2`,
        [context.tenantId, request.target_user_id, request.proposal.username],
      );
      for (const [kind, value] of [
        ["email", request.proposal.email],
        ["username", request.proposal.username],
      ] as const) {
        await client.query(
          `update security_login_identifier
              set identifier_hmac=$4,source_reference=$5,updated_at=now()
            where tenant_id=$1 and user_id=$2 and identifier_kind=$3`,
          [
            context.tenantId,
            request.target_user_id,
            kind,
            loginIdentifierHmac(secret, kind, value),
            `governed-user-request:${requestId}`,
          ],
        );
      }
      return {};
    }
    if (request.requested_action === "activate" || request.requested_action === "unlock") {
      const coverage = await client.query<{ count: string; defaults: string }>(
        `select count(*)::text as count,
                count(*) filter (where is_default)::text as defaults
           from security_user_company_access
          where tenant_id=$1 and user_id=$2 and revoked_at is null`,
        [context.tenantId, request.target_user_id],
      );
      if (Number(coverage.rows[0]?.count) < 1 || Number(coverage.rows[0]?.defaults) !== 1) {
        throw this.conflict("An active user requires governed company access and one default company.");
      }
      await client.query(
        `update security_user_account
            set status='active',session_version=session_version+1,
                row_version=row_version+1,updated_at=now(),
                archived_by=null,archived_at=null,archive_reason=null
          where tenant_id=$1 and id=$2 and status in ('inactive','locked')`,
        [context.tenantId, request.target_user_id],
      );
      return {};
    }
    if (request.requested_action === "archive") {
      if (account.status === "inactive") throw this.conflict("The user is already inactive.");
      await client.query(
        `update security_user_company_access
            set revoked_by=$3,revoked_at=now(),revocation_reason=$4
          where tenant_id=$1 and user_id=$2 and revoked_at is null`,
        [context.tenantId, request.target_user_id, context.actor.userId, request.proposal.reason],
      );
      await client.query(
        `update employee_user_binding
            set effective_to=current_date,ended_by=$3,ended_at=now()
          where tenant_id=$1 and user_id=$2 and effective_from<=current_date
            and (effective_to is null or effective_to>=current_date)`,
        [context.tenantId, request.target_user_id, context.actor.userId],
      );
      await client.query(
        `update security_user_account
            set status='inactive',archived_by=$3,archived_at=now(),archive_reason=$4,
                session_version=session_version+1,row_version=row_version+1,updated_at=now()
          where tenant_id=$1 and id=$2`,
        [context.tenantId, request.target_user_id, context.actor.userId, request.proposal.reason],
      );
      await this.requireLastAdministrator(client, context.tenantId);
      return {};
    }
    if (request.requested_action === "reset_password") {
      const oneTimePassword = generateOneTimePassword();
      await client.query(
        `update security_password_credential
            set algorithm=null,iterations=null,salt=null,password_hash=null,
                argon2_hash=$3,argon2_updated_at=now(),must_change_password=true,
                credential_status='reset_required',password_version=password_version+1,
                password_changed_at=null,updated_at=now()
          where tenant_id=$1 and user_id=$2`,
        [context.tenantId, request.target_user_id, await hashPassword(oneTimePassword)],
      );
      await client.query(
        `update security_user_account
            set session_version=session_version+1,row_version=row_version+1,updated_at=now()
          where tenant_id=$1 and id=$2`,
        [context.tenantId, request.target_user_id],
      );
      return { oneTimePassword };
    }
    if (request.requested_action === "company_access") {
      const requested = new Map(request.proposal.companies.map((company) => [company.company_id, company]));
      const current = await client.query<{ company_id: string; is_default: boolean }>(
        `select company_id,is_default from security_user_company_access
          where tenant_id=$1 and user_id=$2 and revoked_at is null for update`,
        [context.tenantId, request.target_user_id],
      );
      for (const existing of current.rows) {
        const next = requested.get(existing.company_id);
        if (next && next.is_default === existing.is_default) {
          requested.delete(existing.company_id);
          continue;
        }
        await client.query(
          `update security_user_company_access
              set revoked_by=$3,revoked_at=now(),revocation_reason='Superseded by approved company access'
            where tenant_id=$1 and user_id=$2 and company_id=$4 and revoked_at is null`,
          [context.tenantId, request.target_user_id, context.actor.userId, existing.company_id],
        );
      }
      for (const company of requested.values()) {
        await client.query(
          `insert into security_user_company_access
            (tenant_id,access_id,user_id,company_id,is_default,granted_by,
             approved_request_id,source_kind,source_reference)
           values ($1,$2,$3,$4,$5,$6,$7,'governed_administration',$8)`,
          [
            context.tenantId,
            `company-access-${randomUUID()}`,
            request.target_user_id,
            company.company_id,
            company.is_default,
            context.actor.userId,
            requestId,
            `security-command:${commandId}`,
          ],
        );
      }
      await client.query(
        `update security_user_account set row_version=row_version+1,updated_at=now()
          where tenant_id=$1 and id=$2`,
        [context.tenantId, request.target_user_id],
      );
      return {};
    }
    const existing = await client.query<{ id: string }>(
      `select id from employee_user_binding
        where tenant_id=$1 and user_id=$2 and effective_from<=current_date
          and (effective_to is null or effective_to>=current_date) for update`,
      [context.tenantId, request.target_user_id],
    );
    for (const binding of existing.rows) {
      await client.query(
        `update employee_user_binding
            set effective_to=current_date,ended_by=$3,ended_at=now()
          where tenant_id=$1 and id=$2`,
        [context.tenantId, binding.id, context.actor.userId],
      );
    }
    if (request.proposal.employee_id) {
      await client.query(
        `insert into employee_user_binding
          (id,tenant_id,user_id,employee_id,effective_from,reason,created_by)
         values ($1,$2,$3,$4,current_date + $7::int,$5,$6)`,
        [
          `employee-user-${randomUUID()}`,
          context.tenantId,
          request.target_user_id,
          request.proposal.employee_id,
          request.proposal.reason,
          context.actor.userId,
          existing.rows.length > 0 ? 1 : 0,
        ],
      );
    }
    await client.query(
      `update security_user_account set row_version=row_version+1,updated_at=now()
        where tenant_id=$1 and id=$2`,
      [context.tenantId, request.target_user_id],
    );
    return {};
  }

  private async decideRole(
    client: PoolClient,
    context: SecurityActorContext,
    action: SecurityApprovalAction,
    commandId: string,
  ): Promise<Mutation> {
    const result = await client.query<Record<string, unknown>>(
      `select * from security_role_approval_request where tenant_id=$1 and request_id=$2 for update`,
      [context.tenantId, action.request_id],
    );
    const request = result.rows[0];
    if (!request)
      throw new SecurityAdministrationError(404, "APPROVAL_NOT_FOUND", "The role approval request was not found.");
    if (request.request_state !== "pending" || Number(request.row_version) !== action.expected_version)
      throw this.conflict("The role approval state or version has changed.");
    const current = await this.lockRole(client, context.tenantId, String(request.role_policy_id));
    if ([request.requested_by, current.created_by, current.submitted_by].filter(Boolean).includes(context.actor.userId))
      throw new SecurityAdministrationError(
        403,
        "MAKER_CHECKER_VIOLATION",
        "Role approval requires a distinct checker.",
      );
    const policyId = String(request.role_policy_id);
    const before = await this.roleState(client, context.tenantId, policyId);
    const requestedAction = String(request.requested_action);
    if (action.decision === "approved") {
      if (requestedAction === "approve") {
        if (current.lifecycle_state !== "submitted") throw this.conflict("Only submitted roles can be approved.");
        await client.query(
          `update security_role_policy set lifecycle_state='approved',approved_by=$3,approved_at=now(),row_version=row_version+1 where tenant_id=$1 and id=$2`,
          [context.tenantId, policyId, context.actor.userId],
        );
      } else if (requestedAction === "activate") {
        if (current.lifecycle_state !== "approved") throw this.conflict("Only approved roles can be activated.");
        const previous = await client.query<{ id: string }>(
          `select id from security_role_policy where tenant_id=$1 and role_id=$2 and lifecycle_state='active' and id<>$3 for update`,
          [context.tenantId, current.role_id, policyId],
        );
        for (const item of previous.rows) {
          const assignments = await client.query<{ assignment_id: string }>(
            `select assignment_id from security_user_role_assignment where tenant_id=$1 and role_policy_id=$2 and lifecycle_state='active' for update`,
            [context.tenantId, item.id],
          );
          await client.query(
            `update security_role_policy set lifecycle_state='archived',status='inactive',archived_by=$3,archived_at=now(),row_version=row_version+1 where tenant_id=$1 and id=$2`,
            [context.tenantId, item.id, context.actor.userId],
          );
          for (const assignment of assignments.rows) {
            await client.query(
              `update security_user_role_assignment set role_policy_id=$3,row_version=row_version+1,approved_command_id=$4 where tenant_id=$1 and assignment_id=$2`,
              [context.tenantId, assignment.assignment_id, policyId, commandId],
            );
            await this.appendAssignmentVersion(client, context.tenantId, assignment.assignment_id, commandId);
          }
        }
        await client.query(
          `update security_role_policy set lifecycle_state='active',status='active',activated_by=$3,activated_at=now(),row_version=row_version+1 where tenant_id=$1 and id=$2`,
          [context.tenantId, policyId, context.actor.userId],
        );
      } else {
        if (current.lifecycle_state !== "active") throw this.conflict("Only active roles can be archived.");
        await client.query(
          `update security_role_policy set lifecycle_state='archived',status='inactive',archived_by=$3,archived_at=now(),row_version=row_version+1 where tenant_id=$1 and id=$2`,
          [context.tenantId, policyId, context.actor.userId],
        );
        await client.query(
          `update security_tenant_role set lifecycle_state='archived',archived_by=$3,archived_at=now(),row_version=row_version+1 where tenant_id=$1 and role_id=$2`,
          [context.tenantId, current.role_id, context.actor.userId],
        );
        await this.requireLastAdministrator(client, context.tenantId);
      }
    } else if (requestedAction === "approve") {
      await client.query(
        `update security_role_policy set lifecycle_state='draft',submitted_by=null,submitted_at=null,row_version=row_version+1 where tenant_id=$1 and id=$2`,
        [context.tenantId, policyId],
      );
    }
    await client.query(
      `update security_role_approval_request set request_state=$3,decided_by=$4,decided_at=now(),decision_reason=$5,row_version=row_version+1 where tenant_id=$1 and request_id=$2`,
      [context.tenantId, action.request_id, action.decision, context.actor.userId, action.reason],
    );
    return {
      entityType: "role_policy",
      entityId: policyId,
      before,
      after: await this.roleState(client, context.tenantId, policyId),
      approvalReference: action.request_id,
      outcome: action.decision === "approved" ? "completed" : "rejected",
    };
  }

  private async decideAssignment(
    client: PoolClient,
    context: SecurityActorContext,
    action: SecurityApprovalAction,
    commandId: string,
    fullAdmin: boolean,
  ): Promise<Mutation> {
    const request = await this.lockAssignmentRequest(client, context.tenantId, action.request_id);
    if (
      !["submitted", "pending"].includes(String(request.request_state)) ||
      Number(request.row_version) !== action.expected_version
    )
      throw this.conflict("The assignment approval state or version has changed.");
    if (
      [request.requested_by, request.submitted_by, request.target_user_id]
        .filter(Boolean)
        .includes(context.actor.userId)
    )
      throw new SecurityAdministrationError(
        403,
        "MAKER_CHECKER_VIOLATION",
        "Assignment approval requires a distinct checker.",
      );
    const before = cleanRow(request);
    let assignmentId = request.assignment_id ? String(request.assignment_id) : null;
    if (action.decision === "approved") {
      const proposal = request.proposed_assignment as CreateSecurityAssignmentRequest["proposal"];
      const requestedAction = request.requested_action as "create" | "edit" | "revoke";
      await this.validateAssignment(client, context, requestedAction, proposal, fullAdmin);
      if (requestedAction === "create") {
        await this.validateAssignmentSod(
          client,
          context.tenantId,
          proposal.target_user_id,
          proposal.role_policy_id,
          null,
        );
        assignmentId = `assignment-${randomUUID()}`;
        await client.query(
          `insert into security_user_role_assignment
            (tenant_id,user_id,role_policy_id,assigned_by,assigned_at,assignment_id,lifecycle_state,valid_from,valid_until,approved_command_id)
           values ($1,$2,$3,$4,now(),$5,'active',$6,$7,$8)`,
          [
            context.tenantId,
            proposal.target_user_id,
            proposal.role_policy_id,
            request.requested_by,
            assignmentId,
            proposal.valid_from,
            proposal.valid_until,
            commandId,
          ],
        );
      } else if (requestedAction === "edit") {
        assignmentId = proposal.assignment_id;
        if (!assignmentId) throw this.conflict("The assignment identifier is required.");
        await this.validateAssignmentSod(
          client,
          context.tenantId,
          proposal.target_user_id,
          proposal.role_policy_id,
          assignmentId,
        );
        await client.query(
          `update security_user_role_assignment set role_policy_id=$3,valid_from=$4,valid_until=$5,row_version=row_version+1,approved_command_id=$6 where tenant_id=$1 and assignment_id=$2 and lifecycle_state='active'`,
          [
            context.tenantId,
            assignmentId,
            proposal.role_policy_id,
            proposal.valid_from,
            proposal.valid_until,
            commandId,
          ],
        );
      } else {
        assignmentId = proposal.assignment_id;
        if (!assignmentId || !proposal.revocation_reason) throw this.conflict("A revocation reason is required.");
        await client.query(
          `update security_user_role_assignment set lifecycle_state='revoked',revoked_by=$3,revoked_at=now(),revocation_reason=$4,row_version=row_version+1,approved_command_id=$5 where tenant_id=$1 and assignment_id=$2 and lifecycle_state='active'`,
          [context.tenantId, assignmentId, context.actor.userId, proposal.revocation_reason, commandId],
        );
      }
      if (!assignmentId) throw this.conflict("The assignment could not be established.");
      await this.appendAssignmentVersion(client, context.tenantId, assignmentId, commandId);
      if (requestedAction !== "create") await this.requireLastAdministrator(client, context.tenantId);
    }
    await client.query(
      `update security_assignment_approval_request set request_state=$3,assignment_id=$4,decided_by=$5,decided_at=now(),decision_reason=$6,row_version=row_version+1 where tenant_id=$1 and request_id=$2`,
      [context.tenantId, action.request_id, action.decision, assignmentId, context.actor.userId, action.reason],
    );
    const after = await this.assignmentRequestState(client, context.tenantId, action.request_id);
    return {
      entityType: "role_assignment",
      entityId: assignmentId ?? action.request_id,
      before,
      after,
      approvalReference: action.request_id,
      outcome: action.decision === "approved" ? "completed" : "rejected",
    };
  }

  private async validateAssignmentSod(
    client: PoolClient,
    tenantId: string,
    userId: string,
    policyId: string,
    excludedId: string | null,
  ): Promise<void> {
    const target = await client.query<{ role_id: string }>(
      `select role_id from security_role_policy where tenant_id=$1 and id=$2`,
      [tenantId, policyId],
    );
    if (!target.rows[0]?.role_id) throw this.conflict("Governed assignments require a normalized role.");
    const current = await client.query<{ assignment_id: string; role_id: string }>(
      `select assignment.assignment_id,policy.role_id from security_user_role_assignment assignment
       join security_role_policy policy on policy.tenant_id=assignment.tenant_id and policy.id=assignment.role_policy_id
       where assignment.tenant_id=$1 and assignment.user_id=$2 and assignment.lifecycle_state='active'
         and assignment.valid_from<=now() and (assignment.valid_until is null or assignment.valid_until>now())
         and ($3::text is null or assignment.assignment_id<>$3) for update of assignment`,
      [tenantId, userId, excludedId],
    );
    const roles = current.rows.map((row) => row.role_id);
    if (roles.includes(target.rows[0].role_id)) throw this.conflict("The user already has this effective role.");
    const conflict = await client.query(
      `select 1 from security_role_assignment_sod_rule rule
       join security_role_policy policy on policy.tenant_id=rule.tenant_id and policy.id=rule.role_policy_id
       where rule.tenant_id=$1 and ((rule.role_policy_id=$2 and rule.conflicting_role_id=any($3::text[])) or (policy.role_id=any($3::text[]) and rule.conflicting_role_id=$4)) limit 1`,
      [tenantId, policyId, roles, target.rows[0].role_id],
    );
    if (conflict.rowCount)
      throw new SecurityAdministrationError(403, "SOD_VIOLATION", "The role assignment violates separation of duties.");
  }

  private async writeRoleProjection(
    client: PoolClient,
    tenantId: string,
    policyId: string,
    draft: CreateSecurityRoleRequest,
  ): Promise<void> {
    const scopeRows: Array<[string, string]> =
      draft.scope.mode === "tenant"
        ? [["tenant", tenantId]]
        : draft.scope.mode === "own"
          ? [["owner", "actor"]]
          : draft.scope.company_ids.map((companyId) => ["company", companyId]);
    const allowMode =
      draft.field_rules.allow === null ? "all" : draft.field_rules.allow.length === 0 ? "none" : "explicit";
    for (const permission of [...draft.permissions].sort()) {
      await client.query(
        `insert into security_role_permission_grant (tenant_id,role_policy_id,permission_key,field_allow_mode) values ($1,$2,$3,$4)`,
        [tenantId, policyId, permission, allowMode],
      );
      for (const [kind, value] of scopeRows)
        await client.query(
          `insert into security_role_scope_grant (tenant_id,role_policy_id,permission_key,scope_kind,scope_value) values ($1,$2,$3,$4,$5)`,
          [tenantId, policyId, permission, kind, value],
        );
      for (const field of draft.field_rules.allow ?? [])
        await client.query(
          `insert into security_role_field_grant (tenant_id,role_policy_id,permission_key,field_name,effect) values ($1,$2,$3,$4,'allow')`,
          [tenantId, policyId, permission, field],
        );
      for (const field of draft.field_rules.deny)
        await client.query(
          `insert into security_role_field_grant (tenant_id,role_policy_id,permission_key,field_name,effect) values ($1,$2,$3,$4,'deny')`,
          [tenantId, policyId, permission, field],
        );
      for (const state of draft.allowed_source_states[permission] ?? [])
        await client.query(
          `insert into security_role_source_state (tenant_id,role_policy_id,permission_key,source_state) values ($1,$2,$3,$4)`,
          [tenantId, policyId, permission, state],
        );
      for (const field of draft.sod_rules.distinct_actor_fields)
        await client.query(
          `insert into security_role_transaction_sod_rule (tenant_id,role_policy_id,permission_key,conflicting_actor_attribute) values ($1,$2,$3,$4)`,
          [tenantId, policyId, permission, field],
        );
    }
    for (const roleCode of draft.sod_rules.conflicting_roles) {
      const role = await client.query<{ role_id: string }>(
        `select role_id from security_tenant_role where tenant_id=$1 and role_code=$2 and lifecycle_state='active'`,
        [tenantId, roleCode],
      );
      if (!role.rows[0])
        throw new SecurityAdministrationError(
          404,
          "CONFLICTING_ROLE_NOT_FOUND",
          "A configured conflicting role does not exist in this tenant.",
        );
      await client.query(
        `insert into security_role_assignment_sod_rule (tenant_id,role_policy_id,conflicting_role_id) values ($1,$2,$3)`,
        [tenantId, policyId, role.rows[0].role_id],
      );
    }
    for (const grant of draft.delegations)
      await client.query(
        `insert into security_role_permission_delegation (tenant_id,role_policy_id,permission_key,scope_kind,scope_value) values ($1,$2,$3,$4,$5)`,
        [tenantId, policyId, grant.permission, grant.scope_kind, grant.scope_value],
      );
  }

  private async clearRoleProjection(client: PoolClient, tenantId: string, policyId: string): Promise<void> {
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
  }

  private async appendAssignmentVersion(
    client: PoolClient,
    tenantId: string,
    assignmentId: string,
    commandId: string,
  ): Promise<void> {
    const result = await client.query<Record<string, unknown>>(
      `select * from security_user_role_assignment where tenant_id=$1 and assignment_id=$2 for update`,
      [tenantId, assignmentId],
    );
    const row = result.rows[0];
    if (!row) throw new SecurityAdministrationError(404, "ASSIGNMENT_NOT_FOUND", "The assignment was not found.");
    const versionResult = await client.query<{ version: number | null }>(
      `select max(version)::int as version from security_user_role_assignment_version where tenant_id=$1 and assignment_id=$2`,
      [tenantId, assignmentId],
    );
    const previous = versionResult.rows[0]?.version ?? null;
    const version = previous === null ? 1 : previous + 1;
    await client.query(
      `insert into security_user_role_assignment_version
       (tenant_id,assignment_id,version,supersedes_version,user_id,role_policy_id,lifecycle_state,valid_from,valid_until,assigned_by,revoked_by,revoked_at,revocation_reason,administration_command_id,source_kind)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'governed')`,
      [
        tenantId,
        assignmentId,
        version,
        previous,
        row.user_id,
        row.role_policy_id,
        row.lifecycle_state,
        row.valid_from,
        row.valid_until,
        row.assigned_by,
        row.revoked_by,
        row.revoked_at,
        row.revocation_reason,
        commandId,
      ],
    );
  }

  private async requireLastAdministrator(client: PoolClient, tenantId: string): Promise<void> {
    const result = await client.query<{ count: string }>(
      `select count(distinct assignment.user_id)::text as count
       from security_user_role_assignment assignment
       join security_user_account account on account.tenant_id=assignment.tenant_id and account.id=assignment.user_id
       join security_role_policy policy on policy.tenant_id=assignment.tenant_id and policy.id=assignment.role_policy_id
       join security_tenant_role role on role.tenant_id=policy.tenant_id and role.role_id=policy.role_id
       where assignment.tenant_id=$1 and account.status='active' and assignment.lifecycle_state='active'
         and assignment.valid_from<=now() and (assignment.valid_until is null or assignment.valid_until>now())
         and policy.status='active' and policy.lifecycle_state='active' and role.lifecycle_state='active'
         and policy.scope->>'mode'='tenant' and policy.permissions @> '["security.authorization.administer"]'::jsonb`,
      [tenantId],
    );
    if (Number(result.rows[0]?.count ?? 0) < 1)
      throw new SecurityAdministrationError(
        409,
        "LAST_ADMINISTRATOR_PROTECTED",
        "The operation would remove the tenant's last administrator.",
      );
  }

  private async appendAudit(
    client: PoolClient,
    context: SecurityActorContext,
    action: string,
    mutation: Mutation,
  ): Promise<string> {
    await client.query("select pg_advisory_xact_lock(hashtextextended($1, 0))", [
      `nexora:security:audit:${context.tenantId}`,
    ]);
    const latest = await client.query<{ sequence: string; event_hash: string }>(
      `select sequence,event_hash from security_audit_event where tenant_id=$1 order by sequence desc limit 1`,
      [context.tenantId],
    );
    const sequence = latest.rows[0] ? Number(latest.rows[0].sequence) + 1 : 1;
    const previousEventHash = latest.rows[0]?.event_hash ?? stateHash({ genesis: context.tenantId });
    const id = randomUUID();
    const occurredAt = new Date().toISOString();
    const beforeHash = stateHash(mutation.before);
    const afterHash = stateHash(mutation.after);
    const payload = {
      id,
      tenant_id: context.tenantId,
      actor_id: context.actor.userId,
      correlation_id: context.correlationId,
      action,
      entity_type: mutation.entityType,
      entity_id: mutation.entityId,
      before_hash: beforeHash,
      after_hash: afterHash,
      source_reference: "governed_authorization_administration",
      approval_reference: mutation.approvalReference ?? null,
      occurred_at: occurredAt,
      sequence,
      previous_event_hash: previousEventHash,
    };
    const eventHash = stateHash(payload);
    await client.query(
      `insert into security_audit_event
       (id,tenant_id,actor_id,correlation_id,action,entity_type,entity_id,before_hash,after_hash,source_reference,approval_reference,occurred_at,sequence,previous_event_hash,event_hash)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
      [
        id,
        context.tenantId,
        context.actor.userId,
        context.correlationId,
        action,
        mutation.entityType,
        mutation.entityId,
        beforeHash,
        afterHash,
        payload.source_reference,
        payload.approval_reference,
        occurredAt,
        sequence,
        previousEventHash,
        eventHash,
      ],
    );
    return id;
  }

  private async listUserRows(
    client: PoolClient,
    tenantId: string,
    userId: string,
  ): Promise<{
    account: Omit<SecurityUserDetail, "companies" | "roles" | "employee" | "must_change_password"> | null;
    companies: SecurityUserDetail["companies"];
    roles: SecurityUserDetail["roles"];
    employee: SecurityUserDetail["employee"];
    mustChangePassword: boolean;
  }> {
    const accountResult = await client.query<Record<string, unknown>>(
      `select account.id,coalesce(account.display_name,account.email) as display_name,
              credential.username,account.email,account.status,account.row_version,account.updated_at,account.archived_at,
              credential.must_change_password,
              (select jsonb_build_object('id',company.id,'name',company.name,'is_default',true)
                 from security_user_company_access access
                 join organization_unit company
                   on company.tenant_id=access.tenant_id and company.id=access.company_id
                where access.tenant_id=account.tenant_id and access.user_id=account.id
                  and access.revoked_at is null and access.is_default limit 1) as default_company,
              coalesce((select array_agg(distinct role.display_name order by role.display_name)
                 from security_user_role_assignment assignment
                 join security_role_policy policy
                   on policy.tenant_id=assignment.tenant_id and policy.id=assignment.role_policy_id
                 join security_tenant_role role
                   on role.tenant_id=policy.tenant_id and role.role_id=policy.role_id
                where assignment.tenant_id=account.tenant_id and assignment.user_id=account.id
                  and assignment.lifecycle_state='active' and assignment.valid_from<=now()
                  and (assignment.valid_until is null or assignment.valid_until>now())), '{}') as role_names,
              exists (select 1 from employee_user_binding binding
                where binding.tenant_id=account.tenant_id and binding.user_id=account.id
                  and binding.effective_from<=current_date
                  and (binding.effective_to is null or binding.effective_to>=current_date)) as employee_linked,
              (select count(*)::int from security_user_change_request request
                where request.tenant_id=account.tenant_id
                  and (request.target_user_id=account.id or request.applied_user_id=account.id)
                  and request.request_state in ('draft','submitted')) as pending_request_count
         from security_user_account account
         join security_password_credential credential
           on credential.tenant_id=account.tenant_id and credential.user_id=account.id
        where account.tenant_id=$1 and account.id=$2`,
      [tenantId, userId],
    );
    const row = accountResult.rows[0];
    if (!row) {
      return { account: null, companies: [], roles: [], employee: null, mustChangePassword: false };
    }
    const [companyResult, roleResult, employeeResult] = await Promise.all([
      client.query<{ id: string; name: string; is_default: boolean }>(
        `select company.id,company.name,access.is_default
           from security_user_company_access access
           join organization_unit company
             on company.tenant_id=access.tenant_id and company.id=access.company_id
          where access.tenant_id=$1 and access.user_id=$2 and access.revoked_at is null
          order by access.is_default desc,company.name,company.id`,
        [tenantId, userId],
      ),
      client.query<SecurityUserDetail["roles"][number]>(
        `select assignment.assignment_id,policy.id as role_policy_id,policy.role as role_code,
                role.display_name,assignment.valid_from,assignment.valid_until
           from security_user_role_assignment assignment
           join security_role_policy policy
             on policy.tenant_id=assignment.tenant_id and policy.id=assignment.role_policy_id
           join security_tenant_role role
             on role.tenant_id=policy.tenant_id and role.role_id=policy.role_id
          where assignment.tenant_id=$1 and assignment.user_id=$2
            and assignment.lifecycle_state='active' and assignment.valid_from<=now()
            and (assignment.valid_until is null or assignment.valid_until>now())
          order by role.display_name,assignment.assignment_id`,
        [tenantId, userId],
      ),
      client.query<{ id: string; employee_number: string; display_name: string }>(
        `select employee.id,employee.employee_number,
                concat_ws(' ',employee.first_name,employee.middle_name,employee.last_name) as display_name
           from employee_user_binding binding
           join employee on employee.tenant_id=binding.tenant_id and employee.id=binding.employee_id
          where binding.tenant_id=$1 and binding.user_id=$2
            and binding.effective_from<=current_date
            and (binding.effective_to is null or binding.effective_to>=current_date)
          order by binding.effective_from desc limit 1`,
        [tenantId, userId],
      ),
    ]);
    return {
      account: {
        id: String(row.id),
        display_name: String(row.display_name),
        username: String(row.username),
        email: String(row.email),
        status: row.status as "active" | "inactive" | "locked",
        row_version: Number(row.row_version),
        default_company: (row.default_company as SecurityUserDetail["default_company"]) ?? null,
        role_names: row.role_names as string[],
        employee_linked: Boolean(row.employee_linked),
        pending_request_count: Number(row.pending_request_count),
        updated_at: new Date(row.updated_at as string | Date).toISOString(),
        archived_at: row.archived_at ? new Date(row.archived_at as string | Date).toISOString() : null,
      },
      companies: companyResult.rows,
      roles: roleResult.rows.map((role) => ({
        ...role,
        valid_from: new Date(role.valid_from).toISOString(),
        valid_until: role.valid_until ? new Date(role.valid_until).toISOString() : null,
      })),
      employee: employeeResult.rows[0] ?? null,
      mustChangePassword: Boolean(row.must_change_password),
    };
  }

  private async userRequestState(
    client: PoolClient,
    tenantId: string,
    requestId: string,
  ): Promise<Record<string, unknown>> {
    const result = await client.query<Record<string, unknown>>(
      `select * from security_user_change_request where tenant_id=$1 and request_id=$2`,
      [tenantId, requestId],
    );
    if (!result.rows[0]) {
      throw new SecurityAdministrationError(404, "APPROVAL_NOT_FOUND", "The user request was not found.");
    }
    return cleanRow(result.rows[0]);
  }

  private async lockUserRequest(
    client: PoolClient,
    tenantId: string,
    requestId: string,
  ): Promise<Record<string, unknown>> {
    const result = await client.query<Record<string, unknown>>(
      `select * from security_user_change_request where tenant_id=$1 and request_id=$2 for update`,
      [tenantId, requestId],
    );
    if (!result.rows[0]) {
      throw new SecurityAdministrationError(404, "APPROVAL_NOT_FOUND", "The user request was not found.");
    }
    return result.rows[0];
  }

  private async lockUser(client: PoolClient, tenantId: string, userId: string): Promise<Record<string, unknown>> {
    const result = await client.query<Record<string, unknown>>(
      `select id,email,status,display_name,session_version,row_version,updated_at,
              archived_by,archived_at,archive_reason
         from security_user_account where tenant_id=$1 and id=$2 for update`,
      [tenantId, userId],
    );
    if (!result.rows[0]) throw new SecurityAdministrationError(404, "USER_NOT_FOUND", "The user was not found.");
    return result.rows[0];
  }

  private async roleState(client: PoolClient, tenantId: string, policyId: string): Promise<Record<string, unknown>> {
    const result = await client.query<Record<string, unknown>>(
      `select policy.id as policy_id,policy.role_id,policy.role as role_code,role.display_name,role.description,
              policy.scope,policy.permissions,policy.field_rules,policy.sod_rules,policy.version,policy.status,
              policy.lifecycle_state,policy.row_version,policy.created_by,policy.submitted_by,policy.submitted_at,
              policy.approved_by,policy.approved_at,policy.activated_by,policy.activated_at,policy.archived_by,policy.archived_at
       from security_role_policy policy join security_tenant_role role on role.tenant_id=policy.tenant_id and role.role_id=policy.role_id
       where policy.tenant_id=$1 and policy.id=$2`,
      [tenantId, policyId],
    );
    if (!result.rows[0]) throw new SecurityAdministrationError(404, "ROLE_NOT_FOUND", "The role policy was not found.");
    return cleanRow(result.rows[0]);
  }

  private async assignmentRequestState(
    client: PoolClient,
    tenantId: string,
    requestId: string,
  ): Promise<Record<string, unknown>> {
    const result = await client.query<Record<string, unknown>>(
      `select * from security_assignment_approval_request where tenant_id=$1 and request_id=$2`,
      [tenantId, requestId],
    );
    if (!result.rows[0])
      throw new SecurityAdministrationError(404, "APPROVAL_NOT_FOUND", "The assignment request was not found.");
    return cleanRow(result.rows[0]);
  }

  private async lockRole(client: PoolClient, tenantId: string, policyId: string): Promise<Record<string, unknown>> {
    const result = await client.query<Record<string, unknown>>(
      `select * from security_role_policy where tenant_id=$1 and id=$2 for update`,
      [tenantId, policyId],
    );
    if (!result.rows[0]) throw new SecurityAdministrationError(404, "ROLE_NOT_FOUND", "The role policy was not found.");
    return result.rows[0];
  }

  private async lockAssignmentRequest(
    client: PoolClient,
    tenantId: string,
    requestId: string,
  ): Promise<Record<string, unknown>> {
    const result = await client.query<Record<string, unknown>>(
      `select * from security_assignment_approval_request where tenant_id=$1 and request_id=$2 for update`,
      [tenantId, requestId],
    );
    if (!result.rows[0])
      throw new SecurityAdministrationError(404, "APPROVAL_NOT_FOUND", "The assignment request was not found.");
    return result.rows[0];
  }

  private conflict(message: string): SecurityAdministrationError {
    return new SecurityAdministrationError(409, "ADMINISTRATION_CONFLICT", message);
  }
}
