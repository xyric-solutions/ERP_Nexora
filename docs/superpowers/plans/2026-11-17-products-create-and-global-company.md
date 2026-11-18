# Product creation and global company implementation

Approved design: `docs/superpowers/specs/2026-11-17-products-create-compact-cards-global-company-design.md`.
The referenced writing-plans skill is not installed in either local skill root;
this plan records the implementation sequence directly.

1. Reproduce the Inventory currency failure with a non-owner, non-bypass-RLS
   PostgreSQL role. Set authenticated transaction-local user context and verify
   currency options, create/update, denied scope and connection-context isolation.
2. Compact the existing Product cards; expose actionable missing-currency/loading
   and retry states. Remove redundant operating-company controls from the audited
   Inventory, Purchase and Accounting hierarchy views without removing business
   company fields or changing API authorization.
3. Add the real authenticated company selector to the persistent shell top bar.
   Reuse session APIs, the unsaved-form guard and keyed company remount; clear
   record navigation after a successful switch and preserve state on failure.
4. Add focused UI and browser regressions. Verify search/filter/pagination,
   creation/save/reload, company switching/cancel/failure, both themes and three
   viewport widths. Run typecheck, targeted lint/format, theme audit and builds.
5. Backport only the approved changes to the compatible localhost source. Verify
   source provenance and schema compatibility, build it, then replace only the
   compatible services required for this fix. No database migrations, credential
   changes or separately gated full Purchase/Assets rollout.
6. Update documentation/evidence, review the diff, commit and push to
   `shoaib_nexora`.

## Verification results

- Reproduced the empty Inventory currency directory using a non-owner,
  non-bypass-RLS PostgreSQL role before adding transaction-local user context.
  The final regression also verifies create/edit, denied and revoked company
  access, correct code/version preservation and pooled-connection context cleanup.
- `npm.cmd run test:unit -- tests/unit/workspace-company-select.test.tsx tests/unit/products-workspace.test.tsx tests/unit/inventory-products.test.ts tests/unit/purchase-document-form.test.tsx tests/unit/finance-hierarchy-workspaces.test.tsx`
  — **57 passed**. Covers company switch success/cancel/failure/retry, stale data
  after company remount, Product Add New/settings errors/grid continuation and
  preserved Purchase behavior.
- `npm.cmd run test:integration -- tests/integration/inventory-products.test.ts`
  — **14 passed**, including the restricted runtime regression above.
- `npm.cmd run typecheck` — passed. Touched-file `eslint` — passed for the Product,
  company/shell, affected Finance/Assets/Purchase views, API and test files.
  Targeted Prettier checks passed for the new control, Product/Inventory/Purchase
  views and focused tests. Existing Accounting wrapper formatting was retained;
  a formatter-equivalence guard prevented unrelated semantic changes.
- `node scripts/audit-ui-theme.mjs --write` / `--check`; `git diff --check` — passed.
  Impeccable detector returned `[]` on the affected Product/shared-company surfaces.
- `NEXT_DIST_DIR=tmp/products-global-responsive-root-build` with
  `npm.cmd run build:web` — passed. Restored canonical `next-env.d.ts` imports after
  the build. Compatible API: `npm.cmd run build --workspace @nexora/api` — passed.
  Compatible frontend: relative `NEXT_DIST_DIR=tmp/products-global-responsive-build`
  with `npm.cmd run build:web` — passed. Its eight existing CSS optimizer warnings
  remain; tracked application builds had no application build warnings.
- Set `NEXORA_INVENTORY_E2E=true`,
  `TEST_SOURCE_BOOTSTRAP_DATABASE_URL=postgresql://nexora@127.0.0.1:55433/nexora_source_test`,
  `PLAYWRIGHT_USE_EXISTING_WEB=true`, `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3218`,
  then `.\node_modules\.bin\playwright.cmd test tests/e2e/inventory-products.spec.ts --workers=1`
  — **11 passed** on the final responsive production build. Real API/PostgreSQL
  create/save/reload/edit, validation, failed-save preservation, read-only access,
  missing records, warehouses, draft transfers and six theme/width combinations.
  The tablet regression explicitly retains the expanded sidebar.
- `node tmp/products-global-company/verify-live.mjs` with concealed credential
  input — passed actual unchanged-account sign-in, active currency availability
  and Add New in both companies, real top-bar company switching, unsaved discard
  cancellation, navigation reset and wrong-company HTTP 403. Products list/form
  passed both themes at 1440/768/390px with zero Axe violations, page overflow,
  page errors or Inventory failures. Checked Inventory warehouse/transfer,
  Purchase, Accounting categories/sections, Assets and HR for one top-bar company
  control. No test business documents were saved on the active database.
- Visually reviewed live desktop light, tablet light and mobile dark screenshots.
  Evidence/reports: ignored `tmp/products-global-company/`. Disposable browser
  screenshots: `tmp/inventory-products-evidence/` and `tmp/inventory-operations-evidence/`.

Verification also exposed and corrected settings errors being cleared by list
loading, missing grid continuation, and tablet top-bar overflow with an expanded
sidebar. A premature private web restart was recovered immediately; the starter
now validates the target build before stopping the existing web process.

## Runtime handoff

Localhost serves `tmp/asset-workpages-release/source` with relative build
`tmp/products-global-responsive-build`; the compatible API runs from that source's
`server/api/dist/server.js`. Private runtime/provenance reports and restart helpers
are in `tmp/products-global-company/`. Automatic migrations are explicitly off.
The new Inventory source module is otherwise identical to the compatible baseline;
the backport preserves the older Purchase/accounting contracts and calculations.
No protected rollout helper or `.env` was changed. Credentials and existing
business/financial records remain unchanged. The separate full Purchase/Assets
backup and migration authorization is still pending; the latest tracked build
above includes this correction for that eventual rollout.
