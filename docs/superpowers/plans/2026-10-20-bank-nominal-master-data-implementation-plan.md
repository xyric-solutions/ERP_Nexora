# Bank Nominal and Master Data Production Integration Implementation Plan

- Status: Implementation approved and started; BN-00 baseline verified, BN-02 Finance contract boundary implemented; schema, services and UI pending
- Date: 2026-10-20
- Approved design: `../specs/2026-10-19-bank-nominal-master-data-design.md`
- Canonical accounting authority: Finance Chart of Accounts
- Operational capability authority: Banking Bank Account extension
- Production entry points: Finance/Master Data Nominals and Banking Add Bank Account
- Expected migration: next additive Finance migration after Finance 0008

### Implementation checkpoint - 2026-10-20 (BN-00 and BN-02 contract boundary)

- User approved implementation. The starting worktree was clean and Finance
  migration `0008` remains the verified repository head.
- BN-00 baseline observed 60 unit tests, four OpenAPI assertions, 25 PostgreSQL
  integration assertions and 15 database-security assertions passing.
- All database checks used the newly created disposable database
  `nexora_bank_nominals_test_20261020053150` on the repository's local test
  PostgreSQL service. No shared application/HR database was changed.
- Extended the existing Bank Account integration scenario to rename a legacy
  draft and prove that its Banking ID, mapped Finance ID, independent legacy
  name and existing active Finance account remain intact through approval.
- Implemented `packages/contracts/src/finance/index.ts` with strict options,
  directory, detail, minimal draft, update, submit, decision, deactivation and
  mutation-result schemas. Company discovery belongs to Finance options.
- Creation accepts only company, Category, Section, name, currency and optional
  description. Caller-provided codes, actors, lifecycle/posting authority,
  bank names, external account numbers and opening balances are rejected.
- Registered eight planned operations under six `/api/v1/finance/nominals`
  paths in OpenAPI and regenerated the browser client. Existing-record
  mutations use quoted `If-Match`, CSRF and idempotency headers; edits use
  `PATCH`.
- Observed expected failures before implementation: the Finance schema module
  was absent and three generated-client transport tests lacked their methods.
  Those tests now pass; no failing or skipped placeholder tests were committed.
- Final focused verification so far: 86 unit tests and five OpenAPI assertions
  passed; TypeScript and generated API drift checks passed. A separate
  read-only semantic comparison proved every existing OpenAPI path and schema
  unchanged. The changed legacy-account regression and migration repeatability
  suite passed 14 assertions on the disposable database.
- Phase-owned ESLint, the production `build:web` and `git diff --check` passed.
  ESLint initially identified two unused parameters in the new fetch mock;
  those were corrected and both lint and its three transport tests reran
  successfully. Repository-wide lint was not rerun in this contract-only batch;
  its previously recorded unrelated failures remain an external final gate.
- The Bank Account/Payment/Receipt response projections remain unchanged in
  this batch. BN-02's nominal-only Banking compatibility work remains pending
  with BN-01 and BN-05; do not mark all of BN-02 complete yet.
- These are contracts and generated client methods, not mounted server routes.
  There is no new persisted Nominal workflow or changed creation screen yet.
- Safe resume point: BN-01 additive schema and database guards, followed by
  BN-03/BN-04 repository, service, security and runtime wiring. Recheck the
  migration head before adding `0009`; implementation approval already exists.
- Local implementation commits: `8e56f67` (legacy mapping characterization)
  and `e5a5c93` (Finance contracts/generated client). Final `api:check` passed
  again before commit. Push to `origin/shoaib_nexora` was attempted and rejected
  with HTTP 403: GitHub identity `Shoaib6558` lacks repository write access.
  Preserve the local commits; do not alter repository history or credentials.

## 1. Outcome

Deliver one PostgreSQL-backed Nominal workflow for new Cash & Bank accounts.
Every new account receives its own Finance nominal, its own generated nominal
code and exactly one minimal Banking capability. Users enter only company,
name, active currency and an optional description; `Current Assets` and
`Cash & Bank` provide the shared hierarchy.

The same form is rendered from the Finance/Master Data Nominals entry and the
Banking Add Bank Account entry. No browser fixture, duplicate Bank Master,
Branch Master, external account number, IBAN, SWIFT/BIC or opening journal is
introduced.

Completion requires evidence that an approved nominal persists across browser
sessions, is selectable by Bank Payments and Bank Receipts, appears in Account
Balances and is available to Reconciliation's live Bank Account selector, while
preserving all existing Banking identifiers and journals.

## 2. Current evidence and constraints

1. Finance migration `0008` is the current repository head. Implementation
   must recheck the head immediately before creating migration `0009`.
2. Finance `account` is the canonical ledger account. It currently has no
   description, nominal lifecycle evidence or section-specific code allocator.
3. The existing `account.parent_id` relationship is tenant-safe but not
   company-safe. Finance `0005` provides the unique key needed for an additive
   composite company-safe parent foreign key.
4. Platform Currency and Currency Rate are already authoritative. This slice
   reads active currencies and does not create currencies or rates.
5. Existing `bank_account` rows require detailed bank identity and encrypted
   account-number fields. Those rows and their stable IDs must remain intact.
6. Finance `0003` already enforces one Banking extension for each mapped
   Finance account. Finance `0005` enforces the company-safe Banking-to-Finance
   relationship.
7. Existing Payments and Receipts reference `bank_account.id`; therefore a
   minimal Banking extension is required for each new Cash & Bank nominal.
8. Existing Banking projections assume bank name and masked account number are
   present. They must be made backward-compatible for nominal-only identities
   without inventing fake sensitive values.
9. Finance currently exposes posting services only. There is no Finance
   Nominal contract, router, repository, generated client or live view.
10. Finance Nominals and Add Nominal currently render prototype fixtures.
    Banking Add Bank Account is live but requests bank/branch/account/IBAN/
    SWIFT details and maps a pre-existing nominal. It is the replacement target.
11. Finance `0004` validates governed approval override evidence using the
    Banking resource and approval permission. The new Finance workflow must
    preserve that database contract while also writing Finance audit evidence.
12. Repository-wide lint currently has known unrelated failures. Phase-owned
    lint must pass, and the full result must be reported accurately.

## 3. Locked implementation decisions

1. `account` remains the canonical nominal; no parallel nominal table or
   browser-only taxonomy is added.
2. Category and Section are existing Finance header accounts. `Current Assets`
   is the asset Category and `Cash & Bank` is its child Section.
3. First-slice creation is enabled only for Cash & Bank. Authorized accounts
   in other sections may be listed, but their create action remains unavailable
   until their domain rules are approved.
4. The nominal name is the visible account identity. The generated nominal code
   is the business number. There is no external account-number field.
5. A `nominal_only` Banking identity mode permits legacy-only bank fields to be
   absent. Existing records are classified as `legacy_detailed` and retain all
   encrypted data and behavior.
6. Finance owns the shared form and service. Banking receives a narrow
   capability writer operating on the same PostgreSQL transaction client.
7. Finance/Master Data is the canonical route. Banking Add Bank Account renders
   the same component with the Cash & Bank hierarchy fixed; it is not a second
   workflow.
8. Production migration never guesses code prefixes or ranges. A company must
   have an explicit Cash & Bank section code policy before creation is enabled.
9. A UAT provisioner may create reserved synthetic headers, policy and currency
   in a disposable database. It must not alter shared or production data.
10. New managed names are compared case-insensitively within company and
    section. The migration must preflight legacy duplicates before adding any
    broad uniqueness rule; it must never rename records silently.
11. Creation produces an inactive Finance leaf and a draft Banking extension.
    Approval activates both atomically. Rejection leaves Finance inactive.
12. No opening journal is posted. Historical IDs, journals and transactions
    are never rewritten.

## 4. Non-negotiable invariants

1. Do not edit Finance migrations `0001` through `0008`.
2. The browser communicates only through versioned `/api/v1` contracts and the
   generated client; it never accesses PostgreSQL directly.
3. All reads and writes are scoped to the authenticated tenant, selected
   company and exact permissions on the server and in PostgreSQL RLS.
4. Every mutation validates origin/CSRF, blocks impersonated sessions, uses an
   idempotency key and uses optimistic versioning after creation.
5. Caller input cannot set tenant, code, account type, hierarchy authority,
   lifecycle state, actors, posting flags or internal Banking identity.
6. The allocator locks one tenant/company/section policy row, never reuses a
   code and fails closed on missing policy or exhaustion.
7. The Finance account is a postable reconciliable asset leaf beneath the
   approved Cash & Bank header.
8. Each nominal-only Cash & Bank account has exactly one Banking extension and
   one active tenant Currency reference.
9. The Finance name is authoritative. Any compatibility name in Banking is
   synchronized in the same transaction and cannot be independently edited.
10. Ordinary makers cannot decide their own request. The governed global
    `shoaib` super-admin exception requires normal decision permissions,
    `platform.approval.override` and a non-empty reason.
11. Approval, rejection and override evidence are immutable and commit in the
    same transaction as the domain state change.
12. A failure at any point creates or activates neither half of the mapping.
13. Only active approved capabilities appear in Payment, Receipt and the live
    Reconciliation Bank Account selector. Account Balances remains
    ledger-derived; the wider Reconciliation workflow remains prototype-only.
14. Used records cannot be deleted. Deactivation preserves history.
15. API or runtime errors never restore prototype data.

## 5. Dependency graph

| Wave | Slice | Depends on | Deliverable |
| --- | --- | --- | --- |
| 0 | BN-00 | Approved design | Baseline characterization and test scaffolding |
| 1 | BN-01 | BN-00 | Additive Finance `0009` schema and database guards |
| 1 | BN-02 | BN-00 | Contracts, OpenAPI and generated client |
| 2 | BN-03 | BN-01, BN-02 | Atomic Finance Nominal service and Banking capability writer |
| 3 | BN-04 | BN-03 | Authenticated Finance API and composition |
| 4 | BN-05 | BN-04 | Compatible Banking projections and downstream selectors |
| 5 | BN-06 | BN-04 | Live Nominals directory, options and detail |
| 5 | BN-07 | BN-05, BN-06 | One shared Nominal form from Finance and Banking |
| 6 | BN-08 | BN-05 through BN-07 | Approval/status UI and end-to-end consumer integration |
| 7 | BN-09 | BN-00 through BN-08 | Isolated PostgreSQL and Chromium acceptance |
| 7 | BN-10 | BN-09 | Documentation, handoff, commit and push |

Schema and contract work can proceed in the same wave, but migration and
generated-client diffs must be reviewed before backend consumers are merged.
UI work starts only after the service boundary is tested.

## 6. Wave 0 - Baseline characterization and test scaffolding

### BN-00 - Freeze accepted Finance and Banking behavior

**Files**

- Modify: `tests/integration/postgres-migrations.test.ts`
- Modify: `tests/unit/banking-contracts.test.ts`
- Modify: `tests/unit/banking-api-router.test.ts`
- Modify: `tests/unit/banking-client.test.ts`
- Modify: `tests/contract/openapi.test.ts`
- Create: `tests/unit/finance-nominal-service.test.ts`
- Create: `tests/integration/finance-nominals.test.ts`
- Create: `tests/security/finance-nominal-database-security.test.ts`
- Create during later waves: focused Finance Nominal component and Chromium
  tests

**Work**

1. Record the exact migration head and run the accepted Bank Account, Payment,
   Receipt and Finance Posting suites before edits.
2. Characterize stable `bank_account.id` usage in Payment, Receipt, Account
   Balance and Reconciliation contracts and queries.
3. Characterize legacy detailed Bank Account create/read/update behavior so
   the additive identity mode cannot regress it.
4. Prepare focused Finance Nominal expectations for contracts, routes,
   generated methods, schema objects and lifecycle behavior. Observe the
   expected local failures, but keep absent-behavior tests explicitly pending
   until the matching implementation slice lands.
5. Prepare compatibility expectations for a nominal-only Banking projection
   with no bank name or masked external number under the same rule.
6. Commit only passing characterization or explicitly pending scaffolding;
   never leave the branch in a deliberately failing state.
7. Confirm the worktree and stage only phase-owned files.

**Verification**

```powershell
npm.cmd run test:unit -- --run tests/unit/banking-contracts.test.ts tests/unit/banking-api-router.test.ts tests/unit/banking-client.test.ts tests/unit/banking-account-date-projection.test.ts tests/unit/banking-payment-service.test.ts tests/unit/banking-receipt-service.test.ts tests/unit/finance-posting.test.ts
npm.cmd run test:contract -- --run tests/contract/openapi.test.ts
npm.cmd exec vitest -- run --config vitest.integration.config.ts tests/integration/finance-posting.test.ts tests/integration/banking-account-foundation.test.ts tests/integration/banking-payments.test.ts tests/integration/banking-receipts.test.ts
npm.cmd exec vitest -- run --config vitest.security.config.ts tests/security/bank-account-database-security.test.ts tests/security/bank-payment-database-security.test.ts tests/security/bank-receipt-database-security.test.ts
```

Database commands run only against a disposable database configured as in
section 17.

**Gate**

- Existing Finance/Banking behavior passes or unrelated baseline failures are
  documented before implementation.
- Missing-behavior failures have been observed locally, but the committed
  baseline remains green through passing characterization or pending tests.

## 7. Wave 1 - Database authority and contracts

### BN-01 - Add Finance `0009` nominal authority

**Files**

- Create: `packages/db/source-migrations/finance/0009_bank_nominal_master_data.forward.sql`
- Modify: `tests/integration/postgres-migrations.test.ts`
- Create: `tests/security/finance-nominal-database-security.test.ts`

**Work**

1. Recheck the Finance head; rename the migration if another accepted change
   has taken `0009`.
2. Add a bounded nullable `account.description`.
3. Add the company-safe composite parent foreign key after explicit preflight
   rejects any cross-company parent relationship. Do not repair by reassignment.
4. Add a section code-policy/allocator authority keyed by tenant, company and
   Section account. Store a stable `section_role`, prefix, width, allowed range,
   next value, lifecycle status, version and audit timestamps. Enforce numeric/
   range consistency, one active policy per Section and exactly one active
   `cash_and_bank` role per company. The service and database guard recognize
   Cash & Bank by this role, never by a mutable display label.
5. Add immutable Finance Nominal lifecycle/event evidence where existing
   generic platform audit is insufficient for replayable domain history.
6. Add the six `finance.nominal.*` permissions without granting them broadly.
7. Add `bank_account.identity_mode` first with a safe
   `legacy_detailed` default, backfill every existing row, validate the values,
   then make the column mandatory. Existing `/banking/accounts` inserts must
   continue to set or inherit `legacy_detailed`.
8. Drop only the identified legacy-field `NOT NULL` constraints, then replace
   them with validated mode-dependent checks. Detailed rows retain current
   bank/account/encryption requirements; nominal-only rows forbid fake bank
   identity and require the mapped Finance authority and currency.
9. Add a tenant-scoped foreign key from `bank_account.currency` to
   `currency(tenant_id, code)` after preflighting legacy currency values. Block
   deactivation of a Currency while an active nominal-only capability
   references it; approval also revalidates active status under lock.
10. Add database-enforced one-to-one, same-company, Cash & Bank hierarchy and
    reconciliable-leaf guards. Apply synchronized-name and Finance/Banking
    state guards only to `nominal_only` rows so legacy drafts mapped to active
    Finance accounts remain compatible. Use deferrable constraint triggers
    where cross-table transition ordering is required.
11. Ensure the override trigger still accepts the established Banking resource
    and permission evidence for the linked capability decision.
12. Add indexes for company directory, parent/code allocation, pending approval
    and active Banking selector paths.
13. Enable and force RLS on every new authority table, add tenant isolation
    policies, validate company relationships through composite keys/guards and
    cover direct-SQL cross-tenant/company attempts in the security suite.
14. Add preflight failures for duplicate mappings, incompatible legacy rows,
    cross-company parents and code-policy conflicts. Never delete, renumber or
    silently relink deployed records.

**Verification**

```powershell
npm.cmd exec vitest -- run --config vitest.integration.config.ts tests/integration/postgres-migrations.test.ts
npm.cmd exec vitest -- run --config vitest.security.config.ts tests/security/finance-nominal-database-security.test.ts tests/security/bank-account-database-security.test.ts
```

Also apply the entire migration chain twice to a fresh disposable database and
inspect constraints, indexes, RLS policies and permission rows read-only.

**Gate**

- Finance migration history is append-only and repeatability checks pass.
- Existing detailed Bank Accounts remain readable with unchanged IDs.
- Invalid partial or cross-company mappings fail at PostgreSQL, not only in
  application code.

### BN-02 - Add Finance Nominal contracts and generated methods

**Files**

- Create: `packages/contracts/src/finance/index.ts`
- Modify: `packages/contracts/src/index.ts`
- Modify: `packages/contracts/src/openapi-c4.ts`
- Modify: `packages/contracts/src/generate-client-c4.ts`
- Modify: `packages/contracts/src/banking/index.ts`
- Regenerate: `app/lib/api/generated.ts`
- Regenerate: `openapi-v1.json`
- Modify: `tests/unit/banking-contracts.test.ts`
- Create: `tests/unit/finance-contracts.test.ts`
- Modify: `tests/contract/openapi.test.ts`

**Work**

1. Add bounded schemas for options, directory, detail, create, draft update,
   submit, decision and status operations. The options response also returns
   the actor's authorized companies so Finance-only users do not depend on a
   Banking company-directory permission.
2. Add explicit Nominal/Banking identity mode and safe visible projections:
   nominal code, nominal name, currency, lifecycle and capability availability.
3. Keep legacy Banking response fields backward-compatible. Introduce a
   discriminated or additive identity projection so consumers do not require
   fake bank names or masked numbers for `nominal_only` rows.
4. Prevent request schemas from accepting code, account type, postability,
   reconciliation flags, status, actors, tenant or internal IDs.
5. Bound directory search, filters, sort and cursor pagination.
6. Register these operations:
   - `GET /finance/nominals/options`
   - `GET /finance/nominals`
   - `GET /finance/nominals/{nominalId}`
   - `POST /finance/nominals`
   - `PATCH /finance/nominals/{nominalId}`
   - `POST /finance/nominals/{nominalId}/submit`
   - `POST /finance/nominals/{nominalId}/decision`
   - `POST /finance/nominals/{nominalId}/status`
7. Generate the browser client; do not hand-edit generated output.

**Verification**

```powershell
npm.cmd run api:generate
npm.cmd run api:check
npm.cmd run test:unit -- --run tests/unit/finance-contracts.test.ts tests/unit/banking-contracts.test.ts
npm.cmd run test:contract -- --run tests/contract/openapi.test.ts
```

**Gate**

- OpenAPI, runtime schemas and generated client agree.
- Legacy detailed and new nominal-only Bank Account response shapes are both
  validated without exposing encrypted values.

## 8. Wave 2 - Atomic domain implementation

### BN-03 - Implement Finance Nominal service and Banking capability writer

**Files**

- Create: `server/api/src/modules/finance/nominals/types.ts`
- Create: `server/api/src/modules/finance/nominals/source-repository.ts`
- Create: `server/api/src/modules/finance/nominals/service.ts`
- Create: `server/api/src/modules/finance/nominals/index.ts`
- Create: `server/api/src/modules/banking/accounts/source-capability-writer.ts`
- Modify narrowly: `server/api/src/modules/banking/source-repository.ts`
- Modify: `tests/unit/finance-nominal-service.test.ts`
- Modify: `tests/integration/finance-nominals.test.ts`

**Work**

1. Implement company-scoped option, directory and detail queries with bounded
   filters and cursor pagination.
2. Resolve Category and Section by persisted IDs, verify their relationship
   and validate Cash & Bank semantics from the persisted `cash_and_bank`
   section-policy role rather than labels supplied by the browser.
3. Validate active tenant Currency and explicit section code policy.
4. Allocate a code by locking the section policy row. Reject missing policy,
   collision and exhaustion with the standard problem format.
5. In one transaction, insert an inactive postable reconciliable asset leaf,
   then invoke the Banking capability writer with the same `PoolClient` to
   insert the draft `nominal_only` extension.
6. Store idempotent create results only in the same transaction. Replay an
   identical request and reject key reuse with a different payload.
7. Permit name, currency and description updates only in draft. Keep code and
   hierarchy immutable in this slice and synchronize the compatibility name.
8. Submit with maker/reason/version evidence and lock business fields.
9. Decide under row locks. Revalidate hierarchy, active currency, one-to-one
   mapping and both permission families before approval.
10. On approval, activate Finance and Banking together. On rejection, preserve
    Finance inactive and write immutable decision history.
11. Permit governed deactivation only when server rules allow it; inactivate
    both authorities and preserve all references. Do not implement delete.
12. Write one canonical approval-override event using the existing required
    Banking resource `banking.bank_account` and normal permission
    `banking.bank_account.approve`. Reference that event from the Finance
    Nominal lifecycle evidence and platform audit; do not create a second
    competing override event. All evidence commits in the same transaction.
13. Map validation, missing setup, stale version, conflict and permission
    failures without leaking SQL, cross-company existence or sensitive data.

**Verification**

```powershell
npm.cmd run test:unit -- --run tests/unit/finance-nominal-service.test.ts
npm.cmd exec vitest -- run --config vitest.integration.config.ts tests/integration/finance-nominals.test.ts
npm.cmd exec vitest -- run --config vitest.security.config.ts tests/security/finance-nominal-database-security.test.ts
```

**Gate**

- Two simultaneous creates allocate distinct codes.
- Injected failures, stale versions and changed-payload replays leave no
  partial Finance/Banking state.
- Maker/checker and governed super-admin paths produce exact audit evidence.

## 9. Wave 3 - API composition and server authorization

### BN-04 - Expose the authenticated Finance API

**Files**

- Create: `server/api/src/modules/finance/router.ts`
- Create: `tests/unit/finance-api-router.test.ts`
- Modify: `server/api/src/app.ts`
- Modify: `server/api/src/server.ts`
- Modify as required: API readiness/table checks in `server/api/src`
- Modify: `tests/contract/openapi.test.ts`
- Modify: `scripts/provision-shoaib-admin.ts`
- Modify: `tests/integration/shoaib-super-admin-provisioning.test.ts`

**Work**

1. Mount the Finance Nominal router under `/api/v1/finance`.
2. Apply existing cookie session, trusted-origin, CSRF, company-selection,
   idempotency and standard problem middleware conventions.
3. Enforce exact `finance.nominal.*` permissions for all routes.
4. For Cash & Bank create, update, submit, decision and status transitions,
   enforce the corresponding existing `banking.bank_account.*` permission in
   addition to the Finance permission.
5. Block impersonated mutations and cross-company access before repository
   execution.
6. Preserve ordinary maker/checker separation. Allow the global `shoaib`
   override only through the existing governed mechanism with reason and
   immutable evidence; do not grant posting/reversal privileges implicitly.
7. Because new permission definitions do not auto-expand existing role grants,
   add a controlled provisioning/update step for the `shoaib` global
   super-admin role and prove it with
   `tests/integration/shoaib-super-admin-provisioning.test.ts`. Do not grant
   Finance Nominal permissions to other roles implicitly.
8. Wire repositories/services through existing composition patterns and add
   new schema authorities to readiness checks without exposing infrastructure
   details.
9. Add route tests for validation, denial, not-found masking, conflicts,
   idempotent replay and problem responses.

**Verification**

```powershell
npm.cmd run test:unit -- --run tests/unit/finance-api-router.test.ts tests/unit/finance-nominal-service.test.ts
npm.cmd run test:contract -- --run tests/contract/openapi.test.ts
npm.cmd exec vitest -- run --config vitest.integration.config.ts tests/integration/shoaib-super-admin-provisioning.test.ts
npm.cmd run typecheck
```

**Gate**

- All eight endpoints use the generated contract and standard middleware.
- No Finance permission or company decision exists only in browser code.

## 10. Wave 4 - Backward-compatible Banking consumers

### BN-05 - Support nominal-only identities throughout Banking

**Files**

- Modify: `server/api/src/modules/banking/source-repository.ts`
- Modify relevant Bank Account, Payment and Receipt repository projections
  under `server/api/src/modules/banking`
- Modify: `packages/contracts/src/banking/index.ts`
- Regenerate: `app/lib/api/generated.ts`
- Modify relevant Bank Account, Payment, Receipt, Account Balance and
  Reconciliation views under `app/features/banking`
- Modify: `app/features/banking/views/banking-reconciliation.tsx`
- Create: `tests/unit/banking-reconciliation-account-options.test.tsx`
- Modify associated unit, integration and component tests

**Work**

1. Return the Finance nominal code/name/currency for both identity modes.
2. For legacy detailed rows, retain authorized bank name, branch and masked
   number output exactly as before.
3. For nominal-only rows, render `code - name` and currency. Do not fabricate
   bank name, branch, external number or mask.
4. Update selector labels, list cells, detail facts and accessible names to
   understand both modes.
5. Keep `bank_account.id` as the value passed by Payment, Receipt and
   Reconciliation clients; never switch transaction foreign keys to display
   code.
6. Keep Account Balances mapped to canonical `account.id` and posted journals.
7. Filter inactive, draft, rejected and closed capabilities from transaction
   selectors on the server.
8. Replace only Reconciliation's local Bank Account selector fixture by calling
   the existing `GET /api/v1/banking/accounts` boundary with `state=active`
   under `banking.bank_account.read`. Integrate the result directly in
   `banking-reconciliation.tsx` or a distinctly named live selector component,
   and retain `bank_account.id` as the selected value. If the previous fixture
   selection is absent from the live result, require an explicit new selection;
   never silently select the first live account. Keep statement rows, matching
   and reconciliation actions explicitly prototype-only and visibly labelled;
   this slice does not claim the Reconciliation workflow is production-backed.
9. Preserve all legacy routes and response semantics except for compatible
   additive projection fields.

**Verification**

```powershell
npm.cmd run api:check
npm.cmd run test:unit -- --run tests/unit/banking-contracts.test.ts tests/unit/banking-client.test.ts tests/unit/banking-payment-service.test.ts tests/unit/banking-receipt-service.test.ts tests/unit/banking-reconciliation-account-options.test.tsx
npm.cmd exec vitest -- run --config vitest.integration.config.ts tests/integration/banking-account-foundation.test.ts tests/integration/banking-payments.test.ts tests/integration/banking-receipts.test.ts tests/integration/finance-posting.test.ts
npm.cmd exec vitest -- run --config vitest.security.config.ts tests/security/bank-account-database-security.test.ts tests/security/bank-payment-database-security.test.ts tests/security/bank-receipt-database-security.test.ts
```

**Gate**

- Legacy detailed accounts render unchanged.
- Approved nominal-only accounts appear with truthful labels and stable IDs in
  every supported downstream selector.

## 11. Wave 5 - Live Finance/Master Data user interface

Before this wave, read the relevant Next 16 guides in
`node_modules/next/dist/docs/` and follow current repository UI conventions.

### BN-06 - Replace Nominal fixtures with live directory and detail

**Files**

- Create: `app/features/finance/api/finance-nominals-client.ts`
- Create: `app/features/finance/views/finance-nominals.tsx`
- Create: `app/features/finance/views/finance-nominal-detail.tsx`
- Create focused components under `app/features/finance/components` only when
  reused within the feature
- Modify: `app/shell/prototype-content.tsx`
- Modify minimally: `app/shell/config/prototype-data.ts`
- Create/modify focused client and component tests

**Work**

1. Add one typed browser adapter over the generated Finance client.
2. Load authorized companies, hierarchy options and active currencies from the
   Finance Nominal options endpoint, then load Nominals through real endpoints.
3. Replace fixture fallback for `nominals` and `nominal-detail` with live views.
4. Group postable leaves under Category and Section and show code, name,
   currency, lifecycle and Banking availability.
5. Provide bounded search, filters, sort and pagination backed by API query
   parameters.
6. Implement loading, empty, setup-required, permission-denied, not-found,
   stale/conflict, retryable error and success states.
7. Keep Currencies, Currency Rates and hierarchy directories read-only if no
   governed write APIs exist; label unavailable maintenance truthfully.
8. Treat Finance Chart of Accounts as the authoritative Master Data surface.
   Any “Master Data” entry is a navigation alias to this view, not a duplicate
   module or store.
9. Preserve responsive table/detail behavior, focus visibility, semantic
   headings and keyboard navigation.

**Verification**

```powershell
npm.cmd run test:unit -- --run tests/unit/finance-nominals-client.test.ts tests/unit/finance-nominals-view.test.tsx tests/unit/finance-nominal-detail.test.tsx
npm.cmd run typecheck
npm.cmd exec eslint -- app/features/finance app/shell/prototype-content.tsx app/shell/config/prototype-data.ts
npm.cmd run build:web
```

**Gate**

- Nominal routes have no fixture fallback.
- Directory/detail states are accessible and company-scoped.

### BN-07 - Implement the one shared Nominal form

**Files**

- Create: `app/features/finance/views/finance-nominal-form.tsx`
- Create focused form components under `app/features/finance/components`
- Modify: `app/shell/prototype-content.tsx`
- Modify minimally: `app/features/banking/views/banking-account-governance.tsx`
- Create: `tests/unit/finance-nominal-form.test.tsx`
- Create: `tests/unit/banking-account-governance.test.tsx`

**Work**

1. Render the same Finance-owned form for `add-nominal` and
   `add-bank-account`; do not duplicate state or request mapping.
2. From Banking, fix Category to Current Assets and Section to Cash & Bank.
   From Nominals, allow authorized hierarchy navigation but enable creation
   only when the selected Section is Cash & Bank.
3. Show only company, category, section, name, active currency, optional
   description and read-only allocated code after save.
4. Remove bank, branch, external account number, IBAN, SWIFT/BIC, overdraft and
   opening-balance controls from the new creation route.
5. Implement separate Save Draft and Save & Submit actions with stable
   idempotency keys and optimistic version handling.
6. Preserve safe entered values after validation errors; focus the first
   invalid field and give actionable setup/conflict messages.
7. Add an unsaved-navigation guard and explicit submitting/success states.
8. Use existing shadcn primitives and Tailwind. Add no new feature stylesheet
   and no dependency.
9. Preserve the legacy Bank Account implementation only where existing detail
   compatibility still needs it; remove its creation route only after the
   shared form passes acceptance.

**Verification**

```powershell
npm.cmd run test:unit -- --run tests/unit/finance-nominal-form.test.tsx tests/unit/banking-account-governance.test.tsx
npm.cmd run typecheck
npm.cmd exec eslint -- app/features/finance/views/finance-nominal-form.tsx app/features/finance/components app/shell/prototype-content.tsx app/features/banking/views/banking-account-governance.tsx
npm.cmd run build:web
```

**Gate**

- Both navigation entries render one component and issue the same API request.
- No removed banking detail is requested, simulated or stored for a new
  nominal-only account.

## 12. Wave 6 - Approval, status and ERP integration

### BN-08 - Complete governed lifecycle and downstream visibility

**Files**

- Modify: `app/features/finance/views/finance-nominal-detail.tsx`
- Create if warranted: `app/features/finance/views/finance-nominal-approvals.tsx`
- Modify: `app/shell/prototype-content.tsx`
- Modify relevant Banking approval/detail routes only to converge on the same
  persisted record and capability
- Modify focused unit/component/integration/E2E tests

**Work**

1. Add persisted draft edit, submit, pending queue, approve/reject and
   deactivate actions to Finance detail/approval views.
2. Apply state and permission gating from server-returned capabilities while
   retaining server-side enforcement as authority.
3. Show the ordinary maker/checker prohibition. For the governed `shoaib`
   override, show a clear warning and require a business reason.
4. Require confirmation and reason for rejection/deactivation; accurately
   display stale-version and permission failures.
5. Show immutable lifecycle and audit summaries without exposing secrets or
   internal infrastructure.
6. Prove the approved nominal-only capability appears in live Payment, Receipt
   and Account Balance screens and in Reconciliation's live Bank Account
   selector after refresh/new session. Do not describe the wider
   Reconciliation worksheet as live.
7. Prove rejected, draft and inactive records do not appear in transaction
   selectors.
8. Post one Payment and one Receipt using the new capability through their
   existing services; verify balanced journals and ledger-derived balance.
9. Preserve the approved Bank Payment/Receipt lifecycle, approval, posting and
   reversal rules without adding a second accounting engine.

**Verification**

```powershell
npm.cmd run test:unit -- --run tests/unit/finance-nominal-service.test.ts tests/unit/finance-nominal-detail.test.tsx tests/unit/finance-nominal-approvals.test.tsx tests/unit/banking-payment-service.test.ts tests/unit/banking-receipt-service.test.ts
npm.cmd exec vitest -- run --config vitest.integration.config.ts tests/integration/finance-nominals.test.ts tests/integration/banking-payments.test.ts tests/integration/banking-receipts.test.ts tests/integration/finance-posting.test.ts
npm.cmd exec vitest -- run --config vitest.security.config.ts tests/security/finance-nominal-database-security.test.ts tests/security/bank-payment-database-security.test.ts tests/security/bank-receipt-database-security.test.ts
npm.cmd run typecheck
npm.cmd run build:web
```

**Gate**

- Approval activates Finance and Banking atomically.
- Real Payment/Receipt posting against the new account remains balanced and
  Account Balances is ledger-derived.

## 13. Wave 7 - Acceptance and handoff

### BN-09 - Verify browser to PostgreSQL on an isolated environment

**Files**

- Create: `scripts/provision-bank-nominals-uat.ts`
- Modify: `package.json`
- Create: `tests/e2e/bank-nominals.spec.ts`
- Modify focused regression tests only when evidence requires it

**Work**

1. Add `uat:provision-bank-nominals` following existing UAT provisioner
   conventions. It may create only reserved synthetic tenant/company/users,
   active currency, Current Assets/Cash & Bank headers, section code policy,
   permissions and Finance authority needed for acceptance.
2. Fail closed if reserved identities conflict; do not print secrets.
3. Create a fresh disposable PostgreSQL database and apply every migration.
   Never reset, truncate or modify a shared or production database.
4. Start API and web against that database and observe readiness.
5. In Chromium, create two accounts from the Finance and Banking entries and
   confirm distinct nominal IDs/codes, common hierarchy and one extension each.
6. Reload and open a new authenticated session to prove persistence.
7. Exercise independent maker/checker approval and the governed `shoaib`
   override with reason.
8. Verify a restricted user receives a permission-denied state and cannot
   mutate by direct API request.
9. Verify duplicate, cross-company, concurrent allocation, idempotency replay,
   changed-payload conflict, stale version and injected rollback cases.
10. Verify active selector presence and inactive selector absence across
    Payment, Receipt and the live Reconciliation Bank Account selector.
11. Post one synthetic Payment and Receipt and inspect read-only PostgreSQL
    evidence for balanced journals, correct account mapping and audit events.
12. Verify 390px and desktop usability, labels, keyboard order, focus and
    unsaved-navigation behavior.
13. Re-run legacy Bank Account, Payment, Receipt, Finance Posting and migration
    suites.

**Verification**

```powershell
npm.cmd run db:migrate:source
npm.cmd run uat:provision-bank-nominals
npm.cmd run test:unit -- --run tests/unit/finance-contracts.test.ts tests/unit/finance-nominal-service.test.ts tests/unit/finance-api-router.test.ts tests/unit/finance-nominals-client.test.ts tests/unit/finance-nominals-view.test.tsx tests/unit/finance-nominal-form.test.tsx tests/unit/finance-nominal-detail.test.tsx
npm.cmd run test:contract -- --run tests/contract/openapi.test.ts
npm.cmd exec vitest -- run --config vitest.integration.config.ts tests/integration/postgres-migrations.test.ts tests/integration/finance-nominals.test.ts tests/integration/finance-posting.test.ts tests/integration/banking-account-foundation.test.ts tests/integration/banking-payments.test.ts tests/integration/banking-receipts.test.ts tests/integration/shoaib-super-admin-provisioning.test.ts
npm.cmd exec vitest -- run --config vitest.security.config.ts tests/security/finance-nominal-database-security.test.ts tests/security/bank-account-database-security.test.ts tests/security/bank-payment-database-security.test.ts tests/security/bank-receipt-database-security.test.ts
npm.cmd run test:e2e -- tests/e2e/bank-nominals.spec.ts
npm.cmd run api:check
npm.cmd run typecheck
npm.cmd run build:web
git diff --check
```

Run targeted ESLint over every phase-owned TypeScript/TSX file. Run full
`npm.cmd run lint` separately and report any pre-existing repository failures
without describing the repository as lint-clean.

**Gate**

- Every criterion in section 16 has observed automated, browser and/or
  read-only PostgreSQL evidence.
- No shared or production data was changed.

### BN-10 - Documentation, safe handoff and push

**Files**

- Update: this implementation plan with completion checkpoints and exact
  observed evidence after each slice
- Update: `docs/architecture/remaining-ui-migration.md`
- Update applicable Banking/Finance/HR integration handoff documentation only
  where the implemented dependency actually changes it

**Work**

1. Record implemented behavior, exact verification counts/results, unresolved
   external failures and safe resume points after every slice.
2. Document local URLs, required services, non-secret environment variable
   names and exact startup/test commands.
3. Confirm no prototype badge or fixture fallback remains on accepted routes.
4. Review `git diff --check`, status and staged files; exclude unrelated user
   work and local environment artifacts.
5. Commit in reviewable slice-sized commits and push the current branch. If
   remote authorization fails, preserve local commits and report the exact
   failure; never rewrite history or credentials.

**Gate**

- The handoff identifies all working routes, permissions, accepted workflows,
  explicit deferrals and safe next work.
- Git history contains only reviewed phase-owned changes.

## 14. Planned commit sequence

1. `test(finance): characterize current bank nominal boundaries`
2. `feat(db): add governed bank nominal authority`
3. `feat(contracts): add finance nominal api`
4. `feat(finance): implement nominal lifecycle service`
5. `feat(api): expose finance nominal routes`
6. `feat(banking): support nominal-only account identity`
7. `feat(finance-ui): add live nominal directory and detail`
8. `feat(finance-ui): share bank nominal creation form`
9. `feat(finance-ui): complete nominal approval integration`
10. `test(finance): verify bank nominal acceptance`
11. `docs(finance): complete bank nominal handoff`

Generated contract artifacts are committed with the contract slice. Migration
and generated files are never mixed with unrelated formatting churn.

## 15. Rollback and failure policy

1. Before production use, application commits may be reverted while retaining
   the additive migration if removing schema would risk deployed data.
2. No destructive down migration is run against a database containing nominal
   records, Banking transactions or journals.
3. Feature visibility may be disabled through existing navigation/permission
   controls while preserving records and read compatibility.
4. Old `/api/v1/banking/accounts` reads and stable IDs remain available during
   rollout. Its legacy create route is not removed until the shared form and
   all downstream consumers pass acceptance.
5. A failed migration preflight stops deployment and produces an operator-safe
   report; it never repairs cross-company or duplicate data automatically.
6. A failed create/approval transaction rolls back account, capability,
   idempotency and audit writes together.

## 16. Completion criteria

The Bank Nominal/Master Data slice is complete only when all are true:

1. Contracts, OpenAPI and generated client agree.
2. Finance migration `0009` (or the next verified number) applies on a fresh
   isolated database and migration integrity tests pass.
3. Two Cash & Bank creations produce distinct Finance IDs and codes beneath the
   same persisted Current Assets/Cash & Bank headers.
4. Each has exactly one nominal-only Banking extension and one active Currency
   Master reference.
5. Legacy detailed Bank Accounts retain IDs, encrypted data, routes and visible
   behavior.
6. Concurrent allocation, duplicate mapping, cross-company access, missing
   setup, idempotency conflict, stale version and injected failure are safe.
7. Draft, update, submit, independent approval, rejection, governed super-admin
   override and deactivation have automated evidence.
8. Approval/deactivation changes Finance and Banking atomically and writes
   immutable lifecycle/platform audit evidence.
9. Finance/Master Data and Banking render the same shared form.
10. The form requests no bank name, branch, external account number, IBAN,
    SWIFT/BIC, overdraft or opening balance.
11. Approved accounts appear in Payment, Receipt and Account Balance live views
    and the Reconciliation live Bank Account selector; non-active accounts do
    not appear in transaction selectors. The wider Reconciliation workflow
    remains clearly prototype-only.
12. A real Payment and Receipt post balanced journals against the new nominal;
    creation itself posts no journal.
13. Persistence survives page reload, API restart and a new authenticated
    session.
14. Permission denial, validation, loading, empty, setup-required, conflict,
    error and success states are observed.
15. Chromium verifies both entry points, approval, restriction and narrow
    layout against PostgreSQL-backed services.
16. `api:check`, focused tests, migration/security tests, typecheck,
    phase-owned lint, production build and `git diff --check` pass.
17. Any unrelated full-repository lint failure is recorded accurately and is
    not attributed to or hidden by this phase.

## 17. Isolated database and runtime rules

1. Use a fresh disposable database whose name clearly identifies Bank Nominal
   UAT and the run date/time.
2. Point only the UAT API process and test commands at that database.
3. Confirm the selected database name and host before migration/provisioning.
4. Do not use a production, shared developer or HR acceptance database.
5. Provision only synthetic data and never print passwords, connection strings,
   encrypted banking material or session cookies.
6. Use the repository's normal startup commands:

```powershell
npm.cmd run dev:api
npm.cmd run dev:web
```

7. Default local routes are expected to remain:
   - Web: `http://127.0.0.1:3000`
   - Finance Nominals: `http://127.0.0.1:3000/#/finance/nominals` or the exact
     existing shell hash route confirmed during implementation
   - Banking Add Bank Account: the existing `add-bank-account` shell route,
     confirmed from `prototype-data.ts` before reporting a URL
   - API: use the configured local API origin; verify it from repository
     configuration rather than hardcoding an unconfirmed port

## 18. Explicit deferrals

This plan does not implement:

- Bank or Branch Master;
- external bank account numbers, IBAN or SWIFT/BIC;
- opening balances or opening journals;
- Currency or Currency Rate write APIs;
- generalized creation rules for non-Cash & Bank nominal types;
- deletion of accounts referenced by Finance or Banking history;
- customer allocation, statement import, reconciliation matching or
  reconciliation posting changes (only its Bank Account selector becomes live);
- a duplicate accounting engine or Next.js API backend; or
- automatic repair of legacy hierarchy or mapping inconsistencies.

Those items require separate approved designs if they become requirements.

## 19. Safe resume point

BN-00 baseline evidence and the Finance contract portion of BN-02 are captured
in the checkpoint above. Continue with BN-01 after rechecking the worktree and
Finance migration head. Complete nominal-only Banking response compatibility
alongside BN-05 before marking BN-02 fully complete. The user has approved
implementation; no additional design-approval round is required for these
planned slices. Keep unfinished Finance UI routes visibly prototype-only until
their server and browser acceptance gates pass.
