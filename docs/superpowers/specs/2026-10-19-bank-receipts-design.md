# Bank Receipts Production Integration Design

**Date:** 2026-10-19

**Status:** Approved for implementation planning

**Scope:** General-ledger Bank Receipts only

## 1. Objective

Convert the approved Bank Receipts prototype into a production-integrated
vertical slice backed by the versioned API, PostgreSQL and the existing Finance
posting service. The delivered slice must preserve the approved list, dense
multi-line entry and transaction-detail workflows while replacing every receipt
fixture and browser-only financial action on those routes.

This slice records general-ledger receipts from a named payer. It does not
create a Customer or Accounts Receivable engine. Customer identity, invoice
allocation and write-off processing remain deferred until those authoritative
modules exist.

## 2. Current baseline

Bank Payments is the proven implementation reference. It already provides:

- versioned Banking contracts and a generated browser client;
- tenant- and company-scoped services and repositories;
- PostgreSQL-backed draft, approval, posting and reversal lifecycles;
- idempotent mutations and optimistic version checks;
- governed maker/checker controls and the global super-admin override;
- atomic Finance posting, exchange-rate and fiscal-period validation; and
- browser acceptance against an isolated PostgreSQL database.

Bank Receipts currently remains a prototype:

- `/#/banking/bank-receipts` renders fixture rows and totals;
- `/#/banking/add-bank-receipt` uses the presentation-only receipt mode of the
  shared batch-entry prototype;
- receipt transaction detail is not loaded from PostgreSQL; and
- the prototype customer selector and invoice-allocation examples have no
  authoritative backend service.

## 3. Chosen architecture

Bank Receipts will be a dedicated Banking vertical slice:

```text
Bank Receipt UI
  -> generated API client
  -> /api/v1/banking/receipts
  -> receipt service
  -> receipt repository
  -> PostgreSQL
  -> existing Finance posting service and ledger
```

Receipt contracts, persistence, permissions and lifecycle terminology remain
separate from Bank Payments. Receipt posting reuses the established Finance
boundary. Small internal helpers may be shared only when their behavior is
identical and already proven; the implementation must not refactor the accepted
Payment slice into a generic transaction engine.

## 4. Domain model

### 4.1 Receipt header

A receipt header records:

- opaque receipt ID;
- authenticated tenant and selected company;
- server-generated human reference using the Banking sequence convention with
  a receipt-specific `BR-` prefix;
- receiving Bank Account;
- posting date;
- transaction currency inherited from the Bank Account;
- total amount derived from the lines;
- lifecycle state and optimistic version;
- maker, submitter, checker, poster and reverser evidence where applicable;
- rejection or reversal reason where applicable;
- linked Finance accounting-event and journal identifiers after posting;
- linked reversal event and journal identifiers after reversal; and
- creation and update timestamps.

The server derives currency, totals and accounting references. The client may
display them but cannot supply authoritative values.

### 4.2 Receipt lines

Each receipt line records:

- stable line ID and display order;
- document date;
- optional external reference;
- optional document reference;
- receipt method;
- required payer name as a bounded text snapshot;
- credited nominal account;
- optional narration;
- positive transaction-currency amount; and
- validated accounting dimensions using the established Finance shape.

Payer name is deliberately not a foreign key. The repository has no live
Customer or Accounts Receivable authority. No mock customer ID or invoice ID
may be persisted or presented as a validated relationship.

### 4.3 Lifecycle and audit

The lifecycle is:

```text
Draft -> Submitted -> Approved -> Posted -> Reversed
                   -> Rejected
```

- Only drafts are editable.
- Submission freezes the accounting content pending a decision.
- Rejection is terminal for this slice and requires a reason.
- Approval and posting are distinct actions and permissions.
- Reversal creates a compensating journal and never mutates the original
  posted journal.
- Lifecycle transitions write immutable domain events and platform audit
  evidence in the same transaction as the state change.
- A governed same-actor super-admin approval writes the established immutable
  override evidence and requires a reason.

## 5. PostgreSQL design

Use the next additive Finance migration after the current Finance 0007 ledger.
The exact migration number is resolved from the repository immediately before
implementation and must not be hardcoded from this design if another approved
migration lands first.

The migration will add receipt-specific header, line, lifecycle-event and
sequence persistence following the accepted Bank Payment conventions. It must
provide:

- tenant and company foreign keys and row-level isolation;
- Bank Account and nominal-account foreign keys;
- positive amount, valid-state and state-dependent evidence constraints;
- unique tenant/company human references;
- unique ordering within a receipt;
- indexes for company/state/date/reference list access;
- immutable posted accounting linkage;
- idempotency compatibility with the existing API infrastructure; and
- additive, migration-ledger-safe changes without modifying historical files.

No Customer, invoice, remittance attachment or statement-matching tables are
added by this slice.

## 6. Accounting rules

1. A receipt uses exactly one active Bank Account and its configured currency.
2. All receipt lines use that transaction currency.
3. The server resolves the tenant base currency and applicable exchange rate
   through the existing Finance authorities.
4. Each line credits its selected eligible nominal account.
5. One derived Bank Account control line debits the receipt total.
6. A nominal line cannot use a bank-control or reconciliation-required account.
7. Posting requires an open Finance period. Soft-closed and closed periods are
   treated as locked under the current Finance policy.
8. Posting revalidates receipt state, permissions, Bank Account, nominal
   accounts, currency, rate, period and balance while holding the required
   transaction locks.
9. Missing or ambiguous exchange rates block posting without partial writes.
10. Base- and transaction-currency debits must equal credits after configured
    rounding; no undisclosed balancing line is allowed.
11. Reversal uses the existing Finance compensating-posting boundary in an open
    period and preserves the original journal.

## 7. API contracts

Add typed contracts and OpenAPI operations under `/api/v1/banking`:

- `GET /receipts` - bounded company, Bank Account, state, date, search, sort
  and cursor pagination;
- `POST /receipts` - idempotent draft creation;
- `GET /receipts/{receiptId}` - persisted header, lines, lifecycle and masked
  accounting references;
- `PATCH /receipts/{receiptId}` - idempotent, version-checked draft update;
- `POST /receipts/{receiptId}/submit`;
- `POST /receipts/{receiptId}/decision` - approve or reject;
- `POST /receipts/{receiptId}/post` - explicit Finance posting;
- `POST /receipts/{receiptId}/reverse` - reason-required compensating posting;
- `GET /receipt-options` - eligible receiving Bank Accounts and receipt
  methods; and
- `GET /receipt-nominal-accounts` - bounded eligible nominal-account search.

Mutations require the browser session's CSRF token and an `Idempotency-Key`.
State-changing requests include the expected receipt version. API responses
must use the standard problem format and distinguish approved, posted and
reversed states rather than inferring accounting completion from approval.

## 8. Authorization

Add narrowly scoped permissions:

- `banking.receipt.read`
- `banking.receipt.create`
- `banking.receipt.update`
- `banking.receipt.submit`
- `banking.receipt.approve`
- `banking.receipt.post`
- `banking.receipt.reverse`

Every read and mutation is authenticated and limited to the active tenant and
permitted companies. The UI may hide unavailable actions, but the server is the
authority.

Ordinary makers cannot approve their own receipts. The existing global
super-admin exception applies to `shoaib` through the governed override policy:
same-actor approval requires the exact approval and override permissions, a
mandatory reason and linked immutable override/audit evidence. Approval does
not grant posting authority. Posting and reversal require their exact
permissions and are unavailable during impersonation.

## 9. Approved UI mapping

### 9.1 Bank Receipts list

Route: `/#/banking/bank-receipts`

Replace fixture rows and totals with a real server-paginated directory. Preserve
the approved hierarchy and dense table while adding:

- company, Bank Account, lifecycle-state and posting-date filters;
- bounded search over reference, payer, document reference and narration;
- server sorting and cursor pagination;
- persisted reference, date, Bank Account, nominal summary, payer, currency,
  total and lifecycle state;
- loading, empty, error, denied and retry states; and
- URL-based navigation to persisted receipt detail.

Export remains disabled until a governed export endpoint exists.

### 9.2 Add Bank Receipt

Routes:

- `/#/banking/add-bank-receipt`
- `/#/banking/add-bank-receipt/{receiptId}`

Adapt the approved dense multi-line receipt layout to real data:

- one receiving Bank Account per batch;
- multiple lines with payer, nominal account, dates, references, method,
  narration, dimensions and amount;
- a required bounded payer-name input instead of the mock customer selector;
- authenticated Bank Account and nominal-account directories;
- a server-generated receipt reference after the first save;
- Save Draft and Submit for Approval as separate actions;
- reload-safe draft editing and explicit version-conflict recovery;
- an accounting preview labelled as a preview until posting; and
- no fixture fallback.

The prototype `Approve and Close` action is replaced by submission. Approval
occurs only from persisted detail with the required permission and maker/checker
rules. Supporting-document upload remains disabled with an explicit explanation
until secure upload, malware scanning and retention are implemented.

### 9.3 Bank Transaction Detail

Route: `/#/banking/transaction-detail/{receiptId}`

The shared route will distinguish persisted receipt IDs from Payment and legacy
prototype references. The live receipt detail shows:

- persisted header and line content;
- payer, references, narration and accounting dimensions;
- lifecycle timeline and audit evidence;
- accounting preview before posting;
- Finance event and journal references after posting;
- state- and permission-appropriate edit, submit, decide, post and reverse
  actions;
- the explicit super-admin override warning and required reason; and
- refresh-safe loading, error, denied, conflict and success states.

After posting or reversal, Account Balances reflects the resulting ledger
movement through the existing Bank Account/Finance integration.

## 10. Failure safety

- Field validation maps to header or line errors without exposing internals.
- A version conflict preserves unsaved browser input and requires an explicit
  reload of the authoritative record.
- Retrying the same mutation key and payload returns the original result.
- Reusing a mutation key with a different payload returns conflict.
- A posting failure leaves the receipt approved and unposted.
- Receipt state, lifecycle event, audit event, override evidence, Finance
  event, journal and idempotency result commit atomically where they belong to
  the same action.
- Duplicate posting or reversal cannot create duplicate journals.
- Out-of-scope access returns a safe authorization response without confirming
  whether the record exists.
- Bank identifiers are masked and database errors, secrets and ciphertext do
  not enter responses or logs.

## 11. Testing and acceptance

### 11.1 Automated coverage

- contract schemas, generated client and OpenAPI operations;
- migration ordering, constraints, foreign keys and indexes;
- database tenant/company isolation and posted-record immutability;
- repository and service lifecycle rules;
- ordinary self-approval denial and governed super-admin override evidence;
- fiscal-period, account, currency, rate, rounding and balance validation;
- create, update, submit, decide, post and reverse integration;
- idempotent retry, changed-payload conflict and rollback after forced failure;
- frontend loading, empty, error, denied, validation, conflict and action
  states;
- production TypeScript, lint and web build; and
- Playwright acceptance against an isolated synthetic PostgreSQL database.

### 11.2 Browser and database acceptance

1. Sign in as an authorized ordinary maker.
2. Create and save a multi-line receipt draft.
3. Refresh and verify persisted content and URL identity.
4. Edit and submit the receipt.
5. Prove the maker cannot approve it.
6. Approve it as a distinct authorized checker.
7. Post it as an authorized poster.
8. Observe the exact balanced Finance journal, accounting event, ledger effect
   and audit evidence.
9. Refresh or start a new authenticated session and verify persistence.
10. Reverse with a mandatory reason and observe the compensating journal while
    the original remains immutable.
11. Repeat representative same-actor approval as `shoaib` and verify linked
    immutable override evidence.

## 12. Scope boundaries

This slice does not implement:

- Customer master data or customer selection;
- Accounts Receivable invoice allocation, partial allocation or write-offs;
- remittance-advice or other attachment upload;
- Bank Transfers or cross-bank FX settlement;
- statement upload, import, matching or reconciliation;
- charges, interest, cheques or deposits;
- Treasury instruments; or
- a second accounting engine inside Banking.

Those surfaces remain explicitly prototype or unavailable until their own
vertical slices reuse the established production boundaries and pass equivalent
acceptance.

## 13. Completion criteria

The Bank Receipts slice is complete only when:

- list, entry and persisted detail use the generated client, API and PostgreSQL
  with no receipt fixture fallback;
- migrations, contracts, authorization, validation and audit behavior pass;
- ordinary maker/checker separation and the governed `shoaib` override are
  proven;
- posting creates one balanced, immutable Finance journal and accounting event;
- reversal creates a linked compensating journal without changing the original;
- Account Balances reflects posting and reversal;
- production typecheck, lint and build pass; and
- the real browser flow passes against isolated synthetic data.

Until every gate is observed, report the slice as incomplete or acceptance
pending rather than production-ready.

## 14. Subsequent Banking delivery order

After Bank Receipts passes acceptance:

1. Bank Transfers and controlled FX handling.
2. Secure statement import and import history.
3. Reconciliation and matching.
4. Charges, interest, cheques and deposits.
5. Treasury and instruments.

Customer and Accounts Receivable integration is scheduled by its own domain
dependency plan. It may later enrich receipts through governed identifiers and
allocation services, but it must not rewrite posted receipt or Finance history.
