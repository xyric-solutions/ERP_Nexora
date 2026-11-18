# Fixed Assets workpage consolidation implementation

Approved design: `../specs/2026-11-16-fixed-assets-workpage-consolidation-design.md`.

1. Simplify the shell catalogue using hidden internal asset routes and explicit
   redirects for old vendor-return links. Keep Classes and Policies first,
   Asset Register second, and preserve record references and global search rules.
2. Give each asset workpage its specific primary action. Reuse existing category
   and registration forms. Make Transfer and Assignment a history workpage with
   an explicit create/cancel flow and current location/project context.
3. Host the existing return/refund workspace through a small Purchase-owned
   adapter. Add Purchase Bill entry, preserve source-bill context and validate
   selected asset provenance before submission. Keep existing server lifecycle,
   permissions, approvals and journals unchanged.
4. Add navigation and browser coverage for these behaviors. Run the existing
   lifecycle integration regressions, typecheck, lint, production build,
   catalogue generation/check, theme audit and responsive light/dark checks.
5. Apply only the compatible frontend changes to the current local release,
   verify real authentication/API loading, update evidence and handoff docs,
   commit and push to `shoaib_nexora`. Do not deploy the pending database extension.

Status: implemented and verified; compatible localhost release is running.
No schema, credential or financial-engine change was made. A general
stock/non-asset Purchase Return document is not introduced.

## Verification

- `npm.cmd run test:unit -- tests/unit/fixed-assets-navigation.test.ts tests/unit/prototype-shell-navigation.test.tsx tests/unit/purchase-document-form.test.tsx`: **38 passed**.
- `npm.cmd run test:integration -- tests/integration/fixed-assets.test.ts`:
  **25 passed**, including location/project transfers, invoice credits, bank
  refunds, independent approval and source/journal controls on disposable data.
- `npm.cmd run typecheck` passed. Current-source production build passed with
  `$env:NEXT_DIST_DIR='tmp/fixed-assets-workpages-ready-build'; npm.cmd run build:web`.
  The compatible baseline release also passed typecheck and production build.
- Touched-file ESLint, `npm.cmd run catalogue:generate`, `catalogue:check`,
  `node scripts/audit-ui-theme.mjs --write`, `--check` and `git diff --check` passed.
- Chromium: `NEXORA_ASSETS_E2E=true`,
  `TEST_SOURCE_BOOTSTRAP_DATABASE_URL=postgresql://nexora@127.0.0.1:55433/nexora_source_test`,
  `PLAYWRIGHT_USE_EXISTING_WEB=true`, `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3211`,
  then `.\node_modules\.bin\playwright.cmd test tests/e2e/fixed-assets.spec.ts --workers=1`: **10 passed**.
  New coverage includes create/edit/cancel entry, transfer history/form switching,
  wrong-bill rejection, and return draft preparation with unchanged journal count.
- Live read-only browser acceptance covered both existing companies and **18**
  class/register/transfer views at 1440/768/390px in light/dark themes. All passed
  one-primary-action, overflow and Axe checks. Also verified hidden menu order,
  category cancel, registration navigation, transfer cancel and legacy Purchase
  return/refund links. No business records were created by live verification.

## Compatible release and evidence

Only approved frontend changes and the existing opt-in table keyboard-access
support were ported to the currently deployed baseline. Live tablet acceptance
identified the missing keyboard support in that older build; including the
existing shared/asset table support resolved the failure. The API stayed running
throughout; the database extension was not deployed.

The compatible alternate-output build completed with eight generated CSS
optimizer warnings. Final live browser checks recorded no page errors, failed
asset requests, overflow or Axe violations. No feature stylesheet was introduced.

Private, Git-ignored release proof and browser evidence are in
`tmp/asset-workpages-release/`: `source-port-report.json`,
`release-source-verification.json`, `live-verification.json` and `evidence/`.
Disposable-database browser screenshots remain in `tmp/fixed-assets/evidence/`.
