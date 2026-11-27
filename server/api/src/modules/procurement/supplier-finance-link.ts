import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";

/** Create the subsidiary identity for the exact canonical supplier, never a
 * separate AP nominal. Posting resolves the company's governed AP control.
 * Inactive suppliers and companies awaiting accounting setup retain their
 * existing onboarding workflow and cannot acquire posting authority here.
 */
export async function ensureSupplierFinanceLink(
  client: PoolClient,
  input: {
    tenantId: string;
    companyId: string;
    supplierId: string;
    actorId: string;
  },
): Promise<void> {
  const created = await client.query<{ id: string }>(
    `insert into finance_subledger_party(tenant_id,company_id,id,kind,code,name,default_currency,source_supplier_id,created_by)
    select s.tenant_id,s.company_id,$4,'supplier',s.code,s.name,c.base_currency,s.id,$5
    from procurement_supplier s join company_currency_profile c on c.tenant_id=s.tenant_id and c.company_id=s.company_id
    where s.tenant_id=$1 and s.company_id=$2 and s.id=$3 and s.status='active' and s.risk_status<>'blocked'
      and exists(select 1 from finance_subledger_policy p where p.tenant_id=s.tenant_id and p.company_id=s.company_id)
      and not exists(select 1 from finance_subledger_party f where f.tenant_id=s.tenant_id and f.company_id=s.company_id and f.source_supplier_id=s.id)
      and not exists(select 1 from finance_party_master_link l where l.tenant_id=s.tenant_id and l.company_id=s.company_id and l.canonical_party_id=s.id)
    on conflict(tenant_id,company_id,source_supplier_id) do nothing returning id`,
    [input.tenantId, input.companyId, input.supplierId, `financial-party-${randomUUID()}`, input.actorId],
  );
  if (created.rows[0])
    await client.query(
      `insert into finance_subledger_audit(tenant_id,company_id,id,action,actor_id,reason,evidence)
    values($1,$2,$3,'supplier_linked',$4,'Automatic canonical supplier subsidiary identity; company AP policy governs posting',$5)`,
      [
        input.tenantId,
        input.companyId,
        randomUUID(),
        input.actorId,
        JSON.stringify({ supplier_id: input.supplierId, financial_party_id: created.rows[0].id }),
      ],
    );
}
