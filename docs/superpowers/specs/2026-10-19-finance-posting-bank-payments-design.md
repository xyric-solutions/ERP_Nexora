# Finance Posting Foundation and Bank Payments Design

- Status: approved design — implementation planned
- Approved direction: 2026-10-19
- Scope: reusable Finance posting boundary plus the first live Bank Payments vertical slice
- UI authority: existing Banking prototype screens and navigation
- API authority: `server/api` under `/api/v1`
- Persistence authority: PostgreSQL through additive migrations in `packages/db`

## Objective

Convert Bank Payments from deterministic prototype fixtures into a governed,
PostgreSQL-backed workflow that creates balanced accounting entries through a
single reusable Finance posting boundary. Preserve the approved dense Banking
UI and keep shared accounting rules centralized while Banking owns payment
workflow rules, contracts and presentation.

This design intentionally completes one production vertical slice before
moving to Bank Receipts, Transfers, statement import, reconciliation or the
next ERP module.

## Current evidence

- Bank Account balances, setup, approval and detail are API-backed through
  `/api/v1/banking` and Finance migration 0004.
- Bank Payments, Add Bank Payment and Bank Transaction Detail still use
  `banking-profile.ts`, `banking-master-data.ts` and component-local state.
- The current batch-entry screen explicitly states that it stores and posts
  nothing.
- Finance migration 0001 already defines `accounting_event`, `journal_entry`,
  `journal_line`, `journal_entry_sequence`, `financial_period` and `account`
  with RLS and immutability guards. Platform migration 0001 owns the active
  base-currency and effective exchange-rate authorities.
- No reusable production Finance service currently validates and posts an
  accounting event into a balanced journal.
- The global super-administrator override is available through the shared
  governed approval policy, but ordinary makers remain subject to independent
  approval.

## Locked design principles

1. The browser never writes directly to PostgreSQL or constructs a trusted
   journal.
2. Banking owns payment capture, lifecycle and review rules.
3. Finance owns validation, period selection, numbering, balanced posting,
   reversal and immutable accounting records.
4. Banking calls Finance through an internal server interface in the same
   database transaction; it does not duplicate posting SQL or calculations.
5. Posting is never implied by saving a draft, submitting it or receiving a
   successful HTTP response from a non-posting endpoint.
6. Every mutation is authenticated, tenant/company scoped, permission checked,
   validated, idempotent and audited.
7. Posted journals and payment accounting facts are immutable. Corrections use
   a linked reversal, never an update or delete.
8. Ordinary maker/checker separation remains active. An eligible
   `super_administrator` may self-decide only through the existing explicit,
   reason-required, immutable override mechanism.
9. Impersonated sessions remain read-only for mutations.
10. No prototype fixture is retained as a silent fallback after a screen is
    marked backend connected.

## Architecture and ownership

```text
Bank Payments UI
  -> generated Banking API client
  -> /api/v1/banking/payments
  -> cookie authentication + CSRF + company authorization
  -> Banking Payment Service
  -> Banking Payment Repository
  -> Finance Posting Service (internal server boundary)
  -> accounting_event + journal_entry + journal_line
  -> PostgreSQL
```

### Centralized Finance boundary

Create a focused Finance posting module under
`server/api/src/modules/finance/posting`. Its public server interface accepts a
validated posting command and an existing transaction client. It is reusable
by Banking, Payroll and later Finance consumers without exposing tables or SQL
to those modules.

The Finance posting service owns:

- effective open-period resolution;
- active, postable Chart of Accounts validation;
- tenant/company consistency;
- base-currency and transaction-currency resolution;
- effective exchange-rate selection and deterministic base conversion;
- debit/credit balance validation in transaction and base currency;
- accounting-event idempotency and payload hashing;
- journal numbering through `journal_entry_sequence`;
- atomic journal header and line creation;
- immutable posting completion; and
- linked reversal journals and compensating accounting events.

The Finance posting module does not know about Bank Payment UI fields or
payment approval rules.

### Isolated Banking payment boundary

Create Banking payment code under `server/api/src/modules/banking/payments`
with its own service and repository. The existing account service remains
separate. The Banking router composes both surfaces under the same versioned
module API.

The Banking payment module owns:

- payment header and line validation;
- eligible active Bank Account selection;
- payment lifecycle and actor rules;
- line narration, document references and nominal-account selection;
- approval and super-admin override integration;
- conversion of an approved payment into a Finance posting command;
- payment-specific audit history and response projections; and
- linking a payment to its accounting event, journal and reversal.

## PostgreSQL model

Use one additive Finance migration after version 0004. Do not modify an
existing migration.

### Bank payment header

The persisted header records:

- tenant, company and payment identifiers;
- generated payment reference;
- Bank Account identifier;
- posting date and optional value date;
- transaction currency and resolved base currency;
- exchange-rate reference/value when currencies differ;
- lifecycle state and row version;
- created, submitted, approved, rejected, posted and reversed actor/time
  evidence as applicable;
- mandatory decision or reversal reason where required;
- total amount derived from persisted lines;
- accounting-event, journal and reversal references; and
- immutable audit references.

Lifecycle states are:

```text
draft -> submitted -> approved -> posted -> reversed
                   -> rejected
```

A rejected payment is terminal. A correction creates a new draft so that the
rejected evidence is not rewritten.

The migration also adds a tenant/company/fiscal-year payment-reference
sequence. The repository locks and advances it transactionally when creating a
draft. References are never generated from a list count or browser timestamp.

### Bank payment lines

Each line records:

- stable line identifier and order;
- document date;
- external reference and optional document reference;
- payment method from a bounded server-side set;
- nominal Chart of Accounts identifier;
- required business narration;
- positive payment amount in the Bank Account currency; and
- required accounting dimensions validated against the selected nominal
  account.

The bank-side journal line is derived on the server from the Bank Account's
mapped ledger account. Clients cannot submit or override that ledger account.

Lines are editable only while the payment is a draft. Submission freezes the
business payload. Approval, posting and reversal append evidence and links but
do not mutate the submitted line facts.

### Payment lifecycle events

An append-only Bank Payment event table records every create, update, submit,
approve, reject, post and reverse transition with actor, timestamp,
correlation, idempotency and platform-audit references. Override decisions
also reference the existing immutable `approval_override_event`. Event payloads
contain identifiers and safe state metadata, not account secrets or full free-
text reasons.

### Constraints and indexes

The migration must enforce:

- tenant/company foreign keys for the payment, Bank Account and ledger data;
- unique payment reference per tenant/company;
- unique idempotent accounting source per payment;
- positive line amounts;
- at least one line before submission through repository transaction logic;
- no nominal line may use the same account as the Bank Account control account;
- evidence consistency for every lifecycle state;
- immutable submitted/terminal business data through database guards;
- FORCE RLS on new tables; and
- indexes for company/state/date/reference lists and payment-line retrieval.

## Currency and accounting rules

1. A payment uses exactly one active Bank Account and its configured currency.
2. All payment lines use that transaction currency.
3. The tenant's active base currency is resolved from the existing currency
   authority.
4. For a foreign-currency payment, the server resolves the most recent valid
   rate on or before the posting date. Missing or ambiguous rates block
   submission/posting with a safe validation response.
5. Rounding follows the configured currency scale. The posting service rejects
   any base-currency imbalance rather than adding an undisclosed plug line.
6. Each nominal line is debited for a payment. One derived Bank Account control
   line credits the batch total.
7. Posting requires an open period. `soft_close` and `closed` are treated as
   locked until a later Finance policy explicitly defines controlled posting
   rights.
8. Posting revalidates all accounts, rates, periods, permissions and payment
   state inside the transaction; approval-time validation is not trusted as a
   substitute.
9. A reversal creates opposite journal lines and a compensating accounting
   event in an open period. The original posted journal remains immutable.

The first slice supports governed general-ledger Bank Payments. Supplier/AP
invoice allocation, payroll batch consumption, tax withholding and payment
file transmission remain separate consumer integrations; they must reuse this
posting boundary later.

## Authorization and lifecycle permissions

Add narrowly scoped permissions:

- `banking.payment.read`
- `banking.payment.create`
- `banking.payment.update`
- `banking.payment.submit`
- `banking.payment.approve`
- `banking.payment.post`
- `banking.payment.reverse`

Every query is limited to the authenticated tenant and permitted companies.
Create/update/submit require access to the selected company. Approval requires
the normal approval permission and independent actor, except for the governed
super-admin override. Posting and reversal require their exact permissions and
remain unavailable during impersonation.

Approval does not silently grant posting authority. Posting is a separate,
explicit action so period/account validation failures remain visible and an
approved payment cannot be misrepresented as posted.

Rejection and reversal reasons are always mandatory. An approval reason is
optional for a distinct checker and mandatory when the existing super-admin
override is exercised.

## Versioned API

Add typed contracts and OpenAPI operations under `/api/v1/banking`:

- `GET /payments` — bounded company/state/date/search/sort pagination;
- `POST /payments` — create an idempotent draft;
- `GET /payments/{paymentId}` — header, lines, lifecycle and masked accounting
  references;
- `PATCH /payments/{paymentId}` — version-checked draft update;
- `POST /payments/{paymentId}/submit`;
- `POST /payments/{paymentId}/decision` — approve or reject with reason;
- `POST /payments/{paymentId}/post` — explicit Finance posting;
- `POST /payments/{paymentId}/reverse` — reason-required compensating posting;
- supporting read endpoints for eligible nominal accounts and payment methods,
  reusing existing directories where their contracts already fit.

Mutations require CSRF and an `Idempotency-Key`. Version conflicts return the
standard problem response without partial writes. API responses distinguish
`approved`, `posted` and `reversed`; the UI must not infer posting from an
approval response.

## Approved UI mapping

The visual hierarchy, typography, table density and navigation in the current
prototype remain the design authority.

### Bank Payments list

The existing Bank Payments page becomes a real server-paginated list with:

- company, Bank Account, state and date filters;
- bounded search and sorting;
- persisted reference, dates, masked bank account, narration, currency, total
  and lifecycle state;
- loading, empty, error and permission-denied states; and
- row navigation to the persisted transaction detail.

Prototype summary counts and rows are removed after acceptance. Export remains
disabled until a governed export endpoint exists.

### Add Bank Payment

The existing multi-line `BankingBatchEntry` layout is retained and adapted to
real data:

- Bank Accounts and nominal accounts come from authenticated APIs;
- the generated reference is returned by the server, not predicted by the
  browser;
- the posting date controls the journal period; line dates remain document
  dates;
- line validation mirrors server rules without replacing server validation;
- Save Draft persists a draft;
- Submit routes the persisted draft for approval; and
- the accounting preview is labelled as a preview until actual posting.

The current file-name-only attachment control is not presented as an upload.
It remains disabled with an explicit explanation until the secure document
upload, malware scanning and retention boundary is implemented.

### Bank Transaction Detail

The existing detail route becomes the single governed workspace for:

- persisted header and lines;
- accounting preview before posting;
- actual journal and accounting-event references after posting;
- lifecycle timeline and audit evidence;
- submit, approve/reject, post and reverse actions shown only when eligible;
- the explicit super-admin override warning and mandatory reason; and
- refresh-safe success, conflict and failure states.

No disconnected payment-approval page is added. Pending approvals remain
discoverable through the Bank Payments state filter and open in the existing
transaction-detail route.

## Error handling and failure safety

- Validation problems use the standard field/problem contract.
- Missing permission and company scope return 403 without leaking record
  existence outside scope.
- Missing/closed periods, inactive accounts and absent FX rates return stable
  domain error codes.
- Idempotent retries return the original result. Reusing a key with a different
  payload returns conflict.
- Payment state, override evidence, accounting event, journal, audit event and
  idempotency response commit atomically where they belong to the same action.
- A posting failure leaves the payment approved and unposted with no partial
  journal. It never marks the payment posted early.
- Sensitive Bank Account identifiers remain masked; secrets, ciphertext and
  internal database errors never enter API responses or logs.

## Testing and acceptance

### Automated coverage

- contract and OpenAPI schema tests;
- Finance posting unit tests for balance, rate, period and rounding rules;
- Banking service/repository tests for lifecycle and authorization;
- migration tests and database security tests for RLS, immutability and
  constraints;
- integration tests for create/update/submit/approve/post/reverse;
- ordinary self-approval denial and super-admin override evidence;
- idempotent retry and rollback-after-failure tests;
- frontend tests for loading, empty, error, permission and action states;
- production typecheck, lint and build; and
- focused Playwright acceptance against an isolated local database.

### Manual acceptance flow

1. Sign in with a normal authorized maker.
2. Create and save a multi-line payment draft.
3. Refresh and verify persistence.
4. Submit it and verify it becomes immutable to the maker.
5. Prove the maker cannot approve it.
6. Approve with a distinct authorized checker.
7. Post with an authorized poster and verify the exact balanced journal,
   accounting event, ledger balance and audit records.
8. Refresh/new-session verification proves persistence and recalculated
   authorization.
9. Reverse with a mandatory reason into an open period and verify the original
   journal remains immutable.
10. Repeat representative same-actor approval as `shoaib` and verify the
    immutable override evidence.

## Scope boundaries

This slice does not implement:

- Bank Receipts;
- Bank Transfers or cross-bank FX settlement;
- supplier invoice/AP allocation;
- payroll payment-batch consumption;
- bank-file generation or transmission;
- statement upload/import;
- reconciliation and matching;
- cheque lifecycle, charges, interest or deposits;
- Treasury & Instruments; or
- a second accounting engine inside Banking.

These pages remain explicitly prototype or unavailable until their own
vertical slices pass the same contract-to-browser acceptance gate.

## Delivery order after this slice

1. Bank Receipts using the same Finance posting service.
2. Transfers and controlled FX handling.
3. Secure statement import and import history.
4. Reconciliation and matching.
5. Charges, interest, cheques and deposits.
6. Treasury & Instruments.
7. Audit the dependency graph for the next ERP module before starting it;
   navigation order alone does not override Customer, product, tax, inventory
   or Finance prerequisites for Sales.

## Completion criteria

This slice is complete only when Bank Payments list, entry and detail use the
real generated client, API and PostgreSQL without mock fallback; approval and
posting remain distinct; ordinary maker/checker rules and the governed
super-admin exception are proven; a posted payment creates one balanced,
immutable journal and accounting event; reversals are compensating and
auditable; tenant/company isolation and period locks pass automated tests; and
the real browser workflow is accepted against synthetic local data.
