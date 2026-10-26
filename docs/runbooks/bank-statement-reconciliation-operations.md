# Bank Statement Import and Reconciliation operations

This runbook covers the localhost/UAT Bank Statement Import and Reconciliation
cutover delivered by BR-01 through BR-12. It does not authorize a Railway or
production deployment, a shared-database migration, or the import of real bank
data.

## Controlled local cutover

1. Back up the selected local database and confirm that its URL resolves to
   `localhost`, `127.0.0.1` or `::1`. Use an explicitly named `uat`, `test`,
   `isolated`, `provision` or `reconciliation` database.
2. Apply the repository source migrations with the normal database migration
   command only after confirming the target. The Banking readiness check requires
   Security 18, Finance 29 and Platform 10.
3. Confirm that Shoaib already has active company access and tenant-scoped
   `super_administrator` approval-override authority. BR-12 does not create or
   broaden that global role.
4. Select two different active tenant-wide Security administrators: one maker and
   one checker. Neither may be Shoaib.
5. Set the following variables in the current PowerShell session and run
   `npm.cmd run uat:provision-bank-reconciliation`:

   ```powershell
   $env:NEXORA_ENVIRONMENT = "uat"
   $env:NEXORA_UAT_CONFIRM = "<tenant-id>"
   $env:NEXORA_BANK_RECONCILIATION_TENANT_ID = "<tenant-id>"
   $env:NEXORA_BANK_RECONCILIATION_COMPANY_ID = "<company-id>"
   $env:NEXORA_BANK_RECONCILIATION_MAKER_USER_ID = "<security-maker-user-id>"
   $env:NEXORA_BANK_RECONCILIATION_CHECKER_USER_ID = "<security-checker-user-id>"
   $env:NEXORA_BANK_RECONCILIATION_SHOAIB_USER_ID = "user-shoaib-super-admin"
   $env:DATABASE_URL = "<confirmed-local-isolated-database-url>"
   npm.cmd run uat:provision-bank-reconciliation
   ```

The script uses the governed Security role and assignment workflows. It creates
one company-scoped overlay containing only the 19 Statement Import, Statement
Mapping, Reconciliation and Reconciliation Adjustment permissions. A second run
verifies and reuses the same active overlay without new audit events or assignment
versions. It fails closed on scope/permission drift, missing migration heads, a
non-local database, a non-isolated tenant, a non-independent checker or missing
approval-writer authority.

The provisioning command creates no Bank Account, statement, reconciliation,
adjustment, journal, balance or synthetic financial row. Import a synthetic UAT
statement through the authenticated UI only when that separate data action is
explicitly authorized.

## Parser and upload limits

- Accepted file types are `.csv` and `.xlsx`; the maximum original file size is
  25 MiB and the maximum statement size is 1,000 data rows.
- The parser accepts at most 64 columns, 4,000 characters per cell, 256 KiB per
  record and a header row from 1 through 100. Parsing is bounded to 15 seconds.
- CSV supports UTF-8 and Windows-1252 with a one-to-four-character delimiter.
  Formula-like CSV text remains inert.
- XLSX parsing is limited to the selected worksheet and cached formula results;
  formulas are not executed. Encrypted/macro-enabled files, external workbook
  relationships, DTD/entities, unsafe paths, more than 256 ZIP entries, entries
  above 16 MiB, expanded content above 64 MiB and compression ratios above 100
  are rejected.
- Validation, duplicate decisions and row inclusion remain server authoritative.
  Finalization stages rows for reconciliation and never posts to the General
  Ledger.

## Object retention and cleanup

Original uploads are immutable objects referenced by checksum and storage key.
The worker schedules `bank-statement-orphan-cleanup` hourly by default. It scans
only `bank-statements/quarantine/`, waits a default 24-hour grace period, and
deletes an object only while holding its reference lock and only when no
`bank_statement_import` row references it. Referenced originals, including
finalized statements, are retained.

| Variable                             |    Default |      Allowed range |
| ------------------------------------ | ---------: | -----------------: |
| `BANK_STATEMENT_CLEANUP_EVERY_MS`    |  3,600,000 | 300,000-86,400,000 |
| `BANK_STATEMENT_ORPHAN_GRACE_MS`     | 86,400,000 | 60,000-604,800,000 |
| `BANK_STATEMENT_CLEANUP_PAGE_SIZE`   |        100 |            1-1,000 |
| `BANK_STATEMENT_CLEANUP_MAX_OBJECTS` |      1,000 |           1-10,000 |

Alert on repeated cleanup failures, a non-zero `missingIntents` result, or
persistently truncated runs. Do not manually delete referenced statement objects.

## Reconciliation monitoring

- API readiness must remain `ok`; a failure in the Banking foundation check means
  required tables or Security 18 / Finance 29 / Platform 10 are unavailable.
- Monitor counts and age for imports in `uploaded`, `draft` or `validated`, and
  reconciliations in `draft`, `in_progress` or `submitted`. Investigate stale
  records rather than changing states directly in SQL.
- Submitted reconciliations should have zero authoritative difference, no
  unmatched statement rows and a separate eligible checker. Approved records are
  immutable and create no journal entry.
- Manual reconciliation selections must be changed only through the versioned API.
  Do not edit `bank_reconciliation_manual_selection` or its immutable event table
  directly. Imported running balances are evidence only and never create a
  balancing journal or silently clear a reconciliation difference.
- Adjustment posting is a separate Finance action. Monitor submitted/approved
  adjustments that remain unposted, posting failures, reversal activity and
  closed/missing-period errors.
- Review immutable `bank_statement_import_event`, `bank_reconciliation_event`,
  `bank_reconciliation_adjustment_event`, `approval_override_event` and
  `security_audit_event` evidence for investigations. Never repair history by
  updating event tables.

## Safe rollback and resume

If provisioning stops mid-workflow, rerun the same command with the same tenant,
company and actors. It resumes the governed draft, approval, activation or
assignment request. Do not delete pending Security requests or edit normalized
grant tables manually. An active overlay whose permissions or scope differ from
this release requires a Security review and a new governed change, not an
automatic rewrite.
