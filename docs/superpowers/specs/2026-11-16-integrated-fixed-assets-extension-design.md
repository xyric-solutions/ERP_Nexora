# Integrated Fixed Assets extension

Date: 16 November 2026. Status: proposed design for review; implementation has not
started. This extends the existing module rather than replacing it.

## Request and scope

Implement the attached “MASTER IMPLEMENTATION PROMPT: INTEGRATED FIXED ASSET
MANAGEMENT MODULE” against the existing ERP. The received file contains sections
1–7 and ends at “Respect closed”. This design interprets that ending as preserving
closed-accounting-period controls. Additional requirements supplied by the owner
must be reconciled before implementation.

The outcome is one connected workflow: capture asset information on a Purchase
Bill, preserve it through approval, recognize the supplier invoice through the
existing Accounting engine, and create its individual asset records exactly once.
Extend the register, category fields, company policies and depreciation services
to cover the requested lifecycle and daily valuations.

## Current implementation and gaps

| Surface | Existing behavior | Required extension |
| --- | --- | --- |
| Purchase lines | Optional `asset_category_id`; approved bills are instructions | Explicit fixed-asset nominal classification, registration option and saved per-unit details |
| Accounting/AP | Posted payable invoice recognizes classified asset lines through `FinancePostingService` | Create linked register records within that same posting transaction |
| Registration | Manual allocation of a posted supplier invoice or Bank Payment debit; up to 100 units per registration | Reuse registration rules from purchase capture and automatic registration |
| Categories | Six validated GL mappings, useful life, annual reducing rate, residual, numbering and convention | Company defaults, category overrides, configurable typed fields and editable initial templates |
| Methods | Straight line and reducing balance | Versioned daily basis and double declining balance |
| Depreciation | Calendar-month previews, separate approval/posting, reversal and interval guards | Daily as-of valuations, frequency summaries and scheduled monthly draft preparation |
| Register/detail | Existing register, reports, source information, lifecycle history, schedule and private attachments | Requested columns, purchase-line provenance and eight detail tabs |
| Controls | Tenant/company authorization, CSRF, idempotency, versions, RLS, audit and source-reversal guards | Preserve and extend to the new purchase integration and policy changes |

Relevant implementation boundaries:

- `packages/contracts/src/fixed-assets/index.ts` and `procurement/index.ts` own
  shared validation/types; generated API output remains authoritative.
- `server/api/src/modules/procurement/source-repository.ts` owns purchase drafts
  and approvals.
- `server/api/src/modules/finance/subledger/source-repository.ts` owns payable
  invoice recognition and posting with an existing PostgreSQL transaction.
- `server/api/src/modules/fixed-assets` owns registration, allocations, lifecycle,
  calculations, reports, attachments and approvals.
- `app/features/purchasing/components/purchase-document-form.tsx` and
  `app/features/fixed-assets` own the corresponding interfaces.
- `server/worker` already owns durable job execution and optional recurring
  journal generation. Its separate bank-revaluation job can post financial
  entries, so enabling asset scheduling must not implicitly enable that job.

## Architecture decision

**Recommended: transactional domain integration.** Save validated registration
instructions on purchase lines and invoke an asset-domain registration service
inside the existing supplier-invoice posting transaction. The service receives
the existing transaction client; it does not open a separate transaction or post
another acquisition journal. Database constraints enforce allocation uniqueness
and tenancy, while the service owns the business workflow.

Alternatives considered:

1. A durable post-commit registration job permits larger deferred batches but
   leaves a period when a posted invoice has no corresponding register entries.
   It adds recovery and eventual-consistency states to the primary workflow.
2. Database-trigger registration gives atomicity but embeds dynamic form,
   policy and permission logic in SQL and couples procurement tightly to asset
   implementation details. Triggers remain appropriate for invariants only.

The recommended approach fits the existing API/service/repository structure and
provides immediate register visibility when invoice posting succeeds.

## Purchase-to-register workflow

1. Extend the governed Chart of Accounts workflow with an explicit Fixed Asset
   classification for eligible asset-type posting nominals. Do not infer it from
   names, category examples or the broad `asset` type, which also includes bank
   and tax controls. Reject headers, inactive accounts and incompatible control
   accounts. Existing category mappings are reviewed for compatible backfill;
   ambiguous mappings remain unchanged and require review.
2. Expose the line nominal and applicable category in Purchase Bill entry. A
   Fixed Asset nominal reveals **Create Fixed Asset**. Selecting it reveals
   **Add Asset Details**, opening the shared registration form in a dialog.
   Clearing or changing the nominal/category requires explicit confirmation
   before discarding incompatible saved details.
3. Save the form into the bill line through the normal authenticated API. Assign
   stable server-generated line and unit identities, retained during edits.
   Ordinary bills without the new fields keep their current behavior. Order and
   receipt conversion can inherit nominal/category hints but must not duplicate
   a previous bill's registration identities.
4. Support individual entry and bulk generation of individual units. Each unit
   retains its own name/serial/identification and cost allocation. Reuse the
   existing 100-unit registration boundary, with a documented, server-validated
   maximum of 100 automatically registered units per bill in the first release.
   Reject larger automatic batches before posting; never silently omit units.
5. Bill approval freezes the selected account, policy/field-definition versions,
   costs and details. Rejection and revision follow existing purchase controls.
   Missing/invalid details prevent submission when creation is selected.
6. **Purchase Bill approval remains non-posting.** The existing Accounting
   payable-invoice workflow performs financial recognition. After the approved
   invoice posts, create the linked asset records before committing that same
   transaction. Failure to create any requested unit rolls back both posting and
   automatic registration.
7. Record explicit purchase-line-to-posted-debit allocations. If Finance groups
   multiple bill lines into a shared journal debit, preserve each line's share
   in an allocation relation. Never match a journal line by label or description.
8. Reuse source locks and the acquisition allocation ledger. Add a unique
   tenant/company/bill-line/unit origin constraint. Retries, concurrent posting,
   duplicate tabs and replay return the existing assets without allocating costs
   or journals twice. Existing manual registration cannot consume reserved costs.
9. The created records appear immediately in **Fixed Asset Register** as drafts
   awaiting the existing asset approval and activation flow. Invoice posting
   does not silently approve an asset or start depreciation. Eligible physical
   states are presented separately from accounting/approval lifecycle states.
10. A bill without automatic registration can still be registered manually
    against its posted acquisition. Existing Bank Payment registration remains
    available. Standalone unbacked capitalization is not introduced.

Selection, saving and posting recheck live permissions. Saving asset creation
instructions requires asset-create authority as well as purchase authority;
posting a bill carrying those instructions also requires live asset-create
authority. Category/policy administration and exceptions require their existing
or explicitly added scoped permissions. Existing users receive no implicit
permission expansion.

## Acquisition amounts and references

- Keep references to supplier, order, receipt, bill, bill line, Accounting item,
  posted journal and its debit allocations. Display vendor identifiers,
  document numbers/dates, currency, historical rate and payment references from
  these authorities rather than copying mutable document descriptions.
- Maintain invoice, purchase, acquisition, available-for-use and depreciation
  start dates separately. Depreciation start defaults to available-for-use;
  authorized overrides require a reason and must satisfy policy date controls.
- Reconcile unit costs with the line's capitalized base-currency debit using
  exact existing decimal/minor-unit helpers. Split rounding remainders
  deterministically between units. Cross-currency registration uses Finance's
  posted rate and base amount, never a later lookup.
- Recoverable input tax remains on its tax control. Nonrecoverable tax, freight,
  transport, installation and other capitalizable components can increase cost
  only when classified in the approved bill and supported by posted debit
  allocations. Do not add an informational component to cost a second time.
- Unregistered fixed-asset expenditure remains visible in GL reconciliation.

## Registration details and configurable category fields

Reuse the current physical/assignment form and add missing typed fields for
subcategory, asset type, manufacturer, unit of measurement, responsible person
and remarks. Preserve existing brand, model, serial, barcode, warranty, condition,
location, department and custodian data. System IDs/codes are read-only; final
codes are allocated transactionally using the existing stable prefix sequences.

Keep accounting states (`draft`, `submitted`, `approved`, `active`, etc.) separate
from physical conditions (`new`, `used`, `refurbished`, `damaged`) and operational
states such as under installation, in service and under maintenance. Existing
stored values remain valid and are not reinterpreted or renumbered.

Store versioned category field definitions and values in the existing JSONB
details/policy model, with schema validation at the API and database shape/size
constraints. Definitions use stable keys, labels, type, required flag and bounded
options. Support text, number, date, select and private attachment references;
never executable expressions, HTML, arbitrary scripts or client-defined schemas.
Preserve the field-definition version used by an approved registration.

Offer editable starter field templates:

- Vehicles: registration plate, VIN/chassis, engine number, make/model, manufacture
  year, colour, engine capacity, fuel/vehicle type, registration date, insurance
  details/expiry, ownership documents and additional identifiers.
- Plant/machinery: machine serial, manufacturer, capacity, installation date,
  warranty expiry and technical specifications.
- IT/equipment: serial, configuration, warranty period/expiry and assigned user.
- Furniture: material, dimensions, quantity, location and condition.
- Buildings: address, land/building reference, covered area, construction year,
  ownership type and documents.

Vehicle fields appear only for a vehicle template/category. Administrators can
configure other categories without a new database column for every new field.
Duplicate standard fields are shown once. Purchase-stage uploads use private,
tenant/company-scoped staging metadata; finalized assets adopt authorized file
references without creating public URLs or duplicating uploaded bytes. Reuse
current signature, file-size, filename and download controls, with orphan cleanup.

## Company policies and initial category configuration

Add **Fixed Assets → Asset Policies** and retain compatible existing routes.
Company policy holds the default method, daily accrual convention, summary
frequency, monthly posting settings and depreciation start rule. Categories can
explicitly inherit or override these settings when authorized. Policy changes
are versioned, audited and prospective; existing approved asset snapshots and
posted financial history remain intact.

Provide editable configuration templates, not hardcoded calculation branches:

| Category | Annual declining rate | Example useful life |
| --- | ---: | ---: |
| Furniture and Fixtures | 10% | 10 years |
| Equipment and Plant | 15% | 5 years |
| Vehicles | 20% | 5 years |
| Crockery and Utensils | 33.33% | 3 years |
| Buildings | 5% | 20 years |

The annual percentage is a declining-balance parameter. Straight-line expense
uses depreciable amount divided by useful life; e.g. the equipment template's
15% does not change a five-year straight-line policy into a 15% calculation.
Double declining uses twice the straight-line annual rate derived from life.
Do not silently switch declining methods to straight line.

Templates remain unactivated until the administrator chooses the method,
residual, life, required real company GL accounts and other policy settings.
Do not invent accounts or automatically change existing company/category policy.
Retain distinct cost, accumulated depreciation, depreciation expense, disposal
gain/loss and impairment mappings with current control-account exclusions.

## Daily accrual, schedules and reporting

Introduce an explicit calculation-version/basis snapshot. Existing assets keep
the existing monthly/full-month or partial-month behavior and posted amounts.
New daily policies use calendar-date arithmetic and Actual/Actual day counts,
splitting intervals at calendar-year boundaries with 365/366 denominators.

- Straight line accrues the depreciable amount over the configured useful life.
- Declining balance applies the configured annual rate to opening calendar-year
  WDV, held as the annual basis rather than recalculated after every daily query
  or monthly posting. Midyear commencement prorates the applicable days.
- Double declining uses the same annual WDV/day-count framework with twice the
  life-derived annual straight-line rate, capped by the remaining depreciable
  amount. Rates for lives under two years cannot exceed 100% per year.
- Preserve a residual floor for all methods and reconcile rounding at the end
  of useful life. Any terminal true-up is explicit in the schedule, consistent
  with the existing final-life adjustment; it is not an undisclosed method change.
- Track rounding at high precision and round cumulative entitlement at the
  company currency precision. Post differences against already-posted amounts
  so querying daily, monthly or in multiple chunks gives the same cumulative
  result. Do not round an independent daily charge to cents and multiply it.
- Improvements and impairments update future calculation bases at their effective
  dates without rewriting historical expense. Transfer dimensions continue to
  resolve at the applicable effective date.

An as-of endpoint provides daily charge, calculated depreciation to date, posted
accumulated depreciation, unposted accrual and projected NBV separately. Reports
must never present an unposted daily valuation as a GL balance. Show acquisition
cost, depreciable amount, residual, age, remaining life, WDV and remaining
depreciable value. The schedule groups the same calculation stream into daily,
monthly, quarterly or annual summaries, with opening/closing values and rate.
Bound or paginate large daily schedules; stream bounded exports where needed.

## Monthly journal generation and controls

Reuse `AssetDepreciationService` and `FinancePostingService` for all journals.
Daily accrual does not create a journal per asset per day. Monthly preparation
groups compatible company/category/accounts/currency/assignment dimensions,
retaining individual asset effects and journal links.

Extend the worker with an explicitly configured, preview-only asset scheduling
job, following the recurring-journal job pattern and durable execution ledger.
For opted-in companies it prepares draft runs for completed accounting months.
It never approves or posts them. Repeated jobs and manual runs coordinate through
period/asset locks and uniqueness checks. Closed or unavailable periods produce
an actionable result, not a bypass. Large registers are processed in durable,
bounded batches rather than silently taking the first 400 assets.

The owner reviews and authorizes through the current maker/checker lifecycle.
Only explicit authorized posting debits expense and credits accumulated
depreciation. Maintain balanced entries, stale-preview rejection, idempotency,
no overlapping unreversed intervals, closed-period checks, immutable history and
existing reversal/dependency protections. Do not start the current full worker
or enable bank-revaluation posting as an incidental deployment step.

## Register and detail interface

Use **Fixed Asset Register** for the existing submenu. Retain its route identity
and table behavior. Add the requested asset ID/code/name/category, bill/vendor,
acquisition date, capitalized cost, method/rate/life, accumulated depreciation,
NBV, location, department and state columns through the existing shared table.
Keep server pagination, export, filters, column preferences and empty/error states.

Provide detail tabs for General Information, Purchase Information, Depreciation
Details, Accounting Transactions, Maintenance History, Transfers and Assignments,
Documents and Attachments, and Audit History. Use persisted sources, journal and
event data, retaining complete history paging and accessible keyboard navigation.
Continue using Tailwind, semantic tokens and shared shadcn primitives. Inspect
light/dark, focus/disabled/error states and desktop/tablet/mobile widths.

## Implementation batches and acceptance

Each batch must leave the repository buildable and is part of this one delivery:

1. **Contracts and additive migrations:** COA classification, policy versions,
   typed fields, stable purchase unit identities, registration origins and
   constraints. Verify existing records/snapshots remain compatible.
2. **Purchase/API integration:** save/reload bill details, validation and shared
   registration dialog; real source-line identity and cost reconciliation.
3. **Transactional creation:** extend AP posting with domain registration and
   explicit allocation maps. Verify retries, concurrency and atomic rollback.
4. **Policy and calculation engine:** daily/annual boundaries, three methods,
   category overrides, legacy compatibility, schedules and as-of endpoints.
5. **Register/details/scheduling:** complete requested views and the opt-in draft
   scheduler, with explicit deployment configuration and operational evidence.
6. **End-to-end verification and handoff:** real PostgreSQL/API/private storage,
   generated client, production build and documented acceptance results.

Required acceptance cases include:

- A mixed expense/asset bill with five laptops, two printers and three chairs
  generates ten unique linked records and one correct acquisition posting.
- Ordinary bills and explicit unchecked registration remain unchanged. Saving,
  rejecting, editing, approving or cancelling a purchase draft creates no asset.
- Repeated posting creates neither duplicate assets nor additional journals.
  Concurrent manual registration cannot over-allocate the same posted debit.
- Failed registration or posting, stale policy, changed classification, revoked
  permission and closed periods leave no partial financial/asset effects.
- Cross-company/tenant IDs, forged unit costs, duplicate serials and unsupported
  category fields are rejected on the server.
- Vehicle/category fields persist through save/reload, approval, posting and
  detail views. Document access remains private and independently authorized.
- Straight-line and declining-rate calculations remain distinct. Daily
  calculations cover midmonth start, leap day, year boundary, residual floor,
  rounding, short useful life, zero residual, impairment and improvements.
- Prior monthly assets and posted schedules keep their recorded behavior.
- Daily/quarterly/annual summaries reconcile to the same monthly posting stream,
  with unposted valuations explicitly distinguished from GL amounts.
- Duplicate scheduler runs do not duplicate drafts or posted depreciation.
  Maker/checker, post and reversal permissions remain enforced.

Run focused unit, contract, real integration, worker and Chromium tests; verify
additive migration replay, `npm.cmd run api:check`, catalogue consistency,
`npm.cmd run typecheck`, relevant formatting/lint, `npm.cmd run build:web`,
`git diff --check` and the required theme audit. Record browser evidence and
remaining exceptions in `docs/architecture/remaining-ui-migration.md`.

## Deployment and preservation

The current recovered localhost service uses `nexora_local_recovery` on port
55435; its restart/configuration details are in `docs/runbooks/local-startup.md`.
Use disposable isolated databases for implementation tests. Before deploying
additive migrations to the intended localhost data, take and validate a fresh
backup and confirm all mandatory checks. Do not reset/replace that database,
modify `.env`, change existing passwords or start posting workers implicitly.

The existing uncommitted local-startup documentation belongs to the prior login
recovery and must be preserved separately. Do not modify old migrations, rename
historical asset codes, recalculate approved snapshots or replace actual data
with fixtures. No new framework or dependency is planned.

## Design self-review

- The primary integration point is the AP financial posting transaction, while
  purchase approvals preserve their established instruction-only behavior.
- Registration visibility and financial activation are separate, explicit states.
- Costs have one posted authority; asset creation cannot duplicate acquisition.
- Daily accrual, reporting aggregation and GL posting are separate concepts.
- Legacy calculation snapshots, closed periods and tenant/company scope remain
  protected. New policy examples are configurable and require real GL mappings.
- The 100-unit automatic-bill boundary, received attachment truncation and local
  deployment boundary are explicit. No incomplete placeholders remain.
