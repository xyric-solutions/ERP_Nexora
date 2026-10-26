import type { PoolClient } from "pg";
import type { FinanceNominalActorContext } from "./nominals/source-repository.js";

export function isCoaSuperAdministrator(context: FinanceNominalActorContext): boolean {
  return (
    context.tenantId === context.actor.tenantId &&
    !context.realActorId &&
    !context.impersonationRequestId &&
    context.actor.roles.includes("super_administrator") &&
    context.actor.permissions.includes("platform.approval.override")
  );
}

export async function hasLiveCoaMasterAuthority(
  client: PoolClient,
  context: FinanceNominalActorContext,
  companyId?: string,
): Promise<boolean> {
  if (!isCoaSuperAdministrator(context)) return false;
  await client.query("select pg_advisory_xact_lock_shared(hashtextextended($1,0))", [
    `nexora:security:admin:${context.tenantId}`,
  ]);
  const result = companyId
    ? await client.query<{ allowed: boolean }>(
        "select bank_has_live_permission($1,$2,$3,'platform.approval.override',true) as allowed",
        [context.tenantId, companyId, context.actor.userId],
      )
    : await client.query<{ allowed: boolean }>(
        `select exists(select 1 from organization_unit c where c.tenant_id=$1 and c.type='company' and c.status='active' and bank_has_live_permission($1,c.id,$2,'platform.approval.override',true)) as allowed`,
        [context.tenantId, context.actor.userId],
      );
  return result.rows[0]?.allowed === true;
}
