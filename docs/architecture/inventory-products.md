# Inventory product catalog

Inventory exposes **Products**, **Unit of Measure**, **Stock Transfer** and **Warehouse**. The Products work page supports grid/list
views, bounded search, type/status/category filters, continuation pagination and
Add New. Existing item/create/detail URLs resolve to the corresponding product
pages. The Warehouse and Stock Transfer work pages have search, pagination,
Add New and populated creation/edit forms. Other stock prototypes remain hidden.

The operating company is shown once in the persistent ERP top bar. Product,
warehouse/transfer, Purchase and Accounting hierarchy workpages use that session
scope without repeating a company selector. Switching uses the authenticated
company directory and session API, protects unsaved forms and clears record
navigation after success. Company values that represent business data remain.

Product grid cards use compact spacing and responsive columns. Grid continuation
has a Load more products action; list continuation retains WorkTable pagination.
Add New uses real company currency options. Missing settings retain a visible
retry/setup explanation rather than silently hiding the reason for disabled
creation. Currency setup is never activated automatically.

One creation/edit form combines the supplied references: identity and sales/
purchase/manufacture flags, General, Pricing, Inventory and Accounting tabs. It includes
goods/services, category, unit, reference/barcode, supplier, descriptions, prices,
discounts/taxes, stock planning, pack sizes, weight and optional account defaults.
Income and expense accounts are visible in General; the stock asset mapping stays
in Accounting. General also includes a real Location/City and Default Warehouse.
Services cannot track stock or be manufactured. Negative stock remains disabled. Company selection
is fixed while editing. Failed saves retain input, and unsaved navigation is
guarded. Shared Tailwind tokens and controls preserve the ERP light/dark themes.

## Persistence and authorization

### Managed measurement units

`Unit of Measure` provides a company-scoped directory, Add New Unit, retained
active/inactive records and a live converter. Standard mass, length, area, volume,
count and elapsed-time definitions are persistent reference data. Metric Tonne is
explicitly 1,000 kg. Existing Day remains a legacy service unit requiring an explicit
product rule before conversion to elapsed time; Box/Pack contents are never assumed.
Custom definitions use positive rational factors and stable transactional UOM codes.
Definitions retain their meaning after creation; status is editable with audit history.

Inventory migration 3 adds standard/company units, immutable unit change evidence,
same-company product base-unit references and optional transfer conversion snapshots.
It seeds standard reference data for existing/new companies without rewriting product
JSON or historical financial evidence. Product packaging rules reuse audited product
details. The server locks and validates eligible company units, precision and mappings;
referenced product base units and packaging factors cannot silently change meaning.

`/api/v1/inventory/units` supports bounded list/create, `/{id}` read/update,
`/conversion` standard or product-specific conversion and `/product-choices`
workflow-authorized choices. Unit management follows existing Inventory item read/
create capabilities. Product choices select an allowlisted Products/Purchase/Transfer
permission; Purchase users do not need Inventory management access. All writes retain
CSRF, origin, company authority, optimistic versions, idempotency and audit checks.

The shared converter uses exact integer/rational arithmetic. New Purchase requests
and draft transfers snapshot the entered quantity/unit, factor, base equivalent and
precision. Saving rejects conversion overflow, incompatible dimensions and precision
loss. Purchase quantity and price remain commercial terms in the selected unit;
changing a priced unit asks for confirmation and clears that price. Source documents
retain their commercial unit through RFQs/orders/receipts/bills, including exact
partial-quantity snapshots. Existing tax, discounts, charges, posting and individual
asset registration safeguards remain. Transfers store their base quantity and remain
unposted drafts; forms restore the original entered unit/quantity when reloaded.

The feature is active on localhost after owner-approved backup/restore verification
and Inventory migration 3. Procurement remains at 5 and Fixed Assets at 2. Existing
records and login credentials were retained. Live acceptance covers both companies,
conversions, existing forms and company isolation; see the
[targeted release procedure](../superpowers/plans/2026-11-17-inventory-units-release.md).

The client uses generated contracts through the independent API:
`GET /api/v1/inventory/companies`, `/options`, `/lookups`, `/products`,
`GET /products/{id}`, `POST /products`, and `PATCH /products/{id}`.
Warehouse and transfer directories, reads, creates and updates use `/warehouses`
and `/transfers` with the same company scope, CSRF, version and idempotency rules.
Contracts, OpenAPI and generated client are maintained together.

Inventory source migration 1 follows Procurement 1. Migration 2 adds product
location/warehouse foreign keys, `inventory_warehouse`, `inventory_transfer`,
`inventory_transfer_line` and immutable `inventory_operation_change` evidence.
`inventory_product` owns the
company product identity and validated configuration; same-company foreign keys
bind supplier and account defaults. `inventory_product_change` stores immutable
snapshots and idempotent responses linked to the platform audit chain. Database
guards prevent deletion, identity/code changes, skipped versions and mutations
without matching audit evidence. Both tables use forced tenant RLS.

The existing `inventory.item.read` capability governs reads and limited supplier/
account lookups. The existing `inventory.item.create` capability governs master
saves, consistent with the Supplier master save convention. No permissions are
granted automatically. Every request rechecks the active user, latest active
role-policy assignment, exact permission and company scope against PostgreSQL.
The identical existing company-authority SQL is shared with Reference Masters and
Purchases. Impersonated writes are blocked. Writes require cookie session, CSRF,
allowed origin, idempotency key, and quoted If-Match on updates.

Inventory sets both authenticated tenant and user transaction-local PostgreSQL
context. Company currency row-level security requires the user context as well
as non-revoked company access. This fixes empty currency options and failed
product saves under the restricted runtime database role without broadening
permissions or bypassing RLS. Regression coverage uses a non-owner, non-bypass-RLS
role and verifies create/edit, denied/revoked access and connection-context cleanup.

Warehouse master reads/saves reuse `inventory.bin.read` / `inventory.bin.create`.
Transfer draft reads use `inventory.stock.read`; saves require both currently
company-scoped `inventory.item.create` and `inventory.stock.read`. These existing
Inventory capabilities create master/draft records only; no transfer posting
capability, role bypass or new permission grant is introduced. The `surface`
company/lookup parameter chooses an allowlisted permission and lookup set:
Warehouse can look up locations, Transfer can look up warehouse/product names,
and Products can look up its product defaults. It cannot widen account access.

Each new warehouse creates a matching `organization_unit` of type `warehouse`
under the company. Names/status remain synchronized and database guards reject
unmatched organization edits. `WH-001` numbering locks at tenant scope because
organization codes are tenant-unique, including historical HR warehouse codes;
existing HR units are retained without automatic profile conversion. Draft
transfers reserve company-scoped `ST-001` codes. Warehouses and products must be
active in the same company; products must be stock-tracked goods. Source and
destination must differ. Quantities are positive exact decimals; duplicate
product lines are rejected. Saved line units come from the product master.
Deferred evidence checks cover the header and every line, preventing unaudited
line edits/deletes. Warehouse and transfer identities are retained permanently.

Transactional company numbering reserves stable `PRD-001` codes, including
inactive records. Barcodes are unique case-insensitively within company. Supplier
status and risk, account lifecycle/type, and active company currency are checked
again on every save. Bank, header and reconciliation accounts are excluded from
product mappings. Mappings are configuration and confer no posting capability.

## Stock boundary

Opening quantity/rate/date are explicitly an **unposted opening plan**. They do
not create stock movements, accounting events or journals. `on_hand_quantity`
remains null and the directory displays “Not posted” or “Not tracked”. Saving a
master must never manufacture an on-hand balance. Transfers are explicitly
unposted drafts and never reserve or move stock; their creation form saves a
request only. Posted openings, warehouse
balances, quantity adjustments, replenishment and purchase-receipt posting remain
separate work requiring the append-only stock ledger and accounting workflow.
Product images, variants, combos and FBR submission are not presented as working
features. Tax rates are configuration, not a filing workflow.

## Verification

- `npm.cmd run test:unit -- tests/unit/inventory-products.test.ts`
- `npm.cmd run test:integration -- tests/integration/inventory-products.test.ts tests/integration/postgres-migrations.test.ts tests/integration/procurement-workflow.test.ts`
- `npm.cmd run test:contract -- tests/contract/openapi.test.ts`
- With an explicit local bootstrap test database and preview:
  `NEXORA_INVENTORY_E2E=true`, `PLAYWRIGHT_USE_EXISTING_WEB=true`,
  `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3213`, then
  `npm.cmd run test:e2e -- tests/e2e/inventory-products.spec.ts --max-failures=1`.

Browser tests use a disposable PostgreSQL database and real API/repository/policy
checks; only session restoration is synthetic. Screenshots are stored under
`tmp/inventory-products-evidence/` and `tmp/inventory-operations-evidence/`.
No sample products or warehouses are imported into the
active ERP database.
