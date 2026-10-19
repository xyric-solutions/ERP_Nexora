# Nexora Demo Action Matrix — Accounting & Finance First

- Version: 1.0
- Date: 2026-08-18
- Company: Nexora Demo Company
- Scope: Accounting & Finance only; Operations follows Finance approval
- Authority: live source, contracts, persistence, permissions, and Demo verification

## Status rules

- `[IMPLEMENTED]`: real frontend, backend, database, and authorized runtime path.
- `[DEMO/PROTOTYPE]`: controlled non-production interaction, clearly labelled,
  with no claim of a completed business write.
- `[COMING SOON]`: planned or partially constructed capability whose complete
  user path is not implemented.
- `[NOT AVAILABLE]`: unavailable for this company, edition, role, or Demo setup.

`Demo Available = Yes` means the supplied Nexora Demo Company can complete the
listed action now. `Real Transaction = Yes` means the action reads or changes
real Demo data through the actual application path. Page access never overrides
backend permission checks.

## Action matrix

| Module | Function | Action | Status | Frontend Route | Backend Endpoint | Database Entity | Permission | Demo Available | Real Transaction | Prototype Only | Coming Soon |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Finance | Finance Dashboard | View live KPIs and statement summaries | `[IMPLEMENTED]` | `/finance` | `GET /api/v1/finance/dashboard_metrics` | AnalyticsSnapshot, JournalEntry, JournalLine | `finance.report.read` | Yes | Yes | No | No |
| Finance | Finance Dashboard | Drill from metric to underlying entries | `[IMPLEMENTED]` | `/finance`, report routes | `GET /api/v1/finance/gl_drilldown` | JournalEntry, JournalLine, Account | `finance.report.drilldown` | Yes | Yes | No | No |
| Finance | Finance Dashboard | View approval work and close deadlines | `[COMING SOON]` | Proposed `/finance/work` | — | WorkflowInstance, FinancialPeriod | Proposed Finance workflow permissions | No | No | No | Yes |
| Finance | Chart of Accounts | Browse complete account hierarchy | `[IMPLEMENTED]` | `/finance/accounts` | `GET /api/v1/finance/accounts` | Account | `finance.account.read` | Yes | Yes | No | No |
| Finance | Chart of Accounts | Browse 223 reference nominal posting accounts with grouping, search, pagination, and details | `[IMPLEMENTED]` | `/finance/accounts/nominals` | `GET /api/v1/finance/accounts` | Six-digit Account (`is_header=false`) | `finance.account.read` | Yes | Yes | No | No |
| Finance | Chart of Accounts | Browse 78 reference structural sections under 14 groups with search and details | `[IMPLEMENTED]` | `/finance/accounts/sections` | `GET /api/v1/finance/accounts` | Four-digit Account (`is_header=true`) | `finance.account.read` | Yes | Yes | No | No |
| Finance | Chart of Accounts | Create account | `[IMPLEMENTED]` | `/finance/accounts`, `/finance/accounts/nominals`, `/finance/accounts/sections` | `POST /api/v1/finance/accounts` | Account | `finance.account.create` | Yes | Yes | No | No |
| Finance | Chart of Accounts | View account details and controls | `[IMPLEMENTED]` | `/finance/accounts`, `/finance/accounts/nominals`, `/finance/accounts/sections` | `GET /api/v1/finance/accounts` | Account | `finance.account.read` | Yes | Yes | No | No |
| Finance | Chart of Accounts | Open account General Ledger | `[IMPLEMENTED]` | `/finance/general-ledger` | `GET /api/v1/finance/gl_drilldown` | Account, JournalLine | `finance.report.drilldown` | Yes | Yes | No | No |
| Finance | Chart of Accounts | Edit, activate, or deactivate account | `[COMING SOON]` | Proposed `/finance/accounts/:id/edit` | — | Account | Proposed `finance.account.update` | No | No | No | Yes |
| Finance | Chart of Accounts | Manage categories, sections, nominals, and groups as distinct masters | `[COMING SOON]` | Proposed `/finance/accounts/*` | — | Account hierarchy | Proposed Finance master permissions | No | No | No | Yes |
| Finance | Journals | Browse and filter journal register | `[IMPLEMENTED]` | `/finance/journals` | `GET /api/v1/finance/journal_entries` | JournalEntry, JournalLine | `finance.journal.read` | Yes | Yes | No | No |
| Finance | Journals | Create and immediately post balanced manual journal | `[IMPLEMENTED]` | `/finance/journals` | `POST /api/v1/finance/journal_entries` | JournalEntry, JournalLine | `finance.journal.post` | Yes | Yes | No | No |
| Finance | Journals | Validate total debit equals total credit | `[IMPLEMENTED]` | `/finance/journals` | `POST /api/v1/finance/journal_entries` | JournalEntry, JournalLine | `finance.journal.post` | Yes | Yes | No | No |
| Finance | Journals | View complete journal document | `[COMING SOON]` | Proposed `/finance/journals/:id` | Existing journal list returns lines; dedicated detail contract not defined | JournalEntry, JournalLine | `finance.journal.read` | No | No | No | Yes |
| Finance | Journals | Save draft | `[COMING SOON]` | Proposed `/finance/journals/new` | Service support exists; no public action contract/UI | JournalEntry, JournalLine | Proposed `finance.journal.create` | No | No | No | Yes |
| Finance | Journals | Submit for approval | `[COMING SOON]` | Proposed journal detail | — | JournalEntry, WorkflowInstance | Proposed `finance.journal.submit` | No | No | No | Yes |
| Finance | Journals | Approve, reject, or return | `[COMING SOON]` | Proposed `/finance/journals/approvals` | — | JournalEntry, WorkflowInstance, AuditEvent | Proposed `finance.journal.approve` | No | No | No | Yes |
| Finance | Journals | Post approved journal | `[COMING SOON]` | Proposed journal detail | Existing create/post path is atomic; existing-draft post API absent | JournalEntry, JournalLine | `finance.journal.post` | No | No | No | Yes |
| Finance | Journals | Reverse posted journal | `[IMPLEMENTED]` | `/finance/journals` | `POST /api/v1/finance/journal_reversals` | JournalEntry, JournalLine | `finance.journal.reverse` | Yes | Yes | No | No |
| Finance | Recurring Journals | Browse templates | `[IMPLEMENTED]` | `/finance/recurring-journals` | `GET /api/v1/finance/recurring_journal_templates` | RecurringJournalTemplate | `finance.journal.read` | Yes | Yes | No | No |
| Finance | Recurring Journals | Create recurring template | `[IMPLEMENTED]` | `/finance/recurring-journals` | `POST /api/v1/finance/recurring_journal_templates` | RecurringJournalTemplate | `finance.recurring_journal.create` | Yes | Yes | No | No |
| Finance | Recurring Journals | Generate journal draft | `[IMPLEMENTED]` | `/finance/recurring-journals` | `POST /api/v1/finance/recurring_journal_generations` | RecurringJournalTemplate, JournalEntry, JournalLine | `finance.recurring_journal.create` | Yes | Yes | No | No |
| Finance | Recurring Journals | Open and post generated draft | `[COMING SOON]` | Proposed journal detail | — | JournalEntry, JournalLine | `finance.journal.post` | No | No | No | Yes |
| Finance | General Ledger | Run account ledger with opening, debits, credits, closing | `[IMPLEMENTED]` | `/finance/general-ledger` | `GET /api/v1/finance/gl_drilldown` | Account, JournalEntry, JournalLine | `finance.report.drilldown` | Yes | Yes | No | No |
| Finance | Trial Balance | Run balanced Trial Balance | `[IMPLEMENTED]` | `/finance/trial-balance` | `GET /api/v1/finance/report_trial_balance` | Account, JournalEntry, JournalLine | `finance.report.read` | Yes | Yes | No | No |
| Finance | Profit & Loss | Run Profit & Loss | `[IMPLEMENTED]` | `/finance/profit-loss` | `GET /api/v1/finance/report_profit_loss` | Account, JournalEntry, JournalLine | `finance.report.read` | Yes | Yes | No | No |
| Finance | Balance Sheet | Run Balance Sheet | `[IMPLEMENTED]` | `/finance/balance-sheet` | `GET /api/v1/finance/report_balance_sheet` | Account, JournalEntry, JournalLine | `finance.report.read` | Yes | Yes | No | No |
| Finance | Cash Flow | Run reconciled Cash Flow | `[IMPLEMENTED]` | `/finance/cash-flow` | `GET /api/v1/finance/report_cash_flow` | Account, JournalEntry, JournalLine | `finance.report.read` | Yes | Yes | No | No |
| Finance | Financial Reports | Export, print, or schedule a report | `[COMING SOON]` | Proposed report action bar | — | ReportDefinition, ReportJob | Proposed report export/schedule permissions | No | No | No | Yes |
| Finance | Budgets | View Budget vs Actual | `[IMPLEMENTED]` | `/finance/budget-vs-actual` | `GET /api/v1/finance/report_budget_variance` | Budget, JournalEntry, JournalLine | `finance.report.read` | Yes | Yes | No | No |
| Finance | Budgets | Create or revise budget | `[COMING SOON]` | Proposed `/finance/budgets` | Service exists; no HTTP route | Budget | Proposed `finance.budget.manage` | No | No | No | Yes |
| Finance | Budgets | Submit, approve, or reject budget | `[COMING SOON]` | Proposed `/finance/budgets/:id` | Service exists; no HTTP route | Budget, AuditEvent | Proposed `finance.budget.approve` | No | No | No | Yes |
| Finance | Period Management | Close financial period | `[IMPLEMENTED]` | `/finance/period-closing` | `POST /api/v1/finance/period_closures` | FinancialPeriod | `finance.period.close` | Yes | Yes | No | No |
| Finance | Period Management | Reopen financial period | `[IMPLEMENTED]` | `/finance/period-closing` | `POST /api/v1/finance/period_reopenings` | FinancialPeriod | `finance.period.reopen` | Yes | Yes | No | No |
| Finance | Period Management | Browse period directory and close readiness | `[COMING SOON]` | Proposed `/finance/periods` | — | FinancialPeriod | Proposed `finance.period.read` | No | No | No | Yes |
| Finance | Accounting Events | Submit/list accounting event through API | `[COMING SOON]` | Proposed `/finance/accounting-events` | `GET/POST /api/v1/finance/accounting_events` | AccountingEvent | `finance.accounting_event.read/create` | No | No | No | Yes |
| Finance | Accounting Events | Trace business transaction to report | `[COMING SOON]` | Proposed event/journal/report detail | Existing event, journal, drill-down, and audit services require UI composition | AccountingEvent, JournalEntry, JournalLine, AuditEvent | Finance read/drill-down permissions | No | No | No | Yes |
| Finance | Intercompany | Post balanced intercompany pair | `[COMING SOON]` | Proposed `/finance/intercompany` | Service exists; no HTTP route | JournalEntry, JournalLine | Proposed `finance.intercompany.post` | No | No | No | Yes |
| Finance | Consolidation | Request consolidated report for an existing group | `[NOT AVAILABLE]` | `/finance/consolidation` | `POST /api/v1/finance/report_jobs` | ConsolidationGroup, ReportJob | `finance.report.consolidate` | No | No | No | No |
| Finance | Consolidation | Configure or revise consolidation group | `[COMING SOON]` | Proposed `/finance/consolidation/groups` | Service exists; no HTTP route | ConsolidationGroup | Proposed `finance.consolidation.manage` | No | No | No | Yes |
| Finance | Audit Trail | Read Finance audit trail through API | `[COMING SOON]` | Proposed `/finance/audit-trail` | `GET /api/v1/finance/audit_trail` | AuditEvent | `finance.report.audit_read` | No | No | No | Yes |
| Finance | Report Catalogue | Read/manage report definitions through API | `[COMING SOON]` | Proposed `/finance/report-catalogue` | `GET/POST /api/v1/finance/report_definitions` | ReportDefinition | `finance.report.read`, `finance.report_definition.manage` | No | No | No | Yes |
| Finance | Cash & Bank | Browse seeded bank accounts | `[COMING SOON]` | `/finance/cash-bank` structural page | — | BankAccount | Proposed bank read permission | No | No | No | Yes |
| Finance | Cash & Bank | Reconcile bank/cash transactions | `[COMING SOON]` | Proposed `/finance/reconciliations` | — | BankAccount; reconciliation entity not implemented | Proposed reconciliation permissions | No | No | No | Yes |
| Finance | Tax | Browse/manage tax rules | `[COMING SOON]` | `/finance/tax` structural page | — | TaxRule | Proposed tax permissions | No | No | No | Yes |
| Finance | Accounts Receivable | Manage customer subledger, receipts, and aging | `[COMING SOON]` | `/finance/accounts-receivable` | — | Party; party-linked subledger not implemented | Proposed AR permissions | No | No | No | Yes |
| Finance | Accounts Payable | Manage supplier subledger, payments, and aging | `[COMING SOON]` | `/finance/accounts-payable` | — | Party; party-linked subledger not implemented | Proposed AP permissions | No | No | No | Yes |
| Finance | Fixed Assets | Manage register, depreciation, and disposal | `[COMING SOON]` | `/finance/fixed-assets` | — | Not implemented | Proposed Fixed Asset permissions | No | No | No | Yes |

## Role interpretation

- `demo.admin`: all current Demo permissions.
- `demo.accountant`: Finance reads plus account/event/journal/reversal/recurring
  actions granted by the backend role.
- `demo.finance.manager`: Finance management permissions including period,
  budget, consolidation, and report-definition permissions where an actual API
  path exists.
- `demo.viewer`: Finance read-only permissions.

A role grant is not proof that a frontend workflow exists. Conversely, hiding
an action in the UI is not a security boundary; every real action remains
backend-authorized.

## Expansion rule

Operations and later modules are intentionally absent from this first matrix.
After Accounting & Finance wireframes are approved and its implementation is
accepted, append Operations rows using the same columns and evidence standard.
