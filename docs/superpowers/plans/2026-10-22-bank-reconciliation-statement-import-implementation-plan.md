# Bank Statement Import and Reconciliation Implementation Plan

- Status: approved design; implementation ready
- Date: 2026-10-22
- Approved design: `../specs/2026-10-22-bank-reconciliation-statement-import-design.md`
- Production surfaces: Import Statement, mapping profiles, statement directories,
  Reconciliation register, workspace, matching and approval
- Banking authority: `server/api/src/modules/banking`
- Accounting authority: posted `journal_entry` and `journal_line` records
- Object authority: `packages/domain/src/storage`
- Planned additive migrations: Security 0018 and Finance 0028
- Deployment target: localhost only; no Railway work

## 1. Outcome

Deliver database-backed Bank Statement Import and Bank Reconciliation workflows.
Authorized users can upload a bounded CSV or `.xlsx` file, retain the original
evidence in local MinIO, map native bank columns, validate and preview rows,
save a draft, and finalize the statement for reconciliation without posting to
the General Ledger.

Users can open a persisted reconciliation, review strict exact matches,
confirm suggestions or manual matches, resolve bank-only lines through approved
adjustment evidence, submit a zero-difference reconciliation, and obtain a
separate approval. Shoaib may use the existing audited Super Administrator
override in the local test company.

The browser uses the generated API client. No fixture fallback remains on the
live Import Statement, Statement or Reconciliation routes after cutover.

## 2. Baseline and constraints

1. Finance migration 0027 and Security migration 0017 are the current local
   heads. Recheck immediately before adding 0028/0018.
2. Bank Accounts, controlled bank nominals, posted Payments, Receipts,
   Transfers, journal entries, journal lines, workflow context, fiscal periods,
   idempotency and approval-override evidence already exist and must be reused.
3. Statement, reconciliation register and worksheet components currently use
   deterministic in-memory fixtures. Preserve their useful interaction model
   while replacing the data source and lifecycle.
4. `ObjectStorage` currently signs uploads/downloads and reads metadata. The
   statement pipeline needs bounded server-side write/read support so browser
   code never receives infrastructure credentials or raw object URLs.
5. No CSV or Excel parser dependency is installed. Add only reviewed,
   maintained packages with bounded parsing support; record license, version
   and security review in the implementation diff. Prefer a streaming CSV
   parser and an `.xlsx` parser that can disable formulas, links and external
   workbook resolution.
6. The worktree contains extensive user-owned Banking and Finance changes.
   Never reset, delete, reformat or commit unrelated work.
7. The row limit is 1,000. Large asynchronous-job infrastructure is outside
   this phase; parsing is synchronous and bounded.
8. Original statement content is confidential. Logs, errors and telemetry must
   not contain raw rows, account numbers, file URLs or object keys.

## 3. Non-negotiable invariants

1. Every query and mutation is tenant-, company-, permission- and Bank
   Account-scoped on the server.
2. Imported files and finalized statement rows never post accounting entries.
3. Only posted, non-reversed journal lines for the selected governed Bank
   Account nominal are eligible reconciliation candidates.
4. Exact auto-match is permitted only for one unique candidate with equal
   account, currency, direction, amount, normalized reference and a date within
   three calendar days.
5. Suggestions never become matches without explicit confirmation.
6. Confirmed statement lines and journal lines cannot participate in another
   active match.
7. Submission requires zero difference, no unresolved validation/duplicate
   rows, and posted evidence for every approved adjustment.
8. Approval is distinct from submission and does not post. Ordinary preparers
   cannot approve their own reconciliation.
9. Super Administrator self-approval uses the existing global override writer
   and immutable evidence; it is not a UI-only bypass.
10. Finalized imports and approved reconciliations are immutable. Reopen is out
    of scope.
11. Decimal strings cross API boundaries and PostgreSQL numeric values remain
    authoritative.
12. File and row fingerprints, mutation idempotency keys and optimistic versions
    prevent duplicate or stale work.
13. API errors use bounded standard problems with correlation IDs and never
    expose SQL/parser internals.
14. Historical migrations are never edited.

## 4. Dependency graph

| Wave | Slice | Depends on | Deliverable |
| --- | --- | --- | --- |
| 0 | BR-00 | Approved design | Baseline, dependency review and failure-first tests |
| 1 | BR-01 | BR-00 | Statement/reconciliation contracts and OpenAPI |
| 1 | BR-02 | BR-00 | Security 0018 and Finance 0028 authority |
| 1 | BR-03 | BR-00, BR-02 | Bounded object-storage, parser and cleanup adapters |
| 2 | BR-04 | BR-01, BR-02, BR-03 | Statement import repository/service |
| 2 | BR-05 | BR-01, BR-02 | Reconciliation/matching repository/service |
| 2 | BR-05A | BR-01, BR-02, BR-05 | Governed bank-only adjustment workflow |
| 3 | BR-06 | BR-04, BR-05, BR-05A | Routes, API composition and readiness |
| 4 | BR-07 | BR-06 | Generated client and Banking web adapters |
| 5 | BR-08 | BR-07 | Import Statement UI and mapping experience |
| 5 | BR-09 | BR-07 | Live statement and reconciliation register |
| 5 | BR-10 | BR-07 | Live reconciliation workspace and approval |
| 6 | BR-11 | BR-00 through BR-10 | Security/integration/E2E acceptance |
| 6 | BR-12 | BR-11 | Shoaib local authorization, docs and handoff |

Contract generation, migrations and API composition are serialized. UI work
must not consume handwritten copies of contracts.

## 5. Wave 0 - Baseline and failure-first characterization

### BR-00 - Establish safe baseline

**Inspect**

- `app/features/banking/views/banking-statement.tsx`
- `app/features/banking/views/banking-reconciliation*.tsx`
- `app/features/banking/model/banking-statement-data.ts`
- `app/features/banking/model/banking-reconciliation-data.ts`
- `server/api/src/modules/banking/router.ts`
- `server/api/src/modules/banking/source-repository.ts`
- `packages/domain/src/storage/*`
- Finance migrations 0001, 0005, 0008, 0026 and 0027
- Payment, Receipt and Transfer integration/security tests

**Create failing tests**

- `tests/unit/banking-statement-contracts.test.ts`
- `tests/unit/banking-reconciliation-service.test.ts`
- `tests/integration/banking-statement-imports.test.ts`
- `tests/integration/banking-reconciliations.test.ts`
- `tests/security/bank-reconciliation-database-security.test.ts`

**Work**

1. Capture `git status --short` and per-target diffs before edits. Stop and
   report any overlapping user change that cannot be preserved safely.
2. Read the relevant Next.js 16 documentation under `node_modules/next/dist/docs/`
   before planning or editing frontend boundaries.
3. Record current migration heads, API health and relevant focused-suite status.
4. Characterize existing prototype routes and navigation.
5. Add failing expectations for contracts, permissions, schema and no-fixture
   fallback.
6. Create test fixtures only in disposable databases/buckets; never upload or
   reconcile a real local company transaction.

**Gate**

- Existing focused Banking and storage tests pass or pre-existing failures are
  documented.
- New tests fail only because the approved feature is absent.

## 6. Wave 1 - Contracts, database authority and file adapters

### BR-01 - Add strict contracts and generated API surface

**Files**

- Create: `packages/contracts/src/banking/statement-imports.ts`
- Create: `packages/contracts/src/banking/reconciliations.ts`
- Modify: `packages/contracts/src/banking/index.ts`
- Modify: `packages/contracts/src/openapi-c4.ts`
- Modify: `packages/contracts/src/generate-client-c4.ts`
- Regenerate: `app/lib/api/generated.ts`
- Regenerate: `openapi-v1.json`
- Update contract/OpenAPI/generated-client tests

**Work**

1. Add mapping-profile, bounded multipart upload request/result, parse preview,
   import directory/detail, finalize and template-export schemas.
2. Add statement-row validation state, bounded issue and mapping-snapshot
   schemas.
3. Add reconciliation directory/detail, ledger candidate, match mutation,
   balance summary, lifecycle and audit schemas.
4. Bound filenames, MIME types, sizes, rows, columns, strings, dates, decimal
   strings, cursors and filters.
5. Model one bounded multipart upload to
   `POST /api/v1/banking/statement_imports`. The API streams the file directly
   to object storage while calculating SHA-256; it never returns a MinIO URL to
   the browser.

**Gate**

- Contract tests pass.
- `npm.cmd run api:generate` produces deterministic reviewed output.
- `npm.cmd run api:check` passes.

### BR-02 - Add permissions, schema, RLS and immutable guards

**Files**

- Create: `packages/db/source-migrations/security/0018_bank_reconciliation_permissions.forward.sql`
- Create: `packages/db/source-migrations/finance/0028_bank_statement_reconciliation.forward.sql`
- Update migration/security tests

**Security 0018**

Add, but do not implicitly grant:

- `banking.statement_import.read`
- `banking.statement_import.create`
- `banking.statement_import.update`
- `banking.statement_import.finalize`
- `banking.statement_mapping.read`
- `banking.statement_mapping.manage`
- `banking.reconciliation.read`
- `banking.reconciliation.create`
- `banking.reconciliation.update`
- `banking.reconciliation.match`
- `banking.reconciliation.submit`
- `banking.reconciliation.approve`
- `banking.reconciliation_adjustment.read`
- `banking.reconciliation_adjustment.create`
- `banking.reconciliation_adjustment.update`
- `banking.reconciliation_adjustment.submit`
- `banking.reconciliation_adjustment.approve`
- `banking.reconciliation_adjustment.post`
- `banking.reconciliation_adjustment.reverse`

**Finance 0028**

1. Add mapping profile/version and immutable profile event evidence.
2. Add import, statement line and import event tables.
3. Add reconciliation, captured ledger-population, match, adjustment,
   adjustment-event and reconciliation-event tables.
4. Add composite tenant/company foreign keys for genuinely company-owned
   relations such as Bank Account, account, import, statement line,
   reconciliation, match and adjustment. Keep tenant-scoped foreign keys for
   user and audit tables, with trigger guards proving current company access
   and evidence ownership. Prove journal-line company ownership through its
   parent `journal_entry`: add compatible candidate keys where safe or a
   guarded trigger that locks and validates tenant, company, journal and line.
   Do not rely on tenant-only RLS for company isolation.
5. Add status, transition, finalized/approved immutability, exact one-direction
   amount and row-count constraints.
6. Enforce strict company/Bank Account checksum uniqueness for files. Do not
   make row fingerprint globally unique: identical legitimate bank transactions
   may exist. Persist duplicate classification plus an explicit
   `accepted_duplicate`/`rejected_duplicate` disposition and audit evidence.
   Add one-active-match, one-live-overlapping-period and directory/candidate
   constraints/indexes.
7. Add permanent unique evidence preventing reuse of a statement line,
   finalized import or journal line after approved reconciliation.
8. Block reversal of a journal entry referenced by an approved reconciliation;
   reopen/reversal of approved reconciliation is outside this phase.
9. Add FORCE RLS tenant policies plus company-membership enforcement to every
   new business/evidence table.
10. Validate new constraints against existing rows before marking them valid;
    migration failure must be atomic and leave Finance 27 unchanged.

**Gate**

- Fresh database reaches Security 18 and Finance 28.
- Upgrade from Finance 27 preserves all existing Banking rows.
- Direct SQL tests prove tenant and company isolation, composite FKs,
  lifecycle/reuse/reversal guards and RLS without relying on API validation.

### BR-03 - Add bounded storage and parser adapters

**Files**

- Modify: `packages/domain/src/storage/object-storage.ts`
- Modify: `packages/domain/src/storage/s3-object-storage.ts`
- Modify: `server/api/src/modules/files/service.ts` only when shared behavior is
  genuinely reusable
- Create: `server/api/src/modules/banking/statements/file-parser.ts`
- Create: `server/api/src/modules/banking/statements/mapping.ts`
- Create: `server/worker/src/jobs/bank-statement-orphan-cleanup.ts`
- Modify: `server/worker/src/worker.ts` and its runtime/job registration
- Modify worker storage configuration/readiness wiring only as required
- Add storage/parser unit and integration tests
- Modify package manifests/lockfile only for reviewed parser dependencies

**Work**

1. Add bounded server-side streaming write/read methods with checksum and
   metadata verification, backpressure, request timeout and disconnect
   cancellation; keep signed methods compatible for existing consumers.
2. Generate server-owned statement object keys under a non-public prefix and
   use conditional create/no-overwrite semantics. Persist the unique object key
   and checksum before finalization.
3. Implement streaming/bounded CSV parsing with quoting, BOM and safe encoding
   handling.
4. Inspect `.xlsx` ZIP metadata before materialization. Reject excessive
   compressed bytes, total expanded bytes, archive entry count, per-entry size,
   compression ratio, shared-strings/styles/XML size, parse time or memory.
   Reject path traversal, DTD/entity expansion, macros, encryption and external
   relationships. Parse one selected sheet with bounded rows/columns/cells and
   inert formula results.
5. Normalize headers and cells without executing spreadsheet content.
6. Reject unsupported signatures even when the extension/MIME claims CSV/XLSX.
7. Add immediate cleanup for object/database partial failure and a durable
   orphan-cleanup job in `server/worker`, keyed by upload intent and retention
   state. Cleanup never deletes finalized or audit-retained evidence.
8. Add crash-boundary tests for disconnect during upload, object-written/
   database-failed, database-intent/object-missing and cleanup retry.
9. Register the cleanup job on a bounded repeat schedule, inject its storage
   dependency/configuration, include it in worker readiness, and stop/drain it
   during graceful shutdown. The job claims intents with database locking so
   concurrent workers cannot delete the same object.

**Gate**

- Storage integration proves immutable upload/read/checksum behavior in local
  MinIO.
- Parser tests cover standard/native files, formulas, malformed inputs and
  1,000/1,001-row boundaries, ZIP bombs, traversal, entity expansion, timeout
  and memory limits.

## 7. Wave 2 - Backend domain services

### BR-04 - Implement statement import authority

**Files**

- Create: `server/api/src/modules/banking/statements/service.ts`
- Create: `server/api/src/modules/banking/statements/source-repository.ts`
- Create focused fixtures/tests under `tests/unit` and `tests/integration`

**Work**

1. Implement company/Bank Account-scoped import options and mapping-profile
   directories.
2. Upload through the bounded storage adapter while hashing and detecting file
   type.
3. Parse using an immutable mapping snapshot and normalize date, direction,
   amount, currency, reference and details.
4. Create deterministic row fingerprints and classify valid/warning/error/
   duplicate rows.
5. Persist draft preview atomically; never leave partial line populations.
6. Support mapping revision/reparse before finalization with optimistic version
   and immutable events.
7. Implement line resolution for include, exclude-with-reason and explicit
   duplicate acceptance/rejection with optimistic version and audit evidence.
8. Implement CSV/XLSX sample export without tenant data.
9. Return bounded standard problems and correlation IDs.

**Gate**

- Import integration tests prove draft reload, mapping reuse, duplicates,
  idempotency, errors and finalization.
- Finalize creates no accounting event or journal entry.

### BR-05 - Implement reconciliation and matching authority

**Files**

- Create: `server/api/src/modules/banking/reconciliations/service.ts`
- Create: `server/api/src/modules/banking/reconciliations/source-repository.ts`
- Create: `server/api/src/modules/banking/reconciliations/matching.ts`
- Reuse: approval override writer and Bank workflow conventions
- Add focused unit/integration/security tests

**Work**

1. Build bounded ledger candidates from posted, non-reversed journal lines for
   the governed Bank Account nominal and currency.
2. Create reconciliation from one finalized import or manual-tick input while
   preventing overlapping live records.
3. Capture a stable ledger population through the statement cutoff, its hash
   and the authoritative ledger balance. At submit and approval, re-query the
   eligible population under locks; block with a refresh-required conflict if
   a backdated posting, reversal or other membership change is detected.
4. Implement conservative exact matching and deterministic explainable
   suggestions.
5. Implement confirm, reject, manual match and reasoned unmatch under locks.
6. Link bank-only rows to separately approved/posted adjustment evidence.
7. Enforce zero-difference and population readiness on submit.
8. Implement separate approval with the existing independent/delegated/global
   override rules and immutable evidence.
9. Mark statement and journal evidence reconciled atomically on approval.

**Executable accounting rules**

1. A debit to the governed Bank Account journal line is `money_in`; a credit is
   `money_out`. Other nominal lines are never reconciliation candidates.
2. Statement reconstruction is `opening_statement_balance + statement_money_in
   - statement_money_out` and must equal the supplied closing statement balance
   at the Bank Account currency precision.
3. Ledger outstanding-item reconciliation is
   `adjusted_ledger_balance = ledger_balance_at_cutoff
   - unmatched_ledger_money_in + unmatched_ledger_money_out`.
4. `difference = closing_statement_balance - adjusted_ledger_balance` rounded
   once to the governed currency minor-unit precision. Submission requires an
   exact zero at that precision.
5. Every included statement line must be confirmed against one posted journal
   line. Unmatched eligible ledger lines remain documented outstanding items
   and drive the adjusted-ledger formula.
6. Submit and approval lock the reconciliation, import/lines, match population,
   referenced journal entries and adjustment evidence in a deterministic order,
   recompute every total and reject any changed/reused/reversed evidence.

**Gate**

- Unique exact, ambiguous, suggestion, manual and reversal cases pass.
- Cross-account/company/tenant and maker self-approval attempts fail closed.
- Approval never creates a journal entry.

### BR-05A - Implement governed bank-only adjustments

**Files**

- Create: `server/api/src/modules/banking/reconciliations/adjustment-service.ts`
- Create: `server/api/src/modules/banking/reconciliations/adjustment-repository.ts`
- Reuse: Finance posting service, fiscal-period controls and approval override
- Add focused unit/integration/security tests

**Work**

1. Create one adjustment aggregate for one unmatched included statement line.
   Inputs are adjustment kind, eligible offset nominal, narrative and the
   immutable statement amount/direction; users cannot alter the bank amount.
2. Support `draft -> submitted -> approved -> posted -> reversed` with separate
   create/update/submit/approve/post/reverse permissions, idempotency and
   optimistic versions.
3. Resolve the governed Bank Account nominal server-side. Post exactly one
   balanced accounting event/journal through the Finance posting service:
   statement money-in debits Bank and credits offset; statement money-out
   credits Bank and debits offset.
4. Require an open permitted fiscal period and an active postable non-Bank
   offset nominal. Freeze facts at submit and accounting evidence at post.
5. Require an independent approver unless the existing governed override is
   valid and its immutable event is written.
6. Link the posted adjustment journal line to the reconciliation statement
   line, then let normal matching/recalculation consume it. Approval alone is
   insufficient; the adjustment must be posted.
7. Use compensating reversal only; never delete or mutate posted evidence.

**Gate**

- Charge and interest directions produce balanced journals.
- Approval does not post; post is explicit and idempotent.
- Reconciliation submission remains blocked until the posted adjustment's Bank
  journal line is confirmed.
- Cross-company nominal/account and self-approval violations fail closed.

## 8. Wave 3 - API routes and production composition

### BR-06 - Compose authenticated routes

**Files**

- Modify: `server/api/src/modules/banking/router.ts`
- Modify: `server/api/src/app.ts`
- Modify: `server/api/src/server.ts`
- Update: `tests/unit/banking-api-router.test.ts`
- Update readiness and contract tests

**Work**

1. Add the approved statement import, mapping, sample-export, reconciliation,
   match and decision routes.
   - `PATCH /statement_imports/{id}/lines/{lineId}` resolves inclusion,
     exclusion reason and duplicate disposition.
   - `POST /reconciliations/{id}/matches` creates an exact/manual confirmation
     or a deterministic proposal as specified by its action.
   - `POST /reconciliations/{id}/matches/{matchId}/decision` confirms or rejects
     a suggestion; `DELETE` performs reasoned unmatch before submission.
   - `/reconciliations/{id}/adjustments` and nested lifecycle routes create,
     update, submit, decide, post, reverse and link/unlink adjustment evidence.
2. Enforce authentication, origin/CSRF, permission, idempotency and `If-Match`
   guards before repository dispatch.
3. Compose storage, parser, statement and reconciliation repositories in the
   production server.
4. Raise Banking readiness to Security 18/Finance 28 and verify new tables plus
   object-storage readiness.
5. Keep error mapping bounded and correlation-aware.

**Gate**

- Route tests cover unauthenticated, CSRF, validation, stale version, denied
  permission, idempotent replay and success cases.
- API liveness/readiness pass only with complete dependencies.

## 9. Wave 4 - Generated client and web adapters

### BR-07 - Add browser client methods and routing state

**Files**

- Modify: `app/features/banking/api/banking-client.ts`
- Modify: `app/shell/prototype-content.tsx`
- Modify Banking navigation/config only where required
- Add client and navigation tests

**Work**

1. Add generated-client wrappers for upload, mapping, preview, finalize,
   reconciliation and match actions.
2. Add wrappers for adjustment create, update, submit, decision, post and
   reverse endpoints, including CSRF, idempotency and ETag/expected-version
   evidence.
3. Preserve CSRF, idempotency and ETag/expected-version behavior.
4. Route directories to persisted import/reconciliation detail IDs.
5. Remove fixture fallback only after live endpoints and empty/error states are
   proven.

**Gate**

- Client tests prove request bodies, multipart behavior, every adjustment
  lifecycle request, headers and bounded error display.
- Refreshing a route reloads the same persisted aggregate.

## 10. Wave 5 - Live Banking UI

### BR-08 - Build Import Statement and mapping UI

**Files**

- Create: `app/features/banking/views/banking-statement-import.tsx`
- Create focused import/mapping components under
  `app/features/banking/components` only where reused
- Reuse shadcn `Button`, `Input`, `Checkbox`, `Dialog`, `Textarea`, table and
  feedback primitives
- Add unit/a11y tests

**Work**

1. Match the approved screenshot's compact structure with live Bank Account,
   date-format, file and statement-reference controls.
2. Add sample CSV and Excel export.
3. Show mapping only when required or explicitly edited; support saved profile
   selection.
4. Render preview columns and per-row status/include controls with accessible
   issue details.
5. Show validation counts, loading, duplicate, empty, error and stale-version
   states.
6. Implement Cancel, Save and Close, and Post to Reconciliation and Close.
7. Make clear that finalization does not post to the General Ledger.
8. Preserve responsive horizontal scrolling and keyboard behavior.

### BR-09 - Replace statement/register fixtures with live data

**Files**

- Modify: `app/features/banking/views/banking-statement.tsx`
- Modify: `app/features/banking/views/banking-reconciliation-register.tsx`
- Retire only unused fixture imports after `rg` verification
- Add live directory/status/navigation tests

**Work**

1. Load Bank Accounts, finalized imports, statement rows and reconciliations
   through the API.
2. Preserve useful filters, pagination, totals and business labels.
3. Display Draft, In progress, Waiting for approval and Approved consistently.
4. Provide clear no-import/no-reconciliation and permission-denied states.
5. Do not delete fixture files until every active selector/import is proven
   unused.

### BR-10 - Replace worksheet fixtures with live matching

**Files**

- Modify: `app/features/banking/views/banking-reconciliation.tsx`
- Modify: `app/features/banking/views/banking-reconciliation-worksheet.tsx`
- Add focused match/approval components only where cohesive
- Add unit/a11y tests

**Work**

1. Render persisted statement rows and posted ledger candidates side by side.
2. Distinguish exact, suggested and manual matches and show suggestion reasons.
3. Add confirm/reject/manual match and reasoned unmatch actions.
4. Show authoritative balances/difference returned by the server.
5. Add adjustment-evidence state without enabling direct GL posting.
6. Add a focused adjustment drawer/dialog for draft, submit, approve and
   explicit post actions; reuse Finance nominal selection and period errors.
7. Add Save, Submit for Approval and governed Approve & Close behavior.
8. On partial workflow success, navigate to the authoritative persisted state;
   never create a duplicate on retry.

**Wave gate**

- Focused UI suites pass with no direct fixture dependency on live routes.
- Narrow-screen, keyboard, focus, busy, error and empty states pass.

## 11. Wave 6 - Acceptance, local authorization and handoff

### BR-11 - Run security and isolated end-to-end acceptance

**Files**

- Complete integration/security tests from BR-00
- Create: `tests/e2e/bank-statement-import.spec.ts`
- Create: `tests/e2e/bank-reconciliation.spec.ts`
- Create: `scripts/run-bank-reconciliation-e2e-api.ts`
- Create: `scripts/run-bank-reconciliation-e2e.ts`
- Add: `test:e2e:bank-reconciliation` package script
- Use isolated database, MinIO prefix and synthetic posted journal evidence

**Scenarios**

1. Standard CSV import, draft reload and finalize.
2. Standard `.xlsx` import and saved native mapping reuse.
3. Duplicate file/row, invalid date/amount and 1,001-row rejection.
4. Exact match, ambiguous suggestion, confirmation, unmatch and manual match.
5. Bank-only row blocked until approved posted adjustment evidence exists.
6. Zero-difference submit and separate approval.
7. Shoaib-style governed override with immutable event evidence.
8. Cross-company/tenant, stale version, CSRF and impersonation denial.
9. Browser refresh retains import and reconciliation state.
10. Approved reconciliation creates no new journal entry.

**Isolated harness contract**

1. `scripts/run-bank-reconciliation-e2e.ts` creates a random validated database
   name and random MinIO object prefix/bucket namespace, applies all migrations,
   provisions synthetic tenant/company/users/Bank Account/journals, and starts
   dedicated API and web child processes on free localhost ports.
2. It passes only task-specific environment variables to child processes and
   never reads or modifies Railway configuration.
3. It waits for API/web readiness before invoking Playwright with explicit
   base URLs.
4. In `finally`, it terminates only child PIDs it created, deletes only the
   validated random database and isolated MinIO objects, and retains logs on
   failure. Destructive targets are resolved and checked before cleanup.
5. Integration tests separately exercise fresh/upgrade migrations, parser and
   object storage. Worker tests exercise orphan discovery, retention exclusion,
   retry and idempotent cleanup.

**Required checks**

```powershell
npm.cmd run api:check
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run test:unit -- tests/unit/banking-statement-contracts.test.ts tests/unit/bank-statement-file-parser.test.ts tests/unit/bank-statement-orphan-cleanup.test.ts tests/unit/banking-reconciliation-service.test.ts tests/unit/bank-reconciliation-adjustment-service.test.ts tests/unit/banking-statement-import.test.tsx tests/unit/banking-reconciliation-workspace.test.tsx tests/unit/banking-client.test.ts
npm.cmd run test:contract
npm.cmd run test:security -- tests/security/bank-reconciliation-database-security.test.ts
npm.cmd run test:integration -- tests/integration/postgres-migrations.test.ts tests/integration/storage.test.ts tests/integration/banking-statement-imports.test.ts tests/integration/banking-reconciliations.test.ts
npm.cmd run test:e2e:bank-reconciliation
npm.cmd run build:web
git diff --check
```

Also run the focused accessibility assertions for Import Statement, the
reconciliation register/workspace, dialogs and keyboard match controls inside
the isolated Playwright project.

Mutation-capable browser acceptance must run only against the isolated harness.

### BR-12 - Provision Shoaib locally and document cutover

**Files**

- Create: `scripts/provision-bank-reconciliation-uat.ts`, implemented through
  the governed Security administration boundary and safe to rerun
- Modify: `docs/architecture/remaining-ui-migration.md`
- Modify: `docs/product/nexora-implementation-status.md`
- Add operator notes for parser limits, object retention and reconciliation
  monitoring

**Work**

1. Grant the new permissions only to Shoaib's local company-scoped overlay;
   do not broaden shared production roles.
2. Verify normalized/compatibility permission parity and approval-writer
   authority.
3. Apply Security 18/Finance 28 locally and verify readiness.
4. Import only a synthetic sample for UAT when explicitly authorized; do not
   create or approve user financial data during automated verification.
5. Record completed migration, remaining fixture retirement and safe resume
   point.

## 12. Final acceptance checklist

- [ ] CSV and `.xlsx` original files are immutable in local MinIO.
- [ ] File metadata, mappings, rows, imports, reconciliations and matches reload
      from PostgreSQL.
- [ ] Standard templates and native mapping profiles work.
- [ ] Files above 1,000 rows and unsafe workbooks fail before finalization.
- [ ] Duplicate files and rows cannot silently enter reconciliation.
- [ ] Finalizing an import creates no GL/accounting records.
- [ ] Exact matches are strict and unique; suggestions require confirmation.
- [ ] Cross-tenant/company/account matching is impossible.
- [ ] Zero-difference and approved adjustment evidence are enforced by server
      and database controls.
- [ ] Separate approval and audited Shoaib override both work.
- [ ] Approved reconciliation creates no journal entry and is immutable.
- [ ] Import, statement, register and worksheet use live API data with no silent
      fixture fallback.
- [ ] Full typecheck, lint, focused tests, API check, production build and
      `git diff --check` pass.
- [ ] Local API readiness is `ok`; Railway is untouched.

## 13. Safe execution order

1. Complete BR-00 and stop if baseline failures overlap required files.
2. Execute BR-01, BR-02 and BR-03 in separate reviewable batches.
3. Run migration/storage/parser gates before BR-04 or BR-05.
4. Complete backend and API composition before any fixture removal.
5. Implement Import Statement before reconciliation UI so finalized source
   evidence exists for the workspace.
6. Run isolated lifecycle acceptance before local Shoaib provisioning.
7. Review every migration, dependency and authorization diff as a financial-
   control change before handoff.
