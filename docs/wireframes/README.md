# Nexora ERP — Complete ASCII Wireframe Exercise

- Status: `SUPERSEDED AS AN EXECUTION ORDER — RETAINED AS COVERAGE REFERENCE`
- Scope owner: Product Owner
- Started: 2026-08-18
- Current batch: `FIN-WF-01..06 — Accounting & Finance maturity review`
- Implementation effect: none; these files are design specifications, not proof
  that a screen or module is implemented

## Scope decision

> Direction correction, 2026-08-18: the 35-area inventory remains useful as a
> completeness register, but the breadth-first `WF-01 → WF-88` execution order
> is no longer active. Work now proceeds **one mature module at a time**:
> Accounting & Finance first, Operations second only after Finance approval,
> and other modules afterward. The active source is `finance/README.md`.

The ASCII-wireframe exercise covers the **complete Nexora ERP**, not only the
currently implemented Demo Company functions. Coverage includes:

- all 35 functional areas in the Master Product Blueprint;
- shared sign-in, company context, navigation, search, approvals, notifications,
  audit, and AI-governance surfaces;
- service-company, trading-company, and manufacturing-company journeys;
- desktop, tablet, mobile, loading, empty, error, permission-denied, and Demo
  environment states;
- the full trace from business transaction to Accounting Event, Journal,
  General Ledger, report, drill-down, and audit evidence.

Planned screens are wireframed honestly and labelled `PLANNED / COMING SOON`.
Their presence here does not create fake functionality in the Demo Company.

## Source authority for this lane

When sources differ, apply this order:

1. The user's 2026-08-18 instruction determines the total wireframe scope.
2. The Master Product Blueprint v3.0 attachment determines the 35-area catalogue,
   business navigation depth, required journeys, approval behavior, and
   accounting trace.
3. Live code, contracts, tests, and
   `docs/product/nexora-implementation-status.md` determine whether a proposed
   screen is implemented, partial, or planned.
4. Locked `vision.md`, `prd.md`, `architecture.md`, and `_shared-canon.md`
   constrain tenancy, authorization, audit, accounting, and integration design.
5. `docs/design-system.md`, `docs/component-library.md`, and
   `docs/ux-layouts-and-pages.md` determine presentation and responsive patterns.

Wireframes may propose unresolved product behavior, but they must reference an
open question rather than silently decide accounting, tax, security, or
commercial policy.

## Deliverables

| File | Purpose |
|---|---|
| `screen-inventory.md` | Permanent screen IDs, all 35 modules, and the complete batch queue |
| `pattern-library.md` | Shared desktop/mobile shells and reusable ERP screen patterns |
| `coverage-matrix.md` | Cross-check of modules, roles, company types, journeys, and required states |
| `batches/WF-01-entry-and-command-centre.md` | First five-screen ASCII wireframe review batch |

## Method and review gates

Every production batch contains 2–6 related screens and follows:

1. Purpose and user problem.
2. Information architecture and navigation.
3. Desktop ASCII wireframe.
4. Mobile ASCII wireframe or responsive transformation.
5. Primary/secondary actions and transaction lifecycle.
6. Permission, maker-checker, SoD, accounting, and audit implications.
7. Loading, empty, error, stale, offline, and permission-denied states.
8. Accessibility and self-QA.

Each batch ends in one of these owner decisions:

- `APPROVED` — may become the input to higher-fidelity prototype work.
- `APPROVED WITH CHANGES` — revise the listed items before prototyping.
- `REJECTED` — return to information architecture.
- `PENDING REVIEW` — default; no prototype implication.

The current Next.js frontend is implementation evidence, not the approved
design source. No further UI implementation should be inferred from this lane
until the corresponding wireframe batch is approved.

## Status vocabulary

| Label | Meaning in a wireframe |
|---|---|
| `IMPLEMENTED` | Supported by live code/contracts/tests; layout may still be unapproved |
| `PARTIAL` | Some real behavior exists, but the complete screen workflow does not |
| `PLANNED` | Product-design scope only; show `Coming Soon` in the live Demo Company |
| `OPEN` | A product/accounting/security decision is unresolved |

## Review order

Review `WF-01` first. Once its shell, density, navigation, and responsive rules
are accepted, those patterns become the baseline for the remaining batches in
`screen-inventory.md`; this avoids drawing hundreds of inconsistent screens and
then discovering that the shared shell was wrong.
