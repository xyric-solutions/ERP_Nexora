# Bank Transfer Approve & Close generic failure

Status: resolved and verified locally
Date: 2026-10-22
Reference: `bfa65eb5-1cfb-40c0-881f-e204690e0eac`

## Symptoms

- Shoaib can create and submit a Bank Transfer and is shown the explicit `Approve & Close` action.
- Approval returns the generic safe API error with the reference above.
- The action must approve only; posting remains a separate operation.

## Correlation evidence

- The reference is absent from `approval_override_event`, `bank_transfer_event`,
  `platform_admin_audit_event`, and `security_audit_event`.
- Therefore the failed decision wrote no durable approval, transfer event, or audit row;
  the decision transaction rolled back.
- No existing Bank Transfer row or Transfer idempotency receipt was visible in the
  current `nexora_source_test` database during diagnosis. No Transfer was created,
  approved, posted, reversed, or otherwise mutated by this investigation.

## Primary root cause (correlation-backed)

The local PostgreSQL server log at the time of the failed requests records:

- `column "posting_date" of relation "bank_transfer" does not exist` for the
  Transfer insert.
- `column "posting_date" does not exist` for the Transfer directory query.

Migration ledger version 26 existed, but the live table was created from an earlier
shape of that migration: it lacked both `posting_date` and `value_date`, and its
directory index sorted by `created_at`. The current repository requires those date
columns. The create request therefore raised a raw PostgreSQL error, the API correctly
returned a generic 500 problem response, and the transaction rolled back before a
Transfer or idempotency receipt could be stored. The Approve & Close UI had not yet
reached the approval call.

## Secondary approval blocker

Shoaib's effective authorization was assembled from two active role policies:

- `policy-super-administrator` grants `platform.approval.override` at tenant scope.
- `policy-shoaib-bank-transfer-local` grants `banking.transfer.approve` at company
  scope.

The UI and `evaluateApprovalActor` correctly see the aggregate effective permissions,
so they expose the governed same-user approval path. The immutable
`writeApprovalOverrideEvent` authority query intentionally requires the override and
normal decision permission to exist on the same active `super_administrator` policy
assignment. Running that exact read-only authority query for Shoaib returned zero
rows. The writer therefore cannot seal approval evidence and fails closed.

## Safe fix

1. Add forward-only Finance migration 27 to add/backfill the missing date columns,
   enforce `posting_date` as non-null, and rebuild the Transfer directory index on
   posting date. Raise Banking readiness to require migration 27.
2. Correct Shoaib's existing local company-scoped authorization overlay so the
   immutable override writer can prove both permissions on one Super Administrator
   assignment.

Keep the shared tenant-wide Super Administrator policy unchanged. Convert Shoaib's
existing company-scoped Transfer policy into a `super_administrator` overlay tied to
the existing Super Administrator role, and add the company-scoped
`platform.approval.override` grant to that overlay. This makes both evidence grants
co-resident on Shoaib's existing company-scoped assignment without broadening other
users.

## Preservation requirements

- Do not approve or post the user's existing Transfer during verification.
- Preserve explicit approval, maker-checker override evidence, optimistic concurrency,
  idempotency, tenant/company scope, and the separate posting action.
- Localhost only; no Railway operation.

## Applied changes

- Added Finance migration 27, `bank_transfer_date_columns`.
- Applied it to local `nexora_source_test`; Finance ledger advanced from 26 to 27.
- Banking readiness now requires Finance migration 27.
- Converted only `policy-shoaib-bank-transfer-local` into a company-scoped
  `super_administrator` overlay (policy version 2) and added the company-scoped
  `platform.approval.override` normalized grant. The shared
  `policy-super-administrator` was not changed.
- The exact immutable override-writer authority query now resolves Shoaib's overlay
  assignment and both live permission checks return true.

## Verification

- Local schema: `posting_date` exists and is non-null; `value_date` exists and is
  nullable; `bank_transfer_directory` sorts by `posting_date DESC`.
- Local API liveness/readiness: both `ok`; Banking foundation is `ok`.
- Focused unit tests: 29 passed across 3 files.
- Migration integration: 13 passed.
- Bank Transfer lifecycle integration in a disposable database: 2 passed.
- Full TypeScript check: passed.
- Production Next.js build: passed.
- `git diff --check`: passed.
- Live tenant Transfer count remained zero. No user Transfer was created, approved,
  posted, reversed, or duplicated during diagnosis or verification.
