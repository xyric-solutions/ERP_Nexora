# Bank Transfers and Currency Master Production Implementation Plan

- Status: approved design; implementation ready
- Date: 2026-10-22
- Approved design: `../specs/2026-10-22-bank-transfers-production-design.md`
- Production surfaces: Bank Transfers directory, Add/Edit Bank Transfer,
  persisted Transfer detail, Currency Master, Currency Rates and Transfer/FX
  Policy
- Banking authority: `server/api/src/modules/banking/transfers`
- Finance configuration authority: `server/api/src/modules/finance/currencies`
- Posting authority: `server/api/src/modules/finance/posting`
- Planned additive migrations: Platform 0010, Security 0017 and Finance 0026

## 1. Outcome

Deliver a PostgreSQL-backed, same-company Bank Transfer workflow. Authorized
users can create and revise a multi-line draft, submit it, obtain an independent
or governed delegated decision, explicitly post one atomic balanced journal and
create a compensating reversal. Same- and cross-currency lines are supported
through governed, effective-dated rates and a company Transfer/FX policy.

The Transfer routes must use the generated client with no fixture fallback. The
entry grid must follow the approved screenshot while resolving Bank control and
supporting FX nominals through server-owned Finance configuration.

Deliver governed Currency Master, Currency Rates and Transfer/FX Policy screens
and APIs. Catalog availability must not silently activate tenant currencies or
change a base currency.

## 2. Current evidence and constraints

1. Platform 0009, Security 0016 and Finance 0025 are the current migration
   heads. New schema work uses Platform 0010, Security 0017 and Finance 0026;
   implementation must recheck these heads immediately before file creation.
2. `currency` and `currency_rate` already exist. Payments and Receipts select
   direct non-base-to-base rates under an advisory lock. Their behavior and
   historical rate evidence must remain compatible.
3. Bank Account, Finance nominal, fiscal-period, Finance posting and Bank
   workflow-context authorities already exist and must be reused.
4. The Transfers list, entry and detail are fixture/presentation-only today.
   No live Transfer contract or backend module exists.
5. The working tree contains extensive user-owned Banking/Finance changes,
   including untracked migration and test files. Do not reset, delete, stage or
   reformat unrelated work.
6. `SourceBankingRepository` and the Payment/Receipt repositories are already
   large. Transfer and Currency SQL receive focused modules.
7. No external FX provider is approved. Rates come only from the governed
   tenant Currency Rates master.

## 3. Non-negotiable invariants

1. A Transfer moves funds only between two distinct active Bank Accounts in
   the same tenant and company.
2. Users select Bank Accounts, never raw Bank control nominals. The server
   resolves and snapshots approved control mappings.
3. Cross-company transfers and intercompany accounting are rejected.
4. Draft, submit, decision, post and reverse are distinct idempotent actions.
   Approve & Close never posts.
5. Banking owns capture/lifecycle; Finance owns rate validation, period checks,
   fixed-scale arithmetic, journal persistence and reversal.
6. The repository opens one transaction and passes its `PoolClient` to Finance;
   every multi-line posting succeeds or rolls back as one unit.
7. Every mutation requires authentication, CSRF, exact permission, company
   access, optimistic version and idempotency key. Disallowed impersonation
   remains blocked.
8. Ordinary makers cannot approve their own Transfers. Existing governed
   delegated/global override evidence is reused without broadening it.
9. Submitted business facts, rate snapshots and posted Finance facts are
   immutable. Corrections use new rate revisions or compensating reversal.
10. Decimal strings cross API boundaries. Browser number arithmetic is
    display-only and never authorizes persisted conversions or balance.
11. A batch has 1-200 lines. Mixed-currency totals are grouped by source
    currency and include a separately labelled base total.
12. Currency catalog adoption never changes the tenant base currency.
13. Currency/rate/policy dependency failures are explicit; no suspense or
    hidden balancing line is generated.
14. API failure never restores prototype data.
15. Historical migrations are never edited.

## 4. Dependency graph

| Wave | Slice | Depends on | Deliverable |
| --- | --- | --- | --- |
| 0 | BT-00 | Approved design | Baseline and failure-first characterization |
| 1 | BT-01 | BT-00 | Currency/Transfer contracts, OpenAPI and generated client |
| 1 | BT-02 | BT-00 | Platform 0010, Security 0017 and Finance 0026 schema |
| 2 | BT-03 | BT-01, BT-02 | Currency/Rate/Policy repository, service and API |
| 2 | BT-04 | BT-01, BT-02 | Transfer repository/service and atomic Finance integration |
| 3 | BT-05 | BT-03, BT-04 | Authenticated routes and API composition |
| 4 | BT-06 | BT-05 | Browser adapters and shell routing |
| 5 | BT-07 | BT-06 | Currency/Rate/Policy management UI |
| 5 | BT-08 | BT-06 | Live Transfer directory and screenshot-aligned entry |
| 5 | BT-09 | BT-06 | Persisted Transfer detail and lifecycle actions |
| 6 | BT-10 | BT-00 through BT-09 | Security, integration and isolated browser acceptance |
| 6 | BT-11 | BT-10 | Documentation and safe handoff |

Contract generation and migrations are serialized. Backend/UI code must not
depend on generated methods or columns before their focused checks pass.

## 5. Wave 0 - Baseline and failure-first tests

### BT-00 - Characterize accepted boundaries

**Files**

- Modify: `tests/unit/banking-contracts.test.ts`
- Modify: `tests/unit/banking-api-router.test.ts`
- Modify: `tests/unit/banking-client.test.ts`
- Modify: `tests/unit/finance-contracts.test.ts`
- Modify: `tests/contract/openapi.test.ts`
- Modify: `tests/integration/postgres-migrations.test.ts`
- Create: `tests/unit/banking-transfer-service.test.ts`
- Create: `tests/integration/banking-transfers.test.ts`
- Create: `tests/security/bank-transfer-database-security.test.ts`
- Create: `tests/integration/finance-currencies.test.ts`
- Create: `tests/security/finance-currency-database-security.test.ts`

**Work**

1. Run focused Payment/Receipt, Finance posting, nominal and period suites.
2. Add failing expectations for strict Transfer/Currency contracts, routes,
   generated methods, migration heads and service boundaries.
3. Characterize the current Transfer fixture routes and screenshot semantics.
4. Record the no-prototype-fallback, same-company and no-raw-control-nominal
   invariants in tests.

**Gate**

- Existing focused suites pass or unrelated failures are recorded.
- New tests fail only because Transfer/Currency behavior is absent.

## 6. Wave 1 - Contracts and additive schema

### BT-01 - Add strict contracts, OpenAPI and generated methods

**Files**

- Modify: `packages/contracts/src/banking/index.ts`
- Create: `packages/contracts/src/finance/currencies.ts`
- Modify: `packages/contracts/src/finance/index.ts`
- Modify: `packages/contracts/src/openapi-c4.ts`
- Modify: `packages/contracts/src/generate-client-c4.ts`
- Modify: `packages/contracts/src/index.ts` if exports require it
- Regenerate: `app/lib/api/generated.ts`
- Regenerate: `openapi-v1.json`
- Update focused contract/client/OpenAPI tests

**Transfer contracts**

1. Add state, mode, line, create/update, lifecycle, directory, detail,
   accounting-preview, grouped-total and mutation-result schemas.
2. Keep Bank IDs and entered source amounts as inputs. Return server-derived
   currencies, destination amount, rate snapshots, control nominal summaries,
   base amounts and disclosed differences.
3. Reuse Bank workflow input/detail contracts for Project, Location, approver,
   assignment and governed self-approval evidence.
4. Bound all strings, decimals, line counts, filters and cursor values.

**Currency contracts**

1. Add catalog/adopted-currency directories, adoption/status mutations and
   audit projections.
2. Add rate directory/create/correction/status contracts with effective dates,
   version and supersession evidence.
3. Add company Transfer/FX policy read/create/update contracts using nominal IDs
   and optimistic versions.

**Gate**

- Contract unit and OpenAPI tests pass.
- `npm.cmd run api:generate` produces a reviewed, deterministic diff.
- `npm.cmd run api:check` passes before consumers are written.

### BT-02 - Add database authority and security guards

**Files**

- Create: `packages/db/source-migrations/platform/0010_currency_master_governance.forward.sql`
- Create: `packages/db/source-migrations/security/0017_bank_transfer_permissions.forward.sql`
- Create: `packages/db/source-migrations/finance/0026_bank_transfers_and_fx_policy.forward.sql`
- Update migration/security tests only; migration discovery remains automatic

**Platform 0010**

1. Add immutable standard currency catalog and verified major-currency rows.
2. Add tenant currency adoption/status audit evidence.
3. Add compatible rate revision/status/version/audit columns and tables,
   backfilling existing rates without changing their value/effective date.
4. Preserve a single current revision per pair/effective date and existing
   Payment/Receipt rate selection.

**Security 0017**

1. Add exact Transfer lifecycle/reassignment permissions.
2. Extend Bank self-approval kind constraints to `transfer` without changing
   existing Payment/Receipt grants.
3. Add Currency/Rate/Policy management permission only where an existing
   capability is insufficient.

**Finance 0026**

1. Add versioned company Transfer/FX policy and events.
2. Add Transfer header, line, event, sequence, assignment and posting-link
   persistence.
3. Add same-company, source/destination inequality, active Bank/control mapping,
   currency/rate/policy evidence, lifecycle and immutability guards.
4. Add tenant isolation/RLS and bounded directory indexes.

**Gate**

- Fresh isolated migration reaches Platform 10, Security 17 and Finance 26.
- Upgrade migration preserves existing currency/rate and Payment/Receipt rows.
- Security tests prove database guards independently from API validation.

## 7. Wave 2 - Backend authorities

### BT-03 - Currency, Rate and Transfer/FX Policy service

**Files**

- Create: `server/api/src/modules/finance/currencies/service.ts`
- Create: `server/api/src/modules/finance/currencies/source-repository.ts`
- Modify: `server/api/src/modules/finance/router.ts`
- Modify API composition/dependency files only where required
- Add focused unit/integration/security tests

**Work**

1. Implement scoped catalog/adopted lists, idempotent adoption and dependency-
   aware status changes.
2. Implement append/revision rate workflow under the existing currency-pair
   advisory lock.
3. Implement policy read/create/update with company scope, nominal eligibility,
   optimistic version and immutable events.
4. Return standard problem errors and correlation evidence without SQL detail.

### BT-04 - Transfer lifecycle, conversion and posting

**Files**

- Create: `server/api/src/modules/banking/transfers/service.ts`
- Create: `server/api/src/modules/banking/transfers/source-repository.ts`
- Reuse: Banking decision/workflow helpers and Finance posting service
- Add focused unit/integration tests

**Work**

1. Implement options, bounded directory, persisted detail and draft mutation.
2. Resolve same-company Bank Accounts and Bank control nominals server-side.
3. Under locks, resolve source/destination rates, perform fixed-scale conversion,
   derive destination amount and classify FX/rounding difference.
4. Snapshot rate, policy and nominal evidence on draft save; freeze on submit.
5. Implement submit, decision, approver reassignment, post and reverse with the
   exact Payment/Receipt governance model.
6. Build one balanced Finance command for all lines and optional charges; use
   the same database transaction for lifecycle and journal evidence.

**Gate**

- Same-currency, base/non-base and non-base/non-base cases pass.
- Missing rate/policy, stale version, closed period and partial-line failures
  roll back fully.
- Posted/reversed ledger evidence reconciles exactly.

## 8. Wave 3 - Routes and composition

### BT-05 - Add authenticated API routes

**Files**

- Modify: `server/api/src/modules/banking/router.ts`
- Modify: `server/api/src/modules/finance/router.ts`
- Modify: `server/api/src/app.ts`, `server/api/src/server.ts` only for explicit
  dependency injection
- Update router/composition tests

**Work**

1. Add the approved `/api/v1/banking/transfers` operations.
2. Add Currency/Rate/Policy Finance operations.
3. Apply session, CSRF, origin, permission, idempotency and If-Match conventions.
4. Set no-store and ETag behavior consistently with Banking/Finance peers.

## 9. Wave 4 - Browser adapters and routing

### BT-06 - Typed clients and live route ownership

**Files**

- Modify: `app/features/banking/api/banking-client.ts`
- Extend the existing Finance client under `app/features/finance/api`
- Modify: `app/shell/prototype-content.tsx`
- Modify shell page/record typing only where required
- Add focused adapter/routing tests

**Work**

1. Wrap generated Transfer/Currency methods without duplicating schemas.
2. Give persisted Transfer IDs stable route identity.
3. Route Transfers, Add Transfer and persisted detail to live views.
4. Route Currency Master/Rate/Policy pages from existing Finance master-data
   navigation or add the minimal explicit pages if none exist.
5. Retain prototype engine for unrelated Banking screens.

## 10. Wave 5 - Production UI

### BT-07 - Currency configuration workspace

**Files**

- Create focused views under `app/features/finance/views`
- Reuse existing `Button`, `Input`, `Dialog`, `Badge`, tables and shared
  searchable selectors
- Add component tests

**Work**

1. Build catalog/adoption and adopted Currency Master states.
2. Build effective-dated Rate directory/create/correction/status states.
3. Build company Transfer/FX Policy nominal selectors and version conflicts.
4. Cover loading, empty, denied, validation, conflict, success and retry states.

### BT-08 - Transfer directory and screenshot-aligned entry

**Files**

- Create: `app/features/banking/views/banking-transfers.tsx`
- Create: `app/features/banking/views/banking-transfer-entry.tsx`
- Add directory/entry component tests

**Work**

1. Build the real server directory using Payment/Receipt list patterns.
2. Implement the approved grid columns exactly: Date, From Bank, Ref. No., Mode,
   To Bank, Details, Amount and Remove.
3. Use searchable Bank selectors showing masked identity, currency and control
   nominal; exclude the selected source from destination options.
4. Add one Details textarea, source-currency amount, conditional conversion
   evidence and on-demand charge disclosure.
5. Show one total for one source currency or grouped plus base totals for mixed
   batches.
6. Preserve Add More, Cancel, dirty guard, Save Draft, Submit and eligible
   Approve & Close behavior. No entry action posts.
7. Keep the table locally scrollable and actions usable at 390px.

### BT-09 - Persisted Transfer detail

**Files**

- Create: `app/features/banking/views/banking-transfer-detail.tsx`
- Add detail/lifecycle component tests

**Work**

1. Show Bank identities, dual-currency amounts, rate/policy snapshots and the
   server accounting preview.
2. Implement permission/state-gated edit, submit, decision, reassignment, post
   and reversal with stable retry keys.
3. Preserve explicit posting/reversal confirmations and immutable timeline.

## 11. Wave 6 - Acceptance and handoff

### BT-10 - Isolated end-to-end proof

1. Provision a new disposable PostgreSQL database and synthetic tenant/company,
   Bank Accounts, active currencies, rates, policy nominals and exact roles.
2. Run same-currency and cross-currency maker/checker/poster/reversal browser
   workflows through the real API.
3. Verify read-only PostgreSQL evidence: lifecycle, rate snapshots, policy
   snapshots, journals, grouped totals, balances, reversal net-zero and audit.
4. Verify denied roles, stale versions, missing rate/policy and 390px layout.
5. Never point mutation-capable acceptance at the shared/source database.

### BT-11 - Final verification and documentation

Run, at minimum:

```powershell
npm.cmd run test:unit -- tests/unit/banking-contracts.test.ts tests/unit/banking-api-router.test.ts tests/unit/banking-client.test.ts tests/unit/banking-transfer-service.test.ts tests/unit/banking-transfers-list.test.tsx tests/unit/banking-transfer-entry.test.tsx tests/unit/banking-transfer-detail.test.tsx tests/unit/finance-currency-service.test.ts tests/unit/finance-currency-views.test.tsx
npm.cmd run test:contract -- tests/contract/openapi.test.ts
npm.cmd exec vitest -- run --config vitest.integration.config.ts tests/integration/banking-transfers.test.ts tests/integration/finance-currencies.test.ts
npm.cmd exec vitest -- run --config vitest.security.config.ts tests/security/bank-transfer-database-security.test.ts tests/security/finance-currency-database-security.test.ts
npm.cmd run api:check
npm.cmd run typecheck
npm.cmd exec eslint -- packages/contracts/src/banking packages/contracts/src/finance server/api/src/modules/banking/transfers server/api/src/modules/finance/currencies app/features/banking app/features/finance tests/unit/banking-transfer-service.test.ts tests/unit/banking-transfers-list.test.tsx tests/unit/banking-transfer-entry.test.tsx tests/unit/banking-transfer-detail.test.tsx tests/unit/finance-currency-service.test.ts tests/unit/finance-currency-views.test.tsx
npm.cmd exec prettier -- --check packages/contracts/src/banking packages/contracts/src/finance server/api/src/modules/banking/transfers server/api/src/modules/finance/currencies app/features/banking app/features/finance tests/unit/banking-transfer-service.test.ts tests/unit/banking-transfers-list.test.tsx tests/unit/banking-transfer-entry.test.tsx tests/unit/banking-transfer-detail.test.tsx tests/unit/finance-currency-service.test.ts tests/unit/finance-currency-views.test.tsx
npm.cmd run build:web
git diff --check
```

Update:

- `docs/product/nexora-implementation-status.md`
- `docs/senior-review/ERP_Requirements_Traceability_Matrix.md`
- `docs/senior-review/ERP_Feature_Inventory.md`
- `docs/architecture/remaining-ui-migration.md`
- this plan with exact observed evidence and safe resume points

## 12. Commit and dirty-tree discipline

1. Commit this plan alone.
2. During implementation, stage explicit phase-owned paths only.
3. Do not commit unrelated modified/untracked Banking, Finance, shell, contract
   or test files merely because the Transfer work overlaps them.
4. Review generated artifacts and migrations before staging.
5. Never use reset/checkout/clean to manage the existing dirty tree.

## 13. Completion definition

The feature is complete only when:

- Transfer list/entry/detail routes contain no fixture fallback;
- Currency Master adoption, governed rates and Transfer/FX policy persist;
- same-company Bank Account/control-nominal validation is server enforced;
- same- and cross-currency batches post atomically with disclosed FX/rounding
  and optional charge lines;
- approval remains separate from posting;
- reversal creates an exact compensating journal;
- contracts, migrations, permissions, audit, API, generated client and UI are
  verified together; and
- isolated browser-to-PostgreSQL-to-ledger evidence passes.
