# Central Chart template delivery checklist

Written specification approved by the user on 2026-10-20.

Latest status (2026-10-20): CT-03 company adoption is implemented and applied to
the existing R06 UAT company. All 14/78/234 source definitions have company
mappings: 227 ordinary nominal drafts are persisted; seven Bank definitions
remain explicit references, not guessed Bank facilities. Posting-review UI/API
and ordinary Finance approval/Bank selector integration are implemented and
tested. Business classification/approval of the actual 227 drafts remains an
operator action; no automatic activation or financial posting was authorized.
See the final CT-03/04 checkpoint below; earlier checkpoints are historical.

## CT-01 — central persistence and API

- [x] Add Finance 13: tenant-owned immutable revision content, guarded publication,
  import evidence, tenant RLS and explicit template permission definitions.
- [x] Add bounded request/response contracts and generated read/import/publish API.
- [x] Add repository/service/router with live tenant-scoped authorization,
  cookie/CSRF/origin guards, idempotency, optimistic publication and audit evidence.
- [x] Normalize the approved XLSX to a source-hashed manifest; validate all
  14 categories, 78 sections, 234 codes and 237 source occurrences.
- [x] Test validation, import/replay/conflicts, publication, persistence, no
  company/account writes and cross-tenant/permission/database isolation.
- [x] Run focused tests, API consistency, typecheck, lint, build and diff checks.
- [x] Back up local development DB, migrate, import using authenticated API,
  verify 14/78/234, replay and persisted reads. Record exact observed results.

## Subsequent approved boundaries — not CT-01 completion claims

CT-02: central Master Data navigation and API-backed template browsing — completed;
see the CT-02 checkpoint below.
CT-03: explicit company adoption preview/mapping and governed nominal drafts.
CT-04: classifications, company-specific Bank setup and end-to-end acceptance.

No CT-01 operation creates a company, company account, Bank capability, journal,
approval, financial period or currency. No automatic company adoption.

## Observed CT-01 handoff — 2026-10-20

- Finance migration 13 was applied first to a new isolated database,
  `nexora_chart_template_ct01_20261020`, then to the known local development
  `nexora_source_test` database. Historical migrations were not edited.
- Backup: ignored `tmp/bank-readiness-20261020/central-chart-before-13-20261020.dump`
  (1,990,433 bytes). Source readiness is healthy with Finance 13.
- Canonical validated input: `packages/db/catalogs/approved-chart-20261020.json`.
  It came from the actual XLSX, not a silently substituted CSV. Workbook SHA-256:
  `f9d5a2a7772575e1e5fe98927d4da0939f949611f8596107a1206eea381ac85a`.
  Rechecked with shared read access while Excel held the workbook open: matched.
- Existing controlled UAT super-admin policies received the two explicit tenant
  template permissions via the guarded UAT provisioner with
  `NEXORA_CENTRAL_TEMPLATE_UAT_SETUP=true`. No grants to ordinary nominal users,
  unrelated roles or other tenants were added by this slice. Production grant
  assignment must use the existing governed authorization process, not that UAT
  helper. No environment files or credentials were added to source code.
- Imported and published through authenticated `/api/v1/finance/chart_templates`
  APIs in tenant `nexora-r06-uat`, without selecting/adopting a company.
  Revision ID: `chart-38a96c33-10ad-4a8b-ac88-bfb167f87a76`.
  Fresh-session replay returned both replay flags true; exactly one immutable
  import and one publication event remain. Fresh authenticated node pagination
  and direct PostgreSQL reads both returned 14 categories / 78 sections / 234
  nominals, retaining 237 source occurrences.
- Before/after counts unchanged: account 36; bank_account 17; bank_payment 3;
  bank_receipt 0; journal_entry 0; companies 9. No company identity, banking
  history, payroll record, currency or financial period was changed by import.
- Passed: 44 integration tests across template/migration/general nominal/Bank
  nominal/Payment/Receipt suites; 13 focused contract/API unit tests; 19 existing
  Finance/Bank database-security tests. Template integration coverage includes
  non-owner RLS reads/writes, replay conflicts, immutable history, no partial
  writes and persistence through a new database pool/connection.
- Passed `npm.cmd run api:check`, `npm.cmd run typecheck`, focused ESLint,
  `npm.cmd run build:web`, and `git diff --check`. The initial test run exposed
  an outdated permission count and immutable-guard SQLSTATE assertion; corrected
  these expectations and reran successfully. No tests were deleted/suppressed.
- No service/database reboot or new frontend workflow was exercised in CT-01.
  The observed persistence checks used new connections and authenticated
  sessions. CT-02 owns the new Master Data UI acceptance; existing company
  Chart of Accounts screens are intentionally not populated from template rows.

### Reproducible local checks

Set both `TEST_SOURCE_DATABASE_URL` and `TEST_SOURCE_BOOTSTRAP_DATABASE_URL` to
the explicit isolated CT-01 database, not the running application's database:

```powershell
$env:TEST_SOURCE_DATABASE_URL='postgresql://nexora@127.0.0.1:55433/nexora_chart_template_ct01_20261020'
$env:TEST_SOURCE_BOOTSTRAP_DATABASE_URL=$env:TEST_SOURCE_DATABASE_URL
npx.cmd vitest run --config vitest.integration.config.ts tests/integration/finance-chart-templates.test.ts tests/integration/postgres-migrations.test.ts tests/integration/finance-general-nominals.test.ts tests/integration/finance-nominals.test.ts tests/integration/banking-payments.test.ts tests/integration/banking-receipts.test.ts
npx.cmd vitest run --config vitest.unit.config.ts tests/unit/finance-chart-template-contracts.test.ts tests/unit/finance-chart-template-api.test.ts tests/unit/finance-nominal-api.test.ts
npx.cmd vitest run --config vitest.security.config.ts tests/security/finance-general-nominal-database-security.test.ts tests/security/finance-nominal-database-security.test.ts
npm.cmd run api:check
npm.cmd run typecheck
npm.cmd run build:web
git diff --check
```

Do not use `npm.cmd run test:integration` here: its existing script hardcodes
the running source database. Use the explicit isolated invocation above.

Operational API client: set `NEXORA_API_BASE_URL`, `NEXORA_IMPORT_IDENTIFIER`
and `NEXORA_IMPORT_PASSWORD` in the process environment; never source-code a
password. `NEXORA_PUBLISH_CHART_TEMPLATE=true` explicitly enables reference
publication. Then run:

```powershell
npm.cmd run finance:import-chart-template -- packages/db/catalogs/approved-chart-20261020.json
```

The script uses normal login/CSRF/idempotency/versioned APIs, not database
credentials. Imported revision content and its source hash are immutable;
changed workbook content requires a new reviewed manifest/revision.

## CT-02 — completed central Master Data browser

- Finance -> Chart of Accounts -> Central Master Data is a real API-backed
  route, also linked from company accounts. Section Management opens the same
  browser with Sections selected, not mock rows.
- Revision selection, Categories/Sections/Nominals tabs with real counts,
  server search/category/section filters, bounded header retrieval, cursor
  pagination, previous/next, details and Category -> Section -> Nominal drill-down.
- Source filename/hashes/publication and nominal row provenance are visible.
  Definitions are labelled central references, not approved company accounts.
- Permission/loading/empty/error/retry states; late responses ignored, metadata
  bound to its revision and browser state reset when the tenant changes.
- Reused existing ERP styling and shared primitives. No stylesheet, dependency
  or HR change. Central shell labels are truthful and prototype state simulation
  is disabled only for these live routes. No mock company becomes API authority.
- Added backward-compatible category_key filtering in contracts/OpenAPI and
  repository together. The parent join stays tenant/template-scoped. No CT-02
  migration or account/transaction mutation was needed.

### Observed verification

- 21 unit/API/component tests passed across the central browser, template
  contracts/API and existing Finance nominal form. Includes denial, error/empty
  recovery, filters, pagination, stale responses, metadata failure and tenant reset.
- Eight isolated PostgreSQL template tests passed with category-filter assertions.
- One read-only Chromium workflow passed on local web/API: normal login,
  navigation from company accounts, 14/78/234 counts, Current Assets -> Cash and
  Bank -> seven reference nominals, pagination, Income Tax search/provenance,
  reload, Section Management and mobile layout. Finance/Bank mutations were
  blocked throughout the workflow.
- Visual review caught vertically stretched tabs/mobile filter overflow despite
  the first functional browser pass. Fixed feature layout, reran Chromium with
  390px input-width/tab-height assertions, and inspected final desktop/mobile
  screenshots in ignored tmp/bank-readiness-20261020.
- API consistency, typecheck, owned ESLint, whitespace and production build
  passed. Loading-state lint findings were corrected without suppressions;
  informational alerts use note semantics. No failed tests were removed.
- Pre-existing blocker: catalogue:generate and catalogue:check fail because the
  legacy generator imports absent app/hr-core-data.ts and old root paths. No
  unrelated HR rewrite or fake parity output was made. Actual navigation was
  verified through Chromium; legacy generator repair remains a tooling follow-up.

### Working authenticated pages

- http://127.0.0.1:3000/#/finance/central-chart-template
- http://127.0.0.1:3000/#/finance/section-management
- http://127.0.0.1:3000/#/finance/chart-of-accounts (separate company accounts)

Focused commands:

```powershell
npx.cmd vitest run --config vitest.unit.config.ts tests/unit/finance-chart-templates-view.test.tsx tests/unit/finance-chart-template-api.test.ts tests/unit/finance-chart-template-contracts.test.ts tests/unit/finance-nominal-form.test.tsx
npx.cmd vitest run --config vitest.integration.config.ts tests/integration/finance-chart-templates.test.ts
npx.cmd playwright test tests/e2e/finance-chart-templates.spec.ts --project=chromium --workers=1
```

Use BOTH isolated database variables documented above for integration tests.
Chromium requires PLAYWRIGHT_BASE_URL=http://127.0.0.1:3000,
PLAYWRIGHT_USE_EXISTING_WEB=true and controlled process credential variables
NEXORA_BANKING_SUPER_ADMIN_USERNAME / NEXORA_SHOAIB_PASSWORD. No password in source.

### Next safe resume — CT-03

Central persistence and browsing are complete, not company adoption. The user
confirmed existing Nexora R06 UAT Company for testing and NO new business company.
The read-only preview uses explicit company selection and Currency Master (USD
is currently the only active currency); it does not assign company currencies.
Existing UAT Cash & Bank policy cannot be replaced/reparented silently. Next
resolve the explicit mapping decision below, then implement atomic mapping and
governed drafts; CT-04 handles Bank setup, classification,
activation and accounting acceptance. Earlier Payment layout and persisted
approver/project/location requests remain separate unfinished work.

## CT-03a — read-only adoption preview (2026-10-20)

- Added versioned GET `chart_templates/:id/company_preview` with generated
  contract/client and a Central Master Data preview dialog. Requires live central
  read and company Finance read authority, active company access and active
  currency; tenant/company checks are server-side. No write/apply endpoint added.
- Repeatable-read snapshot checks all definitions and existing account identities,
  hierarchy, currency and Bank policy. Stable preview hash is independent of page;
  bounded pages and conflict summary remain available even off the first page.
- Observed existing R06 UAT preview: 14 categories, 77 sections and 227 ordinary
  nominal drafts proposed; seven Bank references require explicit Bank setup;
  one blocking section conflict. These are proposals, NOT newly created accounts.
- Existing protected Bank section is UAT-BN-CB, under UAT-BN-CA, with prefix
  UAT-BN- and seven linked Bank accounts. Template section 2309 must not replace
  it or reparent historical Bank records. Asked user whether to preserve existing
  policy/code series and explicitly map template 2309 to that identity. Awaiting
  answer; do not apply mapping, import company drafts, approve or post meanwhile.
- Nine isolated PostgreSQL template integration tests passed, including unchanged
  financial counts, stable pagination hash, conflict detection, company denial,
  revoked/missing permissions and currency/page validation. Isolated test fixtures
  are not new companies in the running/manual-testing database.
- Chromium passed normal login, live company preview with the exact conflict,
  central browse/drill-down/pagination/reload/mobile checks. All Finance/Bank
  non-GET requests were blocked in this browser test. No new migration needed.
- Nineteen focused unit/API/component tests passed; typecheck, generated API
  consistency, owned ESLint, production web build and whitespace checks passed.
- Visual review found the legacy sidebar above the default dialog layer. Added
  an optional overlay class to the shared Dialog primitive (unchanged default),
  scoped higher layers only to the two central-chart dialogs, and added a browser
  stacking assertion. No global sidebar or other module behavior was changed.

Completion remains CT-01 + CT-02 + CT-03 preview only. CT-03 write adoption and
CT-04 classification/activation/Bank accounting acceptance are NOT complete.

### Excel-alignment decision update

The user rejected retaining the old business section code and approved preparing
a controlled migration matching Excel while preserving IDs and histories.
Written migration design:
docs/superpowers/specs/2026-10-20-excel-bank-hierarchy-migration-design.md.
This supersedes the earlier pending alias decision; no database migration or
company account change has been made by the design-preparation step. Read-only
SQL confirmed seven existing managed Bank leaves and no journal lines for those
leaves. Do not equate these test accounts to the seven workbook Bank identities.
Written scope review precedes implementation of the privileged maintenance path.

## CT-03b — Excel Bank hierarchy correction completed (2026-10-20)

The user approved implementation after reviewing the written migration design.

- Added Finance 0014 (chart_hierarchy_maintenance_evidence), immutable evidence
  with tenant RLS and company/template/account/actor foreign keys. Schema install
  does not migrate a company automatically; prior migration files are unchanged.
- Implemented privileged offline maintenance in
  packages/db/src/maintenance/excel-bank-hierarchy.ts. Exact before/after guard
  exceptions exist only in the maintenance transaction; both original function
  definitions are restored before commit. No triggers disabled, runtime bypass
  endpoint, session-variable override, or committed relaxed identity protection.
- Authenticated, loopback-only CLI: scripts/migrate-excel-bank-hierarchy.ts;
  npm run finance:migrate-bank-hierarchy. Requires reviewed request, normal API
  login/company access, separate database administrator, source hash, expected
  policy version, explicit --apply and verified custom-format backup. No secrets
  in source; --help and preflight do not mutate business data.
- Approved request: packages/db/catalogs/local-r06-uat-bank-hierarchy-20261020.json.
  Local-only request captures expected old section UAT-BN-CB and policy version 8.
  It is not a universal company provisioning fixture.
- Backup before Finance 14: ignored
  tmp/bank-readiness-20261020/chart-before-finance14-20261020.dump,
  2,022,346 bytes; pg_restore --list succeeded (2,232 lines). No backup removed.
- Finance 14 applied first to isolated chart-template DB, then local source DB.
  CLI preflight passed; apply returned
  chart-maintenance-4820a5e5-88d2-443d-835c-4492f4ba08d8. A second apply returned
  that same ID with replayed=true. Exactly one source maintenance event exists.
- Existing section ID r06-uat-bn-section now has code 2309 and name Cash and Bank;
  category ID and all seven Bank nominal IDs, codes, parents, lifecycle states and
  histories preserved. Allocator prefix 2309, suffix width 2, next value 8, policy
  version 9. Workbook codes 230901–230907 reserved, not assigned to test accounts.
- Company preview reuses the established governed Bank policy's exact section
  identity and matching active root category. It does not infer Bank leaf matches
  by display name or silently reparent anything. Fresh authenticated source API:
  blocked=false, two matches, zero conflicts, 13 proposed new categories,
  77 sections, 227 nominal drafts and seven Bank references still requiring setup.
- Source counts unchanged: 36 accounts, 17 Bank accounts, three payments,
  zero receipts/journals, nine companies. Dependency fingerprints equal before/
  after inside the operation. Source guard hashes equal the isolated original
  guard hashes. Fresh readiness reports HR, Bank, database, Redis and storage OK.

### Observed verification

- 51 integration tests passed across maintenance, chart templates, migration
  integrity, ordinary/Bank nominals, payments and receipts (seven files).
- 19 database-security regression tests passed (two files).
- New maintenance tests cover stable IDs/history, numbering/reservations, replay,
  concurrent requests, stale versions, denied company/actor, source mismatch,
  occupied codes/exhaustion, immutable evidence, exact guard restoration, injected
  post-update evidence failure with complete rollback, and non-admin DB denial.
- Initial combined regression found new fixture tenant-wide grants invalidated
  an existing missing-company-scope test. Restricted fixture grants to its isolated
  synthetic companies, removed only the four test-added tenant scopes in the
  isolated DB, then reran all 51 successfully. No running-app grants were changed.
- 19 focused unit/API/component tests, generated API consistency, typecheck,
  owned ESLint, production web build and git diff --check passed.
- One Chromium workflow passed after local apply: zero-conflict company preview,
  central browse/drill-down/pagination/reload, mobile layout, and the existing Bank
  creation form selects Current Assets / Cash and Bank using the unchanged section
  ID. Finance/Bank mutations were blocked throughout this read-only browser test.

### Reproduce and resume

Use the existing isolated database variables documented above, never the source
database for mutating tests. Add tests/integration/finance-chart-hierarchy-maintenance.test.ts
to the documented integration command. CLI request/credential/backup variables
are documented by npm run finance:migrate-bank-hierarchy -- --help.

For source execution use DATABASE_URL explicitly set to the known local source
database, NEXORA_API_BASE_URL=http://127.0.0.1:4000, operator credentials in
process-only NEXORA_IMPORT_IDENTIFIER/NEXORA_IMPORT_PASSWORD and
NEXORA_MAINTENANCE_BACKUP pointing to the verified backup. First omit --apply;
then add it only for the reviewed request. Repeat of the recorded request is
idempotent; do not alter expected versions just to force a new operation.

Remaining: CT-03 atomic company mappings/governed draft adoption of the 227
ordinary nominals, plus CT-04 posting ownership/classification, explicit Bank
definition setup, activation and end-to-end accounting acceptance. Central catalog
persistence and this hierarchy correction do NOT mean all company accounts are
created or usable. No further approval, journal, period or currency was invented.

## CT-03 complete / CT-04 review workflow delivered — 2026-10-20

### Implementation

- Finance 15 adds immutable company adoption and source-node mappings, posting
  classification/version evidence, tenant RLS, company/account/source foreign
  keys and explicit company-scoped adopt/classify permissions. Importing a
  central revision still does not automatically adopt it into another company.
- Finance 16 bounds deferred validation to a single complete-adoption check and
  per-node hierarchy/review checks, with targeted lookup indexes. Finance 17
  resolves a PL/pgSQL record/SQL-alias ambiguity found by isolated tests. Already
  applied migrations were not edited, including intermediate local migrations.
- New documented/generated APIs:
  POST /api/v1/finance/chart_templates/:templateId/company_adoption;
  POST /api/v1/finance/chart_templates/company_nominals/:nominalId/classification.
  Cookie session, CSRF, origin checks, expected versions/If-Match, reviewed preview
  hash, idempotency, live role/company access, impersonation denial and audit
  hash-chain writes are enforced on the server. Adoption has a 1,000-definition
  atomic limit; larger catalogs require a separately reviewed staged workflow.
- Preview is reused inside the same transaction; account/policy locks and company
  advisory locks prevent concurrent allocation/adoption races. All hierarchy,
  ordinary profiles, source mappings, lifecycle events and adoption audit evidence
  commit together or roll back together. Bank references do not create capabilities.
- Ordinary nominal numbering keeps Excel section prefixes/codes and reserves
  source suffixes. Company accounts never share posting identity across companies.
- Every imported ordinary draft starts review_required/inactive. Explicit review
  can mark it ordinary or module_controlled. Both review choices are audited,
  versioned and idempotent, and are not approval. Module-controlled/unreviewed
  records cannot enter ordinary submission/activation through API or direct SQL.
  No alternative accounting engine or speculative control-account posting owner.
- Existing company setup dialog now provides explicit draft-adoption confirmation,
  truthful saved/existing-adoption states, retry-safe keys and refreshed counts.
  Nominal detail exposes permission-gated posting review and normal Finance
  submit/approval afterward. Success notifications follow confirmed API outcomes.
- Finance-only shell labels now say Live Finance API/real company scope, not
  Mock-only review or a prototype Services company. Prototype company/role/state
  simulation controls do not masquerade as Finance data authority. Other modules'
  navigation/state behavior remains unchanged. Existing shared primitives and
  styling retained; no dependency/new stylesheet added.

### Local execution and observed persistence

- Backup before schema/adoption: ignored
  tmp/bank-readiness-20261020/chart-before-company-adoption-20261020.dump,
  2,029,653 bytes, pg_restore --list verified (2,242 lines).
- Finance migrations 15–17 applied to the isolated DB first, then known local
  nexora_source_test. Existing controlled super-admin policies received only the
  new company-scoped adopt/classify grants for R06 UAT via the existing guarded
  UAT provisioner. No new business company or ordinary-user privilege escalation.
- Explicitly opted-in Chromium used normal login and the real setup dialog to
  select Nexora R06 UAT, USD from Currency Master, inspect the preview, confirm
  draft-only adoption and submit. Response: 13 new categories, 77 new sections,
  227 new ordinary drafts, two reused headers and seven Bank references.
- Adoption ID chart-adoption-7671fb67-c557-425a-8448-d81a39f65396;
  audit ID audit-d7152ab9-0450-419a-a746-7d9cb625c868.
  PostgreSQL: 326 mappings = 14 categories + 78 sections + 234 nominal definitions;
  all category/section mappings have account IDs; 227 ordinary nominal mappings
  have account IDs, seven Bank references deliberately do not. All 227 source
  ordinary records remain review_required, draft and inactive.
- Global source account count rose exactly 36 -> 353 (317 new identities).
  Bank accounts 17, payments 3, receipts 0, journals 0 and companies 9 unchanged.
  Source HR/Bank/database/Redis/storage readiness remains healthy. No journal,
  opening balance, financial period, currency or transaction approval was added.
- Browser reload verified Income Tax 740101, its persisted Taxation hierarchy,
  draft state and required posting review. Repeated browser run found the existing
  adoption and offered no duplicate-create action. It did not classify or approve
  actual business records. Mobile screenshot inspected in the ignored tmp folder.

### Verification and failures resolved

- Focused unit/API/component tests cover strict adoption/classification contracts,
  session/CSRF/origin/If-Match, explicit review confirmation, failed-save feedback,
  retry idempotency and permission/state controls, plus existing browser/form tests.
- Isolated adoption tests cover all 326 definitions and 227 inactive drafts,
  same source codes/different company account IDs, concurrent replay, stale
  preview, denied persisted scope, impersonation, late audit failure with full
  rollback, immutable history, RLS, and rejected direct-SQL classification without
  matching evidence. Independent approval of a reviewed ordinary test nominal
  makes it available to both Bank selectors; draft/module-controlled controls
  stay excluded. No shared/source DB was used for these mutating regressions.
- Early tests exposed stale compiled contracts, an exhaustive permission-count
  expectation after adding two permissions, the repeated whole-chart validation
  timeout, and SQL alias ambiguity. Rebuilt contracts, updated the exact permission
  expectation to 270, added additive fixes 16/17 and reran. UI tests needed the
  repository's existing jsdom PointerEvent polyfill for real Base UI checkboxes.
  No tests deleted, security checks suppressed or historical migration rewritten.
- Shell lint caught existing implicit labels around shared Input components;
  added explicit label/control IDs, preserving their behavior and accessible names.

### Reproducible checks / operator acceptance

Use BOTH explicit isolated DB variables from the earlier command block. Run:

```powershell
npx.cmd vitest run --config vitest.integration.config.ts tests/integration/finance-chart-company-adoption.test.ts tests/integration/finance-chart-hierarchy-maintenance.test.ts tests/integration/finance-chart-templates.test.ts tests/integration/postgres-migrations.test.ts tests/integration/finance-general-nominals.test.ts tests/integration/finance-nominals.test.ts tests/integration/banking-payments.test.ts tests/integration/banking-receipts.test.ts
npx.cmd vitest run --config vitest.security.config.ts tests/security/finance-general-nominal-database-security.test.ts tests/security/finance-nominal-database-security.test.ts
npx.cmd vitest run --config vitest.unit.config.ts tests/unit/finance-posting-review.test.tsx tests/unit/finance-chart-template-api.test.ts tests/unit/finance-chart-template-contracts.test.ts tests/unit/finance-chart-templates-view.test.tsx tests/unit/finance-nominal-form.test.tsx
npm.cmd run typecheck
npm.cmd run api:check
npm.cmd run build:web
git diff --check
```

Chromium: same local base/credential environment documented for CT-02. The
company-adoption spec additionally requires NEXORA_CHART_APPLY_UAT=true and
permits only the reviewed company draft-adoption POST; all other Finance/Bank
mutations are blocked. Do not run unrelated mutating Bank E2E specs as a smoke test.

```powershell
npx.cmd playwright test tests/e2e/finance-chart-company-adoption.spec.ts tests/e2e/finance-chart-templates.spec.ts --project=chromium --workers=1
```

Operator path: Finance -> Chart of Accounts -> select R06 UAT -> open nominal ->
review actual posting ownership -> save posting review -> submit -> authorized
approval. Ordinary approval still requires no free-text approval reason; rejection
does. Controlled records deliberately remain out of ordinary manual workflows.
No bulk ordinary classification/approval was guessed from names/categories.

### Remaining acceptance boundaries

Company metadata persistence/adoption and the review software are delivered.
Actual per-account classification/approval is still required before using imported
nominals in transactions. Excel provides no control ownership or Bank currency
instruction: seven Bank references need explicit Bank setup and valid currencies,
not conversion of unrelated test facilities. Integration of module-controlled
accounts must use the owning production module's verified posting configuration.
No whole Bank/ERP production-readiness claim, fiscal-period opening or automatic
posting. Earlier Payment layout/approver/project/location requests and the known
legacy catalogue-generator missing HR import remain separate unfinished scope.

## CT-04 Bank definition setup — delivered (Finance 18)

- Added the approved Excel Bank definition selector to the existing Bank/Finance
  Bank-nominal creation form, not a new disconnected page. It reads adopted
  definitions through company-authorized options. Selecting one preserves its
  source name/reserved code and clears currency, requiring an explicit Currency
  Master choice. Configured definitions are disabled; custom Bank creation still
  uses the next generated code. No branch/account-number requirements reintroduced.
- Extended the existing compatible create contract with paired optional
  chart_template_id/chart_node_key fields, Bank-only. No free-form source-code
  parameter, browser-to-DB path or duplicate Banking API. Existing clients can
  omit both fields. OpenAPI/client were regenerated together.
- Server validates the adopted company definition, exact name/section, active
  currency, Bank policy and permissions; locks the definition, creates its normal
  Bank draft/events/audit and binds once in the same transaction. Existing
  idempotency returns the original identity on retry. Unrelated definitions,
  duplicate/occupied codes, ordinary nodes and mismatched names are rejected.
- Finance 18 adds immutable Bank binding evidence with tenant/company/source/
  nominal/audit foreign keys and deferred validation of the exact created Bank
  draft, source code/name, creation actor/event and normal create audit. The
  existing mapping identity guard has a narrow one-time reference-to-new-draft
  transition; existing configured mappings still cannot be rebound or deleted.
- Setup preview recognizes explicitly configured Bank definitions without
  assuming ordinary-company currency or matching unrelated legacy facilities.
- Tested isolated binding of reserved code 230901 with an explicit USD choice,
  replay, wrong definition/name, duplicate prevention, immutable binding, persisted
  currency, and normal custom allocation still producing 230908. Existing Bank
  maker/checker and state-synchronization regressions remain unchanged.
- Source backup before Finance 18:
  tmp/bank-readiness-20261020/chart-before-bank-binding-20261020.dump,
  2,104,431 bytes, pg_restore --list verified (2,284 lines). Source schema is now
  Finance 18. No actual source Bank reference was configured; all seven await the
  operator's real currency choice and ordinary Bank approval. Existing 17 Bank
  accounts and financial histories remain untouched.
- Unit/form test verifies source name/code preservation and no save before
  currency selection. Read-only Chromium selects definition 230901 in the real
  Bank form, verifies reserved code/read-only name/blank currency, and does NOT
  save or approve it. Mobile screenshots are in ignored tmp/bank-readiness-20261020.
- Scoped the same truthful live-account shell labels/disabled prototype context
  controls to the four existing Bank master-data routes as well. HR and unrelated
  module shells are unchanged. The actual company/currency selectors remain in
  the API-backed form, not in prototype navigation presets.

This closes the missing software path for reserved Bank codes. The remaining
actions are business setup/acceptance: classify/approve the 227 imported drafts,
choose actual currencies for needed Bank definitions and approve those Bank
drafts. Module-controlled posting must use its owning module's verified setup;
never mark everything ordinary or open periods merely to make a selector populate.

Final observed verification totals: 58 selected integration tests (eight files),
27 unit/API/component tests (five files), 19 database-security regressions (two
files), and two Chromium workflows, plus typecheck, owned ESLint, API consistency,
production web build and git diff --check. See the exact commands above.

## 2026-10-21 continuation — CoA verification and Bank entry refinements

User priority: finish Chart of Accounts before the remaining Payment/Receipt work.
The source API readiness endpoint returned healthy database, Redis, object storage,
HR and Banking checks. The read-only Chromium central-chart workflow passed:
14 categories, 78 sections, 234 definitions, existing company adoption with zero
new drafts/conflicts, persistence after reload, and the reserved-code Bank setup
selector. All Finance/Bank mutation requests were blocked in this browser run.

Found and reproduced a company-directory response race in FinanceNominals:
late responses could replace current-company rows, and clearing/changing company
could leave previous rows/cursors visible. Added request invalidation, immediate
filter reset and tenant/user/permission-keyed directory isolation. The new tests
cover delayed company responses, cleared company, debounce, stale pagination,
tenant change and permission revocation. Existing API authorization is unchanged;
this fixes presentation isolation, not a server-side access-control bypass.

Bank Payment/Receipt refinements: value date is now visible beside the existing
posting controls; Details remains a free-text textarea, and optional document
reference uses a plain labelled input rather than an expandable row control.
Payloads, lifecycle actions, receipt payer requirements, company authorization,
required dimensions, approval audit and explicit posting behavior are preserved.
No migration, currency/account activation or financial record write was performed.

Observed so far this continuation: 41 integration tests across six selected
CoA/Bank files, 33 CoA unit/component/API/contract tests across six files,
28 Bank entry component tests, 19 database-security tests, one read-only CoA
Chromium workflow and two read-only Bank entry Chromium workflows passed.
See the verification completion note below for final lint/type/build results.

Remaining boundaries: 227 business drafts still need explicit posting-ownership
review and approval; seven Bank definitions need actual currency choices and
normal approval. Never bulk-classify controlled accounts or infer currencies.
Approver assignment/delegated self-approval and persisted Project/City selectors
remain unfinished and require a server-side design beyond the old presentation
spec, which explicitly deferred them. Existing Bank dimensions are bounded JSON
and check required keys, not a verified project/location master directory.
The inspected shared organization types do not include project/city; HR work
locations have HR/statutory ownership and must not silently become general Bank
city masters. Verify/reuse a real shared master or approve that dependency first.
Company input cannot safely disappear until an authenticated active-company
context replaces it; prototype shell company presets are not that authority.

Verification completion: repository typecheck, scoped Finance/Bank ESLint,
api:check, production build:web and git diff --check passed. The first new CoA
lint run caught a synchronous effect-state update; corrected it by resetting
loading in the selection event instead. The three focused CoA component files
were rerun after that correction: all 13 tests passed. No suppression added.
Integration/security checks used both explicit isolated chart-template DB URLs,
not the running ERP source database. Browser checks used the existing local
web/API and supplied local operator login; no credentials were written to files.

Exact continuation checks (PowerShell; database tests require BOTH isolated
variables, as below):

```powershell
$env:TEST_SOURCE_DATABASE_URL='postgresql://nexora@127.0.0.1:55433/nexora_chart_template_ct01_20261020'
$env:TEST_SOURCE_BOOTSTRAP_DATABASE_URL=$env:TEST_SOURCE_DATABASE_URL
npx.cmd vitest run --config vitest.integration.config.ts tests/integration/finance-chart-company-adoption.test.ts tests/integration/finance-chart-templates.test.ts tests/integration/finance-general-nominals.test.ts tests/integration/finance-nominals.test.ts tests/integration/banking-payments.test.ts tests/integration/banking-receipts.test.ts
npx.cmd vitest run --config vitest.security.config.ts tests/security/finance-general-nominal-database-security.test.ts tests/security/finance-nominal-database-security.test.ts
npx.cmd vitest run --config vitest.unit.config.ts tests/unit/finance-nominal-directory.test.tsx tests/unit/finance-nominal-form.test.tsx tests/unit/finance-posting-review.test.tsx tests/unit/finance-chart-template-api.test.ts tests/unit/finance-chart-template-contracts.test.ts tests/unit/finance-chart-templates-view.test.tsx
npx.cmd vitest run --config vitest.unit.config.ts tests/unit/banking-payment-entry.test.tsx tests/unit/banking-receipt-entry.test.tsx
npx.cmd eslint app/features/finance/views/finance-nominals.tsx tests/unit/finance-nominal-directory.test.tsx app/features/banking/views/banking-payment-entry.tsx app/features/banking/views/banking-receipt-entry.tsx tests/unit/banking-payment-entry.test.tsx tests/unit/banking-receipt-entry.test.tsx tests/e2e/bank-entry-workspace.spec.ts
npm.cmd run typecheck
npm.cmd run api:check
npm.cmd run build:web
git diff --check
```

Chromium: set PLAYWRIGHT_BASE_URL=http://127.0.0.1:3000 and
PLAYWRIGHT_USE_EXISTING_WEB=true, and supply the existing local demo username and
password only through the two documented process environment variables. Run:

```powershell
npx.cmd playwright test tests/e2e/finance-chart-templates.spec.ts --project=chromium --workers=1
npx.cmd playwright test tests/e2e/bank-entry-workspace.spec.ts --project=chromium --workers=1
```

## 2026-10-21 — next Bank architecture direction approved

User approved shared company-scoped Project/Location masters and Identity-governed
assigned approvers. Written design:
`docs/superpowers/specs/2026-10-21-bank-workflow-context-design.md`, commit 1662a29.
Source inspection confirms existing Bank contracts lack selected-approver and
typed project/location references, and global approval override evidence cannot
be reused for delegated ordinary users. The design preserves that distinction.

Brainstorming workflow requires review of the written specification before
implementation planning/code changes. Await that review; then plan WC-01 shared
masters, WC-02 typed transaction/ledger context, WC-03 assigned/delegated approval,
WC-04 acceptance. No migrations, application edits, grants, source data changes
or new test execution occurred in this documentation-only follow-up. Existing
uncommitted application changes belong to earlier batches and were preserved.

The user subsequently approved the written Bank-context specification. That
review gate is now satisfied. WC-01a shared master backend and WC-01b API/client
portions are implemented; local UAT now has master_data migrations 1–2 with a
verified backup and unchanged company/financial counts. Continue from
`2026-10-21-bank-workflow-context-implementation-plan.md` (management UI next),
not from the earlier awaiting-review checkpoint. No further design approval is
needed for the approved slices. Bank project/location/assigned-approver fields
are not connected yet; do not mistake the new reference API for that integration.
