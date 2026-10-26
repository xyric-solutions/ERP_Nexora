import type { PoolClient } from "pg";
import { HrApiError, type HrActorContext } from "./source-repository.js";

/** Employee ownership is an independent authority, never an added HR role/permission. */
export async function requireSelfServiceEmployee(
  client: PoolClient,
  c: HrActorContext,
  company: string,
  write = false,
  expected?: string,
) {
  if (
    c.actor.tenantId !== c.tenantId ||
    (write && (c.impersonationRequestId || (c.realActorId && c.realActorId !== c.actor.userId)))
  )
    throw new HrApiError(403, "PERMISSION_DENIED", "Personal changes require your own active employee session.");
  const rows = await client.query<{ employee_id: string }>(
    `select b.employee_id from employee_user_binding b
    join security_user_account u on u.tenant_id=b.tenant_id and u.id=b.user_id and u.status='active' and u.archived_at is null
    join security_user_company_access a on a.tenant_id=b.tenant_id and a.user_id=b.user_id and a.company_id=$3 and a.revoked_at is null
    join organization_unit o on o.tenant_id=a.tenant_id and o.id=a.company_id and o.type='company' and o.status='active'
    where b.tenant_id=$1 and b.user_id=$2 and b.ended_at is null and b.effective_from<=current_date and(b.effective_to is null or b.effective_to>=current_date)
    and exists(select 1 from hr_employment_relationship r where r.tenant_id=b.tenant_id and r.employee_id=b.employee_id and r.legal_employer_id=$3 and r.approval_state='approved' and r.effective_from<=current_date and
      (($4::boolean and r.status='active' and(r.effective_to is null or r.effective_to>=current_date)) or(not $4::boolean and r.status in ('active','suspended','ended'))))
    order by b.id limit 2${write ? " for share of b,u,a,o" : ""}`,
    [c.tenantId, c.actor.userId, company, write],
  );
  if (rows.rowCount !== 1 || (expected && rows.rows[0]!.employee_id !== expected))
    throw new HrApiError(
      403,
      "HR_SELF_LEAVE_ACCESS_REQUIRED",
      "An effective employee binding, company access and approved employment are required.",
    );
  return rows.rows[0]!.employee_id;
}

/** Read-only UI eligibility; callers first establish the current employee ownership. Writes recheck and lock it. */
export async function canManageSelfService(client: PoolClient, c: HrActorContext, company: string, employee: string) {
  if (
    c.actor.tenantId !== c.tenantId ||
    c.impersonationRequestId ||
    (c.realActorId && c.realActorId !== c.actor.userId)
  )
    return false;
  const result = await client.query(
    "select 1 from hr_employment_relationship where tenant_id=$1 and legal_employer_id=$2 and employee_id=$3 and approval_state='approved' and status='active' and effective_from<=current_date and(effective_to is null or effective_to>=current_date) limit 1",
    [c.tenantId, company, employee],
  );
  return !!result.rowCount;
}
