import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import {
  calculateTax,
  convertMinor,
  decimal,
  decimalText,
  taxSnapshotSchema,
  type TaxSnapshot,
} from "@nexora/contracts";

export class TaxError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}
export function taxReject(message: string, code = "TAX_VALIDATION_FAILED", status = 409): never {
  throw new TaxError(status, code, message);
}

export async function resolveTax(
  client: PoolClient,
  input: {
    tenant: string;
    company: string;
    definition: string;
    date: string;
    module: TaxSnapshot["module"];
    trigger: TaxSnapshot["trigger"];
    currency: string;
    precision: number;
    basis: string;
  },
): Promise<TaxSnapshot> {
  // Shared with configuration edits; hold through source approval/posting commit.
  await client.query("select pg_advisory_xact_lock_shared(hashtextextended($1,0))", [
    `tax:${input.tenant}:${input.company}`,
  ]);
  const row = (
    await client.query<{
      definition_id: string;
      revision: number;
      code: string;
      name: string;
      module: string;
      treatment: string;
      trigger: string;
      account_id: string;
      rate: string;
      currency: string | null;
    }>(
      `select d.id as definition_id,r.revision,d.code,r.name,m.module,m.treatment,m.trigger,m.account_id,r.rate::text,g.currency
    from finance_tax_definition d
    join lateral (select * from finance_tax_revision r where r.tenant_id=d.tenant_id and r.company_id=d.company_id and r.definition_id=d.id and r.effective_date<=$4::date order by r.effective_date desc,r.revision desc limit 1) r on true
    join finance_tax_mapping_rule m on m.tenant_id=r.tenant_id and m.company_id=r.company_id and m.definition_id=r.definition_id and m.revision=r.revision
    join account a on a.tenant_id=m.tenant_id and a.company_id=m.company_id and a.id=m.account_id
    left join finance_general_nominal g on g.tenant_id=a.tenant_id and g.company_id=a.company_id and g.nominal_id=a.id
    where d.tenant_id=$1 and d.company_id=$2 and d.id=$3 and d.status='active'
    and a.status='active' and not a.is_header and not a.reconciliation_required
    and a.type=case when m.treatment='recoverable' then 'asset' else 'liability' end
    and not exists(select 1 from bank_account b where b.tenant_id=a.tenant_id and b.company_id=a.company_id and b.account_id=a.id)
    and not exists(select 1 from finance_subledger_policy p where p.tenant_id=a.tenant_id and p.company_id=a.company_id and a.id in (p.receivable_account_id,p.payable_account_id))`,
      [input.tenant, input.company, input.definition, input.date],
    )
  ).rows[0];
  if (
    !row ||
    row.module !== input.module ||
    row.trigger !== input.trigger ||
    (row.currency && row.currency !== input.currency)
  )
    taxReject(
      "Select an active, effective tax with an eligible nominal for this company, currency and transaction context.",
    );
  return taxSnapshotSchema.parse({
    ...row,
    currency: input.currency,
    decimal_places: input.precision,
    basis: decimalText(decimal(input.basis, input.precision, true), input.precision),
    amount: calculateTax(input.basis, row.rate, input.precision),
  });
}

export async function recordTaxApplications(
  client: PoolClient,
  input: {
    tenant: string;
    company: string;
    sourceType: string;
    sourceId: string;
    date: string;
    journal: string;
    taxes: readonly TaxSnapshot[];
    rate: (currency: string) => Promise<{ value: string; basePrecision: number }>;
  },
) {
  for (const [position, tax] of input.taxes.entries()) {
    const fx = await input.rate(tax.currency);
    await client.query(
      `insert into finance_tax_application(tenant_id,company_id,id,definition_id,revision,source_type,source_id,source_line,application_date,basis,amount,currency,decimal_places,base_amount,rate,base_decimal_places,journal_id,prior_basis,prior_amount)
      values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)`,
      [
        input.tenant,
        input.company,
        randomUUID(),
        tax.definition_id,
        tax.revision,
        input.sourceType,
        input.sourceId,
        tax.source_item_id ?? String(position),
        input.date,
        tax.basis,
        tax.amount,
        tax.currency,
        tax.decimal_places,
        decimalText(
          convertMinor(decimal(tax.amount, tax.decimal_places, true), tax.decimal_places, fx.value, fx.basePrecision),
          fx.basePrecision,
        ),
        fx.value,
        fx.basePrecision,
        input.journal,
        tax.prior_basis,
        tax.prior_amount,
      ],
    );
  }
}

export async function reverseTaxApplications(
  client: PoolClient,
  input: {
    tenant: string;
    company: string;
    original: string;
    source: string;
    sourceType: string;
    journal: string;
    date: string;
  },
) {
  await client.query(
    `insert into finance_tax_application(tenant_id,company_id,id,definition_id,revision,source_type,source_id,source_line,application_date,basis,amount,currency,decimal_places,base_amount,rate,base_decimal_places,journal_id,reverses_id,prior_basis,prior_amount)
    select tenant_id,company_id,$7||':'||source_line,definition_id,revision,source_type,$4,source_line,$6::date,-basis,-amount,currency,decimal_places,-base_amount,rate,base_decimal_places,$5,id,-prior_basis,-prior_amount
    from finance_tax_application where tenant_id=$1 and company_id=$2 and source_id=$3 and source_type=$8`,
    [
      input.tenant,
      input.company,
      input.original,
      input.source,
      input.journal,
      input.date,
      randomUUID(),
      input.sourceType,
    ],
  );
}
