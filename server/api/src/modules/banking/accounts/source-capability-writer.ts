import type { PoolClient } from "pg";

/** Finance owns the nominal; Banking retains its stable transaction identity. */
export async function insertNominalBankCapability(
  client: PoolClient,
  input: {
    tenantId: string;
    companyId: string;
    bankId: string;
    nominalId: string;
    name: string;
    currency: string;
    actorId: string;
  },
): Promise<void> {
  await client.query(
    `insert into bank_account (tenant_id,company_id,id,account_id,reference,account_name,account_type,
       bank_name,branch,swift_bic,currency,status,identity_mode,created_by,created_at)
     values ($1,$2,$3,$4,$3,$5,'current',null,null,null,$6,'draft','nominal_only',$7,clock_timestamp())`,
    [input.tenantId, input.companyId, input.bankId, input.nominalId, input.name, input.currency, input.actorId],
  );
}
