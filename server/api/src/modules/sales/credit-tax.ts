import type { PoolClient } from "pg";
import {
  absolute,
  calculateTax,
  decimalText,
  salesMinor,
  type SalesSource,
  type SalesLine,
  type TaxSnapshot,
} from "@nexora/contracts";
import { operationalFailure as fail } from "../shared/operational-transaction.js";
import { resolveTax } from "../finance/taxes/resolver.js";

export async function postedSalesInvoice(client: PoolClient, tenant: string, company: string, invoice: string) {
  const row = (
    await client.query<{ operation_id: string; item_id: string }>(
      `
    select o.id operation_id,i.id item_id from finance_subledger_operation o
    join finance_subledger_item i on(i.tenant_id,i.company_id,i.operation_id)=(o.tenant_id,o.company_id,o.id)
    where(o.tenant_id,o.company_id,o.sales_document_id)=($1,$2,$3) and o.type='recognition' and o.state='posted'
      and o.payload->>'side'='receivable' and o.payload->>'kind'='invoice'
      and not exists(select 1 from finance_subledger_operation r where(r.tenant_id,r.company_id,r.payload->>'operation_id')=(o.tenant_id,o.company_id,o.id) and r.type='reversal' and r.state='posted')`,
      [tenant, company, invoice],
    )
  ).rows[0];
  if (!row)
    fail(
      "A credit requires the original unreversed, posted customer invoice and open-item reference.",
      "SALES_ORIGINAL_INVOICE_NOT_POSTED",
    );
  return row;
}

/** Credits consume original posted tax basis and preserve the final rounding residual. */
export async function salesCreditTax(
  client: PoolClient,
  tenant: string,
  source: SalesSource,
  original: SalesLine,
  net: string,
  definition: string | null,
): Promise<TaxSnapshot | null> {
  const posted = await postedSalesInvoice(client, tenant, source.company_id, source.id);
  if (
    (
      await client.query(
        `select 1 from finance_subledger_operation o where o.tenant_id=$1 and o.company_id=$2 and o.type='recognition' and o.state='posted'
    and o.payload->>'kind'='credit_note' and o.payload->>'original_item_id'=$3 and o.sales_document_id is null
    and not exists(select 1 from finance_subledger_operation r where(r.tenant_id,r.company_id,r.payload->>'operation_id')=(o.tenant_id,o.company_id,o.id) and r.type='reversal' and r.state='posted')`,
        [tenant, source.company_id, posted.item_id],
      )
    ).rowCount
  )
    fail(
      "An existing financial credit has no commercial line allocation. Review its controlled correction before creating a line-linked Sales credit.",
      "SALES_LEGACY_CREDIT_REVIEW_REQUIRED",
    );
  if (definition !== original.tax_definition_id)
    fail("A credit must retain its original invoice line's tax treatment.", "SALES_CREDIT_TAX_CHANGED");
  if (!definition) return null;
  const precision = source.decimal_places,
    snapshot = original.tax_snapshot;
  if (!snapshot) fail("The original posted invoice tax evidence is missing.", "SALES_CREDIT_TAX_EVIDENCE_REQUIRED");
  const prior = (
    await client.query<{ basis: string; amount: string }>(
      `
    select coalesce(sum(a.basis),0)::text basis,coalesce(sum(a.amount),0)::text amount
    from finance_tax_application a where a.tenant_id=$1 and a.company_id=$2 and a.source_type='currency_subledger'
      and a.definition_id=$3 and a.revision=$4 and a.currency=$5 and(
        (a.source_id=$6 and a.source_line=$7) or exists(select 1 from sales_document_line l join sales_document d
          on(d.tenant_id,d.company_id,d.id)=(l.tenant_id,l.company_id,l.document_id)
          where(l.tenant_id,l.company_id,l.id)=(a.tenant_id,a.company_id,a.source_line) and d.kind='credit'
            and(l.source_document_id,l.source_line_id)=($8,$7)))`,
      [
        tenant,
        source.company_id,
        definition,
        snapshot.revision,
        source.currency,
        posted.operation_id,
        original.id,
        source.id,
      ],
    )
  ).rows[0]!;
  const priorBasis = salesMinor(prior.basis, precision),
    priorTax = salesMinor(prior.amount, precision),
    basis = salesMinor(net, precision);
  if (basis > priorBasis)
    fail("This credit exceeds the original line's remaining posted taxable basis.", "SALES_CREDIT_BASIS_EXCEEDED");
  const governed = await resolveTax(client, {
    tenant,
    company: source.company_id,
    definition,
    date: source.document_date,
    module: "sales",
    trigger: "recognition",
    currency: source.currency,
    precision,
    basis: net,
  });
  if (
    governed.revision !== snapshot.revision ||
    governed.account_id !== snapshot.account_id ||
    governed.rate !== snapshot.rate
  )
    fail(
      "Original governed tax evidence changed. Review its controlled correction before crediting.",
      "SALES_CREDIT_TAX_CHANGED",
    );
  const remaining = salesMinor(
    calculateTax(decimalText(priorBasis - basis, precision), governed.rate, precision),
    precision,
  );
  const amount = remaining - priorTax;
  if (amount > 0n || absolute(amount) > priorTax)
    fail("The original credit tax residual is inconsistent.", "SALES_CREDIT_TAX_CHANGED");
  return {
    ...governed,
    basis: decimalText(-basis, precision),
    amount: decimalText(amount, precision),
    prior_basis: decimalText(priorBasis, precision),
    prior_amount: decimalText(priorTax, precision),
  };
}
