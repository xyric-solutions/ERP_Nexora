import type { PoolClient } from "pg";
import { HrApiError } from "./source-repository.js";

/** The salary UI must remain unavailable on installations still parked at HR76. */
export async function requirePayrollBankingReady(client: Pick<PoolClient, "query">): Promise<void> {
  const result = await client.query<{ ready: boolean }>(
    `select exists(select 1 from nexora_schema_migration where module_name='hr' and version=133)
     and (select count(*) from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
       where n.nspname='public' and not t.tgisinternal and t.tgenabled in('O','A') and
       (c.relname,t.tgname) in (('bank_payment','salary_bank_payment_allocation'),('bank_payment','salary_bound_bank_guard'),('journal_entry','salary_bound_journal_guard'),('hr_payroll_bank_allocation','salary_bank_posting_context'))) = 4 as ready`,
  );
  if (!result.rows[0]?.ready)
    throw new HrApiError(
      503,
      "HR_PAYMENT_BANKING_SETUP_REQUIRED",
      "Salary settlement requires the current Banking setup. Ask an administrator to complete the upgrade.",
    );
}
