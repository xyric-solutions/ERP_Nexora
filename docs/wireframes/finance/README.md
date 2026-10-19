# Nexora ERP — Accounting & Finance Maturity Review

- Status: `READY FOR FUNCTIONAL REVIEW — NO CODE CHANGED`
- Active module: Accounting & Finance
- Next module: Operations, only after Accounting & Finance is approved
- Company context: Nexora Demo Company
- Governing prompt: 2026-08-18 Demo Account visibility and ASCII-wireframe prompt

## Direction

This package replaces the earlier breadth-first wireframe sequence. Nexora will
now mature one module completely before moving to the next:

```text
ACCOUNTING & FINANCE
  → current-state assessment
  → business navigation
  → action visibility matrix
  → transaction workflows
  → desktop/mobile ASCII screens
  → owner approval

OPERATIONS
  → begins only after Finance approval
```

The current frontend and Finance backend are preserved. These files are the
required assessment/wireframe gate; no frontend, backend, API, database, test,
seed, or Demo runtime code is changed.

## Supplied-picture analysis

The supplied reference image is used for **visual hierarchy and information
density**, not copied branding or content.

Observed qualities to carry into Nexora Finance:

- dark, compact, persistent module navigation with clear expandable groups;
- bright neutral working canvas with minimal decoration;
- concise welcome/module header and a visible freshness indicator;
- four compact KPI cards in the first row, each combining a headline number
  with trend/context rather than a title-only card;
- a dominant analytical chart, a smaller comparison chart, and a compact
  gauge/health card in the second row;
- recent activity and upcoming deadlines/control tasks in the bottom row;
- dense but readable borders, short labels, tabular numbers, and small status
  accents;
- responsive priority: KPIs first, exceptions second, charts third, activity
  and deadlines afterward.

Nexora-specific corrections:

- the left navigation expands **Accounting & Finance** into business groups,
  not a flat list of 18 links;
- every KPI displays source/freshness and drills into a real report;
- `IMPLEMENTED`, `COMING SOON`, and `NOT AVAILABLE` are textual, never only a
  color or tooltip;
- no chart, gauge, activity, or deadline value is hardcoded;
- the Demo warning remains persistent and visually separate from production.

## Package contents

| Document | Purpose |
|---|---|
| `current-demo-assessment.md` | Required current navigation/action assessment and recommendations |
| `navigation-and-workflows.md` | Mature Finance business hierarchy and functional workflow wireframes |
| `../../product/nexora-demo-action-matrix.md` | Mandatory evidence-backed Demo action register, Finance-first scope |
| `FIN-WF-01-dashboard-and-navigation.md` | Finance dashboard and KPI drill-down |
| `FIN-WF-02-chart-of-accounts.md` | Chart, account detail/create, nominal selection |
| `FIN-WF-03-journals.md` | Register, new journal, detail, approval, reversal |
| `FIN-WF-04-ledger-and-statements.md` | GL, TB, P&L, Balance Sheet, Cash Flow, drill-down |
| `FIN-WF-05-planning-close-recurring.md` | Budget, variance, periods, close, recurring journals |
| `FIN-WF-06-controls-consolidation-audit.md` | Accounting Events, intercompany, consolidation, audit, report catalogue |

## Current evidence snapshot

Read-only Demo verification on 2026-08-18 confirms:

- 52 Chart of Accounts records, including 27 nominal/postable accounts;
- 17 journals, all balanced;
- 12 financial periods;
- 3 approved budgets and 3 Budget-vs-Actual rows;
- 1 recurring-journal template;
- 2 bank accounts and 2 tax rules;
- 2 Accounting Events and 67 audit events;
- Trial Balance and Balance Sheet variance `0`;
- Cash Flow reconciliation, Accounting Event trace, audit chain, and
  procurement-to-ledger trace verified.

## Review gate

The owner reviews Accounting & Finance as one mature module and records:

- `APPROVED`;
- `APPROVED WITH CHANGES`; or
- `REJECTED`.

No Operations wireframe or Finance UI implementation begins automatically.
