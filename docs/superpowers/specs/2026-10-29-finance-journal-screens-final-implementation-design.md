# Finance Journal screens final implementation design

## Goal

Complete the existing Finance Journals workspace for staging/UAT without
redesigning unrelated Finance, Bank, or HR modules. The six owned surfaces are
Journal Register, Manual Journal, Journal Detail, Approval, Reversal, and
Recurring Journals.

## Architecture boundary

The current dependency direction remains unchanged:

`Journal screen -> Finance Journals client -> generated API client -> /api/v1/finance -> Journal service -> repository -> PostgreSQL/shared Finance posting service`

Manual Journals own draft editing, submission, approval/posting, permanent
draft deletion, and reversal. Bank, HR, and other module-owned ledger entries
are visible read-only in the unified register and detail screen; their
mutations remain in their owning modules.

## Screen behavior

### Journal Register

- Load database-backed entries for the selected company.
- Support reference, state, source, nominal, and date-range filters.
- Use server cursors for bounded pagination rather than silently truncating at
  100 rows.
- Show reliable loading, empty, retry, and error states.
- Route the selected row to Journal Detail.

### Manual Journal

- Create and edit only draft Manual Journals.
- Use company base-currency precision for amount input, totals, and balance
  validation without binary floating-point decisions.
- Validate required date, nominal, description, one-sided positive amounts,
  minimum line count, exact balance, and currency scale before sending.
- Preserve unsaved-change protection.
- Save, submit, and permanently delete drafts through the real API with clear
  confirmations and disabled/busy states.

### Journal Detail

- Display persisted header, lines, source, base currency, lifecycle state,
  posting reference, and immutable audit events.
- Present only capabilities returned by the server.
- Keep non-Manual source entries read-only and never imply Journal ownership
  of Bank/HR reversal.

### Approval

- Load submitted Manual Journal evidence and show a final balanced review.
- Expose approve/post and reject only when allowed by server capabilities.
- Require final posting confirmation, rejection reason, and governed override
  reason where applicable.
- Refresh or navigate only after a confirmed API result; no optimistic success.

### Reversal

- Load a posted Manual Journal and its original lines.
- Require a reversal date on or after the original posting date and an
  auditable reason.
- Explain that the operation creates a compensating entry.
- Prevent duplicate or source-owned reversals through server capabilities and
  shared Finance reversal safeguards.

### Recurring Journals

- List database-backed templates with bounded cursor pagination.
- Create and update monthly or quarterly draft-generation templates.
- Validate date range, narration, reference pattern, lines, exact base-currency
  balance, and status reason.
- Activate/inactivate through explicit confirmation.
- Display occurrence history including draft-created, deleted, failed, and
  exhausted states with retry evidence.
- The worker remains draft-only, fairly scans tenants, isolates failures,
  bounds retries, and prevents duplicate occurrences.

## State and error handling

Screen-local requests use explicit initial/loading/success/empty/error states.
Company changes reset incompatible record and pagination state. Mutation
buttons are disabled during requests and cannot double-submit. API problem
messages retain correlation references without exposing internal details.

Idempotency keys are created once per user action and retained for the duration
of that request. Retrying a failed user action creates a new key; transport
replay of the same request remains safe at the server.

## Security and accounting rules

The UI is advisory. The API and database continue to enforce authentication,
CSRF, live company authority, tenant isolation, preparer/approver separation,
base currency, exact balance, postable nominals, optimistic versions,
idempotency, immutable posted records, reversal chronology, and audit history.

No migration or financial test transaction will be applied to a shared, UAT,
or production environment. Destructive test scenarios use disposable local
databases only.

## Verification

Add focused UI tests for all six screens and critical controls, extend Journal
repository/integration tests for confirmed defects, and retain migration,
contract, worker, Bank Payment, Bank Receipt, HR Payroll, and shared Finance
posting regressions. Required release checks are typecheck, targeted lint,
generated-client verification, isolated migration tests, production web build,
theme audit for changed UI, and `git diff --check`.

