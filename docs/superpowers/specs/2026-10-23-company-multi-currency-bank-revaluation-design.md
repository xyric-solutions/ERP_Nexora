# Company Multi-Currency and Bank Revaluation Design

**Status:** Approved  
**Date:** 2026-10-23  
**Repository baseline:** `8856b14cbab16076d8bf40bdcb3f8c1466d2b5a6`  
**Scope:** Company currency configuration, country/currency master data, bank-account currency enforcement, base-currency reporting, and governed bank revaluation

## 1. Purpose

Nextura must support companies that keep their books and financial statements in one mandatory base currency while operating bank accounts in multiple currencies. A company whose base currency is PKR may, for example, maintain separate PKR, USD, AED, and AUD bank accounts. Every bank account operates in exactly one currency.

The feature must also provide a governed bank revaluation process. Foreign-currency bank balances are re-expressed in the company's base currency using the effective closing rate for a selected date. The resulting unrealized gain or loss is approved, posted to the general ledger, and automatically reversed on the first day of the next open accounting period.

This is a production feature. Browser code must use authenticated `/api/v1` endpoints; it must never connect directly to PostgreSQL or rely on fixtures for persisted behavior.

## 2. Existing System Context

The repository already provides:

- a tenant currency table and governed, effective-dated rate revisions;
- an immutable 20-currency reference catalog;
- bank accounts with one persisted currency and one mapped control nominal;
- journal lines that preserve transaction-currency debit/credit and base-currency debit/credit;
- company-scoped banking workflows, exact permissions, audit events, CSRF, idempotency, and optimistic version controls;
- a Finance posting service with period and balanced-journal enforcement;
- bank payment, receipt, transfer, statement, and reconciliation production patterns;
- a generic prototype-only bank revaluation form that is not an acceptable production implementation.

The current active base-currency constraint is tenant-scoped. The implementation must introduce a company financial currency profile without invalidating existing posted transactions or current rate references.

## 3. Confirmed Business Rules

1. Every company has exactly one mandatory base currency.
2. The base currency is selected during company creation or financial activation.
3. The base currency becomes immutable after the company's first posted journal.
4. A company may activate multiple foreign currencies.
5. Every bank account has exactly one currency, which must be active for that company.
6. A bank account's currency cannot change after financial activity exists.
7. Financial statements are presented in the company's base currency.
8. Rate convention is always `1 source/foreign currency unit = X company base-currency units`; for example, `1 USD = 275 PKR`.
9. Rates are effective-dated and historical facts are immutable. Corrections create a new audited revision.
10. A revaluation uses the latest active rate whose effective date is on or before the revaluation date.
11. Revaluation posts an unrealized gain or loss and automatically reverses on the first day of the next open accounting period.
12. Revaluation follows maker-checker separation. The existing audited Super Admin override may be used by Shoaib for controlled testing.
13. Posted financial records are never deleted or edited destructively; corrections use reversal and replacement.

## 4. Chosen Architecture

Use an incremental company-currency profile that extends existing platform and Finance boundaries. Do not replace the current currency or posting systems wholesale.

### 4.1 Global country and currency reference data

Expand the immutable reference catalog to cover the active ISO 3166 country list and active ISO 4217 currencies required by those countries. The catalog records:

- ISO country code and country name;
- ISO currency code and currency name;
- symbol when available;
- decimal precision;
- country-to-currency relationship;
- whether a mapping is the country's primary/default currency;
- active/retired status and source version.

A currency may map to multiple countries. A country may have more than one supported legal currency. The country selector automatically chooses the primary mapping when exactly one primary mapping exists. When multiple supported mappings exist, the form reveals a required currency selector instead of guessing.

Reference records are centrally managed and immutable to tenant users. Company users adopt them; they do not redefine ISO identity.

### 4.2 Company financial currency profile

Create a company-scoped financial profile containing the base currency, lifecycle state, record version, actor evidence, and timestamps. There is exactly one active profile per company.

Existing companies are backfilled from the current active tenant base currency during the approved migration workflow. The legacy tenant base remains a compatibility source only until all consumers use the company profile. New business logic must resolve base currency by authenticated tenant and company.

The profile guard rejects a base-currency change after any posted company journal exists. A genuine functional-currency conversion is outside this feature and requires a separately approved migration workflow.

### 4.3 Company currency activation

Create company-scoped activation records linking a company to adopted reference currencies. The company base currency is activated automatically and cannot be deactivated. A foreign currency can be activated only through an authenticated company-scoped workflow.

Adding a foreign currency captures:

- selected country and currency mapping;
- effective date;
- initial conversion rate to the company's base currency;
- active status;
- maker, version, correlation, and audit evidence.

Currency activation and the initial rate are written in one database transaction so neither can exist partially.

### 4.4 Rate compatibility and ownership

Evolve rate evidence so new rates can be associated with a company while preserving all existing rate IDs referenced by posted payments, receipts, transfers, and journals. Legacy tenant-level rate rows remain readable for their historical references. New writes use company-scoped rate evidence and the company's base currency as target currency.

Rate lookup order is deterministic:

1. matching active company rate on or before the requested date;
2. approved legacy rate only for pre-cutover compatibility when no company rate applies;
3. otherwise fail with a missing-rate error.

No reciprocal-rate calculation is inferred. The persisted rate must use the required foreign-to-base direction.

### 4.5 Bank-account enforcement

Bank-account create and activation validate that the selected currency is active for the same company. Database constraints/triggers and service validation enforce the same rule.

The account currency is immutable after any bank transaction or journal line exists. Accounts in the base currency do not participate in FX revaluation.

## 5. User Experience

All new presentation uses Tailwind and existing shared shadcn/ui primitives. It retains the current ERP shell, navigation, accessibility, keyboard behavior, and responsive conventions.

### 5.1 Currencies work page

Replace the current card-oriented prototype with the approved work-page layout:

- title and **Add New** action;
- page-size selector and search;
- columns for base currency code, base country, foreign currency code, foreign country, latest rate, effective date, status, and action;
- bounded server pagination;
- loading, permission, empty, error, and retry states;
- View/Edit action appropriate to the record state and permissions.

The rate is displayed unambiguously as `1 USD = 275 PKR`. Reciprocal display may be shown as informational text, but it is never persisted as the authoritative rate.

### 5.2 Add New Currency form

The approved form contains:

- searchable country selector;
- automatically resolved currency, or a required selector for multiple mappings;
- read-only company base currency;
- exchange-rate input;
- effective-date input;
- active status;
- explicit rate sentence showing direction;
- Cancel and Save and Close actions.

The form prevents selecting the base currency as a foreign currency, duplicate company activation, non-positive rates, dates outside supported Finance rules, and unsupported country/currency combinations.

### 5.3 Bank Revaluation work page

Match the supplied work-page reference while using the application's design tokens:

- **Add New** action;
- filters for currency, bank account, date range, reference, and status;
- page-size control, clear action, bounded pagination, and row selection where an authorized bulk action exists;
- columns for voucher number, date, account code, account name, reference, currency, exchange rate, FX balance, revalued base balance, gain/loss amount, status, and action;
- loading, permission, empty, error, and retry states.

Posted rows do not expose destructive delete. Available actions depend on lifecycle state and permission: open, edit draft, submit, decide, post, view journal, reverse, or view audit.

### 5.4 Bank Revaluation form

Match the supplied form reference:

- required foreign currency;
- required revaluation date;
- Apply action;
- optional reference/narration;
- details table with account code, account name, foreign balance, carrying base balance, revalued base balance, and revalued gain/loss;
- totals for foreign balance, carrying value, revalued value, gain, and loss;
- Cancel, Save and New, Save and Close, and permission/state-specific lifecycle actions.

Apply calls a read-only preview endpoint. It never posts or silently persists financial effects. The screen displays the selected rate ID/effective date and the equation used.

## 6. Revaluation Calculation

Only posted journal activity through the selected revaluation date participates.

For each active foreign-currency bank account:

```text
foreign_balance = sum(transaction_currency_debit - transaction_currency_credit)
carrying_base_balance = sum(base_currency_debit - base_currency_credit)
revalued_base_balance = foreign_balance * closing_rate
adjustment = revalued_base_balance - carrying_base_balance
```

All calculations use the existing decimal utilities and currency precision rules. Binary floating-point arithmetic is prohibited for persisted monetary results.

For a positive bank asset balance:

- `adjustment > 0`: debit Bank Control and credit Unrealized FX Gain;
- `adjustment < 0`: debit Unrealized FX Loss and credit Bank Control.

The same signed-balance calculation produces the correct treatment for overdrafts/credit balances. Zero adjustments do not generate journal lines.

The preview and persisted draft snapshot include:

- company base currency;
- foreign currency;
- rate ID, revision, value, and effective date;
- revaluation date;
- bank account and control nominal identity;
- foreign and carrying balances;
- revalued balance and adjustment;
- calculation timestamp and source cutoff.

## 7. Accounting Policy and Lifecycle

### 7.1 Company revaluation policy

A company-scoped policy selects active, non-header, posting-capable Chart of Accounts nominals for:

- unrealized exchange revaluation gain;
- unrealized exchange revaluation loss.

The policy is versioned and audited. A revaluation snapshots the policy ID, version, and nominal IDs so later configuration changes cannot rewrite history. Transfer realized-FX policy is not silently reused as unrealized-FX policy.

### 7.2 Lifecycle

```text
Draft -> Submitted -> Approved -> Posted -> Reversed
                     -> Rejected
```

- Save and Close creates or updates only a draft.
- Only drafts can be edited.
- Submit validates rate, account eligibility, period availability, policy, and balances again.
- Submit freezes the calculation snapshot.
- The maker cannot approve or reject their own submission.
- The existing audited Super Admin override can authorize Shoaib's test decision when all override requirements are satisfied.
- Post requires approved state and posting permission.
- Post creates one balanced journal with source type `bank_fx_revaluation` and a durable reversal instruction atomically.
- Reverse creates a compensating entry and never edits the original journal.

### 7.3 Automatic reversal

The reversal is scheduled for the first day of the next accounting period. The worker posts it once when that period is open. If the period is not open, the schedule remains pending and produces an operational/readiness exception; it does not bypass period controls.

The reversal worker uses durable job state and idempotency. Database uniqueness prevents more than one posted reversal for a source revaluation. A later revaluation is blocked when a required earlier reversal should already have occurred but remains unresolved.

## 8. API Contracts

All endpoints are versioned under `/api/v1`, use shared Zod contracts, return the standard problem format, and are emitted into OpenAPI and the generated web client.

Representative resources:

- `GET /api/v1/master-data/countries`
- `GET /api/v1/finance/companies/{companyId}/currency-profile`
- `GET /api/v1/finance/company-currencies`
- `POST /api/v1/finance/company-currencies`
- `PATCH /api/v1/finance/company-currencies/{currencyCode}/status`
- `GET /api/v1/finance/company-currency-rates`
- `POST /api/v1/finance/company-currency-rates`
- `POST /api/v1/finance/company-currency-rates/{rateId}/corrections`
- `GET /api/v1/banking/revaluations`
- `POST /api/v1/banking/revaluations/preview`
- `POST /api/v1/banking/revaluations`
- `GET /api/v1/banking/revaluations/{revaluationId}`
- `PATCH /api/v1/banking/revaluations/{revaluationId}`
- `POST /api/v1/banking/revaluations/{revaluationId}/submit`
- `POST /api/v1/banking/revaluations/{revaluationId}/approve`
- `POST /api/v1/banking/revaluations/{revaluationId}/reject`
- `POST /api/v1/banking/revaluations/{revaluationId}/post`
- `POST /api/v1/banking/revaluations/{revaluationId}/reverse`
- `GET /api/v1/banking/revaluations/{revaluationId}/events`

List endpoints use bounded filters and opaque cursors. Mutations require CSRF, an idempotency key, strict input validation, and an expected version where a record already exists.

## 9. Persistence and Integrity

Additive migrations introduce or evolve:

- immutable country/currency reference mappings;
- company financial currency profiles;
- company currency activations;
- company rate ownership while retaining legacy rate references;
- company bank-revaluation policy and events;
- revaluation headers, immutable account snapshots, and lifecycle events;
- durable reversal schedules and execution evidence;
- permissions and company-role mappings required by the new resources.

Required database controls include:

- tenant row-level security on business and event tables;
- same-company composite foreign keys;
- exactly one active base profile per company;
- unique active company/currency activation;
- unique current rate revision per company, currency pair, and effective date;
- immutable posted snapshots and events;
- guarded lifecycle transitions;
- one journal and one reversal per revaluation;
- indexes supporting company/state/date, rate lookup, bank account, and work-page filtering.

No persistent or shared database is migrated without explicit operator approval of its exact identity.

## 10. Security and Authorization

Use existing authentication, authorization, audit, CSRF, idempotency, and Super Admin override mechanisms. Do not duplicate them.

Permissions are separated by capability, including:

- company currency profile read/manage;
- company currency read/manage;
- company rate read/manage;
- bank revaluation read/create/update/submit/approve/post/reverse;
- revaluation policy read/manage.

Every repository read and mutation is scoped to authenticated tenant and authorized company. Impersonated sessions cannot perform privileged configuration or financial decisions. Protected snapshot fields cannot be supplied or changed by clients.

Audit records contain safe identifiers and before/after state without secrets, bank-account plaintext identifiers, credentials, or internal infrastructure details.

## 11. Failure Handling and Readiness

Return explicit domain errors for:

- missing company base currency;
- inactive or unapproved company currency;
- missing or inapplicable closing rate;
- future-dated rate relative to the transaction/revaluation date;
- duplicate company currency or revaluation;
- no eligible foreign-currency bank accounts;
- zero eligible balances;
- missing or invalid gain/loss policy;
- closed or unavailable accounting period;
- stale version or concurrent lifecycle action;
- self-approval without a valid override;
- conflicting reuse of an idempotency key;
- unresolved prior reversal;
- posting, audit, database, or worker dependency failure.

Production readiness must report mandatory database, audit, posting, currency-profile, revaluation-policy, and reversal-worker dependencies accurately. Partial writes roll back in one transaction.

## 12. Financial Reporting Integration

Financial reports continue to aggregate the immutable `base_debit` and `base_credit` values on posted journal lines. New posting flows resolve the company's base currency before conversion and persist both transaction and base values.

Reports must:

- label the company base currency explicitly;
- never mix raw foreign amounts into base-currency totals;
- provide foreign-currency drill-down where supported;
- include posted revaluation journals and their reversals by date and period;
- retain the historical rate evidence used for each posting.

This feature does not redesign financial-statement presentation. It corrects the currency authority and data feeding those statements.

## 13. Testing and Verification

Implementation is failure-first and dependency-ordered:

1. country/currency reference and company base-currency model;
2. company currency/rate contracts, repositories, services, routes, and security;
3. currency work page and form;
4. revaluation schema and deterministic calculation service;
5. maker-checker lifecycle, posting, and scheduled reversal;
6. authenticated routes, production composition, readiness, and generated contracts;
7. revaluation work page and form;
8. base-currency reporting integration and full regression verification.

Coverage includes:

- rate direction, precision, effective dates, and correction history;
- country/currency mapping, including shared and multiple currencies;
- company isolation and base-currency immutability;
- bank-account single-currency constraints;
- positive balances, overdrafts, gains, losses, zero adjustments, and rounding;
- calculation cutoffs and prior revaluation/reversal behavior;
- invalid transitions, maker-checker, audited override, and protected fields;
- CSRF, authentication, exact permissions, idempotency conflict/replay, and stale versions;
- journal balance, period controls, duplicate-effect prevention, and reversal idempotency;
- migration, row-level security, OpenAPI synchronization, generated client, UI accessibility, and production composition;
- existing payment, receipt, transfer, statement, reconciliation, currency, posting, and company behavior.

After each dependency-ready task, run its focused unit, route, integration, and security tests. Final verification includes the repository's TypeScript, ESLint, Prettier, OpenAPI synchronization, migration verification, `git diff --check`, web/API/worker production builds, and relevant banking/Finance regressions.

## 14. Operational Safeguards

- Preserve all current uncommitted work.
- Do not run destructive Git commands.
- Do not migrate a persistent/shared database without explicit target approval.
- Do not deploy to Railway or any production environment.
- Do not seed synthetic financial transactions, revaluations, or journals into the operator's database.
- Do not hardcode currencies, rates, companies, bank accounts, gain/loss nominals, credentials, or actor identities.
- Do not claim production readiness until migrations, security, contracts, integration, UI, and production builds have actually passed.

## 15. Out of Scope

- Changing an established company's functional/base currency after posting has begun;
- live market-rate-provider integration;
- automatic reciprocal or triangulated rate invention;
- revaluation of receivables, payables, loans, or all Finance monetary items;
- consolidation currency translation;
- destructive deletion of financial or audit records;
- deployment or unapproved persistent-database migration.
