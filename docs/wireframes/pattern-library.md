# Nexora ERP — ASCII Wireframe Pattern Library

- Status: `PROPOSED`
- Applies to: all wireframe batches
- Canon sources: `docs/design-system.md`, `docs/component-library.md`,
  `docs/ux-layouts-and-pages.md`, `_shared-canon.md`

ASCII characters express hierarchy and behavior, not final colors, fonts, or
pixel-perfect dimensions. Text in `{braces}` is runtime data, text in
`[brackets]` is an action/control, and text in `<angle brackets>` is a status.

## P-01 — Desktop application shell

```text
+--------------------------------------------------------------------------------------------------+
| DEMO — Nexora Demo Company — Non-production data                                  [Dismiss help] |
+--------------------------------------------------------------------------------------------------+
| NEXORA | Company: {company v} | [Search / command] | [Tasks 8] [Alerts 3] [AI] [User v]          |
+----------------------+---------------------------------------------------------------------------+
| BUSINESS NAVIGATION  | Breadcrumb: Module / Group / Screen                       [Page action]   |
|                      +---------------------------------------------------------------------------+
| [Overview]           | Page title                                      <status>  Updated {time} |
| [Banking]            | Context / filters / saved view controls                                   |
| [Sales]              +---------------------------------------------------------------------------+
| [Purchases]          |                                                                           |
| [Inventory]          |                           PAGE CONTENT                                    |
| [Finance]            |                                                                           |
| [Projects]           |                                                                           |
| [People]             |                                                                           |
| [Operations]         |                                                                           |
| [Reports]            |                                                                           |
| [More modules]       |                                                                           |
|                      +---------------------------------------------------------------------------+
| [Admin / Settings]   | Optional sticky action bar / selection summary / pagination              |
+----------------------+---------------------------------------------------------------------------+
```

Rules:

- Navigation is organized by business module, then menu group, then
  master/transaction/process/report — never by technical package.
- Company context is always visible. Changing it clears incompatible filters
  and requires explicit confirmation when unsaved work exists.
- The red/amber Demo indicator is persistent only in a marked Demo environment.
- Exactly one primary action is visible per view.
- Permission-denied modules are hidden when existence itself is sensitive;
  direct links resolve to a designed denial state with correlation ID.

## P-02 — Mobile application shell

```text
+--------------------------------------+
| DEMO — Non-production                |
+--------------------------------------+
| [≡] Nexora       [Search] [Alerts]   |
| {Company short name v}               |
+--------------------------------------+
| Parent / Current                     |
| Page title                  [Action]  |
| <status>  Updated {time}              |
+--------------------------------------+
|                                      |
|          STACKED PAGE CONTENT        |
|                                      |
+--------------------------------------+
| [Home] [My work] [Create] [More]     |
+--------------------------------------+
```

Rules:

- Sidebar becomes a drawer; long grids become cards or horizontally scroll
  with a sticky identifier column.
- Record details become full pages, not narrow side drawers.
- Sticky actions must not obscure validation errors or the final record row.
- All touch targets are at least 44×44 px.

## P-03 — Record list / workspace

```text
+----------------------------------------------------------------------------------------------+
| {Records}  {count}                                    [Saved views v]           [+ Create]   |
| [Search........................] [Status v] [Date v] [More filters] [Density v] [Export]     |
+----------------------------------------------------------------------------------------------+
| □ | Number     | Party / Description       | Date       | Amount       | Status   | Owner     |
|---+------------+---------------------------+------------+--------------+----------+-----------|
| □ | {ID link}  | {primary label}           | {date}     | {currency}   | <status> | {person}  |
| □ | {ID link}  | {primary label}           | {date}     | {currency}   | <status> | {person}  |
+----------------------------------------------------------------------------------------------+
| {selected count / bulk actions when allowed}                         [Previous] [Next]        |
+----------------------------------------------------------------------------------------------+
```

Required variants: loading skeleton, actionable empty state, filtered-no-result
state, recoverable error with correlation ID, stale data warning, and row-level
permission redaction.

## P-04 — Transaction workbench

```text
+----------------------------------------------------------------------------------------------+
| {Document type} {number}  <Draft>      {company}  {currency}       [More v] [Save] [Submit]  |
+-------------------------------+--------------------------------------------------------------+
| DOCUMENT                      | CONTEXT / CONTROL                                             |
| Party      [{select........}] | Approval route: Maker → Manager → Finance                     |
| Date       [yyyy-mm-dd......] | Budget: {available / committed}                              |
| Reference  [.................]| Credit/stock/tax control: <result>                            |
| Dimensions [.................]| Attachments {count}  Comments {count}                         |
|-------------------------------+--------------------------------------------------------------|
| LINES                                                                                        |
| # | Item/account | Qty | UOM | Rate | Tax | Dimensions | Amount | [⋮]                       |
| 1 | {...}        | ... | ... | ...  | ... | {...}      | ...    | [⋮]                       |
|                                                      Subtotal {x} / Tax {y} / Total {z}       |
+----------------------------------------------------------------------------------------------+
| [History] [Accounting preview] [Related documents]          Draft saved {time}                |
+----------------------------------------------------------------------------------------------+
```

Controlled actions open a confirmation that names the lifecycle change and
downstream effects. Posted financial/stock records never expose Delete; they
offer governed reversal, return, credit, or adjustment paths.

## P-05 — Approval review

```text
+----------------------------------------------------------------------------------------------+
| Review {document} {number}  <Awaiting your approval>         Due {date}                       |
+-----------------------------------------------+----------------------------------------------+
| BUSINESS EVIDENCE                             | DECISION                                     |
| Requester / department / amount               | Policy step {n of m}                         |
| Budget / credit / match / SoD checks          | [Comment required for reject/return......]  |
| Line and attachment summary                   |                                              |
| Change comparison where amended               | [Return] [Reject]          [Approve]         |
+-----------------------------------------------+----------------------------------------------+
| Approval history: actor — decision — comment — timestamp — delegated by                      |
+----------------------------------------------------------------------------------------------+
```

Approve, reject, and return are distinct decisions. A maker cannot approve
their own controlled document when SoD policy forbids it. Delegated actions
show both delegator and acting approver.

## P-06 — Report and drill-down

```text
+----------------------------------------------------------------------------------------------+
| {Report name}       As of {time} <fresh/stale>               [Save view] [Schedule] [Export] |
+----------------------+-----------------------------------------------------------------------+
| FILTERS              | KPI / chart / reconciliation summary                                  |
| Company [v]          +-----------------------------------------------------------------------+
| Period  [v]          | Report rows                                    Current | Prior | Var  |
| Currency[v]          | {clickable row}                                  {x}      {y}    {z}  |
| Dimensions[...]      |                                                                       |
| [Reset] [Run report] |                                                                       |
+----------------------+-----------------------------------------------------------------------+
| Drill-down: report row → transaction → accounting event → journal → GL → audit              |
+----------------------------------------------------------------------------------------------+
```

Every report defines source, formula, filters, dimensions, freshness,
permissions, reconciliation, export behavior, and a bounded drill-down route.
Charts always have a tabular equivalent.

## P-07 — Settings / master data

```text
+----------------------------+-----------------------------------------------------------------+
| SETTINGS GROUPS            | {Master / policy title}                         [Save draft]     |
| [Company structure]        | Status <Draft/Active/Inactive>                                  |
| [Fiscal and currency]      | Basic fields                                                      |
| [Numbering]                | [............................................................]   |
| [Tax]                      | Advanced settings [Expand]                                       |
| [Workflow]                 | Approval requirement / effective date / version                  |
| [Permissions]              |                                                                 |
+----------------------------+-----------------------------------------------------------------+
```

Sensitive master changes show maker-checker, effective-date, version, impact,
and audit information. Deactivation replaces deletion when downstream records
exist.

## P-08 — Designed system states

| State | Required content |
|---|---|
| Loading | Layout-matched skeleton and stable page title |
| Empty | Why it is empty, permission-safe explanation, and one next action |
| Filtered empty | Active filters, clear-filter action, no misleading create prompt |
| Error | Safe message, retry/back action, copyable correlation ID |
| Permission denied | Missing capability in plain language; request-access path if policy allows |
| Stale | Last refresh time, affected values, refresh action |
| Offline/mobile queued | What is local, what will sync, conflict behavior, queue status |
| Coming Soon | Honest module scope summary; no enabled no-op transaction controls |
| Demo | Persistent non-production banner; reset-safe wording; never represented as production |

## P-09 — Responsive transformation table

| Desktop pattern | Tablet | Mobile |
|---|---|---|
| Persistent sidebar | Icon rail | Drawer |
| List + detail drawer | List + wide sheet | List → full detail page |
| Filter rail + report | Collapsible rail | Filter sheet |
| Dense grid | Scroll + sticky identifier | Stacked record cards |
| Multi-column form | Two columns where safe | Single column |
| Side-by-side approval evidence/decision | Stacked panels | Evidence first; sticky decision bar |
| Dashboard grid | Two columns | Single column, role-prioritized |

## P-10 — Accounting and audit trace ribbon

All financially relevant detail screens reserve a collapsible trace ribbon:

```text
Business document → Accounting Event → Journal → General Ledger → Report row → Audit evidence
     {id}                {id/status}      {id}       {account}       {report}       {event}
```

Unavailable future links show `Not yet implemented`; they never fabricate an
ID or a successful posting state.
