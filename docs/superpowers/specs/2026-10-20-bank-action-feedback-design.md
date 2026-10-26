# Bank approvals and action feedback

## Confirmed intent

Bank scope only. Approval must not ask for a business reason, including a
governed super-admin approval. Rejection must require a reason. Existing reversal
controls remain unchanged. A successful action must be visibly acknowledged.

## Approach

Reuse the shell's existing success notification stack through a small shared
feedback context for Bank and its Finance nominal master-data views. This keeps
messages visible after a dialog closes or navigation occurs. Avoid a second
toast library or browser alerts; inline errors remain beside the failed action.

An inline-only alternative loses feedback on navigation; a new notification
service/library would duplicate the existing shell. The shared shell approach
is the smallest consistent implementation.

## Approval behavior

- Nominal confirmation uses “Approve & Close”, with no reason field.
- Payment and Receipt approvals likewise do not ask for a reason.
- Show rejection reason only when rejecting; validate it on the server.
- Keep maker/checker permissions, super-admin authority, version checks,
  idempotency, transaction boundaries and immutable audit events.
- When an override's audit schema requires explanatory text, the server records
  an explicit system-generated approval confirmation, distinguished from a
  user-entered rejection reason. Do not invent a user-supplied justification.
- Do not combine approval with financial posting.

## Feedback

After confirmed API success show action-specific messages for Bank account
creation/update/submission/approval/rejection/status changes and Payment/Receipt
creation/update/submission/approval/rejection/posting/reversal. Never show success
for validation failures, denied actions or failed requests. A saved draft followed
by failed submission reports the saved draft accurately, but not submission.

## Verification and boundaries

Add contract tests for reason-free approvals and mandatory rejection reasons;
service tests for automatic override audit text; and browser checks for successful
messages, closed approval dialog and absent approval reason input. Keep existing
financial posting and reversal tests. Fix the reported installed trigger ambiguity
with additive Finance migration 0010; never edit historical migrations. Apply and
verify the repair on an isolated database before local runtime rollout. Leave the
user's existing pending account unchanged for their own approval retry.

## Execution checklist

- [x] Inspect current workflows, error and notification conventions.
- [x] Confirm rejection-only reason requirement with the user.
- [x] Reproduce installed Bank trigger ambiguity on a disposable database copy.
- [x] Review this written design with the user (confirmed 2026-10-20).
- [x] Implement shared feedback and approval-only reason changes.
- [x] Verify contracts, services, browser behavior, build and handoff.
