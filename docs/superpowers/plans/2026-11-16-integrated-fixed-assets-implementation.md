# Integrated Fixed Assets implementation

Approved design: `../specs/2026-11-16-integrated-fixed-assets-extension-design.md`.
The user approved implementation on 16 November 2026. No further design approval
is needed for the described scope.

## Delivery tasks

- [x] Contracts and additive migrations: typed category fields, policy snapshots,
  nominal classification, purchase registration instructions and origin guards.
- [x] Purchase and posting: save/reload unit details, validate live authority,
  create draft assets in the existing AP posting transaction, prevent duplicates.
- [x] Company policies and calculation: defaults/overrides, Actual/Actual accrual,
  double declining balance, summaries and existing monthly compatibility.
- [x] UI: purchase registration dialog, configurable category fields, policy page,
  complete register columns and eight detail tabs.
- [x] Worker: opt-in durable monthly draft generation without implicit posting.
- [ ] Verification and rollout: isolated database tests, contract/client parity,
  UI/browser checks, theme audit, type checks and production build; fresh backup
  before any local runtime migration or replacement.

Implementation verification is complete: 55 focused integration, 23 calculation,
23 contract and 8 Chromium tests passed; scheduler rejection/large-batch checks
were rerun (7 passed). Types, lint, API/catalogue parity, theme audit, diff and the
production build passed. Evidence and exact checks are recorded in
`../../architecture/remaining-ui-migration.md`.

The remaining rollout action is blocked on explicit authorization to copy the
business database into ignored `tmp/backups` and a disposable local restore
database. Automatic approval review rejected that backup destination despite the
approved implementation design. No recovered-database migration or service
replacement has occurred. After approval, execute the prepared backup, migration,
restart and verification steps in `../../runbooks/local-startup.md`, then record
the actual migration version, live worker readiness and unchanged record checks.

## Verification strategy

Extend existing asset/procurement/subledger fixtures and tests. Financial tests
must check real PostgreSQL journal and allocation records, rollback, concurrency,
idempotency, live permissions, source reversal, closed periods and RLS. Calculation
tests cover independent expected values, leap years, method distinctions, residual
floors and cumulative rounding invariance. Browser checks cover actual persisted
purchase forms and register navigation at desktop/tablet/mobile widths.

Preserve `docs/runbooks/local-startup.md` from the prior login recovery. Use the
isolated test stack on 55433, never reset the recovered database on 55435.

## Executed checks

```powershell
npm.cmd run test:integration -- tests/integration/fixed-assets-extension.test.ts tests/integration/fixed-assets-attachments.test.ts tests/integration/fixed-assets.test.ts tests/integration/fixed-assets-preparation-batch.test.ts tests/integration/finance-nominals.test.ts tests/integration/finance-general-nominals.test.ts
npm.cmd run test:unit -- tests/unit/fixed-assets-calculations.test.ts
npm.cmd run test:contract
npm.cmd run typecheck
$env:NEXT_DIST_DIR='tmp/integrated-assets-ready-build'
npm.cmd run build:web
npm.cmd run api:check
npm.cmd run catalogue:check
node scripts/audit-ui-theme.mjs --write
node scripts/audit-ui-theme.mjs --check
git diff --check
```

The six-file integration run passed 55 tests. After the final scheduler guard,
`fixed-assets-extension.test.ts` and `fixed-assets-preparation-batch.test.ts` were
rerun: 7 passed. After the final staged-file quota, the attachment suite was
rerun: 4 passed. Calculation and contract checks each passed 23 tests.

Chromium used the real isolated API/PostgreSQL/MinIO fixture and a synthetic
cookie identity seam. Eight tests passed with:

```powershell
$env:NEXORA_ASSETS_E2E='true'
$env:TEST_SOURCE_BOOTSTRAP_DATABASE_URL='postgresql://nexora@127.0.0.1:55433/nexora_source_test'
$env:PLAYWRIGHT_USE_EXISTING_WEB='true'
$env:PLAYWRIGHT_BASE_URL='http://127.0.0.1:3204'
.\node_modules\.bin\playwright.cmd test tests/e2e/fixed-assets.spec.ts --workers=1
```

That isolated preview was stopped after acceptance. The final production build
then passed with the same finished UI. Changed TypeScript/TSX files also passed
the repository ESLint CLI. Existing Finance/shell formatting outside the intended
edits was preserved. Isolated Next build paths were removed from `next-env.d.ts`.
