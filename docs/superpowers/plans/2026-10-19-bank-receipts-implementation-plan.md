# Bank Receipts Production Integration Implementation Plan

- Status: approved design; implementation plan awaiting review
- Date: 2026-10-19
- Approved design: `../specs/2026-10-19-bank-receipts-design.md`
- Production surface: Banking & Treasury - Bank Receipts, Add Bank Receipt and
  persisted Bank Transaction Detail
- Shared authority: `server/api/src/modules/finance/posting`
- Feature authority: `server/api/src/modules/banking/receipts`
- Persistence authority: next additive Finance migration after Finance 0007

## 1. Outcome

Deliver a PostgreSQL-backed general-ledger Bank Receipt workflow. Authorized
users can create and edit a multi-line draft, submit it, obtain an independent
decision or the governed super-admin exception, explicitly post it through the
existing Finance service, and create a linked compensating reversal.

The receipt list, entry and detail routes must use the generated API client with
no fixture fallback. Completion requires browser-to-ledger evidence, not merely
successful API responses.

## 2. Current evidence and constraints

1. Bank Payments is accepted and is the behavioral reference for lifecycle,
   authorization, idempotency, Finance posting and browser persistence.
2. Finance migration 0007 is the current migration head. The receipt migration
   is expected to be Finance 0008, but implementation must recheck the ledger
   immediately before creating it.
3. Platform 0008 already permits idempotent `POST` and `PATCH`; no Platform
   migration is expected.
4. Security 0015 already provides the governed approval/post-action framework.
   Add no Security migration unless source inspection proves a receipt-specific
   integrity requirement cannot be expressed in Finance.
5. The Finance posting service accepts caller-defined source and event types,
   owns fixed-scale arithmetic, exchange rates, period checks, journal
   numbering and compensating reversal, and operates inside a caller-owned
   database transaction.
6. `SourceBankPaymentRepository` is already large. Receipt SQL receives a
   separate repository and service; do not add it to the Bank Account or
   Payment repositories.
7. The receipt list, batch entry and legacy detail currently use fixtures and
   component-local state.
8. No Customer or Accounts Receivable backend exists. Payer name is a bounded
   line-level snapshot, not a mock customer or invoice relationship.

## 3. Non-negotiable invariants

1. Never edit historical migrations. Add the receipt schema through the next
   ledger-valid Finance migration.
2. The browser uses only the generated `/api/v1/banking` client.
3. Banking owns receipt capture and lifecycle; Finance owns posting and
   reversal validation and persistence.
4. Receipt repository transactions pass the same `PoolClient` to Finance.
5. Draft save, submit, decision, posting and reversal remain distinct actions.
6. Ordinary makers cannot approve their own receipts. The existing governed
   global super-admin exception requires its exact permissions, a reason and
   immutable linked evidence.
7. Posting and reversal require their own receipt permissions and are not
   covered by the approval override.
8. Every mutation requires session, CSRF, permission, company scope,
   optimistic version and idempotency key. Impersonated sessions stay blocked.
9. Submitted business facts and posted Finance facts are immutable.
10. Currency and Bank control identity are derived server-side from the active
    receiving Bank Account.
11. Each receipt has 1-200 lines. Amounts are positive decimal strings within
    the existing `numeric(38,8)` and fixed-scale Finance limits. JavaScript
    arithmetic is display-only.
12. A receipt line cannot target a bank-control or reconciliation-required
    account.
13. Customer IDs, invoice IDs and allocation statuses are outside this slice.
14. Attachment, export and print controls cannot imply functionality without
    governed endpoints.
15. API errors never restore fixture data.

## 4. Dependency graph

| Wave | Slice | Depends on | Deliverable |
| --- | --- | --- | --- |
| 0 | BR-00 | Approved design | Clean baseline and failure-first characterization |
| 1 | BR-01 | BR-00 | Contracts, OpenAPI and generated client |
| 1 | BR-02 | BR-00 | Additive receipt schema and database guards |
| 2 | BR-03 | BR-01, BR-02 | Receipt repository, service and Finance integration |
| 3 | BR-04 | BR-03 | Authenticated routes and API composition |
| 4 | BR-05 | BR-04 | Browser adapter and receipt URL identity |
| 5 | BR-06 | BR-05 | Live receipt list |
| 5 | BR-07 | BR-05 | Live receipt entry |
| 5 | BR-08 | BR-05 | Live receipt detail and lifecycle actions |
| 6 | BR-09 | BR-00 through BR-08 | Security, integration and browser acceptance |
| 6 | BR-10 | BR-09 | Documentation, safe handoff and push |

Contract generation is serialized. Schema and generated-client diffs must be
reviewed before backend or frontend consumers depend on them.

## 5. Wave 0 - Baseline and failure-first tests

### BR-00 - Characterize the accepted boundaries

**Files**

- Modify: `tests/unit/banking-contracts.test.ts`
- Modify: `tests/unit/banking-api-router.test.ts`
- Modify: `tests/unit/banking-client.test.ts`
- Modify: `tests/contract/openapi.test.ts`
- Modify: `tests/integration/postgres-migrations.test.ts`
- Create: `tests/unit/banking-receipt-service.test.ts`
- Create: `tests/integration/banking-receipts.test.ts`
- Create: `tests/security/bank-receipt-database-security.test.ts`
- Create during Wave 5: receipt list, entry and detail component tests

**Work**

1. Run the accepted Bank Payment and Finance suites before edits.
2. Add focused failing expectations for receipt contracts, routes, generated
   methods, migration target and service lifecycle.
3. Characterize the current receipt prototype: multi-line entry, payer per
   line, debit Bank Account, credit nominal lines, and shared detail route.
4. Record that invoice allocation and fixture customer IDs are prohibited.
5. Confirm the working tree is clean and stage only phase-owned files.

**Verification**

```powershell
npm.cmd run test:unit -- --run tests/unit/banking-contracts.test.ts tests/unit/banking-api-router.test.ts tests/unit/banking-client.test.ts tests/unit/banking-payment-service.test.ts tests/unit/finance-posting.test.ts
npm.cmd run test:contract -- --run tests/contract/openapi.test.ts
npm.cmd exec vitest -- run --config vitest.integration.config.ts tests/integration/finance-posting.test.ts tests/integration/banking-payments.test.ts
npm.cmd exec vitest -- run --config vitest.security.config.ts tests/security/bank-payment-database-security.test.ts
```

Database commands run only after isolated receipt-UAT database variables are
set as described in section 13.

**Gate**

- Existing Payment and Finance behavior passes or any unrelated baseline issue
  is recorded before receipt work.
- New receipt tests fail only because receipt behavior is absent.

## 6. Wave 1 - Contracts and schema

### BR-01 - Add strict receipt contracts and generated methods

**Files**

- Modify: `packages/contracts/src/banking/index.ts`
- Modify: `packages/contracts/src/openapi-c4.ts`
- Modify: `packages/contracts/src/generate-client-c4.ts`
- Regenerate: `app/lib/api/generated.ts`
- Regenerate: `openapi-v1.json`
- Modify: `tests/unit/banking-contracts.test.ts`
- Modify: `tests/contract/openapi.test.ts`

**Work**

1. Add receipt state, method, line, create, update, submit, decision, post,
   reverse, list, options, nominal-directory, detail and result schemas.
2. Bound payer names, references, narration, dimensions, query strings, line
   count and decimal precision.
3. Prevent requests from supplying tenant, currency authority, totals, state,
   actors, bank-control identity or Finance references.
4. Expose safe payer snapshots and masked Bank Account data; do not expose
   customer or invoice relationships.
5. Register these operations:
   - `GET /banking/receipts`
   - `POST /banking/receipts`
   - `GET /banking/receipts/options`
   - `GET /banking/receipts/nominal_accounts`
   - `GET /banking/receipts/{receiptId}`
   - `PATCH /banking/receipts/{receiptId}`
   - `POST /banking/receipts/{receiptId}/submit`
   - `POST /banking/receipts/{receiptId}/decision`
   - `POST /banking/receipts/{receiptId}/post`
   - `POST /banking/receipts/{receiptId}/reverse`
6. Regenerate the client; never hand-edit only the generated output.

**Verification**

```powershell
npm.cmd run api:generate
npm.cmd run api:check
npm.cmd run test:contract -- --run tests/contract/openapi.test.ts
npm.cmd run test:unit -- --run tests/unit/banking-contracts.test.ts
git diff --check
```

**Gate**

- Zod schemas, OpenAPI and generated client agree exactly.
- Unsafe authority and unbounded values are rejected.

### BR-02 - Add the governed receipt schema

**Files**

- Create, if Finance 0007 remains the migration head:
  `packages/db/source-migrations/finance/0008_finance_posting_bank_receipts.forward.sql`
- Modify: `tests/integration/postgres-migrations.test.ts`
- Modify: `tests/security/bank-receipt-database-security.test.ts`

**Work**

1. Recheck migration heads. If Finance 0008 exists, select the next number and
   update all plan execution notes without editing prior migrations.
2. Add seven active permission definitions:
   `banking.receipt.read`, `.create`, `.update`, `.submit`, `.approve`, `.post`
   and `.reverse`.
3. Add tenant/company/year receipt sequence with transaction-safe allocation.
4. Add receipt header with lifecycle, version, derived currency/total, complete
   actor/time/reason evidence, approval override evidence, and original/reversal
   Finance links.
5. Add ordered receipt lines with bounded payer snapshot, eligible nominal
   account, method, references, narration, dimensions and positive amount.
6. Add immutable lifecycle events linked to platform audit and override
   evidence where required.
7. Add unique reference, list, account history, line-order and event-history
   indexes.
8. Add RLS, tenant/company foreign keys, state/evidence constraints, line
   mutability guards, derived-total enforcement, currency validation, Finance
   link validation and immutable-event triggers equivalent to the accepted
   Payment guarantees.
9. Use source type `banking.receipt` and event types
   `bank_receipt.posted`/`bank_receipt.reversed` consistently.
10. Register the exact migration ledger identity and expected version.

**Verification**

```powershell
npm.cmd run db:migrate:source
npm.cmd exec vitest -- run --config vitest.integration.config.ts tests/integration/postgres-migrations.test.ts
npm.cmd exec vitest -- run --config vitest.security.config.ts tests/security/bank-receipt-database-security.test.ts
git diff --check
```

**Gate**

- A fresh isolated database reaches the expected ledger version.
- RLS, constraints, immutability and posting-link guards fail closed.

## 7. Wave 2 - Receipt domain and Finance integration

### BR-03 - Implement receipt repository and service

**Files**

- Create: `server/api/src/modules/banking/receipts/source-repository.ts`
- Create: `server/api/src/modules/banking/receipts/service.ts`
- Modify: `tests/unit/banking-receipt-service.test.ts`
- Modify: `tests/integration/banking-receipts.test.ts`

**Work**

1. Implement scoped list, options, nominal directory, detail, create, update,
   submit, decision, post and reverse operations.
2. Reuse Banking session/error conventions and `evaluateApprovalActor`.
3. Allocate `BR-{fiscalYear}-{eightDigitSequence}` under row lock.
4. Derive Bank Account currency/control account and exact receipt total on the
   server using fixed-scale helpers.
5. Validate active Bank Account, company scope, line accounts, required
   dimensions, amount bounds and dates on create/update and again at submit.
6. Submit with immutable content and an audit-linked lifecycle event.
7. Enforce ordinary maker/checker separation. Persist the governed `shoaib`
   exception only through existing override services with a reason.
8. For posting, lock the receipt and related authorities; call Finance with:
   - one debit line to the Bank control account for the total;
   - one credit line per receipt line to its nominal account;
   - source type `banking.receipt`; and
   - event type `bank_receipt.posted`.
9. Commit receipt state, Finance evidence, lifecycle event, platform audit and
   idempotency result atomically.
10. Reverse through Finance with `bank_receipt.reversed`, preserve the original
    journal and store linked compensating evidence.
11. Map stable validation/conflict/security errors without leaking SQL details.

**Verification**

```powershell
npm.cmd run test:unit -- --run tests/unit/banking-receipt-service.test.ts tests/unit/finance-posting.test.ts
npm.cmd exec vitest -- run --config vitest.integration.config.ts tests/integration/finance-posting.test.ts tests/integration/banking-receipts.test.ts
npm.cmd run typecheck
git diff --check
```

**Gate**

- Create through reversal works through one caller-owned transaction boundary.
- Injected Finance failure leaves an approved, unposted receipt and no partial
  journal, audit or idempotency success.

## 8. Wave 3 - Authenticated API

### BR-04 - Register receipt routes and production composition

**Files**

- Modify: `server/api/src/modules/banking/router.ts`
- Modify: `server/api/src/app.ts`
- Modify: `server/api/src/server.ts`
- Modify: `tests/unit/banking-api-router.test.ts`
- Modify: `tests/integration/banking-receipts.test.ts`

**Work**

1. Add a narrow `BankingReceiptRepository` dependency and
   `BankingReceiptService` instance.
2. Register static options and nominal routes before `/:receiptId`.
3. Parse all requests with shared contract schemas.
4. Apply trusted-origin, session, CSRF, idempotency and receipt-version
   precondition behavior consistently with Payments.
5. Return receipt ETags and standard problem responses.
6. Compose `SourceBankReceiptRepository` with the existing Finance posting
   service in `server.ts`.
7. Verify account and payment routes are unchanged.

**Verification**

```powershell
npm.cmd run test:unit -- --run tests/unit/banking-api-router.test.ts
npm.cmd exec vitest -- run --config vitest.integration.config.ts tests/integration/banking-receipts.test.ts
npm.cmd run api:check
npm.cmd run typecheck
git diff --check
```

**Gate**

- All ten receipt operations enforce the intended transport controls.
- Existing Banking routes retain their behavior.

## 9. Wave 4 - Browser data boundary

### BR-05 - Add receipt adapter and route identity

**Files**

- Modify: `app/features/banking/api/banking-client.ts`
- Create: `app/features/banking/model/bank-receipt-routing.ts`
- Modify: `tests/unit/banking-client.test.ts`
- Create: `tests/unit/bank-receipt-routing.test.ts`
- Modify: `tests/unit/bank-payment-shell-navigation.test.tsx`

**Work**

1. Add typed adapter methods for all receipt reads and mutations.
2. Forward CSRF, idempotency and expected-version headers through generated
   methods; do not construct raw fetch calls in views.
3. Add strict persisted receipt-ID recognition using a receipt-specific URL
   prefix plus UUID shape, distinct from payment and legacy references.
4. Ensure direct load, refresh, back and forward navigation preserve receipt
   identity.

**Verification**

```powershell
npm.cmd run test:unit -- --run tests/unit/banking-client.test.ts tests/unit/bank-receipt-routing.test.ts tests/unit/bank-payment-shell-navigation.test.tsx
npm.cmd run typecheck
git diff --check
```

**Gate**

- Views can use only typed receipt adapter methods.
- Receipt and Payment detail routing cannot collide.

## 10. Wave 5 - Approved UI integration

Before modifying Next.js UI, read the relevant local Next 16 guide under
`node_modules/next/dist/docs/` as required by the repository instructions.

### BR-06 - Replace the receipt list fixtures

**Files**

- Create: `app/features/banking/views/banking-receipts.tsx`
- Create: `tests/unit/banking-receipts-list.test.tsx`
- Modify: `app/shell/prototype-content.tsx`

**Work**

1. Preserve approved table density and terminology.
2. Add authenticated company selection, Bank Account/state/date filters,
   bounded deferred search, server sorting and cursor pagination.
3. Render persisted reference, date, Bank Account, payer/nominal summary,
   currency, total and state.
4. Add loading, empty, retryable error, permission-denied and pagination states.
5. Disable export with an explicit unavailable explanation.
6. Remove receipt fixtures only from the live route; do not delete shared
   prototype data still used by other deferred pages.

### BR-07 - Connect the receipt batch entry

**Files**

- Create: `app/features/banking/views/banking-receipt-entry.tsx`
- Create: `tests/unit/banking-receipt-entry.test.tsx`
- Modify: `app/shell/prototype-content.tsx`

**Work**

1. Preserve the dense multi-line receipt entry layout using Tailwind and
   existing shadcn primitives.
2. Load real companies, receiving Bank Accounts and eligible nominal accounts.
3. Replace the mock customer select with a required bounded payer-name input.
4. Support add/remove lines, client-side field guidance and accounting preview
   without treating browser arithmetic as authoritative.
5. Implement create, reload-safe edit, Save Draft and Submit for Approval.
6. Remove `Approve and Close`; decisions occur only on persisted detail.
7. Preserve unsaved values on validation or version conflict.
8. Keep attachment unavailable and accurately labelled.
9. Expose accessible labels, focus, error summary and narrow-screen horizontal
   table behavior.

### BR-08 - Connect persisted receipt detail and lifecycle actions

**Files**

- Create: `app/features/banking/views/banking-receipt-detail.tsx`
- Create: `tests/unit/banking-receipt-detail.test.tsx`
- Modify: `app/shell/prototype-content.tsx`
- Modify only if active selectors require it: existing shared Banking styles

**Work**

1. Render persisted header, lines, payer snapshots, timeline and masked links.
2. Show accounting preview before posting and actual Finance evidence after.
3. Expose edit, submit, approve/reject, post and reverse only for eligible
   state and permission combinations.
4. Require reasons for rejection, reversal and super-admin same-actor approval.
5. Show a clear override warning and never imply ordinary self-approval.
6. Handle loading, not-found, denied, conflict, mutation error and success.
7. Refresh data after mutations and preserve URL identity.

**Verification for BR-06 through BR-08**

```powershell
npm.cmd run test:unit -- --run tests/unit/banking-receipts-list.test.tsx tests/unit/banking-receipt-entry.test.tsx tests/unit/banking-receipt-detail.test.tsx tests/unit/bank-receipt-routing.test.ts tests/unit/bank-payment-shell-navigation.test.tsx
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run build:web
git diff --check
```

**Gate**

- All three receipt routes use only live receipt APIs.
- Loading, empty, error, denied, validation, conflict and success behaviors are
  tested.
- Payments, Bank Accounts and prototype-only Banking routes are unchanged.

## 11. Wave 6 - Acceptance and handoff

### BR-09 - Prove database, API and browser behavior

**Files**

- Create: `scripts/provision-bank-receipts-uat.ts`
- Modify: `package.json` to add only the receipt UAT provision command
- Create: `tests/integration/bank-receipts-uat-provisioning.test.ts`
- Create: `tests/e2e/bank-receipts.spec.ts`
- Update focused integration/security tests as evidence requires

**Work**

1. Provision only synthetic companies, accounts, periods, rates and users in a
   database whose name contains an explicit safety word such as `uat`.
2. Do not truncate, reset or mutate any shared or production database.
3. Exercise maker create/save/refresh/edit/submit.
4. Prove ordinary maker self-approval denial.
5. Approve with a distinct checker and post with an authorized poster.
6. Query read-only PostgreSQL evidence for the balanced journal, event, ledger
   movement and audit linkage.
7. Start a new session or reload and prove persistence.
8. Reverse with a mandatory reason and verify the compensating journal while
   the original remains immutable.
9. Exercise representative `shoaib` same-actor approval and inspect linked
   override evidence.
10. Verify Account Balances reflects posted and reversed ledger effects.
11. Run Payments and Bank Account regression tests after receipt acceptance.

**Gate**

- Chromium acceptance and read-only database evidence pass.
- No receipt UI fixture or false action remains.

### BR-10 - Record completion and safe resume point

**Files**

- Update: `docs/architecture/remaining-ui-migration.md`
- Update: `docs/architecture/hr-backend-delivery-plan.md`
- Update this plan with an implementation completion record

**Work**

1. Record exact migrations, routes, tests, commands and observed results.
2. State which verification is source-inspected, automated, browser-observed
   and database-observed.
3. Record any limitations without upgrading status prematurely.
4. Set Bank Transfers as the next Banking slice only after receipt acceptance.
5. Reconfirm HR does not write directly into Banking and its future payment
   batch remains a separate governed consumer.
6. Create focused commits, verify the clean tree and push the existing branch.
   If GitHub rejects authorization, preserve local commits and report the exact
   failure without changing remotes or credentials.

## 12. Commit sequence

Use small reviewable commits after each gate:

1. `test(banking): characterize bank receipt workflow`
2. `feat(banking): add bank receipt API contracts`
3. `feat(db): add governed bank receipt schema`
4. `feat(banking): add governed bank receipt workflows`
5. `feat(banking): expose bank receipt API routes`
6. `feat(banking): add receipt browser adapter`
7. `feat(banking): connect bank receipt workspace`
8. `test(banking): verify receipt lifecycle acceptance`
9. `docs(banking): record bank receipt completion`

Do not mix unrelated user changes into these commits.

## 13. Isolated database and runtime discipline

Before integration, security, provisioning or E2E commands:

1. Create a new disposable local PostgreSQL database with `uat` in its name.
2. Set `DATABASE_URL`, `TEST_SOURCE_DATABASE_URL` and
   `TEST_SOURCE_BOOTSTRAP_DATABASE_URL` to that same isolated database for the
   command session.
3. Set the isolated test Redis URL when required.
4. Run source migrations and receipt UAT provisioning only against that
   database.
5. Verify the database name from the live connection before any mutation.

Never reuse a shared development or production database for destructive or
acceptance tests. Do not print credentials in documentation or test output.

## 14. Final verification sequence

The exact commands may be narrowed during development, but completion requires
these observed gates:

```powershell
npm.cmd run api:generate
npm.cmd run api:check
npm.cmd run test:contract -- --run tests/contract/openapi.test.ts
npm.cmd run test:unit -- --run tests/unit/banking-contracts.test.ts tests/unit/banking-api-router.test.ts tests/unit/banking-client.test.ts tests/unit/banking-receipt-service.test.ts tests/unit/bank-receipt-routing.test.ts tests/unit/banking-receipts-list.test.tsx tests/unit/banking-receipt-entry.test.tsx tests/unit/banking-receipt-detail.test.tsx
npm.cmd exec vitest -- run --config vitest.integration.config.ts tests/integration/postgres-migrations.test.ts tests/integration/finance-posting.test.ts tests/integration/banking-receipts.test.ts tests/integration/bank-receipts-uat-provisioning.test.ts
npm.cmd exec vitest -- run --config vitest.security.config.ts tests/security/bank-receipt-database-security.test.ts tests/security/bank-payment-database-security.test.ts
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run build:web
npm.cmd exec playwright -- test tests/e2e/bank-receipts.spec.ts --project=chromium
git diff --check
git status --short
```

Also run the focused accepted Bank Payment and Bank Account regression suites.
Record actual counts and failures; never claim a command passed unless its
result was observed.

## 15. Rollback and deployment discipline

- The schema change is additive. Rollback the application by disabling receipt
  navigation/actions while retaining receipt tables and history.
- Do not drop or rewrite receipt or Finance evidence as an application rollback.
- Deploy migration-compatible API code before enabling live receipt screens.
- Keep receipt routes labelled prototype/unavailable until migration, API and
  browser acceptance are complete.
- Observe API errors, posting conflicts and database readiness before declaring
  the slice live.

## 16. Completion gates

The slice is complete only when:

- contracts, OpenAPI and generated client agree;
- the additive migration passes on a fresh isolated database;
- receipt tenant/company isolation and immutable evidence are proven;
- all lifecycle operations enforce their exact permissions and versions;
- ordinary self-approval is denied and the governed `shoaib` exception is
  evidenced;
- posting produces one balanced journal and reversal produces one linked
  compensating journal;
- list, entry and detail contain no receipt fixtures;
- Account Balances reflects posting and reversal;
- typecheck, lint, build, integration, security and Chromium acceptance pass;
- documentation records observed evidence and a safe resume point; and
- unrelated modules retain their accepted behavior.

## 17. Explicitly deferred work

This plan does not authorize Customer master data, Accounts Receivable invoice
allocation, write-offs, attachment upload, Transfers, statement import,
reconciliation, charges, interest, cheques, deposits, Treasury instruments or
a duplicate accounting engine. Those require separate approved vertical slices.

## 18. Implementation checkpoint - 2026-10-19

Status: **BR-00 through BR-03 complete; resume at BR-04**.

Completed commits:

- `f29d818 feat(banking): add bank receipt API contracts`
- `8439520 feat(db): add governed bank receipt schema`
- `139622a feat(banking): add governed bank receipt workflows`

Observed baseline before receipt changes:

- accepted Banking/Finance unit baseline: 43/43 passed;
- OpenAPI contract baseline: 3/3 passed;
- Finance and Bank Payment PostgreSQL integration baseline: 9/9 passed; and
- Bank Payment database-security baseline: 6/6 passed.

BR-01 evidence:

- the first failure run proved receipt schemas, generated methods, OpenAPI paths
  and authenticated routes were absent rather than silently mocked;
- strict receipt contract and browser-client tests: 26/26 passed;
- focused Payment-service regression included in the final unit run: 27/27
  total passed;
- OpenAPI contract: 4/4 passed;
- `api:check` passed; and
- full TypeScript check passed.

BR-02 evidence:

- additive Finance migration 0008 advanced the isolated local UAT database
  from Finance 7 to Finance 8 without changing Platform, Security, HR, Workflow
  or Runtime migration heads;
- migration ledger/idempotency suite: 11/11 passed;
- combined Receipt and Payment database-security suites: 13/13 passed;
- receipt security coverage observed forced RLS, company-bound foreign keys,
  lifecycle/line/posting/currency/override guards, the Finance currency-rate
  lock, exact receipt permissions and immutable audit authority; and
- full TypeScript and focused formatting checks passed.

BR-03 evidence:

- a separate Receipt repository/service now owns scoped list, options, nominal
  directory, detail, create, update, submit, decision, post and reversal;
- receipt payer snapshots and nullable references/narration are persisted in
  PostgreSQL and returned through list/detail summaries;
- Finance posting debits the Bank control account and credits each receipt
  nominal line under source `banking.receipt`; reversal uses the existing
  compensating-journal service;
- focused Receipt, Finance and Payment-regression unit suites: 14/14 passed;
- Finance and Receipt PostgreSQL integration suites: 9/9 passed, followed by a
  second Receipt-only repeatability run: 2/2 passed;
- integration evidence covered exact receipt methods, required dimensions,
  payer search, idempotency conflict/replay, draft update, maker-checker denial,
  distinct approval/posting, positive Bank ledger movement, reversal, governed
  super-admin approval evidence and rollback after an injected Finance failure;
- the full TypeScript check and `git diff --check` passed.

The migration was observed as an additive upgrade of
`nexora_bank_payments_uat_20261019_1510`. A new empty-database migration run is
still required by BR-09 and has not been claimed.

Safe resume point: begin BR-04 by registering the ten authenticated Receipt
operations in the existing Banking router and production API composition.
Follow the accepted Payment transport controls for session, trusted origin,
CSRF, idempotency and ETags, but keep Receipt dependencies and route handling
separate. Register `/receipts/options` and `/receipts/nominal_accounts` before
`/receipts/:receiptId`. Do not begin browser integration until route tests and
the existing Banking route regressions pass.
