# Company Multi-Currency and Bank Revaluation Implementation Plan

- Status: FXR-00 through FXR-12 engineering complete; persistent localhost UAT cutover awaits exact target approval
- Date: 2026-10-23
- Design: `../specs/2026-10-23-company-multi-currency-bank-revaluation-design.md`
- Baseline HEAD: `8856b14cbab16076d8bf40bdcb3f8c1466d2b5a6`
- Required migration heads: Platform 0011, Security 0019, Finance 0030
- Deployment target: localhost only

## 1. Outcome

Deliver company-scoped multi-currency configuration and governed bank FX
revaluation. Each company has one mandatory base currency, can activate foreign
currencies using a searchable country catalog, records immutable effective-dated
rates, and limits each bank account to one active company currency. Banking and
Finance convert and report in the company's base currency.

Authorized users can preview foreign bank balances at a closing rate, save and
submit a revaluation, obtain an independent approval, post the unrealized gain
or loss, and automatically reverse the posting on the first day of the next
open accounting period. Shoaib can use the existing audited Super Administrator
override during controlled local testing.

## 2. Non-negotiable invariants

1. The browser uses authenticated `/api/v1` routes and the generated client;
   it never accesses PostgreSQL directly.
2. Every company has exactly one base currency. It becomes immutable after the
   first posted company journal.
3. One company can activate many currencies; one bank account uses exactly one
   active company currency.
4. Rate direction is always one foreign unit to company-base units. Reciprocal
   or triangulated rates are never inferred.
5. Rate corrections preserve the original revision and every historical
   posting reference.
6. Currency, rate, bank-account, policy, revaluation, journal, reversal and
   audit data are tenant- and company-isolated.
7. Revaluation uses posted activity through the selected date and fixed-point
   decimal arithmetic.
8. Draft, submitted, approved, posted and reversed states are explicit. Posted
   facts are immutable.
9. Makers cannot approve their own submissions unless the existing governed
   Super Administrator override succeeds and writes immutable evidence.
10. Posting and reversal are separately permissioned, idempotent, balanced,
    period-controlled and atomic.
11. A posting creates exactly one revaluation journal and one durable reversal
    instruction. The reversal can post only once.
12. No persistent/shared database is migrated without explicit approval of its
    exact identity. No Railway deployment or commit is part of this plan.

## 3. Dependency graph

| Wave | Task   | Depends on             | Deliverable                                                       |
| ---- | ------ | ---------------------- | ----------------------------------------------------------------- |
| 0    | FXR-00 | Approved spec          | Baseline and failure-first characterization                       |
| 1    | FXR-01 | FXR-00                 | Shared contracts, OpenAPI expectations, generated-client failures |
| 1    | FXR-02 | FXR-00                 | Platform 0011, Security 0019 and Finance 0030 database authority  |
| 2    | FXR-03 | FXR-01, FXR-02         | Company currency and rate repository/service authority            |
| 2    | FXR-04 | FXR-01, FXR-02, FXR-03 | Company base-currency integration across posting and Banking      |
| 3    | FXR-05 | FXR-03, FXR-04         | Currency work page, form and company-setup integration            |
| 3    | FXR-06 | FXR-01, FXR-02, FXR-04 | Revaluation preview and draft authority                           |
| 4    | FXR-07 | FXR-06                 | Revaluation approval and posting lifecycle                        |
| 4    | FXR-08 | FXR-07                 | Durable automatic reversal worker                                 |
| 5    | FXR-09 | FXR-03, FXR-07, FXR-08 | Authenticated routes, production composition and readiness        |
| 6    | FXR-10 | FXR-05, FXR-09         | Revaluation work page and form                                    |
| 7    | FXR-11 | FXR-04, FXR-07, FXR-10 | Reporting integration and full security/regression acceptance     |
| 7    | FXR-12 | FXR-11                 | Localhost UAT provisioning and operational handoff                |

Contract generation and migrations are serialized. Frontend code must consume
generated contracts rather than handwritten API response types.

## 4. FXR-00 - Baseline and failure-first characterization

### Recorded baseline (2026-10-26)

- HEAD remains `8856b14cbab16076d8bf40bdcb3f8c1466d2b5a6` with the existing
  user-owned Banking, Finance, Security, worker and documentation changes
  preserved.
- Confirmed source-migration heads are Platform 0010, Security 0018 and Finance 0029.
- Confirmed the current currency catalog contains 20 governed currencies and
  the current base-currency authority is tenant-scoped.
- Confirmed Bank Revaluation is still routed through the generic
  `BankingTransactionForm` prototype mapping.
- Pre-change focused unit baseline: 6 files, 65 tests passed.
- Pre-change contract baseline: 2 files, 13 tests passed.
- Complete pre-existing unit baseline with only the four intentional red-test
  files excluded: 95 files, 570 tests passed. Existing React `act(...)` and
  duplicate-key warnings remain in unrelated Identity, Receipt and Payment
  tests.
- Failure-first baseline: 4 files, 8 tests fail only because the approved
  contracts, migrations, calculation module and live route are absent.

### Inspect

- current Git status, HEAD and overlapping diffs;
- relevant Next.js 16 guides under `node_modules/next/dist/docs/`;
- `currency`, `currency_rate`, `currency_catalog`, `organization_unit`,
  `company_legal_profile`, `bank_account`, `journal_entry` and `journal_line`;
- current Finance currency contracts, service, repository, routes and UI;
- bank-account, payment, receipt, transfer, posting, period and worker patterns;
- security permission migrations and Super Administrator override writer;
- production API and worker composition/readiness;
- migration, contract, unit, integration, security and E2E conventions.

### Add failing tests

- country/currency catalog completeness and mapping behavior;
- company base profile and base-currency lock;
- company currency/rate contracts;
- single-currency bank-account enforcement;
- revaluation calculation, contracts and lifecycle permissions;
- shell routing that must replace the prototype revaluation screen.

### Gate

- Record existing focused-suite results and distinguish pre-existing failures.
- New tests fail only because the approved behavior is absent.
- Stop if a required file has an overlapping user change that cannot be
  preserved safely.

## 5. FXR-01 - Strict contracts and API surface

### Completed (2026-10-26)

- Added strict company currency, country mapping, effective-dated company rate,
  Bank Revaluation preview, detail, lifecycle, accounting-preview and event
  schemas with bounded inputs and decimal-string monetary fields.
- Registered the approved authenticated company-currency and Bank Revaluation
  endpoints in OpenAPI and regenerated the browser client.
- Kept calculated rates, balances, policy snapshots, journal previews, actor
  evidence and Super Administrator override evidence response-only.
- Verified 61 affected unit tests, 17 contract tests, deterministic API
  generation, repository type-check, focused ESLint and `git diff --check`.
- No migration, database mutation, deployment or commit was performed.

### Files

- Extend `packages/contracts/src/finance/currencies.ts`.
- Add focused company-currency contracts under `packages/contracts/src/finance`.
- Add `packages/contracts/src/banking/revaluations.ts` or a non-conflicting
  bank-FX-specific module if reconciliation already owns that filename.
- Update contract indexes, OpenAPI builders and generated-client definitions.
- Add/update contract, OpenAPI and generated-client tests.

### Work

1. Add bounded country search and country/currency mapping schemas.
2. Add company financial profile, currency directory, activation, status,
   dated rate and correction schemas.
3. Add revaluation list/filter, preview, draft/detail, calculation-line,
   lifecycle mutation, accounting preview, event and reversal schemas.
4. Use decimal strings for all monetary and rate values.
5. Bound text, cursors, dates, list sizes, IDs and filters. Reject unknown
   request fields.
6. Model protected snapshot fields as response-only.
7. Generate deterministic OpenAPI and browser client artifacts.

### Gate

- Focused contract tests pass.
- API generation is deterministic.
- `npm.cmd run api:check` passes after implementation.

## 6. FXR-02 - Database authority and permissions

### Completed (2026-10-26)

- Added Platform 0011 with 244 pinned country/currency primary mappings,
  company functional-currency profiles, company currency activation, immutable
  events, legacy-compatible company rate ownership, base-currency locking and
  company RLS.
- Added Security 0019 with exact, independently grantable company-currency,
  rate, policy and Bank Revaluation permissions and no implicit assignments.
- Added Finance 0030 with company policy, revaluation snapshots and lifecycle,
  append-only events, maker-checker and duplicate-effect guards, company RLS,
  journal links and durable reversal scheduling.
- Verified the complete source migration chain on the explicitly disposable
  `nexora_fxr02_migration_test` database: 14 migration integration tests and 8
  focused database-security tests passed.
- The pre-existing `nexora_source_test` database contains legacy companies
  without an active tenant base currency; Platform 0011 correctly rejected it
  and rolled back. It was not repaired or mutated outside the migration attempt.
- No persistent localhost database was migrated and no deployment or commit was
  performed.

### Planned additive migrations

- Platform `0011_company_currency_profiles.forward.sql`
- Security `0019_bank_revaluation_permissions.forward.sql`
- Finance `0030_bank_fx_revaluation.forward.sql`

Reverify actual heads and filenames before creating them. Never renumber or edit
an already applied historical migration.

### Platform 0011

1. Expand immutable country/currency reference data to active ISO country and
   currency mappings with primary-mapping evidence and source version.
2. Add company financial currency profile and company currency activation.
3. Evolve rate evidence for company ownership while preserving legacy rate IDs
   and historical foreign keys.
4. Backfill existing companies from the current tenant base currency during
   migration, failing atomically if the source is missing or ambiguous.
5. Add exact-one-active-profile, base-currency immutability, activation, rate
   revision, RLS, company ownership, audit and lookup constraints.

### Security 0019

Add but do not broadly grant permissions for:

- company currency profile read/manage;
- company currency read/manage;
- company rate read/manage;
- revaluation policy read/manage;
- bank revaluation read/create/update/submit/approve/post/reverse.

Use the existing permission normalization, compatibility and company-role
models. Do not introduce a second authorization system.

### Finance 0030

1. Add company revaluation policy and immutable policy events.
2. Add revaluation header, account calculation snapshots and lifecycle events.
3. Add durable reversal schedule/execution evidence.
4. Add composite tenant/company foreign keys to company, bank account, control
   nominal, policy, rate and journal evidence.
5. Add guarded transitions, posted immutability, calculation consistency,
   unique active run, one-journal and one-reversal constraints.
6. Add indexes for work-page filters, account/date calculations, state and
   pending reversal claims.
7. Apply FORCE RLS and company-access guards to every business/evidence table.

### Gate

- Migration-text/unit tests pass.
- Fresh disposable database reaches Platform 11, Security 19 and Finance 30.
- Upgrade tests prove existing rate, payment, receipt, transfer, statement and
  reconciliation references remain intact.
- Direct-SQL security tests prove tenant/company isolation, immutable evidence,
  protected transitions and duplicate-effect prevention.

Do not apply these migrations to the persistent localhost database in this
task without separate operator approval.

## 7. FXR-03 - Company currency and rate authority

### Backend

- Add country directory, company profile, activation and rate methods to the
  Finance currency repository/service using existing transaction, permission,
  CSRF, idempotency and audit helpers.
- Keep handlers thin and schemas authoritative.

### Behavior

1. Search countries and return deterministic primary/alternate mappings.
2. Read the authenticated company's financial currency profile.
3. Activate a foreign currency and create its initial rate atomically.
4. Prevent base-currency duplication, duplicate activation and unsupported
   country/currency pairs.
5. Create, correct, activate and inactivate dated company rates without
   rewriting facts.
6. Resolve the latest applicable company rate as of a date, with documented
   legacy fallback only for pre-cutover evidence.
7. Reject impersonated privileged mutations and cross-company access.

### Tests

- Unit service tests for validation, rate direction and fallback.
- Route tests for authentication, permissions, CSRF, idempotency and versions.
- Integration/security tests for atomic activation, correction history,
  company isolation and RLS.

### Completion record (2026-10-26)

- Added company profile configuration/read authority, deterministic country
  search, company currency activation/status, immutable company rate lifecycle,
  and an as-of resolver to the existing Finance currency repository/service.
- Activation creates the company currency and its initial rate in one
  transaction. Duplicate/base activation and unsupported country/currency
  mappings fail without partial records.
- Company RLS transactions now set both authenticated tenant and user context.
  Privileged mutations reject impersonation and every company read/mutation
  rechecks a live company-scoped permission.
- Legacy tenant rates are never selected by date. Pre-cutover reads must supply
  the exact persisted legacy rate identifier; the resolver labels that result
  `legacy_pre_cutover`.
- Verified focused unit tests (1/1), combined legacy/company currency
  integration tests (8/8), company-currency database security tests (4/4), API
  TypeScript build, focused ESLint and `git diff --check`.
- HTTP authentication, CSRF, request validation and header/idempotency route
  tests remain dependency-bound to FXR-09, where these service methods are
  registered in production composition.

## 8. FXR-04 - Base-currency integration and bank-account enforcement

### Work

1. Introduce one server-side company base-currency resolver.
2. Update Finance posting to resolve and verify the company base currency.
3. Update payment, receipt and transfer services/repositories/database guards
   to use company currency/rate authority while retaining historical reads.
4. Update bank-account create/activate to require an active company currency.
5. Prevent bank-account currency mutation after financial activity.
6. Remove new uses of prototype `BASE_CURRENCY`; do not perform unrelated
   fixture rewrites.
7. Ensure journal lines continue to persist transaction and base amounts.

### Gate

- Existing payment, receipt, transfer, posting and account tests pass with a
  company base profile.
- New tests cover foreign/base accounts, missing profile/rate, inactive company
  currency, cross-company access and established-account currency mutation.
- Posted historical rows remain readable without recalculation.

### Completion record (2026-10-26)

- Added one company currency authority for base-currency, active source-currency
  and direct effective-dated rate resolution. New financial effects cannot fall
  back to tenant-wide rates; persisted legacy evidence remains readable.
- Finance posting, Bank Payments, Bank Receipts, Bank Transfers and
  reconciliation-adjustment posting now use the same company-scoped authority
  and authenticated database user context while preserving transaction and
  base amounts on journal lines.
- Bank-account create/activate and nominal currency selection require an active
  same-company currency. Database and service guards prevent currency changes
  after journal, payment, receipt, transfer, statement, reconciliation or
  revaluation activity.
- Added failure coverage for missing profiles/rates, inactive and cross-company
  currencies, base and foreign conversion, stored-rate conflicts, and
  established-account currency mutation.
- Verified focused unit tests (21/21), the complete affected integration set
  (59/59), API TypeScript build, focused ESLint and `git diff --check` against
  disposable databases only.

## 9. FXR-05 - Currency work page, form and company setup

### UI work

1. Replace the current card-oriented currency surface with the approved work
   page using API-backed search, status filters and bounded pagination.
2. Build the Add New Currency form with searchable country selection,
   automatic primary currency, alternate currency selection when required,
   effective date and explicit `1 FX = X BASE` rate direction.
3. Add detail/rate-history display and governed status/correction actions.
4. Integrate mandatory base-currency selection into company creation/financial
   activation without making it editable after posting.
5. Preserve accessible labels, focus, keyboard control, busy state, validation,
   permission, empty and API-error behavior.

### Gate

- Component tests cover country search, automatic fill, alternate mapping,
  validation, save/retry and permission states.
- Browser requests use the generated client and contain no fixture fallback.
- Relevant company-setup tests and `build:web` pass.

### Completion record (2026-10-26)

- Added the company-scoped currency work page with company, text and status
  filters, bounded API pagination, the approved dense ERP table, base-currency
  identity, effective rates, statuses and rate-history detail.
- Added searchable country selection, automatic primary-currency fill,
  alternate mapping selection, explicit `1 FX = X BASE` direction, effective
  date, retry-safe mutation feedback and governed currency/rate status actions.
- A company without a financial profile can configure its mandatory base
  currency from the same API-backed workspace. Both Finance Currencies and
  Configuration / Company, Fiscal & Currency route to this surface; the profile
  is read-only after server-side posting locks apply.
- Preserved the Bank Transfer FX policy as a separate permission-gated panel.
  The browser uses only generated company-currency client methods and contains
  no fixture fallback.
- Added the missing profile-configuration and company-rate-status OpenAPI
  operations and regenerated the typed client. HTTP route registration remains
  dependency-bound to FXR-09 production composition.
- Verified component/schema/routing tests (14/14), focused contract tests (4/4),
  API contract synchronization, repository type-check, focused ESLint and the
  Next.js production build.

## 10. FXR-06 - Revaluation preview and draft authority

### Calculation

Use posted journal activity through the requested date:

```text
foreign_balance = sum(debit - credit in bank currency)
carrying_base_balance = sum(base_debit - base_credit)
revalued_base_balance = foreign_balance * closing_rate
adjustment = revalued_base_balance - carrying_base_balance
```

### Work

1. Implement a pure fixed-point calculation module with currency rounding only
   at the approved boundary.
2. Query active same-company foreign bank accounts and their mapped control
   nominals without N+1 queries.
3. Resolve and lock rate evidence as of the date.
4. Exclude base-currency accounts and zero adjustments from posting lines while
   retaining useful zero-balance preview information.
5. Create/update drafts with server-derived balance and policy snapshots.
6. Recalculate on submit under deterministic locks and reject changed source
   evidence with a refresh-required conflict.

### Tests

- Gains, losses, zero adjustments, overdrafts, precision and multiple accounts.
- Posting-date cutoff, corrected rates, inactive account/currency, absent rate
  and concurrent balance changes.
- Query bounds and company isolation.

### Completion evidence (2026-10-26)

- Added fixed-point, signed Bank Revaluation calculations with company-base
  precision rounding, portfolio totals, overdraft handling and no binary-float
  persistence path.
- Added company-scoped preview, directory, detail, draft create/update and
  submit authority. Eligible Bank Accounts are loaded in one bounded aggregate
  query; rate, policy, balance and nominal evidence are server-derived and
  fingerprinted.
- Draft mutations are serializable, permission- and company-scoped,
  impersonation-safe, idempotent and version guarded. Submit recalculates under
  deterministic locks and returns `REVALUATION_REFRESH_REQUIRED` when source
  evidence changed.
- Finance 0030 now snapshots base decimal precision so the database enforces
  the approved company-currency rounding boundary instead of an unconditional
  eight-decimal product.
- Focused unit/migration gate: 3 files, 10 tests passed. Disposable-database
  lifecycle gate: 1 file, 4 tests passed. Database security gate: 2 files,
  8 tests passed. Finance posting regression: 1 file, 7 tests passed after its
  synthetic fixture was constrained to currencies supporting the fractional
  amount used by that test.

## 11. FXR-07 - Approval and posting lifecycle

### Work

1. Implement `draft -> submitted -> approved/rejected -> posted -> reversed`.
2. Freeze calculation facts at submit.
3. Enforce independent approval with delegated authority and the existing
   audited Super Administrator override.
4. Post through the Finance posting service with source type
   `bank_fx_revaluation`.
5. Resolve active company policy snapshot for unrealized gain/loss nominals.
6. For positive bank-asset adjustment, debit Bank/credit Gain; for negative
   adjustment, debit Loss/credit Bank. Derive overdraft direction from signed
   balances rather than UI choices.
7. Persist revaluation state, journal link, audit event and reversal schedule in
   one transaction or compensate safely if the current posting boundary cannot
   participate in the same transaction.
8. Reverse only through a balanced compensating journal.

### Gate

- Unit and integration tests prove balanced journal lines and exact source
  links.
- Approval never posts; posting is explicit and separately authorized.
- Replays return the same result; conflicts and stale versions fail closed.
- Self-approval, cross-company policy/nominal and closed-period attempts fail.

### Completion evidence (2026-10-26)

- Implemented rejected-draft revision, submit, independent approve/reject,
  explicit post and due reversal transitions with optimistic versions,
  idempotency, immutable events and company-scoped permissions.
- Approval is assignment-aware and maker/checker separated. The existing
  governed Super Administrator override writer is reused and its immutable
  evidence is linked to both the decision header and event.
- Posting revalidates the frozen active policy, excludes zero adjustments,
  creates one balanced base-currency Finance journal with source type
  `bank_fx_revaluation`, and atomically creates one next-period reversal
  schedule. Revaluation journal base effects now participate in subsequent
  carrying-balance calculations without changing the foreign balance.
- Manual due reversal uses the Finance compensating-journal boundary, updates
  the durable schedule and header atomically, and is replay safe. Later
  revaluations fail closed while a due earlier reversal is unresolved.
- Disposable-database lifecycle gate: 1 file, 8 tests passed. Combined
  Revaluation, Finance posting and Bank Transfer regression: 3 files,
  17 tests passed. Focused unit/migration gate remains 3 files, 10 tests
  passed; focused ESLint and API compilation passed.

## 12. FXR-08 - Durable automatic reversal

### Completed (2026-10-26)

- Added the bounded tenant-aware reversal worker with database claims using
  `FOR UPDATE SKIP LOCKED`, stale-claim recovery, fixed claim leases and
  exponential retry scheduling.
- Required an explicit authorized worker actor, company-scoped reverse
  permission and production readiness across every active company; no worker
  credential or actor is inferred.
- Posted the exact compensating journal through the existing Finance reversal
  boundary on the scheduled first day of the next open period, atomically
  recording the journal, header state, schedule state and immutable audit
  event.
- Registered the scheduled job in the production worker runtime, healthcheck,
  configuration and graceful shutdown path. Unexpected infrastructure errors
  remain retryable with opaque codes; accounting and authorization failures do
  not bypass validation.
- Verified unavailable-period retry, bounded backoff, concurrent claims,
  restart safety and exactly-once financial effect against a disposable
  PostgreSQL database. Focused worker/migration unit tests (8) and Bank
  Revaluation integration tests (8) passed; worker/API compilation and focused
  ESLint passed.
- No persistent database migration, deployment or commit was performed.

### Work

1. Add a worker job that claims due schedules with database locking.
2. Resolve the first day of the next accounting period and require it to be
   open before posting.
3. Post one compensating journal through the Finance reversal boundary.
4. Persist attempt, success/failure, journal and audit evidence without leaking
   internals.
5. Retry transient failures with bounded backoff; never bypass period,
   permission or accounting validation.
6. Register the job in production worker composition, readiness and graceful
   shutdown.

### Gate

- Worker tests cover concurrent claims, retries, unavailable period, already
  reversed source, restart safety and exactly-once financial effect.
- Readiness reports missing reversal dependencies accurately.

## 13. FXR-09 - Authenticated routes and production composition

### Completed (2026-10-26)

- Exposed authenticated, company-scoped country mapping, company profile,
  company currency and immutable rate-history routes with strict request
  schemas, CSRF/origin checks, idempotency and optimistic version evidence.
- Added the missing versioned Bank Revaluation policy contract and repository
  boundary, including posting-capable nominal validation and immutable policy
  events; Transfer realized-FX policy remains separate.
- Exposed preview, bounded directory/detail/event reads and the full draft,
  submit, approve/reject, post and reverse lifecycle. Handlers delegate to the
  existing services and preserve server-side permission, company isolation,
  maker-checker, audited override, transition, concurrency and posting rules.
- Wired the real currency and Bank Revaluation repositories into production
  API composition and raised Banking readiness to Platform 11, Security 19,
  Finance 30 and every mandatory FXR relation. OpenAPI and the generated web
  client were regenerated and synchronized.
- Verification passed: focused route/readiness/schema tests (43), contract
  tests (4), company/revaluation integration tests (16 after the fixture date
  correction), FXR security tests (8), API compilation, full TypeScript
  type-check and focused ESLint. All database-backed tests used disposable
  databases.
- No persistent database migration, deployment or commit was performed.

### Work

1. Register all approved company-currency, rate, policy, revaluation preview,
   CRUD, lifecycle and event endpoints.
2. Reuse authentication, origin/CSRF, permission, idempotency, `If-Match`,
   correlation and standard-problem middleware.
3. Compose actual repositories, services, database, audit writer, posting
   service, override writer and worker dependencies.
4. Raise production readiness to the new migration heads and mandatory tables,
   policy/currency capabilities and reversal worker.
5. Regenerate and synchronize OpenAPI and the web client.

### Gate

- Route/composition tests cover success plus authentication, permission, CSRF,
  company isolation, self-approval, override evidence, invalid transition,
  stale version, idempotent replay/conflict and dependency failures.
- API build and readiness tests pass against a disposable database.

## 14. FXR-10 - Live Bank Revaluation work page and form

### Completed (2026-10-26)

- Replaced the prototype route with the company-scoped API-backed register,
  preview/draft form and persisted detail route. Filters and pagination are
  bounded and no fixture fallback or posted-record deletion remains.
- Apply is read-only and displays server-authoritative rate, effective-date,
  balance, calculation and total evidence. Save persists drafts only.
- Submit, approve/reject, post and reverse actions are permission/state gated,
  reload authoritative state after mutation and surface journal, reversal and
  immutable event evidence. Impersonated privileged mutations are disabled and
  same-maker approval identifies the audited override requirement.
- Added a bounded authenticated company-scoped eligible-approver directory and
  required the form to persist an approver before submission. The server
  remains authoritative for live permission, company access and maker-checker
  eligibility.
- Focused workspace/shell/routing tests passed 6/6; repository type-check,
  focused ESLint and the production web build passed.

### Work page

- Match the approved reference with filters for currency, bank, date range,
  reference and status; bounded pagination; and columns for voucher, date,
  account, rate, foreign balance, revalued balance, gain/loss and lifecycle.
- Expose only state/permission-appropriate actions. Never expose destructive
  deletion for posted evidence.

### Form

- Match the approved reference with currency, date, Apply, reference/narration,
  account calculation rows and totals.
- Show the authoritative rate and effective date.
- Apply performs read-only preview; Save actions persist drafts only.
- Add submit, decision, post, journal, reversal and audit controls according to
  lifecycle and permission.
- Reload authoritative state after every mutation and survive refresh/deep link.

### Gate

- Unit/accessibility tests cover calculation rendering, totals, gain/loss
  signs, empty/missing-rate/closed-period states, lifecycle actions and errors.
- Shell tests prove Revaluation no longer renders the prototype generic form.
- E2E test proves create, submit, separate approval, post and persisted detail.

## 15. FXR-11 - Reporting and acceptance verification

### Completed (2026-10-26)

- Verified the existing financial reporting feed uses immutable journal
  `base_debit` and `base_credit`, labels the company base currency and includes
  the Revaluation and reversal in their respective posting periods. No
  unrelated reporting redesign was introduced.
- Added and executed isolated browser acceptance for preview, create, assigned
  independent approval, separate posting, original-journal evidence, scheduled
  reversal and persisted reload. The harness creates and removes a random
  PostgreSQL database, object-storage bucket and temporary Next.js directory.
- Made migration and database-security verification use uniquely named
  disposable databases. Corrected two stale reconciliation fixtures and one
  imported-ending-balance nullability defect discovered by the regression run.
- Verified focused FXR unit/readiness/regression suites (69 tests), company
  currency/Revaluation integration (9 Revaluation tests plus affected
  authority suites), database security (12 tests), migrations (14 tests), API
  contract synchronization (17 tests), repository type-check, API/worker/web
  builds, focused ESLint/Prettier and `git diff --check`.
- Full lint and format checks still report the pre-existing repository backlog
  in unrelated prototype/HR/UI files; focused FXR files pass both checks.

### Reporting

1. Verify financial reports aggregate posted `base_debit`/`base_credit` and
   label the company base currency.
2. Include revaluation and reversal journals by their posting dates/periods.
3. Add foreign-currency drill-down only where an existing report pattern
   supports it; do not redesign unrelated reports.

### Acceptance scenarios

1. Company created with PKR base; USD and AED activated from country search.
2. Initial and later dated rates resolve correctly.
3. Separate PKR, USD and AED accounts enforce their fixed currencies.
4. USD and AED balances preview in PKR with correct gains/losses.
5. Maker submits, separate approver approves, poster posts.
6. Shoaib override writes immutable decision evidence when explicitly used.
7. Reversal posts once on the next open period's first day.
8. Cross-company, missing-rate, stale, concurrent, closed-period and duplicate
   attempts fail without partial financial effects.
9. Existing Banking and reconciliation behavior remains intact.

### Required verification

Use repository scripts discovered at execution time. At minimum run:

```powershell
npm.cmd run api:check
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run test:contract
npm.cmd run build:web
git diff --check
```

Also run focused unit, integration, security, migration, API build, worker build
and E2E suites added or affected by each task. Use only disposable databases for
mutation-capable integration/E2E tests. Report pre-existing failures separately.

## 16. FXR-12 - Localhost UAT and handoff

### Engineering completed (2026-10-26)

- Added `scripts/provision-bank-revaluation-uat.ts` and
  `npm.cmd run uat:provision-bank-revaluation` for governed, rerunnable setup of
  one 15-permission company-scoped overlay and Shoaib assignment.
- The script requires a local explicitly isolated database, the confirmed
  Platform 11/Security 19/Finance 30 heads, two distinct tenant Security
  administrators, existing Shoaib company access and existing tenant-scoped
  approval-override authority. Shoaib cannot be maker or checker.
- It verifies normalized company grants, live permissions, exactly one active
  assignment/version and preservation of the separate global override. It
  snapshots rates, Bank Accounts, Revaluations, journals and accounting events
  and fails if provisioning changes financial data.
- A disposable-database integration test passed and proved the second run adds
  no role, assignment, version or audit event and creates no financial facts.
- Added
  `docs/runbooks/company-currency-bank-revaluation-operations.md` with exact
  cutover safeguards, migration/provisioning workflow, lifecycle, reversal
  worker, monitoring and recovery guidance.
- The persistent localhost cutover remains intentionally unexecuted until the
  operator approves the exact database identity and tenant/company/maker/
  checker/Shoaib IDs. No deployment or commit is authorized.

1. Add a rerunnable governed provisioning script for required company-scoped
   permissions and two distinct Security administrators.
2. Provision Shoaib's existing tenant-scoped Super Administrator override only
   through the established security boundary.
3. Verify rerun safety and that provisioning creates no company currency rates,
   bank accounts, revaluations, journals or other financial data.
4. Update the operations runbook, implementation status and remaining UI
   migration safe-resume point.
5. Request exact localhost database identity approval before applying Platform
   11, Security 19 or Finance 30 to a persistent database.
6. Do not deploy to Railway and do not create a commit without permission.

## 17. Safe execution order

1. Execute FXR-00 and report the baseline before editing production code.
2. Complete FXR-01 and FXR-02 in separate reviewable batches.
3. Prove disposable migration upgrades before implementing repositories.
4. Complete company currency authority and core base-currency consumers before
   building either live UI.
5. Complete preview calculations before financial lifecycle/posting work.
6. Complete reversal worker and API composition before enabling Post in the UI.
7. Run full security/regression acceptance before localhost UAT provisioning.
8. Migrate the persistent localhost database only after exact target approval.
