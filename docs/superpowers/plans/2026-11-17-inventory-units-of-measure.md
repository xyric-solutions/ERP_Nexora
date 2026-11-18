# Unit of Measure implementation

Approved design: ../specs/2026-11-17-inventory-units-of-measure-design.md.

Status: Implemented, verified and activated on localhost on 17 November 2026
after explicit owner approval. The targeted release applied only Inventory 3;
Procurement 5 and Fixed Assets 2 remain. See `2026-11-17-inventory-units-release.md`.

1. Add exact rational conversion contracts/helpers and regression tests.
2. Add additive Inventory migration, protected catalogue persistence, audited
   company-scoped API and generated client/OpenAPI contracts.
3. Integrate managed product units, packaging, Purchase request snapshots and
   draft transfer entered/base quantities without changing financial calculations.
4. Add the Inventory submenu and compact directory/form/live converter using
   incumbent controls; preserve global company and unsaved-change behavior.
5. Verify unit/integration/contract/browser behavior, type/lint/build/theme checks.
   Document actual evidence and prepare a targeted compatible local release.
6. Commit and push to shoaib_nexora. Report any remaining deployment gate honestly.

The referenced writing-plans skill is unavailable in the installed skill roots;
this plan follows repository conventions and the approved written specification.

## Completed changes

- Persisted standard/company units, immutable audited definitions, stable UOM codes,
  scoped CRUD/conversion/eligible-product APIs, OpenAPI and generated client.
- Exact integer/rational conversions, bounded factors/quantities, precision loss
  rejection, inactive/legacy references and explicit product packaging mappings.
- Existing Product/Purchase/Transfer forms now use managed units. New requests and
  draft transfers retain server-derived entered/base snapshots. Approved Purchase
  commercial units, tax/discount/charge calculations and stock posting boundaries
  remain; individual asset registration still requires the product base unit.
- Added the one Inventory submenu, directory/form, live converter, unsaved guards,
  global-company scope and active navigation. Shared themed row buttons avoid native
  dark-mode defaults. The labelled scroll region is keyboard focusable; the narrowly
  documented lint exception follows the existing Purchase scroll-region pattern.
- Refreshed stale migration-test version/catalogue expectations for current committed
  modules and limited the Finance 27-to-28 upgrade test explicitly to version 28.
  No permission definitions or role grants were added by this feature.

## Exact verification

Passed:

- `npm.cmd run test:unit -- tests/unit/inventory-units.test.ts tests/unit/inventory-products.test.ts tests/unit/products-workspace.test.tsx tests/unit/purchase-document-form.test.tsx` — 57 tests.
- `npm.cmd run test:integration -- tests/integration/inventory-products.test.ts tests/integration/procurement-workflow.test.ts` — 46 tests.
- `npm.cmd run test:integration -- tests/integration/postgres-migrations.test.ts` — 15 tests.
- `npm.cmd run test:contract -- tests/contract/openapi.test.ts` — 7 tests.
- `NEXORA_INVENTORY_E2E=true`, local bootstrap test URL, `PLAYWRIGHT_USE_EXISTING_WEB=true`, `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3219`, then `playwright.cmd test tests/e2e/inventory-products.spec.ts --workers=1` — 13 tests on the final compatible production build. Verified unit create/reload/deactivate, kg/gram/tonne, product packaging and transfer reload, active submenu, themed row backgrounds, unchanged existing flows and six light/dark width combinations (1440/768/390px) with no Axe violations or document overflow.
- `npm.cmd run typecheck`, touched-file `npx.cmd eslint`, targeted new-file
  `prettier --check`, `npm.cmd run api:check`, `npm.cmd run catalogue:check`,
  `git diff --check`, theme audit `--write` / `--check`, and one Impeccable detector
  pass. Theme audit: zero direct feature font/colour exceptions across 130 views.
- `npm.cmd run build --workspace @nexora/api` in tracked and compatible source.
- `NEXT_DIST_DIR=tmp/uom-complete-root-build npm.cmd run build:web` in tracked
  source, and `NEXT_DIST_DIR=tmp/uom-complete-build npm.cmd run build:web` in the
  compatible source. Root build has no CSS optimizer warnings; the repeated
  compatible build retains 11 generated-cache scan warnings from its existing
  build context. All route builds complete. This is not a zero-warning claim.
- Private `verify-compatible.ts`: disposable schema at Procurement 5 / Assets 2;
  create a legacy product/transfer at Inventory 2, migrate only Inventory to 3,
  preserve historical evidence/quantity and verify new units, products, transfers
  and Purchase totals. Final provenance checks match 12 feature-owned files and
  confirm the compatible monetary helper is byte-identical to the prior release.
- Visually reviewed desktop/light and mobile/dark evidence under
  `tmp/inventory-operations-evidence/`; fixed the detected native-button theme and
  navigation integration defects, then confirmed the final output.

Canonical `next-env.d.ts` paths were restored after isolated builds. Protected
configuration and login credentials are unchanged. Approved activation verified
a full backup restore and preservation of 321 existing table fingerprints, then
applied only Inventory 3 and started the tested compatible build. Live acceptance
verified both companies, unchanged sign-in, standard conversions, Product/Purchase/
Transfer forms, wrong-company denial and six responsive light/dark cases with zero
Axe violations. No synthetic business documents were saved. Startup helpers now
retain this release. Private evidence: `tmp/units-of-measure/`.
