# Nexora Prototype to Production Baseline Audit

- Date: 2026-10-06 PKT
- Scope: read-only audit and first-module recommendation; no application code changed
- Implementation authority: live `app/`, `contracts/`, `web/`, configuration, and tests
- Approved UX authority: live `prototype/app/` catalogue, profiles, shell, content, and module-specific screens
- Historical/reference-only sources: `Nexora-Prototype-Walkthrough.pdf`, dated status registers, closed segments, and prior evidence

## Executive finding

The repository is not a prototype-only codebase. It already has a production
foundation and several real domain slices: PostgreSQL, forced tenant RLS,
Security/RBAC, Workflow, Platform administration, Finance, Procurement,
Inventory, and a deep HR/Payroll implementation. The isolated `prototype/`
remains mock-only and should now be treated as the approved product/UX
specification, not as code to connect directly to production services.

The audit originally recommended **Finance & Accounting**. The product owner
superseded that sequencing decision on 2026-10-06 and explicitly approved HR &
Payroll as the active production-conversion module. The durable active design is
`docs/superpowers/specs/2026-10-06-hr-payroll-production-conversion-design.md`.

The original Finance recommendation was based on the following evidence:

1. its 22-screen prototype area is one of the three domain-specific matured
   profiles;
2. its real backend already owns the accounting-event ledger, posting,
   reversals, periods, budgets, recurring journals, consolidation, reports,
   PostgreSQL persistence, forced RLS, authorization, and audit controls;
3. its real frontend already has working journal, ledger, statement, reporting,
   and chart-of-accounts surfaces;
4. its remaining gaps are bounded and visible, so completion can be proved
   without inventing a new product or starting a broader module; and
5. downstream Banking, AR, AP, Sales, Procurement, Inventory, Assets, Payroll,
   and Revenue all depend on stable ledger/posting/reporting contracts.

This recommendation does **not** mark Finance complete. Under the owner's new
completion standard it is currently **PARTIAL**.

## Deterministic baseline findings

### BASE-AUDIT-F01 - prototype catalogue gate is red

The live prototype source contains **35 modules, 146 groups, and 792 pages**.
`prototype/README.md`, `prototype/PROTOTYPE-INVENTORY.md`, the September PDF,
and `prototype/tests/rendered-html.test.mjs` still encode older totals. The
prototype gate builds but fails 2 of 160 tests because the rendered/source
catalogue no longer matches the asserted 141-group/749-screen baseline.

Source that wins: live `prototype/app/prototype-data.ts` for the current UX
catalogue. The discrepancy must be reconciled before calling the approved
baseline frozen. The audit does not assume that all 43 added pages and five
added groups were intentional merely because they are committed.

### BASE-AUDIT-F02 - current-state documentation is stale

`docs/product/nexora-implementation-status.md` is dated 2026-08-18 and does not
include the later PostgreSQL Finance, Security, Workflow, Platform, and
HR/Payroll work. `Nexora-Prototype-Walkthrough.pdf` describes a 34-module,
502-screen prototype, while the live prototype has since added Fleet and
expanded HR/reporting. These documents remain useful historical evidence but
cannot drive production status.

Source that wins: live code, contract, migrations, current tests, and active
memory/handoff.

### BASE-AUDIT-F03 - Finance is labelled too broadly in live navigation

`web/src/components/shell/nav-config.ts` labels Finance & Accounting
`implemented`, but the approved prototype contains Finance capabilities that
the real product does not yet complete through UI -> API -> business logic ->
PostgreSQL -> audit/control -> UI. The label was valid for the earlier technical
baseline definition, but is not valid for the owner's new module-completion
definition.

Source that wins: the new owner instruction plus live behavior. Until the
22-screen parity matrix closes, Finance is `PARTIAL`.

## Current implementation map

| Area | Prototype baseline | Real system evidence | Audit status |
|---|---|---|---|
| Platform/Security/Workflow | Cross-cutting shell, admin, access, approval concepts | PostgreSQL production composition, forced RLS, RBAC, audit, workflow and admin APIs/UI exist | IMPLEMENTED foundation; product administration remains PARTIAL |
| Finance & Accounting | 22 domain-specific screens | 26 contract operations; PostgreSQL Finance verification passes; 12 focused frontend files / 30 tests pass | PARTIAL; first completion target |
| HR & Payroll | 67 dedicated screens across 11 groups | 115 contract operations; employee, attendance, leave, payroll, statutory and payment slices exist | PARTIAL at full-module scope; automated Payroll slice closed, owner browser acceptance/user changes remain |
| Banking & Treasury | 32 domain-specific screens | Finance bank account and legacy reconciliation domain exist; production PostgreSQL reconciliation persistence and normal banking API/UI are not complete | PARTIAL/NOT IMPLEMENTED by screen |
| Procurement | 26 prototype screens | 5 contract operations and a real requisition/PO/receipt/match core | PARTIAL |
| Inventory | 21 prototype screens | 5 contract operations and a real item/bin/receipt-ledger core | PARTIAL |
| Dashboard/Reports | 20 dashboard screens plus 208 report entries | Several live role/Finance/Procurement/Inventory views; many domains disclose missing sources | PARTIAL and dependent on source modules |
| Remaining business modules | Mostly generic or module-specific mock UX | No complete end-to-end production module | NOT IMPLEMENTED or PARTIAL where navigation explicitly says so |

## Finance 22-screen parity assessment

| Prototype screen group | Current real coverage | Status |
|---|---|---|
| Chart of Accounts Overview, Nominals, Section Management, Nominal Detail, Add Nominal | Real generated-client workspace, PostgreSQL accounts, controls and focused tests | IMPLEMENTED/PARTIAL - confirm exact approved UX parity and edit/deactivate policies |
| Journal Register, Manual Journal, Journal Detail, Approval & Posting, Reversal | Real APIs/UI/posting engine/reversal; permission and control tests exist | PARTIAL - approval workflow and all prototype actions/states require screen-level parity evidence |
| Recurring Journals | Templates and manual generation exist | PARTIAL - no governed scheduler/worker execution |
| Accounting Event Ledger | Backend/API exists | PARTIAL - no approved dedicated production screen parity |
| General Ledger | Real read UI/API exists | IMPLEMENTED/PARTIAL - prototype recursive/source-document drill parity is incomplete |
| Fiscal Periods | Period/configuration data and close/reopen commands exist | PARTIAL - no complete register/workbench flow |
| Period-close Workbench | Current UI accepts a period ID and close/reopen command | PARTIAL - checklist, reconciliations, exceptions and evidence pack are absent |
| FX Revaluation | Posting primitives exist | NOT IMPLEMENTED as an end-to-end prototype-equivalent workflow |
| Intercompany Transactions | Atomic backend service exists | PARTIAL - normal API/UI/configuration workflow absent |
| Consolidation Workbench | Consolidated report generation exists | PARTIAL - group/rule administration and full workbench flow absent |
| Trial Balance and Financial Statements | Live reports and pages exist | IMPLEMENTED/PARTIAL - classification granularity and print/export parity remain to verify |
| Finance Drill-down | GL drill-down exists | PARTIAL - approved multi-level source-document journey is not complete for all sources |
| Finance Audit Trail | Read API/global audit surface exists | PARTIAL - dedicated Finance UX/filter/export parity remains to verify |

## Why Finance must precede other business modules

Current vendor documentation converges on the same dependency shape:

- Microsoft requires each legal entity's ledger, chart of accounts, account
  structures, calendar, and currencies to be configured, and warns that ledger
  structure changes after posting can corrupt downstream reporting/close
  integrity. Checked 2026-10-06. [Microsoft Learn - Configure ledgers](https://learn.microsoft.com/en-us/dynamics365/finance/general-ledger/configure-ledger)
- SAP documents General Ledger as the integrated, current record receiving
  postings from AP, AR, procurement, assets, management accounting, and
  treasury. Version 2025 FPS01 (February 2026). [SAP - General Ledger Accounting](https://help.sap.com/docs/SAP_S4HANA_CLOUD/0fa84c9d9c634132b7c4abb9ffdd8f06/dc6a0c8a5b934aedaac8e2de3691626a-561.html)
- Oracle 26B describes detailed transactions being captured in subledgers and
  imported/posted to the ledger, with ledger configuration built from chart of
  accounts, calendar, currency, and accounting method. Published 2026.
  [Oracle Fusion Cloud Financials 26B](https://docs.oracle.com/en/cloud/saas/financials/26b/faigl/implementing-enterprise-structures-and-general-ledger.pdf)

Limitation: these are vendor-specific product documents, not a Nexora design
mandate. They corroborate the dependency order; the Nexora recommendation is
ultimately based on this repository's own architecture and implementation
evidence.

## Required pre-implementation slice

Before Finance application changes, run one bounded **FIN-PROD-00 baseline and
parity planning slice**:

1. Reconcile the prototype catalogue drift and freeze an approved manifest.
2. Produce a 22-screen Finance traceability matrix: prototype route/control ->
   real route -> API -> service -> PostgreSQL table/constraint/RLS -> audit event
   -> permission -> test.
3. Mark every screen/control `IMPLEMENTED`, `PARTIAL`, or `NOT IMPLEMENTED`.
4. Convert the gaps into small ordered work items; do not implement all 22
   screens in one pass.
5. Preserve the existing real Finance engine and the approved prototype UI;
   migrate reusable UI patterns deliberately instead of coupling `prototype/`
   to production code.
6. Re-run the prototype gate, Finance PostgreSQL tests, API drift check,
   focused Finance frontend tests, canonical backend gate, browser E2E and
   accessibility checks before closing any slice.

## Verification performed

| Check | Result |
|---|---|
| `python scripts/production_demo_environment.py verify` | PASS; PostgreSQL Demo, forced RLS and audit chain verified |
| `python scripts/verify_hr_ot_mon_history.py` | PASS; protected September fingerprint unchanged |
| `python scripts/verify_postgres_finance.py` | PASS; 7/7 PostgreSQL Finance tests |
| `npm.cmd run api:check-drift` in `web/` | PASS |
| Focused Finance Vitest run | PASS; 12 files / 30 tests |
| `npm.cmd test` in `prototype/` | FAIL; 158/160 pass, 2 catalogue-count assertions fail (146/792 live vs 141/749 expected) |

## Decision

- First production-completion module: **Finance & Accounting**.
- Current status: **PARTIAL**.
- Immediate next step: **FIN-PROD-00 baseline reconciliation and screen-level
  parity plan**, not implementation.
- Banking & Treasury should follow Finance because its approved UX is mature
  and its missing PostgreSQL reconciliation/API/UI work sits directly on the
  Finance foundation.
