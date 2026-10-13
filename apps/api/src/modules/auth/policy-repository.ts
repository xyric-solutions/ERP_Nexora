import type {
  PolicyAssignment,
  PolicyAssignmentConflict,
  PolicyAssuranceLevel,
  PolicyPermissionGrant,
  PolicySnapshot,
  PolicySnapshotRepository,
  PolicyTransactionConflict,
} from "@nexora/auth";
import type { DatabasePool } from "@nexora/db";

interface UserRow {
  id: string;
  status: string;
}

interface AssignmentRow {
  assignment_id: string;
  role_id: string;
  status: "active" | "revoked";
  valid_from: Date;
  valid_until: Date | null;
}

interface ScopeGrantRow {
  assignment_id: string;
  scope_id: string;
  include_descendants: boolean;
}

interface PermissionGrantRow {
  assignment_id: string;
  permission_key: string;
  required_assurance: PolicyAssuranceLevel;
  field_bearing: boolean;
  state_context_required: boolean;
  allowed_source_states: string[];
  allowed_fields: string[];
}

interface AssignmentConflictRow {
  first_role_id: string;
  second_role_id: string;
}

interface TransactionConflictRow {
  protected_permission_key: string;
  actor_relation: string;
  applicable_source_states: string[];
}

function groupByAssignment<T extends { assignment_id: string }>(rows: readonly T[]): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const row of rows) {
    const values = grouped.get(row.assignment_id) ?? [];
    values.push(row);
    grouped.set(row.assignment_id, values);
  }
  return grouped;
}

export class PostgresPolicySnapshotRepository implements PolicySnapshotRepository {
  constructor(private readonly pool: DatabasePool) {}

  async loadSnapshot(userId: string, evaluatedAt: Date): Promise<PolicySnapshot | null> {
    const client = await this.pool.connect();
    try {
      await client.query("begin isolation level repeatable read read only");

      const userResult = await client.query<UserRow>("select id, status from app_user where id = $1", [userId]);
      const user = userResult.rows[0];
      if (!user) {
        await client.query("commit");
        return null;
      }

      const assignmentResult = await client.query<AssignmentRow>(
        `select assignment.id as assignment_id, assignment.role_id, assignment.status,
                assignment.valid_from, assignment.valid_until
         from security_role_assignment assignment
         join security_role role on role.id = assignment.role_id and role.status = 'active'
         where assignment.user_id = $1
           and assignment.status = 'active'
           and assignment.valid_from <= $2
           and (assignment.valid_until is null or assignment.valid_until > $2)
         order by assignment.id`,
        [userId, evaluatedAt],
      );
      const assignmentIds = assignmentResult.rows.map((row) => row.assignment_id);

      const [scopeResult, permissionResult, assignmentConflictResult, transactionConflictResult] = await Promise.all([
        client.query<ScopeGrantRow>(
          `select assignment_scope.assignment_id, assignment_scope.scope_id,
                    assignment_scope.include_descendants
             from security_assignment_scope assignment_scope
             join security_scope scope on scope.id = assignment_scope.scope_id and scope.status = 'active'
             where assignment_scope.assignment_id = any($1::uuid[])
             order by assignment_scope.assignment_id, assignment_scope.scope_id`,
          [assignmentIds],
        ),
        client.query<PermissionGrantRow>(
          `select assignment.id as assignment_id, permission.permission_key,
                    permission.required_assurance, permission.field_bearing,
                    permission.state_context_required,
                    coalesce(array_agg(distinct permission_state.source_state)
                      filter (where permission_state.source_state is not null), '{}') as allowed_source_states,
                    coalesce(array_agg(distinct field_grant.field_path)
                      filter (where field_grant.field_path is not null), '{}') as allowed_fields
             from security_role_assignment assignment
             join security_role_permission role_permission on role_permission.role_id = assignment.role_id
             join security_permission permission
               on permission.id = role_permission.permission_id and permission.status = 'active'
             left join security_permission_state permission_state
               on permission_state.permission_id = permission.id
             left join security_field_grant field_grant
               on field_grant.role_id = assignment.role_id
              and field_grant.permission_id = permission.id
             where assignment.id = any($1::uuid[])
             group by assignment.id, permission.id
             order by assignment.id, permission.permission_key`,
          [assignmentIds],
        ),
        client.query<AssignmentConflictRow>(
          `select first_role_id, second_role_id
             from security_sod_policy
             where policy_kind = 'assignment_conflict' and status = 'active'
             order by first_role_id, second_role_id`,
        ),
        client.query<TransactionConflictRow>(
          `select permission.permission_key as protected_permission_key,
                    policy.actor_relation, policy.applicable_source_states
             from security_sod_policy policy
             join security_permission permission on permission.id = policy.protected_permission_id
             where policy.policy_kind = 'transaction_conflict'
               and policy.status = 'active'
               and permission.status = 'active'
             order by permission.permission_key, policy.actor_relation`,
        ),
      ]);

      const scopes = groupByAssignment(scopeResult.rows);
      const permissions = groupByAssignment(permissionResult.rows);
      const assignments: PolicyAssignment[] = assignmentResult.rows.map((row) => ({
        assignmentId: row.assignment_id,
        roleId: row.role_id,
        status: row.status,
        validFrom: row.valid_from,
        validUntil: row.valid_until,
        scopeGrants: (scopes.get(row.assignment_id) ?? []).map((scope) => ({
          scopeId: scope.scope_id,
          includeDescendants: scope.include_descendants,
        })),
        permissionGrants: (permissions.get(row.assignment_id) ?? []).map((permission): PolicyPermissionGrant => ({
          permissionKey: permission.permission_key,
          requiredAssurance: permission.required_assurance,
          fieldBearing: permission.field_bearing,
          stateContextRequired: permission.state_context_required,
          allowedSourceStates: [...permission.allowed_source_states].sort(),
          allowedFields: [...permission.allowed_fields].sort(),
        })),
      }));
      const assignmentConflicts: PolicyAssignmentConflict[] = assignmentConflictResult.rows.map((row) => ({
        firstRoleId: row.first_role_id,
        secondRoleId: row.second_role_id,
      }));
      const transactionConflicts: PolicyTransactionConflict[] = transactionConflictResult.rows.map((row) => ({
        protectedPermissionKey: row.protected_permission_key,
        actorRelation: row.actor_relation,
        applicableSourceStates: [...row.applicable_source_states].sort(),
      }));

      await client.query("commit");
      return {
        userId: user.id,
        userActive: user.status === "active",
        assignments,
        assignmentConflicts,
        transactionConflicts,
      };
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
}
