# Purchase search and totals implementation

Approved design: `../specs/2026-11-17-purchase-search-and-total-design.md`.

The referenced writing-plans skill is absent from the available skill directories.
This plan records the approved implementation directly.

1. Extend the existing exact-decimal purchase helpers and contracts with optional
   discounts and charge rows; add focused rounding/allocation regression tests.
2. Add additive purchase persistence and validate/recompute adjustments and tax
   snapshots server-side. Preserve order inheritance and partial source limits.
3. Update approved-bill accounting matching, debit allocation and linked asset
   cost validation to consume the shared breakdown.
4. Reuse the current searchable selector and add adjustments and the visible
   summary to the existing form; update payment schedules and source copying.
5. Exercise save/reload, source matching, tax/accounting/asset consistency and
   keyboard/responsive behavior on disposable data. Run relevant tests, typecheck,
   touched-file lint, production build, theme audit and diff checks.
6. Update architecture/runbook notes, review the complete diff, commit and push
   to `shoaib_nexora`. Respect the existing business-data rollout approval gate.

## Verification record

Implemented in the existing Purchase Form, shared contracts, Procurement API and
existing AP/Fixed Assets integrations. No new dependency or financial execution
workflow. The existing selector already embedded search; acceptance verifies its
real directory requests and keyboard selection. CSV output now retains the new
financial details with document totals once and separate charge rows.

Passed:

- `npm.cmd run test:unit -- tests/unit/purchase-amounts.test.ts tests/unit/purchase-document-form.test.tsx tests/unit/purchase-bill-payment-terms.test.ts tests/unit/searchable-select.test.tsx tests/unit/purchase-export.test.ts` — **66 tests**.
- `npm.cmd run test:integration -- tests/integration/procurement-workflow.test.ts tests/integration/multi-currency-subledger.test.ts tests/integration/tax-management.test.ts tests/integration/fixed-assets.test.ts` — **90 tests**.
- `npm.cmd run test:integration -- tests/integration/purchase-adjustments-migration.test.ts` — **1 test**, real schema 5→6 with unchanged historical purchase/audit evidence and idempotent replay.
- `npm.cmd run test:contract -- tests/contract/openapi.test.ts` — **7 tests**.
- `npm.cmd run typecheck`; touched-file `npm.cmd exec -- eslint ...`;
  `npm.cmd run api:generate` / `npm.cmd run api:check`;
  `npm.cmd run catalogue:generate` / `npm.cmd run catalogue:check`;
  `node scripts/audit-ui-theme.mjs --write` / `--check`; `git diff --check`.
- Production build: set `NEXT_DIST_DIR=tmp/purchase-totals-final-build`, then
  `npm.cmd run build:web`. Generated `next-env.d.ts` imports restored to canonical
  `.next` paths after the build. No application build warnings.
- Chromium: set `NEXORA_ASSETS_E2E=true`,
  `TEST_SOURCE_BOOTSTRAP_DATABASE_URL=postgresql://nexora@127.0.0.1:55433/nexora_source_test`,
  `PLAYWRIGHT_USE_EXISTING_WEB=true`, `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3213`,
  then `.\node_modules\.bin\playwright.cmd test tests/e2e/fixed-assets.spec.ts --workers=1`
  — **11 tests** on the final production preview. Real PostgreSQL repositories,
  real HTTP API and real search/save/reload; cookie identity is the existing
  isolated test seam. Purchase form Axe/overflow checks passed at three widths in
  both themes; screenshots are in ignored `tmp/purchase-totals/evidence/`.

Corrected issues found during verification included strict database-row projection,
unchanged ordinary draft quantity validation, exact optional-property compatibility,
accessible labels/effect state handling, and browser service-fixture/combobox role
setup. The final runs above passed; no full-repository test-suite claim is made.

## Local activation boundary

### Selector default correction (17 November follow-up)

The empty product value matched the custom-entry option, opening two metadata
inputs on every blank line. A distinct UI-only custom choice and per-line state
now keep new lines compact, while saved custom metadata remains editable. Applied
the focused correction to tracked source and the compatible localhost source,
preserving the directory adapter, API payloads, validation and financial logic.

Verification:

- Reproduced the old default with a failing focused test, then passed
  `npm.cmd run test:unit -- tests/unit/purchase-document-form.test.tsx tests/unit/searchable-select.test.tsx`
  — **37 tests**. Covers blank/new lines, explicit custom selection, saved custom
  metadata, switching custom/directory items and payload identity.
- `npm.cmd run typecheck`;
  `.\node_modules\.bin\eslint.cmd app/features/purchasing/components/purchase-document-form.tsx tests/unit/purchase-document-form.test.tsx tests/e2e/fixed-assets.spec.ts`;
  `.\node_modules\.bin\prettier.cmd --check app/features/purchasing/components/purchase-document-form.tsx tests/unit/purchase-document-form.test.tsx tests/e2e/fixed-assets.spec.ts`;
  `node scripts/audit-ui-theme.mjs --write` / `--check`; `git diff --check` — passed.
- `NEXT_DIST_DIR=tmp/product-selector-root-build` with `npm.cmd run build:web`
  — passed; restored canonical generated `next-env.d.ts` imports afterward.
  Compatible source also passed `npm.cmd run build:web` with its relative
  `NEXT_DIST_DIR=tmp/product-selector-build`. Eight compatible-copy CSS optimizer
  warnings were observed; no tracked application build warnings.
- With the isolated environment above and preview URL `http://127.0.0.1:3214`, ran
  `.\node_modules\.bin\playwright.cmd test tests/e2e/fixed-assets.spec.ts --workers=1 --grep 'searches products inside the selector'`
  — **1 passed**. Includes default/custom assertions, real search, persisted
  discounts/freight/totals and six theme/width combinations.
- `node tmp/product-selector/verify-live.mjs` with concealed credential input —
  unchanged-account sign-in, one default control, explicit custom entry,
  independent new line and real catalogue search/selection passed on localhost.
  Six responsive theme combinations had zero Axe violations, page errors, failed
  purchase requests or page overflow. No business document was saved. Reports,
  compatible-source patch and visually reviewed desktop/mobile evidence are in
  ignored `tmp/product-selector/`.
- Whole-file Prettier checks still warn on the historical migration checklist
  and startup runbook. `prettier.check` against their committed `HEAD` versions
  confirms both warnings predate this fix; unrelated document formatting was
  preserved. The changed TS/TSX files and Purchase spec/plan pass formatting.

Only the web process was replaced. The existing API process, business database,
credentials and protected rollout/migration helpers were not changed. Compatible
build: `tmp/asset-workpages-release/source/tmp/product-selector-build`. Latest
tracked build for the separately authorized full rollout:
`tmp/product-selector-root-build` (supersedes `tmp/purchase-totals-final-build`).

### Full database-backed feature rollout

The current recovered business database/API were not changed. Automatic approval
review rejected updating protected rollout/migration helpers because approval of
the feature design did not authorize deployment/migration side effects against
that database. A private local backup and temporary restore check also retain
their earlier explicit-authorization gate. After authorization, update the
existing private helpers for this release and additive procurement 0006 plus
fixed-assets 0003–0007, preserving credentials, permissions, historical purchases,
assets and journals. See `docs/runbooks/local-startup.md`.
