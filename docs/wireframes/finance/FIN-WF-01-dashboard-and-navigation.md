# FIN-WF-01 — Finance Dashboard and Navigation

- Screens: 2
- Status: `PROPOSED — OWNER REVIEW REQUIRED`
- Visual reference: supplied ERP dashboard picture, used for hierarchy/density
- Data rule: all values originate from current Finance reporting/workflow data

## Screen 1 — Finance Command Centre

Capability state: dashboard metrics `[IMPLEMENTED]`; approval queue, exceptions,
and close deadlines `[COMING SOON]`.

Purpose: give a finance user one dense, calm starting point for financial
position, performance, control exceptions, and immediate work.

Primary actions:

- Run Trial Balance `[IMPLEMENTED]`
- Open Profit & Loss `[IMPLEMENTED]`
- Open Balance Sheet `[IMPLEMENTED]`
- Open Cash Flow `[IMPLEMENTED]`
- View journal approvals `[COMING SOON]`
- Open close workbench `[COMING SOON]`

Desktop:

```text
+------------------------------------------------------------------------------------------------+
| NEXORA | [DEMO] Nexora Demo Company v | Search finance... | ? | Alerts | demo.finance.manager v|
+----------------------+-------------------------------------------------------------------------+
| ACCOUNTING & FINANCE | Finance Dashboard                              Data as of 18 Aug, 10:42 |
| > Overview           | FY 2026 | Period: Aug | Currency: USD | [Refresh]                       |
|   Accounts & Ledgers +------------------+------------------+------------------+----------------+
|   Journals           | CASH & BANK      | RECEIVABLES      | PAYABLES         | NET PROFIT     |
|   Planning & Close   | $128,450         | Coming Soon      | Coming Soon      | $42,180        |
|   Intercompany...    | +4.2% vs prior   | AR subledger     | AP subledger     | P&L ->         |
|   Financial Reports  | CF -> [LIVE]     | [COMING SOON]    | [COMING SOON]    | [LIVE]         |
|   Controls & Audit   +------------------+------------------+------------------+----------------+
|                      |                                                                                |
|                      | PROFIT & LOSS TREND                         | BUDGET VS ACTUAL                  |
|                      | $60k |                         ____          |        Actual   Budget            |
|                      | $40k |             ___/\______/    \        | Revenue  █████   ░░░░░             |
|                      | $20k |______/\____/                       | Expense  ████    ░░░░              |
|                      |      + Jan Feb Mar Apr May Jun Jul Aug      | [Open report] [LIVE]              |
|                      +---------------------------------------------+----------------------------------+
|                      | TRIAL BALANCE HEALTH          | PERIOD CONTROL                            |
|                      |       100% BALANCED            | Open period: Aug 2026                     |
|                      |         ◜████◝                 | Unposted drafts: Coming Soon              |
|                      |       Debit = Credit           | Close readiness: Coming Soon              |
|                      | [Open Trial Balance] [LIVE]    | [Open period management] [LIVE]           |
|                      +--------------------------------+-------------------------------------------+
|                      | RECENT FINANCE ACTIVITY                    | UPCOMING / ATTENTION               |
|                      | JV-2026-0017 posted · 10:35 [LIVE]         | Approval queue [COMING SOON]       |
|                      | JV-2026-0016 reversed · 09:12 [LIVE]       | Month close checklist [COMING SOON]|
|                      | Recurring draft generated · 08:55 [LIVE]   | Bank reconciliation [COMING SOON]  |
|                      | [View journal register]                     | [View all work]                    |
|                      +---------------------------------------------+----------------------------------+
| [DEMO DATA — resettable; never use for production decisions]                                           |
+------------------------------------------------------------------------------------------------+
```

Notes:

- displayed amounts are examples of layout only; implementation must bind to
  `dashboard_metrics`/report responses and Demo data;
- unavailable AR/AP figures are not fabricated—cards explain the missing
  subledger;
- freshness is visible at page and card/report level;
- chart selection favors decision value: performance, variance, balance
  health, activity, and deadlines rather than decorative visualization.

Mobile:

```text
+--------------------------------------+
| ☰ NEXORA   [DEMO]           Alerts  v|
| Finance Dashboard                    |
| FY26 · Aug · USD     As of 10:42     |
+--------------------------------------+
| CASH & BANK  $128,450     [LIVE]  >  |
| NET PROFIT    $42,180     [LIVE]  >  |
| RECEIVABLES  Coming Soon             |
| PAYABLES     Coming Soon             |
+--------------------------------------+
| Trial Balance Health                 |
| 100% BALANCED · Debit = Credit       |
| [Open Trial Balance]                 |
+--------------------------------------+
| P&L Trend                 [View]      |
|       __/\____/\___                  |
+--------------------------------------+
| Budget vs Actual          [View]      |
| Revenue █████ / ░░░░░                |
+--------------------------------------+
| Recent Activity                      |
| JV-2026-0017 posted · 10:35          |
| JV-2026-0016 reversed · 09:12        |
+--------------------------------------+
| Upcoming / Attention                 |
| Approvals          [COMING SOON]     |
| Close checklist    [COMING SOON]     |
+--------------------------------------+
| Demo data — never production         |
+--------------------------------------+
```

Responsive rule: one-column priority is KPIs, accounting health, exceptions,
charts, activity, then deadlines. Horizontal financial tables are never shrunk
into unreadable miniatures.

## Screen 2 — Finance Navigation and My Work

Capability state: hierarchical navigation `[PROPOSED]`; My Finance Work
`[COMING SOON]`.

Purpose: let users locate a business function by intent and see only actions
allowed by role, state, company, and capability status.

Desktop:

```text
+------------------------------------------------------------------------------------------------+
| [DEMO] Nexora Demo Company | Accounting & Finance / My Finance Work            demo.accountant |
+----------------------------+-------------------------------------------------------------------+
| Overview                   | My Finance Work                                      [COMING SOON]|
|   Finance Dashboard [LIVE] |-------------------------------------------------------------------|
|   My Finance Work   [SOON] | Queue                 Count   Oldest       Action                  |
| Accounts & Ledgers       v | Draft journals           —    —            Not yet implemented     |
|   Chart of Accounts [LIVE] | Pending my approval       —    —            Not yet implemented     |
|   General Ledger    [LIVE] | Recurring drafts          1    Today        [Open register]*         |
|   Accounting Events[SOON] | Close exceptions          —    —            Not yet implemented     |
| Journals                 v |-------------------------------------------------------------------|
|   New Journal       [LIVE] | *Register exists; open/post-existing-draft action is Coming Soon.  |
|   Journal Register  [LIVE] |                                                                   |
|   Recurring         [LIVE] | Quick access                                                      |
| Planning & Close         v | [New Journal] [Chart of Accounts] [Trial Balance] [Period Closing]|
| Financial Reports       v |                                                                   |
| Controls & Audit        v | Permission: finance.journal.read                                   |
| Future Subledgers       v | Unavailable actions are explained, not simulated.                  |
+----------------------------+-------------------------------------------------------------------+
```

Mobile navigation drawer:

```text
+--------------------------------------+
| X  ACCOUNTING & FINANCE        [DEMO]|
| Nexora Demo Company                  |
+--------------------------------------+
| Overview                           v |
|   Finance Dashboard        [LIVE]    |
|   My Finance Work          [SOON]    |
| Accounts & Ledgers                >  |
| Journals                          >  |
| Planning & Close                  >  |
| Intercompany & Consolidation      >  |
| Financial Reports                 >  |
| Controls & Audit                  >  |
| Future Subledgers                 >  |
+--------------------------------------+
| demo.accountant · Sign out           |
| Demo data — never production         |
+--------------------------------------+
```

Empty/unavailable state:

```text
+-----------------------------------------------------------+
| My Finance Work                           [COMING SOON]    |
| This controlled workflow is not implemented yet.          |
| Planned: drafts, approvals, close exceptions, deadlines.  |
| Available now: [Journal Register] [Period Closing]         |
| No approval or posting has been simulated.                 |
+-----------------------------------------------------------+
```

Acceptance notes:

- keyboard order follows header, context, primary actions, content, footer;
- state is always text plus optional color/icon;
- every card/link names its source and current status;
- navigation collapse retains accessible labels and Demo identity.

