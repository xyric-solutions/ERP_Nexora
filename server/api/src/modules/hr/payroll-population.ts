import type { PoolClient } from "pg";
import { HrApiError } from "./source-repository.js";

/** Employment terms that decide whether, and to which accounts, an employee's pay is posted. */
export type PayrollPlacement = {
  employee_id: string;
  /** Cost centre payment route (HR149): payroll, stipend or accounts_payable; legacy setups are a fallback. */
  payment_route: string | null;
  cost_center_id: string | null;
  cost_center_code: string | null;
  /** Cost centre's default nominal account code, when configured. */
  default_nominal: string | null;
};

/** Accounts-payable people are paid through supplier invoices, never through a Payroll run. */
export const paidThroughPayroll = (placement: PayrollPlacement | undefined) =>
  placement?.payment_route !== "accounts_payable";

/**
 * Each employee's placement for a Payroll month: the active assignment covering the month end
 * (or, failing that, the latest one overlapping the month).
 */
export async function payrollPlacements(
  client: PoolClient,
  tenantId: string,
  companyId: string,
  employeeIds: readonly string[],
  month: string,
): Promise<Map<string, PayrollPlacement>> {
  if (!employeeIds.length) return new Map();
  const rows = (
    await client.query<PayrollPlacement>(
      `select distinct on (a.employee_id) a.employee_id, coalesce(centre.payment_route, setup.payment_route) as payment_route, a.cost_center_id,
              centre.code as cost_center_code, centre.configuration_value as default_nominal
         from employee_assignment a
         left join hr_master_record setup on setup.tenant_id=a.tenant_id and setup.id=a.employment_setup_id
              and setup.master_type='employment_setup'
         left join hr_master_record centre on centre.tenant_id=a.tenant_id and centre.id=a.cost_center_id
              and centre.master_type='cost_center'
        where a.tenant_id=$1 and a.company_id=$2 and a.employee_id=any($3::text[])
          and a.assignment_status in ('active','legacy_compatibility')
          and a.effective_from <= ($4::date + interval '1 month' - interval '1 day')
          and (a.effective_to is null or a.effective_to >= $4::date)
        order by a.employee_id,
                 (a.effective_to is null or a.effective_to >= ($4::date + interval '1 month' - interval '1 day')) desc,
                 (a.assignment_status='active') desc, a.effective_from desc, a.id`,
      [tenantId, companyId, [...employeeIds], month],
    )
  ).rows;
  return new Map(rows.map((row) => [row.employee_id, row]));
}

/**
 * Resolves cost-centre default nominal codes to postable expense accounts. A configured code that is
 * not an active, postable expense account stops the calculation instead of posting somewhere else.
 */
export async function defaultNominalAccounts(
  client: PoolClient,
  tenantId: string,
  companyId: string,
  placements: Iterable<PayrollPlacement>,
): Promise<Map<string, string>> {
  const codes = [...new Set([...placements].map((p) => p.default_nominal).filter((c): c is string => !!c))];
  if (!codes.length) return new Map();
  const accounts = (
    await client.query<{
      id: string;
      code: string;
      type: string;
      status: string;
      is_header: boolean;
      manual_posting_allowed: boolean;
    }>(
      `select id,code,type,status,is_header,manual_posting_allowed from account
        where tenant_id=$1 and company_id=$2 and code=any($3::text[]) order by code`,
      [tenantId, companyId, codes],
    )
  ).rows;
  const byCode = new Map<string, string>();
  for (const code of codes) {
    const account = accounts.find((a) => a.code === code);
    if (
      !account ||
      account.type !== "expense" ||
      account.status !== "active" ||
      account.is_header ||
      !account.manual_posting_allowed
    )
      throw new HrApiError(
        409,
        "HR_PAYROLL_RUN_REVIEW_REQUIRED",
        `Cost centre default nominal ${code} must be an active, postable expense account in this company.`,
      );
    byCode.set(code, account.id);
  }
  return byCode;
}
