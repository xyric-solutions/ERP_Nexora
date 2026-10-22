import type { PoolClient } from "pg";
import { HrApiError, type HrActorContext } from "./source-repository.js";
const deny = (): never => {
  throw new HrApiError(403, "PERMISSION_DENIED", "Current company-scoped HR authority is required.");
};
export async function requireHrCompanyPermission(
  client: PoolClient,
  c: HrActorContext,
  company: string,
  key = "hr.employment_history.read",
) {
  if (c.actor.tenantId !== c.tenantId || !c.actor.permissions.includes(key)) deny();
  const ok = await client.query(
    `select 1 from security_user_role_assignment_version a join security_user_account u on u.tenant_id=a.tenant_id and u.id=a.user_id and u.status='active' and u.archived_at is null join security_role_policy p on p.tenant_id=a.tenant_id and p.id=a.role_policy_id and p.status='active' and p.lifecycle_state='active' join security_tenant_role r on r.tenant_id=p.tenant_id and r.role_id=p.role_id and r.lifecycle_state='active' join security_role_permission_grant g on g.tenant_id=p.tenant_id and g.role_policy_id=p.id and g.permission_key=$3 join security_permission_definition d on d.permission_key=g.permission_key and d.status='active' join security_role_scope_grant s on s.tenant_id=g.tenant_id and s.role_policy_id=g.role_policy_id and s.permission_key=g.permission_key where a.tenant_id=$1 and a.user_id=$2 and a.version=(select max(v.version) from security_user_role_assignment_version v where v.tenant_id=a.tenant_id and v.assignment_id=a.assignment_id) and a.lifecycle_state='active' and a.valid_from<=now() and(a.valid_until is null or a.valid_until>now()) and((s.scope_kind='tenant' and s.scope_value=$1)or(s.scope_kind='company' and s.scope_value=$4)) limit 1`,
    [c.tenantId, c.actor.userId, key, company],
  );
  if (!ok.rowCount) deny();
}
