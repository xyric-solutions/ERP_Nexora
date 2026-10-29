# Finance Journals staging-hardening design

## Goal

Remove the confirmed staging blockers from the Finance Journals implementation
without broadening the feature or disturbing unrelated Bank, HR, currency, UI,
script, or planning changes already present in the working tree.

This batch addresses separation of duties, recurring-job reliability, unified
register compatibility, reversal chronology, and the missing release-gate
integration tests. Medium- and low-priority presentation improvements that do
not block safe staging remain outside this batch.

## 1. Approval separation of duties

A Journal preparer is any actor who creates the draft, materially updates its
business fields or lines, or submits it. The source document will retain
immutable preparer evidence sufficient to evaluate the final decision within
the posting transaction.

An actor may approve and post only when one of these conditions is true:

1. the actor is not a preparer and has live company-scoped
   `finance.journal.approve` authority;
2. the actor is a preparer and additionally has live company-scoped
   `finance.journal.self_approve` authority; or
3. the actor is a preparer and the existing approval-override writer records a
   valid governed Super Administrator override.

The repository and database lifecycle guard will enforce the same rule. Client
capabilities remain advisory and never replace server checks. Revoked
permissions, impersonated sessions, stale versions, and cross-company actors
continue to fail closed.

## 2. Recurring-job reliability

Recurring template update and status mutations will resolve an idempotency
replay or conflict before testing mutable version or lifecycle state. A stable
transaction-level lock will serialize equivalent keys so concurrent identical
requests produce one effect and a replay-compatible response.

Tenant selection will use a durable fair scan cursor or deterministic rotating
window so tenants beyond the configured batch limit are eventually processed.
One tenant or template failure will not prevent later tenants from running.

Occurrence attempts will never exceed the database constraint. Exhausted
occurrences will enter an explicit terminal state with retained error evidence
instead of repeatedly aborting the tenant transaction. Retry behavior remains
idempotent, and a deleted generated occurrence remains non-regenerable.

The worker will continue to create drafts only. It will not approve, post, or
silently manufacture exchange rates or accounting corrections.

## 3. Unified register compatibility

Source classification will use the actual accounting source identifiers,
including dotted values such as `banking.payment`, `banking.receipt`, and
`hr.payroll`, while retaining support for established underscore source types
such as Bank FX Revaluation.

Bank, Payroll, Finance, and Manual filters will apply distinct server-side
predicates rather than treating every non-manual source alike. Detail totals
will use the company base currency and its configured decimal precision; no
two-decimal assumption will remain for non-manual ledger entries.

These changes are read-only projections. They do not change Bank, Receipt, HR,
or ledger ownership and do not permit Journal screens to reverse module-owned
transactions.

## 4. Reversal chronology

A Manual Journal reversal date must be on or after the original ledger posting
date. The shared Finance reversal path will continue to require one open
company period, an unreversed original posting, exact mirrored ledger lines,
source ownership, transaction idempotency, and atomic source/ledger updates.

The chronology rule belongs in the shared Finance reversal service so every
caller receives the same protection. Existing callers will receive focused
regression coverage before handoff.

## 5. Release-gate tests

Add focused integration and security tests covering:

- create, edit, submit, reject, approve/post, delete-draft, and reverse;
- cross-tenant and cross-company denial under forced RLS;
- creator, editor, and submitter separation; ordinary approval; explicit
  self-approval; Super Administrator override; revoked authority; and
  impersonation denial;
- same-key replay, changed-payload conflict, stale versions, concurrent posting,
  and rollback when Finance posting fails;
- exact balance, company base-currency scale, inactive/non-postable nominals,
  required dimensions, and closed periods;
- posted/submitted mutation and deletion rejection at both repository and
  database-guard boundaries;
- recurring template replay, concurrent generation, tenant fairness, retry
  exhaustion, occurrence uniqueness, deleted occurrences, and isolated
  failures; and
- Bank Payment, Bank Receipt, HR Payroll, and Finance register classification,
  filtering, and non-two-decimal detail totals.

Existing Bank/Receipt/HR shared-ledger regressions must remain green. Contract,
generated-client, migration, type, lint, theme, and production-build checks
remain required.

## 6. Migration and compatibility strategy

Schema changes will be additive and appended as new source migrations rather
than rewriting Finance 31 or Security 20 after those files have been reviewed.
Any preparer-evidence or terminal-occurrence additions will preserve existing
rows with safe defaults or deterministic backfill evidence.

No shared, UAT, or production migration will be applied during implementation.
No shared financial data will be created or posted. Migration behavior will be
validated only against disposable/local test databases.

## 7. Change isolation and handoff

Implementation will touch only Journal-owned files, the shared Finance reversal
boundary where chronology must be universal, generated contract artifacts when
their schemas change, and focused tests/documentation. Unrelated working-tree
changes will not be reformatted, reverted, staged, or committed.

Staging remains blocked until the critical separation-of-duties defect, the
recurring reliability defects, source classification/precision errors,
reversal chronology, and the specified integration/security tests are all
verified. Medium- and low-priority improvements from the broader audit remain a
separate hardening batch.
