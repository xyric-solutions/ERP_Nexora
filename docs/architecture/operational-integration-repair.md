# Operational integration repair — 20 November 2026

## Current result

The supplier accounting setup/access repair is verified and live. The approved
stock foundation, receipt/AP accrual matching and actual manufacturing commands
are now implemented as an **unreleased candidate**, verified with disposable
PostgreSQL and real authenticated sessions. Commercial Sales persistence remains
the next implementation increment in the
[repair design](../superpowers/specs/2026-11-20-operational-integration-repair-design.md),
committed as `109cac1`. Owner approval and sequencing are recorded in `8895455`;
no further design approval is pending.

The owner will create fresh records after the connections are ready. Existing
records are preserved and are not automatically posted, deleted, reclassified
or treated as approved opening stock. Business accounting acceptance remains
**NO-GO** while the remaining integrations and actual configuration are pending.

## Stock and actual manufacturing candidate — not activated

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
- Delivery/return source posting remains explicitly unavailable until persistent
  commercial Sales is installed. No sample delivery is turned into a posting.

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

These checks do not establish owner accounting approval or live readiness. The
business database and pinned ports 3000/4000 still run the previous release. All
new migration applications and accounting postings so far used disposable test
databases; release rehearsal and matched-runtime activation remain outstanding.

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
