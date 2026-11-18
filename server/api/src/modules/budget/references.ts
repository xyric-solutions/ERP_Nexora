import type { BudgetDimensions } from "@nexora/contracts";
import { budgetReject, type BudgetClient } from "./transaction.js";

/** Same-company references shared by Budget planning and purchase source validation. */
export async function validateBudgetReferences(
  c: BudgetClient,
  tenant: string,
  company: string,
  values: readonly { dimensions?: BudgetDimensions | undefined; budget_period_id?: string | undefined }[],
) {
  for (const dimension of ["department", "branch", "project", "cost_centre"] as const) {
    const identities = [
      ...new Set(values.flatMap((value) => (value.dimensions?.[dimension] ? [value.dimensions[dimension]!] : []))),
    ];
    if (!identities.length) continue;
    const found =
      dimension === "project"
        ? await c.query(
            "select id from erp_project where tenant_id=$1 and company_id=$2 and id=any($3::text[]) and status='active' for share",
            [tenant, company, identities],
          )
        : dimension === "cost_centre"
          ? await c.query(
              "select id from hr_master_record where tenant_id=$1 and company_id=$2 and id=any($3::text[]) and master_type='cost_center' and status='active' for share",
              [tenant, company, identities],
            )
          : await c.query(
              "select id from organization_unit where tenant_id=$1 and id=any($3::text[]) and type=$4 and status='active' and organization_unit_is_within_company($1,id,$2) for share",
              [tenant, company, identities, dimension],
            );
    if (found.rowCount !== identities.length)
      budgetReject("A planning dimension is unavailable in this company.", "BUDGET_DIMENSION_INVALID");
  }
  const periods = [...new Set(values.flatMap((value) => (value.budget_period_id ? [value.budget_period_id] : [])))];
  if (
    periods.length &&
    (
      await c.query(
        "select id from financial_period where tenant_id=$1 and company_id=$2 and id=any($3::text[]) for share",
        [tenant, company, periods],
      )
    ).rowCount !== periods.length
  )
    budgetReject("The expected budget period must belong to this company.", "BUDGET_PERIOD_INVALID");
}
