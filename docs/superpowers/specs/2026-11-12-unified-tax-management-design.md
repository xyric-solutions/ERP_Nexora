# Accounting navigation and unified tax management

Date: 2026-11-12
Status: Approved by user; implemented and verified locally

## Goal

Rename the visible Finance module to Accounting, remove the standalone Costing
module, and replace the standalone Tax module and its distinct work pages with
one Accounting > Taxes entry. Deliver a persistent tax console, definition form,
documented API, relational mapping rules and server-enforced posting integration.

## Repository findings

- `app/shell/config/prototype-data.ts` defines the Finance, Costing and Tax modules.
  Tax currently has twelve generic prototype pages. Separate tax and costing
  report groups also exist in Reports & Analytics.
- The Finance identifier is used by navigation, permissions, API contracts and
  working accounting workflows. Retain `finance` internally and change visible
  module names, breadcrumbs and menu descriptions to Accounting.
- `finance/0001_finance_foundation.forward.sql` already defines a legacy
  tenant-scoped `tax_rule` and an optional journal-line reference. It does not
  provide the requested company-scoped definition/mapping administration flow.
  Preserve existing records and references; do not infer new mappings from JSON.
- Procurement has entered tax percentages and payment withholding calculations.
  The new multicurrency subledger supports entered input/output tax amounts and
  accounts. Neither provides the requested governed tax-definition selection.
- Payroll already calculates governed components and statutory results, freezes
  their accounts and posts independently approved results through the shared
  FinancePostingService. Preserve this lifecycle and statutory engine.
- No independent live Fixed Assets posting module was found under
  `server/api/src/modules`. Supporting Fixed Assets applicability must not imply
  that this change also implements an asset register or depreciation engine.
- The current global palette is amber/olive. `image_3.png` is not present in the
  repository or attached to the request. Follow the supplied control-console
  description using shared semantic tokens rather than claiming a pixel match.
- Earlier multicurrency work is present as uncommitted changes. Preserve it and
  integrate with it without discarding or committing it incidentally.

## Approach

Use a persistent console plus one server-side tax resolver integrated into the
existing source workflows and FinancePostingService. A UI-only catalogue would
not enforce posting integrity. A parallel tax posting engine would duplicate
period, FX, approval, journal and idempotency controls.

The resolver computes tax and chooses the approved mapping. Source modules retain
ownership of document totals, lifecycle and posting. It never posts a tax-only
journal independently of its source transaction.

## Navigation

- Display Accounting in the module picker, sidebar and header. Preserve current
  accounting routes and backend names.
- Remove Costing from the module registry, icons, navigation focus and launchers.
  Remove its dedicated report group and active prototype page registrations.
  Retired costing links resolve to a clear unavailable state, never a generic
  editable costing page. Preserve unrelated cost centres, payroll dimensions,
  inventory valuation and manufacturing calculations.
- Remove the standalone Tax module and all its page registrations. Add exactly
  one visible Taxes leaf under Accounting; clicking its text opens the console.
  Legacy Tax-module bookmarks normalize to this leaf. Do not retain hidden tax
  editor, returns or preview work pages.
- Remove the dedicated legacy Tax Reports group and retired tax report links
  that would otherwise open separate generic tax work pages. Keep tax management
  and its record history inside the console; this request does not implement
  statutory return filing or e-invoicing.
- Update the navigation catalogue, role fixture module references and navigation
  documentation. Keep Sales, Purchases, Banking and HR entry points functional.

## Console and form

Create `TaxManagementConsole` in the Finance feature and a focused
`TaxDefinitionForm` using existing shadcn Dialog, Input, Button and table controls.

The work page title is **Unified Tax Management Console**. A prominent ERP-themed
**Add New Tax Definition** button opens the modal. Dense rows show Tax Name, Tax
Type, Tax Rate (%), Associated Nominal (GL) Account, Applicable ERP Module,
Active/Inactive Status, and Edit/Deactivate actions. Include stable read-only
`TAX-001` style codes, search, module/type/status filters and bounded pagination.
Inactive records remain available for history and explicit reactivation.

The modal contains:

1. Read-only code, name, system-defined type (WHT, GST, VAT, Excise, Payroll Tax,
   Other), rate from 0.00 through 100.00 percent with at most two decimals,
   description, status and effective date.
2. Module selection: Purchases, Sales, Payroll or Fixed Assets. Changing context
   clears an incompatible account and refreshes eligible accounts.
3. Explicit treatment and trigger, with a plain-language debit/credit preview.
   Types alone do not decide accounting treatment: purchase GST may be recoverable
   while purchase WHT is a liability deducted from supplier payment.
4. Searchable company-owned nominal selector displaying code and name. Liability
   treatments allow active posting liabilities; recoverable input tax allows
   active posting assets. Reject headers, inactive accounts, wrong company,
   incompatible currencies and receivable/payable/bank control misuse.
5. Reason for change and a concise impact summary. Show server validation errors
   inline, preserve entered values on conflict and prevent duplicate submission.

Per the user's subsequent theme correction, use the global font, neutral surfaces
and existing ERP primary/brand semantic tokens in both themes. The primary action
uses the shared Button styling; no separate blue palette or glow. Present textual
status badges with indicators. The tax form uses a bounded dialog above the ERP
shell, with a fixed header/action area and independently scrolling fields. Use two
field columns where space permits and one on narrow screens; wrap account pager
actions. Preserve focus management, accessible labels, responsive table scrolling
and loading/error/empty states. No feature stylesheet or independent palette.

## Relational model and integrity

Add source migrations after existing Finance and Security migrations, with:

- `TaxDefinition`: stable company-scoped identity, allocated code, name,
  description, system type, status and optimistic row version.
- `TaxDefinitionRevision`: immutable effective revision of rate/type/description
  and approval/audit provenance. Editing creates a successor, never rewrites
  an applied revision.
- `TaxMappingRule`: immutable revision relationship to definition, company,
  applicability module, treatment, trigger and `account` nominal identity.
  The existing account table is the ChartOfAccounts_NominalCode relationship;
  do not duplicate the chart of accounts.
- `TaxApplication`: immutable source identity/line, definition revision, mapping
  revision, taxable basis, currency/precision, exact rate, tax amount, functional
  amount and FX evidence, linked to the actual posted accounting event/journal.
- Append-only audit and scoped idempotency evidence; transactional code allocation
  includes inactive definitions and never reuses codes.

Use tenant/company composite foreign keys, FORCE RLS and live company authority.
Database constraints/triggers enforce allowed types, exact rate bounds, company
ownership and supported mapping/treatment combinations. Posting constraints verify
that application evidence agrees with the journal's mapped account, direction
and amounts. A balanced journal alone is insufficient evidence.

One console row represents one definition and its module mapping. A definition
has one active mapping revision at a given effective instant; separate module
contexts use separate definitions. This avoids ambiguous rule precedence and
keeps the requested single-account/module table legible.

## Permissions and lifecycle

Introduce explicit company-scoped tax read, manage and mapping-administration
permissions without automatically granting them to existing users. All definition
mutations that include or affect nominal mappings require a real administrator
role plus live mapping-administration authority, not just a browser role flag.
Follow existing security authority locking and reject impersonated writes.
Authorized accounting operators may read/select eligible definitions without
receiving mapping administration authority.

Saving configuration does not post money. Financial actions continue through
their existing draft/submitted/approved/posted workflows with independent checks,
CSRF/origin validation, idempotency and atomic audit writes. Recheck live account,
definition and mapping authority at approval/posting. A changed revision makes an
unposted reviewed source stale; it must be reviewed again. Posted applications
remain immutable. Reversals use the original evidence and shared reversal controls
even if a definition is subsequently inactive.

## Resolver and source integration

Inputs are authenticated company, source module, source date, definition identity,
trigger, currency and server-owned taxable basis. The client never supplies an
authoritative GL account, rate, computed tax or functional amount for a governed
selection. Resolve the effective active revision in the source transaction, use
exact decimal/bigint arithmetic and round to the transaction currency precision.
Use current governed FX authority to convert to functional currency and preserve
separate conversion-rounding evidence.

Treatments and examples, using artificial rates only:

- Purchase withholding at supplier settlement: gross payable 1,000.00 at 5.50%
  gives debit supplier payable 1,000.00, credit bank 945.00 and credit mapped WHT
  liability 55.00. Do not also withhold at bill recognition. Invoice-stage WHT is
  allowed only as an explicitly selected supported trigger, with the supplier
  balance reduced at recognition and no second deduction at payment.
- Sales added/output tax: net revenue 1,000.00 plus tax 55.00 gives debit customer
  receivable 1,055.00, credit revenue 1,000.00 and credit mapped liability 55.00.
- Recoverable purchase input tax: net purchase 1,000.00 plus tax 55.00 gives debit
  expense/asset 1,000.00, debit mapped recoverable-tax asset 55.00 and credit
  supplier payable 1,055.00.
- Payroll flat-rate deduction: eligible component basis 1,000.00 gives deduction
  55.00, credit mapped payroll-tax liability 55.00 and net-pay reduction 55.00.
  Link explicitly to the Payroll component and freeze revision evidence during
  calculation. Do not apply every Payroll definition to every employee or replace
  published progressive statutory formula packs with a flat-rate definition.
- Fixed Assets definitions can be configured and resolved for an explicit asset
  context. Do not introduce a generic browser-supplied journal endpoint or claim
  an automatic asset posting path until a real source workflow exists.

Integrate governed selections with procurement line/document persistence and the
existing approved-bill accounting adapter, live receivable/payable recognition
and supplier settlement, and Payroll calculation/result/journal validation.
Preserve existing historical documents with their original evidence. New governed
documents cannot bypass a selected definition using manual rate/account fields.
Provide a deliberate legacy/manual mode where existing APIs still require it;
label it and keep existing permission/lifecycle checks. Never auto-assign a tax
definition to historical documents merely because an entered percentage matches.

Tax combinations in this delivery are independent percentages of an explicitly
retained exclusive basis; no compound or tax-on-tax inference. Recognized credits
and reversals preserve signed tax provenance. Cross-currency withholding must
reconcile the supplier's native payable relief, tax liability and actual bank
currency independently through the existing multicurrency posting boundary.

## API and ownership

Add schemas, OpenAPI and generated client together in `packages/contracts`.
Implement under `server/api/src/modules/finance/taxes` and mount versioned routes:

- `GET /api/v1/finance/taxes/options`: types, contexts, allowed treatments/triggers
  and permitted company account options with bounded search.
- `GET /api/v1/finance/taxes`: paginated/filterable company directory.
- `GET /api/v1/finance/taxes/:id`: definition, effective mapping and revision history.
- `POST /api/v1/finance/taxes`: atomic definition/revision/mapping creation.
- `PATCH /api/v1/finance/taxes/:id`: versioned successor revision/mapping.
- `POST /api/v1/finance/taxes/:id/status`: versioned deactivate/reactivate with reason.

Mutation headers use the existing CSRF, idempotency and optimistic concurrency
conventions and standard problem responses. Transaction source APIs consume the
resolver internally; a client tax preview, if needed, is advisory and cannot
authorize posting. Do not add duplicate Next.js API or browser/database access.

## Verification and rollout

Verify exact calculation for zero/two/three-decimal currencies, zero/100% rates,
overprecision rejection, negatives/credits, withholding trigger exclusivity,
partial settlement residue, cross-currency tax conversion and rounding.

Use disposable database integration tests for same-company account eligibility,
wrong tenant/company denial, non-admin mutation denial, live revocation, direct
invalid mapping/application writes, immutable revisions/evidence, stale approvals,
idempotent retries/concurrent creation and atomic rollback on posting failure.
Assert real GL debits/credits for the purchase and Payroll examples, source totals,
control-account reconciliation and historical preservation after edits/deactivation.

Add navigation tests proving Accounting/Taxes placement, absence of Costing and
standalone Tax pages, legacy tax-link normalization, and unaffected Banking/HR/
Purchases/Sales routes. Browser-test create/edit/deactivate/reload, module-aware
account selection, role restrictions, company changes and light/dark desktop,
tablet/mobile states. Record visual evidence in the existing migration document.

Run relevant unit, integration, contract and security suites; API generation check;
catalogue check; changed-file lint/format checks; typecheck; production web build;
theme audit write/check; and git diff --check. Report only executed results.

Update existing navigation, Finance reporting and migration/rollout documentation.
Migrations and explicit permission assignments require the intended runtime target
before activation. Do not inspect/modify .env, migrate a shared database or grant
live authority during local implementation. Validate source migrations against
disposable databases. Preserve populated audit/application evidence on rollback;
disable entry points rather than dropping financial history.

## Implementation and verification

The user approved this design. The console/form, persistent versioned API,
company-scoped relational mappings, source resolver, purchase/sales accounting,
withholding, Payroll snapshots/accrual and source-bound immutable applications are
implemented. Tax and control nominal roles cannot be reused in either direction.

Verification and browser evidence are recorded in
`docs/architecture/remaining-ui-migration.md`. Activation steps, permissions and
supported boundaries are in `docs/migrations/FIN-PG-01-finance-postgresql.md`.
Standalone financial documents select one governed definition; approved bills
retain independent definitions and mappings per line. Payroll definitions use an
explicit earning/deduction pair at the monthly run boundary. Fixed Assets context
configuration does not create an asset posting module. Existing manual and sample
flows remain explicitly identified. No operating financial data was migrated.
