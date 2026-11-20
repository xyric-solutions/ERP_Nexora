# Operational integration repair — 20 November 2026

## Current result

The supplier accounting setup/access repair is verified and live. The approved
stock foundation, receipt/AP accrual matching, actual manufacturing and persistent
commercial Sales are implemented and the combined authenticated browser journey
and restored-business-copy migration rehearsal have passed. Final release checks
and matched-runtime activation are in progress. The
work follows the
[repair design](../superpowers/specs/2026-11-20-operational-integration-repair-design.md),
committed as `109cac1`. Owner approval and sequencing are recorded in `8895455`;
no further design approval is pending.

The owner will create fresh records after the connections are ready. Existing
records are preserved and are not automatically posted, deleted, reclassified
or treated as approved opening stock. Business accounting acceptance remains
**NO-GO** while actual financial configuration, cutover decisions and owner cases
are pending. Technical workflow verification does not approve business settings.

## Stock and actual manufacturing

- Additive Inventory migrations 4/5 and Security migration 28 add immutable stock
  entries, explicit valuation/mapping history, reviewed operations, FIFO cost
  allocations, receipt/bill matching and narrowly scoped permissions. There is
  no opening-plan backfill, old-document posting or business-data correction.
- Openings, approved receipts, transfers, actual production consumption and
  partial/final output post through the existing centralized Finance service in
  one transaction. FIFO/weighted-average cost preserves exact residual value.
  Maker/checker/poster permissions, current company authority, source versions,
  period/currency/dimension checks, replay protection, forced RLS, shortage
  prevention and compensating reversals remain enforced.
- Tracked AP bills require posted receipts of the same supplier/order line.
  Recognition clears historical GRNI; reviewed price/exchange variance is
  separate. Append-only matching prevents over-recognition. AP reversal restores
  matching; stock reversal waits for AP compensation and cannot predate it.
- Budget commitments for newly configured tracked products use their actual
  stock account and become actuals on receipt capitalization. AP clearing does
  not release the same commitment twice. Services/assets retain their existing
  paths, controls remain enforced, and reconciliation includes stock receipts.
- `#/inventory/stock-movements` provides real bounded directories, reviewed setup,
  draft creation, quantity/cost/accounting evidence, independent decisions and
  posted balances. Product on-hand quantities and manufacturing progress read
  posted evidence. Approved orders alone still create no stock.
- Persistent Sales now supplies approved delivery/return sources to this same
  stock lifecycle. No sample delivery is turned into a posting.

Verified checkpoints: 1,642 unit tests; 27 contract tests; 87 existing
Inventory/Manufacturing/Procurement/AP-AR database regressions, 54 accounting-
integrity/Fixed Assets regressions, 14 stock tests and 26 Budget tests (181
database integration tests across 11 files); one
authenticated three-actor browser journey with independent SQL GL/WIP/quantity/
audit assertions; two authenticated AP/AR invoice/payment-to-reconciliation
browser regressions. The web production build passed (`NHnp19S1qEaEn9SDtpkJP`),
as did root and changed-test type checks, targeted ESLint, contract/client drift,
catalogue and theme checks. The shared table's existing keyboard-scroll option
also works when evidence/list tools are disabled, with a regression test.
The Budget suite required correcting its old generic-GL
fixture to use a non-control offset; existing AP bypass prevention was retained.
The first browser runs exposed a stale balance view and keyboard-inaccessible
table scrolling; both were corrected and the final journey passed.

Actual API screenshots for 1440/800/390 widths in light/dark themes are under
`tmp/posted-stock-acceptance/*-{light,dark}.png`. Desktop dark and mobile light
were inspected. There was no page overflow or serious/critical Axe violation.
Source theme checks report no direct feature-view font/colour exceptions.

These historical checkpoint checks do not establish owner accounting approval.
The current combined verification and release evidence is recorded below.

## Persistent Sales

- Security migration 29 and Sales migrations 1–4 add scoped commercial documents,
  retained source lines, versioned audit and request identities. Customers, products,
  units, warehouses, projects, locations, users, currencies and taxes reuse actual
  existing masters. No business documents, prices or configurations are seeded.
- Optional named quotation/template review and explicit creator confirmation are
  separate from independent Finance/Stock posting. Confirmed source quantities are
  reserved transactionally; over-delivery/invoicing/credit/return and concurrent
  duplicate fulfillment are rejected. Direct invoices retain their own fulfillment
  identity; order-derived invoices and deliveries share the real order-line identity.
- Actual delivery issues FIFO/weighted-average stock to each product's explicit
  COGS account. Repeated physical product lines share one cost issue with exact
  line allocation. Physical returns restore original delivery cost; financial
  credits do not restock. Delivered-policy invoice posting requires posted delivery.
- Source invoice/credit recognition uses the central AR/GL lifecycle and the
  existing receipt/Banking service. Dedicated Sales FKs preserve Procurement's
  source reference meaning. Source review retains actual revenue/tax mappings,
  currency precision, credit controls, dimensions, due dates and audit.
- Credits consume original posted line tax, including the final rounding residual
  after rate changes. Reversals retain prior tax evidence and require dependent
  credits/returns or delivered-policy accounting to be compensated first.
- Weekly/monthly billing and retained quarterly/yearly schedules require explicit
  customer/period generation. Approved invoices retain the approved template
  revision through later template edits. No worker automatically bills live records.
- Normal Sales routes now use generated APIs. The existing card/table/form/panel
  primitives remain; editable prices and quantities are decimal strings. The fixed
  catalogue, invented tax percentages and session store are restricted to explicit
  `prototype:` routes. Shell Sales counts/decisions use actual database activity.
  Receipt/accounting screens reuse the existing Finance workspace with source
  filtering. Print/Save PDF uses actual company/source values and Unicode browser
  printing; its monochrome export CSS is a deliberate print-only exception.

The 21 real PostgreSQL Sales tests cover actual manufacturing → delivery → AR →
receipt, separate return/credit effects, tax residuals/reversal, JPY/KWD, weekly
template revision, source limits and non-superuser/NOBYPASSRLS isolation. The
authenticated browser journey additionally confirms supplier payment −40 and
customer receipt +60 produce bank balance 20 and zero reconciliation difference.
Independent SQL verifies eight balanced journals, stock/WIP/GRNI/AP/AR zero,
COGS 40, revenue 60 and sixteen Finance lifecycle audit rows.

Initial browser runs found a missing source-read grant in the isolated poster
fixture, a combobox selector, stale views after another actor's decision, and a
nested table wrapper. The fixture/selector were corrected, existing Finance
Refresh is used between actors, Sales record Refresh was added, and the table
wrapper corrected. Final combined and existing browser journeys pass. Accounting
controls were retained. The initial full unit run had 18 obsolete shell/activity
and mock-Sales permission expectations; after updating those boundaries, all
1,650 pass. Nine Sales paths are included in the OpenAPI contract allowlist.

## Combined verification and release evidence

| Check                                                                                                                                                                                              | Final result                                                                                                    |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `npm.cmd run test:unit -- --maxWorkers=2`                                                                                                                                                          | 1,650 passed / 207 files; zero failures                                                                         |
| `npm.cmd run test:contract -- --maxWorkers=2`                                                                                                                                                      | 29 passed / 7 files; zero failures                                                                              |
| `node --import tsx tmp/run-accounting-regressions.mjs` with accounting-integrity, multi-currency-subledger, tax-management, budget-controls, budget-management integration files, `--maxWorkers=1` | 87 passed / 5 files                                                                                             |
| Same isolated runner with inventory-products, manufacturing-workflow, procurement-workflow, ap-ar-readiness, posted-stock-ledger, sales-persistence integration files, `--maxWorkers=1`            | 99 passed / 6 files                                                                                             |
| `TEST_SOURCE_BOOTSTRAP_DATABASE_URL` set to the dedicated test service; `npm.cmd run test:security -- --maxWorkers=1 --hookTimeout=120000 --testTimeout=60000`                                     | 63 passed / 13 files; zero skipped/failures in final database-enabled run                                       |
| `npm.cmd run test:e2e:ap-ar`                                                                                                                                                                       | 2 authenticated cookie/API/PostgreSQL journeys passed                                                           |
| `NEXORA_STOCK_E2E=true npx.cmd tsx scripts/run-bank-reconciliation-e2e.ts`                                                                                                                         | 1 authenticated stock/manufacturing journey passed                                                              |
| `NEXORA_SALES_E2E=true npx.cmd tsx scripts/run-bank-reconciliation-e2e.ts`                                                                                                                         | 1 complete purchase/manufacturing/Sales/banking/reconciliation journey passed                                   |
| `npm.cmd run api:check`; `npm.cmd run catalogue:check`; theme `--write` / `--check`; `git diff --check`                                                                                            | Passed; 137 view sources, zero direct font/colour exceptions                                                    |
| Scoped ESLint on changed TypeScript                                                                                                                                                                | Zero errors; only ignored generated `next-env.d.ts` warning during harness run                                  |
| `npm.cmd run typecheck`; changed-test `tsc` project                                                                                                                                                | Passed                                                                                                          |
| `npm.cmd run build:web`                                                                                                                                                                            | Passed; build `mOyA0ifNkOi6Ryy3o6USQ`                                                                           |
| Restored business-copy migration rehearsal and replay                                                                                                                                              | Passed; 364 original table projections and all native/base ledger balances unchanged; new business tables empty |

Browser evidence is under `tmp/operational-sales-acceptance/` and
`tmp/posted-stock-acceptance/`; logs are retained under
`tmp/operational-integration-release/evidence/`. Six Sales viewport/theme images,
independent SQL evidence, no page overflow, no nested tables, no serious/critical
Axe findings. Desktop light and mobile dark were visually inspected.

The database backup is
`tmp/backups/operational-integration-1795171715707.dump`, SHA-256
`90c40436bf1ae14d644a1dbd2a232596df6038ab78dcb33cf058d7e05e84a739`.
The rehearsal verifies exact original-column projections rather than ignoring
business fields when additive Sales FKs appear. Only seven permission definitions,
their existing Super Admin grants/scopes, and the expected two Super Admin policy
version increments are permitted changes to old tables. Replaying migrations
reports no changes. Local migration/activation results are recorded at handoff.

Migrations: Inventory `0004_posted_stock_ledger`,
`0005_purchase_receipt_accrual`; Security `0028_operational_stock_permissions`,
`0029_persistent_sales_permissions`; Sales `0001_commercial_documents`,
`0002_source_integrity`, `0003_posting_references`,
`0004_compensation_and_tax`. Finance remains 43, Procurement 8, Manufacturing 4.
Key components: `server/api/src/modules/sales`, centralized Finance/stock source
adapters, `packages/contracts/src/sales`, generated client/OpenAPI, persistent
Sales views/components/models, shell activity, and authenticated tests. Stock
foundation is committed as `6ee1930`.

Remaining owner blockers: legal company/cutover, approved AP/AR and inventory
account mappings, terms/finite credit, tax treatment/rates, FX, opening stock and
balances, independent business operators and existing reconciliation difference
−USD 110,000. No existing approved payment or manufacturing instruction was posted.
Recurring billing remains explicit generation within approved schedule dates;
this release adds no automatic background billing or historical backfill.

## Increment 1 — live supplier-path changes

- `PurchaseAccounting` reads actual company policy and canonical supplier links
  before enabling preparation. All suppliers in a multi-vendor payment are
  checked. Missing prerequisites are listed with **Open accounting setup**;
  failed reads retain disabled preparation and provide retry.
- The Purchase form opens the existing full Finance setup through
  `#/purchases/supplier-currency-accounts/accounting-setup`. This route exposes
  the existing eight-account policy, explicit supplier adoption and reviewed
  financial terms. It does not interpret the setup marker as a source document.
- Opening a source bill no longer creates a financial supplier account as a side
  effect. Missing adoption produces an explicit setup message. Actual adoption
  continues through the existing authorized, audited command.
- Existing linked operations remain reviewable if today's setup is incomplete.
  No server-side accounting control or approval requirement was weakened.
- The authenticated AP browser regression now prepares both the bill and the
  payment through their real Purchase screen buttons, then submits, independently
  approves/posts, and reconciles through the existing APIs and real PostgreSQL.

No backend/API/schema or financial configuration values changed. No new package
or dependency was added. Finance 43, Procurement 8, Inventory 3 and Manufacturing
4 remain the database versions. The unrelated `.env.example` and lockfile edits
were retained and excluded from this repair's commit.

## Verification

| Check                                                                                                                                                                                                                  | Result                                                                                                              |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `npm.cmd run test:unit -- --maxWorkers=2`                                                                                                                                                                              | **1,637 passed**, 205 files, zero final failures                                                                    |
| `node --import tsx tmp/run-accounting-regressions.mjs tests/integration/multi-currency-subledger.test.ts tests/integration/manufacturing-workflow.test.ts tests/integration/inventory-products.test.ts --maxWorkers=1` | **43 passed**, 3 files, disposable PostgreSQL                                                                       |
| `npm.cmd run test:contract -- tests/contract/multi-currency-subledger.test.ts`                                                                                                                                         | **4 passed**, 1 file                                                                                                |
| `npm.cmd run test:e2e:ap-ar`                                                                                                                                                                                           | **2 passed**, authenticated real API/PostgreSQL journeys                                                            |
| `npm.cmd run typecheck`                                                                                                                                                                                                | Passed                                                                                                              |
| `npx.cmd tsc -p tmp/tsconfig-operational-repair-tests.json --pretty false`                                                                                                                                             | Passed for changed/new test sources                                                                                 |
| `npm.cmd run build:web`                                                                                                                                                                                                | Passed; build `BwwLvi01L9hwaZX_u4YSy`                                                                               |
| `npm.cmd run api:check`; `npm.cmd run catalogue:check`                                                                                                                                                                 | Passed                                                                                                              |
| Targeted ESLint and Prettier checks                                                                                                                                                                                    | Passed for the checked component/workspace/new test/E2E sources; existing shell and legacy test formatting retained |
| `node scripts/audit-ui-theme.mjs --write`; `--check`                                                                                                                                                                   | Passed; zero direct feature-view font/colour exceptions                                                             |
| `git diff --check`                                                                                                                                                                                                     | Passed                                                                                                              |

The first full unit run used default concurrency alongside compilation, timed
out in unrelated suites and was aborted. The complete lower-concurrency rerun
passed without deleting tests, increasing timeouts or changing those suites.
The 47 focused UI/unit results are a subset of the final 1,637, not extra tests.

Browser evidence: `tmp/operational-integration-repair/evidence/` contains the
AP/AR log and Purchase accounting screenshots at 1440, 820 and 390 pixels in
light/dark themes. Desktop/light and mobile/dark captures were inspected.
The isolated tests do not authorize or prove owner acceptance of live postings.

## Database preservation and runtime

Before and after activation, 85 scoped audit queries ran in repeatable-read,
read-only transactions. The two companies' captured business structures,
configuration, records, journals/balances and module versions compare exactly.
No business mutations were issued. The main company still has three historical
posted journals and its USD 1,110,000 bank/capital balance; approved PAY-005 and
BILL-005 remain unposted. The new UI correctly exposes the missing setup.

Private preservation/runtime evidence is under
`tmp/operational-integration-repair/` and `tmp/integration-repair-20261120/`.
No migration was required or applied.

Port 3000 now serves the pinned repaired frontend. All 14 initially served
scripts match build `BwwLvi01L9hwaZX_u4YSy`; 1,147 pinned source and 1,256 compiled
artifacts match the workspace candidate. The existing API on port 4000 is
retained: its 613 backend source files and 1,256 compiled artifacts match the
candidate exactly, so no API restart was required. Readiness checks passed and
an anonymous company financial-workspace request remains HTTP 401.

The first startup attempts correctly refused occupied ports. The verified old
web process was then replaced with the pinned frontend; the unchanged API was
left running. Local startup helpers now select the repaired frontend.
No authenticated owner posting was attempted on the business database.

## Remaining work and configuration

1. Complete the remaining commercial Sales increment on the verified stock
   foundation. Preserve the live release until the combined migrations and full
   production-to-sale-to-bank journey pass release rehearsal.
2. Implement persistent commercial Sales using canonical products/customers and
   the shared stock/Finance services. Its prototype catalogue and session store
   are unchanged by this supplier-path repair.
3. Complete the [owner configuration register](../finance/owner-accounting-configuration-register.md)
   through governed setup: eligible control/FX accounts, real supplier/customer
   terms, credit, tax, currencies, warehouses, valuation/WIP/accrual/COGS mappings
   and reviewed cutover. None of these values was invented or auto-approved.
4. Verify the new full production-to-sale-to-bank journey and independent SQL
   reconciliations in isolated PostgreSQL; then obtain actual owner business
   approvals before new live acceptance postings.
