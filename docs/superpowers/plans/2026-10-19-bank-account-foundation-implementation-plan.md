# Bank Account Foundation Implementation Plan

- Status: approved design; implementation ready
- Date: 2026-10-19
- Approved design: `../specs/2026-10-19-bank-account-foundation-design.md`
- Production surface: Banking & Treasury — Account Balances and Bank Account Setup
- Scope boundary: governed bank-account master data and read-only ledger balance projections

## 1. Outcome

Deliver the first PostgreSQL-backed Banking & Treasury vertical slice through
the existing `server/api` service. Account Balances, account setup and account
approval must use typed `/api/v1/banking` contracts, authenticated company
scope, exact permissions, dedicated encryption, idempotency, independent
maker/checker decisions and immutable audit evidence. The approved prototype
layout remains the visual source of truth.

This plan does not authorize transaction posting, non-zero opening balances,
statement import, reconciliation, a duplicate ledger, destructive deletion,
dependency upgrades or unrelated HR changes.

## 2. Delivery invariants

1. Existing migrations are never edited.
2. Existing `bank_account` rows are inspected before migration and never become
   eligible solely from a legacy `active` value.
3. Browser code accesses Banking only through the generated API client.
4. Every business query is tenant-scoped and every account query is
   company-scoped.
5. Sensitive account and IBAN values are encrypted with a dedicated Banking
   key, masked in responses and excluded from logs/audit payloads.
6. An actor cannot approve an account they created or submitted.
7. Account balances are derived from posted journal lines; no mutable balance
   column is introduced.
8. Opening balance must equal zero until the Finance posting service exists.
9. A live screen never falls back to prototype records after API failure.
10. Other Banking screens remain explicitly prototype-only.

## 3. Implementation sequence

### Task 1 — Characterize Banking behavior and repository authorities

**Files**

- Create: `tests/unit/banking-contracts.test.ts`
- Create: `tests/unit/banking-router.test.ts`
- Create: `tests/unit/banking-client.test.ts`
- Modify: `tests/contract/openapi.test.ts`
- Modify: `tests/integration/postgres-migrations.test.ts`

**Work**

1. Record the missing Banking contracts, routes and client as failing tests.
2. Characterize the approved Account Balances fields, filters and setup form.
3. Verify migration ordering and the current minimal `bank_account` authority.
4. Preserve the existing prototype reconciliation regression test.

**Verification**

Run the focused tests and record that new behavior fails for the intended
missing-feature reason before production code is added.

### Task 2 — Add strict Banking contracts and OpenAPI paths

**Files**

- Create: `packages/contracts/src/banking/index.ts`
- Modify: `packages/contracts/src/index.ts`
- Modify: `packages/contracts/src/openapi-c4.ts`
- Modify: `packages/contracts/src/generate-client-c4.ts`
- Regenerate: `app/lib/api/generated.ts`
- Modify: `tests/contract/openapi.test.ts`
- Modify: `tests/unit/banking-contracts.test.ts`

**Contracts**

1. Company projection and eligible postable bank-control account projection.
2. Bounded account-directory query, response and cursor/page metadata.
3. Currency summary and nullable statement/reconciliation projections.
4. Masked account detail.
5. Create/update/submit/decision/status request and result schemas.
6. Optimistic version, required reasons and zero opening-balance validation.
7. Generated client methods for every initial endpoint.

No request accepts tenant authority, creator/approver identity, lifecycle state,
plaintext response values, ledger balance or audit metadata controlled by the
server.

### Task 3 — Add Banking encryption configuration and utility

**Files**

- Modify: `server/api/src/config.ts`
- Create: `server/api/src/modules/banking/crypto.ts`
- Create: `tests/unit/banking-crypto.test.ts`
- Update the existing local/deployment environment documentation only where the
  repository already documents required API secrets

**Work**

1. Require a dedicated, versioned Banking key-encryption secret.
2. Implement authenticated encryption for account number and optional IBAN.
3. Implement normalized keyed hashes for duplicate detection.
4. Implement deterministic safe masking without logging plaintext.
5. Reject malformed key material at startup.

The Banking key must remain independent of authentication, session, throttle
and login-directory secrets.

### Task 4 — Add the governed Bank Account PostgreSQL schema

**Files**

- Create: `packages/db/source-migrations/finance/0002_bank_account_foundation.forward.sql`
- Modify: `tests/integration/postgres-migrations.test.ts`
- Create: `tests/security/bank-account-database-security.test.ts`

**Schema work**

1. Add account reference, name/type, branch, masks, ciphertext envelopes,
   identifier hashes, optional SWIFT/BIC and overdraft limit.
2. Add lifecycle state, row version and complete maker/checker timestamps.
3. Add idempotency/audit linkage using existing platform conventions.
4. Add tenant RLS, company/account foreign keys, checks, unique constraints and
   directory indexes.
5. Add lifecycle/evidence guards and prohibit deletion.
6. Record Finance migration version 2.
7. Handle pre-existing rows through a reviewed ineligible state or fail-safe
   migration precondition; never auto-approve them.

### Task 5 — Implement the Banking repository and service

**Files**

- Create: `server/api/src/modules/banking/source-repository.ts`
- Create: `server/api/src/modules/banking/accounts/service.ts`
- Create: `server/api/src/modules/banking/shared/session-context.ts`
- Create: `tests/integration/banking-account-foundation.test.ts`

**Work**

1. Reuse authenticated session, exact permission and active company-access
   authorities.
2. Implement bounded companies, eligible accounts, directory, summary and
   masked-detail reads.
3. Derive ledger balance and last movement from posted journal entries/lines.
4. Create/update/submit/decide/status-change inside explicit transactions.
5. Enforce idempotency replay/conflict, optimistic concurrency, duplicate
   identifier prevention and maker/checker separation.
6. Write immutable platform audit evidence without sensitive values.
7. Publish an eligibility read usable by HR payroll without allowing HR to
   mutate Banking records.

### Task 6 — Add authenticated `/api/v1/banking` routes

**Files**

- Create: `server/api/src/modules/banking/router.ts`
- Modify: `server/api/src/app.ts`
- Modify: `server/api/src/server.ts`
- Modify: `tests/unit/banking-router.test.ts`
- Modify: `tests/integration/banking-account-foundation.test.ts`

**Work**

1. Mount the router only when repository, authentication and session
   dependencies exist.
2. Apply no-store responses, trusted-origin validation, CSRF and required
   idempotency keys.
3. Parse every request with contract schemas and return standard problem
   details.
4. Add a Banking readiness check for the required schema.

### Task 7 — Add the browser Banking adapter

**Files**

- Create: `app/features/banking/api/banking-client.ts`
- Modify: generated `app/lib/api/generated.ts` only through the generator
- Modify: `tests/unit/banking-client.test.ts`

**Work**

1. Wrap generated methods in the only browser-facing Banking boundary.
2. Centralize bounded query construction.
3. Pass CSRF, idempotency and expected versions for mutations.
4. Preserve typed safe problem errors for the views.

### Task 8 — Integrate the live Account Balances screen

**Files**

- Create: `app/features/banking/views/banking-account-balances.tsx`
- Modify: `app/shell/prototype-content.tsx`
- Modify Banking navigation/config only if required to retain the existing route
- Create or modify focused frontend unit tests

**Work**

1. Preserve the approved cards, filters, table terminology and responsive
   structure.
2. Load companies, summaries and paginated rows from the Banking adapter.
3. Implement server-side search/filter/sort/page state.
4. Render loading, empty, denied, error/retry and success states.
5. Display nullable available/unreconciled values as unavailable, never zero.
6. Disable Export with an honest explanation until an export API exists.
7. Remove the prototype label only after live browser acceptance passes.

### Task 9 — Integrate account setup and checker review

**Files**

- Modify: `app/features/banking/views/banking-transaction-form.tsx` or create a
  focused bank-account form if separation reduces risk
- Create: `app/features/banking/views/banking-account-approvals.tsx`
- Modify: `app/shell/prototype-content.tsx`
- Modify: `app/shell/config/prototype-data.ts` only when a visible checker route
  is required
- Add focused frontend tests

**Work**

1. Preserve the approved account setup UI while replacing local success state
   with real draft and submit mutations.
2. Load eligible Chart of Accounts records from the API.
3. Reject non-zero opening balances in the form and server.
4. Clear plaintext sensitive inputs after persistence.
5. Add a navigable pending-approval queue and review/decision surface.
6. Prevent duplicate submits and report version conflicts safely.

### Task 10 — Verify HR eligibility integration

**Files**

- Modify HR payment-profile repository/service only if a currently live create
  path exists and lacks Banking eligibility validation
- Modify/add focused HR-Banking integration tests
- Update: `docs/architecture/hr-backend-delivery-plan.md`

**Work**

1. Confirm the actual runtime status of HR payment export profile creation.
2. If live, require Banking eligibility for tenant, company, currency, state
   and Chart of Accounts mapping.
3. If not live, document the established Banking eligibility boundary as the
   mandatory dependency for the future HR payment-profile slice.
4. Do not add direct HR writes to Banking or journals.

### Task 11 — End-to-end acceptance and handoff

**Files**

- Add focused Playwright acceptance under `tests/e2e`
- Update: `docs/architecture/remaining-ui-migration.md`
- Update the approved design/plan status and verification record

**Acceptance flow**

1. Apply migrations to the isolated PostgreSQL test database.
2. Sign in through the real session flow.
3. Open Account Balances through Banking navigation.
4. Create and submit a zero-balance account as one actor.
5. Approve it as a different actor.
6. Refresh and use a new session to prove persistence.
7. Verify masked identifiers, summary inclusion and permission/company denial.
8. Verify API failure never substitutes prototype rows.

## 4. Verification commands

Run focused checks throughout the slice, followed by:

```powershell
npm.cmd run api:check
npm.cmd run typecheck
npm.cmd run test:contract -- --run tests/contract/openapi.test.ts
npm.cmd run test:unit -- --run tests/unit/banking-contracts.test.ts tests/unit/banking-crypto.test.ts tests/unit/banking-router.test.ts tests/unit/banking-client.test.ts
npm.cmd run test:integration -- --run tests/integration/postgres-migrations.test.ts tests/integration/banking-account-foundation.test.ts
npm.cmd run test:security -- --run tests/security/bank-account-database-security.test.ts
npm.cmd exec eslint -- <changed TypeScript and TSX files>
npm.cmd run build:web
npm.cmd run test:e2e -- --grep "bank account foundation"
git diff --check
```

Do not claim full repository lint/test success unless those complete successfully.
Pre-existing failures are reported separately from regressions.

## 5. Completion gate

The slice is complete only when the approved Account Balances and Bank Account
Setup screens are PostgreSQL-backed with no mock fallback, account identifiers
are protected, distinct maker/checker activation is proven, ledger balances are
derived only from posted journals, HR has a stable eligibility boundary, and
the automated plus browser acceptance evidence above has been observed.

## 6. Delivery status — 2026-10-19

**Status: COMPLETE — focused acceptance passed.**

Tasks 1–11 are implemented for the Bank Account foundation. The delivered
path is generated client → `/api/v1/banking` → cookie authentication, CSRF and
permission/company enforcement → Banking service/repository → PostgreSQL.
Sensitive account and IBAN values are encrypted at rest and only masked values
are returned. Account creation is idempotent, lifecycle changes use optimistic
versions and transactions, and immutable Banking plus platform audit evidence
is recorded. Maker/checker separation is enforced for every actor, including
administrators.

The real Chromium acceptance flow created and submitted an account as the
maker, approved it as a different checker, opened it through Account Balances,
reloaded the application, and directly confirmed the active encrypted database
record and three lifecycle events. The live pages are consequently marked
**Backend connected** and never fall back to prototype rows.

HR payment export profiles are not yet a live runtime workflow. The stable
eligibility boundary for that future Phase 5 consumer is recorded in
`docs/architecture/hr-backend-delivery-plan.md`; no speculative HR mutation was
introduced.

### Safe resume point

Start the next Banking slice with Bank Payments only after confirming the
existing Finance journal-posting authority. Design the draft/submitted/
approved/posted/reversed lifecycle, period locks, idempotency, immutable audit
and transactional double-entry boundary before enabling a live payment action.
Payments, receipts, transfers, statements/imports and reconciliation remain
prototype-only until their own vertical slices pass equivalent acceptance.
