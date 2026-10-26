# Company fiscal calendars and Finance period controls

Date: 2026-10-22.
Status: written specification approved by the user on 2026-10-22.
This document describes intended implementation, not completed functionality.

## Purpose and approved scope

Each company chooses its fiscal year independently. Support January–December,
July–June and any other first-of-month start, with twelve monthly periods.
Configure actual date ranges, not an ERP-wide hardcoded calendar or an unlimited
testing-date bypass. Reuse existing Finance/Bank posting controls and history.

Regular fiscal years span twelve calendar months. Short transition years,
4-4-5 calendars, thirteen periods, automatic year-end journals, consolidation and
jurisdiction-specific tax-year rules are outside this slice. Do not claim those
workflows or regulatory compliance based on fiscal calendar configuration.

## Verified existing architecture

- The Next application is the root; `server/api` is the independent backend.
  Contracts and generated client belong to `packages/contracts`.
- `platform/0001_platform_core.forward.sql` owns `fiscal_calendar`: tenant/company,
  integer year 1900–2999, inclusive start/end, draft/active/closed status, unique
  company/year and an exclusion constraint preventing overlapping fiscal years.
- `finance/0001_finance_foundation.forward.sql` owns `financial_period`: numbers
  1–12, inclusive start/end, statuses `open`, `soft_close`, `closed`, unique
  calendar/period number, and journal/ledger references. The existing foreign key
  does not by itself prove that period and calendar companies match.
- `server/api/src/modules/finance/posting/source-repository.ts` reads matching
  period/calendar rows with shared locks; posting service accepts only `open`.
  Bank Payment/Receipt submission likewise requires exactly one open period.
  Neither guard may be weakened. Draft saving remains separate from submission.
- Existing permissions include `platform.fiscal_calendar.create/read`,
  `platform.accounting_period.read`, `finance.period.close/reopen`. Check the
  live dynamic Identity catalog/scopes during implementation before reusing them;
  a session role or UI visibility alone is not sufficient authorization.
- Existing navigation has `fiscal-periods` and `period-close`; the latter is a
  mock workbench. Do not imply its mock reconciliations/checklists are verified.
- Read-only source check on 2026-10-22: R06 UAT has active fiscal calendar
  `synthetic-general-uat-calendar-2026`, 2026-01-01–2026-12-31; zero financial periods.
  No source calendar, period, transaction or audit row was changed during design.

## Approaches considered

1. **Recommended:** extend the existing calendar/period model with guarded
   management APIs, versioned immutable events and real Finance screens.
   Preserves all consumers and requires explicit migration/compatibility tests.
2. A one-off period seed would unblock one date but would not satisfy company
   configuration, closing, locking, authorization or future maintenance.
3. A second calendar engine or disabling date checks would split the source of
   truth and weaken accounting integrity; do not implement either.

## Fiscal-year definition and monthly generation

- Super Admin chooses a company and start date (first day of a chosen month).
  Preview the end date and all twelve monthly ranges before committing.
  Jan 2026 becomes Jan–Dec 2026; July 2026 becomes July 2026–June 2027.
- Use date-only arithmetic, including leap-year boundaries, independent of
  browser/server timezone. No JavaScript locale-string parsing for storage.
- Keep `year` as the start-year identifier for newly created regular years;
  display cross-year labels such as FY 2026/27 without changing existing stored
  year identifiers or document numbering. Preserve legacy calendars as stored.
- New fiscal years have twelve initially Soft Closed periods. Opening is a
  separate explicit authorized action; never open business periods as a migration
  side effect. A batch-open action is allowed only for selected periods after
  preview, confirmation and authorization, with individual audit evidence.
- An existing year with no periods can generate its missing monthly periods
  after validating its boundaries. Do not create another overlapping fiscal year.
- Existing partial/irregular periods require review: reject conflicts rather
  than renumbering, shifting boundaries, merging or deleting records.
- No date or identity edits once periods exist. No delete endpoint. Existing
  references and financial records remain immutable. Creating later years does
  not retroactively change earlier years or other companies.

## Status semantics and authorization

Retain database/domain status values for compatibility:

| Display | Stored status | Operational submission/posting |
| --- | --- | --- |
| Open | `open` | Allowed subject to all other checks |
| Soft Closed | `soft_close` | Blocked |
| Locked | `closed` | Blocked |

Soft-close adjustment posting is described in older Finance design but is not
implemented by the current posting service. Do not add or advertise an adjustment
bypass in this slice. Label the restriction clearly.

- Calendar creation/month generation: live global Super Admin plus the exact
  company-scoped calendar-create authority. No impersonated writes.
- Read: authenticated company access plus the applicable explicit read permission.
- Open → Soft Closed and Soft Closed → Locked: live company-scoped
  `finance.period.close` authority. Lock requires a reason and confirmation.
- Soft Closed → Open: live company-scoped `finance.period.reopen` authority and
  a reason. Locked → Open additionally requires live global Super Admin authority,
  explicit high-risk confirmation and a mandatory reason. No silent unlock.
- Never infer grants from an administrator label or create permission grants as
  a migration side effect. The existing Identity workflow grants ordinary Finance
  administrators explicitly; ordinary users retain their existing read/write limits.
- Closing/locking must reject unbalanced posted base-currency journal totals and
  incomplete accounting events or submitted/approved unposted transactions within
  that period. Drafts may remain, but cannot subsequently submit while closed.
  Do not assert reconciliation or unsupported module close checks are complete.
- Block status changes where the calendar is not active or boundaries are invalid.
  Restrict reopening of legacy closed fiscal years to a future explicit year-level
  reopening workflow rather than implicitly activating a closed parent calendar.

## Data integrity, concurrency and audit

- Add migrations; never edit applied migration history. No opening of periods or
  modification of posted rows in migration SQL. Preserve existing status meaning.
- Add record versions and append-only period/calendar event evidence, including
  tenant, company, actor, action, before/after status, dates, reason where required,
  correlation ID and actual database timestamp. Evidence describes real actions;
  do not fabricate historical setup/approval actors for legacy rows.
- Audit existing boundaries/overlaps/company mismatch before adding composite
  foreign keys and overlap/containment guards. Fail with actionable conflicts if
  existing data violates a guard; never auto-correct financial history.
- Scope every read/mutation to tenant/company and validate live company access
  and current Identity authority inside the transaction, including on retries.
  Use forced tenant RLS and append-only event protections following local patterns.
- Guard calendar range changes and monthly generation against concurrent callers;
  use company/year advisory locks and deterministic row-lock ordering. Status
  changes take exclusive period locks compatible with existing posting shared
  locks: either posting finishes before closure, or it sees the closed status.
- Bounded lists, server validation, canonical problem responses, cookie session,
  CSRF/origin controls, idempotency keys and quoted If-Match expected versions.
  Identical retries return the original committed result without duplicate events;
  changed payload/key and stale versions conflict. Failed actions roll back fully.

## API, UI and ownership

- Keep fiscal-calendar definition under the platform/master-data ownership described
  in `docs/finance/finance-core-posting-design.md`; Finance owns period lifecycle.
  Reuse a shared backend calendar/period service where necessary, not a second
  browser/Next implementation or a Banking-owned fiscal calendar.
- Add versioned API contracts for calendar directory/detail/create, existing-year
  monthly-period generation, period detail/history and explicit status changes.
  Generate OpenAPI/client together and exercise normal authenticated API routes.
- Connect the existing Finance → Fiscal Periods navigation to a real workspace:
  company/year selector, year preview/create, period date/status table, controlled
  Open/Soft Close/Lock/Reopen actions, immutable history and meaningful feedback.
- Period-close workbench should link to the real controls and retain clear
  prototype labels for any unrelated unimplemented close checklist; never display
  mock readiness as a live authorization or a prerequisite that actually passed.
- Reuse installed shadcn primitives and semantic Tailwind tokens; preserve keyboard
  use, labels, focus, narrow-screen overflow and loading/error/empty/denied states.
  Company changes clear stale context. Do not duplicate Company or Finance models.
- Bank Payments/Receipts consume the same periods, with no new posting bypass.
  Optionally link their existing period error to the permitted real setup screen;
  navigating there does not grant calendar administration authority.

## Safe UAT setup

After implementation and isolated verification, use the authorized UI/API to
generate twelve months for R06 UAT's existing January–December 2026 calendar.
The user has requested open testing dates; show and explicitly confirm the
2026 range before opening those selected periods through the audited workflow.
Do not overwrite the current year with July–June, create another company, open
other companies, reopen existing closed records, or approve/post transactions.
Future years remain a deliberate company choice, not an unlimited open range.

## Required verification before claiming completion

- Date unit tests: Jan–Dec, July–June, other start months, leap years, inclusive
  boundaries, timezone independence, invalid/non-first-of-month starts and bounds.
- Contract/API tests: strict request/response shape, version/idempotency guards,
  missing session, CSRF/origin, read denial and company access revocation.
- Isolated PostgreSQL tests: twelve contiguous periods, no overlaps, immutable
  identities/history, cross-company calendar rejection, duplicate generation,
  concurrent creation/status change/posting and rollback with no partial audit.
- Security tests: no ordinary-user setup/unlock, scoped Finance close/reopen,
  Super Admin locked-period override with reason, impersonation denial, live
  revoked-authority replay rejection and immutable event/RLS constraints.
- Real browser/API/PostgreSQL: configure July–June in an isolated company, open
  a period, save/submit Payment and Receipt, close it and verify submission/posting
  rejection, then authorized reopening with immutable history. Preserve ledgers.
- Run migration integrity, contract generation checks, unit/integration/security,
  browser, typecheck, scoped lint/format, production build and diff checks.
  Report actual results and distinguish inherited unrelated failures.

## Review and implementation handoff

Context exploration, options and inline consistency/scope review completed.
Written specification approved and implemented on 2026-10-22 without a new
prototype or dependency. See the matching implementation plan for actual tests,
R06 setup evidence, limitations and safe resume instructions. This design document
itself is not evidence of a database mutation or test success.
