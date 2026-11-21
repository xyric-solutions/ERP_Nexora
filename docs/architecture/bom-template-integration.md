# BOM templates, categories and actual production costs

Owner approval: 20 November 2026, after proposal `8e5aa14`.
Design: [approved specification](../superpowers/specs/2026-11-20-bom-planning-product-categories-design.md).

## Implemented behavior

- Inventory → Products has Products / Configuration tabs. Configuration maintains
  company category identities, CAT codes, active status, versioning and immutable
  audit evidence. New products require an active category. Existing unlinked text
  remains visible as legacy/unmapped; migrations do not recategorize records.
- BOM templates have Details, Finished Goods, Raw Material, Non Stock, Expenses
  and Notes sections. Materials use canonical product/unit/warehouse references.
  Stock in hand is read from posted stock, with its date and warehouse; it does
  not reserve quantities. Non-stock and expense amounts are estimates.
- Planning fetches the actual BOM and calculates proportional base quantities,
  stock availability and shortages. Existing plan/material tables retain the
  immutable source revision and requirements. Conversion copies them exactly once.
- Manufacturing orders retain the same sections. Material quantity deviations
  need reasons. Confirm & Approve freezes the recipe. Later BOM edits do not
  rewrite approved orders. Legacy records retain their original null snapshots.
- Actual manufacturing issue fills materials from the approved recipe, using
  cumulative rounding for partial batches. Server checks retain the product and
  warehouse references and require explanations for quantity differences. Changed base units require
  a corrected approved recipe before actual issue/output.
- Stock Movements supports actual production charge allocation from eligible
  posted expense journal lines. Current Finance source-read permissions, normal
  independent submit/approve/post controls and the central posting service apply.
  Posting debits the original WIP dimensions and credits the evidenced expense;
  it does not create another payable or change physical quantities. Allocation
  is capped across batches, with immutable positive/compensating rows.
- Completion includes material cost plus approved actual charges, preserving
  exact partial/final amounts. Estimated charges require an explicit actual-cost
  review. Compensate finished output before charges, charges before material
  issue, and allocations before reversing or crediting the source expense.

## Schema and API

Additive migrations: Security 0030, Inventory 0006/0007, Manufacturing 0005.
Finance remains 0043; Procurement remains 0008. No business categories, financial
mappings, balances or transactions are seeded by these migrations.

Versioned API additions: `/inventory/categories`, `/manufacturing/requirements`,
`/manufacturing/material-balance`, `/manufacturing/products/{id}/units`.
Existing product, BOM, plan, order and stock contracts were extended compatibly.
Contracts, OpenAPI and the generated web client change together. Backend readiness
checks require the matching new schema before reporting these services ready.

## Verification and local release

Technical checks passed on the isolated release candidate:

| Check | Result |
| --- | --- |
| Unit suite (`npm.cmd run test:unit -- --maxWorkers=2`) | 1,654 passed / 208 files |
| API contracts (`npm.cmd run test:contract -- --maxWorkers=1`) | 29 passed / 7 files |
| Real PostgreSQL integrations | 193 distinct cases passed / 12 files, in the final relevant runs |
| Database-enabled security suite | 63 passed / 13 files; no skipped tests |
| Authenticated BOM/stock/actual-charge browser journey | 1 passed, including independent posting, GL/cost assertions, light/dark, 390/800/1440 widths and Axe serious/critical checks |
| Authenticated purchase/payment -> manufacture -> Sales/receipt -> reconciliation | 1 passed |
| Backend TypeScript and production web build | Passed |
| Changed TypeScript ESLint, API/client drift, catalogue drift, diff check | Passed after final JSX escaping correction |
| Feature theme audit | Zero font/colour exceptions across 138 feature view source files |

PostgreSQL groups: accounting-integrity, multi-currency-subledger, tax-management,
budget-controls and budget-management (87); manufacturing-workflow and
sales-persistence (25); inventory-products, procurement-workflow and
ap-ar-readiness (60); manufacturing-template-readiness and posted-stock-ledger (21).
Run through `node --import tsx tmp/run-accounting-regressions.mjs` with the named
`tests/integration/*.test.ts` files, `--maxWorkers=1 --hookTimeout=120000
--testTimeout=120000`. The wrapper creates and drops a disposable local database.
Security used the documented test PostgreSQL service on 55433. Browser runs used
`NEXORA_STOCK_E2E=true` and `NEXORA_SALES_E2E=true`, separately, with
`npx.cmd tsx scripts/run-bank-reconciliation-e2e.ts`.

Initial precision/schema/migration and contract expectation failures were fixed
and rerun. Fixture role isolation and test-date/text assertions were corrected;
accounting guards were retained. Loaded parallel runs initially hit test/startup
timeouts; final runs passed with bounded fixture allowances. A working-tree unit
run also exposed a receivable-form test failure in unrelated unfinished UI work;
that work was preserved and excluded. All 1,654 candidate unit tests passed.

The final build succeeds with eight generated-CSS optimization warnings containing
malformed extra utility candidates. Existing theme rules remain unchanged; build
source scanning/cache cleanup remains a separate follow-up. These are warnings,
not hidden test failures or evidence of full ERP UI acceptance.

Local activation is pending the final source commit and served-asset verification.
The backup/restore rehearsal preserved original-column data across **376 existing
tables**, exact ledger balances and all existing records. New business tables
were empty. Replaying migrations produced no changes. The only authorized
security change was the category permission and existing Super Admin catalog sync.

Backup: `tmp/backups/bom-template-1795272521107.dump`.
SHA-256: `037842e9c1ad0a246c0f6e6464cece0265519f6becf3c124edfa33237a1ae1b0`.
Release evidence and protected runtime helpers stay under `tmp/bom-template-release`.
Unrelated unfinished finance/sales/profile UI edits and environment/lockfile edits
are excluded from this candidate.

## Owner acceptance boundary

Create and approve actual company categories, product/BOM masters, valuation and
account mappings through the application before new business postings. Existing
financial configuration decisions and the historical reconciliation difference
are unchanged. No existing bill/payment/order is automatically posted, amended,
backfilled or replaced. This feature does not constitute ERP-wide or go-live
accounting acceptance.
