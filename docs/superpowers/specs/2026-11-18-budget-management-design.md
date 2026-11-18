# Budget Management: discovery and implementation design

Date: 2026-11-18 (Asia/Karachi)

Status: approved by the user on 2026-11-18 and implemented. PostgreSQL integration,
authenticated browser acceptance and production build verification are recorded
in `docs/plans/2026-11-18-budget-management-implementation.md`. Deployment to the
local business environment is now verified on ports 3000/4000 after the owner's
explicit migration/restart and role-access approval. Other environments require
their normal migration/restart and role-assignment step.

## Outcome and scope

Implement all eleven existing Budget & Planning menu entries as a connected,
company-scoped PostgreSQL feature. Retain the menu IDs, labels, groups, navigation,
shared controls, theme and accounting architecture. Budget operations never create
GL journals. Financial actuals come exclusively from posted journal movements;
commitments remain a separate measure until their associated recognition posts.

No fabricated figures, browser-only persistence, success toasts without a server
result, silent mock fallback, or dead actions may remain in the delivered module.

## Discovery evidence

| Area | Existing source and finding | Required change |
| --- | --- | --- |
| Navigation | `app/shell/config/prototype-data.ts:760` defines all eleven requested pages under the two requested groups. | Preserve these exact identifiers and ordering. |
| Rendering | `app/shell/prototype-content.tsx` has no Budget workspace branch; pages reach shared prototype archetypes. | Introduce feature-owned connected views and dispatch before prototype fallbacks. |
| Persistence | `packages/db/source-migrations/finance/0001_finance_foundation.forward.sql:202` defines `budget`: account/period/amount/dimensions/version/status, with tenant isolation. | Add document/version/line ownership and controlled lifecycle; preserve existing records. |
| API/contracts | Source search found no Budget router, service, repository or Budget request/response contracts. | Add the complete route/service/repository/contract/client chain. |
| Access | `packages/contracts/src/administration/module-catalogue.ts` marks Budget `live: false` with no permission prefixes. Security foundation contains an old `finance.budget.create` definition. | Add granular Budget permissions and access-matrix ownership; inspect grants and preserve legacy permission compatibility deliberately. |
| Actuals | `server/api/src/modules/finance/subledger/reports.ts` reads `journal_entry`/`journal_line`, including `posted` and `reversed` originals. | Reuse the accounting convention: original and reversal movements, dated independently; never drop reversed originals. |
| Posting | `server/api/src/modules/finance/posting` is the reusable journal posting boundary with exact money, dimensions and source metadata. | Add atomic budget checks and commitment recognition/reversal effects here and in the owning source workflow. |
| Purchases | Procurement persists approved documents, stable line/source-line identifiers, nominal accounts, discounts, charges and consumption. Current line contract lacks budget dimensions. | Add dimensions and immutable provenance through request/order/receipt/bill and financial preparation. |
| Purchase accounting | `procurement_accounting_link`, `finance_subledger_item.source_document_id`, and financial operation/journal links already exist. | Use them for proof of recognition; add line-level commitment consumption, not document-total subtraction. |
| Concurrency | Procurement transactions lock security, then subledger, then procurement resources. | Integrate Budget into one documented shared lock order across affected writers. |
| Reference data | Company fiscal calendars/financial periods, CoA, organization units, `erp_project`, and governed company references already exist. | Reuse scoped lookups and validate active posting accounts and coherent dimensions. |
| Excel | Banking has bounded XLSX/CSV parsing via existing `saxes`, `yauzl`, `csv-parse`, and an XLSX writer. | Extract only the genuinely format-neutral mechanics and retain banking behavior/tests. |
| Historical docs | `docs/wireframes/finance/FIN-WF-05-planning-close-recurring.md` describes a Budget service/report capability not found in the active searched API/domain sources. | Treat it as historical design, not evidence of a working current implementation. |

### Workspace and runtime observations

- The repository has existing uncommitted tax, procurement, generated-client,
  OpenAPI, server wiring and migration-document changes. Do not overwrite, stage
  or commit those changes as Budget work.
- Web and API listeners exist on local ports 3000 and 4000. An isolated browser
  redirects to `/login`; authenticated Budget appearance has not been verified.
  No credentials were read or invented, and no authentication was bypassed.
- No listener was found on the documented local PostgreSQL/Redis test ports
  55433/56380 (or checked defaults 5432/6379). This does not establish that remote
  persistence is unavailable. Existing API `/api/v1/health/live` and
  `/api/v1/health/ready` both returned HTTP 200; readiness reports database, Redis,
  object storage and existing module foundations healthy. No live database
  schema/data was queried, and disposable test database access remains unverified.
- Standard shell and Node REPL execution initially failed during Windows sandbox
  initialization. Approved elevated shell execution allowed read-only discovery
  and baseline tests.
- Baseline command:
  `npm.cmd run test:unit -- tests/unit/purchase-amounts.test.ts tests/unit/purchase-workflow.test.ts tests/unit/finance-contracts.test.ts`
  Result: 51 passed, 1 failed. The existing failing menu expectation in
  `tests/unit/purchase-workflow.test.ts:24` omits the current Purchase Returns
  menu entry. No implementation changes preceded this run.

## Approaches considered

1. **Recommended: extend the existing API, posting service and prototype shell.**
   Feature-owned Budget models/views with shared controls; normalized document
   ownership over the existing allocation table; additive migrations and atomic
   purchasing/GL bridges. This preserves architecture and supports one accounting
   truth, but requires careful cross-module concurrency and provenance work.
2. **Independent Budget ledger with asynchronous purchase/GL synchronization.**
   Isolates new code, but introduces projection lag and cannot reliably enforce
   synchronous blocking policies without additional coordination. Rejected for
   the availability-control requirement.
3. **Expand prototype screens first and connect persistence afterward.**
   Provides earlier visual output but prolongs mock behavior and delays proving
   approval, posting and duplicate-counting correctness. Rejected as the delivery
   approach; each implementation batch must instead be a verified vertical slice.

## Domain and persistence design

### Documents, versions and allocations

- A budget plan owns company, server-generated stable `BGT-001` style code,
  fiscal-calendar ID, name, owner and company base currency. Existing record codes
  and existing budget rows are never renumbered or deleted.
- A version belongs to a plan, has an immutable version number and lineage, and
  identifies its purpose: baseline, revision, scenario or forecast. Human revision
  numbers and optimistic row versions are separate fields.
- Versions contain lines keyed by posting account and canonical optional
  department/project/cost-centre/branch dimensions. Allocation rows use the
  existing `budget` table with additive managed-version/line references and actual
  financial-period IDs. Legacy unowned rows stay visible for reconciliation and
  are not silently activated or aggregated with managed versions.
- Annual and quarterly entry are input/spread modes. Store final monthly fiscal
  allocations, using configured period order, including non-calendar fiscal
  years. Even, weighted and historical spreads preserve the exact input total;
  assign minor-unit remainder deterministically to the last selected period.
- Each managed allocation has one version/line/period identity. New rows require
  same-company account, period, dimensions and currency relationships. Reject
  duplicate line keys, missing periods, invalid precision, negative budgets,
  inactive/header accounts, and incoherent or cross-company dimensions.
- Empty dimensions mean an unrestricted control pool for that dimension. Disallow
  overlapping pools for the same account/period in a control version, including
  intersections between partially specified dimension combinations. Report
  filters are separate from pool matching. A movement can consume at most one
  pool; an unmatched movement is explicitly unbudgeted.
- A governed company/fiscal-calendar policy binds exactly one approved control
  version. Reports can compare any selected versions, but availability never sums
  different baselines. Replacing a baseline atomically changes the binding;
  historical approvals, allocations and commitment evidence remain immutable.
- Add model, scenario assumptions, transfer, policy, import batch, change/audit,
  commitment event, recognition-link and idempotency records. Use company-scoped
  composite foreign keys, bounded indexes, forced RLS and immutable evidence
  triggers consistent with current finance/procurement migrations.
- Migration ordering matters: finance migrations run before procurement and HR.
  Cross-module foreign keys must be installed after their referenced tables, via
  a correctly ordered Budget migration module or appropriately placed later
  bridge migrations. Test both a clean database and upgrades with legacy rows.

### Approval, revisions and transfers

- Draft -> submitted -> approved/rejected; rejected versions may be corrected
  and resubmitted with a new row version. Approved content is immutable.
- Snapshot the selected approval route and submitted content hash. Use existing
  approval instances/history, independently authorized decisions and existing
  audited override policy; introduce no implicit administrator or self-approval
  bypass. Every author/editor is considered for separation of duties.
- Revisions clone a chosen version into a new draft. Approval alone does not
  silently replace a control baseline. Activation requires explicit authority and
  rechecks current commitments and actuals under the same locks as consumption.
- Transfers identify source/destination account/dimensions/periods and an exact
  positive amount in one company/base currency/fiscal year. Submit and approve
  separately. On approval, atomically verify source availability and apply a
  balanced, immutable adjustment event; never rewrite approved allocations.
- Reject stale versions, exhausted source pools, duplicate application, source
  equal to destination, cross-company transfers and unapproved destinations.
  Restrict transfers/revisions of elapsed or closed periods to an explicit
  governed adjustment permission, with reasons and independent approval.
- Audit reads and writes include actor, company, record/version, action, reason,
  correlation, time, before/after evidence and approval history. Retain histories
  when records are archived; never reuse codes.

### Models, scenarios and forecasts

- Models persist named account/dimension lines, spread rules and bounded decimal
  drivers. Use declarative supported driver types, never executable expressions
  or `eval`. Applying a model creates a real draft version with source evidence.
- Scenario versions capture a source version and separate best/expected/worst
  assumptions. Persist manual adjustments and calculated results. They do not
  alter the active budget or GL.
- Historical forecasting uses posted fiscal-period actuals with an explicit
  lookback and selected growth/seasonal drivers. Record source cutoff, source
  periods, parameters and algorithm version. Missing history is an explicit
  validation result, never synthetic historical data.
- Manual forecasts accept persisted period allocations. Reforecasting freezes
  actual periods through the selected cutoff and estimates only later periods.
  EAC = actual through cutoff + forecast after cutoff. Commitments are shown
  separately, not blindly added to forecasts that may already include them.
- Rolling forecasts support a bounded consecutive period horizon across fiscal
  years. Reference actual configured calendars, record each period, and reject
  missing/overlapping calendars. Never overwrite earlier forecast versions.

## Accounting and commitment invariants

1. Actuals are sums of `journal_line.base_debit/base_credit` joined to their
   same-tenant/company journals and actual posting dates. Include posted and
   reversed originals plus their posted reversal entries, consistently with
   existing financial reporting. Exclude drafts and use an explicit as-of date.
2. Expense/asset consumption uses debit minus credit; revenue comparisons use
   credit minus debit. Account-type semantics drive favorable/unfavorable status.
   Distinguish revenue from spend totals. Zero-budget variance percentage is null
   with an explicit unbudgeted label; never display infinity or fabricate 0%.
3. Reserve approved purchase orders once per stable source line/charge, mapped
   account, dimensions and budget period. Requests/RFQs are not commitments;
   downstream receipts do not create another reservation. Approved standalone
   bills reserve exposure until recognition, unless already covered by an order.
4. Preserve source-line lineage through partial receipts and bills, plus
   deterministic discount/charge apportionment and recoverable/nonrecoverable tax
   treatment. Carry dimensions and mapped nominals through financial preparation
   into the posted journal. Never reduce commitments using bill totals or payment
   allocations alone.
5. Only successful expense/asset GL recognition consumes a linked reservation.
   Journal insert, source-to-journal-line evidence and commitment consumption
   commit or roll back together. Match only the supported recognized portion;
   retain the unrecognized remainder. Payments/AP settlement do not recognize the
   expense a second time or release its commitment again.
6. Reversals create compensating commitment evidence only for the original linked
   consumption, restore exposure where the source obligation remains open, and
   preserve historical as-of results. Cancellation/closure releases only residual
   exposure with independently approved evidence. Existing approved procurement
   documents are currently immutable: add a separate governed close/release
   operation rather than bypassing that guard.
7. Commitment values use governed FX evidence and exact base amounts. Release the
   original reserved carrying portion proportionally, with deterministic final
   remainder; report differences from posted base actuals as variance. Missing
   rates or mappings are blocking completeness issues, never zero commitments.
8. Availability = approved allocation + approved net transfers - posted actual
   consumption - open commitments. Aggregate each source independently before
   joining to avoid multiplication. Include unbudgeted actuals and commitments in
   reports rather than dropping them with inner joins to budget allocations.
9. Warning, independent approval and blocking policies are versioned, effective
   dated and scoped to company/period/account/dimensions. Thresholds and unbudgeted
   handling are explicit. Preview is advisory; recheck under locks at purchase
   approval and controlled posting. Exceptions bind to source version, amount,
   policy and approving actor; changed terms invalidate approval.
10. An unconfigured company is explicitly marked controls unconfigured. Enabling
    controls requires an approved baseline, valid policy and reconciliation of
    existing commitments. Do not silently enable financial blocking or show
    complete availability while legacy exposure remains unmapped.
11. Put posting checks at the shared finance boundary so journals, bank expenses,
    payroll and other integrated expense sources cannot bypass active policy.
    Net each transaction's actual and linked commitment release before checking;
    conversion of an existing commitment must not appear as double consumption.
    Legitimate reversals remain possible and return evidence of the restored
    exposure. No other module is represented as integrated until its posting path
    and dimensions are tested.
12. Recheck permissions and company access inside the transaction, including
    idempotent replay. Reuse one shared lock order with procurement/subledger/
    posting and stable per-pool locking. Test simultaneous approvals, baseline
    activation, transfer and posting against the same pool for overconsumption
    and deadlocks. Retry conflicts only within bounded, idempotent operations.

## API and frontend design

Add `/api/v1/budget` with feature router -> service -> repository boundaries.
Define strict Zod request/response schemas in `packages/contracts`; update OpenAPI
and the generated web client using the existing generator. Retain cookie sessions,
origin/CSRF guards, impersonation restrictions, current company access checks,
standard problem errors, correlation IDs and no-store behavior.

Proposed resources: options, plans, versions, allocation lines, model definitions,
scenarios, forecasts, transfers, control policies, import batches, commitments,
availability, variance reports and audit history. Use explicit action endpoints
for submit/decide/revise/activate/apply/close. Every mutation carries an idempotency
key; edits and decisions carry an expected version/If-Match precondition. List,
lookup and drill endpoints use bounded filters and cursor pagination.

Register `budget.*` permissions for read/create/update/submit/approve/activate,
model management, forecasting, import/export, transfers, policy administration,
exceptions and reports. Update the administration catalogue and permission-level
expansion; preserve finance-owned permission compatibility without exposing Budget
administration through unrelated Accounting grants. Define permissions without
silently granting them to every existing user.

| Existing page ID | Delivered connected behavior |
| --- | --- |
| `planning-dashboard` | Selected company/year/version KPIs, pending approvals, spend utilization, separate commitments, variance trends, actionable drills and completeness status. |
| `scenarios` | Create/copy/edit/compare persisted best/expected/worst scenarios with assumption history and version links. |
| `budget-models` | Model CRUD/archive, account/dimension selection, driver/spread configuration and apply-to-draft action. |
| `budget-entry` | Create plan/version, compact editable period grid, account and optional dimension selectors, exact totals, save/reload/revise and approval submission. |
| `budget-import` | Download genuine XLSX template, upload/validate preview, row errors, spread preview, transactional commit into a draft and real export. |
| `budget-approval` | Assigned pending queue, immutable submitted detail, approve/reject/return as permitted, revisions, transfers and approval history. |
| `forecasts` | Manual/historical/rolling forecast creation, cutoff/horizon/driver selection, reforecast versions, scenario comparison and EAC. |
| `commitment-control` | Real source-line reservations, consumed/residual amounts, exception decisions, source/accounting drills, governed close/release and policy controls. |
| `budget-availability` | Period/pool checks with actuals and commitments separately, available balance, utilization, explicit policy result and incomplete-mapping warnings. |
| `budget-actual` | Period/YTD/full-year comparison, dimensional filters, account-sensitive favorable/unfavorable variance, unbudgeted rows, commentary and posted-GL drill. |
| `planning-reports` | Consolidated budget, version/scenario comparison, forecast/EAC, variance, commitments/availability, transfer and audit reports; real XLSX/CSV export and print. |

Use `app/features/budget` for adapters, models, components and views; existing
shadcn primitives and shared table/filter/dialog controls; Tailwind semantic
tokens. Keep desktop density, sticky account/total columns and horizontally
scrollable period grids; preserve keyboard input and visible focus. Test light/
dark, disabled/error/empty/loading states and desktop/tablet/mobile widths.
Do not add feature CSS or delete active shared styles. All actions either perform
the connected operation or explain the genuine state/permission precondition.

### Excel and data integrity

- Reuse existing dependencies for real OOXML reading/writing. Extract reusable
  parser/writer mechanics only with banking characterization tests.
- Bound upload and expanded ZIP size, entries, compression ratio, sheets, columns,
  rows, cell length and parse time. Reject formulas rather than trusting cached
  values; reject macros, external relationships and invalid files.
- Resolve codes to authoritative same-company accounts/dimensions/periods. Preview
  every validation issue, duplicate allocation and proposed spread. Commit only
  after explicit confirmation; revalidate master status and target row version.
- Import batches record content hash, actor, selected version and result. Atomic
  replacement/update modes must be explicit and draft-only. A failed import
  changes no allocations, and replay cannot duplicate rows.
- Export the exact filtered dataset and its as-of/version/currency metadata, not
  just the current visible page. Use bounded or streamed export jobs as needed;
  preserve exact decimals and neutralize text formula injection in CSV/XLSX.

## Implementation sequence and acceptance gates

All batches form one module implementation; intermediate completion is not a
claim that the complete module is live.

1. **Foundation and entry:** migrations, permissions, contracts/client, scoped
   options, plans/versions/allocations and connected entry. Test real save/reload,
   precision, fiscal spreading, RLS, validation, stale edits and code races.
2. **Governance:** model/scenario persistence, approvals/history, immutable
   revisions, activation, policy binding and balanced transfers. Test every
   transition, maker/checker, revocation, impersonation, rollback and replay.
3. **Accounting/control:** purchase dimensions and lineage, reservation events,
   source recognition bridge, reversals, governed closure, posting controls and
   availability. Prove partial recognition and concurrent consumption invariants
   in disposable PostgreSQL before enabling blocking.
4. **Forecasts/import/reports:** all forecast modes, safe Excel round trip, as-of
   GL reports, variance commentary, dashboards, filters and source drills.
5. **Complete end-to-end acceptance:** cover all eleven menu pages and each
   visible action using real sessions/API/PostgreSQL; check read-only and denied
   roles, two tenants/companies, empty data, themes and responsive layouts.

Required verification includes focused unit/contract/API integration/database
security tests; fresh and upgrade migration tests; purchase-to-budget-to-GL
browser tests; posting rollback, partial billing, discounts, tax, FX, payment,
reversal, closed period, legacy exposure and competing-approval cases; typecheck,
lint, API generation check, theme audit and production web build. Reuse disposable
database fixtures. Never provision or mutate a shared business database as a test.

Run `git diff --check` and `npm.cmd run build:web` for each completed UI batch;
`node scripts/audit-ui-theme.mjs --write` then `--check` and update
`docs/architecture/remaining-ui-migration.md` with actual completed work and
repository-local browser evidence. Do not mark Budget live in capability metadata
until the real workflow passes these gates and no mock fallback remains.

## Proposed defaults for approval

- Company base currency is the authoritative budget/control currency; purchase
  documents may use governed foreign currencies with recorded conversion evidence.
- Control policies use fiscal monthly pools; annual/quarterly entry spreads to
  those pools, and reporting can aggregate them without changing posting dates.
- Budget controls require explicit configuration/activation. Existing companies
  retain existing financial behavior until their baseline, policy and legacy
  exposure are reconciled; the UI states this clearly.
- Independent approval is required for budget activation, transfers and budget
  exceptions, subject only to existing explicitly authorized audited overrides.
- Preserve the supplied prototype's menu and compact desktop interaction model;
  refresh its presentation using existing components and semantic theme tokens.

Approval of this design authorizes implementation of all five batches, with
further questions only for a material accounting ambiguity or an actual access
blocker. It does not mean the module is already implemented or verified.
