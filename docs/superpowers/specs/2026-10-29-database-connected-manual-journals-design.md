# Database-Connected Manual Journals

## Objective

Replace every fixture-only screen under **Finance > Journals** with a tenant- and company-scoped workflow backed by PostgreSQL and the existing Finance posting engine.

The implementation must preserve the established client-to-API-to-service-to-repository boundary. It must not write directly from the browser to PostgreSQL or create a duplicate Next.js API. Bank, HR, Payroll, and other source workflows must continue using the same immutable ledger without interruption.

## Scope

This increment includes:

- a live Journal register containing manual and system-generated journals;
- a live journal detail view;
- manual-journal draft creation and editing;
- draft deletion under strict lifecycle rules;
- submission, rejection back to draft, final review, approval, and atomic posting;
- a dedicated Journal Approval & Posting queue;
- a governed Journal Reversal workpage for eligible manual journals;
- recurring-journal template management with monthly and quarterly schedules;
- idempotent recurring occurrences that generate drafts for normal approval and never post automatically;
- company-base-currency journals only;
- permission-driven approval and governed self-approval;
- contracts, generated client methods, API routes, repository/service behavior, tests, and UI routing.

This increment does not include attachment storage, foreign-currency manual journals, bulk posting, weekly/yearly/custom recurrence rules, automatic recurring-journal posting, or editing/deleting posted ledger entries.

## Architectural Decision

Manual journals will use a source-document workflow that feeds the existing Finance posting service.

Editable business documents will not be stored directly as ledger `journal_entry` rows. The existing `journal_entry`, `journal_line`, and `accounting_event` tables remain the immutable accounting result. This keeps drafts and approval state separate from posted ledger evidence and preserves existing posting invariants.

### Rejected Alternatives

1. Extending `journal_entry` to act as both editable source document and immutable ledger entry was rejected because it conflicts with existing database guards and mixes workflow state with accounting evidence.
2. Direct CRUD against ledger tables was rejected because it would duplicate and bypass period, balance, currency, account, idempotency, and audit controls already enforced by the Finance posting engine.

## Persistence Model

Additive Finance migrations will introduce source tables equivalent to:

### `manual_journal`

- tenant and company identifiers;
- stable source identifier;
- journal date;
- optional operator reference number;
- base-currency snapshot;
- lifecycle state: `draft`, `submitted`, `posted`, `reversed`;
- preparer, submitter, approver, and posting identities/timestamps where applicable;
- rejection reason and last rejection evidence where applicable;
- generated accounting-event and journal-entry identifiers after posting;
- optimistic version;
- idempotency and request-fingerprint evidence for mutations;
- created and updated timestamps.

### `manual_journal_line`

- tenant and manual-journal identifiers;
- stable line identifier and line order;
- nominal account identifier;
- bounded description;
- debit and credit in company base currency;
- required dimensions snapshot where applicable.

Database constraints will require non-negative amounts and exactly one positive side per line. Server validation remains authoritative for minimum line count, non-zero totals, equality of total debits and credits, account eligibility, dimensions, and lifecycle transitions.

### Existing `recurring_journal_template`

An additive migration will extend the existing recurring-journal template table rather than creating a second competing template store. The governed template will include:

- creator and last updater;
- optimistic version;
- monthly or quarterly schedule;
- start date and optional end date;
- next scheduled date and last generated date;
- base-currency snapshot;
- bounded reference and narration patterns;
- balanced nominal lines;
- active or inactive status;
- created and updated timestamps.

Existing rows, if any, must be validated and safely backfilled before new non-null constraints are enforced. Template line data may remain an immutable JSON snapshot when that preserves the existing schema, but contracts and server validation must enforce the same account, amount, balance, scale, and dimension rules as a manual-journal draft.

### `recurring_journal_occurrence`

A durable occurrence table will record:

- tenant, company, and template identifiers;
- the scheduled date and cycle number;
- the generated manual-journal source identifier;
- generation state and audit timestamps;
- a uniqueness constraint preventing more than one occurrence for the same template and scheduled date.

The worker uses row/advisory locking and idempotent inserts so retries or concurrent workers cannot create duplicate drafts.
If a generated draft is later deleted, the occurrence remains as a minimal `draft_deleted` record with a nullable source link. The same scheduled occurrence is not generated again automatically.

### Draft Deletion Audit

A draft may be permanently deleted only while its latest state is `draft`. Deletion removes its source header and lines in one transaction. Before deletion, the server writes a minimal immutable audit tombstone containing the source ID, company, actor, timestamp, deletion reason, correlation reference, and hashes required for audit-chain continuity. The tombstone does not retain journal descriptions, lines, or amounts.

Submitted and posted journals cannot be deleted. Posted journals are corrected only through the existing reversal mechanism.

## Lifecycle

The normal lifecycle is:

`Draft -> Submitted -> Final review -> Posted -> Reversed` where a later governed reversal is required.

- Drafts are editable and deletable by authorized users.
- Submission locks business fields and lines.
- An authorized approver may reject a submitted journal back to `draft`; rejection requires a reason and increments the optimistic version.
- Final confirmation records the approval decision and posts the journal atomically.
- Approval is not persisted as a detached state that can become stale before posting. Approval evidence, Finance posting, and the source transition to `posted` commit together.
- Posted source documents and ledger results are immutable.
- Reversal creates a new mirror accounting event and journal. It marks the original manual source `reversed` and links the reversal evidence; it never changes original lines or amounts.

## Approval Model

Permissions will be explicit and company-scoped:

- `finance.journal.read`
- `finance.journal.create`
- `finance.journal.update`
- `finance.journal.delete_draft`
- `finance.journal.submit`
- `finance.journal.approve`
- `finance.journal.self_approve`
- `finance.journal.reject`
- `finance.journal.reverse`
- `finance.recurring_journal.read`
- `finance.recurring_journal.manage`

An actor with `finance.journal.approve` may approve journals prepared by another actor. Approving one's own journal additionally requires `finance.journal.self_approve` granted by an administrator.

A governed Super Administrator may approve its own journal through the existing `platform.approval.override` authority. The server must write immutable override evidence through the established approval-override writer. Possessing a role label in a browser session is never sufficient; live server-side role, assignment, company scope, and permission evidence must be checked.

Impersonated sessions cannot submit, approve, self-approve, reject, post, reverse, or delete drafts, and cannot create, change, activate, deactivate, or generate recurring templates.

## Base-Currency Rule

Manual journals are denominated only in the selected company's active base currency.

- The base currency is resolved server-side from the company currency profile.
- The form displays it as read-only.
- Requests cannot supply an alternative transaction currency or exchange rate.
- The Finance posting command uses the base currency, a `1.000000000000000000` rate, and no exchange-rate row.
- Foreign-currency manual journals are outside this increment.

## Posting Transaction

Final confirmation performs the following in one caller-owned database transaction:

1. Lock the manual journal and verify the expected version and `submitted` state.
2. Recheck live tenant, company, approval, and self-approval authority.
3. Resolve and lock the company base-currency authority.
4. Resolve the posting date to an open financial period.
5. Lock and validate every nominal account as active, posting-level, manually postable, company-scoped, and dimension-complete.
6. Recalculate line and journal totals server-side.
7. Verify at least two lines, a non-zero total, exactly one debit/credit side per line, and equal debit/credit totals.
8. Write ordinary approval evidence or a governed override event.
9. Call the existing Finance posting service with a stable manual-journal source type and idempotency key.
10. Link the resulting accounting event and journal entry to the source document and transition it to `posted`.
11. Commit all effects together, or roll back all effects on any failure.

The posting service remains responsible for accounting-event uniqueness, journal numbering, period assignment, base values, line persistence, and immutable ledger guards.

## API and Contracts

Versioned `/api/v1` Finance endpoints and shared contracts will cover:

- paginated journal register queries;
- manual-journal detail;
- form options, including companies, base currency, and eligible nominals;
- create draft;
- update draft with expected version;
- delete draft with expected version and reason;
- submit draft;
- reject submitted journal to draft;
- final review payload;
- confirm and post;
- list the approval queue and load final-review evidence;
- preview and create an eligible manual-journal reversal;
- list, view, create, update, activate, and deactivate recurring templates;
- list recurring occurrence history and generate an idempotent due draft through the worker boundary.

Every mutation requires CSRF protection, a bounded idempotency key, request validation, and the standard problem response with a correlation reference. List endpoints use bounded pagination and filters.

## Journal Register

The live register follows the supplied reference while using Nexora's Tailwind and shared component conventions.

Filters:

- company, where the session has more than one company;
- nominal account;
- operator reference or journal entry number;
- date range;
- lifecycle/status;
- bounded page size and cursor pagination.

Columns:

- row selection;
- Journal ID or draft reference;
- journal date;
- operator reference;
- total debit in company base currency;
- status;
- View action.

The register includes:

- manual drafts and submitted manual journals from the source tables;
- posted/reversed ledger journals from all source modules, including Bank and Payroll;
- no duplicate row after a manual source is posted and linked to its ledger journal.

`Add New` opens the manual-journal form. The trash action is enabled only when every selected item is an authorized deletable draft. Confirmed, posted, reversed, Bank, Payroll, and other system-generated entries are never deletable.

The displayed total is the journal's base-currency debit total, which must equal its credit total for posted entries.

## Manual-Journal Form

Header fields:

- journal date;
- optional reference number;
- read-only company base currency.

The line editor begins with two lines. Each line contains:

- searchable eligible nominal account;
- bounded description;
- debit;
- credit;
- remove-line action.

`Add More` appends a line. The form displays running debit, credit, and difference totals. It prevents obvious client-side errors but does not replace server validation.

Actions:

- Save Draft;
- Cancel;
- Submit for Approval for preparers;
- Review and Confirm for an actor who has the required approval authority after submission.

The form includes unsaved-change protection. Recoverable API errors preserve entered data and display their correlation reference.

## Final Review

The final review is read-only and displays:

- company and base currency;
- journal date, reference, and fiscal period;
- every nominal line and description;
- debit and credit totals;
- balance result;
- preparer identity;
- approver authority;
- a self-approval or Super Administrator override warning when applicable.

A required confirmation checkbox precedes `Confirm and Post`. An optional approval note may be supplied. No posting occurs until this explicit confirmation succeeds.

## Journal Approval & Posting

The dedicated approval screen lists submitted manual journals within the actor's permitted companies. It provides bounded filters for company, preparer, date, reference, and age, plus cursor pagination.

Each row shows the journal date, preparer, reference, base currency, total debit/credit, submission time, and whether self-approval authority would be required. Opening a row displays the same immutable final-review projection described above.

An authorized approver may:

- confirm and post after checking the required confirmation control;
- reject the submission back to draft with a required reason.

The queue never exposes approve or reject actions based only on client permissions. Live company-scoped authority, maker identity, self-approval authority, impersonation state, record version, and lifecycle are rechecked within the mutation transaction.

## Journal Reversal

The reversal workpage accepts an original posted manual-journal number, a reversal date, and a required reason. It displays the original immutable lines and a mirror-entry preview before confirmation.

Only posted, unreversed manual journals are directly reversible from this Finance screen. Bank, Payroll, and other module-owned journals remain visible in Journal Detail but must be reversed through their owning workflow so source-document state cannot diverge from the ledger.

Reversal confirmation:

1. locks the original manual source and ledger evidence;
2. verifies live `finance.journal.reverse` authority and an open period for the requested reversal date;
3. calls the existing Finance reversal service with a stable idempotency key;
4. links the new accounting event and reversal journal to the original source;
5. transitions the source from `posted` to `reversed` in the same transaction.

The original journal is never edited or deleted.

## Recurring Journals

The Recurring Journals screen provides a paginated template register, template detail/history, and create/edit form.

Template fields:

- company and read-only company base currency;
- template name;
- monthly or quarterly frequency;
- start date and optional end date;
- next scheduled date;
- reference and narration patterns;
- the same balanced nominal-line editor used by Manual Journal;
- active/inactive state.

Activating or changing a template requires `finance.recurring_journal.manage`, an expected version, a reason, and an idempotency key. Editing a template affects future occurrences only. Previously generated drafts and posted journals are immutable snapshots and are never rewritten.

The worker periodically claims due active templates with bounded batches and `SKIP LOCKED`/advisory-lock protection. For each due date it creates exactly one ordinary `manual_journal` in `draft` state, copies the template's base currency and lines, records the occurrence, advances the next scheduled date, and commits atomically. The generated draft follows the normal edit, submit, approval, final-confirmation, posting, deletion, and rejection rules. No recurring occurrence posts automatically.

The screen displays occurrence history and the linked draft/posted journal. An authorized operator may request generation of an already-due occurrence through the durable worker/job boundary; the HTTP request itself does not post or create ledger entries.

## Journal Detail

The detail view displays source metadata, ledger number, lifecycle, audit identities/timestamps, lines, totals, accounting event, and reversal linkage when present.

Manual drafts expose edit/delete controls according to permissions. Submitted journals expose reject and final-review controls to authorized approvers. Posted and system-generated journals are read-only. Reversed manual journals show both original and reversal links. Module-owned journals identify the owning workflow for any permitted correction.

## Validation and Failure Behavior

The server rejects:

- closed or unavailable periods;
- inactive, header, system-controlled, module-controlled, or manually blocked nominals;
- accounts outside the selected company;
- missing required dimensions;
- fewer than two lines;
- invalid scale, negative values, both debit and credit on one line, or empty lines;
- zero or unbalanced totals;
- any non-base currency attempt;
- stale expected versions;
- idempotency-key reuse with a different request;
- unauthorized approval, self-approval, rejection, deletion, or posting;
- unauthorized or duplicate reversal;
- invalid recurrence ranges, unsupported frequencies, duplicate occurrences, or attempts to change generated history;
- changes or deletion after submission/posting.

Concurrency and integrity failures return safe conflict responses. Internal database details, stack traces, credentials, and infrastructure URLs are never exposed.

## UI Integration

All six existing fixture-rendered pages in the **Finance > Journals** navigation group will route to dedicated live feature components under `app/features/finance`:

- `journal-register`;
- `manual-journal`;
- `journal-detail`;
- `journal-approval`;
- `journal-reversal`;
- `recurring-journals`.

The generic fixture profile may remain only as historical prototype data until selector searches confirm it is no longer an active dependency.

New UI uses Tailwind utilities and existing shadcn primitives. It preserves keyboard access, labels, focus, loading, error, empty, disabled, responsive, and destructive-confirmation states.

## Verification

Required verification includes:

- additive migration safety and migration-count tests;
- tenant and company isolation integration tests;
- contract parsing, OpenAPI, and generated-client checks;
- repository/API tests for create, edit, delete, submit, reject, review, post, pagination, and filters;
- approval-queue authorization, filtering, review, rejection, and posting tests;
- reversal eligibility, open-period, idempotency, atomicity, and source-ownership tests;
- recurring template lifecycle, monthly/quarterly date progression, worker concurrency, occurrence uniqueness, retry, and draft-generation tests;
- balance, scale, base-currency, period, account, dimensions, concurrency, and idempotency tests;
- normal approval, self-approval, Super Administrator override, denial, and impersonation security tests;
- proof that confirmation rolls back the source transition if Finance posting fails;
- UI tests for register filters, pagination, line editing, draft deletion, submission, approval queue, rejection, final review, posting, reversal, and recurring templates/history;
- regression checks for Bank and HR/Payroll posting behavior;
- generated client, type checking, linting, formatting, UI theme audit, `git diff --check`, and production web build;
- browser verification of desktop and narrow layouts for all six Journal screens.

## Success Criteria

- Journal pages no longer display fixture-only data.
- Authorized users can create, edit, and delete drafts safely.
- Submitted journals are locked and cannot be deleted.
- Only authorized approvers can reach final confirmation.
- Self-approval requires explicit authority or a governed Super Administrator override.
- Every confirmed journal posts once through the existing Finance engine and appears once in the unified register.
- Posted ledger evidence is immutable and reversible only through governed reversal.
- Eligible manual journals can be reversed once without bypassing source ownership.
- Monthly and quarterly recurring templates generate one draft per due occurrence and never auto-post.
- Every screen under Finance > Journals is live and database-connected.
- Bank and HR/Payroll workflows remain operational and unchanged.
