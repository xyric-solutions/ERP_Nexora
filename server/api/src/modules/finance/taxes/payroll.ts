import type { PoolClient } from "pg";
import { taxSnapshotSchema, type TaxSnapshot } from "@nexora/contracts";
import { resolveTax, taxReject } from "./resolver.js";

export async function payrollTaxBindings(
  client: PoolClient,
  input: { tenant: string; company: string; date: string; currency: string; precision: number; components: string[] },
) {
  const rows = (
    await client.query<{ definition_id: string; payroll_component_id: string; payroll_basis_component_id: string }>(
      `select d.id as definition_id,m.payroll_component_id,m.payroll_basis_component_id
    from finance_tax_definition d join lateral(select revision from finance_tax_revision r where r.tenant_id=d.tenant_id and r.company_id=d.company_id and r.definition_id=d.id and r.effective_date<=$3::date order by r.effective_date desc,r.revision desc limit 1) r on true
    join finance_tax_mapping_rule m on m.tenant_id=d.tenant_id and m.company_id=d.company_id and m.definition_id=d.id and m.revision=r.revision
    where d.tenant_id=$1 and d.company_id=$2 and d.status='active' and m.module='payroll' and m.payroll_component_id=any($4::text[])`,
      [input.tenant, input.company, input.date, input.components],
    )
  ).rows;
  const bindings = new Map<string, { definition: TaxSnapshot; basis_component_id: string }>();
  for (const row of rows) {
    if (bindings.has(row.payroll_component_id))
      taxReject(
        "More than one effective tax definition maps this Payroll deduction. Resolve the configuration before calculating.",
      );
    const definition = await resolveTax(client, {
      ...input,
      definition: row.definition_id,
      module: "payroll",
      trigger: "calculation",
      basis: "0",
    });
    bindings.set(row.payroll_component_id, { definition, basis_component_id: row.payroll_basis_component_id });
  }
  return bindings;
}

export async function validatePayrollTaxes(
  client: PoolClient,
  input: { tenant: string; company: string; date: string; taxes: unknown[] },
) {
  for (const raw of input.taxes) {
    const snapshot = taxSnapshotSchema.parse(raw);
    const current = await resolveTax(client, {
      tenant: input.tenant,
      company: input.company,
      definition: snapshot.definition_id,
      date: input.date,
      module: "payroll",
      trigger: "calculation",
      currency: snapshot.currency,
      precision: snapshot.decimal_places,
      basis: snapshot.basis,
    });
    if (
      current.revision !== snapshot.revision ||
      current.account_id !== snapshot.account_id ||
      current.amount !== snapshot.amount
    )
      taxReject(
        "Payroll tax authority changed after calculation. Reopen and recalculate through the governed Payroll correction workflow.",
        "TAX_SNAPSHOT_CHANGED",
      );
  }
}
