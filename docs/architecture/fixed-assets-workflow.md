# Fixed Assets: implementation and functional handoff

## Status and environment

The owned-asset module is implemented in the root Next.js application and the
existing independent API. PostgreSQL owns business records; the existing private
object-storage adapter owns uploaded bytes. Browser storage holds optional table
preferences only. No new application database or alternative posting engine exists.

The initial audit found generic asset prototype routes but no asset domain,
repository or tables. The implementation design is in
`docs/superpowers/specs/2026-11-13-fixed-assets-design.md`.

The recovered localhost environment uses `nexora_local_recovery` on PostgreSQL
port 55435, the independent API on 4000 and the web application on 3000. Protected
local configuration and restart details are recorded in
`docs/runbooks/local-startup.md`. Implementation acceptance uses disposable
databases on 55433 and private test MinIO on 59000. Local rollout requires a fresh,
validated backup and all extension checks below; no database reset, credential
change or production deployment is part of this extension.

## Integrated purchase and policy extension — 16 November 2026

- The existing register route is now labelled **Asset Register**. **Asset
  Policies** manages company defaults and nominal classification; direct
  classification changes require asset-category administration and Chart of
  Accounts update authority. Valid category cost mappings retain their existing
  policy-admin authority and classify the mapped account. Existing valid category
  cost accounts are classified on migration.
- A Purchase Bill line can select a classified Fixed Asset nominal, enable
  **Create Fixed Asset**, and save **Add Asset Details** for individual units.
  Quantity must be whole, unit costs must reconcile to the net line amount, and
  at most 100 units may be automatically registered per bill. Saved line/unit
  identities, category versions, company-policy versions and custom fields survive
  reload and approval. Category/nominal changes explicitly clear saved details.
- Purchase save/submit/approval creates no assets or journals. Posting the linked
  Accounting/AP invoice creates its acquisition journal and the linked **draft**
  assets atomically. It uses explicit purchase-line dimensions and allocates the
  actual posted base debit, including any final conversion rounding remainder.
  Failed policy, permission, source, serial or unit validation rolls everything
  back. Posting retries cannot duplicate records or acquisition journals.
- Each draft still requires independent approval and activation. Manual
  registration from a posted Purchase or Bank Payment remains supported and
  shares the same source-allocation and company-authority checks.
- Category templates include vehicles, machinery, equipment, furniture and
  buildings. Typed custom fields support text, numbers, dates, choices and private
  documents. Historical assets keep their category/field snapshots. Templates are
  editable examples, not preconfigured live GL mappings or mandatory rates.
- Company policies control inheritance, permitted overrides, useful life, method,
  rate, residual defaults, summary frequency and commencement rules. Disabling
  category overrides forces company defaults for new registrations, including
  existing categories, while registered snapshots retain their original terms.
- New Actual/Actual policies support straight line, annual opening written-down
  value declining balance, and double declining balance (`2 / life in years`,
  capped at 100%). Daily charges use actual calendar-year day counts, cumulative
  minor-unit rounding, the residual floor, and a disclosed terminal useful-life
  true-up. Existing monthly policy snapshots and posted history keep their prior
  calculation behavior. Improvements and impairments rebase future accrual only.
- Depreciation Details distinguishes calculated/unposted accrual from posted GL
  depreciation. Current-basis daily, monthly, quarterly and annual summaries cover
  a bounded window of up to 366 days; the complete monthly posted/projected life
  schedule remains available below and through export. Historical cutoffs before
  the latest financial basis use posted history rather than invented valuations.
- Eight detail tabs expose general/physical data, purchase provenance,
  depreciation, linked accounting journals, maintenance, transfers/assignments,
  private attachments and paged immutable audit history. Accounting amounts are
  full linked-journal totals; individual acquisition allocation is shown in
  Purchase Information.
- Category documents may be staged privately before an asset exists. Only their
  creator can bind an unassigned upload to a company bill; an existing bill can
  retain its bound files through another authorized editor. Posting attaches the
  immutable private evidence in the same database transaction. Documents can be
  deliberately shared by units on that bill. Unbound uploads expire for claiming
  after 30 days; they require re-upload after expiry. Bound or attached evidence
  is retained. This extension does not delete historical documents.

## Draft-only monthly scheduler

Run the dedicated entry point with the normal protected runtime database/Redis
and private S3 configuration and explicit `ASSET_DRAFT_PREPARATION_ENABLED=true`:

```powershell
npm.cmd run start:assets --workspace @nexora/worker
```

This process only handles the `nexora-asset-drafts` queue. It does not load or
enable bank revaluation, recurring journal posting or any approval/post command.
Company **Automatically prepare monthly drafts** is off by default. Enabling it
requires current depreciation-preparation authority; the saver becomes the
scheduled preparer and that identity is reauthorized on every job.

Hourly ticks scan tenants/companies fairly using durable cursors and prepare at
most 400 due assets per company transaction. Further ticks process remaining
units; a 401-asset register is verified as batches of 400 and 1. Pending manual
and scheduled runs coordinate under the same company lock. Retries, rejected
drafts, changed snapshots and existing posted intervals retain their guards.
Preparation keys include the asset versions; an unchanged rejected preparation
is flagged for review instead of being reported as a new draft.
The same bounded job cleans unbound staged uploads after 30 days and abandoned
storage writes after a one-day grace period. Bound/claimed evidence is retained;
foreign keys protect adopted files independently of the cleanup actor's read
visibility. Durable storage cursors prevent an ever-growing retained prefix from
starving later objects.

Zero-rounded periods store calculation progress only, with no zero-value GL
entry. Closed due periods and revoked authority produce a persisted blocked
result visible in Asset Policies and a worker log; review the period/permission
and let the next tick retry. Review, independent approval and explicit posting
remain necessary before any expense/accumulated-depreciation journal is written.

Additive fixed-assets migrations 0003–0007 introduce classification, company
policies, immutable purchase origins, stable accrual bases, preparation results,
private staged document metadata and zero-accrual observations. They preserve
existing codes, assets, journals and audit history. New business tables force
tenant RLS; API queries additionally enforce company scope and live roles.

## Functional operation

1. In Administration, grant company-scoped Fixed Assets access. Migration 0023
   defines permissions without automatically granting existing users more access.
   View includes read/report; User adds registration, physical edits, transfers,
   maintenance and verification; Admin adds category setup, approval,
   depreciation/reversal, returns/refunds, impairment and disposal. Maker/checker
   separation still applies to administrators.
2. Configure an asset category using six existing, active company GL accounts:
   asset cost, accumulated depreciation, depreciation expense, gain, loss and
   impairment expense. Configure life, method, rate, residual percentage,
   capitalization threshold, proration convention and numbering prefix. Defaults
   are copied into each asset; later category edits preserve historical snapshots.
3. Acquire through an existing posted Bank Payment or Accounting supplier invoice
   linked to an approved Purchase bill. Purchase approval remains instruction-only.
   Purchase lines may select an existing asset category. Accounting recognizes
   classified lines to their category accounts and ordinary lines to the existing
   expense policy. It rejects a conflicting manual counter-account override.
4. Open **Asset Register → Add New Asset**, or the acquisition link on the posted
   Bank Payment or supplier invoice. Register individual units, serial numbers,
   original base cost, residual value, available-for-use and commencement dates,
   useful life and scoped assignments. The API allocates the original journal
   debit under locks. Registration creates **no acquisition journal**. Costs across
   all units and improvements cannot exceed the source debit. Codes are permanent,
   transactionally allocated and company scoped.
5. Open the saved register record to submit, independently approve, then activate
   when available for use. Physical
   details remain editable in service. Depreciation terms may be corrected in an
   unsubmitted draft; approved historical terms cannot be overwritten.
6. Prepare depreciation by company accounting month. Select up to 400 assets per
   run, with selections retained across register pages. An empty selection includes
   the complete company register only when it fits the limit. Review individual
   amounts/skips, submit, independently approve and explicitly post. Posting uses
   the existing FinancePostingService and period controls. The latest eligible
   run can be reversed with separate authority, date and reason; later financial
   dependencies must be resolved first. Reversal retains original journals and
   effects rather than deleting them.
7. Open **Transfer and Assignment → Asset Transfer** to transfer existing company
   employee/department/branch/location/project references through a separately
   approved effective-dated event. The workpage shows transfer history and the
   form shows the current location/project before destination selection.
   Acquisition cost and source
   stay unchanged. Depreciation dimensions resolve the assignment effective on its
   posting date, including historical periods before a later transfer.
8. Record maintenance dates, status, vendor, cost, invoice/evidence references and
   next maintenance date. Ordinary maintenance records service history; its expense
   invoice remains in Purchase/Accounting. A capital improvement must consume an
   independently posted, available debit to the same asset category account. It
   increases cost without another acquisition journal and depreciates prospectively
   over the remaining life.
9. Record actual assignments, condition and verification result. The immutable
   before/after audit preserves the expected assignment and actor. The Verification
   Exceptions report shows the latest posted missing, misplaced, damaged or
   incorrectly assigned verification; a subsequent verified inspection clears it.
10. Impairment and disposal have separate review/approval/posting workflows. The
    server calculates carrying value, recoverable loss or disposal gain/loss and
    posts through Finance. Disposal proceeds use a separate receivable account;
    actual bank collection follows Bank Receipt.

## Vendor returns and refunds

- Open **Purchase → Purchase Returns**, or **Purchase Return** on an approved
  original Bill. The bill entry checks the selected asset's acquisition source.
  Use the Vendor Refunds tab to allocate actual posted receipts. Direct
  bank-acquired assets use the same Purchase-side entry. These operations are
  removed from the Assets menu; asset history retains their original audit and
  journal links. General stock/non-asset Purchase Returns are a separate feature.
- A faulty unit may be returned before activation without pretending it entered
  service. An active unit includes depreciation due through the event date under
  its category convention. Registration and original Bank Payment remain intact.
- Direct base-currency bank acquisitions recognize a separate mapped vendor refund
  receivable and derecognize the asset. Refunds allocate actual posted Bank Receipt
  credits; they do not create another receipt or bank journal. Partial refunds are
  supported and capped by both return and receipt balances.
- Invoice returns require a separately posted Accounting supplier credit note
  linked to the original supplier invoice. Available asset credit is allocated to
  selected individual units. The credit note owns AP and governed tax effects;
  original governed tax definitions/revisions must have corresponding negative
  applications. Asset posting adds only any required depreciation/gain/loss
  adjustment and never duplicates the credit note's asset reduction.
- An unpaid supplier credit can be offset through existing Accounting. Paid credits
  can be refunded through its settlement workflow. Foreign-currency bank returns
  also require the supplier-credit workflow to retain monetary FX authority.
  Acquisitions with governed tax applications require the supplier-credit workflow
  for tax correction. A unit's net return credit cannot exceed its registered cost;
  separate compensation stays in Accounting. Expected refund dates cannot precede
  the return.
- Supplier-credit outstanding balances follow Accounting's actual offsets,
  settlements and FX balances. The asset report apportions the net asset share;
  tax/gross supplier balances remain visible in Accounting.
- Registered acquisition sources, credit notes and refund receipts cannot be
  independently reversed underneath posted asset evidence. Source-journal locks
  serialize registration/linking with Banking and Accounting reversal.

## Calculation and financial controls

The PKR 250,000 laptop with PKR 10,000 residual and 48 months produces PKR 5,000
monthly straight-line depreciation and PKR 240,000 total depreciation. Calculations
use exact integer minor units, company precision, a residual floor, remaining-life
rebasing after impairment/improvement and a final useful-life true-up. Reducing
balance uses the configured annual percentage.

Full-month convention charges the event month. Actual-day convention supports
partial first/final months and partial event months; subsequent calculations cover
only the remaining interval. Unreversed depreciation intervals cannot overlap.

Impairment, disposal, returns and improvements expose any required catch-up
depreciation in the event's approval preview. At most twelve outstanding periods
can be included; older gaps require explicit monthly runs first. Posting additionally
requires depreciation authority and records all dependent journals and asset effects
in the same transaction. Closed periods or any failed posting roll back everything.

Tenant/company authorization is rechecked against live scoped role grants. API
mutations require authenticated cookie/CSRF, idempotency and optimistic versions.
The database adds scoped foreign keys, forced RLS, immutable audit/effect rows,
source allocation guards, source-reversal guards and deferred journal/balance
reconciliation. Platform audit records include request correlation and a hash chain.

## Reports, files and bounded operations

Reports use persisted data: register/acquisitions, categories, locations, custodians,
departments, projects, depreciation schedule, accumulated depreciation, net book
value, transfers, vendor returns, refund transactions, refund outstanding,
maintenance, verification, verification exceptions, impairment and disposals.
Groups drill into the register. Filters include company, search, category, status,
supplier, acquisition/event dates and supported assignment dimensions. Directory,
event, run, group and refund pages are bounded. CSV exports identify the current
report page; per-asset schedule export includes its complete monthly schedule.
Annual schedules summarize both scheduled and posted depreciation.
Asset detail shows the remaining scheduled monthly intervals and useful-life end.

Company GL reconciliation compares the entire register with the actual control
accounts. It exposes unregistered acquisitions/other activity as differences; it
does not hide them behind the current UI filter. Terminal assets have zero active
register carrying value while retaining historical acquisition/depreciation.

Asset history pages contain 100 immutable evidence rows, newest first, with older
and newer navigation. The detail also shows the latest 1,000 lifecycle transactions;
complete before/after evidence remains in paginated history. Supporting files are
immutable PDF/PNG/JPEG uploads up to 10 MB, maximum 1,000 per asset, with signature
validation, safe filenames, SHA-256 and private authorized downloads. Database
metadata and object cleanup are coordinated on failure.

## Architecture and additive rollout

- UI: `app/features/fixed-assets`, existing shell/routes, shared shadcn primitives
  and semantic Tailwind. Asset tables wrap shared WorkTable and its remote pager.
- API/domain: `server/api/src/modules/fixed-assets`; shared bounded multipart parser
  moved from HR to `server/api/src/http` without duplicating it.
- Contracts: `packages/contracts/src/fixed-assets`; generated client and OpenAPI.
- Source migrations: security 0023, finance 0039, fixed_assets 0001–0007. Finance 0039
  aligns existing bank triggers with company base-currency authority, preserving
  historical unchanged evidence. No existing migration was rewritten.
- Runtime readiness requires those versions plus asset/file relations. Apply to
  the **existing intended ERP database** using the established migration identity
  and its configured `DATABASE_URL`, then run `npm.cmd run db:migrate:source`.
  Do not point business runtime at an acceptance database. Configure existing
  object-storage and API services through the deployment's established settings.

## Validation and remaining boundaries

Focused unit, API contract, real PostgreSQL/MinIO integration, additive migration
replay and Chromium acceptance tests cover exact depreciation, original acquisition
once, maker/checker, denied/stale access, immutable history, concurrent allocation,
mixed Purchase asset/expense recognition, improvements, transfers, impairment,
disposal, early/depreciated and unpaid partial returns, actual/partial refunds,
closed-period rollback, source-reversal protection and private uploaded bytes.
The browser scenario posts through the real API and database using synthetic test
identities; no test bank connects to an external banking network.

Responsive register/dashboard checks cover 1440/768/390px, light/dark, Axe and page
overflow. Evidence is under `tmp/fixed-assets/evidence`. Two shell accessibility
fixes preserve the assistant's name when its text is hidden and map light subtle
text to the existing accessible muted token. No new feature stylesheet or dependency
was introduced. Exact final command/results are recorded in
`docs/architecture/remaining-ui-migration.md`.

Lease accounting, CWIP and upward revaluation are separate unimplemented domains;
lease routes explicitly identify their prototype state. This implementation uses
approved owned-asset policies and does not add post-activation estimate restatement
or arbitrary posted lifecycle-event editing. Independent review of the selected
company policies and live-environment acceptance remain necessary before rollout.
