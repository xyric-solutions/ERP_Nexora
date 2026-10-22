# Bank Receipts parity implementation plan

Approved specification:
`../specs/2026-10-22-bank-receipts-parity-design.md`.

The user approved the written specification on 2026-10-22. This plan preserves
the existing uncommitted Banking work and limits implementation to verified gaps
between the current Bank Payments and Bank Receipts journeys.

## Baseline established

- Directory routing, add/edit routing and persisted receipt-detail routing are
  already wired alongside their Bank Payment equivalents.
- The current Receipt directory exposes the same company/account/state/date/search,
  sort, refresh, cursor, denied/error/empty/loading and narrow-layout behaviors.
- Receipt entry already supports persisted drafts, multi-line allocation, payer
  snapshots, workflow context, searchable nominals, optimistic versions,
  idempotent retries, validation, Submit for Approval and governed Approve & Close.
- Receipt detail already supports independent or governed delegated decisions,
  approver reassignment, explicit Finance posting, compensating reversal,
  accounting linkage and lifecycle evidence.
- Focused payment/receipt component baseline: 5 files / 54 tests passed.
- Payment/receipt integration baseline: 2 files / 20 tests passed.
- Scoped Prettier check found only `banking-receipts.tsx` and
  `banking-receipts-list.test.tsx` out of format.

## Implementation steps

1. Format the two verified Receipt files without changing behavior.
2. Re-run the Receipt directory, entry and detail unit suites.
3. Run scoped ESLint over Receipt UI and tests.
4. Run TypeScript checking, `git diff --check` and `npm.cmd run build:web`.
5. Update `docs/architecture/remaining-ui-migration.md` with the completed
   Receipt parity result, exact verification and Bank Transfer as the safe next
   section.
6. Review the final diff and distinguish pre-existing user changes from the
   small changes made during this parity pass.

## Guardrails

- Do not refactor Payments and Receipts into a generic framework.
- Do not change contracts, migrations, permissions, posting rules, accounting
  direction or source business data unless a failing check proves it necessary.
- Do not run the lifecycle E2E against the shared/source API because it creates,
  approves, posts and reverses financial test records. Run it only with an
  explicitly isolated synthetic harness.
- Do not overwrite or revert existing uncommitted files.

## Completion checkpoint

Completed on 2026-10-22. The comparison found no missing Receipt behavior that
justified changing contracts, lifecycle logic or persistence. The functional
parity work was already present in the current uncommitted tree and was preserved.
This pass formatted the Receipt directory and its list test, then recorded the
verified migration handoff.

Executed results:

- Payment/Receipt component comparison: 5 files / 54 tests passed.
- Receipt directory/entry/detail rerun: 4 files / 32 tests passed.
- Payment/Receipt integration: 2 files / 20 tests passed.
- Scoped Receipt ESLint: passed.
- Scoped Receipt Prettier check: passed.
- `npm.cmd run typecheck`: passed.
- `npm.cmd run build:web`: passed with Next.js 16.3.8.
- `git diff --check`: passed.

The lifecycle Playwright suite was not run because this turn did not start an
explicitly isolated synthetic API/database harness. Running it against the shared
source would create and post financial test records. Bank Transfer is the next
safe design and implementation surface.
