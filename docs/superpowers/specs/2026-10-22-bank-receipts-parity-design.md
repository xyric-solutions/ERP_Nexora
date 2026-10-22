# Bank Receipts parity with Bank Payments

Status: design direction approved by the user on 2026-10-22. This written
specification is awaiting the required review checkpoint before implementation.

## Objective

Bring the complete Bank Receipts journey to the same production standard as the
approved Bank Payments journey. Parity covers the receipt directory, add/edit
workspace, persisted detail view, maker/checker approval lifecycle, Finance
posting and compensating reversal. Receipt-specific business meaning remains
intact: payer information is retained and receipt accounting continues to debit
the Bank Account control and credit the selected nominal accounts.

Bank Transfer is explicitly outside this batch and will be addressed only after
Bank Receipts is complete and verified.

## Verified starting point

- The current working tree already contains uncommitted Bank Payment and Bank
  Receipt changes. Those changes are user-owned and must be preserved.
- Bank Payments is the accepted visual, interaction and lifecycle reference.
- Receipt-specific list, entry, detail, API service, repository, contracts and
  tests already exist. The task is a focused parity review and correction, not
  a new implementation or backend migration.
- Existing receipt E2E coverage describes create/save/reload, multi-line entry,
  submission, independent approval, explicit posting, compensating reversal,
  governed super-admin override, restricted access and narrow-screen use.
- Public banking endpoints remain under `/api/v1`; the browser must continue to
  use the generated API client rather than direct database access or duplicate
  Next.js API routes.

## Chosen approach and alternatives

Chosen: compare each Bank Receipt surface and lifecycle action directly with its
Bank Payment counterpart, then close only verified gaps while keeping receipt-
specific contracts and terminology. This produces the smallest reviewable diff
and minimizes risk in the existing dirty worktree.

Rejected: extracting a generic payment/receipt framework would reduce some
duplication but adds refactoring and regression risk beyond the requested fix.
Rejected: visual-only alignment would leave lifecycle, permissions and failure
handling unverified and would not satisfy complete-flow parity.

## Directory and navigation parity

The Bank Receipts directory will retain the same structural hierarchy, spacing,
responsive behavior and shared primitives as Bank Payments. It must provide the
same company and Bank Account scoping, state filter, bounded search, posting-date
range, sort direction, refresh, loading skeleton, empty/denied/error states,
cursor pagination and accessible row navigation.

Receipt-specific labels and columns remain meaningful. The directory may show
Received from and nominal-account context where available; it must not replace
those values with payment narration. Export stays visibly unavailable until a
governed receipt export endpoint exists. Add Bank Receipt is shown only with the
existing create permission and must navigate to the receipt entry workspace.

## Add and edit parity

The Bank Receipt entry workspace will match Bank Payments for breadcrumbs,
header treatment, company context, posting/value dates, governed Bank Account
selection, workflow context, generated reference, line grid, totals, Add More,
accounting preview, validation feedback, dirty-navigation guard and action bar.

Receipt lines preserve Receipt Method, Received from, nominal account, optional
narration, amount and required dimensions. Saving is draft-only and uses the
existing expected-version and idempotency behavior. Submission may safely save
pending valid changes first, but must never post. Approve & Close remains a
separate governed approval action and also must never post.

Loading, directory failure, no-company, no-account, nominal availability,
read-only impersonation, validation, version conflict and unknown request
failure states must be as usable and explicit as their Bank Payment equivalents.
Success feedback must describe only the action that actually completed.

## Detail and lifecycle parity

The receipt detail view will match Bank Payments for state badge, audit context,
transaction metadata, line presentation, accounting preview or recorded posting
linkage, decision controls, posting confirmation and reversal confirmation.

Authorization remains server-owned. A maker cannot approve their own receipt
unless the existing audited super-admin or delegated self-approval rule permits
it. Approval and rejection retain expected-version protection. Rejection keeps
its required reason; approval does not introduce a new free-text reason.

Posting remains available only for an approved receipt and only through the
existing Finance posting service with explicit confirmation. Reversal remains a
compensating transaction with its required reason and immutable original audit
history. The UI must not imply that saving, submitting or approving has posted
accounting entries.

## Data, security and reliability constraints

- Preserve tenant/company scope on every directory, detail and mutation call.
- Preserve current receipt permissions, Origin/CSRF handling, idempotency keys,
  expected versions, standard API problem responses and correlation references.
- Preserve request sequencing guards so stale directory/detail responses cannot
  replace newer company, filter or route state.
- Do not add mock fallbacks, direct database access, new dependencies, public
  contract changes or database migrations unless a verified parity defect makes
  one necessary and the change is reviewed in scope.
- Keep payment and receipt accounting directions distinct and balanced.
- Preserve accessibility: labels, table semantics, focus visibility, button
  types, disabled states, live status/error regions and narrow-screen usability.

## Verification

First compare current payment and receipt implementations and tests to produce a
concrete gap list. Add or update focused receipt tests only where a behavior gap
is found. Run the smallest relevant unit and integration suites during changes,
then run the repository-prescribed checks:

```powershell
git diff --check
npm.cmd run build:web
```

Run the Bank Receipts Playwright lifecycle suite when its documented synthetic
credentials and services are available. If it is skipped or cannot run, report
that limitation exactly; do not claim lifecycle E2E success. Review the final
diff for unrelated churn and update
`docs/architecture/remaining-ui-migration.md` with the completed receipt batch,
remaining Bank Transfer work and safe resume point.

## Acceptance criteria

1. The complete Bank Receipts journey follows the accepted Bank Payments layout
   and interaction conventions on desktop and narrow screens.
2. Create, edit, save, reload, multi-line entry, submit, approve/reject, post and
   reverse behaviors remain operational under their existing permissions.
3. Receipt-specific payer data and receipt debit/credit behavior are preserved.
4. Loading, empty, validation, denied, conflict and retry states are explicit and
   do not report false success.
5. No unrelated user changes are overwritten, and the scoped receipt checks plus
   `git diff --check` and `npm.cmd run build:web` pass or are reported accurately.

## Written-spec review checkpoint

Review focus: the scope is the complete Bank Receipts flow; Bank Payments is the
approved reference; receipt-specific fields and accounting direction remain;
posting and reversal safeguards are unchanged; Bank Transfer is deferred. After
written-spec approval, create the implementation plan and begin the focused gap
analysis.
