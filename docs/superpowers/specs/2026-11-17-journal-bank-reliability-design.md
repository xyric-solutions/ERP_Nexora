# Journal and Bank reliability repair

Status: Approved by the owner on 17 November 2026; implemented, verified and active
on localhost. No owner business record or accounting-period control was changed.

## Scope and alternatives

Recommended first slice: repair Journal calendar dates, expose why a Journal is
not posted, and verify the existing ledger-backed Bank balances. Follow the
sequenced integration backlog in
`docs/architecture/2026-11-17-integration-audit.md` for the remaining modules.

Alternative: implement all missing stock, AP settlement and Sales backend flows
as one release. This combines independent posting systems and accounting-policy
decisions and is harder to validate or roll back; do not use that approach.

## Date correctness

- Preserve PostgreSQL DATE values as calendar-date strings at repository query
  boundaries. Do not interpret them as UTC timestamps or change the global pg
  parser, which would affect unrelated timestamp consumers.
- Inspect the affected Journal load/detail/list/recurring and posting-date paths.
  Use existing repository conventions such as date-to-text SQL projection.
- Keep true event timestamps as timestamps. Do not rewrite existing journal dates,
  ledger history or fiscal calendars automatically.
- Assert date equality across create/read/submit/post and month/year boundaries
  under UTC and Asia/Karachi. Include recurring date paths affected by the same
  normalizer. Verify no day changes between register, detail and ledger entry.

## Posting eligibility and visible state

- Reuse existing period authority and Journal capabilities on the server. Expose
  additive posting-eligibility information through the existing Journal API and
  generated contracts/client: eligible, blocked reason and relevant period when
  available. Permission-based action capability remains distinct from eligibility.
- Eligibility reads do not submit/post a Journal, reopen a period or write audit
  decision evidence. Bound queries to the authenticated company and document.
- Show Awaiting approval for submitted Journals and Posted only when the posting
  service returns a posted ledger reference. Keep the existing explicit review,
  maker/checker and self-approval checks.
- Surface closed-period/setup blockers inside the existing editor/detail before
  attempting approval where possible. Preserve the authoritative transaction-time
  checks, since a period can close after a preview is read.
- When save/submit succeeds but posting fails, retain the submitted record and
  show that exact state and the posting blocker. Retry the existing record using
  its latest version/idempotency, without creating another Opening Capital entry.
- Keep the existing Bank balance source as posted journal lines in the Bank's
  native currency. Submitted amounts are excluded; no synthetic cash balances.
- Verify navigating back to Bank balances fetches current API data. Correct only
  an observed stale refresh path, without adding polling or duplicate controls.

## Verification

- Promote the disposable date regression into focused repository tests covering
  local time zone and fiscal boundary cases.
- Verify draft/submitted = no Bank effect; posted debit/credit = correct directory,
  detail, currency summary and GL effect; replay = no duplicate effect; reversal
  = compensating effect. Include another company/currency and a restricted role.
- Test eligibility/read permissions, closed-period feedback, race with period
  closure, uncertain posting retries and no false success labels.
- Run relevant unit, API/contract and disposable integration tests, type checks,
  lint, production build and UI theme/accessibility/responsive checks for changed
  screens. Update existing migration/runbook documentation and push to
  `shoaib_nexora`.

## Operational decisions remain explicit

November is currently Soft Closed. Opening it changes an accounting control and
requires the owner's explicit choice through the existing Finance workflow.
Approval of this repair does not itself reopen that period or post any of the
three existing Opening Capital Journals. No currency amount is guessed, no
permission is granted automatically and credentials remain unchanged.

API activation must follow the existing compatible-runtime/migration procedure;
do not restart an API that expects newer Purchase/Assets schema against the
recovered older database. Report live rollout limits explicitly.

## Completed verification

65 focused unit tests, 7 OpenAPI contract tests, the expanded 2-test repository
suite under both UTC and Asia/Karachi, and all 10 responsive light/dark Chromium
cases passed. Both production web builds, typecheck, contract generation/check,
touched-file lint, formatting checks, theme audit and whitespace checks passed.
The compatible build reports 14 generated-cache CSS optimization warnings.

Read-only real-API acceptance passed 12 preview and 12 live cases across both
companies at desktop/tablet/mobile widths. Existing Journal states/versions,
Bank balances, fiscal dates and November's Soft Closed status were retained.
Bank return navigation fetched fresh account data. No owner Journal was posted.

Recurring template and occurrence dates also retain their calendar dates. The
worker's date projection is corrected and tested on disposable data; this release
does not start a recurring worker. A missing legacy template creation timestamp
was also corrected without changing recurring activation or posting rules.
