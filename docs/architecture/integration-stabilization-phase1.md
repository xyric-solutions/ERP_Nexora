# Integration Stabilization Phase 1 — 19 November 2026

Status: the reconciliation correction and matched local database/API/frontend
release are active and verified. Full accounting acceptance still requires the
AP/AR setup and authenticated business journeys described below.

## Scope and correction

The Bank Reconciliation adjustment writer captured the journal entry number as
both reference and narrative. The normal ledger projection instead uses the
immutable posted line narrative. Because both fields enter the ledger-population
hash, an unchanged posted adjustment failed submission with
`RECONCILIATION_LEDGER_REFRESH_REQUIRED`.

The writer now captures the same trimmed posting narrative, with the existing
500-character projection limit. The reference remains the journal entry number.
No hash field, stale-population check, approval, permission, posting, reversal,
idempotency or immutability guard was removed or relaxed. Existing business
reconciliation captures are not rewritten. Preflight found no affected live
unapproved adjustment captures.

The database regression asserts equality with immutable accounting-event
evidence, exercises approval/post/replay/reverse/replacement/submission, then
returns the reconciliation for review and proves that a separate actual ledger
posting still blocks stale submission. A legacy authority fixture now represents
base-currency postings with a null FX rate, as the existing currency authority
requires. Obsolete fixture `etag` fields were removed and a required nullable
running-balance field supplied; contracts and validations were preserved.

## Migration and business-data safeguards

The release applies only these pending migration versions:

- Finance 41 → 42: `0042_accounting_integrity_guards.forward.sql`.
- Procurement 7 → 8: `0008_canonical_business_parties.forward.sql`.

Their compatible API, audit writer, contracts/client and supplier selector were
already approved pending work. They must ship together. The release also retains
the previously approved navigation visibility; there is no new screen design.

Both migrations were applied successfully to the existing local business
database on 19 November 2026. All other module migration versions are unchanged.
No remote production environment was deployed. The API on port 4000 and frontend
on port 3000 now both use `tmp/stabilization-phase1/release/source`; web build
`cK_78vAmcGo8cz8q_eKWK`. The private release manifest pins source and compiled
checksums; readiness verifies both exact migration identities. Served frontend
JavaScript hashes match that pinned build.

Preflight uses the existing protected migration configuration and read-only,
company-scoped queries against the local business database. It checks explicit
supplier links, master agreement, planned identity/code collisions, duplicate
names/tax IDs, bank/nominal/currency mapping, chart parents, journal accounts,
periods and source events, purchase source references, financial-operation
journal references, posted journal balance, AP/AR base/native differences,
duplicate posted source effects and adjustment capture consistency.

Observed business inventory before migration: two companies; the populated
company has two suppliers, four bank accounts, 338 chart accounts and three
posted/reversed ledger journals. Neither company has financial customers or an
AP/AR subledger policy. No duplicate-identity or reference/accounting blocker was
found. Empty subledgers do not establish live invoice/settlement acceptance.

A fresh consistent `pg_dump` backup is restored into an isolated PostgreSQL
database containing the real business records. Rehearsal checks all 362 existing
table fingerprints before migration, then existing rows and every posted
account/currency balance afterward. A second migration run must make no changes.
The live migration gate requires stopped web/API listeners, unchanged migration
checksums, a verified fresh backup/rehearsal and identical pre-migration records.

The final maintenance-window backup was restored and rehearsed again before
applying migrations. Its SHA-256 is
`f3dd95c8db609826bd681c111388f9bdfa61830c29cf715e0387eff877115167`;
archive `tmp/backups/stabilization-1795084085208.dump`. All 362 prior tables were
compared immediately after live migration: existing business fields and every
posted account/currency balance were preserved. Repeated live preflight reports
zero reference/accounting blockers and zero duplicate/status warnings.

Procurement 8 adds company-ownership metadata to existing supplier masters and
canonical references where applicable. Existing supplier business fields,
financial IDs, journals, open items, permissions, credentials and fiscal periods
are preserved. No customer, supplier, bank account, policy, opening balance,
financial transaction or role assignment is invented, merged, reset or posted.

Private backup, preflight, rehearsal, hashes and runtime evidence remain under
`tmp/stabilization-phase1/` and `tmp/backups/`. Credentials are neither committed
nor printed. The public API continues to use the non-superuser, non-BYPASSRLS
runtime role. Automated database regressions use disposable databases; live
acceptance does not use demo accounts or mocked API responses.

## Verification

- Full unit/frontend-service suite: 1,625 passed across 203 files, one worker.
- Contracts: 26 passed across six files.
- Final financial integration batch: **217 passed across 20 suites**, no skips
  or failures. The expanded adjustment regression is included in this result.
- Additional asset extension/preparation/attachment and chart-account coverage:
  **20 passed across four suites**. Total database verification in final runs:
  **237 passed across 24 suites**, zero failures/skips.
- Reconciliation targeted rerun: both governed authority and adjustment flows
  passed after correcting the invalid base-currency fixture.
- Type checks, focused database-test compilation, targeted ESLint, formatting,
  API drift, catalogue, production web build, theme audit and whitespace checks
  passed.
- Candidate login browser smoke checks: desktop and mobile passed using real
  responses, without signing into demo accounts or writing business data.
- Real-data backup restore and migration rehearsals passed, preserving all
  existing business fields and posted account/currency balances.
- Live readiness: all checks passed, including `accounting_integrity` and
  `canonical_business_parties`; runtime role remains non-superuser/non-BYPASSRLS.
  New object grants work; unscoped reads expose no business rows; anonymous
  supplier and financial-directory requests return HTTP 401.
- Read-only projection checks using the existing owner's persisted permissions:
  all four bank balances match the posted ledger. The populated company's two
  trial-balance rows match ledger debit/credit totals and balance. The second
  company has no bank or ledger records. No demo account or substitute business
  record was used for these checks.
- Both existing suppliers remain accessible through the canonical master
  directory with their original company scope and the owner's existing grants.
- Live desktop/mobile login checks passed with zero JavaScript errors and exact
  served-script hashes. Authenticated browser posting journeys were not run.

Commands:

```powershell
npm.cmd run test:unit -- --maxWorkers=1
node --import tsx tmp/run-accounting-regressions.mjs tests/integration/accounting-integrity.test.ts tests/integration/canonical-business-parties.test.ts tests/integration/banking-reconciliation-adjustments.test.ts tests/integration/banking-reconciliation-authority.test.ts tests/integration/banking-reconciliations.test.ts tests/integration/banking-payments.test.ts tests/integration/banking-receipts.test.ts tests/integration/banking-transfers.test.ts tests/integration/banking-revaluations.test.ts tests/integration/finance-posting.test.ts tests/integration/finance-journal-staging-hardening.test.ts tests/integration/multi-currency-subledger.test.ts tests/integration/procurement-workflow.test.ts tests/integration/purchase-bank-integration.test.ts tests/integration/fixed-assets.test.ts tests/integration/budget-controls.test.ts tests/integration/tax-payroll-posting.test.ts tests/integration/hr-payroll-journal.test.ts tests/integration/hr-payroll-journal-dimensions.test.ts tests/integration/hr-payroll-payment.test.ts --maxWorkers=1
npm.cmd run typecheck
node --import tsx tmp/run-accounting-regressions.mjs tests/integration/fixed-assets-extension.test.ts tests/integration/fixed-assets-preparation-batch.test.ts tests/integration/fixed-assets-attachments.test.ts tests/integration/finance-nominals.test.ts --maxWorkers=1
npx.cmd tsc --noEmit -p tmp/tsconfig-stabilization-tests.json
npm.cmd run test:contract
npm.cmd run api:check
npm.cmd run catalogue:check
npm.cmd run build:web
npm.cmd run build --workspace @nexora/api
node scripts/audit-ui-theme.mjs --check
git diff --check
powershell -NoProfile -File tmp/stabilization-phase1/database.ps1 -Action preflight
powershell -NoProfile -File tmp/stabilization-phase1/database.ps1 -Action backup
powershell -NoProfile -File tmp/stabilization-phase1/database.ps1 -Action rehearse
powershell -NoProfile -File tmp/stabilization-phase1/database.ps1 -Action migrate
powershell -NoProfile -File tmp/stabilization-phase1/verify-runtime.ps1
powershell -NoProfile -File tmp/stabilization-phase1/database.ps1 -Action verify
```

## Remaining acceptance prerequisites

Full accounting acceptance needs owner-approved AP/AR mappings and real master
records through normal setup, plus independently authorized maker/checker/poster
access. The existing owner retains financial read/setup/post authority in both
companies; no policy mappings, customer records or permission grants were inferred
or created by deployment.
Authenticated live browser journeys require the original user's normal sign-in;
credentials were not supplied for automated execution. These remain separate
from the isolated automated regression evidence and read-only live-data checks.

Recommendation: the technical release is ready for controlled setup and existing
Journal/Bank acceptance testing. **Complete AP/AR accounting acceptance is not yet
ready**: configure approved policy mappings and genuine master records, then run
authenticated approval/post/retry/reversal/report workflows with authorized users.
Neither a zero empty-subledger difference nor passing automated fixtures is a
live invoice/settlement acceptance result.

Retain additive database guards during an application rollback. Do not restore
the rehearsal database over business data, remove reconciliation checks, relax
RLS or rewrite financial history to make a release pass.
