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
