import type { Pool } from "pg";

type ReadinessDatabase = Pick<Pool, "query">;

export function createBankingFoundationReadiness(database: ReadinessDatabase): () => Promise<void> {
  return async () => {
    const result = await database.query<{ available: boolean }>(
      `select to_regclass('public.bank_account') is not null
        and to_regclass('public.bank_account_event') is not null
        and to_regclass('public.bank_payment') is not null
        and to_regclass('public.bank_payment_line') is not null
        and to_regclass('public.bank_payment_event') is not null
        and to_regclass('public.bank_receipt') is not null
        and to_regclass('public.bank_receipt_line') is not null
        and to_regclass('public.bank_receipt_event') is not null
        and to_regclass('public.bank_transfer') is not null
        and to_regclass('public.bank_transfer_line') is not null
        and to_regclass('public.bank_transfer_event') is not null
        and to_regclass('public.accounting_event') is not null
        and to_regclass('public.journal_entry') is not null
        and to_regclass('public.journal_line') is not null
        and to_regclass('public.bank_statement_mapping_profile') is not null
        and to_regclass('public.bank_statement_mapping_profile_event') is not null
        and to_regclass('public.bank_statement_import') is not null
        and to_regclass('public.bank_statement_line') is not null
        and to_regclass('public.bank_statement_import_event') is not null
        and to_regclass('public.bank_reconciliation') is not null
        and to_regclass('public.bank_reconciliation_ledger_line') is not null
        and to_regclass('public.bank_reconciliation_match') is not null
        and to_regclass('public.bank_reconciliation_adjustment') is not null
        and to_regclass('public.bank_reconciliation_adjustment_event') is not null
        and to_regclass('public.bank_reconciliation_event') is not null
        and to_regclass('public.bank_reconciliation_manual_selection') is not null
        and to_regclass('public.bank_reconciliation_manual_selection_event') is not null
        and to_regclass('public.finance_nominal_section_policy') is not null
        and to_regclass('public.finance_nominal_event') is not null
        and to_regclass('public.finance_general_nominal') is not null
        and to_regclass('public.finance_chart_template') is not null
        and to_regclass('public.finance_chart_company_node') is not null
        and to_regclass('public.finance_chart_bank_binding') is not null
        and to_regclass('public.bank_assignment_intervention') is not null
        and to_regclass('public.bank_self_approval_grant_version') is not null
        and to_regclass('public.bank_delegated_decision') is not null
        and to_regclass('public.bank_approver_reassignment') is not null
        and to_regclass('public.finance_coa_master_change') is not null
        and to_regclass('public.country_currency_catalog') is not null
        and to_regclass('public.company_currency_profile') is not null
        and to_regclass('public.company_currency') is not null
        and to_regclass('public.bank_revaluation_policy') is not null
        and to_regclass('public.bank_revaluation_policy_event') is not null
        and to_regclass('public.bank_revaluation') is not null
        and to_regclass('public.bank_revaluation_line') is not null
        and to_regclass('public.bank_revaluation_event') is not null
        and to_regclass('public.bank_revaluation_reversal_schedule') is not null
        and exists(select 1 from nexora_schema_migration where module_name='finance' and version>=30)
        and exists(select 1 from nexora_schema_migration where module_name='platform' and version>=11)
        and exists(select 1 from nexora_schema_migration where module_name='security' and version>=19) as available`,
    );
    if (!result.rows[0]?.available) throw new Error("The current Banking foundation migration is required");
  };
}
