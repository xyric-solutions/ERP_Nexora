# Bank Transfers and Currency Master Production Design

**Date:** 2026-10-22

**Status:** Design approved; awaiting written-spec review

**Scope:** Same-company Bank Transfers, governed Currency Master and Currency
Rates

## 1. Objective

Replace the current prototype-only Bank Transfer surfaces with a production
vertical slice backed by the versioned API and PostgreSQL. The entry experience
must follow the supplied visual reference: a dense multi-row grid with Date,
From Bank, Ref. No., Mode, To Bank, Details and Amount columns, followed by the
total, Add More, Cancel and governed Approve & Close actions.

A Bank Transfer moves money between two Bank Accounts belonging to the same
company. It is not a payment to a supplier, a receipt from a customer or a
manual nominal journal. Users select Bank Accounts; the server resolves their
approved Chart of Accounts control nominals.

This batch also completes a real Currency Master and effective-dated Currency
Rates workflow. No Transfer or currency action may use fixtures or browser-only
persistence.

## 2. Current baseline

Bank Payments and Bank Receipts are the proven implementation references. They
already provide:

- versioned contracts, OpenAPI and generated browser clients;
- tenant- and company-scoped services and repositories;
- draft, submission, approval, posting and reversal lifecycles;
- optimistic versions, idempotent mutations and immutable evidence;
- independent maker/checker/poster controls and governed self-approval;
- Project, Location and assigned-approver workflow context;
- fiscal-period, currency-rate and Finance posting integration; and
- responsive Tailwind/shadcn directory, entry and detail screens.

Bank Transfers are currently prototype-only. The existing shared transaction
engine calculates an illustrative journal in browser memory, and the Transfers
list/detail uses fixture rows. The current API has no transfer contract,
repository, lifecycle or posting authority.

The database already contains tenant-scoped `currency` and `currency_rate`
tables. Active currencies are exposed indirectly through Finance nominal
options, and Payments/Receipts can resolve stored rates, but there is no
complete governed Currency Master or Currency Rates management workflow.

## 3. Chosen architecture

Bank Transfers will be a dedicated Banking vertical slice:

```text
Bank Transfer UI
  -> generated API client
  -> /api/v1/banking/transfers
  -> transfer service
  -> transfer repository
  -> PostgreSQL
  -> existing Finance posting service and ledger
```

Currency configuration will use the Finance boundary:

```text
Currency Master / Rates / Transfer FX Policy UI
  -> generated API client
  -> /api/v1/finance/currencies, currency_rates and transfer_policy
  -> Finance configuration services/repositories
  -> PostgreSQL
```

Transfer contracts and lifecycle remain explicit rather than extending the
presentation-only generic transaction engine. Proven Payment/Receipt helpers
may be reused only where their authorization, retry, workflow or error behavior
is identical.

## 4. Functional scope

### 4.1 Company boundary

- Every Transfer belongs to exactly one authenticated tenant and permitted
  company.
- Every source and destination Bank Account must belong to that same company.
- Cross-company transfers and intercompany due-to/due-from accounting are out
  of scope.
- A source and destination Bank Account must be different.

### 4.2 Transfer batch

A Transfer header records:

- opaque ID and server-generated `BT-` reference;
- company and workflow context;
- posting date and optional value date;
- lifecycle state and optimistic version;
- maker, submitter, checker, poster and reverser evidence;
- linked accounting-event, journal and reversal identifiers; and
- creation/update timestamps.

One Transfer contains between 1 and 200 ordered lines. Each line records:

- stable line ID and order;
- document date;
- source Bank Account;
- optional external reference;
- transfer mode;
- destination Bank Account;
- optional bounded details;
- positive source-currency amount;
- optional non-negative source-currency bank-charge amount;
- server-derived source and destination currencies;
- server-derived destination amount;
- locked source-to-base and destination-to-base rate IDs and values when
  required;
- derived base-currency debit, credit and FX/rounding difference; and
- immutable Bank control nominal snapshots used for posting.

Transfer modes are presentational/business evidence only and do not alter the
double-entry rule. The initial modes are Internal Transfer, Local Bank Transfer,
Wire/SWIFT and Standing Order.

### 4.3 Multi-currency totals

Adding amounts with different source currencies would be misleading. The grid
therefore behaves like the reference when all lines share one source currency,
showing one Total. If a batch contains multiple source currencies, the same
footer displays grouped totals by currency plus the derived tenant-base total.
The API never exposes an unqualified mixed-currency scalar total.

## 5. Currency Master and Currency Rates

### 5.1 Standard currency catalog

Add an immutable platform currency catalog separate from tenant adoption. The
initial major-currency catalog is:

`AED`, `AUD`, `BHD`, `CAD`, `CHF`, `CNY`, `EUR`, `GBP`, `HKD`, `INR`, `JPY`,
`KWD`, `NZD`, `OMR`, `PKR`, `QAR`, `SAR`, `SGD`, `USD` and `ZAR`.

Each catalog row stores the ISO code, display name and ISO minor-unit scale.
The implementation must verify these values against an authoritative ISO-based
source before migration data is finalized.

The catalog does not silently activate currencies for tenants. An authorized
user explicitly adopts a catalog currency into the existing tenant `currency`
master. Adoption is idempotent and cannot change the tenant's current base
currency. Base-currency changes are excluded because they require a separate
conversion and opening-balance design.

### 5.2 Governed tenant currencies

The Currency Master screen provides:

- catalog and adopted-currency search/filtering;
- explicit adoption;
- active/inactive status where dependency guards permit it;
- base-currency visibility without an inline base-currency switch;
- decimal-place visibility; and
- audit history.

Currencies referenced by active Bank Accounts, governed nominals, rates or
financial records cannot be deactivated through the UI or API.

### 5.3 Effective-dated rates

Currency Rates are tenant-scoped and governed. An authorized Finance user
creates a positive direct rate from a non-base currency to the tenant base
currency with an effective date. Records have optimistic versions, status,
creator/updater evidence and immutable events. A correction creates a new
revision for the same pair/effective date, marks the prior revision superseded
and links both records in one transaction. Only one revision is current for a
pair/effective date. Rates already locked into a submitted or later transaction
remain immutable evidence; correction never rewrites a transaction snapshot.

Transfers use the latest active direct rate whose effective date is on or
before the posting date. The service acquires the existing currency-pair lock
before selecting or changing rate evidence. Missing, ambiguous or inactive
rates fail closed.

## 6. Transfer/FX policy

Each company must have one versioned Transfer/FX policy before a cross-currency
Transfer can be submitted. The policy maps:

- realized FX gain nominal;
- realized FX loss nominal;
- rounding nominal; and
- bank-charge nominal reserved for governed Transfer charges.

Policy nominals must belong to the same company, be active ordinary posting
accounts and use the tenant base currency where required by Finance. FX gain
must use a revenue account; FX loss and bank charge must use expense accounts.
The rounding account may be an ordinary revenue or expense account because it
can receive either side of a disclosed minor-unit adjustment. Bank control,
header and protected accounts are not eligible. Policy changes are audited and
do not alter existing transaction snapshots.

The core screenshot grid does not request raw nominal IDs. The policy screen is
the only place Finance selects these supporting nominals.

## 7. Exchange and posting rules

### 7.1 Same-currency line

For a line where both Bank Accounts use the same currency:

- debit the destination Bank control nominal;
- credit the source Bank control nominal; and
- use identical transaction and base amounts after normal currency conversion.

No FX nominal is used.

### 7.2 Cross-currency line

For a line from currency `S` to currency `D` with tenant base currency `B`:

1. Resolve and lock `S -> B` and `D -> B` rates as of the posting date. A base
   currency side uses an implicit rate of one.
2. Convert the entered source amount to base currency using `S -> B`.
3. Derive the destination amount using the locked cross rate and round it using
   destination-currency minor units.
4. Debit the destination Bank control nominal for the destination amount and
   its base equivalent.
5. Credit the source Bank control nominal for the source amount and its base
   equivalent.
6. Post the disclosed base difference to the configured FX gain, FX loss or
   rounding nominal according to sign and policy tolerance.

An optional bank charge is denominated in the source currency. Posting debits
the configured bank-charge nominal for its base equivalent and increases the
credit to the source Bank control nominal by the charge. The transfer amount
and bank charge remain separately disclosed in detail and journal evidence.

The server performs decimal arithmetic; browser floating-point calculations are
display-only. Both currency amounts, both rate snapshots and the resulting base
amounts are persisted as evidence. No hidden suspense or balancing account is
permitted.

### 7.3 Posting safeguards

- Draft save validates current company/account/currency relationships and
  snapshots the applicable rate evidence.
- Changing an account or posting date recomputes rate evidence on the server.
- Submission freezes accounting content and its rate snapshots.
- Posting revalidates lifecycle, permissions, account/nominal state, policy,
  fiscal period and journal balance while holding transaction locks.
- Every batch posts all lines atomically or none of them.
- Reversal creates a compensating journal; it never edits the original journal
  or recomputes historical rates.

## 8. Lifecycle, workflow and authorization

The lifecycle matches Bank Payments and Bank Receipts:

```text
Draft -> Submitted -> Approved -> Posted -> Reversed
                   -> Rejected
```

- Only drafts are editable.
- Approval and posting are separate actions.
- Rejection and reversal require reasons.
- Approve & Close may save, submit and approve only when the current session is
  explicitly eligible under the existing assigned/self-approval governance. It
  never posts.
- Ordinary makers cannot approve their own Transfers.
- Project, Location, assigned approver, reassignment evidence and governed
  self-approval follow the existing Bank workflow implementation.
- Mutations use CSRF, idempotency keys and optimistic versions.
- Reads and writes are tenant/company scoped and unavailable during disallowed
  impersonation states.

Add Transfer permissions parallel to Payments/Receipts:

- `banking.transfer.read`
- `banking.transfer.create`
- `banking.transfer.update`
- `banking.transfer.submit`
- `banking.transfer.approve`
- `banking.transfer.post`
- `banking.transfer.reverse`
- `banking.transfer.reassign`

Currency and policy operations use narrowly scoped Finance/platform read and
manage permissions, preserving existing permission names where they already
express the operation and adding only missing capabilities.

## 9. PostgreSQL design

Use new additive migrations after the latest migration numbers resolved at
implementation time. Do not edit historical migrations.

The Transfer migration adds:

- transfer header, line, event and sequence tables;
- workflow assignment/reassignment evidence;
- immutable posting and reversal linkage;
- tenant/company, Bank Account, currency, rate and nominal foreign keys;
- state-dependent evidence and immutability triggers;
- positive/bounded amount and unique line-order constraints;
- source/destination inequality and same-company guards;
- indexes for bounded directory queries; and
- database checks that independently enforce rate and control-nominal evidence.

The Finance configuration migration adds:

- the standard currency catalog and initial verified rows;
- safe adoption/audit support for tenant currencies;
- governed rate version/status/audit evidence compatible with existing rates;
  and
- versioned company Transfer/FX policy and policy events.

Migration verification must prove additive behavior, tenant isolation,
dependency guards, historical Payment/Receipt compatibility and rollback safety
where practical.

## 10. API contracts

Add typed OpenAPI operations under `/api/v1/banking`:

- `GET /transfers` - company/account/state/date/search/sort/cursor directory;
- `GET /transfers/options` - eligible same-company Bank Accounts and modes;
- `GET /transfers/workflow_options`;
- `POST /transfers` - idempotent draft creation;
- `GET /transfers/{transferId}`;
- `PATCH /transfers/{transferId}` - versioned draft update;
- `POST /transfers/{transferId}/submit`;
- `POST /transfers/{transferId}/decision`;
- `POST /transfers/{transferId}/approver`;
- `POST /transfers/{transferId}/post`; and
- `POST /transfers/{transferId}/reverse`.

Add typed Finance configuration operations:

- `GET /currencies/catalog`;
- `GET /currencies`;
- `POST /currencies/adoptions`;
- `POST /currencies/{code}/status`;
- `GET /currency_rates`;
- `POST /currency_rates`;
- `POST /currency_rates/{rateId}/corrections` - versioned replacement revision;
- `POST /currency_rates/{rateId}/status` - versioned activation/deactivation;
- `GET /transfer_policy?company_id=...`; and
- versioned create/update operations for Transfer/FX policy.

Responses use the standard problem format. Contract, OpenAPI, generated client
and implementation changes land together.

## 11. Approved UI design

### 11.1 Transfer directory

The existing Transfers menu opens a real server-backed directory with the same
filter, loading, denied, empty, retry, sorting, pagination and responsive
patterns as Payments/Receipts. Rows show reference, posting date, source and
destination summaries, currency-aware total, state and line count. Selecting a
row opens persisted detail.

### 11.2 Add/Edit Transfer

The primary composition follows the supplied screenshot and the accepted dense
Bank entry styling:

```text
Date * | From Bank * | Ref. No. | Mode * | To Bank * | Details | Amount * | Remove
```

- Date defaults to today.
- From Bank and To Bank are searchable selectors populated only from active,
  approved Bank Accounts in the selected company.
- Each Bank option shows Bank name, account name/masked number, currency and
  mapped control nominal code.
- Selecting From Bank removes it from the corresponding To Bank options.
- Ref. No. is an optional external banking reference.
- Details is one textarea, not two nested controls.
- Amount is the source-currency amount and displays its currency beside the
  field.
- When currencies differ, a compact read-only conversion line appears within
  the row showing destination amount, rate date and locked cross-rate evidence.
- An optional Charges disclosure expands beneath a row on demand; it captures
  only the bank-charge amount and uses the configured policy nominal. It does
  not add another permanent column to the reference grid.
- The footer shows one total for a single source currency or grouped currency
  totals plus base total for mixed batches.
- Add More appends a line and Remove is disabled when only one line remains.

Company, posting/value date and workflow context use the same compact controls
as Payments/Receipts without displacing the reference grid. Save Draft and
Submit for Approval remain available through the established transaction action
menu. Cancel preserves the dirty-state guard. Approve & Close follows the same
eligibility rules as the accepted Bank forms and never posts.

The screen uses Tailwind and existing shadcn/shared primitives. It introduces no
feature stylesheet or decorative redesign; visual fidelity means the same
information hierarchy, density and action placement as the reference, adapted
to the application's existing design tokens and responsive shell.

### 11.3 Transfer detail

The detail screen reuses the accepted Banking detail structure and shows:

- lifecycle status and permitted actions;
- source/destination Bank Account identities and masked numbers;
- source/destination currencies and amounts;
- locked rate evidence and rate dates;
- base-currency journal preview including disclosed FX/rounding lines;
- Project, Location and assigned-approver context;
- assignment and lifecycle history; and
- posting/reversal journal links.

### 11.4 Currency configuration

Finance Master Data gains focused Currency Master, Currency Rates and
Transfer/FX Policy views using the established list/detail/edit patterns. All
screens include loading, empty, denied, validation, conflict, success and retry
states. Destructive-looking status actions require reasons and dependency-aware
confirmation.

## 12. Error handling and reliability

- Missing rates, missing policy, invalid/inactive accounts, stale versions,
  closed periods and permission failures block progression without partial
  writes.
- Rate and account changes between draft and submission produce an actionable
  conflict; they are never silently substituted after submission.
- Create/update/submit/approve/post/reverse and configuration mutations are
  idempotent where retries could otherwise duplicate financial effects.
- Errors expose correlation IDs but not SQL, secrets, raw account numbers or
  infrastructure details.
- Concurrent posting/reversal is serialized using the established Finance and
  Banking locks.

## 13. Testing and acceptance

Verification includes:

- contract and generated-client coverage;
- migration/schema/security tests for tenant isolation, state guards,
  immutability, rate evidence and dependencies;
- unit tests for validation, conversion, rounding, grouped totals and UI states;
- integration tests for same-currency and cross-currency create/update/submit/
  approve/post/reverse lifecycles;
- atomic rollback tests covering multi-line batches and failed Finance posting;
- authorization and maker/checker/self-approval/reassignment tests;
- Payment/Receipt regression tests for shared currency/rate changes;
- browser acceptance against an isolated API/PostgreSQL environment;
- narrow-screen and keyboard/accessibility checks;
- OpenAPI/client consistency, scoped lint, formatting, typecheck, production
  build and whitespace checks.

Acceptance requires proof that a posted transfer creates balanced source Bank,
destination Bank and disclosed FX/rounding ledger lines, that reversal creates
the exact compensating entry, and that no prototype fixture or local-only action
remains on the Transfer routes.

## 14. Explicit exclusions

- Cross-company and intercompany transfers;
- external market-data or FX-provider integration;
- changing a tenant's base currency;
- supplier/customer settlement or invoice allocation;
- bank-statement matching and reconciliation;
- scheduled/recurring execution;
- payment-file generation or direct bank connectivity; and
- editing historical rate snapshots or posted journals.

## 15. Safe implementation order

1. Currency catalog/adoption, governed rates and Transfer/FX policy contracts,
   migrations, APIs and tests.
2. Transfer contracts and additive persistence/security migrations.
3. Transfer repository/service, lifecycle, atomic Finance posting and reversal.
4. OpenAPI and generated client integration.
5. Currency/Rate/Policy management views.
6. Transfer directory, screenshot-aligned entry and persisted detail views.
7. Isolated end-to-end acceptance and Payment/Receipt regression verification.
8. Retire only Transfer prototype routing proven unused by selector searches;
   do not remove the shared prototype engine while other screens depend on it.
