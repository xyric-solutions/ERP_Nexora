# Nexora ERP Product Blueprint

- Owner: Xyric Solutions LLP
- Blueprint version: 3.0
- Last updated: 2026-08-20
- Current state: Part A drafted; owner-authorized S3.1 work is partial; the
  master 34-module navigation and responsive shell are implemented in the
  Demo and awaiting acceptance; Finance maturity wireframes remain pending
  approval
- Implementation gate: the owner waived the original no-coding/session gate on
  2026-08-18; further frontend redesign is paused until its wireframe batch is
  reviewed

## Purpose

This directory is the canonical functional-product layer for Nexora ERP. It defines what the product must do without representing planned capabilities as implemented software. Live code, contracts, configuration, migrations, and tests remain the authority for implementation status.

## Status vocabulary

Only these values may be used:

- `IMPLEMENTED` — source implementation and supporting test evidence exist.
- `PARTIAL` — a meaningful portion exists, but the documented business capability is not complete.
- `PLANNED` — approved product scope with no claim that it is available.
- `NOT STARTED` — neither implemented nor sufficiently planned for delivery.

## Session map

| Session | Deliverable | State |
|---|---|---|
| 0 | Repository discovery and current-state assessment | Complete |
| 1 | Master Functional Blueprint Part A — modules 01–11 | Complete; review required |
| 2 | Master Functional Blueprint Part B — modules 12–23 | Not started |
| 3 | Master Functional Blueprint Part C — modules 24–35 | Not started |
| 4 | Service, trading, and manufacturing workflows | Not started |
| 5 | Module and accounting integration matrices | Not started |
| 6 | Master data and reporting hierarchy | Not started |
| 7 | Compliance, NFR, migration, and cutover | Not started |
| 8 | Implementation status, Minimum Sellable ERP, and roadmap | Not started |
| ASCII wireframes | Module-maturity sequence | Accounting & Finance package ready for review; Operations deferred |
| Prototype | Professional prototype and navigation/transaction review | Awaiting approved wireframe batches |
| Implementation | Frontend, backend, schema, tests, demo update | Owner waiver applied; live status is evidence-based, and frontend redesign awaits wireframe approval |

## Deliverable register

| Document | Purpose | State |
|---|---|---|
| `nexora-master-functional-blueprint.md` | Canonical module and capability definition | Part A drafted |
| `nexora-service-company-workflows.md` | Service-company operating model | Session 4 |
| `nexora-production-company-workflows.md` | Trading/manufacturing operating models | Session 4 |
| `nexora-module-integration-matrix.md` | Cross-module inputs, outputs, ownership, events | Session 5 |
| `nexora-accounting-integration-matrix.md` | Approved business-to-accounting rules | Session 5 |
| `nexora-service-vs-production-matrix.md` | Applicability by company model | Session 5 |
| `nexora-master-data-dictionary.md` | Master-data definitions and ownership | Session 6 |
| `nexora-reporting-hierarchy.md` | Operational, financial, and executive reports | Session 6 |
| `nexora-compliance-pk-uae.md` | Pakistan/UAE localisation | Session 7 |
| `nexora-nfr.md` | Security, performance, reliability, accessibility | Session 7 |
| `nexora-migration-and-cutover.md` | Data migration and cutover controls | Session 7 |
| `nexora-implementation-status.md` | Evidence-backed capability status | Initialized |
| `nexora-main-menu-architecture.md` | Original 34-module navigation, maturity, route, and RBAC contract | Superseded by the approved expanded navigation contract |
| `nexora-main-menu-navigation.md` | NAV-02 expanded business-menu and ASCII-tree record | Historical; superseded by NAV-03 |
| `nexora-master-menu-responsive-sidebar.md` | Current master-menu metadata, status, company-type, responsive-sidebar and header contract | Implemented in Demo; acceptance required |
| `nexora-demo-action-matrix.md` | Action-level Demo truth register | Finance-first v1 ready for review |
| `nexora-open-questions.md` | Owner decisions and unresolved business rules | Initialized |
| `nexora-glossary.md` | Canonical business terminology | Initialized |
| `../wireframes/finance/README.md` | Accounting & Finance assessment, navigation, workflows, and six wireframe batches | Ready for owner review |
| `../wireframes/README.md` | Earlier 35-area coverage inventory | Retained as coverage reference; execution order superseded |

## Governance

1. Every capability uses a permanent `NEX-<MODULE>-<ENTITY>-<NNN>` identifier.
2. Financial transactions must flow through Accounting Event → Posting Engine → Journal → General Ledger → Reporting.
3. Posted financial records are corrected through controlled reversal or amendment, never deletion.
4. Business decisions that lack approved source material are recorded in `nexora-open-questions.md`.
5. No prototype is production functionality. No planned module may be presented as available.
6. Existing Finance, tenancy, authorization, audit, demo isolation, and contract-drift controls must be preserved.
