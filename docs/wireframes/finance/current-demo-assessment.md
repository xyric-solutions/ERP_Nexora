# Accounting & Finance — Current Demo Assessment

- Assessment date: 2026-08-18
- Runtime assessed: Nexora Demo Company
- Scope: Accounting & Finance only
- Decision state: `READY FOR OWNER REVIEW — NO APPLICATION CODE CHANGED`

## Executive assessment

Nexora already has a credible double-entry Finance foundation and live core
statements. It does **not** yet present Accounting & Finance as one mature ERP
module. The current Demo exposes eighteen Finance destinations in one flat
navigation group, mixes business labels with implementation-state labels, and
leaves several backend capabilities without a usable frontend workflow.

The supplied dashboard image is a useful density and hierarchy reference:
compact dark navigation, a bright working canvas, a four-KPI opening row, one
dominant analytical chart, smaller comparison/health visuals, then activity and
deadlines. Nexora should adopt that information hierarchy while keeping its own
brand, Demo warning, accounting terminology, permissions, and real data.

The next implementation should mature Finance in this order:

```text
Business navigation
  -> controlled master data
  -> journal lifecycle
  -> ledger and financial statements
  -> planning and close
  -> controls, consolidation, and audit
  -> owner acceptance
  -> Operations assessment begins
```

## 1. Current Demo navigation assessment

Current Finance navigation is a single expanded list:

```text
Finance
|- Finance Dashboard                  live
|- Chart of Accounts                  live
|- Journal Register                   live
|- Recurring Journals                 live
|- Period Closing                     live
|- General Ledger                     live
|- Trial Balance                      live
|- Profit & Loss                      live
|- Balance Sheet                      live
|- Cash Flow                          live
|- Budget vs Actual                   live
|- Consolidation                      live label; no seeded Demo group
|- Budgets                            structural shell
|- Tax                                structural shell
|- Cash & Bank                        structural shell
|- Accounts Receivable                coming soon
|- Accounts Payable                   coming soon
`- Fixed Assets                       coming soon
```

Strengths:

- all implemented financial statements are reachable;
- core Finance routes use the real Nexora shell and backend;
- the Demo Company warning is persistent;
- route visibility is permission-aware;
- future subledgers are not falsely presented as implemented.

Material weaknesses:

| ID | Finding | User impact | Required correction |
|---|---|---|---|
| FNA-01 | Eighteen flat links do not express business hierarchy. | Users scan a long technical menu instead of following accounting work. | Group Finance into Overview, Accounts & Ledgers, Journals, Planning & Close, Financial Reports, and Controls & Audit. |
| FNA-02 | Structural destinations display the word `shell`. | Internal implementation language appears in a commercial Demo. | Use the business name and a professional `Coming Soon` page. |
| FNA-03 | Company and period selection require internal IDs. | Reviewers must know database identifiers and can enter invalid values. | Add controlled company/period selectors sourced from real master data. |
| FNA-04 | New Journal creates and posts atomically. | There is no normal draft, submission, approval, rejection, or controlled posting journey. | Separate Save Draft, Submit, Approve/Reject, and Post according to permission and policy. |
| FNA-05 | Journal rows are available from the API but the register only shows a line count. | A reviewer cannot inspect a journal as a complete accounting document. | Add a journal-detail route with header, lines, totals, history, source, and audit. |
| FNA-06 | Recurring generation says it creates a draft, but that draft cannot be opened and posted from the register. | The visible workflow ends before processing. | Link generated drafts to journal detail and expose an authorized Post action. |
| FNA-07 | Accounting Events, finance audit, and report definitions have APIs but no Finance pages. | The transaction-to-ledger-to-report trace is hidden. | Expose permission-controlled read views and drill-downs. |
| FNA-08 | Consolidation is labelled live although the Demo has no seeded consolidation group. | The visible action cannot complete in the supplied Demo Company. | Mark it `NOT AVAILABLE` until a valid group exists; do not seed a fake multi-company group. |
| FNA-09 | Finance dashboard lacks the reference image's activity, deadline, exception, and control density. | It reads as a report summary rather than a Finance command centre. | Add real-data activity, close deadlines, exceptions, and approval work queues. |
| FNA-10 | Route labels and runtime availability are not governed by one status source. | A feature can appear live in navigation while its happy path is unavailable. | Generate navigation badges and action visibility from the capability/action register. |

## 2. Current Demo action visibility assessment

| Area | Visible now | Action quality | Assessment |
|---|---|---|---|
| Finance Dashboard | KPIs, charts, report links | Real report data and drill-down entry points | Useful foundation; needs work queues, freshness, exceptions, and close deadlines. |
| Chart of Accounts | Tree, create, account detail, GL link | Real master-data writes and reads | Implemented, but create/edit fields do not yet cover the full requested business model. |
| Journal Register | Status/period filters, new journal, reversal | Real posting and reversal | Accounting-safe but too compressed; document lifecycle and detail are missing. |
| Recurring Journals | List, create template, generate draft | Real template and generation calls | Incomplete user journey because generated draft cannot be processed from the UI. |
| Period Closing | Close and reopen | Real protected actions | Implemented; period selection is an internal-ID field and close readiness is not shown. |
| Statements | GL, TB, P&L, BS, CF, BvA | Real report queries and drill-down | Strongest current surface; needs consistent report header, filters, export status, and source trace. |
| Consolidation | Run/report-job panel | Real API requires an existing group | Not usable in the current one-company Demo; must say `NOT AVAILABLE`. |
| Budgets, Tax, Cash & Bank | Navigation destinations | Structural content only | Must say `COMING SOON`; seeded records are not equivalent to managed workflows. |
| AR, AP, Fixed Assets | Navigation destinations | No functional subledger | Correctly future scope; keep `COMING SOON`. |

Action visibility must be evaluated at button level, not only page level. A
viewer may open a posted journal without seeing Reverse; an accountant may
draft and submit without seeing Approve; a finance manager may approve but
must not approve their own transaction where segregation-of-duties rules deny
it. Disabled actions require a reason; unavailable actions must not masquerade
as enabled controls.

## 3. Implemented functions

The following functions have live frontend, API, persistence, and permission
paths in the current scope:

- Finance dashboard metrics and report drill-down entry points;
- Chart of Accounts tree, account creation, account detail, and GL link;
- Journal register, multi-line balanced journal creation/posting, filtering,
  and controlled reversal;
- recurring-journal template list/create and draft generation;
- financial-period close and reopen;
- General Ledger;
- Trial Balance;
- Profit & Loss;
- Balance Sheet;
- Cash Flow;
- Budget vs Actual;
- consolidated-report job request UI/API, subject to an existing valid group;
- Demo role-based Finance visibility and backend authorization.

Read-only Demo verification confirms 52 accounts, 27 nominal/postable
accounts, 17 balanced journals, 12 periods, 3 approved budgets, 1 recurring
template, 2 bank accounts, 2 tax rules, 2 Accounting Events, and 67 audit
events. Trial Balance and Balance Sheet variance are zero, and Cash Flow
reconciles.

## 4. Missing visible functions

- journal document detail with full lines and history;
- journal Save Draft, Submit, Pending Approval, Approve, Reject, Return, and
  Process actions;
- separate Draft, Pending Approval, Posted, and Reversed work queues;
- journal reference, header description, nominal display, line description,
  dimensions, attachments, and source trace in the entry experience;
- account edit, activate/deactivate, and full business fields for category,
  section, nominal, normal balance, currency, and company;
- controlled account/nominal selector with code, name, type, and hierarchy;
- budget create, submit, approve/reject, revise, and version comparison pages;
- close-readiness checklist and period directory;
- Accounting Event ledger and end-to-end trace page;
- Finance audit-trail page;
- intercompany transaction workspace;
- consolidation group configuration and a valid Demo review path;
- bank/cash management, reconciliation, and tax-rule management;
- report catalogue/definitions, scheduling, print, and export;
- AR, AP, and Fixed Asset subledgers.

## 5. Backend functions not exposed in the frontend

| Capability | Backend evidence | Current frontend state |
|---|---|---|
| Accounting Event intake/list | `/api/v1/finance/accounting_events` | No Finance screen. |
| Finance audit trail | `/api/v1/finance/audit_trail`; generated client call exists | No Finance screen. |
| Report definitions | `/api/v1/finance/report_definitions`; generated client calls exist | No catalogue/management screen. |
| Budget lifecycle | `BudgetService` create/submit/decision/revise | No HTTP routes or workflow UI. |
| Intercompany pair posting | `PostingService.post_intercompany_pair` | No HTTP route or UI. |
| Consolidation group lifecycle | `ConsolidationService` create/revise | No HTTP route or group UI. |
| Party, bank account, and tax-rule persistence | Finance models/repositories and Demo seed | No management/list HTTP workflow or live page. |
| Financial-period directory | FinancialPeriod model/repository | No list endpoint; UI uses a free-text ID. |
| Organization/company directory | Platform model/repository | No list endpoint; Finance uses a free-text company ID. |

## 6. Frontend-visible functions not backed by a complete deliverable

| Visible item | What exists | Missing completion path | Required label |
|---|---|---|---|
| Budgets | Navigation/structural page and backend service | API and user workflow | `COMING SOON` |
| Tax | Navigation/structural page and seeded rules | Management API and workflow | `COMING SOON` |
| Cash & Bank | Navigation/structural page and seeded banks | Transactions/reconciliation APIs and workflow | `COMING SOON` |
| Accounts Receivable | Future navigation page | Party-linked subledger, settlement, aging | `COMING SOON` |
| Accounts Payable | Future navigation page | Party-linked subledger, settlement, aging | `COMING SOON` |
| Fixed Assets | Future navigation page | Asset register, depreciation, disposal | `COMING SOON` |
| Post generated recurring draft | UI success copy implies later posting | Register has no open/post-existing-draft action | `COMING SOON` for that action |
| Consolidation in Demo | Run panel and backend job route | No seeded valid group or group-selection directory | `NOT AVAILABLE` |

## 7. Prototype-only functions

There are no live Finance controls that should be reclassified as a working
prototype. The proposed approval workbench, close workbench, enhanced
dashboard, Accounting Event trace, and other screens in this package are
**wireframes only**. If later implemented with controlled mock data before
their backend exists, they must show `[DEMO/PROTOTYPE]` at page and action
level and must never imply that a ledger write occurred.

## 8. Coming Soon functions

The following remain explicitly future scope: journal workflow/approval UI,
full COA lifecycle, budget workflow, Accounting Event browser, intercompany
workspace, consolidation-group setup, finance audit UI, report catalogue,
bank reconciliation, tax administration, Accounts Receivable, Accounts
Payable, Fixed Assets, report exports/scheduling, and configurable dimensions.

## 9. Proposed navigation

The proposed business hierarchy is defined in
`navigation-and-workflows.md`. It preserves direct access to implemented
reports while replacing the flat menu and internal `shell` terminology.

## 10. Demo Action Matrix

The mandatory action-level truth register is:

`docs/product/nexora-demo-action-matrix.md`

It distinguishes implemented transactions, honest wireframe/prototype scope,
coming-soon actions, and capabilities unavailable to the Demo Company.

## 11. ASCII workflow wireframes

The Finance review set is split into six bounded batches in this directory:

1. dashboard and navigation;
2. Chart of Accounts;
3. journals;
4. ledger and statements;
5. planning, close, and recurring journals;
6. controls, consolidation, and audit.

## 12. Recommended changes

Recommended implementation order after owner approval:

1. Create one authoritative capability/action status source and remove the
   word `shell` from customer-facing navigation.
2. Restructure Finance navigation and add controlled company/period selectors.
3. Deliver journal detail and the draft-to-post lifecycle before adding more
   Finance destinations.
4. Close the recurring-draft dead end and expose source-to-journal trace.
5. Standardize live report headers, freshness, filters, drill-down, empty/error
   states, and permission explanations.
6. Add budgeting, close-readiness, Accounting Event, and audit surfaces on the
   existing backend contracts or approved new contracts.
7. Keep intercompany, consolidation, AR, AP, Fixed Assets, bank reconciliation,
   and tax administration visibly unavailable/coming soon until their complete
   business paths exist.
8. Run the Finance acceptance path and obtain owner approval before assessing
   or designing Operations.

