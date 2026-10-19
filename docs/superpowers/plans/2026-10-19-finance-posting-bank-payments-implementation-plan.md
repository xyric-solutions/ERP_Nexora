# Finance Posting Foundation and Bank Payments Implementation Plan

- Status: approved design; implementation ready
- Date: 2026-10-19
- Approved design: `../specs/2026-10-19-finance-posting-bank-payments-design.md`
- Production surface: Banking & Treasury — Bank Payments, Add Bank Payment and Bank Transaction Detail
- Shared authority: centralized Finance posting boundary under `server/api/src/modules/finance/posting`
- Feature authority: isolated Banking payment boundary under `server/api/src/modules/banking/payments`
- Persistence authority: additive Finance migration 0005 in `packages/db/source-migrations/finance`

## 1. Outcome

Deliver the first fully posted Banking transaction workflow. A user with the
exact permissions can create and revise a multi-line Bank Payment draft,
submit it, obtain an independent decision (or the already governed
super-administrator override), explicitly post it through the reusable Finance
posting service, and create a linked compensating reversal. The Bank Payments
list, Add Bank Payment screen and Bank Transaction Detail workspace must use
the generated API client and PostgreSQL without a prototype fallback.

The slice is not complete merely because a payment row can be saved or an API
returns 200. Completion requires one atomic path from browser to Banking to
Finance to an immutable balanced journal, together with authorization,
idempotency, period, currency, audit, rollback and browser evidence.

## 2. Current evidence and constraints

1. Finance migration 0001 already owns `accounting_event`, `account`,
   `financial_period`, `journal_entry`, `journal_line` and
   `journal_entry_sequence`, including forced RLS and posted-record guards.
2. Platform migration 0001 owns currency decimal scales, the one active base
   currency and dated exchange rates. Platform migration 0002 owns the shared
   idempotency table but currently restricts its HTTP method to `POST`.
3. Finance migrations 0002–0004 own governed Bank Accounts, their unique
   company ledger mapping and the global approval-override reference.
4. No production Finance service currently writes an accounting event or
   journal. The new service must therefore be reusable and must not be placed
   inside Banking.
5. The current Bank Payments list comes from `banking-profile.ts`; the batch
   entry and transaction detail use fixtures and component-local state.
6. `SourceBankingRepository` is the Bank Account repository. Do not add payment
   SQL to that already large class. Payments receive a separate repository and
   service while reusing Banking session and safe error conventions.
7. The repository has many unrelated untracked files. Do not stage, delete,
   reformat or otherwise alter them as part of this phase.

## 3. Non-negotiable delivery invariants

1. Never edit Platform migrations 0001–0007 or Finance migrations 0001–0004.
   Widen shared idempotency support through additive Platform migration 0008,
   and add payment schema through additive Finance migration 0005.
2. The browser calls only the generated `/api/v1/banking` client. It never
   constructs a trusted journal or accesses PostgreSQL.
3. Banking owns payment capture, lifecycle, approval and projections. Finance
   owns posting/reversal validation, currency conversion, period resolution,
   numbering and journal persistence.
4. The Banking repository opens the database transaction and passes the same
   `PoolClient` to Finance. Finance must not open or commit an independent
   transaction for a Banking posting.
5. Draft save, submit, approve and post are separate actions and states.
   Approval never implies posting.
6. An ordinary maker cannot approve their own payment. Only an actor satisfying
   the existing `evaluateApprovalActor` policy can use the reason-required,
   immutable super-administrator override.
7. Posting and reversal are never covered by the maker/checker override. They
   require `banking.payment.post` and `banking.payment.reverse` respectively.
8. Every mutation requires a valid session, CSRF, exact permission, company
   access, optimistic version and idempotency key; impersonated sessions remain
   mutation-blocked by `loadBankingSessionContext`.
9. Submitted payment business facts and posted Finance facts are immutable.
   Corrections use a new draft or a linked reversal.
10. The selected Bank Account must be active, in the same tenant/company,
    mapped to an active bank-control ledger and denominated in the payment
    currency. The client never supplies the bank-control account ID.
11. Amounts cross API boundaries as decimal strings with at most 30 integer
    digits and 8 fractional digits, matching positive `numeric(38,8)` storage.
    Each line is greater than zero, each batch has at most 200 lines, and every
    computed transaction/base amount and total must remain within
    `999999999999999999999999999999.99999999`. JavaScript floating-point
    arithmetic is presentation-only and must not determine persisted totals,
    FX conversion, overflow acceptance or balance acceptance.
12. The attachment input stays disabled and explicitly labelled unavailable;
    file-name-only state must not be represented as a stored document.
13. Export and print remain unavailable until governed endpoints exist.
14. The page remains labelled prototype until the real browser acceptance gate
    passes. Once switched live, API failure renders an error and never restores
    fixture rows.

## 4. Dependency graph and delivery waves

| Wave | Slices | Depends on | Deliverable |
| --- | --- | --- | --- |
| 0 | BP-00 | Approved design | Characterization, clean baseline and failure-first tests |
| 1 | BP-01, BP-02 | BP-00 | Typed contracts/OpenAPI/client plus additive Platform 0008 and Finance 0005 schema |
| 2 | BP-03 | BP-01, BP-02 | Reusable, transaction-injected Finance posting/reversal boundary |
| 3 | BP-04, BP-05 | BP-03 | Banking payment lifecycle repository/service and authenticated routes |
| 4 | BP-06 | BP-05 | Browser Banking adapter and stable typed view model |
| 5 | BP-07, BP-08, BP-09 | BP-06 | Live list, entry and detail screens in existing navigation |
| 6 | BP-10, BP-11 | Waves 0–5 | Security/integration regression, runtime/browser acceptance and handoff |

Within a wave, work may be prepared in parallel only when files do not overlap.
Contract generation is serialized: update schemas and generator, run
`api:generate`, then review and verify the generated diff before any consumer
work relies on it.

## 5. Wave 0 — Baseline and characterization

### BP-00 — Lock the current behavior and establish failure-first coverage

**Files**

- Modify: `tests/unit/banking-contracts.test.ts`
- Modify: `tests/unit/banking-api-router.test.ts`
- Modify: `tests/unit/banking-client.test.ts`
- Modify: `tests/contract/openapi.test.ts`
- Modify: `tests/integration/postgres-migrations.test.ts`
- Create: `tests/unit/finance-posting.test.ts`
- Create: `tests/integration/banking-payments.test.ts`
- Create: `tests/security/bank-payment-database-security.test.ts`
- Create later in Wave 5 with failing UI expectations:
  `tests/unit/banking-payments-components.test.ts`

**Work**

1. Record the missing payment schemas, generated methods, routes and Finance
   posting service as focused failing tests before production code is added.
2. Characterize the current account router, account repository and Bank Account
   browser screens so the new payment work cannot regress them.
3. Record the current Platform/Finance migration ledger at versions 7/4 and
   update the expected targets to 8/5 only together with BP-02.
4. Capture the approved UI semantics: one persisted payment per list row,
   multi-line entry, separate approval/posting, lifecycle detail and disabled
   attachment/export controls.
5. Run the existing account foundation tests before editing. If they fail,
   record the failure as pre-existing and do not conceal it inside this phase.

**Verification**

```powershell
npm.cmd run test:unit -- --run tests/unit/banking-contracts.test.ts tests/unit/banking-api-router.test.ts tests/unit/banking-client.test.ts
npm.cmd run test:contract -- --run tests/contract/openapi.test.ts
npm.cmd exec vitest -- run --config vitest.integration.config.ts tests/integration/banking-account-foundation.test.ts
npm.cmd exec vitest -- run --config vitest.security.config.ts tests/security/bank-account-database-security.test.ts
```

The two database commands above and every later integration/security command
must run only after the isolated `DATABASE_URL`, `TEST_SOURCE_DATABASE_URL` and
`TEST_SOURCE_BOOTSTRAP_DATABASE_URL` variables in section 12 are set to the
same newly created disposable database. Do not use the repository
`test:integration` wrapper for this phase because it overwrites the caller's
database URL with the shared `nexora_source_test` database.

**Gate**

- Existing Bank Account tests pass or any pre-existing failure is isolated.
- Each new test fails for a documented missing-feature reason, not a broken
  fixture, stale database or unrelated compile error.

## 6. Wave 1 — Contracts and additive schema

### BP-01 — Add strict payment contracts, OpenAPI and generated client methods

**Files**

- Modify: `packages/contracts/src/banking/index.ts`
- Modify: `packages/contracts/src/index.ts` only if new exports are required
- Modify: `packages/contracts/src/openapi-c4.ts`
- Modify: `packages/contracts/src/generate-client-c4.ts`
- Regenerate: `app/lib/api/generated.ts`
- Regenerate: `openapi-v1.json`
- Modify: `tests/unit/banking-contracts.test.ts`
- Modify: `tests/contract/openapi.test.ts`

**Contracts**

1. Add `BankPaymentState` with exactly `draft`, `submitted`, `approved`,
   `rejected`, `posted`, `reversed`.
2. Add bounded payment-method values. The first slice supports general-ledger
   payment capture only; method labels must not imply a transmitted bank file.
3. Add line schemas with stable line ID/order, document date, external/document
   references, method, nominal account ID, required narration, positive decimal
   amount and a bounded dimensions object. Accept 1–200 lines; reject amount
   strings with more than 30 integer digits or 8 fractional digits before they
   can reach PostgreSQL `numeric(38,8)`. Bound narration/reference lengths and
   serialized dimensions size.
4. Add create and update requests. Create accepts company, Bank Account,
   posting/value dates and lines. Update accepts `expected_version` and the
   editable fields; it cannot accept tenant, lifecycle, total, bank-control
   account, currency conversion, actor, audit or journal references.
5. Add submit, decision, post and reverse requests. All carry
   `expected_version`; decision supports approve/reject; reject and reverse
   require reasons; approval reason becomes mandatory at runtime for override.
6. Add paginated list query/response contracts with company, Bank Account,
   state, date range, bounded search, bounded sort, limit and cursor.
7. Add payment detail with persisted lines, lifecycle timestamps/actors, safe
   timeline, pre-posting accounting preview, masked Bank Account, journal/event
   references, and the two established override presentation booleans.
8. Add directory contracts for active eligible Bank Accounts and bounded
   nominal-account search. Nominal projections expose account ID/code/name,
   type and `required_dimensions`, never unrestricted ledger data.
9. Add mutation results that report ID, generated reference, actual state,
   version, platform audit ID and replay status. Posting/reversal results also
   return their safe event/journal references.
10. Register these exact versioned operations:
    - `GET /banking/payments`
    - `POST /banking/payments`
    - `GET /banking/payments/options`
    - `GET /banking/payments/nominal_accounts`
    - `GET /banking/payments/{paymentId}`
    - `PATCH /banking/payments/{paymentId}`
    - `POST /banking/payments/{paymentId}/submit`
    - `POST /banking/payments/{paymentId}/decision`
    - `POST /banking/payments/{paymentId}/post`
    - `POST /banking/payments/{paymentId}/reverse`
11. Generate client methods from the repository generator; never hand-edit only
    `app/lib/api/generated.ts`.

**Verification**

```powershell
npm.cmd run api:generate
npm.cmd run api:check
npm.cmd run test:contract -- --run tests/contract/openapi.test.ts
npm.cmd run test:unit -- --run tests/unit/banking-contracts.test.ts
git diff --check
```

**Gate**

- OpenAPI, Zod schemas, exported TypeScript types and generated browser methods
  agree on paths, HTTP methods and payloads.
- Strict schemas reject browser-controlled authority and unbounded filters.

### BP-02 — Add Platform 0008 and Finance 0005 migrations

**Files**

- Create: `packages/db/source-migrations/platform/0008_idempotency_patch_method.forward.sql`
- Create: `packages/db/source-migrations/finance/0005_finance_posting_bank_payments.forward.sql`
- Modify: `tests/integration/postgres-migrations.test.ts`
- Modify: `tests/security/bank-payment-database-security.test.ts`

**Schema work**

1. In Platform 0008, drop and recreate only the named
   `platform_admin_idempotency_method_check` constraint so `method` accepts
   `POST` and `PATCH`. Do not edit Platform 0002 or change the table primary
   key. Record ledger identity exactly as
   `('platform',8,'idempotency_patch_method')` and test that other methods are
   still rejected.
2. In Finance 0005, add seven active permission definitions using the approved exact keys:
   `banking.payment.read`, `.create`, `.update`, `.submit`, `.approve`,
   `.post`, `.reverse`.
3. Create `bank_payment_sequence` keyed by tenant, company and fiscal year. A
   transaction locks/advances this row; the generated reference is unique by
   tenant/company and is never derived in the browser.
4. Create `bank_payment` with tenant/company/Bank Account identity, reference,
   posting and optional value dates, transaction/base currency, optional
   exchange-rate ID/value, server-maintained total, lifecycle state, row
   version, complete actor/time/reason evidence and Finance posting/reversal
   links.
5. Create `bank_payment_line` with tenant and company identity, stable ID/order,
   document facts, bounded method, nominal account, narration, amount and
   dimensions. Its amount is positive `numeric(38,8)` and line count is bounded
   to 200 by the contract plus submission guard.
6. Create append-only `bank_payment_event` with safe state metadata,
   correlation/idempotency, actor, platform audit and optional approval
   override references. Never copy account secrets or unrestricted reason text
   into the JSON snapshot.
7. Make company integrity relational rather than relying on service checks:
   - add non-destructive unique constraints/indexes required as FK targets for
     `(tenant_id,company_id,id)` on `bank_account`, `account`,
     `financial_period` and `journal_entry`, plus the same unique key on new
     `bank_payment` for its line FK;
   - reference the selected Bank Account from `bank_payment` through
     `(tenant_id,company_id,bank_account_id)`;
   - reference each nominal account from `bank_payment_line` through
     `(tenant_id,company_id,nominal_account_id)` and reference its payment
     through `(tenant_id,company_id,payment_id)`;
   - reference original/reversal journals through
     `(tenant_id,company_id,journal_id)` so a journal from another company
     cannot be linked;
   - retain tenant-scoped FKs to currency/rate/accounting-event authorities,
     then add a payment validation trigger that proves the chosen rate's source
     currency equals payment currency, target equals base currency and
     effective date is on/before posting date; and
   - add a posting-link trigger that proves each linked journal belongs to the
     payment company, uses the linked accounting event as
     `source_type='accounting_event'`, and that the event's source type/ID and
     compensation link identify this exact payment and operation. For a posted
     payment the original journal must be `posted`; for a reversed payment the
     original journal must be `reversed` and its linked compensating journal
     must be `posted`.
8. Add composite foreign keys to security actors, `approval_override_event`,
   `currency`, `currency_rate`, `accounting_event` and
   `platform_admin_audit_event` in addition to the company-inclusive keys
   above. Tenant-global currency/rate rows have no company ID; the pair/date
   trigger supplies the missing semantic integrity.
9. Add indexes for tenant/company/state/posting date/reference pagination,
   Bank Account history, line order and event history.
10. Add database guards that:
   - prohibit payment/event deletion;
   - permit header/line business edits only in `draft`;
   - enforce `draft -> submitted -> approved -> posted -> reversed` and
     `submitted -> rejected` only;
   - require at least one positive line and recomputed persisted total before
     submission;
   - prevent a nominal line from using the selected Bank Account control
     ledger through a line validation trigger;
   - require evidence appropriate to each state;
   - validate any same-actor decision against a matching immutable
     `approval_override_event` for `banking.payment` and
     `banking.payment.approve`;
   - require accounting event/journal references only when posted and both
     original plus compensating references when reversed; and
   - prohibit later changes to submitted line/header business facts.
11. Enable and FORCE tenant RLS on all new tenant-owned tables using the current
   `nexora.tenant_id` policy convention.
12. Insert Finance migration ledger identity exactly as
    `('finance',5,'finance_posting_bank_payments')`.

**Migration discipline**

- Run against a new isolated database first. Do not use a production or shared
  development database for the first application.
- Apply through `migrateSourceSchema`; its established module order installs
  Platform 0008 before Finance 0005, so PATCH idempotency is available before
  payment commands can be exercised.
- The source migration runner wraps each migration in one transaction. Any
  failed statement must leave no partial Finance 0005 ledger entry.
- Inspect all constraints/triggers with integration tests; a successful
  migration command alone is not acceptance.

**Verification**

```powershell
npm.cmd exec vitest -- run --config vitest.integration.config.ts tests/integration/postgres-migrations.test.ts
npm.cmd exec vitest -- run --config vitest.security.config.ts tests/security/bank-payment-database-security.test.ts
```

**Gate**

- A fresh database reaches Platform version 8 and Finance version 5; a second
  migration run is a no-op.
- New tables force RLS, submitted facts/events are immutable, invalid lifecycle
  evidence is rejected, only POST/PATCH idempotency rows are accepted, and
  cross-tenant/company/rate/journal relationships cannot be persisted.

## 7. Wave 2 — Centralized Finance posting boundary

### BP-03 — Implement reusable atomic posting and reversal

**Files**

- Create: `server/api/src/modules/finance/posting/types.ts`
- Create: `server/api/src/modules/finance/posting/source-repository.ts`
- Create: `server/api/src/modules/finance/posting/service.ts`
- Create or modify: `server/api/src/modules/finance/posting/index.ts`
- Modify: `tests/unit/finance-posting.test.ts`
- Create: `tests/integration/finance-posting.test.ts`

**Boundary**

Expose a server-only `FinancePostingService` with `post(client, command)` and
`reverse(client, command)`. The caller supplies an already-open tenant-scoped
`PoolClient`; these methods never call `BEGIN`, `COMMIT`, `ROLLBACK` or acquire
their own pool connection.

The command contains tenant/company, actor, posting date, source identity,
external idempotency key, safe payload hash material, transaction currency and
lines.
It contains no Bank Payment view model. Each line contains an account ID,
transaction debit/credit, dimensions and safe description/source metadata.

**Posting work**

1. Resolve exactly one active base currency and its decimal scale.
2. Validate transaction currency and scale. If it differs from base, select the
   latest direct transaction-to-base rate effective on or before posting date.
   Do not silently invert or triangulate rates in this slice. Reject missing or
   unusable rate authority with a stable Finance domain error.
3. Resolve exactly one `open` Finance period containing the posting date.
   Treat `soft_close` and `closed` as locked.
4. Lock and validate all accounts in the same tenant/company: active,
   non-header, manually postable, and dimensions satisfying each account's
   `required_dimensions` array.
5. Parse and calculate decimals without JavaScript binary floating point.
   Reject source values outside positive `numeric(38,8)`, more than 8
   fractional digits, totals/base conversions beyond 30 integer digits, rate
   values outside positive `numeric(38,18)`, and currency-scale violations.
   Round using each currency's configured scale and reject transaction or base
   imbalance; never create a plug line or let PostgreSQL silently round an
   out-of-contract value.
6. Canonicalize the command and hash it. Derive the internal Finance event key
   server-side as `fin:<sha256(sourceType + "\n" + sourceId + "\n" + operation
   + "\n" + externalIdempotencyKey)>`. This scopes the tenant-unique
   `accounting_event.idempotency_key` by source, operation (`post` or `reverse`)
   and the external request key while remaining below 255 characters. Reuse an
   event only when source, operation-derived key and payload hash all agree;
   otherwise return a stable 409 conflict.
7. Execute an original posting in the only sequence accepted by the existing
   guards: insert `accounting_event` as `received` with `posted_at=null`;
   transition it `received -> validated`; allocate an entry number by locking
   `journal_entry_sequence`; insert the journal as `draft`; insert all journal
   lines; update the journal `draft -> posted` with period/number/`posted_at`;
   finally update the event `validated -> posted` with `posted_at`. Do not skip
   the validated state and do not mark the event posted before the balanced
   journal update succeeds.
8. Use `source_type='accounting_event'` and the event ID as journal source so
   the existing controlled-source unique index prevents duplicate journals.
9. Execute a reversal through the same guarded states: lock the original posted
   journal/event and reject an existing reversal; insert a new compensating
   event as `received` with `compensates_event_id`; transition it to
   `validated`; insert a draft reversal journal with `reverses_journal_id` and
   exact opposite lines; post the reversal journal; update the original journal
   from `posted -> reversed` with `reversed_by_journal_id` (the only mutation
   its guard allows); finally transition the compensating event
   `validated -> posted`. Link both pairs without changing original lines or
   original event payload.
10. Return typed IDs, entry number, resolved period/rate and replay indicator;
    never expose raw SQL or infrastructure errors.

**Tests**

- Unit: decimal parsing/rounding, balance, dimensions, account eligibility,
  period rules, base currency and FX selection, payload hash stability.
- Integration: one journal/event, exact lines, sequence concurrency,
  idempotent replay, different-payload conflict, rollback after injected
  failure, period lock, missing FX, inactive/header account, duplicate reversal
  and original immutability.

**Verification**

```powershell
npm.cmd run test:unit -- --run tests/unit/finance-posting.test.ts
npm.cmd exec vitest -- run --config vitest.integration.config.ts tests/integration/finance-posting.test.ts
npm.cmd run typecheck
npm.cmd exec eslint -- server/api/src/modules/finance/posting tests/unit/finance-posting.test.ts tests/integration/finance-posting.test.ts
git diff --check
```

**Gate**

- No Banking import exists in the Finance posting module.
- A failed posting leaves no accounting event, journal, lines or consumed final
  payment state.
- A reversal is compensating and the original journal remains immutable.

## 8. Wave 3 — Banking payment lifecycle and API

### BP-04 — Implement the isolated payment repository and service

**Files**

- Create: `server/api/src/modules/banking/payments/source-repository.ts`
- Create: `server/api/src/modules/banking/payments/service.ts`
- Modify: `server/api/src/modules/banking/source-repository.ts`
- Reuse without weakening: `server/api/src/modules/banking/session-context.ts`
- Reuse: `server/api/src/modules/security/approval-override-writer.ts`
- Modify: `tests/integration/banking-payments.test.ts`
- Modify: `tests/integration/source-security-fixture.ts`
- Create: `scripts/provision-bank-payments-uat.ts`
- Create: `tests/integration/bank-payments-uat-provisioning.test.ts`
- Modify: `package.json`

**Repository work**

1. Define a payment-specific repository class. Do not put payment SQL in the
   Bank Account repository and do not let Finance depend on it.
2. Add bounded company-scoped list/detail reads with stable cursor pagination.
   One row represents one persisted payment header; expose line count and a
   safe summary narration without duplicating a payment per line.
3. Add options and nominal-account reads. Only active Bank Accounts are payment
   eligible. Nominal accounts must be active, non-header, manually postable,
   in the selected company and different from the Bank Account control ledger.
4. Generate the reference by locking `bank_payment_sequence` in the create
   transaction. Resolve Bank Account currency on the server.
5. Create/update drafts by replacing/upserting validated line facts inside one
   transaction, recomputing total from persisted lines and advancing row
   version. Update is valid only in draft and uses the real HTTP method `PATCH`
   in idempotency evidence.
6. Submit only a valid draft with at least one complete line, eligible accounts,
   available base/rate authority and posting-date period. Submission freezes
   facts but does not post.
7. Decide only `submitted` payments. Use `evaluateApprovalActor`; write the
   existing immutable override event only for an eligible same-actor decision,
   with a mandatory reason and matching Bank Payment evidence. Ordinary
   distinct approval remains reason-optional; rejection always requires a
   reason.
8. Post only an `approved` payment with `banking.payment.post`. Revalidate all
   facts inside the transaction, derive nominal debit lines and the single Bank
   Account control credit, invoke Finance using the same client, append Banking
   plus platform audit evidence, then mark payment posted and link returned
   Finance IDs. Never mark the payment first.
9. Reverse only a `posted` payment with `banking.payment.reverse` and mandatory
   reason. Invoke Finance reversal in the same transaction, append evidence,
   then mark the payment reversed and retain both original and reversal links.
10. Reuse the existing `platform_admin_idempotency` convention with canonical
    payload fingerprints, true HTTP method/path (`PATCH` for draft update) and
    replay/conflict behavior enabled by Platform 0008. When calling Finance,
    pass the external action key and source ID/operation separately so Finance
    derives its scoped internal key; never pass the raw browser key as the
    tenant-global accounting-event key. Do not make idempotency uniqueness
    depend on browser timestamps.
11. Append one immutable `bank_payment_event` and one hash-chained platform
    audit record per non-replayed action. Safe snapshots contain IDs, state,
    totals and boolean override indicators, not full reason/narration text or
    Bank Account secrets.
12. Update the controlled test fixture with maker payment read/create/update/
    submit permissions and checker read/approve/post/reverse permissions. Keep
    ordinary actor separation explicit. The governed super-admin fixture must
    receive all seven exact permissions plus `platform.approval.override`.
13. Add an idempotent, isolated-UAT-only provisioner and package script
    `uat:provision-bank-payments`. It must require an explicit UAT confirmation,
    use `DATABASE_URL`, reuse the existing `r06.maker`, `r06.checker` and
    `r06.target` identities created by `uat:provision-c4-auth`, and never
    print/store passwords. It creates or verifies:
    - exact payment permissions and company access for the separate ordinary
      maker (`r06.maker`), checker (`r06.checker`) and poster (`r06.target`);
    - active base/transaction currencies and a dated direct FX rate;
    - fiscal calendar plus an open `financial_period` covering the acceptance
      posting/reversal dates;
    - bank-control and nominal accounts with required dimensions; and
    - one active governed synthetic Bank Account by exercising the Bank Account
      repository create/submit/distinct-approve workflow (not by forging an
      active row).
    The command must fail closed if matching authority already exists with
    conflicting configuration. Its output contains only safe IDs/counts. Add a
    focused integration test proving repeat provisioning is idempotent and the
    three ordinary roles remain separated.
14. Update the existing Bank Account ledger projections so both `posted` and
    `reversed` original journals remain part of historical ledger effects; the
    compensating posted journal then nets the original effect to zero. Search
    all account-balance, movement and reconciliation projections for the same
    `journal_entry.status='posted'` assumption, update only affected Banking
    consumers, and add regression assertions for pre-reversal balance,
    post-reversal balance and last movement.

**Service work**

- `BankingPaymentService` exposes list/options/nominals/get/create/update/
  submit/decide/post/reverse and delegates domain mutations to the payment
  repository.
- Map Finance failures to stable Banking problem codes such as
  `PAYMENT_PERIOD_LOCKED`, `PAYMENT_FX_RATE_UNAVAILABLE`,
  `PAYMENT_ACCOUNT_INVALID`, `PAYMENT_VERSION_CONFLICT` and
  `PAYMENT_IDEMPOTENCY_CONFLICT`; never return database messages.

**Verification**

```powershell
npm.cmd exec vitest -- run --config vitest.integration.config.ts tests/integration/finance-posting.test.ts tests/integration/banking-payments.test.ts tests/integration/bank-payments-uat-provisioning.test.ts
npm.cmd exec vitest -- run --config vitest.integration.config.ts tests/integration/banking-account-foundation.test.ts
npm.cmd run typecheck
git diff --check
```

**Gate**

- Every mutation commits Banking state, payment event, Finance records when
  applicable, platform audit and idempotency response atomically.
- Ordinary self-approval is denied; governed override produces exactly one
  immutable event; posting still requires its separate permission.

### BP-05 — Compose authenticated `/api/v1/banking/payments` routes

**Files**

- Modify: `server/api/src/modules/banking/router.ts`
- Modify: `server/api/src/app.ts` (mandatory composition boundary)
- Modify: `server/api/src/server.ts`
- Modify: `tests/unit/banking-api-router.test.ts`
- Modify: `tests/integration/banking-payments.test.ts`

**Work**

1. Expand `BankingRouterDependencies` to compose distinct account and payment
   repositories/services without weakening existing Bank Account routes.
2. Parse all query/path/body inputs with contracts. Set no-store responses and
   use the standard safe problem format.
3. Require trusted origin, CSRF and `Idempotency-Key` for every mutation,
   including `PATCH`.
4. Continue using `loadBankingSessionContext(req, dependencies, true)` so
   tenant-header mismatch, invalid session, CSRF and impersonated mutation are
   rejected before payment persistence.
5. In `server.ts`, instantiate one Finance posting repository/service, inject
   it into the payment repository, and supply both account and payment
   repositories to `createApp`.
6. In `app.ts`, extend `AppDependencies` with the payment repository, and pass
   both repositories into `createBankingRouter`. This edit is mandatory rather
   than conditional: production must not construct payment routes through an
   implicit import/global. Router unit fixtures must provide explicit account
   and payment doubles. Do not expose a public Finance posting HTTP endpoint.
7. Extend `banking_foundation` readiness to require `bank_payment`,
   `bank_payment_line`, `bank_payment_event` and core Finance journal relations.

**Verification**

```powershell
npm.cmd run test:unit -- --run tests/unit/banking-api-router.test.ts
npm.cmd exec vitest -- run --config vitest.integration.config.ts tests/integration/banking-payments.test.ts
npm.cmd run typecheck
npm.cmd exec eslint -- server/api/src/modules/banking/router.ts server/api/src/modules/banking/payments server/api/src/modules/finance/posting server/api/src/app.ts server/api/src/server.ts
git diff --check
```

**Gate**

- Every documented endpoint has one tested route and no route accepts tenant,
  actors, lifecycle, totals or ledger authority from the client.
- Bank Account APIs remain backward-compatible and their focused tests pass.

## 9. Wave 4 — Browser data boundary

### BP-06 — Extend the generated-client Banking adapter

**Files**

- Modify: `app/features/banking/api/banking-client.ts`
- Modify generated file only via BP-01 generator:
  `app/lib/api/generated.ts`
- Modify: `tests/unit/banking-client.test.ts`

**Work**

1. Add typed methods for payment list, options, nominal search, detail, create,
   update, submit, decision, post and reverse.
2. Centralize query encoding and keep cursor/date/search bounds typed.
3. Pass CSRF, idempotency and expected version only to generated mutation
   methods. Generate a fresh key per user action and retain it only for retry of
   that exact payload.
4. Preserve `ApiError` codes/correlation IDs for views; do not convert all
   conflicts and permission failures into a generic success toast.

**Verification**

```powershell
npm.cmd run test:unit -- --run tests/unit/banking-client.test.ts
npm.cmd run api:check
npm.cmd run typecheck
git diff --check
```

**Gate**

- UI code can reach payment data only through `BankingApiClient` and the
  generated client.

## 10. Wave 5 — Approved UI integration

### BP-07 — Replace the Bank Payments fixture list

**Files**

- Create: `app/features/banking/views/banking-payments.tsx`
- Modify: `app/shell/prototype-content.tsx`
- Modify: `app/shell/prototype-shell.tsx`
- Modify after acceptance only: `app/shell/config/prototype-data.ts`
- Do not delete yet: `app/features/banking/model/banking-profile.ts`
- Modify: `tests/unit/banking-payments-components.test.ts`

**Work**

1. Route only `bank-payments` to the new live view before the generic
   `MaturedListView` fallback. Leave receipts and later Banking screens on their
   explicit prototype paths.
2. Reuse `useSession`, `BankingApiClient`, shared shadcn primitives and the
   existing dense table hierarchy.
3. Implement company, active Bank Account, state, posting-date range, search,
   sort and cursor paging against the server.
4. Render persisted reference, posting/value dates, masked Bank Account, safe
   narration summary, currency, line count, total and actual lifecycle state.
5. Implement session loading, data loading, empty, safe error/retry,
   permission-denied and success states. Clear stale rows when scope/filter
   changes or a request fails.
6. Navigate row selection with the persisted payment ID in the hash route:
   `/#/banking/transaction-detail/{encodedPaymentId}`. Display the payment
   reference, but do not use it as identity and do not rely on component/shell
   state for reload.
7. Keep export disabled with an honest explanation.
8. Update `prototype-shell.tsx` so the `PrototypeContent.onNavigate` adapter
   forwards its optional third `recordRef` argument to `navigate`; retain the
   existing URL encoder/parser and back/forward synchronization.
9. During implementation, activate the live route only on the feature branch
   while its catalogue/status still says prototype. After the full browser
   gate passes, make a separate small activation change in
   `prototype-data.ts` (or the established status override) to mark Bank
   Payments backend connected. A merged status badge must never precede
   acceptance evidence.

**Gate**

- No `bankingProfile.pages['bank-payments']` row reaches the live page.
- Permission and API failures never reveal or substitute prototype data.

### BP-08 — Connect Add Bank Payment to persisted drafts and submission

**Files**

- Create: `app/features/banking/views/banking-payment-entry.tsx`
- Modify: `app/shell/prototype-content.tsx`
- Modify: `app/shell/prototype-shell.tsx` only through the shared routing change
- Preserve for receipts/prototypes: `app/features/banking/views/banking-batch-entry.tsx`
- Reuse where applicable: `app/components/ui/*`
- Modify: `tests/unit/banking-payments-components.test.ts`

**Work**

1. Preserve the approved multi-line visual hierarchy, responsive table,
   accounting preview and terminology while making payment-specific behavior a
   live component. Do not turn the receipt prototype live in this slice.
2. Load companies/eligible Bank Accounts and nominal accounts from APIs. Use
   IDs in requests and show safe code/name labels.
3. Display the reference only after server draft creation. Do not predict it in
   the browser. After first persistence replace/navigate to
   `/#/banking/add-bank-payment/{encodedPaymentId}`; on initial render read
   `context.recordRef` and reload that draft so refresh/back/forward do not
   discard identity.
4. Use decimal strings in component state. Client validation mirrors required
   dates, account, narration, method, positive amount and dimensions but does
   not replace server validation.
5. `Save Draft` creates or version-updates a payment. It handles disabled/
   pending state, field problems, 409 conflict and persisted success.
6. `Submit` first persists current valid draft when needed, then sends the
   separate submit command. It navigates to detail on success; it never calls
   approval or posting.
7. Label the journal as a preview. Resolve the bank side from the selected
   server Bank Account projection, not `banking-master-data.ts`.
8. Disable the attachment control and explain that secure upload is not yet
   implemented. Remove local file-name success behavior.
9. Cancel/back navigation warns about unsaved edits but does not delete a
   persisted draft.

**Gate**

- Refreshing a saved draft reloads exact PostgreSQL-backed lines.
- The browser cannot submit a control account, server-derived total, lifecycle
  or journal ID.

### BP-09 — Connect Bank Transaction Detail lifecycle workspace

**Files**

- Create: `app/features/banking/views/banking-payment-detail.tsx`
- Modify: `app/shell/prototype-content.tsx`
- Modify: `app/shell/prototype-shell.tsx` only through the shared routing change
- Preserve for other prototype transaction types:
  `app/features/banking/views/banking-transaction-detail.tsx`
- Reuse: `app/shared/ui/super-admin-override-warning.tsx`
- Modify: `tests/unit/banking-payments-components.test.ts`

**Work**

1. Route a selected persisted Bank Payment to the live payment detail using
   `context.recordRef` as its payment ID; keep the existing fixture detail only
   for receipts/transfers/cheques not included in this slice. Direct URL load
   and reload of `/#/banking/transaction-detail/{encodedPaymentId}` must fetch
   the record without prior list state.
2. Show header, lines, actual totals, masked Bank Account and lifecycle timeline
   from the detail response. Before posting show an explicit preview; after
   posting show actual entry number and masked accounting/event references.
3. Show buttons only with the exact session permission and compatible state:
   edit draft, submit draft, approve/reject submitted, post approved and
   reverse posted.
4. The server remains authoritative. A hidden button is not authorization and
   every stale version response must produce a refresh-safe conflict state.
5. For a maker viewing their own submitted record, show ordinary maker/checker
   denial. For an eligible super administrator, show
   `SuperAdminOverrideWarning` and require a nonblank reason before decision.
6. Distinct checker approval may accept an optional reason; rejection and
   reversal always require a reason.
7. Post and reverse use explicit confirmation states and remain separate from
   approval. A posting failure leaves the view approved/unposted after reload.
8. Implement loading, not-found-within-scope, denied, error/retry, busy,
   conflict and success states. Refresh after every successful mutation.
9. Remove prototype claims and visual-only action callbacks only after live
   browser acceptance passes. Keep print disabled until a real endpoint exists.

**Focused UI verification**

```powershell
npm.cmd run test:unit -- --run tests/unit/banking-payments-components.test.ts tests/unit/banking-client.test.ts tests/unit/super-admin-override-warning.test.ts
npm.cmd run typecheck
npm.cmd exec eslint -- app/features/banking/api/banking-client.ts app/features/banking/views/banking-payments.tsx app/features/banking/views/banking-payment-entry.tsx app/features/banking/views/banking-payment-detail.tsx app/shell/prototype-content.tsx app/shell/prototype-shell.tsx app/shell/config/prototype-data.ts tests/unit/banking-payments-components.test.ts
npm.cmd run build:web
git diff --check
```

**Wave 5 gate**

- The three payment screens use generated APIs only and have no fixture
  fallback.
- Entry/detail IDs survive direct URL load, reload and browser navigation.
- Other Banking pages remain explicitly prototype and continue to render.
- Desktop and narrow-screen interactions preserve labels, focus, table
  semantics and disabled/error states.

## 11. Wave 6 — Verification, rollout and handoff

### BP-10 — Complete database, authorization and regression coverage

**Files**

- Modify: `tests/integration/banking-payments.test.ts`
- Modify: `tests/integration/finance-posting.test.ts`
- Modify: `tests/security/bank-payment-database-security.test.ts`
- Modify: `tests/integration/banking-account-foundation.test.ts` only for
  regression expectations if Finance 0005 changes fixture counts
- Modify: `tests/integration/postgres-migrations.test.ts`

**Required evidence**

1. CRUD within draft, line replacement and optimistic conflict.
2. Submission freezes facts and rejected payment is terminal.
3. Ordinary maker self-approval denied; distinct checker accepted; governed
   super-admin self-decision creates one matching override event.
4. Approval alone creates no journal.
5. Explicit post creates exactly one accounting event, one posted journal and
   expected nominal debits plus derived bank-control credit in both transaction
   and base amounts.
6. Same-key replay returns the original response with no duplicate event,
   audit, journal or sequence; different payload conflicts.
7. Failure injected after Finance preparation rolls back all Banking and
   Finance writes and leaves the payment approved.
8. Closed/soft-close period, missing FX, invalid dimensions, inactive account,
   cross-company Bank Account and company-scope denial.
9. Reverse creates one opposite journal/event, links the original and prevents
   a second reversal. Bank Account balance and last-movement projections count
   the reversed original plus the posted compensating journal exactly once,
   producing the correct net effect rather than dropping the original.
10. RLS and immutable triggers reject cross-tenant access and submitted/posted
    fact changes even when application checks are bypassed in test setup.
11. Existing Bank Account foundation, security override and migration tests
    remain green.

### BP-11 — Run real browser acceptance and update handoff documents

**Files**

- Create: `tests/e2e/bank-payments.spec.ts`
- Update: `docs/architecture/remaining-ui-migration.md`
- Update: `docs/architecture/hr-backend-delivery-plan.md`
- Update status/evidence: approved design and this plan

**Browser flow**

1. Use a fresh isolated PostgreSQL database with synthetic currency, direct FX,
   open period, company, eligible Bank Account and nominal accounts.
2. Sign in as an ordinary maker and open
   `/#/banking/add-bank-payment` through Banking navigation.
3. Create and save a multi-line draft; reload and prove the same reference and
   lines persist.
4. Submit; prove the maker cannot edit or approve it.
5. Sign in as the distinct checker, approve, and verify no journal exists yet.
6. Use an actor with `banking.payment.post`, explicitly post, reload and verify
   exact persisted journal/event/line balance and updated Bank Account ledger
   projection.
7. Reverse with a mandatory reason into an open period; prove the original
   journal is unchanged and the compensating journal is linked and balanced.
8. Repeat a representative submitted payment as `shoaib`; provide a reason,
   self-approve and inspect the immutable override evidence. Posting still uses
   its exact permission/action.
9. Verify restricted and out-of-company sessions receive safe denial, and an
   API failure never displays fixture data.
10. Verify the list, entry and detail at desktop and narrow viewport widths.

**Documentation handoff**

- Mark only Bank Payments list/entry/detail backend connected after all gates.
- Record Platform version 8, Security version 15 and Finance version 7, exact commands/results,
  refresh-safe routes (`/#/banking/add-bank-payment/{paymentId}` and
  `/#/banking/transaction-detail/{paymentId}`) and safe resume point.
- State explicitly that Bank Receipts, Transfers, statements/import,
  reconciliation, charges/interest, cheques/deposits and Treasury remain
  prototype-only.
- Set the next approved development slice to Bank Receipts using the same
  Finance posting boundary; do not start it automatically.

## 12. Exact verification sequence

Use a newly created disposable database name for integration/security/E2E. Do
not reset, truncate or drop the shared development database. The following
PowerShell commands create a new database without enumerating or modifying any
existing database, then point every repository/runtime consumer—including the
plain migration CLI—at the same isolated authority:

```powershell
$bankPaymentsDb = 'nexora_bank_payments_uat_' + (Get-Date -Format 'yyyyMMddHHmmss')
createdb --host 127.0.0.1 --port 55433 --username nexora $bankPaymentsDb
$env:DATABASE_URL = "postgresql://nexora@127.0.0.1:55433/$bankPaymentsDb"
$env:TEST_SOURCE_DATABASE_URL = $env:DATABASE_URL
$env:TEST_SOURCE_BOOTSTRAP_DATABASE_URL = $env:TEST_SOURCE_DATABASE_URL
$env:TEST_SOURCE_REDIS_URL = 'redis://127.0.0.1:56380'
```

If `createdb` is not on `PATH`, use the installed PostgreSQL `createdb.exe`
with the same arguments; do not substitute a script that drops/recreates
`nexora_source_test`. Confirm all three database variables equal the generated
URL before continuing. Supply the existing Banking encryption/auth secrets and
synthetic passwords through the already approved environment mechanism; never
place their values in this plan, source files or command output. Provisioning
requires `NEXORA_ENVIRONMENT`, `NEXORA_UAT_CONFIRM`,
`AUTH_LOGIN_DIRECTORY_SECRET`, `NEXORA_UAT_PASSWORD` and
`NEXORA_SHOAIB_PASSWORD`. Playwright reads usernames from
`NEXORA_BANKING_MAKER_USERNAME`, `NEXORA_BANKING_CHECKER_USERNAME`,
`NEXORA_BANKING_POSTER_USERNAME` and
`NEXORA_BANKING_SUPER_ADMIN_USERNAME`; it uses `NEXORA_E2E_PASSWORD` for the
three ordinary R06 users and `NEXORA_SHOAIB_PASSWORD` for `shoaib`.
`NEXORA_E2E_PASSWORD` and `NEXORA_UAT_PASSWORD` must be sourced from the same
synthetic secret because `uat:provision-c4-auth` persists the latter. Set the
usernames to `r06.maker`, `r06.checker`, `r06.target` and `shoaib`
respectively. Source code must not hardcode a password.

Run in this order:

```powershell
npm.cmd run api:generate
npm.cmd run api:check
npm.cmd run typecheck
npm.cmd run test:contract -- --run tests/contract/openapi.test.ts
npm.cmd run test:unit -- --run tests/unit/banking-contracts.test.ts tests/unit/finance-posting.test.ts tests/unit/banking-api-router.test.ts tests/unit/banking-client.test.ts tests/unit/banking-payments-components.test.ts tests/unit/super-admin-override-warning.test.ts
npm.cmd exec vitest -- run --config vitest.integration.config.ts tests/integration/postgres-migrations.test.ts tests/integration/finance-posting.test.ts tests/integration/banking-account-foundation.test.ts tests/integration/banking-payments.test.ts tests/integration/bank-payments-uat-provisioning.test.ts tests/integration/approval-override-writer.test.ts
npm.cmd exec vitest -- run --config vitest.security.config.ts tests/security/bank-account-database-security.test.ts tests/security/bank-payment-database-security.test.ts tests/security/approval-override-database-security.test.ts
npm.cmd exec eslint -- packages/contracts/src/banking/index.ts packages/contracts/src/openapi-c4.ts packages/contracts/src/generate-client-c4.ts server/api/src/modules/finance/posting server/api/src/modules/banking/payments server/api/src/modules/banking/router.ts server/api/src/app.ts server/api/src/server.ts scripts/provision-bank-payments-uat.ts app/features/banking/api/banking-client.ts app/features/banking/views/banking-payments.tsx app/features/banking/views/banking-payment-entry.tsx app/features/banking/views/banking-payment-detail.tsx app/shell/prototype-content.tsx app/shell/prototype-shell.tsx app/shell/config/prototype-data.ts tests/unit/banking-payments-components.test.ts tests/integration/finance-posting.test.ts tests/integration/banking-payments.test.ts tests/integration/bank-payments-uat-provisioning.test.ts tests/security/bank-payment-database-security.test.ts tests/e2e/bank-payments.spec.ts
npm.cmd run build:web
git diff --check
```

Do not invoke `npm.cmd run test:integration` for this phase: that package script
hardcodes `nexora_source_test` and would ignore the isolated URL. Direct Vitest
commands above preserve the selected database.

For real runtime verification, migrate the same isolated database, provision
ordinary UAT users plus synthetic currency/period/Bank Account/nominal
authority, and then rerun the governed `shoaib` provisioner so its role receives
all newly active permissions. The provisioners must confirm
`NEXORA_ENVIRONMENT=uat` and `NEXORA_UAT_CONFIRM=nexora-r06-uat`; credential and
secret variables must already be set without echoing them:

```powershell
npm.cmd run db:migrate:source
npm.cmd run uat:provision-c4-auth
npm.cmd run uat:provision-bank-payments
npm.cmd run uat:provision-shoaib-admin
```

Inspect the safe provisioner result and require three distinct ordinary users,
one open period, required currencies/rate, eligible nominal accounts and one
active governed Bank Account. Then start `npm.cmd run dev:api` in terminal A
and `npm.cmd run dev:web` in terminal B with the same environment. Do not start
either process against a different `DATABASE_URL`.

Observe the versioned readiness endpoint:

```powershell
Invoke-RestMethod 'http://127.0.0.1:4000/api/v1/health/ready'
```

Run focused Chromium acceptance with existing-web mode after setting the
synthetic credential variables expected by the spec. Run first while the
feature-branch route is live but the catalogue status remains prototype. After
it passes, apply the small backend-connected status activation and rerun the
same test plus the production build:

```powershell
$env:PLAYWRIGHT_BASE_URL = 'http://127.0.0.1:3000'
$env:PLAYWRIGHT_USE_EXISTING_WEB = 'true'
npm.cmd run test:e2e -- --project=chromium --grep 'bank payments'
npm.cmd run build:web
npm.cmd run test:e2e -- --project=chromium --grep 'bank payments'
```

Remove only the temporary process environment variables after verification;
do not delete the evidence database during the same acceptance run.

## 13. Deployment and rollback discipline

1. Deliver in compatibility order: additive Platform 0008, additive Finance
   0005, Finance/Banking backend, contracts/generated client, feature-branch UI
   route switch, browser acceptance, then the separate status activation.
2. Exercise the real route on the feature branch while the catalogue remains
   prototype. Mark it backend connected only after acceptance. Reverting the
   route/status activation leaves additive schema dormant and does not require
   data destruction.
3. If either migration fails, rely on the migration runner's per-module
   transaction rollback, fix the still-unapplied migration, and rerun on a
   fresh isolated database.
4. Once Platform 0008 or Finance 0005 is recorded anywhere shared, never edit
   or replace it. Corrections require Platform 0009 or Finance 0006 (as
   applicable) with explicit tests.
5. Because both migrations are additive, an application rollback leaves the
   new method allowance, tables and permissions safely available/dormant. Do
   not attempt an emergency down migration, truncate, manual ledger deletion
   or migration-ledger rewrite.
6. A posting/reversal application failure must roll back its open transaction.
   Never repair it by manually updating payment or journal state.
7. Never retry a different payload with the same idempotency key. A user retry
   of the identical command must reuse the key and response.
8. Synthetic acceptance records are retained as auditable UAT evidence until a
   separately approved cleanup procedure exists; immutable journals/events are
   never deleted casually.
9. Commit coherent slices only after their focused gate. Do not stage unrelated
   untracked repository content.

## 14. Completion gates

### Finance gate

- One reusable Finance service is the sole new writer of accounting events and
  journals.
- Period, currency, account, dimensions, rounding, balance, idempotency and
  reversal tests pass.
- No Banking type or route leaks into the Finance module.

### Banking backend gate

- All payment operations are tenant/company scoped, exact-permission checked,
  versioned, idempotent, audited and transactionally safe.
- Ordinary maker/checker and governed override behavior are proven.
- Approved, posted and reversed are observably different persisted states.

### Database gate

- Platform 0008 and Finance 0005 apply cleanly and idempotently to a fresh
  database; POST/PATCH are accepted and all other shared idempotency methods
  remain rejected.
- New tables force RLS and guards reject invalid/partial/duplicate evidence.
- Composite company relationships and rate/journal/event validation triggers
  reject mismatched authority even when called below the service layer.
- Existing migrations are unchanged.

### Frontend gate

- Bank Payments, Add Bank Payment and the selected payment detail use only the
  generated API client and preserve the approved UI.
- Draft/detail identity is encoded in the hash URL and survives direct load,
  refresh and back/forward navigation without shell-local selection state.
- Loading, empty, error, denied, conflict, success and narrow-screen states are
  tested.
- No fixture fallback, fake attachment, fake export, fake print or visual-only
  financial action remains on those live surfaces.

### Acceptance gate

- Automated commands above were actually run and results recorded.
- Real Chromium acceptance proves create, refresh persistence, submit,
  independent approve, explicit post, balanced journal, reversal and governed
  `shoaib` override against synthetic PostgreSQL data.
- API readiness and post/reversal database evidence are observed.
- Account Balances reflects the posted/reversed ledger effect.

The phase is complete only when every gate passes. If browser or database
evidence is missing, report **BACKEND CONNECTED — ACCEPTANCE PENDING**, not
production-ready.

## 15. Explicitly deferred work

This plan does not authorize Bank Receipts, Transfers, AP/supplier allocation,
payroll batch consumption, payment-file generation/transmission, statement
upload/import, reconciliation, charges, interest, cheques, deposits, Treasury
instruments, a public manual-journal API or a second accounting engine. Those
surfaces remain prototype-only until their own vertical slices reuse this
Finance boundary and pass equivalent acceptance.

## 16. Implementation completion record — 2026-10-19

Status: **FUNCTIONALLY INTEGRATED — ACCEPTANCE VERIFIED FOR THE BANK PAYMENTS SLICE**.

The delivered migration ledger is Platform 0008, Security 0015 and Finance
0007. Finance 0006/0007 and Security 0015 are additive corrections required by
the implemented transaction-locking and auditable super-admin posting model;
the earlier Finance 0005 references above remain historical planning context
and must not be used as the final runtime version claim.

Implemented routes:

- `/#/banking/bank-payments` — live company-scoped directory with bounded
  server filtering, sorting and cursor pagination;
- `/#/banking/add-bank-payment` and
  `/#/banking/add-bank-payment/{paymentId}` — persisted multi-line draft,
  reload-safe editing and independent submission; and
- `/#/banking/transaction-detail/{paymentId}` — persisted lifecycle detail,
  independent decision, explicit Finance posting and compensating reversal.
  Legacy receipt, transfer and cheque references on the shared transaction
  detail route remain on the approved prototype implementation.

Observed verification:

- focused frontend/browser-adapter unit suite: 34/34 passed;
- Bank Payment lifecycle integration: 2/2 passed;
- shoaib provisioner role-reuse regression: 1/1 passed;
- Chromium Bank Payments acceptance: 3/3 passed against
  `nexora_bank_payments_uat_20261019_1510`;
- production web build and full TypeScript check passed; and
- API readiness returned `ok` with the web on `http://127.0.0.1:3000` and the
  isolated acceptance API on `http://127.0.0.1:4010/api/v1`.

Read-only PostgreSQL evidence showed two independently approved payments fully
posted and reversed with linked compensating journals. Each original and
reversal journal balanced at XBP 200.00000000 debit and credit. Separate
`shoaib` self-approvals contained an `approval_override_event` linked to the
platform audit event and the normal `banking.payment.approve` permission.

Runtime findings corrected during acceptance:

- the UAT database name must contain an explicit safety word such as `uat`;
  the sample command above now satisfies the provisioner gate;
- `provision-shoaib-admin.ts` now reuses an existing governed
  `super_administrator` role instead of assuming ownership of a fixed role ID;
  and
- payment nominal-account reads and writes exclude reconciliation-required
  bank-control accounts, preventing an ordinary payment line from bypassing
  the deferred transfer workflow.

Safe resume point: start Bank Receipts as a separate vertical slice reusing the
Finance posting boundary. Do not treat Transfers, statements/import,
reconciliation, charges/interest, cheques/deposits or Treasury as live.
