# Nexora - Manufacturing and Vertical Module Design (S3.3)

- Status: `active` (design), build `not started`
- Last updated: 2026-08-06
- Source: Stage 7 Enterprise Business Modules request, logged as `accepted-improvements.md` I-021
- Segment: `segments/S3.3-manufacturing-vertical-framework.md`
- UI: `docs/ux-layouts-and-pages.md` (Manufacturing pages already speced)

Integration points reused, not repeated per module: RBAC/audit (S1.2),
approvals (S1.3), accounting impact via `AccountingEvent` (S2.1/S2.2),
notifications/attachments (S4.1), AI suggestions (S4.2). S3.3 is explicitly
**framework-depth** (per the Stage 3 review) — proves the module-isolation
pattern rather than delivering deep vertical functionality; this design
matches that stated ambition rather than inflating it.

## Manufacturing (MRP) — work order skeleton

| Aspect | Design |
|---|---|
| Scope | BOM/recipe (versioned), material reservation, consumption, output, quality disposition, costing hooks — a work-order **skeleton**, not full MRP-II scheduling/capacity-planning (explicitly deferred, per S3.3's own locked language: "deep vertical feature sets after phase gates"). |
| Business rules | A BOM revision doesn't retroactively change an already-released work order (the work order snapshots its BOM version at release, same immutability pattern as S2.2's posted-entry rule). |
| Edge cases | Material shortage at consumption blocks output recording until reserved/received, rather than allowing negative-implied stock. |
| Schema | `WorkOrder(id, tenant_id, bom_id, bom_version, status)`, `BOMLine` (versioned), material/output movements post through S3.1's `StockLedgerEntry`, not a parallel stock model. |
| API | `/api/v1/manufacturing/work-orders`, `/boms`. |
| Accounting integration | Completed work order emits `AccountingEvent` (`manufacturing.wo.completed`) consumed by S2.2 for WIP/finished-goods costing postings. |
| AI opportunities | Material-shortage forecasting, yield-anomaly detection on output vs. BOM expectation. |
| Reports | Work order status/aging, material variance (planned vs. consumed), quality disposition summary. |
| NFR | Already locked: 95% of seeded work orders show material/quality/costing traceability. |

## Quality Management (disposition, within the work-order skeleton)

Quality disposition (pass/fail/rework/scrap) is recorded per work-order
output batch/lot, feeding the same `StockLedgerEntry` tracking-mode pattern
already used by Inventory (S3.1) — not a separate quality-management data
model. Deep quality frameworks (SPC, CAPA workflows, supplier quality
scorecards) are out of this skeleton's scope, consistent with S3.3's stated
framework-not-depth ambition.

## Vertical module framework (proves isolation, not a business module itself)

| Aspect | Design |
|---|---|
| Purpose | Lets a starter module configuration (roles/forms/workflows/reports/permissions/hooks) install without forking the core schema — already the locked acceptance criterion ("at least 3 starter module configurations install without core schema fork"). |
| Mechanism | A module manifest declares its entities (via the same owned-by-one-component pattern as every other entity in `architecture.md`), its permission set (S1.2-compatible), its workflow hooks (S1.3-compatible), and its accounting events (S2.1-compatible) — it does not get a private authorization or posting mechanism. |
| Business rules | Module disable/upgrade preserves historical transactions and audit records (already locked). |
| Testing | Install/enable/disable/upgrade of a starter configuration, verified to leave zero orphaned audit or accounting records. |

## Future vertical modules (placeholders only — per your 2026-08-06 decision, not designed now)

None of the five below exist in `vision.md`'s 14 capabilities, the locked
PRD, or any of the 13 segments. They are not scoped, not estimated, and not
part of v1. Each would install through the vertical module framework above
if and when a future Vision/PRD amendment adds it as a real capability.

| Module | One-line future purpose |
|---|---|
| Service Management | Field-service/service-ticket workflows on top of the shared `Party`/`BusinessDocument` pattern. |
| Maintenance Management | Asset-maintenance scheduling — would depend on Fixed Assets, itself still out of v1 scope. |
| Fleet Management | Vehicle/asset tracking and maintenance — same Fixed Assets dependency. |
| POS | Point-of-sale front-end over the existing Sales/Inventory core, likely the first candidate to actually need offline-tolerant mobile capture (already a general NFR default in `vision.md`). |
| E-Commerce Integration | Storefront-to-Sales-Order connector — would be a consumer of S4.1's integration platform once that segment exists. |

## Security model

Reuses S1.2's model. Representative permissions: `manufacturing.wo.release`,
`manufacturing.wo.complete`, `manufacturing.quality.disposition`,
`platform.module.install` (vertical-framework install/enable/disable,
privileged, tenant-admin scope only).

## Testing strategy

Reuses `verification-matrix.md`'s levels, matching S3.3's locked verify
command (`test:unit && test:integration && test:e2e && test:migration`).
Domain-specific cases: BOM-version immutability on already-released work
orders, material-shortage block, module install/disable preserves audit
history, zero core-schema fork across 3 starter module installs.
