# Bank Statement Import and Reconciliation Design

**Date:** 2026-10-22  
**Status:** Approved design pending implementation plan  
**Scope:** Banking statement import, matching and reconciliation for the existing Nexora ERP architecture

## 1. Objective

Replace the current fixture-backed Bank Statement and Bank Reconciliation screens with tenant- and company-scoped production workflows backed by PostgreSQL, the versioned API, and local MinIO object storage.

The feature must:

- import CSV and `.xlsx` bank statements;
- retain the original file as immutable audit evidence;
- support the standard Nexora template and reusable mappings for native bank files;
- normalize and validate at most 1,000 data rows per file;
- prevent duplicate files and duplicate statement rows;
- match finalized statement rows against posted bank-account journal movements;
- automatically confirm only strict, unique exact matches;
- present weaker or ambiguous candidates as suggestions requiring confirmation;
- persist the full reconciliation lifecycle and immutable audit history; and
- enforce separate approval, while allowing Shoaib's governed Super Administrator override in the local test environment.

This design does not allow an imported statement to create or post accounting entries directly.

## 2. Confirmed Decisions

- Both CSV and Excel `.xlsx` are supported.
- Import uses a staged, synchronous, bounded pipeline.
- Native bank formats use configurable, reusable column mappings.
- The original file is retained in local MinIO and identified by a SHA-256 checksum.
- Exact matches are automatically confirmed; suggested matches require user confirmation.
- Finalizing an import only makes its rows available to reconciliation.
- Bank charges, interest and other bank-only movements use a separate approved adjustment workflow before reconciliation can be approved.
- Reconciliation follows `draft -> in_progress -> submitted -> approved`.
- Approval normally requires a separate user. Shoaib may use the audited Super Administrator override for local testing.

## 3. Architectural Boundaries

The existing dependency direction remains unchanged:

```text
Banking UI
  -> /api/v1/banking routes
  -> authentication, CSRF and authorization
  -> statement/reconciliation services
  -> repositories
  -> PostgreSQL + MinIO
```

Browser code never connects directly to PostgreSQL or MinIO. Contracts and OpenAPI definitions live in `packages/contracts`. Migrations live in `packages/db`. The reusable API remains in `server/api`; no duplicate Next.js API implementation is introduced.

The implementation extends the existing Banking module rather than creating a separate Finance reconciliation backend. Reconciliation operates on posted `journal_line` records for the selected Bank Account's governed nominal account.

## 4. Domain Model

All records include `tenant_id`, `company_id`, immutable identifiers, timestamps and version fields where mutation is allowed. Foreign keys, row-level tenant isolation, bounded indexes and immutable event triggers follow existing Banking conventions.

### 4.1 Mapping profile

`bank_statement_mapping_profile` stores reusable parsing rules scoped to a company and Bank Account:

- name and lifecycle status;
- file format (`csv` or `xlsx`);
- CSV delimiter/encoding or Excel worksheet/header-row selection;
- date format;
- amount convention (`separate_debit_credit` or `signed_amount`);
- column mapping for date, debit/payment, credit/receipt, signed amount, reference, details, transaction type, account text and payment mode;
- signed-amount direction convention;
- creator/updater and row version.

Only active profiles may be selected for a new import. Updating a profile never changes an already-parsed import.

### 4.2 Statement import

`bank_statement_import` is the aggregate root for an uploaded file:

- Bank Account and optional mapping profile;
- statement reference number;
- original filename, detected media type, object-storage key, byte size and SHA-256 checksum;
- selected date format and mapping snapshot;
- lifecycle: `uploaded`, `draft`, `validated`, `finalized` or `rejected`;
- total, valid, warning, error, duplicate, excluded and finalized row counts;
- created/finalized actors and timestamps;
- optimistic row version.

A unique active checksum constraint per tenant/company/Bank Account prevents accidental duplicate files. A deliberate retry returns the existing idempotent result rather than creating another import.

### 4.3 Statement line

`bank_statement_line` stores the immutable source evidence plus normalized values:

- import ID and source row number;
- sanitized raw row JSON for audit and remapping diagnostics;
- transaction date;
- direction (`money_in` or `money_out`) and positive amount;
- Bank Account currency;
- reference, details, transaction type, account text and payment mode;
- deterministic row fingerprint;
- inclusion state (`included` or `excluded`) and exclusion reason;
- validation state (`valid`, `warning`, `duplicate` or `error`) and bounded validation issues.

Amounts use PostgreSQL numeric types and contract decimal strings. Floating-point arithmetic is not used for persisted financial values.

### 4.4 Reconciliation

`bank_reconciliation` stores one governed reconciliation record:

- Bank Account and source import when the method is statement import;
- method (`statement_import` or `manual_tick`);
- statement date and period boundaries;
- statement reference;
- opening and closing statement balances;
- authoritative ledger-balance snapshot and calculation timestamp;
- difference, matched/unmatched counts and adjustment count;
- lifecycle: `draft`, `in_progress`, `submitted` or `approved`;
- prepared, submitted and approved actors/timestamps;
- row version.

A partial unique constraint prevents more than one non-approved reconciliation for the same Bank Account and overlapping statement period. An approved statement import cannot be attached to another reconciliation.

### 4.5 Match

`bank_reconciliation_match` links a statement line to a posted `journal_line`:

- reconciliation, statement-line and journal-line IDs;
- match type (`exact`, `suggested` or `manual`);
- state (`proposed`, `confirmed` or `rejected`);
- confidence score and bounded reason codes;
- confirmation/rejection actor and timestamp;
- row version.

Confirmed matches are unique on both statement line and journal line within active reconciliations. Reversed journal entries are ineligible and invalidate unapproved proposals.

### 4.6 Bank-only adjustment

`bank_reconciliation_adjustment` is a separate governed transaction for one unmatched included statement line. It captures adjustment kind, eligible offset nominal and narrative while taking the bank direction/amount immutably from the statement line. Its lifecycle is `draft`, `submitted`, `approved`, `posted` or `reversed`.

Approval and posting are separate actions. Posting uses the existing Finance posting authority to create one balanced accounting event/journal: money-in debits the governed Bank nominal and credits the offset; money-out credits Bank and debits the offset. Reversal is compensating. Reconciliation approval requires the adjustment to be posted and its Bank journal line to be matched normally.

### 4.7 Events

Immutable event tables capture import creation, validation, finalization, mapping changes, exclusions, match proposals, confirmations, unmatches, submission and approval. Approval override evidence uses the existing global override writer.

## 5. Import Workflow

### 5.1 Upload

The API streams the file to local MinIO while calculating its checksum; it does not buffer an unbounded file in memory. The object is stored under a server-generated tenant/company/import key. Database metadata never exposes infrastructure URLs.

The server validates:

- authenticated tenant/company and Bank Account access;
- statement-import permission;
- `.csv` or `.xlsx` detected content type;
- configured byte limit;
- no encrypted workbook, macros or unsupported workbook container;
- one selected worksheet and at most 1,000 data rows;
- bounded column count and cell length.

Formula cells are read as inert values only. No formula, macro, hyperlink or external workbook reference is evaluated. Before workbook materialization, the server applies bounded ZIP controls for compressed and expanded bytes, entry counts, individual-entry size, compression ratio and XML/shared-string/style size, and rejects traversal, entity expansion, encryption, macros and external relationships.

### 5.2 Mapping and preview

The standard Nexora template maps automatically. A native bank file enters the mapping step when no active profile matches. Users map required and optional fields, select the date/amount convention and may save the configuration as a reusable profile.

Required normalized data is:

- transaction date;
- exactly one amount representation: separate payment/receipt columns or one signed amount;
- a resolvable direction and positive amount.

Reference and details may be blank individually, but at least one must be present to support audit and matching. The preview displays every accepted source row with its normalized values and validation status. Error rows cannot be included. Warning and duplicate rows require explicit resolution. Excluding a row requires a reason.

### 5.3 Save and finalize

**Save and Close** persists the draft, mapping snapshot, parsed lines and validations.

**Post to Reconciliation and Close** is the finalization action. The label means post statement evidence into the reconciliation workspace; it never posts to the General Ledger. Finalization is transactional, idempotent and blocked when included rows have errors, unresolved duplicates or invalid dates/amounts.

Finalized source evidence is immutable. Corrections require a new import that explicitly supersedes the rejected import; finalized imports already attached to a reconciliation cannot be replaced silently.

### 5.4 Sample export

The screen exports both CSV and `.xlsx` sample templates with these columns:

`Date`, `Payment`, `Receipt`, `Transaction Type`, `Account`, `Payment Mode`, `Ref No.`, `Detail`.

The template includes instructions, not production financial data.

## 6. Matching Rules

Candidates are limited to posted, unreconciled Bank Account `journal_line` records in the same tenant, company, governed bank nominal and currency. Date and amount searches are bounded and indexed.

### 6.1 Exact auto-match

A statement line is automatically confirmed only when all conditions hold:

- same Bank Account and currency;
- exact amount and direction;
- normalized non-empty reference matches;
- journal posting date is within three calendar days of the statement date;
- exactly one eligible journal-line candidate exists; and
- neither side is already confirmed elsewhere.

If multiple candidates satisfy the rule, no automatic match occurs.

### 6.2 Suggested match

Suggestions use deterministic scoring based on amount, direction, date distance, normalized reference and normalized narrative tokens. The response includes reason codes so the user can understand the suggestion. A suggestion never changes reconciliation state until a permitted user confirms it.

The first release uses deterministic rules, not machine learning. Thresholds are centralized server configuration with conservative defaults and tests.

### 6.3 Manual match and unmatch

Users can manually select one eligible statement row and one eligible journal line. The server revalidates both records inside the transaction. Unmatching is allowed only before submission and records a reason and immutable audit event.

## 7. Reconciliation Workflow

1. A user starts from a finalized import or creates a manual-tick reconciliation.
2. The server captures the eligible ledger population and current ledger balance.
3. Exact matches are confirmed; suggestions and unmatched rows remain visible.
4. The user confirms/rejects suggestions, creates manual matches, excludes permitted non-transaction rows with a reason, or routes bank-only rows through the separate adjustment workflow.
5. The server recalculates counts, balances and difference after every mutation.
   - Bank-nominal debit is money-in and credit is money-out.
   - Statement reconstruction is opening statement balance plus statement money-in less statement money-out.
   - Adjusted ledger balance is ledger balance at cutoff less unmatched ledger money-in plus unmatched ledger money-out.
   - Difference is closing statement balance less adjusted ledger balance, rounded once to the Bank Account currency precision.
6. Submission is allowed only when:
   - difference is zero to the Bank Account currency precision;
   - every included statement row is matched or resolved by a posted approved adjustment;
   - no duplicate or validation error remains;
   - no linked journal entry is reversed; and
   - the fiscal and Bank Account controls remain valid.
7. A separate authorized approver approves the submitted record. The preparer cannot approve their own reconciliation unless the governed Super Administrator override is valid and immutable evidence is written.
8. Approval marks matched journal lines and statement rows reconciled atomically. It does not post new accounting entries.

Approved reconciliations and their evidence are immutable. Reopen/reversal is outside this first implementation and requires a separate governed design.

## 8. Interface Design

### 8.1 Import Statement

The layout follows the supplied reference while using Tailwind and existing shadcn primitives:

- page title and compact search/import card;
- required live Bank selector;
- date-format selector;
- file chooser with CSV/XLSX accept rules;
- sample-file export;
- upload/validate action;
- mapping panel shown only when mapping is required or edited;
- statement reference;
- responsive preview table with Date, Payment, Receipt, Transaction Type, Account, Payment Mode, Ref No., Detail and row status/include control;
- persistent validation summary and per-row issue display;
- Cancel, Save and Close, and Post to Reconciliation and Close actions.

Keyboard labels, table semantics, focus states, busy states, destructive confirmations and narrow-screen horizontal scrolling are preserved.

### 8.2 Reconciliation register

The existing register becomes live and shows Bank Account, statement date/period, statement reference, method, closing balance, ledger balance, difference, unmatched count, preparer and lifecycle status. Filters, pagination and empty/error states are server-backed and bounded.

### 8.3 Reconciliation workspace

The existing two-sided worksheet becomes live:

- left: statement rows and their validation/match state;
- right: eligible posted ledger movements;
- center/summary: opening balance, money in/out, adjustments, reconstructed balance, statement balance and difference;
- exact, suggested and manual match indicators;
- explainable suggestion reasons;
- match, unmatch, exclude, save, submit and approve actions governed by state and permission;
- immutable audit timeline.

The business label for `submitted` is **Waiting for approval**.

## 9. API and Contracts

Contracts are added to `packages/contracts`, exposed through OpenAPI, and consumed by the generated client. The first implementation exposes these endpoints:

- `GET /api/v1/banking/statement_import_options`
- `GET /api/v1/banking/statement_import_templates/{format}`
- `POST /api/v1/banking/statement_imports`
- `GET /api/v1/banking/statement_imports`
- `GET /api/v1/banking/statement_imports/{id}`
- `PATCH /api/v1/banking/statement_imports/{id}/mapping`
- `PATCH /api/v1/banking/statement_imports/{id}/lines/{lineId}`
- `POST /api/v1/banking/statement_imports/{id}/validate`
- `POST /api/v1/banking/statement_imports/{id}/finalize`
- `GET/POST/PATCH /api/v1/banking/statement_mapping_profiles`
- `GET /api/v1/banking/reconciliations`
- `POST /api/v1/banking/reconciliations`
- `GET /api/v1/banking/reconciliations/{id}`
- `POST /api/v1/banking/reconciliations/{id}/matches`
- `POST /api/v1/banking/reconciliations/{id}/matches/{matchId}/decision`
- `DELETE /api/v1/banking/reconciliations/{id}/matches/{matchId}`
- `POST /api/v1/banking/reconciliations/{id}/adjustments`
- `PATCH /api/v1/banking/reconciliations/{id}/adjustments/{adjustmentId}`
- `POST /api/v1/banking/reconciliations/{id}/adjustments/{adjustmentId}/submit`
- `POST /api/v1/banking/reconciliations/{id}/adjustments/{adjustmentId}/decision`
- `POST /api/v1/banking/reconciliations/{id}/adjustments/{adjustmentId}/post`
- `POST /api/v1/banking/reconciliations/{id}/adjustments/{adjustmentId}/reverse`
- `POST /api/v1/banking/reconciliations/{id}/submit`
- `POST /api/v1/banking/reconciliations/{id}/decision`

Uploads use bounded multipart requests. Mutation endpoints require CSRF, idempotency keys and `If-Match`/expected-version evidence. List endpoints use cursor pagination and bounded filters. All failures use the standard problem format and correlation IDs.

## 10. Authorization

Add distinct permission definitions without implicitly granting them:

- `banking.statement_import.read`
- `banking.statement_import.create`
- `banking.statement_import.update`
- `banking.statement_import.finalize`
- `banking.statement_mapping.read`
- `banking.statement_mapping.manage`
- `banking.reconciliation.read`
- `banking.reconciliation.create`
- `banking.reconciliation.update`
- `banking.reconciliation.match`
- `banking.reconciliation.submit`
- `banking.reconciliation.approve`
- `banking.reconciliation_adjustment.read`
- `banking.reconciliation_adjustment.create`
- `banking.reconciliation_adjustment.update`
- `banking.reconciliation_adjustment.submit`
- `banking.reconciliation_adjustment.approve`
- `banking.reconciliation_adjustment.post`
- `banking.reconciliation_adjustment.reverse`

Every repository query and mutation rechecks tenant, company, Bank Account and permission scope. UI visibility is not authorization. Shoaib receives a local company-scoped overlay for testing; shared production roles are not broadened automatically.

## 11. Failure Handling and Observability

- Parsing or validation failure leaves the import in a recoverable draft/rejected state and never creates partial finalized lines.
- Object upload plus database creation uses compensating cleanup for an uncommitted object; a durable orphan-cleanup job handles process failure between systems.
- Database transitions are atomic and fail closed.
- Duplicate requests return the prior idempotent result.
- Concurrency conflicts return a clear stale-version response.
- Structured logs include correlation ID, tenant, company, aggregate ID and action, but never raw statement content, account numbers, credentials or object-storage URLs.
- Metrics cover upload/parse duration, row counts, validation failures, duplicate rates, exact/suggested/manual matches, open reconciliation age and approval failures.

## 12. Testing and Acceptance Criteria

### 12.1 Automated verification

- Fresh and upgrade migration tests, including tenant isolation and immutable events.
- Database-security tests for cross-tenant/company access, duplicate constraints and forbidden lifecycle transitions.
- Contract/OpenAPI/generated-client parity tests.
- CSV and `.xlsx` parser tests, date formats, signed/separate amounts, formula cells, malformed/encrypted files, unsupported types and exact 1,000/1,001 row boundaries.
- Mapping-profile create/update/use tests.
- Checksum and row-fingerprint duplicate tests.
- Exact-match uniqueness, ambiguity, suggestion scoring, manual match, reversal and concurrency tests.
- Reconciliation zero-difference, adjustment readiness, submit and approval tests.
- Maker-checker and audited Shoaib override tests.
- UI unit tests for import, mapping, preview, directory, worksheet, statuses, errors and keyboard behavior.
- Local end-to-end import-to-approved-reconciliation test using isolated fixture records.
- Type check, lint, `git diff --check` and production web build.

### 12.2 User acceptance

The work is complete when a permitted user can:

1. select a live company Bank Account;
2. download a CSV or Excel sample;
3. upload either standard template or a native bank file;
4. create/reuse a mapping, validate and preview no more than 1,000 rows;
5. save a draft or finalize the import without creating GL entries;
6. open a database-backed reconciliation;
7. review exact matches and confirm suggested/manual matches;
8. resolve bank-only items through approved adjustment evidence;
9. submit only a zero-difference reconciliation; and
10. have a separate approver approve it, or use Shoaib's audited local override.

The register, statement view and reconciliation workspace must reload from the API and show the same persisted states after browser refresh.

## 13. Rollout and Data Safety

Implementation proceeds additively:

1. contracts and permission catalogue;
2. PostgreSQL schema and database guards;
3. object-storage and parser adapters;
4. repository/service/API with integration and security tests;
5. generated client;
6. statement-import UI;
7. reconciliation register/workspace migration from fixtures;
8. Shoaib-only local authorization and UAT data;
9. localhost end-to-end verification.

Existing fixture screens remain explicitly prototype-only until their live counterparts pass end-to-end verification. No Railway deployment is part of this work.
