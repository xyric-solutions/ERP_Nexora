# Budget Management implementation

Approved scope: `docs/superpowers/specs/2026-11-18-budget-management-design.md`.
Preserve all pre-existing workspace changes. Work inside this repository only.

## Work sequence

- [x] Persistence and contracts: additive Budget module migrations after HR and
  procurement, scoped permissions, strict contracts, exact spread/variance helpers,
  document/version/allocation persistence, OpenAPI and generated client.
- [x] Governance: independent approvals, immutable history, revisions, models,
  scenarios, activation, policies and controlled transfers with transactional
  idempotency and optimistic versions.
- [x] Accounting: purchase dimensions/provenance, reservations, partial financial
  recognition, reversals, policy checks at purchasing and shared GL posting,
  as-of availability and variance reports.
- [x] UI: dedicated connected views for all eleven existing page IDs, compact
  entry grid, selectors/filters, safe Excel import/export, forecasts, dashboards,
  approval and audit drills using shared Tailwind/shadcn controls.
- [x] Verification: unit/contract/API/database/security tests, isolated browser
  workflows, typecheck/lint/API generation/theme audit, production build, diff
  review and migration handoff.

## Test strategy

Use repository Compose services and disposable databases, never business data.
Test fiscal-year boundaries, exact totals, duplicate allocation keys, validation,
company/tenant access, role revocation, maker-checker, stale changes, replay,
partial recognition/FX/tax, accounting reversals and concurrent controls.
Browser acceptance must save/reload records and exercise source accounting;
UI appearance alone is insufficient. The known baseline purchase menu test fails
because its expected list predates Purchase Returns; keep this separate from new
Budget failures.

## Verification record

- `npm.cmd run typecheck`: passed across all workspace projects and the web app.
- `npm.cmd run test:integration -- tests/integration/budget-management.test.ts tests/integration/budget-controls.test.ts tests/integration/purchase-bank-integration.test.ts`: 40 passed.
- `npm.cmd run test:integration -- tests/integration/postgres-migrations.test.ts`: 15 passed, including fresh and upgrade source chains.
- `npm.cmd run test:unit -- tests/unit/budget-calculations.test.ts tests/unit/budget-spreadsheets.test.ts tests/unit/finance-posting.test.ts tests/unit/purchase-document-form.test.tsx tests/unit/purchase-amounts.test.ts tests/unit/banking-statement-parser.test.ts tests/unit/banking-statement-import-service.test.ts`: 82 passed.
- `npm.cmd run test:contract -- tests/contract/budget-management.test.ts`: 3 passed.
- `npm.cmd run test:e2e:budget`: passed against a disposable database, authenticated API, web, Redis and object storage. Includes all eleven routes, maker/checker/read-only access, save/reload, revision/model application, real workbook upload/commit, forecast/EAC and six layout screenshots in `tmp/budget-evidence/`.
- Focused `npx.cmd eslint` over Budget, affected shell/purchase/posting/parser integrations and acceptance tooling: passed.
- Focused `npx.cmd prettier --check` over new Budget source and test files: passed.
- `npm.cmd run api:generate`, `npm.cmd run api:check`, `npm.cmd run catalogue:generate`, `npm.cmd run catalogue:check`: passed.
- `node scripts/audit-ui-theme.mjs --write` and `--check`: passed; 132 feature view sources with zero direct font/colour exceptions. The existing shared HR monochrome print exception remains.
- `$env:NEXT_DIST_DIR='tmp/budget-verification-build-20261118'; npm.cmd run build:web`: passed, including TypeScript and all eight static pages.
- `git diff --check`: passed. Pre-existing tax changes were preserved.

The focused tests include exact monetary remainders, duplicate pools, stale
updates, revoked permissions, impersonation, tenant/company RLS, concurrent
codes and approvals, immutable evidence, source-bound exceptions, balanced
transfers beyond the first display page, proportional recognition, reversal
backfill/replay, atomic posting rollback and independently approved closure.
The unrelated baseline Purchase Returns menu expectation remains unchanged;
the full repository suite is not represented as passing.

## Deployment / safe resume point

Implementation is complete. Apply the normal source migration chain in the
intended environment (`npm run db:migrate:source`), then restart API/web and
assign company-scoped `budget.*` permissions through Identity & Access.
Security 24 and Budget 1-3 are additive; no grants or control policies are
enabled automatically. The runtime readiness check requires those migrations.

Configure fiscal periods, chart accounts and base currency. Create/approve a
baseline with independent actors, reconcile legacy purchasing exposure and
activate its control policy. Source exception requests offer effective policies
for explicit expected spending years, including purchases spanning calendars.
Unmanaged historical allocation rows are preserved and flagged for deliberate
migration. Imports replace a draft only after a version-bound preview and
confirmation; formulas are rejected. Reports and imports have explicit bounded
limits with actionable errors; reconciliation currently accepts up to 2,000
purchase documents and 2,000 recognition/reversal journals per company.

No live business database, role assignments, budgets or GL journals were changed
for acceptance. Future changes should continue from the approved design and
these connected feature boundaries rather than reintroducing a mock fallback.

## Local live deployment (2026-11-18)

The owner subsequently requested activation in the running ERP after observing
the old Planning Scenarios prototype. The actual services were still running
the older `tmp/units-of-measure/release/source` build on ports 3000/4000.

- Prepared `tmp/budget-deployment/source` from that verified live release,
  preserving its Finance, Banking, Inventory, HR and shell views while integrating
  Budget and the tested purchasing/asset recognition dependencies.
- Staged backend compilation, production frontend build and the 26 Budget
  PostgreSQL integration tests passed. Final build ID: `GRLBiyK1wP8EEkp4y7Hsm`.
  The preview frontend served successfully on port 3018 and was stopped for the
  final rebuild. Its explicit Tailwind application scan excludes test/backup
  artifacts from generated CSS.
- The staged release's isolated authenticated browser acceptance passed: all
  eleven menus, save/reload, maker/checker and read-only roles, model application,
  workbook upload/commit and forecast/EAC. Evidence is under
  `tmp/budget-deployment/source/tmp/budget-evidence/`; API reads/writes use its
  disposable PostgreSQL database, not the shared business database.
- Created `tmp/budget-deployment/backups/pre-budget-1795001987840.dump` (3,514,152
  bytes); restored it into a disposable database, verified its migration ledger
  and all 324 existing tables, applied the dependency/Budget migrations and
  confirmed the original table columns/rows remained unchanged. Evidence:
  `tmp/budget-deployment/backup.json` and `migration-rehearsal.json`.
- Rehearsed targets: Security 24, Finance 41, Procurement 7, Fixed Assets 7 and
  Budget 3; other live module versions remain unchanged. No controls are enabled
  and no budgets or financial journals are generated by deployment.
- The approved access change added only the 16 defined `budget.*` permissions to
  the existing Super Administrator policy, scoped to its two existing companies.
  It preserves all current permissions, company assignments, credentials and
  maker/checker restrictions and appends a security audit event.
- Automatic approval review initially required explicit approval for the exact
  role-access addition and service interruption. The owner subsequently approved
  those actions. `activate.ps1` then rechecked the exact process/build identities,
  applied the rehearsed migrations, provisioned the scoped grants with security
  audit `056fafc0-7fdb-4bf1-983c-0e8ac68d6865`, and switched API/web successfully.
- Live activation completed at 2026-11-18 11:52:50 UTC. Both services now run
  `tmp/budget-deployment/source` on the normal ports 3000/4000. Runtime and rollback
  identities: `tmp/budget-deployment/runtime.json` and `previous-runtime.json`.
  Existing table data was verified unchanged before/after migration; only the
  explicitly approved role grants and their audit were then added.
- Live `/api/v1/health/ready` returns 200 with `database: ok` and
  `budget_management: ok`. The normal frontend serves the verified build and
  Budget/API bundles; all 17 referenced static scripts return 200. OpenAPI
  exposes 24 Budget paths, and a valid unauthenticated options request returns
  401. Evidence: `tmp/budget-deployment/http-verification.json`.
- Fresh authenticated authority and actual runtime-database reads passed for
  Budget options, directory and reports in both existing companies; an
  unapproved company was denied. Evidence:
  `tmp/budget-deployment/database-verification.json`.
- The first company has 12 fiscal periods and 136 eligible chart accounts. No
  budgets have been invented or seeded. Four pre-existing approved purchases
  require deliberate commitment reconciliation before controls may be enabled.
  The second company has no fiscal periods/chart accounts yet and needs those
  masters configured before budget entry. No control baseline was activated and
  no financial journal was posted by deployment.

Safe resume: the connected Budget release is live. Refresh the browser to load
the new bundle/session grants; use the actual company masters to create plans,
then approve/reconcile/activate through the normal governed workflows. Use the
new release runtime record rather than the historical Units of Measure record.

### Submenu layout correction

The initial connected workspace repeated its filters, summary cards and generic
tables too prominently. The approved eleven-workflow design is now represented
by dedicated overview components and page configuration. Scenario/forecast
directories use a validated version-kind query with matching server pagination;
the source picker loads versions independently. Availability and variance use
different columns and summary measures; report links open the relevant workflow.
No data schema, posting policy or role grant changed.

The expanded browser acceptance passed after correcting notification persistence
on generated-version navigation and legacy dark-mode button inheritance. It
checks all eleven empty/populated routes, worst-case scenario creation, saved
allocations, maker/checker approval, model application, workbook import/export,
forecasting and read-only access. Budget integration: 26 passed; contracts: three
passed. See `tmp/budget-evidence/` and the UI migration checklist for evidence.
The refresh helper verifies process/build identity, retains the previous frontend
build for rollback and performs no migrations or access provisioning.

The correction is live as build `6SpS7WCw_QWMn8UhkeXf_` from
`tmp/budget-page-layout-build`. Production build, full typecheck, focused lint,
API generation check, theme audit and whitespace check passed. Live served-build
identity, all 17 referenced scripts, dedicated page labels, database/Budget
readiness, actual company repository reads and unauthenticated/wrong-company
denials passed. Updated runtime and HTTP evidence are in
`tmp/budget-deployment/runtime.json` and `layout-http-verification.json`.
The existing frontend build remains available for rollback.
