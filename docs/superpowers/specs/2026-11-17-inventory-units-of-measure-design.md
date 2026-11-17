# Inventory Units of Measure and automatic conversion

Status: Approved by the owner on 17 November 2026. Implemented in source and
verified in isolated data/previews; targeted localhost release awaits the separate
database/release review described in the implementation and release plans.

## Requested outcome and interpretation

Add **Inventory > Unit of Measure** as a visible submenu. Let authorized users
create and manage units used by products, convert compatible quantities in both
directions, and use standard definitions such as kilogram, gram and metric tonne.
Interpret "quality standard" as accurate definitions, validation, precision,
traceability and a usable ERP interface. Product grades, inspections, certificates
and a quality-management workflow are outside this proposal unless requested.

## Existing behavior

- Inventory currently exposes Products, Stock Transfer and Warehouse.
- Product contracts enforce ten fixed unit names; Inventory options returns that
  list. ProductForm already has a Unit selector in its General tab.
- Products store their unit in details JSON. Transfer saves take the saved product
  unit and support four-decimal quantities. Transfers remain unposted drafts.
- Purchase requests currently overwrite selected-product units from the product
  master. Downstream purchase documents compare source units, quantities and,
  for receipts/bills, approved prices. Amounts use existing exact integer-based
  calculations; unit prices have two decimal places.
- Inventory uses company-scoped permissions, tenant RLS, immutable audit evidence,
  transactional record numbering, optimistic versions and idempotency.
- The localhost runtime is a compatible release against an older recovered schema;
  a root API restart or blanket migration would also introduce unrelated pending
  Purchase/Assets changes. That is not part of this feature's deployment.

## Approaches

1. **Recommended: managed unit catalogue with a shared exact converter.** Persist
   units and product packaging mappings in the API/database; reuse existing forms
   and apply conversion in product-linked Purchase requests and draft transfers.
   This addresses real workflows while preserving approved document terms.
2. **Catalogue and standalone calculator only.** Smaller change, but Purchase and
   Transfer would still force the old unit and not benefit from automatic conversion.
3. **Arbitrary pairwise conversion rules and automatic rewriting of every document.**
   More flexible, but introduces conflicting conversion paths and avoidable changes
   to approved prices, tax allocations and historical quantities. Do not use it.

## Workpage and forms

- One compact searchable directory, filters for measurement category and status,
  and one top-right **Add New Unit** button. Edit by opening an existing row.
- Show automatic read-only code (UOM-001), name, symbol, category, conversion to
  category reference, quantity precision and active/inactive status.
- Use a single form with standard-unit selection or a custom name/symbol and
  positive conversion ratio to the category reference. Standard definitions are
  protected. Codes are stable and allocated transactionally, including inactive
  records. Prevent duplicate names/symbols under the defined company scope.
- Provide an inline conversion panel: quantity, From unit, To unit and live result.
  It handles reverse conversion and shows the rule used. Filter choices to the
  same measurement category. No Convert or Refresh button is needed.
- Use the existing global company context once in the ERP header, shared controls,
  semantic tokens, responsive layouts and keyboard-accessible labels/focus states.
- Preserve entered data on errors, guard unsaved changes, and support loading,
  retry, empty, validation, permission-denied and concurrent-edit states.

## Unit categories and definitions

- Mass: milligram, gram, kilogram and **Metric Tonne (1,000 kg)**.
- Length: millimetre, centimetre, metre and kilometre.
- Area: square millimetre, square centimetre, square metre and hectare.
- Volume: millilitre, litre and cubic metre. Area and volume factors use squared
  and cubed dimensions; they are not copied from length factors.
- Count: Each/Pcs compatibility and dozen; require whole quantities where the
  product's precision policy does not permit fractional items.
- Time: second, minute, hour and an explicitly named 24-hour elapsed day.
  Preserve existing Day records without assuming that a service day means
  24 billable hours; require an explicit product mapping before converting them.
- Packaging: Box, Pack, Carton and other user-defined containers require a
  product-specific content mapping. For example, 1 Box = 12 Each or 1 Bag = 25 kg.
  The same box name can have different content quantities for different products.
  Packaging conversion is unavailable without a product and saved mapping.
- Keep existing Kg, Gram, Each, Pcs, Box, Pack, Litre, Metre, Hour and Day labels
  readable and preserve historical codes/records. No automatic global assumptions
  about pack contents, weight-to-volume density or length-to-area dimensions.
- Initially supply the listed standard definitions as persistent reference data,
  not UI fixtures. Custom units extend these categories using explicit factors.
  Temperature offsets, currencies and calendar month/year conversions are excluded.

Authoritative references: [BIPM SI Brochure](https://www.bipm.org/en/publications/si-brochure)
and [NIST SP 811, chapter 5](https://www.nist.gov/pml/special-publication-811/nist-guide-si-chapter-5-units-outside-si).
These define metric tonne as 1,000 kg, litre relative to cubic metre and elapsed
time units. This feature does not claim certification to a quality standard.

## Exact conversion and lifecycle rules

- Store each unit's positive exact rational factor to its category reference.
  Compute quantity * source factor / destination factor using integer/rational
  arithmetic, never binary floating-point arithmetic. No arbitrary rule chains.
- Validate category compatibility, bounds, positivity and permitted precision on
  the server. The browser uses the same pure conversion helper for previews.
- Examples: 1 kg = 1,000 g; 250 g = 0.25 kg; 1 metric tonne = 1,000 kg;
  2.5 kg = 2,500 g; 1 litre = 1,000 millilitres; 1 metre = 100 centimetres.
- A preview can label a rounded display, but saving a converted quantity that
  cannot fit the workflow's four-decimal base-quantity precision must return a
  clear error. Never silently lose inventory through rounding or overflow.
- Save original entered quantity/unit, product base unit, exact factor and
  normalized base quantity as a server-verified snapshot on new document lines.
  Ignore/reject client-forged factors and derived quantities.
- Standard meaning is immutable. Once referenced, a custom unit or packaging
  factor cannot change meaning; retire it and create a replacement. Product base
  unit changes are blocked once referenced, pending a separate controlled
  conversion workflow. Retain inactive references and all historical snapshots.

## Integration and accounting boundaries

- Replace the fixed product enum with server-validated managed references,
  preserving compatible unit labels in responses for existing consumers. Add
  unit IDs/reference metadata compatibly and update generated contracts/client.
  Resolve legacy units deterministically during the additive migration; preserve
  historical document payloads rather than rewriting financial evidence.
- ProductForm uses real active unit options. Add product-specific packaging rules
  to its existing Inventory tab. Editing a product with an inactive unit must
  retain the saved selection and allow unrelated changes under existing policy.
- Purchase requests allow compatible measurement units and defined packaging for
  a selected product. Show the automatically calculated base-quantity equivalent.
  The entered quantity and price are commercial terms in the selected unit.
  Do not convert an entered unit price silently; changing a priced line's unit
  must require re-entry/confirmation of the price for the new unit.
- Downstream RFQs, orders, receipts and bills inherit source commercial units and
  conversion snapshots. Keep the source unit fixed through that document chain,
  retain existing approved-price/tax checks, and compare like-for-like quantities.
  Carry the base-equivalent snapshot for traceability; do not add cross-unit
  repricing between approved source and dependent documents in this feature.
- Existing custom Purchase lines keep their existing behavior. Structured unit
  conversion is available when a managed product and eligible units are selected.
- Draft transfers allow compatible units, show base equivalents and persist the
  server-derived product-base quantity alongside the entered-unit snapshot.
  Existing transfer quantity/line contracts remain compatible.
- Preserve existing purchase totals, discounts, taxes, freight, source consumption,
  fixed-asset whole-item checks and posting permissions. Converted physical
  quantities do not become a second monetary calculation basis.
- Opening stock and transfers remain unposted plans/drafts. This feature does
  not introduce stock-ledger posting or new journal generation.

## API, persistence and authorization

- Keep ownership in Inventory with a focused unit repository/service as needed;
  avoid growing the existing product repository into an unrelated monolith.
- Add versioned /api/v1/inventory unit list/read/create/update and conversion
  operations, with bounded search/pagination and standard errors. Update shared
  contracts, OpenAPI, generated client and existing consumers together.
- Add company-scoped unit, product packaging mapping and immutable change/audit
  records through packages/db source migrations. Use foreign keys/uniqueness,
  forced tenant RLS and current tenant/user transaction-local context.
- Reuse Inventory item read/create capabilities for this master, matching existing
  Product save conventions. Validate product/unit availability in each existing
  workflow under its existing permission; do not grant Inventory management
  permissions merely to let a Purchase user select an eligible unit.
- All writes preserve CSRF/origin checks, active-company authority, idempotency,
  optimistic concurrency, immutable history and impersonation restrictions.
- Do not delete referenced units or use browser storage as the source of truth.

## Verification and release

- Unit tests: both conversion directions, identity, rational round trips, category
  rejection, packaging requirements, precision/overflow, count constraints,
  inactive references and prevention of changes to referenced definitions.
- Integration tests: migrations/backfill, duplicate/custom unit validation,
  company isolation, restricted-role RLS, permissions, audit evidence,
  idempotent retries, optimistic conflicts and forged conversion rejection.
- Workflow regressions: real product unit persistence, request conversion,
  source inheritance and partial receipt/bill limits; purchase totals/taxes remain
  correct, asset whole-item validation is preserved and draft transfers do not post.
- Browser tests: submenu navigation, add/edit/search/filter, automatic converter,
  product options, packaging, Purchase and Transfer equivalents, failed-save
  retention, keyboard access, responsive light/dark layouts and company switching.
- Run relevant unit/integration/contract/browser suites, typecheck, lint,
  theme audit write/check, production web/API builds and git diff --check.
  Update inventory architecture and UI migration notes with actual evidence.
- Implement and validate in isolation first. Before changing the recovered local
  business database, prepare a concrete backup, compatibility and targeted
  migration/release procedure for review under the existing deployment boundary.
  Do not execute blanket pending migrations or replace the running compatible API
  with an incompatible root build. Preserve login configuration and credentials.
- Commit and push approved work to shoaib_nexora. Report separately what is
  implemented/tested and what is actually running on localhost.
