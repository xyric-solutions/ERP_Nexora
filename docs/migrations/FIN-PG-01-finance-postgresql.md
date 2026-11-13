# FIN-PG-01 PostgreSQL Finance Migration

## Scope

FIN-PG-01 makes PostgreSQL the production system of record for accounting
events, accounts, periods, journals, planning, consolidation and reporting.
It reuses the existing Finance services and PostingService; it does not create
a second posting engine or seed production business data.

## Deployment order

Apply migrations in this order: Platform, Security, Workflow, Finance, HR.
The Finance migration depends on Platform tenant/company/period foundations
and Security identities used by authorization and audit.

```powershell
$env:NEXORA_DATABASE_DSN = '<operator-supplied PostgreSQL DSN>'
nexora-finance-migrate status
nexora-finance-migrate apply
nexora-finance-migrate status
```

Expected final status: `applied`. Re-running `apply` is idempotent and reports
`unchanged`.

## Integrity controls

- All Finance tables are tenant-scoped with forced row-level security.
- Cross-table references include tenant identity where required.
- Monetary and exchange-rate values use exact PostgreSQL numeric columns.
- Posted journals must balance and become immutable; corrections use reversal.
- Per-company/period journal numbering is allocated atomically.
- Payroll posts through PostingService on the payroll transaction and requires
  both the HR payroll permission and Finance journal create/post permissions.
- Reporting reads posted/reversed ledger evidence rather than dashboard state.

## Rollback

```powershell
nexora-finance-migrate rollback
```

Rollback is preservation-safe: it refuses to remove a populated Finance
foundation. Take and verify a database backup before any rollback. Never bypass
the refusal by manually dropping tables in an operating environment.

## Verification

```powershell
python scripts/verify_postgres_finance.py
python scripts/verify.py unit integration contract security e2e migration
```

See `docs/evidence/FIN-PG-01-verification.txt` for the closeout record.

## Known boundary

This bounded foundation does not port bank-reconciliation persistence and is
not, by itself, a claim that the entire Finance module or ERP is production
ready.

## Multicurrency subledger activation — 2026-11-12

Additive source migrations: security `0021_multi_currency_subledger_permissions`
and Finance `0037_multi_currency_subledger`. The normal source-migration runner
applies them in dependency order. Acceptance uses disposable local databases;
no shared environment has been migrated or deployed by this change.

Use the established source-migration release procedure for a specifically selected
environment with a verified backup. These migrations preserve historical journals.
Rollback after posting must preserve financial evidence rather than drop populated
tables. API readiness requires both migration versions.

Before the first live operation, configure company functional currency, active
transaction currencies, dated functional-units-per-foreign-unit rates, open periods
and bank accounts. Assign appropriate company scopes through governed security
administration for `finance.subledger.read`, `.manage`, `.approve`, `.post` and
`.report`. Permission definitions do not grant access automatically. Posting
requires an independent checker and revalidates their live company authority.

In Finance → Multi-currency Accounting → Accounting setup, map eight distinct
active posting accounts: AR asset, AP liability, revenue, expense, realized gain
(revenue), realized loss (expense), unrealized gain (revenue), unrealized loss
(expense). Changes create policy versions; controls cannot change after activity.
Nonmonetary advances require a deferred-income/prepayment control. Invoice taxes
require the appropriate explicit tax account.

Create/adopt financial customers/vendors in the company. An approved Purchase
bill's **Prepare bill accounting** action prepares a linked draft; it does not
post or pay automatically. Legacy Sales sample data is labelled and is not an
opening-balance import. Reconcile existing controls before an opening-data cutover.

Verification commands (local disposable services must be running):

```powershell
npm.cmd run test:unit -- --maxWorkers=2
npm.cmd run test:contract
npm.cmd run api:check
npm.cmd run test:integration -- tests/integration/multi-currency-subledger.test.ts tests/integration/banking-revaluations.test.ts
$env:TEST_SOURCE_BOOTSTRAP_DATABASE_URL='postgresql://nexora@127.0.0.1:55433/nexora_source_test'
npm.cmd run test:security -- tests/security/company-currency-database-security.test.ts tests/security/finance-currency-database-security.test.ts
npm.cmd run test:e2e:multi-currency
npm.cmd run test:e2e:bank-revaluation
npm.cmd run typecheck
npm.cmd run build:web
```

Browser runners reserve disposable database/bucket/build paths, use synthetic
users and clean them afterward. Screenshots remain in `tmp/multi-currency-evidence`;
logs in `outputs/bank-reconciliation-e2e` are overwritten by the next browser run.
Never point acceptance fixtures at operating business data.


## Unified tax management activation (2026-11-12)

Apply additive source migrations `security/0022_tax_management_permissions`,
`finance/0038_unified_tax_management`, and `hr/0152_unified_tax_components` through
the existing source migration runner, after their predecessors. Runtime readiness
checks all three. Local implementation/testing does not activate a shared runtime.
Use the identified target environment, its approved migration procedure and backup
before applying migrations; do not point acceptance fixtures at business data.

Grant company-scoped `finance.tax.read` to tax operators. Configuration writes
require both `finance.tax.manage` and `finance.tax_mapping.admin`, plus a live
`administrator` or `super_administrator` role. No real permissions, rates or
mappings are seeded. Impersonated configuration writes are rejected. Configure
actual tax definitions at Accounting > Taxes; all rates in tests are synthetic.

Nominals must be active company posting accounts: recoverable tax uses an asset;
output tax, WHT and payroll deductions use liabilities. Header, bank/reconciliation
and AR/AP control accounts are excluded. A general nominal's currency must match
the source currency. Configuration edits append immutable effective revisions.
Posted applications lock their effective cutoff and retain exact source, rate,
nominal, currency, base-conversion and journal evidence. Deactivation blocks new
use while exact compensating reversals retain original evidence.

Purchase lines can select governed recoverable tax; the server replaces entered
percentages and retains line snapshots. Approved bill accounting derives all
selected line mappings, amounts and line rounding. Mixed nonzero governed/manual
taxes on one bill must be split into separate accounting documents. Existing
manual documents remain explicitly manual; percentages never silently infer a
mapping. Operational Purchase Payment instructions remain non-posting; actual
withheld supplier payments use Currency Accounts and independent financial review.

Live accounting documents accept a governed definition and exclusive taxable
amount. The server derives gross/net payable or receivable and nominal effects.
Supplier settlements allocate gross payable, enter the actual net bank principal
before fees and select the settlement WHT definition. Cumulative rounding clears
partial-payment tax residues. A bill that withheld at recognition cannot withhold
again at settlement. Cross-currency bank deals retain their actual conversion
reference and separate FX/rounding effects. Rates may be 0?100%; a 100% invoice-stage
withholding would create a zero open item and is rejected; use settlement-stage
withholding for a fully withheld payable.

Payroll definitions link one existing active deduction component and an earlier
active earning component in salary order; its liability must match the mapping.
Only employees whose approved salary includes that component receive the flat-rate
deduction. Calculation freezes tax evidence, and journal review/posting revalidates
it. Existing statutory packs, independent approvals and immutable results remain
in force. Configuration does not replace progressive statutory calculations or
create a payroll component. A component cannot combine unified flat-rate and
published statutory deductions; calculation fails closed if both target it.
Flat-rate definitions resolve at the payroll month start; a mid-month definition
becomes eligible in the next monthly run. After a tax change blocks a calculated run, use the
existing reopen/recalculate/review flow. Supported bases are explicit component
amounts, not inferred whole-payroll taxable income.

Fixed Assets context can be configured/resolved; a live asset register/posting
adapter, statutory return filing, e-invoicing, compound taxes and historical tax
backfills are outside this delivery. Preserve old tax_rule references. Rollback
must disable the console/source integrations and restore a compatible application;
do not drop populated revision, application or audit tables.

Verification commands:

```powershell
npm.cmd run test:unit -- --maxWorkers=2
npm.cmd run test:contract
npm.cmd run test:integration -- tests/integration/tax-management.test.ts tests/integration/tax-payroll-posting.test.ts tests/integration/multi-currency-subledger.test.ts
npm.cmd run test:integration -- tests/integration/hr-payroll-journal.test.ts tests/integration/hr-payroll-runs.test.ts
npm.cmd run test:e2e:taxes
npm.cmd run test:e2e:multi-currency
npm.cmd run api:check
npm.cmd run catalogue:check
npm.cmd run typecheck
npm.cmd run build:web
node scripts/audit-ui-theme.mjs --check
git diff --check
```

Tax browser evidence is under `tmp/tax-management-evidence`; the runner cleans
its disposable database, object storage and temporary web build on exit.
