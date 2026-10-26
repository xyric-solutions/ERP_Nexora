# Finance calendars implementation

Approved spec: ../specs/2026-10-22-finance-calendars-design.md.
User approved the written specification on 2026-10-22. No new design gate.

1. FC-01: additive calendar/period versions, company/boundary/overlap guards,
   immutable event history, deterministic monthly date calculation and contracts.
2. FC-02: platform/master-data calendar create/list/generate APIs and Finance
   period transition APIs; live scoped permissions, concurrency, idempotency/audit.
3. FC-03: real Fiscal Periods navigation/workspace, preview, status confirmations,
   event history and safe error/loading/permission states using existing primitives.
4. FC-04: isolated database/API/security/browser regressions, existing Bank/Finance
   checks, generated-client checks, typecheck, lint, build, migration checks.
5. FC-05: only after verification, existing R06 UAT year generation and deliberate
   open-period confirmation through authenticated APIs; never bypass posting rules.

Preserve existing data and migration files. Record actual results and any remaining
work below and in the existing Bank workflow handoff before ending the turn.

## Results

FC-01 through FC-05 implemented on 2026-10-22. No dependency or CSS added.

### Delivered

- Platform 0009 and Finance 0025 additive migrations: versions, company foreign
  keys, overlap/date/identity guards, tenant RLS and append-only calendar events.
  Migrations never automatically open periods; existing migrations unchanged.
- Contracts, OpenAPI/generated client and independent API repositories implement
  scoped directory/detail/create, empty-year generation and atomic batch status
  changes. Live permissions are checked before idempotent replay. Setup requires
  global Super Admin plus scoped permissions; Finance close/reopen uses explicit
  scoped permissions. Locked reopening additionally requires global Super Admin,
  explicit confirmation and reason. Impersonated writes are denied.
- Closing checks incomplete Bank/accounting work and balances. Period row locks
  coordinate with existing posting locks; financial posting guards stay intact.
- Fiscal Periods/Period Close use the real shared Finance workspace: monthly
  preview, confirmation, reasons, feedback and immutable event history. Selected
  company/year survives refresh via URL context, always revalidated server-side.

### Actual verification

- `npm.cmd run test:unit`: 458/458 passed, 66 files, final full repeat.
- `npm.cmd run test:contract`: 12/12 passed after additive path assertions updated.
- `npm.cmd run api:check`, `npm.cmd run typecheck`, `npm.cmd run build:web`: passed.
- PostgreSQL migration/Bank Payment/Receipt/Finance-posting integration: 47/47
  passed across five files, including nine calendar integration cases.
- Calendar/Payment/general-nominal database security: 16/16 passed. Tests cover
  isolation, immutable history, revoked permissions, ordinary-user/impersonation
  denial, concurrency, posting-lock coordination and transactional rollback.
- Scoped ESLint and `git diff --check`: passed. Repository-wide lint is not claimed
  clean; inherited unrelated baseline remains documented in the earlier handoff.
- Final scoped Prettier check: passed. Task-owned isolated API listeners 4020–4023
  stopped after testing; source web 3000/API 4000 verified still listening. Test
  databases, reports and pre-change backup retained.
- Real isolated API/PostgreSQL calendar browser suite: final sequential run
  `npx.cmd playwright test tests/e2e/finance-fiscal-periods.spec.ts --workers=1
  --reporter=line --output=tmp/finance-calendars-20261022/browser-handoff-results`:
  **3/3 passed (57.8s)**. Covers July–June creation, scoped close/lock/reopen,
  immutable history, restricted user denial, preserved Payment/Receipt drafts and
  successful submission only after deliberate reopening. No financial posting.
- Existing Bank workflow-context browser rerun: six cases passed; evidence:
  `tmp/finance-calendars-20261022/bank-verified-results/.last-run.json`.
- Earlier concurrent browser runs had transient GET transport/directory readiness
  failures. Harness now retries GET forwarding only and waits bounded directory
  readiness; mutations are never retried automatically. Final sequential run green.

### Actual R06 UAT configuration — completed, do not repeat

- Verified pre-change backup:
  `tmp/finance-calendars-20261022/source-before-setup.dump`, SHA256
  `44AAE0FA563048DFEECCFC3FA24F419E0F64C5581E77643E2FF4F3EC76ED320B`.
- Applied only platform 0009 and Finance 0025. Existing R06 calendar
  `synthetic-general-uat-calendar-2026` retained its Jan–Dec boundaries. Genuine
  authenticated Shoaib actions generated twelve monthly periods then deliberately
  opened them with the user-approved testing reason. No source permission grants.
- Database verified twelve Open periods, period version 2/calendar version 2;
  twelve period-created and twelve opened events linked to genuine platform audit
  records and actor. No fabricated legacy calendar-created event.
- Financial fingerprints unchanged: 17 Bank accounts, four Payments/four lines,
  zero Receipts/journals. No financial record approved, posted or rewritten.
- Normal frontend/API read-only verification: twelve Open after refresh and R06
  selection retained. Screenshot: `tmp/finance-calendars-20261022/r06-2026-open-periods.png`.
- Working URL: `http://127.0.0.1:3000/?fiscal_company=nexora-r06-uat-company#/finance/fiscal-periods`.

### Limitations / safe resume

Regular twelve-month years only. Transition/short years, 4-4-5, thirteen periods
and year-level reopening require separate requirements. Partial/irregular legacy
years are rejected, not silently repaired. UI shows latest 100 history events
(older records retained) and a bounded 100-company directory; extended pagination
is follow-up scope. Dates outside 2026 require explicit company-year configuration
and opening, never a posting-validation bypass. Retain test databases and backup;
never run destructive fixtures against source. Existing Bank/HR records preserved.
