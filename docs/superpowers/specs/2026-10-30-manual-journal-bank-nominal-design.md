# Manual Journal Bank Nominal Selection Design

**Date:** 2026-10-30  
**Status:** Approved for implementation  
**Scope:** Finance Journals only

## Objective

Allow an authorized user to record a base-currency Manual Journal such as a capital contribution into an active Bank Account, while preserving company isolation, bank reconciliation, Journal lifecycle controls, and the existing base-currency-only accounting model. Replace the Manual Journal line account select with the shared searchable selector so users can search by nominal code or name.

## Decisions

- Manual Journals may use either an active governed ordinary nominal or an eligible active bank-controlled nominal.
- A bank-controlled nominal is eligible only when it belongs to the selected tenant and company, is linked to an active Bank Account, is postable and reconciliation-enabled, and the Bank Account currency equals the company base currency.
- Foreign-currency Bank Accounts remain unavailable because Manual Journals are denominated exclusively in company base currency. Those transactions must use the Bank workflow that owns foreign-exchange handling.
- Recurring Journal templates remain restricted to governed ordinary nominals. Automated recurring generation must not create bank-controlled movements.
- Posted Manual Journal lines using a Bank Account nominal enter the existing Bank Reconciliation population. The reconciliation repository already selects any posted ledger line for the Bank Account ledger and does not restrict the accounting-event source.
- Existing approval, self-approval, period, balance, precision, idempotency, immutability, reversal, audit, and company-scope rules remain unchanged.

## Contract and Data Flow

The Journal options contract will identify each nominal as `general` or `bank`. The server remains authoritative for eligibility.

For a selected company, the Journal options endpoint will return:

- active governed general nominals that satisfy the existing manual-posting rules; and
- eligible active bank nominals satisfying the same-company and base-currency rules above.

Manual Journal create, update, submit, and approval/post validation will accept both eligible kinds. Recurring Journal create and update validation will continue to accept only general nominals, even if a caller bypasses the interface.

The frontend will use the returned kind to keep bank options available in Manual Journal lines and unavailable in Recurring Journal lines. No browser-side rule replaces server or database enforcement.

## Database Enforcement

An additive Finance migration will replace the Manual Journal line guard function without weakening draft-only mutation controls. A line will pass when it references either:

1. an active governed general nominal satisfying the current predicates; or
2. an active bank-controlled nominal linked to an active same-company Bank Account whose currency equals the Manual Journal base currency.

The bank path will continue to require an active, non-header, manually postable, non-system account with reconciliation enabled. The migration will not modify existing Journal data and will not be applied automatically to shared, UAT, or production databases.

## API and Repository Enforcement

The Journal repository will centralize nominal eligibility with an explicit mode:

- `manual`: eligible general and same-base-currency bank nominals;
- `recurring`: eligible general nominals only.

All Manual Journal lifecycle validation points will use `manual`. Recurring template create and update will use `recurring`. Validation failures will return a safe Journal nominal error that explains whether the account is inactive, outside the company, not governed, or incompatible with base-currency Journal entry without exposing database details.

Tenant, company, user-company access, and live permission checks remain mandatory before options or mutations are processed.

## User Interface

The shared `SearchableSelect` component will replace the native nominal `<select>` in the Journal line editor. Each line will provide:

- the existing accessible label, `Nominal account line N`;
- an in-popup search input labelled `Search nominal account line N`;
- matching by code or account name;
- a bounded, keyboard-accessible results list;
- the selected value retained while editing other lines; and
- clear loading, empty, disabled, and invalid states using existing design-system behavior.

Option labels will retain `code · name`. Bank-controlled options will include a concise `Bank` marker so users can distinguish them from ordinary nominals without changing the stored account identifier.

Because Manual and Recurring screens share the line editor, the component will receive an explicit eligibility mode. Recurring screens will filter out bank options for presentation, while server validation remains authoritative.

## Reconciliation and Ledger Integrity

Manual Journal posting continues through the existing Finance posting service and creates ordinary immutable `journal_entry` and `journal_line` records. A posted line referencing the Bank Account ledger is already included by Bank Reconciliation's ledger-population query for that account, currency, date range, and posted state.

No duplicate Bank transaction or synthetic reconciliation record will be created. Reversal continues to create the governed reversing ledger entry, which is reflected in account balances under existing rules.

## Verification

Automated coverage will verify:

- an eligible same-base-currency bank nominal appears in Manual Journal options;
- searching by bank code or name finds and selects it;
- Manual Journal create, update, submit, approval/post, detail, and reversal preserve the bank account identifier;
- the posted bank line is eligible for Bank Reconciliation;
- inactive, cross-company, foreign-currency, unlinked, header, system, non-postable, and non-reconciliation bank accounts are rejected;
- recurring templates reject bank-controlled nominals through alternate API paths;
- the database trigger independently enforces the same rules;
- existing general-nominal Journal behavior remains unchanged; and
- contracts, generated client, type checks, focused tests, migration tests, theme audit, and production web build pass.

## Deployment

The Finance migration must run before the updated API is used, otherwise the existing database trigger will reject bank-controlled lines. Deployment requires the normal migration backup, migration verification, API rollout, worker compatibility check, and web rollout. Shared/UAT migration execution and financial test posting require separate explicit authorization.
