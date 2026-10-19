# Nexora - Finance Reporting Design (S2.3)

- Status: `active` (design), build `not started`
- Last updated: 2026-08-06
- Source: Stage 6 Finance Core Platform request, logged as `accepted-improvements.md` I-020
- Segment: `segments/S2.3-finance-reporting-analytics.md`
- Architecture: `architecture.md` C8, ADR-6

Design depth behind S2.3's compact segment spec. Everything here **reads**
from S2.2's posted journals/ledger and S2.2's budget/consolidation
structures — nothing here writes a journal entry or defines a posting rule;
that separation (`architecture.md` ADR-6: "separate analytics read models...
protects transaction performance") is deliberate, not an oversight.

## Business analysis

Finance reporting exists to answer "what happened" (Trial Balance, GL,
Journal Register), "what does it mean" (Balance Sheet, P&L, Cash Flow), "how
are we doing against plan" (Budget vs Actual), and "what does the whole
enterprise look like" (Consolidated Statements) — each reading from the
single posted-truth source in S2.2, never recomputing or duplicating
posting logic.

## Functional requirements by report

| Report | Requirement |
|---|---|
| Trial Balance | Sum of debit/credit balances per account, per period; must equal zero by construction (S2.2's FR-JE-1 guarantees this — the report fails loudly, as a finding not a silent display bug, if it ever doesn't). |
| General Ledger (query view) | Full transaction history per account with running balance, drillable to the originating `JournalLine` and, from there, to the originating `AccountingEvent`/business document (S2.1's `source_type`/`source_id`) — full audit chain from statement line to source document in 2 clicks. |
| Journal Register | Chronological list of all journal entries in a period, filterable by source module, status, and preparer/approver — the operational review surface for period-close. |
| Subsidiary Ledgers | Per-party (AR/AP) running balance, derived from `Party`-linked journal lines — the same GL data, filtered/grouped by party rather than account. |
| Balance Sheet | Assets = Liabilities + Equity, as of a point in time, built from account-type-tagged trial balance rows (FR-COA-2's immutable account type is what makes this classification reliable). |
| Profit & Loss | Revenue - Expense over a period range, same account-type-tagged source. |
| Cash Flow Statement | Derived from the same ledger via account-tag-based classification (operating/investing/financing) — v1 uses the indirect method (starts from net income, adjusts for non-cash items), which needs no new data beyond what's already posted. |
| Budget vs Actual | Joins S2.2's approved `Budget` (FR-BUD-1) against actual posted amounts for the same account/dimension/period; variance and variance % are computed, never stored (always fresh against the latest actuals). |
| Consolidated Statements | Applies S2.2's consolidation group and elimination rules (FR-CON-1/2) at generation time to produce a combined Balance Sheet/P&L across the group, with intercompany balances eliminated — never a permanent write to any subsidiary's books. |
| Dimension-based reporting | Any of the above sliceable by cost center, profit center, department, project, or fund — using the same dimension tags captured at posting time (S2.2 FR-COA-3), not a separate tagging pass at report time. |
| Drill-down | Every summary number (a Balance Sheet line, a KPI widget) is clickable to its contributing GL rows, then to the source journal, then to the source business document — the same three-hop chain regardless of which report you started from. |

## Non-functional requirements

Reuses the already-locked NFRs: 95% of dashboards load within 5 seconds;
critical KPI freshness ≤5 minutes (`segments/S2.3-finance-reporting-analytics.md`).
Heavy reports (consolidation, full-year GL export) queue asynchronously with
status/failure visibility — already locked, restated here as the reason
Trial Balance/Balance Sheet/P&L (fast, single-entity) are synchronous while
Consolidated Statements (multi-entity, elimination logic) are async by
default.

## Database / read-model design

Read models (`AnalyticsSnapshot`, `architecture.md` C8) are separate from
the OLTP posting tables — populated by projecting from `JournalLine`/`GL`
on a freshness cadence matching the ≤5-minute KPI target, not queried
live against the transactional tables. Consolidated views additionally
project from S2.2's consolidation-group/elimination-rule tables.

## API contracts

| Route | Notes |
|---|---|
| `GET /api/v1/finance/reports/trial-balance` | Filterable by company, period, dimension |
| `GET /api/v1/finance/reports/balance-sheet` , `/profit-loss`, `/cash-flow` | As-of / period-range params |
| `GET /api/v1/finance/reports/budget-vs-actual` | Requires an approved budget to exist for the requested scope |
| `GET /api/v1/finance/reports/consolidated` | Async — returns a job id per the existing "accepted job id under 300ms" NFR pattern already locked for long-running work |
| `GET /api/v1/finance/gl/{account_id}/drilldown` | Returns the transaction chain: GL row → journal → source event → source document |

## Security model / permissions

Dashboards and reports only show metrics the requesting role is authorized
for (already locked NFR: "Dashboards only show authorized metrics and drill
down to source records") — enforced by the same field/record-scope model as
S1.2, applied to report output rather than a separate reporting-specific
permission engine.

## Error handling

Canonical shape reused. `FINANCE_REPORT_NO_APPROVED_BUDGET` (Budget vs Actual
requested with no approved budget in scope), `FINANCE_REPORT_UNBALANCED`
(a Trial Balance ever failing to net to zero is surfaced as a data-integrity
finding, not swallowed).

## Testing strategy

Reuses `verification-matrix.md`'s levels (S2.3's locked verify command:
unit, integration, e2e, performance, a11y). Accounting-specific cases:
Trial Balance nets to zero on seeded data, Balance Sheet equation holds,
drill-down chain resolves end-to-end from statement line to source document,
consolidation elimination zeroes out a seeded intercompany balance, budget
variance recomputes correctly after an actuals-affecting reversal.

## Cross-reference: Audit Trail

Audit Trail (Stage 6 module 20) is not a separate S2.3 build item — every
number on every report here is already backed by S1.2's hash-chained
`AuditEvent` trail and S2.1/S2.2's source-document traceability. S2.3 adds
a **report-of-the-audit-trail** view (filterable `AuditEvent` list scoped to
finance actions) rather than a second audit mechanism.
