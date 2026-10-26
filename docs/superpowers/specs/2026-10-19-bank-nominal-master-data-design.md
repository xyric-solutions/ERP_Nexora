# Bank Nominal and Master Data Integration Design

- Status: Approved design
- Date: 2026-10-19
- Scope: Chart of Accounts nominal creation for Cash & Bank accounts
- UI entry points: Master Data and Banking
- Accounting authority: Finance Chart of Accounts
- Operational consumers: Banking Payments, Receipts, Account Balances and Reconciliation

## 1. Objective

Create every new Bank or Cash account as its own dedicated Chart of Accounts
nominal. Users work with one visible Nominal record; they do not create a
separate Bank Master, Branch Master or detailed banking profile.

The hierarchy is:

```text
Current Assets
└── Cash & Bank
    ├── <generated code> · <nominal name>
    └── <generated code> · <another nominal name>
```

Two physical Bank/Cash accounts must never share one nominal. The nominal name
is the account's display identity and the generated nominal code is its business
number. There is no separate user-entered account-number field.

## 2. Approved user experience

### 2.1 Master Data navigation

Master Data exposes a Finance Masters group containing:

- Currencies;
- Currency Rates;
- Account Categories;
- Account Sections; and
- Nominal Accounts.

The first production slice may expose Currency and hierarchy directories as
read-only dependencies where their governed maintenance APIs are not yet
available. It must not imitate persistence with browser fixtures.

### 2.2 One shared Nominal form

Master Data owns the shared Nominal form. Banking's Add Bank Account action
opens the same form with `Current Assets` and `Cash & Bank` preselected. There
is no second Banking-specific creation form.

The Cash & Bank form contains only:

- Company;
- Category: `Current Assets`;
- Section: `Cash & Bank`;
- Nominal account name;
- Server-generated nominal code, read-only after allocation;
- Currency selected from the active Currency Master; and
- Optional description.

Bank name, branch, external account number, IBAN, SWIFT/BIC, overdraft and
opening balance are not requested. Creation never posts an opening journal.

When the form is opened from Banking, Category and Section are fixed. When it
is opened from the Nominals directory, the user can navigate the authorized
hierarchy; selecting Cash & Bank automatically enables the Cash & Bank
capability and the currency field.

### 2.3 Directory and detail behavior

The Nominals directory groups postable leaves beneath their Category and
Section headers. A Cash & Bank nominal shows its generated code, name,
currency, lifecycle state and whether it is available to Banking. Sensitive
legacy bank identifiers must never be added to this new directory projection.

The detail workspace shows one business record even though Finance and Banking
retain separate internal responsibilities. Existing Banking links may continue
to navigate by the internal Banking identifier, but the visible identity is
always the nominal code and name.

## 3. Domain ownership

### 3.1 Canonical nominal

The Finance `account` row is the canonical accounting record. It owns:

- tenant and company;
- code;
- name;
- asset type;
- parent hierarchy;
- header/postable behavior;
- posting restrictions;
- reconciliation requirement; and
- active/inactive accounting state.

Category and Section are represented by non-postable Finance header accounts,
not by a parallel browser-only taxonomy. `Current Assets` is the asset header
and `Cash & Bank` is its child header. Each Bank/Cash nominal is a postable leaf
under that Section.

The current Finance account authority has no description field. An additive
Finance migration adds a bounded nullable description to the account master.

### 3.2 Minimal Banking capability

Payments, Receipts, Account Balances and Reconciliation already use governed
Bank Account identifiers. That internal capability must remain, but it is not a
second user-managed master.

For each new Cash & Bank nominal, the server creates exactly one minimal
Banking extension linked one-to-one to the Finance account. It owns only:

- the internal stable Banking identity required by existing contracts;
- currency;
- lifecycle/version evidence;
- reconciliation eligibility; and
- immutable audit links.

It does not require bank name, branch, external account number, IBAN or SWIFT.
The existing `bank_account` authority should be evolved additively with an
explicit minimal/nominal-only identity mode. Legacy rows retain their encrypted
fields and current behavior. Minimal rows allow those legacy-only fields to be
absent under database-enforced conditional constraints.

The Finance account name is authoritative. Any retained Banking name column is
a controlled compatibility projection and must be kept equal to the Finance
name by the server and database guard; it must not become independently
editable.

### 3.3 One-to-one integrity

PostgreSQL enforces:

- one Banking extension per tenant/company/Finance account;
- one Finance account per Banking extension;
- the Finance account is a postable asset leaf;
- the Finance account's parent is the authorized Cash & Bank header;
- reconciliation is required;
- currency references an active tenant Currency Master record at activation;
- lifecycle states of the Finance leaf and Banking extension cannot conflict;
  and
- records referenced by journals or Banking transactions cannot be deleted.

## 4. Nominal code allocation

Users never enter or edit the nominal code.

Codes are allocated by a PostgreSQL-backed, section-specific sequence keyed by
tenant, company and Section. Section Management owns the code policy (prefix,
width and allowed range); the Nominal form only displays the result. The
allocator locks its sequence row, never reuses an existing code, rejects
exhaustion and prevents duplicate allocation under concurrency.

The design does not hardcode an example such as `110201` as a universal Nexora
rule. Existing company Chart of Accounts conventions are imported into the
section policy before enabling creation for that company.

## 5. Creation and approval lifecycle

### 5.1 Save draft

An authorized maker submits the shared Nominal request with company,
Category, Section, name, currency and optional description. The request cannot
supply tenant, code, account type, postability, reconciliation flags, state,
actors or internal Banking identity.

Within one PostgreSQL transaction, the service:

1. authenticates the session and validates tenant/company access;
2. verifies the exact Category and Section hierarchy;
3. verifies the selected currency is active;
4. allocates the next Section code;
5. creates the inactive Finance nominal leaf;
6. creates its draft minimal Banking extension;
7. records lifecycle and platform audit evidence; and
8. commits the idempotent response.

If any step fails, neither record nor a successful idempotency result survives.

### 5.2 Submit

Only a draft can be submitted. Submission locks business fields, records the
maker and reason, advances the version and creates immutable lifecycle/audit
evidence.

### 5.3 Decision

An independent checker revalidates company scope, hierarchy, currency and
one-to-one mapping before approval. Approval activates the Finance nominal and
Banking extension atomically. Rejection leaves the Finance leaf inactive and
preserves the draft and decision history for audit.

Ordinary makers cannot approve their own records. The existing governed global
super-administrator exception is allowed only when the actor has the normal
decision permissions plus `platform.approval.override` and supplies a business
reason. The override event, domain decision and platform audit must commit in
the same transaction.

### 5.4 After activation

Only active records appear in Payments, Receipts and reconciliation selectors.
Account Balances reads posted ledger lines against the canonical Finance
account. Creation does not synthesize an opening balance.

Deactivation is governed and preserves all historical journals, transactions,
lifecycle events and audit evidence. Deletion is unavailable.

## 6. API and service boundary

The browser continues to use only versioned API contracts and the generated
client. It never writes PostgreSQL directly.

A Finance Nominal API owns the shared form and directory through these
versioned operations:

- `GET /api/v1/finance/nominals/options` lists authorized Categories,
  Sections and active Currency Master choices;
- `GET /api/v1/finance/nominals` lists company-scoped Nominals;
- `GET /api/v1/finance/nominals/{nominalId}` reads one Nominal;
- `POST /api/v1/finance/nominals` creates a draft;
- `PATCH /api/v1/finance/nominals/{nominalId}` updates a draft;
- `POST /api/v1/finance/nominals/{nominalId}/submit` submits it;
- `POST /api/v1/finance/nominals/{nominalId}/decision` approves or rejects a
  pending request; and
- `POST /api/v1/finance/nominals/{nominalId}/status` deactivates an active
  nominal.

For Cash & Bank creation, the Finance Nominal service invokes a narrow Banking
capability writer with the same database transaction client. Banking does not
create a duplicate Finance account, and Finance does not implement payment,
receipt, reconciliation or posting logic.

The existing Bank Account creation endpoint remains compatible during
migration but is removed from new browser navigation after the shared form is
accepted. Existing read endpoints and stable Bank Account IDs remain available
to Payments, Receipts and Account Balances.

Every mutation requires:

- authenticated cookie session;
- trusted origin and CSRF protection;
- tenant and company scope;
- exact Finance and Cash & Bank permissions;
- request schema validation;
- optimistic version where applicable;
- idempotency key; and
- an impersonation mutation block.

## 7. Authorization

Finance Nominal permissions should be explicit and company-scoped:

- `finance.nominal.read`;
- `finance.nominal.create`;
- `finance.nominal.update`;
- `finance.nominal.submit`;
- `finance.nominal.approve`; and
- `finance.nominal.status`.

Creating or deciding a Cash & Bank capability additionally requires the
corresponding existing Banking permission. Role policies receive both grants
where the job responsibility covers Bank/Cash master maintenance. UI visibility
never replaces server-side authorization.

## 8. Validation and error behavior

The server rejects:

- a Section outside the selected Category;
- a non-asset or non-Cash & Bank hierarchy for the Banking capability;
- duplicate company code or conflicting one-to-one mapping;
- blank, unbounded or duplicate names according to company policy;
- inactive/unknown currency;
- caller-supplied code or lifecycle authority;
- stale versions;
- self-approval without the governed exception;
- company or tenant boundary violations; and
- attempts to activate only one side of the Finance/Banking mapping.

Failures use Nexora's standard problem response without SQL text, secret data or
cross-company existence leakage. The UI preserves entered non-sensitive values,
shows field-level validation where safe, provides reload guidance for conflicts
and never falls back to mock records.

Concurrent code creation is serialized through the Section sequence. Retried
mutations replay their stored idempotent result; reuse with a changed payload is
a conflict.

## 9. Backward-compatible migration

The migration is additive and must not rewrite historical journal or Banking
transaction identity.

For existing Bank Accounts:

1. preserve the Bank Account ID used by Payments and Receipts;
2. preserve its Finance account mapping;
3. classify it as legacy detailed identity where encrypted fields exist;
4. validate or repair only missing one-to-one constraints through a controlled
   migration report, never silent reassignment;
5. preserve encrypted values, lifecycle state and audit evidence; and
6. hide legacy-only fields from the new minimal creation form while retaining
   authorized read compatibility where already supported.

New Cash & Bank nominals use nominal-only identity mode by default. No existing
migration file is edited. The implementation uses the next available additive
Finance migration after rechecking the live migration head.

## 10. Frontend states and accessibility

The shared form provides explicit loading, empty, validation, permission-denied,
conflict, retryable error and success states. Category, Section and Currency
controls have accessible labels; generated code is read-only, not merely
visually disabled; focus moves to the first invalid field; and the form retains
keyboard and narrow-screen usability.

Unsaved navigation is guarded. Save Draft and Save & Submit are distinct.
Approval and deactivation require visible confirmation and a reason. The form
does not display controls for unavailable external bank details or opening
balance posting.

## 11. Acceptance criteria

Completion requires all of the following evidence:

1. Contracts, OpenAPI and generated client agree.
2. A fresh isolated PostgreSQL database applies the additive migration.
3. Two new Bank/Cash accounts produce two different nominal IDs and codes.
4. Both share the same Current Assets and Cash & Bank headers.
5. Each nominal has exactly one Banking capability and an active Currency
   Master reference.
6. Duplicate, cross-company and concurrent attempts fail safely.
7. Draft, submit, independent approval and governed super-admin exception are
   covered by integration and database-security tests.
8. Approval activates both records atomically; injected failure activates
   neither.
9. The approved account appears in Payments, Receipts, Account Balances and
   reconciliation options without fixture fallback.
10. A posted Payment and Receipt use the new nominal and remain balanced.
11. Existing Bank Account, Payment and Receipt regression suites pass without
    ID or journal changes.
12. Chromium verifies creation from Master Data and Banking, persistence after
    reload/new session, approval, permission denial and narrow layout.
13. Typecheck, generated API drift check, phase-owned lint, production build
    and diff checks pass; any unrelated repository failure is reported rather
    than hidden.

## 12. Explicitly out of scope

This design does not add:

- Bank or Branch Master;
- external account numbers;
- IBAN or SWIFT/BIC capture;
- opening-balance journals;
- automatic currency-rate creation;
- transaction posting inside Master Data;
- deletion of used accounts;
- a duplicate accounting engine; or
- general creation rules for every non-Cash & Bank nominal type.

The form is deliberately reusable, but production enablement for other account
Sections requires their own accounting and governance acceptance criteria.

## 13. Approved decisions

- Every Bank/Cash account has its own nominal.
- Category and Section are shared; the nominal is separate.
- The nominal name is the account identity.
- The generated nominal code is its number.
- There is no user-entered external account-number field.
- Currency is selected from Currency Master.
- One shared form is reached from both Master Data and Banking.
- Users see one record; Finance and Banking retain clear internal ownership.
- Existing Banking transaction IDs and journal history remain compatible.
