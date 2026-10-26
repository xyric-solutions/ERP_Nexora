# Bank Transfer submit, approval navigation and status

## Status

Resolved in the local workspace on 2026-10-22. No live Bank Transfer was
created, submitted, approved or posted during diagnosis or verification.

## Symptoms

- A user completing Add Transfer could not see the expected Payment/Receipt
  style approval flow.
- After submission, the work/list view exposed the internal state value
  `submitted` rather than the business label `Waiting for approval`.
- Shoaib's governed same-user Super Administrator approval was available on the
  server, but the Transfer entry/detail UI did not provide the same explicit
  Approve & Close experience as Bank Payments and Bank Receipts.

## Evidence

1. The local tenant had zero `bank_transfer` rows after the reported attempt,
   confirming no partial Transfer or posting was left behind.
2. The company has an active fiscal calendar, an open October 2026 period,
   eight active Bank Accounts and the previously configured Transfer/FX policy.
3. `BankingTransferEntry.save(true)` already performed create then submit and
   routed to the persisted Transfer detail on success.
4. Unlike Payment/Receipt entry, Transfer entry did not use `BankEntryActions`,
   did not consume the workflow selector's self-approval eligibility and did
   not authoritatively re-read the submitted record before Approve & Close.
5. Transfer list/detail/entry rendered raw lifecycle values, so the submitted
   work item was not labelled `Waiting for approval`.

## Root cause

The production Transfer backend lifecycle was present, but the final UI parity
work was incomplete. The Transfer form used a simpler action footer and exposed
raw state values. That made the intended two-step submit/approve flow unclear
and omitted the explicit same-user governed Super Admin close behavior already
used by the Payment/Receipt entry pattern.

## Fix

- Plain **Submit for Approval** persists the draft, submits it and opens the
  authoritative Transfer detail/approval screen.
- A separate **Approve & Close** action appears only when the current user is
  the selected approver and the session has either the governed Super Admin
  override or a delegated self-approval grant.
- Approve & Close re-reads the submitted Transfer before deciding, then returns
  to the Transfer list only after the server accepts the approval.
- Create, update, submit and approve retain separate retry/idempotency keys. If
  approval fails after submission, the UI opens the already submitted detail
  rather than risking another draft on retry.
- The server remains authoritative for tenant/company permission, assignment,
  maker-checker override, audit evidence, version and idempotency checks.
- Draft is shown as `Draft`; submitted is shown as `Waiting for approval` on
  the entry, detail, directory row and directory state filter.

## Verification

- Focused unit tests: 5 files, 18 tests passed.
- Repository TypeScript check passed.
- Targeted ESLint passed with no findings.
- Focused `git diff --check` passed.
- Production web build passed.
- Local database still contained zero target-tenant Bank Transfer rows after
  verification.
