# BOM save and dropdown stabilization — 21 November 2026

## Cause and correction

The live BOM POST returned HTTP 500 with an underlying
`COMPANY_CURRENCY_PROFILE_MISSING`. The configured company profile and its
active currencies were intact. Manufacturing set `nexora.tenant_id` but omitted
`nexora.user_id`; company-currency row security therefore concealed the profile
from the ordinary `nexora_app` runtime role.

- Set both authenticated identifiers transaction-locally before resolving company
  access or reading master data. No row-security policy or accounting rule changed.
- Translate `CompanyCurrencyAuthorityError` to the existing Manufacturing error
  format so actual configuration conflicts retain their actionable HTTP 409.
- Use accessible trash-icon actions for material and charge rows. Preserve the
  last-material safeguard and existing save permissions.
- Replace the inline Inventory product lookup panel with the shared portalled
  searchable dropdown. Preserve API search, pagination, retry, selected references,
  optional clearing and units. The shared control reports open changes so lookups
  load on opening and stop when closed.

## Verification

- A real PostgreSQL regression with a dedicated `NOSUPERUSER NOBYPASSRLS` role
  failed on the original code with the live currency error, then passed after the
  session-context repair. It covers default-currency BOM save, idempotent retry,
  proportional requirements, currency choices and unauthorized-user rejection.
- Invalid estimate currencies remain controlled conflicts and leave the existing
  BOM version unchanged. Early attempts to model missing configuration by
  deactivating a profile/base currency were rejected by existing database guards;
  the final regression uses invalid input without changing financial setup.
- Authenticated Chromium acceptance passed the category/BOM/planning/approved
  manufacturing/actual stock/GL journey. Category, product type and unit bounding
  rectangles remain identical when opening the menu at 1440, 800 and 390 pixels;
  the popup stays inside the viewport and closes with Escape. Trash actions have
  icons, delete the intended extra row and protect the final material.

No schema migration, live posting or configuration edit is part of this repair.
Existing approved Sales UI is preserved from the deployed release; unrelated
working-tree edits are excluded.

## Final checks and local activation

Implementation commit: `f2110a128428035e4053eeb8c99558f364d6f7c8`.

| Check                                                   | Result                                      |
| ------------------------------------------------------- | ------------------------------------------- |
| Focused unit tests                                      | 32 passed, 3 files                          |
| Real PostgreSQL integration regressions                 | 25 passed, 3 files                          |
| Authenticated Chromium manufacturing/stock acceptance   | 1 passed                                    |
| API/project TypeScript and web TypeScript               | Passed                                      |
| ESLint, Prettier, diff whitespace                       | Passed                                      |
| Theme audit write/check                                 | Passed, zero feature font/colour exceptions |
| Packaged production web build                           | Passed                                      |
| API readiness / login / unauthorized business endpoints | 200 / 200 / 401                             |
| Served login JavaScript assets                          | 14 matched the pinned build hashes          |
| Business-data fingerprints                              | 122 tables / 2,445 rows unchanged           |

Commands (from repository root, except the packaged build):

```powershell
npm.cmd run test:unit -- --maxWorkers=1 tests/unit/searchable-select.test.tsx tests/unit/inventory-products.test.ts tests/unit/manufacturing-contracts.test.ts
node --import tsx tmp/run-accounting-regressions.mjs tests/integration/manufacturing-template-readiness.test.ts tests/integration/manufacturing-workflow.test.ts tests/integration/inventory-products.test.ts --maxWorkers=1 --hookTimeout=120000 --testTimeout=120000
$env:NEXORA_STOCK_E2E='true'; npx.cmd tsx scripts/run-bank-reconciliation-e2e.ts
npx.cmd tsc -b --pretty false packages/contracts server/api
npx.cmd tsc --noEmit --pretty false
node scripts/audit-ui-theme.mjs --write
node scripts/audit-ui-theme.mjs --check
npx.cmd eslint app/features/inventory/components/product-lookup.tsx app/features/manufacturing/components/bom-template-sections.tsx app/shared/ui/searchable-select.tsx server/api/src/modules/manufacturing/source-repository.ts tests/integration/manufacturing-template-readiness.test.ts tests/e2e/posted-stock.spec.ts
npx.cmd prettier --check app/features/inventory/components/product-lookup.tsx app/features/manufacturing/components/bom-template-sections.tsx app/shared/ui/searchable-select.tsx server/api/src/modules/manufacturing/source-repository.ts tests/integration/manufacturing-template-readiness.test.ts tests/e2e/posted-stock.spec.ts
git diff --check
```

The candidate at `tmp/bom-repair/release/source` passed
`npx.cmd tsc -b --pretty false packages/contracts server/api`,
`npx.cmd tsc -b --pretty false packages/testing`, and `npm.cmd run build:web`.
The API and frontend were activated together at 18:05 UTC, using build
`xKCXrlBmyTyjxMTlo6pwf`. Runtime readiness, served hashes and read-only business
fingerprints passed after activation. `tmp/latest-local-runtime/start.ps1` now
points to this release. Evidence: `tmp/bom-repair/evidence/`,
`tmp/bom-repair/runtime-check.json`, and `tmp/bom-template-e2e/` screenshots.

This verifies the requested repair, not ERP-wide accounting acceptance. The
owner's unsaved Channa Pulao BOM was not submitted or posted on their behalf.
