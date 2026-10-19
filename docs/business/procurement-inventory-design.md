# Nexora - Procurement and Inventory Business Design (S3.1)

- Status: `active` (design), build `not started`
- Last updated: 2026-08-06
- Source: Stage 7 Enterprise Business Modules request, logged as `accepted-improvements.md` I-021
- Segment: `segments/S3.1-procurement-inventory-core.md`
- UI: `docs/ux-layouts-and-pages.md` (Procurement, Inventory pages already speced there — not repeated here)

Every module below integrates with Platform Core and Finance Core exactly as
already built/designed — none of that is repeated per-module: **RBAC/audit**
reuses S1.2's exact-permission model, **approvals** reuse S1.3's workflow
engine, **accounting impact** posts through S2.1's `AccountingEvent` (never
direct ledger writes), **notifications** and **file attachments** are S4.1
(not built yet, cross-referenced not duplicated), **AI suggestions** follow
S4.2's governance model (type/confidence/source/mandatory human approval).

## Master Data (cross-cutting, not a separate module)

`Party` (vendor/customer/employee shared master), `Item` (SKU/tracking-mode/
valuation-method), and `BusinessDocument` (shared header for procurement,
sales, HR-claim, project, and vertical documents) are already defined in
`architecture.md`'s data model, owned by C6. This design treats them as
already-scoped, not a new module — Vendor Management below is the
vendor-type view of `Party`; Inventory below is the primary owner of `Item`.

## Vendor Management (`Party`, type=vendor)

| Aspect | Design |
|---|---|
| Business rules | Vendor status (`active`/`inactive`/`blacklisted`); inactive/blacklisted vendors block new POs at validation, not just at UI level (already S3.1's locked acceptance criterion: "Exceptions block inactive vendors"). |
| Edge cases | Duplicate vendor detection (tax_id + name fuzzy match) surfaces as an `AiSuggestion` (S4.2) for a human to confirm-or-reject merge — never auto-merged. |
| Schema | `Party(id, tenant_id, type=vendor, code, name, tax_id, status, risk_status)` — already locked in `architecture.md`. |
| API | `POST/GET /api/v1/procurement/vendors`, `PATCH .../vendors/{id}/status` (status change is a controlled action, audited). |
| Reports | Vendor spend summary, on-time delivery rate, open PO count — feed the Procurement dashboard, not a separate reporting mechanism. |

## Procurement (Requisition -> RFQ -> PO -> Receipt -> Match)

| Aspect | Design |
|---|---|
| Workflow | Requisition -> (optional RFQ) -> PO -> Receipt -> three-way match (PO/Receipt/Invoice) -> approved for payment. Approval thresholds and routing reuse S1.3's workflow engine — no second approval mechanism. |
| Business rules | PO cannot exceed requisition budget without an explicit over-budget approval step; three-way match tolerance (qty/price %) is tenant-configurable, mismatches beyond tolerance block auto-match and require manual review. |
| Edge cases | Partial receipts (multiple deliveries against one PO line) accumulate against the line's ordered qty; over-receipt beyond tolerance is blocked, not silently accepted. |
| Schema | `BusinessDocument(module=procurement, document_type=requisition\|rfq\|po\|receipt, ...)`, line items reference `Item` and `Party` (vendor). |
| API | `/api/v1/procurement/requisitions`, `/purchase-orders`, `/receipts`, `/invoice-matches` — all commands idempotent per the locked convention. |
| Accounting integration | Approved receipt emits an `AccountingEvent` (`procurement.receipt.posted`) consumed by S2.2 to post inventory-received/AP-accrual entries — procurement never posts a journal directly. |
| AI opportunities | OCR on vendor invoices for auto-extraction (S4.2's OCR suggestion type), anomaly detection on price variance vs. historical PO prices, smart reorder-point recommendations. All surface as `AiSuggestion` requiring explicit approval, never auto-applied. |
| Reports | Open PO aging, three-way-match exception queue, vendor spend by category, budget-vs-committed-spend. |

## Inventory Management (`Item`, `StockLedgerEntry`)

| Aspect | Design |
|---|---|
| Business rules | `StockLedgerEntry` is append-only immutable (already locked: "No destructive stock correction after approval"); every stock movement (receipt, issue, transfer, adjustment) is a new ledger row, never an edit to a prior one. |
| Tracking modes | none / batch / serial / lot-with-expiry, per `Item.tracking_mode` (already locked). Expired-lot movements are blocked at validation, not just flagged. |
| Valuation | FIFO or weighted-average per `Item.valuation_method` (tenant/item-configurable) — LIFO intentionally excluded (disallowed under IFRS, and this product explicitly supports IFRS *and* GAAP markets, so the common-denominator set is used rather than a GAAP-only method). |
| Edge cases | Negative-stock prevention is the default; a tenant may explicitly enable negative-stock (e.g. for drop-ship models) as a documented policy exception, never a silent default. |
| Schema | `StockLedgerEntry(id, tenant_id, warehouse_id, item_id, lot_id, serial_id, qty_delta, value_delta, source_ref)` — already locked. |
| API | `/api/v1/inventory/items`, `/stock-movements` (POST only — the ledger is append-only, there is no PATCH), `/cycle-counts`. |
| Accounting integration | Every posted stock movement emits an `AccountingEvent` consumed by S2.2 for inventory valuation postings. |
| AI opportunities | Demand forecasting for reorder points, anomaly detection on cycle-count variance (>threshold surfaces for review, never auto-adjusts stock). |
| Reports | Stock on hand by warehouse/item/lot, valuation report, cycle-count variance, slow-moving/dead-stock analysis. |
| NFR | Already locked: inventory accuracy >= 98% in seeded cycle-count scenarios; 95% scan actions under 2 seconds. |

## Warehouse Management (locations within `Item`/`StockLedgerEntry`'s `warehouse_id`)

| Aspect | Design |
|---|---|
| Business rules | Bin/location hierarchy per warehouse; putaway and pick suggestions are deterministic (nearest-bin, FIFO-lot-first), not AI-driven for the core path — AI layers on top as an optimization suggestion, not the base mechanism (keeps the core path testable and predictable). |
| Edge cases | Wrong-bin scans are blocked at validation (already locked: "Exceptions block... wrong bins"). |
| Schema | Warehouse is an `OrganizationUnit` (S1.3, C3) of type `warehouse`; bins are a warehouse-scoped sub-entity owned by C6. |
| API | `/api/v1/inventory/warehouses/{id}/bins`, `/putaway-tasks`, `/pick-tasks`. |
| Reports | Bin utilization, pick/putaway cycle time, mis-pick rate. |

## Security model

All writes above use S1.2's exact-permission model — representative
permissions: `procurement.requisition.create`, `procurement.po.approve`,
`inventory.stock.adjust`, `inventory.cycle_count.approve`. No new
authorization mechanism is introduced anywhere in this document.

## Testing strategy

Reuses `verification-matrix.md`'s levels, matching S3.1's locked verify
command (`test:unit && test:integration && test:e2e && test:performance &&
test:a11y`). Domain-specific cases: three-way-match tolerance boundary,
over-receipt rejection, expired-lot movement rejection, negative-stock policy
toggle, FIFO/weighted-average valuation correctness on seeded transaction
sequences.
