# Bank Account Foundation Production Design

- Status: approved for implementation planning
- Approved: 2026-10-19
- First production surface: Banking & Treasury — Account Balances and Bank Account Setup
- API boundary: `server/api` under `/api/v1/banking`
- Persistence: PostgreSQL through additive migrations in `packages/db`

## Objective

Convert the existing Account Balances and Bank Account Setup prototype into the
first production Banking & Treasury vertical slice. The slice must use the
existing Nexora authentication, authorization, tenant, company, audit,
idempotency, contract-generation and frontend integration conventions. It must
also establish the stable bank-account identity consumed by HR payroll payment
profiles without introducing a second accounting engine.

This slice is intentionally foundational. It makes bank-account master data and
read-only account-balance projections real. It does not enable live financial
posting before the Finance accounting-event and posting services can enforce
the required accounting invariants.

## Current evidence

- `app/features/banking` is an isolated UI/UX prototype backed by deterministic
  fixtures and component-local state.
- `BankingTransactionForm` explicitly performs no transmission or persistence.
- `server/api` has no Banking router, service or repository.
- `packages/contracts` has no Banking contracts or generated Banking client.
- Finance migration `0001_finance_foundation` contains a minimal `bank_account`
  table linked to company and Chart of Accounts records.
- The Finance design documents mark the accounting-event and core posting
  services as not built.
- HR migration `0020_governed_payroll_payment` stores
  `finance_bank_account_id` on payment export profiles. Banking therefore must
  publish stable account identities and governed eligibility rules.

## Decisions

### Delivery approach

Use one production vertical slice:

1. Banking contracts and OpenAPI definitions.
2. Additive PostgreSQL migration.
3. Tenant- and company-scoped repository.
4. Banking service and versioned routes.
5. Integration, security, contract and unit tests.
6. Generated browser client and a feature-level Banking adapter.
7. Live Account Balances and Bank Account Setup screens.
8. Browser acceptance against PostgreSQL.

Other Banking screens remain explicitly marked as prototype until converted by
their own vertical slices. API failure must not substitute fixture data on a
surface declared live.

### Accounting boundary

Bank-account master data may be created and approved before transaction posting
is available. A bank account becomes eligible for operational selection only
after independent approval.

Balances are projections derived from posted `journal_line` records joined
through the bank account's mapped Chart of Accounts record. The bank-account
row never contains a mutable ledger balance.

Non-zero opening balances are unavailable in this slice. A later Finance
posting slice must represent an opening balance as a dated, balanced,
idempotent and auditable accounting event and journal. The web form will explain
this restriction and reject a non-zero opening balance through both the API
contract and server rules.

Available balance, unreconciled count and statement-derived movement data are
nullable until the statement and reconciliation slices exist. The interface
will show an explicit unavailable value rather than fixture data or a fabricated
zero.

### Approval boundary

Activation requires maker/checker separation for every bank account, including
accounts created by administrators. Elevated access does not allow one actor to
both submit and approve the same bank account. This is stricter than ordinary
administrative convenience because an active bank account becomes an authority
for payroll and future financial transactions.

The lifecycle is:

```text
draft -> pending_approval -> active
                          -> rejected
rejected -> draft
active -> inactive -> closed
```

- Drafts may be edited only by an authorized maker while still in `draft`.
- Submission captures immutable review evidence for the submitted version.
- Approval or rejection requires a distinct authorized actor and a reason.
- Rejected records are retained and auditable; corrections create or restore a
  draft according to the final repository convention selected during planning.
- Closed records are retained and cannot be selected for new transactions.
- Destructive deletion is not exposed.

## Data design

Extend the existing `bank_account` authority additively rather than replacing
it. The final migration design must preserve existing composite tenant keys and
foreign keys.

Required business fields:

- Stable account ID and human-readable reference.
- Tenant and company ID.
- Mapped postable Chart of Accounts asset account.
- Account name and type.
- Bank name and optional branch.
- Currency code.
- Masked account-number representation.
- Encrypted account number and deterministic hash for duplicate detection.
- Optional masked/encrypted IBAN and deterministic hash.
- Optional SWIFT/BIC.
- Optional overdraft limit.
- Lifecycle state and optimistic version.
- Creator, submitter, approver/rejector and timestamps.
- Created/updated audit metadata.

Sensitive identifiers must use a dedicated Banking encryption authority. They
must not reuse authentication/session secrets and must never be returned in
plaintext after creation. Logs, audit payloads, errors and idempotency responses
must contain only masked representations or hashes appropriate for duplicate
detection.

Database controls must include:

- Tenant row-level security.
- Composite tenant/company foreign keys.
- A foreign key to the mapped Chart of Accounts record.
- Currency-format, lifecycle and non-negative-limit checks.
- Company-scoped uniqueness for the human-readable reference.
- Tenant/company-scoped duplicate protection for hashed identifiers.
- Indexes supporting company/status/currency filtering and bounded search.
- Guards against mutation of approval evidence and invalid lifecycle changes.

The migration is additive and receives the next Finance schema version. The
existing Finance migration must not be edited.

Before migration, implementation must inspect whether any `bank_account` rows
already exist. A legacy row must not become payroll- or transaction-eligible
merely because its old status was `active`; eligibility requires explicit
approval evidence under the new lifecycle. Any non-empty environment needs a
documented, tested preservation/backfill path before the migration is applied.

## API design

The production API surface is versioned under `/api/v1/banking`.

Initial endpoints:

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/companies` | Return active companies available to the session for Banking use. Prefer a shared company projection if one is established during planning. |
| `GET` | `/accounts` | Bounded account directory with company, search, bank, currency and state filters. |
| `GET` | `/accounts/summary` | Currency totals and account counts derived from approved accounts and posted journal lines. |
| `GET` | `/accounts/{accountId}` | Masked account detail and approval metadata. |
| `POST` | `/accounts` | Create an idempotent draft with a zero opening balance. |
| `POST` | `/accounts/{accountId}` | Update a draft using an expected version. |
| `POST` | `/accounts/{accountId}/submit` | Submit the current version for independent approval. |
| `POST` | `/accounts/{accountId}/decision` | Independently approve or reject a pending account. |
| `POST` | `/accounts/{accountId}/status` | Govern inactive/closed transitions where allowed. |

Mutations require trusted-origin validation, session CSRF, an idempotency key,
an expected record version where applicable, and an auditable reason for
submission/decision/status changes.

List responses are bounded and paginated. Filtering and sorting are performed
server-side. Contracts return standard Nexora problem details and never expose
infrastructure or encryption errors.

## Authorization and isolation

The implementation will follow the existing exact-permission model. Planning
must confirm final registry naming, with the following intended capabilities:

- Read bank-account directories and summaries.
- Create and edit bank-account drafts.
- Submit drafts for approval.
- Approve or reject submitted accounts.
- Change active/inactive/closed status.
- Read sensitive masked detail only where explicitly authorized.

Every repository query is tenant-scoped. Company-specific operations also
verify an active company access grant. Cross-tenant IDs and unauthorized
company IDs return safe not-found or access-denied responses according to the
existing API convention.

Mutation is disabled during impersonation. Maker/checker separation is enforced
by the server and database transaction, not by button visibility.

## Frontend design

The existing approved layout and terminology remain the visual source of truth.
The production integration adds a Banking feature adapter around the generated
`NexoraApiClient`; views do not construct URLs or access browser storage.

### Account Balances

- Load the server-authorized company context.
- Load currency summary cards and paginated account rows from the API.
- Preserve search, bank, currency, nominal-account and state filters.
- Send filter, sorting and pagination state to the server.
- Show masked account identifiers only.
- Support loading, empty, error, permission-denied and retry states.
- Remove the `Prototype only` marker only after browser-to-PostgreSQL acceptance
  succeeds.
- Export is disabled or clearly unavailable until a separately tested export
  endpoint exists.

### Bank Account Setup

- Preserve the current prototype fields and responsive layout.
- Load company and eligible Chart of Accounts options from authorized APIs.
- Save drafts and submit them through distinct server mutations.
- Explain that opening balances must remain zero until Finance posting exists.
- Clear sensitive input values after a successful save; subsequent reads show
  masked values only.
- Present field-level validation and safe server errors.
- Prevent duplicate submission while a mutation is in flight.
- Provide a review/decision surface reachable through Banking navigation for
  authorized checkers.

No hidden page will be created without a navigation path from the Banking
section.

## HR payroll integration

The Banking account ID is the stable value stored by
`hr_payment_export_profile.finance_bank_account_id`. HR must not write Banking
tables or infer eligibility from prototype fixtures.

An HR payment profile may select an account only when Banking confirms that it:

- belongs to the same tenant and company;
- is active and independently approved;
- has the required currency;
- has a valid postable Chart of Accounts mapping; and
- is not closed or inactive.

The first Banking slice establishes this read/eligibility contract. Changing
the existing HR payment-profile flow is outside the slice unless tests reveal a
currently live path that can create an invalid reference. Payroll-to-Banking
payment creation remains a later governed workflow and must ultimately publish
an accounting event rather than write journals directly.

## Transaction and failure behavior

- Create/update/submit/decision operations execute inside explicit database
  transactions.
- Idempotent replay returns the original result without duplicate audit or
  lifecycle effects.
- Conflicting reuse of an idempotency key is rejected.
- Concurrent updates use optimistic version checks.
- Approval revalidates company access, Chart of Accounts eligibility, duplicate
  identifiers and maker/checker separation inside the transaction.
- Encryption failure rolls back the entire mutation.
- The web surface preserves the last successfully loaded projection while
  clearly reporting refresh failures; it never replaces the result with mock
  records.

## Verification strategy

### Contract and unit verification

- Request/response schema validation.
- OpenAPI and generated-client drift checks.
- Route authentication, CSRF, origin and idempotency behavior.
- Frontend adapter query construction and error propagation.
- View loading, empty, error, denied, success and duplicate-submit states.

### PostgreSQL integration verification

- Migration applies from the current source schema and passes migration
  integrity checks.
- Create, replay and conflicting idempotency behavior.
- Tenant and company isolation.
- Permission enforcement.
- Sensitive-value encryption, masking and duplicate detection.
- Draft-only editing and optimistic concurrency.
- Independent approval and self-approval denial.
- Lifecycle transition guards and audit evidence.
- Active account summary calculated from posted journal lines.
- Inactive/closed accounts excluded from HR eligibility.

### Browser acceptance

- Sign in through the real session flow.
- Navigate through Banking to Account Balances.
- Observe a real PostgreSQL-backed empty or populated directory.
- Create and submit a zero-balance account as a maker.
- Approve it as a different checker.
- Refresh and start a new authenticated session; verify persistence.
- Verify the approved account appears in summaries and authorized selection
  flows using masked identifiers.
- Verify unauthorized company and permission-denied behavior.

### Required checks

- Focused unit, contract, security and integration tests.
- `npm.cmd run api:check`
- `npm.cmd run typecheck`
- Focused ESLint for changed files.
- `npm.cmd run build:web`
- Focused Playwright acceptance.
- `git diff --check`

Repository-wide pre-existing failures, if any, must be reported separately and
must not be represented as regressions caused by this slice.

## Out of scope for this slice

- Non-zero opening-balance posting.
- Bank payments, receipts, transfers, deposits, charges, interest, cheques and
  revaluation.
- Statement upload, parser adapters, malware scanning and import history.
- Reconciliation and matching.
- Mutable or manually maintained ledger balances.
- Direct payroll payment creation.
- A duplicate Finance ledger or approval engine.
- Unverified export functionality.

## Subsequent Banking sequence

1. Finance accounting-event intake and core posting prerequisite.
2. Bank Payments.
3. Bank Receipts.
4. Transfers and FX handling.
5. Secure statement import.
6. Reconciliation.
7. Cheques, deposits, charges, interest and revaluation.

Each subsequent screen follows the same contract-to-browser vertical-slice
sequence and remains prototype-labelled until its own persistence,
authorization, accounting and acceptance evidence is complete.

## Completion criteria

This foundation slice is complete only when Account Balances and Bank Account
Setup use the real API and PostgreSQL without mock fallback, authorization and
company isolation are verified, sensitive identifiers remain protected,
maker/checker activation is proven with distinct actors, balances are derived
only from posted ledger records, HR can resolve only eligible active accounts,
and automated plus browser acceptance evidence is recorded.
