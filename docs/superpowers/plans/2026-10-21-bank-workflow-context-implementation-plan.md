# Bank workflow context implementation

Approved written specification: ../specs/2026-10-21-bank-workflow-context-design.md.
User approved written spec on 2026-10-21. No further design approval is required
for the behavior it explicitly describes. Implement incrementally, without
activation of business masters or approval grants as a migration side effect.

## Latest checkpoint — 2026-10-22: Finance calendars implemented and R06 configured

Supersedes the zero-period/design-only blocker below. Approved Finance calendar
implementation FC-01–FC-05 is complete. See
`2026-10-22-finance-calendars-implementation-plan.md` for exact files, API/security
behavior, backup, tests and limitations. Existing R06 2026 year now has twelve
Open monthly periods, genuine authenticated setup audit and unchanged financial
fingerprints. No posting rules, company isolation or financial records bypassed.
Real Fiscal Periods and Period Close screens support regular company-specific
12-month years, scoped closing/reopening and explicit Super Admin locked reopening.

Verification: unit 458/458, contract 12/12, targeted integration 47/47, security
16/16; final calendar browser 3/3, existing Bank context browser rerun six cases
passed; typecheck, generated API check, scoped lint and production build passed.
Earlier concurrent browser transport/directory timing failures are recorded in the
Finance plan; final sequential run passed. No full-repository lint success claimed.

URL: `http://127.0.0.1:3000/?fiscal_company=nexora-r06-uat-company#/finance/fiscal-periods`.
R06 dates outside 2026 still require deliberate company calendar setup/opening.
No need to repeat setup or seed all dates. Source web 3000/API 4000 are retained.

## Historical checkpoint — 2026-10-22: company fiscal calendar scope

The user approved a proper company-configurable Finance calendar rather than
an unlimited testing-date bypass: January–December, July–June or another regular
fiscal-year start; monthly periods, controlled closing/locking/reopening and
audit history. Source read still shows the existing Jan–Dec 2026 calendar and
zero periods. No source calendar/period or financial record was changed.

Written specification:
`docs/superpowers/specs/2026-10-22-finance-calendars-design.md`.
Repository audit found existing stored states `open`, `soft_close`, `closed`,
platform-owned calendar definition and Finance-owned period lifecycle. Preserve
those owners/status values; do not build duplicate calendars under Banking.

This checkpoint is **design only, not implementation complete**. The required
brainstorming written-spec review gate remains before code changes. The next
agent should obtain that review, then implement the dependency-first slices and
verification defined in the spec. Do not run broad provisioning scripts against
source, seed all dates, change existing fiscal-year boundaries, silently unlock
periods or infer authority from a role label. The earlier Bank UI and verification
results below are historical, not tests of the new calendar functionality.

## Previous checkpoint — 2026-10-21: searchable Bank directories and Finance-period failure

Latest user report: Bank Payment save returned “The Finance period for this
posting date is not open” (reference `919255f7-ae03-43eb-b949-9435711b8260`),
and Nominal/Project/Location/Approver searches should live inside the dropdown.

### Cause and changes

- Source R06 UAT has an active 2026 fiscal calendar
  `synthetic-general-uat-calendar-2026`, **zero financial periods**. Final read
  confirmed that absence. Draft creation/update does not require an open period;
  submission does. “Approve & Close” first saves the draft, then submits and
  approves separately. The old generic error obscured the successful draft save.
  Payment/Receipt repository submission guards and Finance posting guards were
  deliberately preserved. No automatic opening, reopening or period bypass.
- Added shared `app/shared/ui/searchable-select.tsx` using the already-installed
  Base UI Combobox and shared Button/Input. Search exists only in the popup;
  keyboard selection, Escape, loading, disabled historical items, empty states
  and selected code/name remain supported. No new dependency or feature CSS.
- Payment/Receipt nominal fields reuse the existing company-scoped, bounded
  directory API (100 matches); `bank-workflow-controls.tsx` reuses the existing
  Project/Location/Approver API (50/cursor), retaining eligibility, selected
  historical reference projection and permission checks. Load-more is inside
  the popup. Searches retain the selected reference rather than clearing IDs.
- Final browser regression exposed a debounce race: old locally matching options
  could remain briefly selectable before remote searching began. Both nominal
  controls now enter loading immediately when the search changes, covering the
  debounce interval too. No stale option can be selected in that interval.
- Added `bank-period-failure.ts`: a period rejection after persistence explicitly
  says **Draft <reference> is saved**, submission/approval is blocked, and nothing
  was approved/posted; correlation ID remains available. A retry reuses the
  existing draft and idempotency key rather than creating another payment.
- Document Reference remains absent from entry UI; old saved values remain in
  compatible update payloads. Plain-text Details, equal 40px controls, company
  isolation, selected approver rules, immutable history and posting are preserved.

### Actual verification

- `npm.cmd run test:unit -- --maxWorkers=3`: initial full run **438/438 passed**;
  two subsequent runs **437/438**, each failing only the previously observed
  timing-sensitive `delegation-panel.test.ts` administrator-ownership test.
  Isolated rerun of that file **4/4 passed**. It is not a Bank regression and was
  not removed or weakened. Do not describe the final full-suite result as green.
- Focused `searchable-select`, Bank workflow controls and both entry component
  tests: **48 passed** (including period failure/retry/persistence and stale
  search protection). Real popup interaction tests were retained: their JSDOM
  hang was traced via a local debugger to recursive `:fullscreen` matching in
  JSDOM 25; a test-only non-fullscreen shim fixes it without mocking the combo.
- Payment/Receipt PostgreSQL integration: **20 passed**. New tests close only
  each suite's randomly named fixture-company period, prove draft persistence
  and submission rejection without additional events/journals, and restore it.
- Bank-payment and general-nominal database security: **14 passed**.
  Contract tests: **12 passed**; generated API `npm.cmd run api:check` passed.
- Real Chromium + isolated API/PostgreSQL: **9 passed** total: workflow context
  **6**, catalog/hierarchy **2**, period protection **1**. Includes Project/City
  creation/edit, assigned checker, administrator reassignment, delegated self-
  approval/revocation, ordinary-user denial, in-popup keyboard search, nominal
  save/reopen, and real closed-period Payment/Receipt draft retention on retries.
  Earlier browser failures exposed debounce timing or test assumptions (native
  options, unsaved-route guard, persisted decimal scale); final tests passed.
- `npm.cmd run typecheck`, `npm.cmd run build:web`, scoped ESLint, scoped Prettier
  and `git diff --check` passed. Production build rerun after the debounce fix.
  Full `npm.cmd run lint` was also executed: **112 errors, 1 warning** in
  inherited/unrelated surfaces, matching the earlier baseline; scoped lint of
  every changed implementation/test file passed. These blockers remain unresolved.
- Browser evidence uses only `nexora_bank_context_e2e_isolated_*` databases and
  API ports 4015–4019. Existing web 3000/API 4000 were not reconfigured. Evidence
  retained under ignored `tmp/bank-search-period-20261021/`. All five task-owned
  APIs 4015–4019 were stopped after verification; their synthetic databases were
  retained, not deleted. Web 3000/API 4000 still listen; web login returns 200 and
  API readiness reports all infrastructure/foundation checks OK. No source financial
  mutation, credential/role change, migration edit, commit or push this turn.

### Remaining runtime blocker / safe resume

**Source October submission/approval is still blocked by missing Finance setup.**
The user was asked whether 1–31 October 2026 may be configured as an open R06 UAT
testing period; no answer was received during this implementation. Do not claim
that real-source approval is fixed, silently open a period, or disable checks.
Save Draft works; approval/posting require explicit Finance-period configuration.
Do not run the entire `provision-bank-payments-uat.ts` against this source as a
shortcut: it also provisions identities/permissions/accounts. Reuse its guarded
calendar/period conventions only in a narrowly scoped, authorized setup workflow,
checking exact existing calendar/company boundaries and recording actual setup
evidence. No existing locked/closed period should be reopened without authority.

Final source read: 4 draft Payments, no Receipts, no journals, still zero periods.
Source can be used concurrently by the user; this is an observation, not a claim
that all counts stayed unchanged since the previous checkpoint. Prior 131/96
nominal activation findings below remain valid; do not repeat that activation.

## Previous checkpoint — 2026-10-21: Super Admin direct Chart of Accounts masters

### Latest business operation — 131 imported ordinary accounts now active

Supersedes the blocked/zero-activation snapshots below. The user subsequently
authorized activation and transaction-level availability. Authentication using
the user-supplied existing credentials succeeded normally as Shoaib, global Super
Admin `user-shoaib-super-admin`; no credentials/roles were reset, no permission
grants added and no session fabricated. All mutations used the normal API 4000,
CSRF, trusted Origin, quoted If-Match versions and stable per-code request keys.

- Existing 227-row audit flags were rechecked against all source IDs/codes/names,
  section/category, currency, posting flags and live versions. **131** catalog
  entries without O/M/U exceptions were classified ordinary and activated.
  **96** distinct ownership/integration, applicability/reporting or specific-label
  exceptions remain unchanged, draft/inactive/review_required. Generic T warnings
  were not equated to proven errors in the already-approved workbook; source
  identity/notes were preserved. The full 96 code/name/reason list and current
  result are now at the top of `docs/architecture/nominal-catalog-import-review.md`.
- Four older inactive general profiles and protected Bank/control records were
  not reactivated. All 102 headers already active. Both Bank nominal-directory
  APIs now report 131 eligible, 96 pending review, 4 inactive, 20 protected leaves.
  Search by code/name for accounts outside the first bounded 100 matches.
- An initial If-Match formatting error was rejected before any mutation. A later
  transient API disconnect interrupted the operation at 61 active + one reviewed
  draft; the API recovered, and a version-aware resume skipped the completed 61
  and activated the remaining 70. No duplicate decisions or blanket SQL updates.
- Verification: all 227 identity/classification/profile snapshots compared;
  selected records active/ordinary v3, classification review v2; excluded 96
  unchanged in full. Exactly 131 activation proofs by the authenticated actor,
  262 new general-nominal events (243 → 505), 262 new platform audits (334 → 596).
  No fabricated submitter/checker/override fields. Bank accounts, Payment/lines,
  Receipt/lines and journals have identical before/after fingerprints. Financial
  counts still 3 Payments, 0 Receipts, 0 journals; no financial workflow executed.
- Real local browser login/normal API (not isolated forwarding or fixtures)
  verified nonempty selectors and selected **711301 · Subscriptions** in both
  transaction forms. All non-auth business writes were blocked in that read-only
  browser check. Screenshots: ignored `tmp/coa-activation-20261021/`.
- Source backup before writes: `before-reviewed-activation.dump` in that ignored
  directory; pg_restore listing verified, SHA-256
  `0da84bd8bce394844750a0ec7194bb8f63077d29a675c74140e53b9995849bb1`.
  Task API sessions logged out; normal services remain running. This operation
  changed business data through existing services, not application/migration code.

**Resume:** users should refresh open transaction pages/directories. Nominals are
now selectable; do not repeat activation or create replacement accounts. Resolve
only the documented remaining 96 business exceptions with their owners before
additional ordinary activation. The earlier zero-activation notes below are
historical, not current counts.

### Follow-up — Payment/Receipt Details layout and still-empty local selector

- User requested removal of Document Reference and consistent input sizing.
  Both entry grids now omit that input, retain plain-text Details, use 40px
  line controls and fixed proportional columns (more room for Nominal/Details).
  Existing reference values remain in loaded draft state and compatible API
  payloads; removing a field must not erase references from historical drafts.
  Receipt payer input and all required dimensions/financial validation remain.
  No shared primitive, global stylesheet, API contract or financial rule changed.
- Source read-only recheck still returns 227 imported draft/inactive/
  review_required profiles plus four older inactive general profiles. This is
  the reason the company has no eligible ordinary offsets; it is not an
  unconnected selector. Source account classifications/statuses were not changed.
- A targeted question was sent requesting the business decision to classify and
  activate existing **711301 — Subscriptions** as ordinary in R06 UAT. No reply
  or activation occurred in this follow-up. Do not silently treat the other
  226 records, module controls or source ambiguities as ordinary accounts.
- Actual verification: Payment/Receipt component suites **36/36**, including
  no reference input and preserving nonempty stored references while editing
  Details. Isolated real-API browser suite **2/2** passed with exact 40px height
  assertions for line date/reference/mode/nominal/Details/amount in both forms,
  nominal selection/save/reopen and PostgreSQL checks. Environment was the
  fresh `nexora_bank_context_e2e_isolated_20261021_coa_direct_d`, API port 4014,
  existing web 3000, same harness/command described below. This does not imply
  source nominals became eligible. Scoped lint/whitespace and typecheck passed.
  `npm.cmd run build:web` passed. Normal web/API remain HTTP 200; only the
  task-owned isolated port-4014 API was stopped afterward.

This user-approved policy supersedes earlier master-data maker/checker steps in
this handoff. **Bank Payment/Receipt financial submission, assigned approval,
posting, period locks and reversal rules are unchanged.**

- Finance 24 adds an append-only, tenant-RLS master-change proof with exact
  account/profile/version/state/actor and platform-audit binding. Applied migration
  history was not rewritten. Existing legacy guards remain for compatibility;
  no business classification, activation or permission grants run as backfill.
- New `coa-master-authority.ts` checks snapshot and current persisted global
  Super Admin authority, company access and existing fine permissions, under the
  existing Identity governance lock. Ordinary users, impersonation, forged/stale
  roles and wrong companies fail closed, including before idempotent replay.
- `coa-master-change.ts` centralizes atomic direct edit/activate/deactivate,
  optimistic versioning, real audit/event history, parent and duplicate guards,
  active currency checks and currency immutability once financially referenced.
  Codes, accounting types, parents, creation actors and old decision evidence are
  preserved. No submitter/checker/override event is fabricated for direct action.
- `nominals/source-repository.ts` creates canonical ordinary/Bank nominals active
  in the creation transaction, with truthful created+activated history. General
  master submit/decision endpoints return 410; old native Bank compatibility
  branches remain, but new masters do not require them and UI capabilities do not
  offer submission/approval. Legacy detailed Bank services and financial workflows
  are not removed. Active/inactive canonical masters support controlled editing.
- Company adoption, posting classification and central import/publication writes
  are also Super Admin-only. Classification remains an explicit accounting
  decision, not an approval step. Adopted source-bound names remain protected.
- New hierarchy repository/contracts/versioned API/generated client and
  `finance-hierarchy.tsx` implement real company Categories/Sections management
  within existing Section Management navigation. New category/ordinary section,
  view, rename, activate/deactivate, expected versions, idempotency, bounded lists,
  dependency failures and read-only ordinary-user state are implemented. Published
  central reference revisions remain immutable; there is no duplicate CoA store.
- Nominal forms use **Save & Activate / Save changes**, detail **Activate now**,
  and Bank selector guidance now says Super Admin review/activation. Selectors
  retain the shared database eligibility rules and existing IDs; no fixtures,
  inactive/control/header/Bank-settlement offsets are offered as eligible.

### Source audit / actual application

Backup and full account-code/name exception inventory are recorded in
`docs/architecture/nominal-catalog-import-review.md` (latest checkpoint at top).
The normal local DB is Finance **24** after the existing migration CLI; other
module versions unchanged. Normal API readiness and web login both HTTP 200.

**Activated: 0 imported nominals, 0 headers. Excluded from automatic activation:
227 imported nominals. Manual review: those same 227, not an additional group.**
All 227 remain draft/inactive/review_required at review version 1. There are zero
already-classified ordinary imported drafts and zero draft/inactive headers.
All 102 existing headers are active. A structurally valid source row does not
resolve ownership restrictions; preserving classifications prohibits silently
converting all imports to ordinary accounts. Zero confirmed imported structural
errors/duplicate codes/normalized names were found. Resolve the documented source
warnings and accounting ownership first, then Super Admin directly activates
eligible ordinary accounts. Module-controlled records stay excluded.

Post-migration source comparison: all 227 identities, hierarchy, currency, states,
classifications, review versions and source notes/rows unchanged. Counts unchanged:
353 accounts, 17 Bank accounts, 3 payments, 0 receipts/journals, 243 general nominal
events, 334 platform audits, and 0 direct-master business changes. No financial
record, company, user permission, classification or historical audit was changed.

### Verification / safe resume

Executed final checks (no claim that unrelated repository checks are clean):

- `npm.cmd run typecheck`, `npm.cmd run build:web`, `npm.cmd run api:check`,
  `npm.cmd run test:contract`: passed; contract suite 12/12. `git diff --check`
  and scoped Prettier/ESLint for changed Finance/master UI, services and tests passed.
- `npx.cmd vitest run --config vitest.integration.config.ts` with explicit file
  arguments for `coa-super-admin-master`, `finance-chart-templates`,
  `finance-chart-company-adoption`, `finance-chart-hierarchy-maintenance`,
  `finance-general-nominals`, `finance-nominals`, `postgres-migrations`,
  `banking-payments`, `banking-receipts`, `--maxWorkers=1`: **78/78 in 9 files**.
  Both TEST_SOURCE_DATABASE_URL and TEST_SOURCE_BOOTSTRAP_DATABASE_URL were
  `postgresql://nexora@127.0.0.1:55433/nexora_chart_template_ct01_20261021_coa_final`.
  Fresh schema migration applied all modules and replay checks passed. Includes
  balanced financial Payment/Receipt posting through existing services, direct
  masters, immutable evidence, duplicate concurrency, API CSRF/Origin/If-Match,
  live authorization/revocation, company/tenant isolation and import exclusions.
- `npx.cmd vitest run --config vitest.security.config.ts --maxWorkers=1`:
  **41/41 in 7 files**, using the explicitly isolated original CT-01 database.
- Focused unit run of 11 Finance/Bank API/contract/form/directory/posting-review/
  Payment-entry/Receipt-entry files: **115/115**. Full unit run: **427/428**;
  unchanged `tests/unit/delegation-panel.test.ts:121` intermittently fails its
  full-administrator Approve-button expectation (one run passed, isolated/full
  reruns also failed). No Delegation production code/test was changed or its
  authorization weakened to clear that unrelated result.
- `npm.cmd run lint`: **112 errors, 1 warning** in existing repository surfaces
  and an old ignored tmp smoke script; scoped changed-file lint passes. Do not
  describe repository-wide lint as passing or mix unrelated fixes into CoA work.
- Earlier regression runs against the accumulated CT-01 database (46,200 account
  rows after repeated synthetic adoption tests) hit the offline hierarchy tool's
  five-second concurrent maintenance lock timeout. Its timeout/protection was
  not increased or bypassed. The same 9-file suite passed on the fresh isolated
  database above. Avoid running mutating suites against the manual-test DB.

Browser acceptance uses a fresh, explicitly isolated database and the real
cookie-authenticated API, not source business data. It verifies ordinary-user
denial, direct Super Admin classification/activation without submitter/checker,
both Bank selectors, saved/reopened Payment/Receipt IDs and PostgreSQL evidence;
another browser case verifies category create/edit/deactivate/reactivate and
read-only ordinary access. Synthetic tests do not authorize source activation.

Final browser command: `npx.cmd playwright test tests/e2e/bank-nominal-directory.spec.ts --workers=1 --reporter=line`
**2/2 passed**, with `PLAYWRIGHT_USE_EXISTING_WEB=true`,
`PLAYWRIGHT_BASE_URL=http://127.0.0.1:3000`,
`NEXORA_BANK_CONTEXT_E2E_API_URL=http://127.0.0.1:4013`,
`NEXORA_BANK_CONTEXT_E2E_DATABASE_URL=postgresql://nexora@127.0.0.1:55433/nexora_bank_context_e2e_isolated_20261021_coa_direct_c`
and `NEXORA_BANK_NOMINAL_E2E_CATALOG=true`. Synthetic password was supplied only
through the existing test environment variable, not committed. Harness command
`npx.cmd tsx scripts/run-bank-context-e2e-api.ts` requires an unused isolated
database name, explicit bootstrap URL, test API port, password and existing local
test Redis/object-storage endpoints. Never point it at the normal manual-test DB.
Only task-owned temporary APIs were stopped afterward; normal web/API remain
available (login and API readiness HTTP 200). Test databases and backup retained;
no production/manual-test records were deleted. No commit/push was requested here.

Resume at **Super Admin catalog ownership/source review**, not blanket approval
or another CoA implementation. Use the existing R06 UAT company; do not create a
new business company or seed offsets. Source catalogue entries need explicit
truthful classification; Finance approval queues are no longer a master-data
prerequisite. Project/Location WC-03 governance is a separate feature and was not
weakened or granted implicitly by this change.

- [x] WC-01a Shared master foundation: new master_data migration module after
  Security; separate project/location identities, company FKs, tenant RLS,
  immutable audit-linked version events, case-insensitive code uniqueness.
  Add strict contracts and a live-authorized repository with bounded pagination,
  optimistic concurrency and idempotency. Verify isolated PostgreSQL tests.
- [x] WC-01b Versioned session/CSRF/Origin API, documented OpenAPI/generated client,
  existing-navigation management UI with loading/error/denied/empty/success states.
  Grant no ordinary users access implicitly. Verify API/component/browser checks.
- [x] WC-02 Persist nullable typed project/location on Bank headers; validate
  active company references, canonical line dimensions and original/reversal
  accounting context. Preserve legacy records and existing Finance services.
- [x] WC-03: assigned checker/live eligibility/global-intervention evidence delivered; audited reassignment
  and company/kind-scoped delegated self-approval under Identity & Access.
  Preserve global override semantics, posting separation and legacy submitted queues.
- [ ] WC-04: automated master/context/assigned-checker/delegation/reassignment verification complete; operator manual acceptance remains. End-to-end persistence, approval/routing, accounting/reversal,
  authorization/revocation/concurrency, migration, build and manual acceptance.

## Safety and verification

Mutating database tests must explicitly select an isolated database, not the
running nexora_source_test. Use existing R06 UAT only for authorized manual
acceptance. No new business company, guessed currencies, financial activation,
period opening, history deletion or .env edits. Preserve all inherited dirty
worktree changes. Record exact executed checks and safe resume point below.

## 2026-10-21 — shared master backend delivered

- Approved spec review completed; implemented the next dependency rather than
  changing financial workflow behavior prematurely. `writing-plans` skill was
  unavailable; this checklist follows the approved spec and repository workflow.
- New `master_data` module runs after Security and before Finance. Migration 1
  adds separate erp_project/erp_location and immutable reference events; migration
  2 additionally validates standalone event inserts against the current master
  and exact platform-audit actor/action. Both versions tested fresh and additively.
  Applied migration files were not rewritten after their isolated application.
- Codes are company/type scoped and case-insensitively unique; names need not be
  unique. IDs/company/code/creation identity are immutable. Only names/status may
  change through versioned audited operations; no hard-delete endpoint exists.
- Contracts, repository, service, `/api/v1/master_data/{projects|locations}`
  routes, OpenAPI and generated browser client implemented together. List/detail,
  per-kind accessible-company directory, create, rename and status changes have
  real PostgreSQL persistence. Search is escaped, lists bounded and continuation
  is keyset-based and bound to tenant/company/kind/filter selection.
- Current live role/assignment/permission/scope/company access is rechecked,
  including before returning an idempotent replay. Mutations reject impersonation,
  missing CSRF, untrusted Origin and missing request keys; edits require matching
  If-Match/body versions. Record/event/platform audit writes are atomic.
- Four read/manage permission definitions are registered and are compatible with
  the existing dynamically loaded Identity role catalog. No user/policy grant was
  created, and manage permission does not imply Bank approval/posting.
- Initial new-module verification: 11 repository/database integration cases and
  9 contract/API unit cases passed. Selected six-file regression run passed 44
  integration tests (new references, migration ledger, CoA adoption/governance,
  Payments and Receipts); 19 existing Finance database-security tests passed.
  Repository typecheck, scoped ESLint, api:check, build:web and whitespace passed.
  A post-review focused rerun is recorded below if any result differs.
- Fresh-database test creates a uniquely named disposable reference_fresh_* DB,
  migrates the complete schema, verifies idempotency and drops only that test DB.
  It does not create a business company in the running application database.
- Source backup: ignored `tmp/reference-masters-20261021/before-shared-masters.dump`,
  2,114,089 bytes; pg_restore --list verified 2,297 lines. Then the existing migration
  CLI installed only master_data versions 1 and 2 locally. Existing module versions
  remained platform 8/security 15/workflow 1/finance 18/HR 34/runtime 1.
- Before/after source aggregate counts are unchanged: 9 companies, 353 accounts,
  17 Bank accounts, 3 Bank payments, 0 receipts and 0 journals. New project/location/
  reference-event counts are all zero: no source reference data or grant was
  invented. API readiness returned healthy master_data/HR/Banking/infrastructure;
  unauthenticated GET against the running new directory returned HTTP 401.

### Commands executed

```powershell
$env:TEST_SOURCE_DATABASE_URL='postgresql://nexora@127.0.0.1:55433/nexora_chart_template_ct01_20261020'
$env:TEST_SOURCE_BOOTSTRAP_DATABASE_URL=$env:TEST_SOURCE_DATABASE_URL
npx.cmd vitest run --config vitest.integration.config.ts tests/integration/reference-masters.test.ts tests/integration/postgres-migrations.test.ts tests/integration/finance-chart-company-adoption.test.ts tests/integration/finance-general-nominals.test.ts tests/integration/banking-payments.test.ts tests/integration/banking-receipts.test.ts
npx.cmd vitest run --config vitest.security.config.ts tests/security/finance-general-nominal-database-security.test.ts tests/security/finance-nominal-database-security.test.ts
npx.cmd vitest run --config vitest.unit.config.ts tests/unit/reference-masters-api.test.ts
npx.cmd eslint server/api/src/modules/master-data packages/contracts/src/master-data tests/unit/reference-masters-api.test.ts tests/integration/reference-masters.test.ts
npm.cmd run typecheck
npm.cmd run api:check
npm.cmd run build:web
git diff --check
```

Local application schema upgrade used DATABASE_URL only in the shell process,
then `npm.cmd run db:migrate:source`. No `.env` values were read or changed.
No financial test suite used the running ERP database.

### Safe resume point — no additional design approval needed

Finish WC-01b management UI through existing Finance/Master Data navigation,
using the generated client and shared controls. Add explicit loading/empty/
denied/error/success states, company selection and mutation retry/version handling.
Add component and real browser verification; backend/API tests do not establish
that a management page exists. No new management page is delivered in this batch.
Administrators may grant the four explicit permissions through existing Identity
policies; do not widen all roles or silently activate grants in a schema migration.

Then implement WC-02 typed header references and Finance dimension propagation,
then WC-03 selected/delegated approval and Identity grant management. Current
Bank forms are unchanged by this backend batch and do not yet persist these new
fields. No delegated self-approval or selected-checker behavior is enabled yet.
The earlier 227 CoA draft reviews and seven Bank currency/approval choices remain
operator acceptance steps. Do not conflate schema/API delivery with completion
of the entire Bank Payment/Receipt module or production acceptance.

Final focused rerun after bounded-authority-query/readiness review: typecheck,
11 new reference integration tests, 9 contract/API tests, api:check and
git diff --check passed. Scoped ESLint also passed. OpenAPI includes the safe
503 unavailable-schema response. No new browser workflow was executed for this
backend-only batch; existing management UI is deliberately not claimed.

## 2026-10-21 — management UI, Bank context and assigned-checker delivery

This checkpoint supersedes the earlier safe-resume instructions above. The user
explicitly authorized direct implementation; no additional design approval is
required. WC-01b and WC-02 are delivered. WC-03 is intentionally marked partial,
not complete: assigned checkers are real, but ordinary delegated self-approval
and submitted-record reassignment do not yet exist.

### Implemented

- Existing Finance navigation now includes **Reporting Master Data → Projects /
  Locations / Cities**. `ReferenceMasterWorkspace` uses the generated API for
  company directories, bounded search/status/keyset pages, create, persisted
  detail, rename and activate/deactivate. Codes/company are immutable. Explicit
  read/manage permissions, impersonation restrictions, dirty handling, loading,
  empty, denied, error/retry and successful-mutation notices are present. No
  browser fixture or mock fallback was introduced.
- Both Bank entry grids retain their existing free-text Details, dates, nominal
  search, totals and lifecycle actions. Shared controls select real Project,
  Location / City and Approver identities. Choices are company/kind scoped,
  searchable/paginated, never implicitly selected; saved inactive labels survive.
  Company changes reset context. One authorized company is a read-only caption;
  multiple companies retain the authorized selector, and saved company is fixed.
- Contracts, generated client and OpenAPI were evolved together. New read-only
  `/api/v1/banking/{payments|receipts}/workflow_options` projections require Bank
  read/company authority, not master-management permission. They expose only
  reference IDs/codes/names and eligibility, never private user/HR credentials.
- Finance migrations **19–21** add nullable typed references to both headers,
  composite project/location company FKs, queue indexes and tenant-RLS immutable
  `bank_assignment_intervention` evidence. Draft-only context and deferred exact
  line-dimension/decision/audit binding guards are installed. Legacy records were
  not assigned or backfilled. Applied migrations were not subsequently rewritten.
- Server validates active scoped masters on save/submit/post and derives canonical
  line dimensions; conflicting client dimensions or final size/count overflow
  fail. Original/reversal journals use the existing Finance service. Reversing an
  already posted record retains original context even after master deactivation.
- New submissions require an explicitly eligible checker. Live user, company,
  assignment, policy, permission and scope are rechecked; a different ordinary
  checker cannot decide. Existing global super-admin intervention remains
  possible with separately typed immutable audit evidence. Legacy submitted null
  assignments retain the independent-checker path. Approval does **not** post,
  and no entered approval reason was added; rejection/reversal keep their rules.
- Bank mutations take a shared lock on the existing Identity administration
  advisory key before the Banking lock. A governed revocation cannot silently
  race the authority snapshot/commit. The existing global override policy was not
  relaxed and HR approval code/schema remain unchanged.
- Detail pages show real context/assigned names and restrict decision affordances.
  Fixed their narrow-screen grid intrinsic-width overflow; dense tables scroll
  inside their cards rather than widening the particulars/timeline.

### Actual verification

- Full unit suite: **61 files / 411 tests passed**, using `--maxWorkers=4`.
  Latest single-company-caption rerun: 32 entry/control tests passed.
- Six-file isolated PostgreSQL regression: **46 tests passed** (masters,
  migration ledger, Payments, Receipts, company-chart adoption, general nominals).
  Context cases exercise actual cross-company identity rejection, missing checker,
  unassigned-but-authorized checker denial, revoked scope, concurrent governed
  revocation versus decision, forged canonical dimensions, inactive-master posting
  rejection, original/reversal persisted dimensions and deferred database guards.
- Complete security suite: **7 files / 41 tests passed**. Separate existing HR
  approval-override integration: **3 tests passed**.
- Contract suite: **2 files / 12 tests passed**. Kept exact path/schema assertions
  current for the inherited approved chart/master additions and new Bank fields.
  Full-unit discovery also found two pre-existing obsolete theme import paths;
  corrected the test imports to `app/shared/theme`, without changing theme code.
  An initial import-boundary scan timed out under unrestricted parallel load;
  it passed alone and the complete bounded-worker suite passed.
- **4 real Chromium workflows passed**: Finance-navigation master CRUD/status;
  Payment and Receipt create/save/reload/new-checker-session/approve; denied
  master management. Tests forward actual HTTP to an isolated production API,
  not mocked response fixtures. Direct PostgreSQL assertions confirm saved
  identities, assigned approving actor and no journal on approval. Mobile
  particulars width is asserted at 390px; screenshots were inspected.
- `npm.cmd run typecheck`, owned ESLint, `npm.cmd run api:check`,
  `npm.cmd run build:web`, and `git diff --check` passed. Final reruns after any
  later edit are recorded below rather than inferred from these results.
- Browser fixture initially violated authentication's normalized/compatibility
  permission parity. Fixed only isolated provisioning; authentication and its
  fail-closed parity checks were not weakened. Repeated browser runs use unique
  codes and scoped row assertions; no duplicate-name cleanup is necessary.

### Source environment and safety

Before source migration 19, verified ignored backup
`tmp/bank-context-20261021/before-finance19.dump` (2,139,906 bytes, 2,341 archive
listing lines). Before migration 20, verified `before-finance20.dump` in the same
folder (2,158,174 bytes, 2,368 listing lines). The existing migration CLI changed
only Finance; source versions are platform 8/security 15/workflow 1/master_data
2/finance 21/HR 34/runtime 1. Readiness now requires Finance 21/intervention table.
Final compatibility review added migration 21 rather than editing applied 20:
reversals preserve legacy free-text line dimensions while new transaction writes
remain strictly canonical. Before 21, `before-finance21.dump` was verified in the
same ignored backup folder (2,163,555 bytes, 2,375 listing lines).

Source before/after aggregates remain **9 companies / 353 accounts / 17 Bank
accounts / 3 payments / 0 receipts / 0 journals / 0 projects / 0 locations**.
No source business company, master, permission grant, approval, posting, period,
currency or financial record was created/activated/deleted by this continuation.
No `.env` values were read/changed. Source readiness returned all seven checks OK,
including HR, Banking, masters, database, Redis and object storage.

Local pages (real session and appropriate explicit permissions required):

- `http://127.0.0.1:3000/#/finance/reporting-projects`
- `http://127.0.0.1:3000/#/finance/reporting-locations`
- `http://127.0.0.1:3000/#/banking/add-bank-payment`
- `http://127.0.0.1:3000/#/banking/add-bank-receipt`

Master managers need the corresponding `master_data.project.read/manage` and
`master_data.location.read/manage` grants through existing Identity policies.
Nothing grants every user or self-escalates a source administrator automatically.
Bank makers only need normal Bank/company access for selector projections.

### Reproduce checks safely

```powershell
$env:TEST_SOURCE_DATABASE_URL='postgresql://nexora@127.0.0.1:55433/nexora_chart_template_ct01_20261020'
$env:TEST_SOURCE_BOOTSTRAP_DATABASE_URL=$env:TEST_SOURCE_DATABASE_URL
npx.cmd vitest run --config vitest.unit.config.ts --maxWorkers=4
npx.cmd vitest run --config vitest.integration.config.ts tests/integration/reference-masters.test.ts tests/integration/postgres-migrations.test.ts tests/integration/banking-payments.test.ts tests/integration/banking-receipts.test.ts tests/integration/finance-chart-company-adoption.test.ts tests/integration/finance-general-nominals.test.ts
npx.cmd vitest run --config vitest.integration.config.ts tests/integration/bank-context-upgrade.test.ts
npx.cmd vitest run --config vitest.security.config.ts --maxWorkers=1
npx.cmd vitest run --config vitest.integration.config.ts tests/integration/hr-approval-override.test.ts
npm.cmd run test:contract
npm.cmd run typecheck
npm.cmd run api:check
npm.cmd run build:web
git diff --check
```

Real-browser harness: `scripts/run-bank-context-e2e-api.ts` creates a **fresh**
database and random in-process authentication/encryption keys; it never reads
`.env` or reuses the source DB. Supply local isolated bootstrap URL above,
`NEXORA_BANK_CONTEXT_E2E_DATABASE=nexora_bank_context_e2e_isolated_<unique>`,
`NEXORA_BANK_CONTEXT_E2E_PORT=4012`, an operator-supplied synthetic
`NEXORA_BANK_CONTEXT_E2E_PASSWORD`, `REDIS_URL=redis://127.0.0.1:56380/15` and
`S3_ENDPOINT=http://127.0.0.1:59000`, then run
`npx.cmd tsx scripts/run-bank-context-e2e-api.ts` in its own terminal. Do not reuse
an existing DB name. Start the existing web server with `npm.cmd run dev:web` if
needed; do not replace its configured API URL. In the browser-test terminal:

```powershell
$env:PLAYWRIGHT_BASE_URL='http://127.0.0.1:3000'
$env:PLAYWRIGHT_USE_EXISTING_WEB='true'
$env:NEXORA_BANK_CONTEXT_E2E_API_URL='http://127.0.0.1:4012'
# Supply matching isolated database URL and synthetic password from harness.
npx.cmd playwright test tests/e2e/bank-workflow-context.spec.ts --workers=1
```

This run used `nexora_bank_context_e2e_isolated_20261021_b`. Ignored screenshot
evidence is under `tmp/bank-context-20261021`. Failed earlier fixture DBs
`nexora_bank_context_e2e_20261021_a` and
`nexora_bank_context_e2e_isolated_20261021_a` contain only this task's synthetic
provisioning and remain retained; never apply a broad database cleanup command.

### Safe resume — remaining WC-03/WC-04 work

1. Implement a **separate** expected-version/idempotent/audited administrator
   reassignment operation and visible detail control. Currently submitted
   assignment is immutable; if an assigned checker loses access the decision
   safely blocks. Do not unblock by direct SQL or silently substituting a user.
2. Implement company/kind-bounded ordinary-user self-approval grant versions,
   revocations, Identity navigation/administration and separately typed decision
   evidence. No such grant/table/endpoint exists yet. Do not repurpose general
   Identity delegation or label ordinary delegates as global super-admins.
3. Extend Bank-only maker-checker/database guards for verified delegated evidence,
   live revocation serialization, UI eligibility and explicit acceptance tests.
   Preserve HR, Finance nominal and global override semantics.
4. Complete WC-04 acceptance for those remaining paths, then operator manual UAT.
   Current browser/core workflow verification is not production certification.
   Authenticated workspace-wide active company remains a separate dependency;
   the multi-company selector is intentionally preserved meanwhile.

The earlier 227 CoA posting reviews and seven Bank currency/approval choices
remain operator acceptance decisions, not missing master persistence. Preserve
all inherited dirty worktree changes; no bulk commit/push was performed.

### Final verification amendments

- After the read-only single-company caption, both entry/control unit suites
  passed again (32 tests), production build passed, and all four Chromium flows
  passed again, including 390px detail layout assertions.
- Added two focused session-local PostgreSQL trigger probes for legacy Payment
  and Receipt reversal compatibility. No public financial rows/guards/history
  are modified by the probes. After Finance 21, the final migration/Bank/upgrade
  run passed **4 files / 19 tests**; this includes the two new cases beyond the
  previously executed six-file/46-test regression. Readiness unit rerun passed
  **18 tests**. Source readiness returned all checks OK after installing 21.
- Owned new/feature ESLint passed. A broader shell lint attempt also inspected
  `app/shell/prototype-content.tsx` and found **11 existing unrelated prototype
  label-association errors** (lines 492, 1256, 1268, 1275, 1622, 1626, 1836, 1840,
  1844, 2247, 2251 at this checkpoint). No new label in the master/Bank surfaces
  failed. These old prototype form errors were not hidden/suppressed or converted
  into a broad unrelated UI refactor; do not report repository-wide lint clean.
- Final Finance-21 reruns also passed: all 41 security tests, all four real
  Chromium workflows, all 11 master integration tests (including fresh complete
  schema creation), typecheck, feature-owned lint and generated API check. Source
  aggregates remained unchanged and the web login returned HTTP 200. The isolated
  test API was stopped after acceptance; normal web 3000/API 4000 were left running.

## 2026-10-21 — WC-03 completion and final regression checkpoint

This checkpoint **supersedes the earlier partial WC-03 / safe-resume list**.
No further design approval is needed. WC-03 is implemented; WC-04 automated
verification is complete, with operator manual acceptance still outstanding.

### Delivered behavior and boundaries

- Identity & Access now exposes **Bank Self-approval** under Roles & Permissions:
  `http://127.0.0.1:3000/#/identity/access?tab=roles&section=bank-approval`.
  Active global administrators additionally need the explicit
  `security.bank_self_approval.read` / `.manage` permissions and company access.
  No permission or business grant is assigned automatically by migrations.
- Ordinary self-approval requires a live, exact tenant/company/Payment-or-Receipt
  grant **and** the user's normal Bank approval permission and explicit assignment
  as checker. An administrator cannot issue a grant to themselves. Revocation
  appends a new grant version; it never deletes old grants or decision evidence.
  Grant issue/revoke requires a governance reason; ordinary approval does not.
- Grant administration uses bounded/searchable user projections, keyset history,
  expected versions, idempotency, CSRF/Origin and live authorization on replay.
  All mutation paths reject impersonation. Grant revocation and Bank decisions
  serialize with the existing Identity administration advisory lock.
- Payment and Receipt detail screens include an administrator-only submitted
  approver reassignment control and immutable assignment history. This operation
  requires live global override authority, normal Bank approval permission and
  company access; it changes neither financial facts nor lifecycle approval.
  The replacement must be eligible at execution time. Version checks and locks
  prevent concurrent reassignment/decision from both succeeding against one version.
- Delegated decisions use separately typed, exact-bound evidence rather than
  global super-admin override records. Existing independent-checker and global
  override paths remain intact. Revocation blocks future self decisions without
  invalidating already approved history. Posting is still a separate authorized
  Finance operation; a grant adds no posting privilege and approval creates no journal.
- Project/Location management consistently enforces the four explicit
  `master_data.project.read/manage` and `master_data.location.read/manage`
  permissions in navigation, controls and APIs. Manage does not imply read or
  authority over the other master. Live revocation is serialized against writes;
  company-scoped immutable events, duplicate protection and bounded queries remain.
  Bank selector projections require normal Bank/company authority, not master-edit
  privileges. Existing HR statutory locations are not replaced.

### Architecture and API handoff

- New Identity repository/router:
  `server/api/src/modules/security/bank-self-approval-{repository,router}.ts`.
  Routes: GET `/api/v1/security/bank_self_approval_options`, GET/POST
  `/api/v1/security/bank_self_approval_grants`.
- New Bank mutation: POST `/api/v1/banking/payments/{id}/approver` and the matching
  `/api/v1/banking/receipts/{id}/approver`, using the established session, request
  key, If-Match, service/repository and standard error conventions.
- Shared Bank eligibility/evidence is centralized in `banking/workflow-context.ts`;
  Payment/Receipt services and repositories retain their existing financial logic.
  Request/response contracts, OpenAPI and generated client were updated together.
- New UI: `security/bank-self-approval-panel.tsx` and
  `banking/components/bank-approver-reassignment.tsx`. Existing entry controls,
  entry/detail screens and Identity navigation were extended, not replaced.
  Tailwind/shared primitives are retained; no feature CSS or dependency was added.
- Additive Security 16 registers two permission definitions. Finance 22 adds
  `bank_self_approval_grant_version`, `bank_delegated_decision`,
  `bank_approver_reassignment`, proof references, RLS and immutable binding guards.
  Finance 23 permits historical free-text dimensions **only** during an exact
  evidenced submitted reassignment with unchanged financial facts. Canonical
  dimensions remain mandatory for new/edited financial context. Applied historical
  migration files were not rewritten. New financial headers must still start draft;
  an old direct-approved security fixture was corrected to use valid transitions,
  not accommodated by weakening the production insert guard.

### Actual executed verification

All results below were observed, not inferred from implementation:

| Check | Result |
| --- | --- |
| Full unit: `npx.cmd vitest run --config vitest.unit.config.ts --maxWorkers=4` | 63 files / **420 tests passed** |
| Eight-file integration command below | **68 tests passed** |
| `npx.cmd vitest run --config vitest.security.config.ts --maxWorkers=1` | 7 files / **41 tests passed** |
| `npm.cmd run test:contract` | 2 files / **12 tests passed** |
| Real Chromium `tests/e2e/bank-workflow-context.spec.ts --workers=1 --max-failures=1` | **6 workflows passed together** against fresh isolated API/PostgreSQL |
| `npm.cmd run typecheck` | Passed |
| `npm.cmd run api:check` | Passed; generated client/OpenAPI consistent |
| `npm.cmd run build:web` | Passed; production Next.js build |
| Feature-owned ESLint (new/modified governance, Bank, master UI/API and new tests) | Passed |
| `git diff --check` | Passed |
| Whole-repository lint | **Blocked by 112 inherited errors / 1 warning**, not clean |

Integration command (use the explicit isolated bootstrap environment from above):

```powershell
npx.cmd vitest run --config vitest.integration.config.ts tests/integration/reference-masters.test.ts tests/integration/postgres-migrations.test.ts tests/integration/banking-payments.test.ts tests/integration/banking-receipts.test.ts tests/integration/bank-context-upgrade.test.ts tests/integration/hr-approval-override.test.ts tests/integration/finance-chart-company-adoption.test.ts tests/integration/finance-general-nominals.test.ts
```

Coverage includes missing/incorrect resource permissions, live scope revocation,
tenant/company/kind mismatch, impersonation, inactive approvers, self-grant denial,
strict HTTP/CSRF/version/retry rules, append-only grant and assignment evidence,
delegated approval/rejection, revocation/decision and reassignment/decision races,
RLS/SQL tampering, fresh migration integrity, legacy dimension compatibility,
independent posting after historical delegated approval, CoA and HR compatibility.
Six browser flows use real HTTP/API/PostgreSQL: master CRUD/status and reload;
Payment/Receipt reference persistence, two administrator reassignments and checker
approval; denied master access; Identity-issued Payment/Receipt self grants,
Approve & Close and subsequent revocation with preserved decision history.
Payment/Receipt 390px detail screenshots and bounded-layout checks also passed.

Whole-repository lint was actually executed. Its inherited issues span legacy
prototype forms/Bank screens outside this batch, HR, shared Label, shell and a
temporary browser script. The earlier eleven shell errors were only a subset.
They were not suppressed or mixed into a broad unrelated refactor. No new error
remains in the feature-owned lint scope. This is an explicit verification blocker,
not a claim that every repository check passes.

### Source safety, runtime and safe resume

- Source pre-upgrade backup: ignored
  `tmp/bank-context-wc03-20261021/before-wc03.dump`, **2,163,642 bytes**;
  `pg_restore --list` verified **2,375 lines** before applying the additive upgrade.
- Source schema is now platform 8 / Security 16 / workflow 1 / master_data 2 /
  Finance 23 / HR 34 / runtime 1. Source readiness returned all seven checks OK;
  web login returned HTTP 200. Normal web 3000/API 4000 remain running.
- Verified unchanged source aggregates: 9 companies, 353 accounts, 17 Bank accounts,
  3 payments, 0 receipts/journals/projects/locations. All three new governance
  tables contain zero source records. No source credentials, user grants, approvals,
  financial postings, company configuration or `.env` values were changed.
- Final browser harness used a fresh synthetic database
  `nexora_bank_context_e2e_isolated_20261021_wc03_b` and isolated API 4012. Earlier
  task database `_wc03_a` is retained as synthetic evidence. Harness credentials
  and grants exist only in these isolated databases; do not mistake them for source
  user permissions. Use the documented fresh-name harness, not production/shared
  database mutation tests. Normal API URL configuration was not changed.
  After the final six-flow run, only the verified task-owned isolated API process
  was stopped. Synthetic databases remain retained; web 3000/API 4000 still listen.
- Remaining: operator manual UAT in the existing approved company; explicitly
  authorize intended master managers / grant administrators through existing
  Identity policies, then issue business grants only to intended users. Nothing
  auto-activates a delegate or grants a super-admin new catalog permissions.
  Resolve inherited repository lint in a separate scoped maintenance task before
  a repository-wide clean release gate. Workspace-wide active company remains a
  separate dependency, so authorized multi-company selectors are preserved.
- Earlier 227 CoA posting reviews / seven Bank currency and approval choices remain
  operator decisions, not missing persistence. Do not reopen WC-03 design approval,
  reset the database or repeat this implementation. No production-readiness claim,
  bulk commit or push is implied by this checkpoint.

## 2026-10-21 — Empty Bank nominal selector investigation and correction

### Actual cause (not a missing database connection)

The live Payment and Receipt selectors already called their generated client,
`BankingApiClient.{payment,receipt}NominalAccounts`, GET
`/api/v1/banking/{payments|receipts}/nominal_accounts?company_id=...`, session
router, service and company-authorized repository. Both queries read the same
PostgreSQL `account` identities used by the company Chart of Accounts. Routes,
base URL, `{items: [...]}` response and code/name mapping were correct.

Read-only source inspection found **353 accounts** in R06-UAT: 102 headers,
227 imported nominal drafts awaiting posting review/approval, four other inactive
ordinary accounts and 20 protected Bank-control accounts (including inactive
controls). **Zero accounts currently qualify as ordinary Bank offsets**. Imported
definitions deliberately become inactive governed drafts; import/adoption is not
approval. Changing the query to include those rows or bulk activating them would
bypass Finance governance and was not done. Account names alone do not establish
which debtor/creditor/tax/payroll/stock/control accounts may be ordinary offsets.

The actual UI defects were an unexplained empty selector, conflation of search
misses with missing eligible accounts, no recovery action after Finance approval
or directory failure, and clearing selected display options on a failed search.

### Implementation

- Centralized the existing read projection in
  `server/api/src/modules/banking/nominal-directory.ts`, reused by both Bank
  repositories **after their unchanged live read permission and company checks**.
  No duplicate nominal store, migrations, source activation or posting changes.
- Added optional backward-compatible `availability` response metadata to shared
  contracts and regenerated OpenAPI/client artifacts. One company/tenant-bounded
  SQL snapshot returns eligible and matching counts, pending approval/inactive/
  protected counts, and `has_more`. These counts exclude headers and contain no
  unavailable account names/IDs. Protected controls are classified before other
  buckets; search changes matching counts, not company totals. Search remains
  escaped and bounded; code/name order and limit+1 detection prevent silent truncation.
- Both entry screens reuse `BankNominalAvailability` with existing shadcn
  Alert/Button/Tailwind styles. They distinguish pending Finance setup, no search
  matches, truncated results, loading and API failure. Authorized Finance readers
  can navigate through the existing shell to Chart of Accounts; master decisions
  still require their own server-side privileges. Dirty-form confirmation remains.
- Added **Refresh nominal accounts** and **Retry account options**, without
  saving/submitting the form. Search errors retain selected IDs/options and disable
  further selection until recovery. Dropdown entries still show account code/name;
  persisted detail projections preserve historical selected identities.
- No fake browser options or source seeds were introduced. Test fixtures import
  `packages/db/catalogs/approved-chart-20261020.json` through the existing template
  repository and normal company adoption. Review, submission and independent
  approval in browser use existing real Finance APIs; only those approved identities
  become selectable in Bank entry.

### Executed results and reproduction

- Full unit: **63 files / 427 tests passed**. One initial full run hit the inherited
  timer-sensitive `delegation-panel` test; the unchanged test and full suite passed
  on rerun. No unrelated Identity behavior or assertion was removed/weakened.
- Selected eight-file integration command in the preceding checkpoint:
  **69 tests passed** (includes CoA review-to-Bank eligibility, company/tenant/live
  permission denial, literal wildcard search, inactive/control/header filtering,
  metadata/truncation, Payments, Receipts, migration, HR and Finance regression).
- Full database security: **7 files / 41 tests passed**. Contracts: **12 passed**.
- `npm.cmd run typecheck`, `npm.cmd run api:check`, `npm.cmd run build:web`,
  feature-owned ESLint and `git diff --check` all passed.
- New real-browser scenario `tests/e2e/bank-nominal-directory.spec.ts` **passed**:
  reproduced HTTP 200 / empty items / 227 pending in both screens; navigated to
  Chart of Accounts; classified catalog nominal **711301 / Subscriptions** as
  ordinary; submitted as maker and approved as independent checker; selected
  **the same persisted ID** in Payment and Receipt; saved/reloaded each draft;
  verified code/name and selected ID after search miss; inspected transaction
  detail and queried PostgreSQL line IDs, exact amount and no journal. All four
  nominal lifecycle events remained present. Test only, not a business ownership
  decision for this account in the source company.
- Early browser attempts exposed fixture-only missing test grant scope, omitted
  required reference input and PostgreSQL fixed-scale decimal expectations. The
  harness/input/assertions were corrected; production authorization/validation and
  decimal precision were not relaxed to satisfy the test.
- New test harness mode: set `NEXORA_BANK_NOMINAL_E2E_CATALOG=true` in both harness
  and Playwright terminals, use the existing documented explicit fresh isolated
  database/port/password settings, then run:

```powershell
npx.cmd playwright test tests/e2e/bank-nominal-directory.spec.ts --workers=1 --max-failures=1
```

Final catalog scenario used
`nexora_bank_context_e2e_isolated_20261021_nominal_e`, isolated API 4012. Earlier
`_nominal_a` through `_nominal_d` are retained synthetic fixture/failed-attempt
evidence, not source databases. Screenshot inspected:
`tmp/bank-context-20261021/nominals-pending-approval.png`. Source readiness still
returns all seven checks OK; source aggregates remain 353 accounts / 3 payments /
0 receipts / 0 journals. No source nominal state, permissions, credentials,
approval evidence or financial records changed; no `.env` was read or edited.

### Required operator action — deliberately not automated

For the actual R06-UAT company, review the intended nominal's posting ownership
in **Finance → Chart of Accounts**, classify ordinary only where appropriate,
submit, and obtain an authorized Finance approval. Then use **Refresh nominal
accounts** on Bank Payment/Receipt. Pending/protected accounts must remain absent
from selectable options. Code wiring cannot safely replace this business decision;
the source dropdown remains legitimately empty until an eligible nominal is approved.

### Final selector regression checkpoint

- The six existing real Chromium master/context/independent-checker/reassignment/
  delegated-self-approval workflows also passed together against fresh isolated
  `nexora_bank_context_e2e_isolated_20261021_nominal_regression_a`, API 4013.
  Together with the catalog scenario this is **seven browser tests passed**.
- `npm.cmd run lint` was rerun and still reports **112 inherited errors / one
  warning**, including the same eleven old shell label errors; new feature-owned
  lint passed. No repository-wide clean-lint claim is made.
- Final source checks: web login HTTP 200; 353 accounts, 17 Bank accounts, three
  payments, zero receipts/journals; 227 nominal drafts and four inactive profiles
  unchanged. Both task-owned isolated APIs (4012/4013) were stopped after verifying
  their process commands. Normal web 3000/API 4000 were left running. Synthetic
  databases/evidence are retained; no cleanup of existing data, commit or push.

## 2026-10-21 — Read-only investigation of all 227 imported drafts

Detailed findings, account codes/names, full 227-row inventory, inferred ownership
review markers, source warnings and authorized user steps are now in:
`docs/architecture/nominal-catalog-import-review.md`, section
**2026-10-21 — Read-only review of the 227 imported nominals**.

### Actual state and findings

- All 227 are **draft / inactive / review_required**, review version 1, exactly
  one `created` event each. Zero classification events, submissions or approvals.
  They are not submitted requests stalled in a checker queue. The original
  company adoption deliberately withheld activation and posting ownership.
- Read-only SQL and approved-manifest comparison found no broken hierarchy,
  missing active currency, invalid mandatory name/code, missing governed profile/
  active section policy, source code/name/section mismatch, or duplicate code/
  normalized name among these 227. All are USD. This is structural consistency,
  not certification of business applicability or manual-posting suitability.
- Three explicit uncertain source labels: **120802 Faraz Payable**,
  **711304 Whop*Travelling Trader Subscription**, **711312 Magicfruit Subscription**.
  Another 189 have a generic reduced-image transcription warning; 35 have none.
  Confirm the original/export before approving questionable source labels.
- Duplicate screenshot occurrences **510104 Daily Wages Labour**, **711306 Figma
  Subscription**, **711314 Google Play** are each represented by one company
  account with both source references preserved. Thus 237 occurrences -> 234
  distinct definitions -> 227 drafts plus seven explicit Cash/Bank references.
  No missing accounts should be invented to make 237 unique codes.
- Five pre-existing Bank Operating Test names outside this imported set are
  distinct identities/codes, not duplicate imported records. No merge/deletion.
- Tax, debtor/creditor/instrument, stock, payroll, fixed asset/depreciation and FX/
  rounding names need explicit module/Finance owner review. Other category,
  maturity, contra-sign and capital-structure overlaps are review questions, not
  proven invalidity. Full codes/names and provisional markers are in the report.
  Never infer ordinary versus module-controlled solely from the account name.
- All optional descriptions and required-dimension lists are empty. Current
  contracts permit this, so it is not why approval is blocked. Currency,
  dimensions, description and applicability still need business review.
  Adopted source code/name identity is bound during classification; spelling/code
  corrections require a deliberate catalog/identity maintenance decision, not an
  ad hoc rename or applied-migration rewrite.

### Authorized workflow and verification

Use existing Chart of Accounts, explicit R06-UAT selection and the nominal detail.
Reviewer needs live company access and Finance nominal read/update plus chart
classification permissions. Save posting review; module-controlled records stay
blocked from ordinary submission. For a genuine ordinary account, authorized
submitter submits and independent Finance checker approves. Existing audited
global override remains an exception; Bank delegated self-approval does not grant
Finance nominal approval. Approval atomically activates the same existing account
ID with immutable evidence and **no journal**, then both Bank selectors can read
it in the same company. Not all 227 need activation.

Executed this turn:

```powershell
npx.cmd vitest run --config vitest.unit.config.ts tests/unit/finance-posting-review.test.tsx tests/unit/finance-nominal-directory.test.tsx tests/unit/finance-nominal-api.test.ts tests/unit/banking-payment-entry.test.tsx tests/unit/banking-receipt-entry.test.tsx --maxWorkers=4
# 5 files / 47 tests passed

# Explicit isolated TEST_SOURCE_DATABASE_URL / TEST_SOURCE_BOOTSTRAP_DATABASE_URL:
# postgresql://nexora@127.0.0.1:55433/nexora_chart_template_ct01_20261020
npx.cmd vitest run --config vitest.integration.config.ts tests/integration/finance-chart-company-adoption.test.ts tests/integration/finance-general-nominals.test.ts tests/integration/banking-payments.test.ts tests/integration/banking-receipts.test.ts
# 4 files / 37 tests passed
npx.cmd vitest run --config vitest.security.config.ts --maxWorkers=1
# 7 files / 41 tests passed

# Fresh isolated catalog harness, not the source API/database:
npx.cmd playwright test tests/e2e/bank-nominal-directory.spec.ts --workers=1 --max-failures=1
# 1 real Chromium scenario passed, covering both Payment and Receipt
git diff --check
# passed
```

Browser used `nexora_bank_context_e2e_isolated_20261021_review_a`, API 4012, the
existing harness with `NEXORA_BANK_NOMINAL_E2E_CATALOG=true`, operator-supplied
synthetic password and fresh random in-process authentication/encryption keys.
It repeated the real approved-catalog -> test-only 711301 posting review -> maker
submission -> independent approval -> both Bank selectors -> saved/reopened exact
IDs/amounts/history/no journal flow. This is **not** source business activation.

No product defect required additional functionality: only this handoff and the
existing audit report were changed. No new typecheck/build/lint execution is
claimed for this documentation-only turn; previous checkpoints remain historical.
Full repository lint still has the previously recorded inherited blockers.

Final source re-read matched the initial 227-row inspection, source template and
aggregate counts exactly: 353 accounts, three payments, zero receipts/journals,
243 general-nominal events, 334 platform audit events. None of the 227 is used in
Payment/Receipt or journal lines. Source `.env`, credentials, roles, grants,
accounts, classifications and audit history were not modified. The isolated
task-owned API was stopped; synthetic evidence DB retained. Web 3000/API 4000
left running. No commit/push or destructive cleanup.

**Safe next step:** Finance owner resolves source warnings and ownership/
reporting/currency/applicability decisions, then reviews/submits/approves a small
intentional set through existing UI. Keep unused or uncertain definitions inactive.
Do not bulk approve, reclassify controls as ordinary or delete nominal identities.
