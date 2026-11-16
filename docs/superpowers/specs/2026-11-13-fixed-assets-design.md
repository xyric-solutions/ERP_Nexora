# Fixed Assets implementation assessment and design

## Existing system assessment

The active production frontend is the repository-root Next application (`app`),
not a separate `web` directory. `server/api` owns PostgreSQL access and all financial
authority. `packages/contracts` owns Zod schemas, OpenAPI and generated clients.
Fixed Assets currently has catalogue routes but no feature-specific implementation,
API, repository or asset tables. Generic archetypes supply its prototype screens.
Lease screens remain a separate prototype scope; this request concerns owned assets.

Reuse the current FinancePostingService, Finance transaction client, company
currency authority, live scoped role policies, cookie/CSRF authentication, shared
COA, bank payments/receipts, supplier monetary subledger, Procurement suppliers and
bills, HR employees/assignments, shared locations/projects, semantic controls and
the source migration runner. Never create another journal or master-data system.

Purchase documents and payment instructions deliberately do not post. Accounting
can link an approved Purchase bill but currently restricts its payable counter-account
to expense. Extend that validation narrowly to configured asset accounts for linked
supplier invoices and credit notes; Bank Payments already post direct acquisitions.
Registration must consume those posted acquisition debit lines, never approval
alone. Multiple units reserve portions of the same line transactionally. Historical
base-currency cost comes from posted journal evidence, including its original FX.

## Chosen implementation

Implement a dedicated `app/features/fixed-assets` API-backed workspace and
`server/api/src/modules/fixed-assets` domain, using additive source migrations
after HR and Finance dependencies. Add scoped categories, individually coded
assets, immutable lifecycle/assignment events, depreciation runs/details,
idempotency and audit evidence. No fixture records or implicit permission grants.

Store category accounting policy snapshots on acquisition. Validate every mapping
against active company COA accounts and every assignment against existing scoped
masters. Generate stable company-scoped `FA-` and category codes on the server.
Require maker/checker separation for activation and financial lifecycle events.
Preserve every original source, posted event and assignment.

Depreciation uses integer minor units, configured straight-line or reducing balance,
monthly/full-month or actual-day conventions, a residual floor and chronologically
posted periods. Preview identifies skips. Posting/reversal uses FinancePostingService
inside the same transaction as the asset effects, with unique asset/period guards.

Transfers, maintenance and verification record immutable operational evidence.
Impairment and disposal calculate carrying effects on the server. Paid direct-bank
returns recognize a mapped vendor refund receivable; refunds link independently
posted Bank Receipts. Invoice returns link existing posted supplier credit notes,
so payable and governed tax effects remain in the existing monetary/tax subledger.
Do not bypass that subledger by directly debiting its payable control. Return and
disposal are distinct operations, with controlled approval and explicit evidence.

Reports and dashboard use persisted SQL data, support company/category/status and
assignment filters, and expose asset-to-GL reconciliation and source unallocated
amounts. Existing lease/CWIP/revaluation functions outside the implemented lifecycle
must be explicitly identified, not passed off as working asset functionality.

## Alternatives considered

Extending generic prototype renderers would retain mock business persistence and
cannot satisfy accounting or security. A separate asset accounting engine would
duplicate journal, FX, period and tax logic. The dedicated domain consuming current
Finance and master-data boundaries provides the required isolation and reuse.

## Execution and validation

1. Inspect live source schema metadata and migration history; preserve all existing
   currency integration changes and applied migration identities.
2. Add contracts and additive constraints/RLS/permissions, then repository/services
   and authenticated versioned APIs. Test against isolated real PostgreSQL records.
3. Connect actual forms, lifecycle actions, dashboard and reports through generated
   client methods. Preserve design tokens and existing public route identities.
4. Test exact depreciation, no duplicate capitalization, posting/reversal, source
   allocations, returns/refunds, disposal, immutable history, concurrency, denied
   authority and company isolation. Run typecheck, contract generation, UI audit,
   focused tests and production build. Record evidence and remaining limitations.

The request explicitly authorizes implementation after the assessment; no additional
design approval is required. No changes to existing environment values or unrelated
business records are authorized or needed.
