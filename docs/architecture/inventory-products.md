# Inventory product catalog

Inventory exposes **Products**, **Stock Transfer** and **Warehouse**. The Products work page supports grid/list
views, bounded search, type/status/category filters, continuation pagination and
Add New. Existing item/create/detail URLs resolve to the corresponding product
pages. The Warehouse and Stock Transfer work pages have search, pagination,
Add New and populated creation/edit forms. Other stock prototypes remain hidden.

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
