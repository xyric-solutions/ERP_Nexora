# BOM templates, material planning and product categories

Date: 20 November 2026. Status: approved by the owner in chat; implementation
authorized. Application baseline: `4a2de8a`, documentation baseline `6e3554d`.

## Requested outcome

Use the supplied template screenshot as the structural reference for BOM,
production planning and manufacturing orders: details, finished goods, raw
materials, non-stock items, expenses and notes. Preserve Nexora's shared controls,
theme, accessibility and accounting permissions. Choosing a finished product and
production quantity loads its BOM and calculates material requirements. Conversion
retains those requirements; approved orders retain their exact recipe and cost
estimates. Actual costs are added separately through reviewed posting evidence.

Add Products and Configuration tabs under Inventory → Products. Configuration
manages product categories; new products choose a category from the actual master.
Support Finished Goods, Raw Material and user-created category names.

The owner selected option 2 on the cost question: approved actual non-stock and
expense charges must increase production cost. Estimates alone never create cost.

## Read-only findings

- Inventory stores `category` as free text. The product list filters that text,
  and the product form has a text input; there is no product-category master.
- Manufacturing has one BOM per finished product and exact four-decimal quantity
  helpers. Existing BOM lines hold goods and quantities only.
- `manufacturing_plan_line` and `manufacturing_order_line` already exist. Their
  original material workflow was disabled by Manufacturing migration 4; the
  current API saves plans/orders using only finished product and quantity.
- Conversion currently creates exactly one draft order, with existing authority,
  version, idempotency and audit checks. The existing one-step Confirm & Approve
  action freezes approved orders.
- Actual material issue currently takes explicit component lines. It reads the
  current BOM for evidence, rather than enforcing the order's frozen recipe.
- Posted material cost already moves into WIP; actual completion moves the
  evidenced batch cost into finished stock. Non-stock/expense absorption needs
  a new controlled source allocation, not another journal or product ledger.

Affected code: Inventory contracts/repository/product views; Manufacturing
contracts/repository/BOM/plan/order forms; Stock preview/costing; Finance source
compensation guards; shared contracts/generated API; shell navigation and tests.

## Approaches considered

| Approach                                                            | Trade-off                                                                                                               |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Extend the existing masters, BOM and plan/order lines — recommended | Preserves record identities and existing posting architecture; adds the missing snapshot and cost controls.             |
| Add calculation displays to the forms                               | Smaller visual change, but saved orders and stock issue would still lack authoritative requirements and actual charges. |
| Introduce a separate MRP/template/costing engine                    | Supports wider future planning but adds duplicate concepts and migration risk beyond this request.                      |

## 1. Product categories

- Add one company-scoped category master with immutable server-generated
  `CAT-001` codes, name, active/inactive state, version and immutable audit.
- Enforce normalized-name uniqueness within the company and scoped foreign keys.
  Add a bounded category directory, create/update/status commands and permissions.
- Products and Configuration are top-level tabs within the existing Products
  workspace. Configuration contains Product Categories; existing product, unit,
  warehouse, transfer and stock routes remain available.
- Product creation requires an active category selected from the master. Category
  creation is available in Configuration; empty dropdowns link to that page.
  Names such as Finished Goods and Raw Material are real category records, and
  users may add others. No category is created as a side effect of a read.
- Category is a reporting/master reference. Existing goods/service, manufacture,
  purchase, Sales and inventory capabilities remain explicit product settings;
  a category name does not silently change them or assign financial accounts.
- Add `category_id`; retain the old text as a compatibility/display value. Existing
  records keep their IDs, names and category text. An unmapped legacy category is
  shown explicitly and can be linked by an authorized edit; no automatic merger,
  renaming or reclassification. Inactive categories remain visible on history.
- Product filtering/grouping uses category IDs for linked products and retains a
  clear legacy-unmapped filter. Existing API callers receive compatible fields;
  new category references are validated on the server.

## 2. BOM template layout and data

- Keep one finished output per template, matching the existing unique constraint
  and the supplied example. Multiple templates per output, co-products, by-products,
  recursive MRP and new recipe approval stages are outside this change.
- Details: generated BOM code, template name, base output quantity/unit, default
  warehouse selection and notes. Finished Goods displays the selected product,
  description, output quantity/unit and converted base quantity/unit. Cost share
  is automatically 100% for the single finished output.
- Raw Materials rows: canonical product/category/description, source warehouse,
  unit, BOM quantity, quantity per finished unit, required quantity, posted stock
  on hand and shortage. On-hand is an as-of projection of the real stock ledger;
  it is not a reservation or a guarantee of stock at later posting.
- Non-Stock rows select actual non-inventory products/services, quantity basis and
  estimated rate. Expenses hold an explicit description, quantity/rate basis and
  eligible expense reference. Clearly label estimated totals and their currency.
  Do not turn product price or a template rate into actual production cost.
- Reuse product units and governed conversions. Reject incompatible conversions,
  self-consumption, duplicate component identities and invalid quantities.
  Use decimal strings and existing exact quantity helpers; expose rounding.

## 3. Planning and conversion

- On finished-product selection, fetch the company's BOM automatically and show
  its identity/version. On output-quantity change, calculate each material as:
  `BOM component quantity × planned output ÷ BOM output quantity`.
- Example: a template for 10 kg requiring 2 kg of material needs 10 kg of that
  material for a 50 kg production plan. This is an arithmetic example only;
  it is never inserted into the business database.
- A server preview returns normalized units, requirements, estimates and live
  warehouse balances. The server recomputes and validates the saved result.
- Persist the selected BOM revision, source quantities, unit conversions and
  calculated lines using existing plan/order line tables plus necessary additive
  snapshot fields. Store the non-stock/expense estimate sections with their source
  version. Current stock figures are refreshed projections, not frozen stock facts.
- New template-driven plans require a usable BOM. Missing or stale BOMs produce
  actionable errors. A changed template requires explicit Refresh from BOM before
  saving/conversion; never silently replace a saved plan's recipe.
- Conversion atomically copies the saved recipe/requirements into exactly one
  draft manufacturing order. Preserve plan linkage, stable codes, quantities and
  source version. Retry returns the same order; concurrent conversion is rejected.
- Direct new manufacturing orders also load a BOM and require a saved snapshot.
  Draft edits may refresh the BOM explicitly. Existing historical BOM-free plans
  and orders remain readable and retain their earlier provenance.

## 4. Manufacturing approval and actual issue

- Use the same section layout for the manufacturing order, prefilled from its
  plan or selected BOM. Show standard requirements, order quantities and variance.
- Keep the existing Confirm & Approve action and server permissions. Require a
  reason for permitted draft component deviations, using the existing variance
  remark convention. Approval locks the recipe, units, estimates and order terms.
- Later BOM edits never change an approved order. Stock preparation uses the
  approved order snapshot, not the latest editable BOM.
- Prefill actual material issue from the approved order and requested batch
  quantity, then require actual quantities/warehouses and explicit review.
  Preserve order limits and require reasons for actual deviations. Partial batches
  reconcile against the full approved requirement without cumulative rounding loss.
- Saving, converting or approving a plan/order creates no stock movement, bank
  movement or GL entry. Actual issue and completion retain the existing independent
  Stock/Finance lifecycle, period, authority, shortage and reversal controls.
- Legacy orders without a snapshot retain the previously approved explicit actual
  consumption path, clearly labelled legacy. No historical recipe is invented.

## 5. Actual non-stock and expense cost absorption

- Add a production-charge operation to the existing reviewed stock/WIP operation
  architecture. Link it to an actual production issue batch. Its immutable source
  allocations attest posted, eligible AP/expense journal lines and their remaining
  unallocated base-currency amounts. Add only the allocation evidence needed to
  prevent duplicate capitalization; do not create a second AP or GL ledger.
- Templates/plans/orders retain estimates. Actual charge selection is explicit,
  uses the real posted source, and excludes recoverable tax, bank/payment lines,
  AP/AR control accounts, reversed sources and already allocated amounts.
  A draft/unposted supplier invoice cannot supply actual production cost.
- On independent approval/posting, reclassify the allocated original expense
  into the batch's governed WIP: debit WIP, credit the evidenced expense account.
  Preserve original credit dimensions and approved production debit dimensions.
  AP recognition/payment remains in its own existing lifecycle. This prevents
  double expense recognition and does not create another supplier liability.
- Use the source's posted base value and currency/rate evidence. No guessed
  exchange rate or automatic capitalization from estimated amounts. Validate
  approved account mappings and applicable dimensions centrally.
- Serialize allocations across batches and prevent over-allocation in both
  service and database checks. The browser cannot supply unverified accounts,
  eligible source values or final journal lines.
- Actual batch cost equals posted consumed-material cost plus posted production
  charges. Complete or explicitly waive estimated charges with a reason before
  the batch's first completion. Additional charges after output posting require
  controlled compensation first; this increment performs no retroactive recosting.
- Partial completion allocates the batch pool exactly; the final completion takes
  the rounding residual. WIP reconciles to remaining evidenced production value.
  Non-stock and expense rows never increase physical component quantities.
- Reverse completed output before reversing its consumed charges; release source
  allocations only through compensating operations. Block source AP reversal or
  credit that would invalidate allocated cost until dependent production costs
  are compensated. Reversals preserve original value, dimensions and audit links.
- Missing actual source evidence or accounting mappings remain explicit readiness
  blockers. This design authorizes no fabricated expense, account mapping, live
  posting, or execution of the historical document queue.

## 6. Database, API and release discipline

- Add migrations; retain old records and defaults. Do not restore old migration
  files or execute archived installers. Extend current contracts and generated
  client/OpenAPI alongside versioned `/api/v1` endpoints.
- Inventory migrations execute before Manufacturing in a fresh installation.
  Place cross-module constraints/attestation only after their referenced schema
  exists; test both a fresh schema and an upgrade from the current release.
- Category commands, template preview/save, plan conversion, order approval,
  production-charge allocation and issue/completion all enforce tenant/company
  scope, current authority, validation, versions, idempotency and immutable audit.
- Increment order: categories → template/requirements → plan/order snapshots →
  actual charge absorption → authenticated combined acceptance → safe release.
- Build with the existing Tailwind/shadcn controls and Nexora semantic theme.
  Dense tables scroll within keyboard-accessible regions. Test loading, errors,
  missing setup, empty data, light/dark and narrow widths. No feature stylesheet.

## Acceptance evidence required

1. Category creation, duplicate denial, status/history, new-product dropdown,
   category filtering and foreign-company/inactive-reference rejection.
2. BOM save/reload with all sections, base-unit conversion and exact scaling for
   fractional, zero-invalid, large and partial-batch quantities.
3. Product → automatic BOM → material requirements → saved plan → exactly-one
   order → approval. A later BOM edit leaves approved order/actual issue unchanged.
4. Manufacturing/Sales regressions, legacy record preservation, unauthorized
   mutations, stale previews, immutable approval and audit evidence.
5. Real PostgreSQL service invoice posting → charge allocation/review/post →
   actual material issue and partial/final output. Assert no duplicate AP expense,
   correct WIP/finished-stock value and unchanged bank until actual payment.
6. Competing allocations, over-allocation, missing charge evidence, dependent
   source credit/reversal, compensation and final residual cost reconciliation.
7. Authenticated browser journeys, independent SQL stock/WIP/GL/AP/AR/bank checks,
   contract drift, relevant regression tests, types, lint, build and theme audit.
8. Back up and rehearse migrations on a restored business copy; preserve original
   business fields and balances, verify replay, and activate matched versions only
   after checks pass. Keep owner accounting acceptance separate from software tests.

## Review status

Repository context and existing integration architecture reviewed. The actual-cost
choice is confirmed by the owner. The proposal uses existing records/lifecycles,
preserves history and defines the additional cost controls. Owner approval was
received after review of committed proposal `8e5aa14`; no further design approval
is required for this scope.
