# Nexora - Business Intelligence & Advanced Analytics Design (extends S2.3/C8)

- Status: `active` (design), build `not started`
- Last updated: 2026-08-06
- Source: Stage 8 Enterprise Intelligence Layer request, logged as `accepted-improvements.md` I-022
- Segment: `segments/S2.3-finance-reporting-analytics.md` (extended to cross-module analytics)
- Per-module reports already speced in Stage 7's design docs (`docs/business/*`) are referenced, not repeated.

`architecture.md` C8 was always described generically ("dashboards, KPIs,
drill-down reports... analytics read models"), not finance-only — S2.3 is
the *segment* that builds it first, scoped to finance. This document extends
the same `AnalyticsSnapshot`/`ReportDefinition` read-model pattern to every
other module's analytics, rather than inventing a second BI architecture.

## KPI framework

A `KpiDefinition` (new entity, owned by C8) — `id, tenant_id, module,
formula_ref, target, unit, refresh_cadence` — sits on top of
`AnalyticsSnapshot` exactly like `ReportDefinition` does. KPIs are
role-scoped (an HR KPI isn't visible to a warehouse role) using the same
field/record permission model as every other read, not a separate
dashboard-permission system.

## Dashboards

| Dashboard | Source data | Notes |
|---|---|---|
| Executive | Cross-module KPI rollup (revenue, cash position, order backlog, headcount) | Only shows metrics the executive role is authorized for — reuses S1.2 scope, not a privileged bypass. |
| Financial | S2.3 (already locked: TB, BS, P&L, Cash Flow, Budget vs Actual) | No change from `docs/finance/finance-reporting-design.md`. |
| Operational | Cross-module exception queues (open PO aging, three-way-match exceptions, overdue approvals) | Aggregates the "exception" reports already named per-module in Stage 7's docs. |
| Inventory Analytics | `docs/business/procurement-inventory-design.md`'s Inventory reports (stock on hand, valuation, cycle-count variance, slow-moving) | Same data, dashboard presentation layer only. |
| Procurement Analytics | Same doc's Procurement reports (PO aging, match exceptions, vendor spend) | — |
| Sales Analytics | `docs/business/sales-hr-projects-design.md`'s Sales reports (pipeline, conversion rate, sales by customer/item) | — |
| HR Analytics | Same doc's HR reports (payroll summary, headcount/cost, attendance exceptions) | — |
| Manufacturing Analytics | `docs/business/manufacturing-vertical-design.md`'s reports (work order status, material variance, quality disposition) | — |
| Project Analytics | Sales/HR/Projects doc's Project reports (budget vs actual, resource utilization) | — |

None of these introduce new source data — every dashboard above is a
presentation layer over reports already designed per-module in Stage 7.

## Advanced analytics techniques

| Technique | Implementation |
|---|---|
| Trend Analysis | Time-series query over `AnalyticsSnapshot` history — no new storage, just a query pattern. |
| Variance Analysis | Already exists as Budget vs Actual (S2.2/S2.3, I-020) — extended to any planned-vs-actual pair (forecast vs actual demand, planned vs actual project cost), same computation pattern. |
| Root Cause Analysis | An `AiSuggestion` (`report_draft` type, `docs/ai/ai-platform-design.md`) that narrates likely contributing factors behind a flagged variance/anomaly — always shown as a suggested explanation with source references, never presented as a definitive cause. |
| Predictive Analytics / Forecasting | The `forecast` `AiSuggestion` type — demand, cash flow, budget forecasts all reuse this one type (already listed in the AI capabilities table). |
| What-if Analysis / Scenario Planning | A read-only simulation against the budget/forecast data model — computes a hypothetical result, never writes a record; explicitly out of the same "AI never performs an action without approval" boundary because it doesn't act at all, it only computes. |
| Benchmarking | Cross-tenant anonymized/aggregated comparison — explicitly **not** in v1 scope without a separate data-sharing consent decision (comparing one tenant's data against another's requires a privacy/consent architecture this session hasn't scoped) — flagged as a real open decision, not silently built. |
| Data Mining / Anomaly Detection | The `anomaly` `AiSuggestion` type, already covering fraud/risk (AI platform doc) — pattern-detection over any module's transaction stream, one mechanism, many consumers. |

## Non-functional requirements

Reuses S2.3's locked NFRs (95% dashboard loads ≤5s, KPI freshness ≤5min)
applied to every dashboard above, not just Financial. Heavy cross-module
rollups (Executive dashboard) follow the same async-queue pattern as
Consolidated Statements (`docs/finance/finance-reporting-design.md`) when
the underlying data volume warrants it.

## Testing strategy

Reuses `verification-matrix.md`'s levels. Cases: KPI role-scoping (a role
without HR read access never sees HR KPIs on the Executive dashboard),
variance computation correctness, what-if simulation never persists a
record, benchmarking feature is confirmed absent/disabled by default (not
accidentally shipped without the consent architecture it needs).
