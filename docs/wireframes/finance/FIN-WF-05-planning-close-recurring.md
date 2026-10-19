# FIN-WF-05 — Planning, Period Close, and Recurring Journals

- Screens: 5
- Status: `PROPOSED — OWNER REVIEW REQUIRED`
- Principle: budget records never post to the General Ledger; recurring
  templates never bypass normal journal controls.

## Screen 1 — Budget Workspace

Capability state: backend budget service exists; complete API/UI workflow is
`[COMING SOON]`.

```text
+------------------------------------------------------------------------------------------------+
| Accounting & Finance / Planning & Close / Budgets                     [COMING SOON] [DEMO]    |
| Fiscal Year: FY 2026 v | Version: Approved v | Currency: USD | [+ New Budget: SOON]             |
+------------------------------------------------------------------------------------------------+
| Budget         Version  Period       Owner          Amount       Status             Action      |
| Operating FY26 v3       Jan–Dec 2026 Finance Mgr    420,000.00   Approved           [View]       |
| Revenue FY26   v2       Jan–Dec 2026 Sales          1,080,000.00 Approved           [View]       |
| Projects FY26  v1       Jan–Dec 2026 PMO            180,000.00   Approved           [View]       |
+------------------------------------------------------------------------------------------------+
| Planned lifecycle                                                                              |
| Draft -> Submit -> Pending Approval -> Approved / Rejected -> Revised Version                    |
|                                                                                                 |
| The Demo contains seeded approved budget data for reporting. It does not yet expose             |
| create, submit, approval, or revision as completed user actions.                                |
| [Open Budget vs Actual — IMPLEMENTED]                                                           |
+------------------------------------------------------------------------------------------------+
```

Mobile:

```text
+--------------------------------------+
| < Budgets          [COMING SOON][DEMO]|
| FY 2026 · Approved · USD              |
+--------------------------------------+
| Operating FY26 · v3                  |
| Finance Mgr · 420,000 · Approved  >  |
| Revenue FY26 · v2                    |
| Sales · 1,080,000 · Approved      >  |
+--------------------------------------+
| Seeded data supports BvA reporting.   |
| Editing/approval is not implemented.  |
| [Open Budget vs Actual]               |
+--------------------------------------+
```

Target budget document includes company, fiscal year, version, owner,
currency, account/nominal, period, department/cost centre/project dimensions,
monthly amount, notes, status, approval history, and revision lineage.

## Screen 2 — Budget vs Actual

Capability state: `[IMPLEMENTED]`.

```text
+------------------------------------------------------------------------------------------------+
| Budget vs Actual · FY 2026 / Aug                                  [LIVE] [DEMO]                 |
| Budget: Operating FY26 v3 | View: Month v | Dimension: All | [Refresh] [Export: SOON]           |
+------------------------------------------------------------------------------------------------+
| Account / Section               Budget        Actual       Variance      Variance %   Result     |
| Revenue                         90,000.00      96,000.00      6,000.00       6.7%      Favorable  >|
| Cost of Sales                   38,000.00      42,000.00     (4,000.00)    (10.5%)     Unfavorable>|
| Operating Expenses              32,000.00      30,320.00      1,680.00       5.3%      Favorable  >|
|------------------------------------------------------------------------------------------------|
| Budget 160,000.00 | Actual 168,320.00 | Net variance 3,680.00                                |
+------------------------------------------------------------------------------------------------+
| Actual source: posted journal lines · Budget source: approved budget version                    |
+------------------------------------------------------------------------------------------------+
```

Drill-down preserves whether the selected amount is Budget, Actual, or
Variance. Favorable/unfavorable logic respects account type and is not inferred
only from positive/negative color.

## Screen 3 — Period Management

Capability state: close/reopen `[IMPLEMENTED]`; controlled period directory
and picker `[COMING SOON]`.

```text
+------------------------------------------------------------------------------------------------+
| Accounting & Finance / Planning & Close / Period Management                     [DEMO]         |
| Fiscal Year: FY 2026 v | Company: Nexora Demo Company | [Close Workbench: SOON]                 |
+------------------------------------------------------------------------------------------------+
| Period       From          To            Status     Closed by / at         Actions              |
| Jan 2026     01 Jan        31 Jan         Closed     demo.finance.manager   [Reopen]              |
| Feb 2026     01 Feb        28 Feb         Closed     demo.finance.manager   [Reopen]              |
| ...                                                                                              |
| Aug 2026     01 Aug        31 Aug         Open       —                      [Close Period]         |
| Sep 2026     01 Sep        30 Sep         Future     —                      —                      |
+------------------------------------------------------------------------------------------------+
| Close and reopen are real protected actions. The current runtime requires a period ID;          |
| the proposed directory replaces that technical input with controlled selection.                 |
+------------------------------------------------------------------------------------------------+
```

Close confirmation:

```text
+----------------------------------------------------------------------------+
| Close Aug 2026                                                        [X]   |
| Posting will be blocked for this company and period.                       |
| Readiness checklist                         [COMING SOON]                   |
| Unposted journals                           Not available                   |
| Recurring journals due                      Not available                   |
| Bank reconciliation                         Not implemented                 |
| Trial Balance                               Balanced [IMPLEMENTED report]    |
| Reason / note [____________________________________________________]        |
| [Cancel]                                             [Close Period: LIVE]   |
+----------------------------------------------------------------------------+
```

The confirmation never fabricates green checks for services that do not exist.

## Screen 4 — Close Workbench

Capability state: `[COMING SOON]`. It composes existing and future checks but
does not replace the real close permission/action.

```text
+------------------------------------------------------------------------------------------------+
| Close Workbench · Aug 2026                                      [COMING SOON] [DEMO]           |
| Target close: 31 Aug 2026 | Owner: Finance Manager | 8 business days remaining                 |
+------------------------------------------------------------------------------------------------+
| Readiness                  Status             Owner                  Action                     |
| Trial Balance balanced     Passed [LIVE]      Finance                [Open Trial Balance]        |
| Journals posted            Not implemented    Finance                [Open Register]             |
| Recurring drafts reviewed  Not implemented    Finance                [Open Recurring]            |
| Budget actuals refreshed   Available [LIVE]   FP&A                   [Open BvA]                   |
| Bank reconciled            Coming Soon        Treasury               [Capability details]        |
| AR/AP closed               Coming Soon        Subledgers             [Capability details]        |
+------------------------------------------------------------------------------------------------+
| Exceptions / evidence                                                                           |
| No false completion percentage is calculated while required checks are unavailable.             |
| [Close Period — visible only when authorized; backend controls still decide]                    |
+------------------------------------------------------------------------------------------------+
```

Mobile groups checks into Passed, Attention, and Not Implemented; it never
uses color alone and never turns unavailable checks into zero exceptions.

## Screen 5 — Recurring Journal Templates and Generation

Capability state: list/create/generate `[IMPLEMENTED]`; open/post generated
draft `[COMING SOON]`.

```text
+------------------------------------------------------------------------------------------------+
| Accounting & Finance / Journals / Recurring Journals                     [LIVE] [DEMO]          |
| [Templates] [Generation History: SOON]                              [+ New Template]             |
+------------------------------------------------------------------------------------------------+
| Template              Frequency  Next run      Amount       Status     Action                     |
| Monthly Rent Accrual   Monthly    31 Aug 2026   5,000.00     Active     [Generate Draft]           |
+------------------------------------------------------------------------------------------------+
| Template lines                                                                                |
| Dr 50-03-00100 Rent Expense                                      5,000.00                        |
| Cr 20-02-00100 Accrued Expenses                                                5,000.00          |
| TOTAL DEBIT 5,000.00 | TOTAL CREDIT 5,000.00 | [BALANCED]                                    |
+------------------------------------------------------------------------------------------------+
| [Edit: SOON] [Pause: SOON] [Generate Draft: IMPLEMENTED]                                      |
+------------------------------------------------------------------------------------------------+
```

Generation confirmation:

```text
+--------------------------------------------------------------------------+
| Generate draft from Monthly Rent Accrual                           [X]    |
| Posting date * [31 Aug 2026]  Period [Aug 2026 · Open]                   |
| Reference      [REC-2026-08]   Description [Monthly rent accrual]         |
| This action creates a draft. It does not post to the General Ledger.      |
| [Cancel]                                      [Generate Draft: LIVE]     |
+--------------------------------------------------------------------------+

Draft created: JV-DRAFT-0043
[Open draft: COMING SOON] [Return to templates]
```

Recurring controls:

- generation is idempotent for template/scheduled occurrence;
- generated lines use controlled account identifiers and current period rules;
- the template does not self-approve or self-post;
- the created journal enters the same approval/post/reversal workflow as a
  manual journal;
- the current UI must not imply that a generated draft is posted.

