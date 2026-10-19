# FIN-WF-04 — General Ledger and Financial Statements

- Screens: 6
- Status: `PROPOSED — OWNER REVIEW REQUIRED`
- Current live base: GL, Trial Balance, Profit & Loss, Balance Sheet, Cash Flow,
  Budget vs Actual, and bounded drill-down

## Shared report frame

All reports use one truthful header and action model:

```text
+------------------------------------------------------------------------------------------------+
| Accounting & Finance / Financial Reports / {Report}                          [LIVE] [DEMO]     |
| Company: Nexora Demo Company | Period/Date: {selection} | Basis: Posted | Currency: USD         |
| Generated: 18 Aug 2026 10:42 | Data freshness: Current | [Refresh] [Export: SOON] [Print: SOON]|
+------------------------------------------------------------------------------------------------+
| Report-specific filters                                                                         |
+------------------------------------------------------------------------------------------------+
| Report body                                                                                      |
+------------------------------------------------------------------------------------------------+
| Source: actual posted journal lines · Click a linked amount/account to drill down.               |
+------------------------------------------------------------------------------------------------+
```

Mobile shared frame:

```text
+--------------------------------------+
| < {Report}               [LIVE][DEMO]|
| Nexora Demo · USD                    |
| {period/date} · Posted only           |
| As of 10:42             [Filters]     |
+--------------------------------------+
| Summary / accounting check            |
| Scrollable rows or grouped cards      |
+--------------------------------------+
| [Refresh] [Export: COMING SOON]       |
+--------------------------------------+
```

On mobile, wide tables use a horizontally scrollable table with a pinned
account/line label or a deliberate grouped-card view. Numeric columns are not
silently removed.

## Screen 1 — General Ledger

Capability state: `[IMPLEMENTED]`.

```text
+------------------------------------------------------------------------------------------------+
| General Ledger                                                       [LIVE] [DEMO]              |
| Account: [10-01-00100 Main Operating Bank v] | From [01 Aug] To [31 Aug] | [Run]                |
+------------------------------------------------------------------------------------------------+
| Opening balance: 122,000.00 Debit                                                                |
| Date       Journal        Reference   Description                    Debit      Credit    Balance|
| 05 Aug     JV-2026-0012   REC-0805    Customer receipt             12,000.00      0.00 134,000 Dr|
| 12 Aug     JV-2026-0014   PAY-0812    Supplier payment                  0.00   4,300.00 129,700 Dr|
| 18 Aug     JV-2026-0017   EXP-0818    Office supplies                   0.00   1,250.00 128,450 Dr|
|------------------------------------------------------------------------------------------------|
| Opening 122,000.00 + Debits 12,000.00 - Credits 5,550.00 = Closing 128,450.00 Debit             |
+------------------------------------------------------------------------------------------------+
| [Open selected journal: COMING SOON detail]                                                   |
+------------------------------------------------------------------------------------------------+
```

Required behavior: date opening, debits, credits, and closing reconcile; each
row retains journal/source identity; no single-company row leaks across tenant
or company scope.

## Screen 2 — Trial Balance

Capability state: `[IMPLEMENTED]`.

```text
+------------------------------------------------------------------------------------------------+
| Trial Balance · As at 31 Aug 2026                                     [LIVE] [DEMO]             |
| [Hide zero balances x] [Show headers ] [Compare prior period: SOON]                                |
+------------------------------------------------------------------------------------------------+
| Code          Account                                      Debit              Credit              |
| 10-01-00100   Main Operating Bank                      128,450.00                0.00  >           |
| 10-02-00100   Accounts Receivable                       42,800.00                0.00  >           |
| 20-01-00100   Accounts Payable                               0.00           31,250.00  >           |
| ...                                                                                            |
|------------------------------------------------------------------------------------------------|
| TOTAL                                                   536,400.00          536,400.00             |
| DIFFERENCE                                                    0.00                0.00 [BALANCED]  |
+------------------------------------------------------------------------------------------------+
```

An imbalance is a blocking control state, not a green dashboard:

```text
[CONTROL FAILURE] Trial Balance difference: USD 250.00
Financial statements may be unreliable. [View diagnostic detail]
```

## Screen 3 — Profit & Loss

Capability state: `[IMPLEMENTED]`.

```text
+------------------------------------------------------------------------------------------------+
| Profit & Loss · Aug 2026                                            [LIVE] [DEMO]               |
| View: [Current period v] | Compare: [Budget v] | Dimensions: [All: current]                      |
+------------------------------------------------------------------------------------------------+
| Revenue                                                                                          |
|   Sales Revenue                                           96,000.00      Budget 90,000   +6,000 >|
|   Service Revenue                                         18,500.00      Budget 20,000   -1,500 >|
| Total Revenue                                            114,500.00                                  |
| Cost of Sales                                            (42,000.00)                                 |
| Gross Profit                                              72,500.00                                  |
| Operating Expenses                                       (30,320.00)                                 |
| NET PROFIT                                                42,180.00                                  |
+------------------------------------------------------------------------------------------------+
| Source: posted revenue/expense journal lines. Amounts shown are layout examples only.             |
+------------------------------------------------------------------------------------------------+
```

Lines expand category -> section -> nominal account. Variance definitions and
favorable/unfavorable semantics remain textual and consistent.

## Screen 4 — Balance Sheet

Capability state: `[IMPLEMENTED]`.

```text
+------------------------------------------------------------------------------------------------+
| Balance Sheet · As at 31 Aug 2026                                  [LIVE] [DEMO]                |
+------------------------------------------------------------------------------------------------+
| ASSETS                                             | LIABILITIES & EQUITY                        |
| Current Assets                         176,450.00  | Current Liabilities             51,250.00   |
| Non-current Assets                      80,000.00  | Non-current Liabilities         10,000.00   |
| TOTAL ASSETS                           256,450.00  | Equity                         195,200.00   |
|                                                     | TOTAL LIABILITIES & EQUITY     256,450.00   |
+------------------------------------------------------------------------------------------------+
| Accounting equation variance: 0.00 [BALANCED] | [Drill into line/account]                       |
+------------------------------------------------------------------------------------------------+
```

The mobile view stacks Assets then Liabilities & Equity and keeps both totals
plus the accounting-equation check visible.

## Screen 5 — Cash Flow

Capability state: `[IMPLEMENTED]`.

```text
+------------------------------------------------------------------------------------------------+
| Cash Flow Statement · Aug 2026                                     [LIVE] [DEMO]                |
+------------------------------------------------------------------------------------------------+
| Operating activities                                                                  18,450.00 |
| Investing activities                                                                  (5,000.00)|
| Financing activities                                                                       0.00 |
| Net increase in cash                                                                  13,450.00 |
| Opening cash                                                                         115,000.00 |
| Closing cash                                                                         128,450.00 |
+------------------------------------------------------------------------------------------------+
| Opening cash + net movement = closing cash | Difference 0.00 [RECONCILED]                       |
| [View cash/bank GL] [Bank reconciliation: COMING SOON]                                           |
+------------------------------------------------------------------------------------------------+
```

## Screen 6 — Statement Drill-down

Capability state: account/journal-line drill-down `[IMPLEMENTED]`; complete
journal/event/audit continuation `[COMING SOON]`.

```text
+------------------------------------------------------------------------------------------------+
| Profit & Loss / Operating Expenses / Office Expense                           [DEMO]            |
| From 01 Aug 2026 to 31 Aug 2026 | Account 50-01-00100 | Total 6,250.00                          |
+------------------------------------------------------------------------------------------------+
| Date       Journal       Source             Reference     Description                 Amount     |
| 03 Aug     JV-2026-0011  Manual Journal     EXP-0803      Rent                      5,000.00  >   |
| 18 Aug     JV-2026-0017  Manual Journal     EXP-0818      Office supplies           1,250.00  >   |
|------------------------------------------------------------------------------------------------|
| Total                                                                               6,250.00     |
+------------------------------------------------------------------------------------------------+
| Trace: Statement -> Account -> Journal line -> Journal [SOON] -> Event [SOON] -> Audit [SOON]   |
+------------------------------------------------------------------------------------------------+
```

No-result/error states:

```text
NO DATA FOR THESE FILTERS
No posted journal lines match Aug 2026 for this account.
[Change filters] [Return to report]

REPORT COULD NOT BE GENERATED
No financial number is shown from stale placeholder data.
[Retry] [Copy support reference]
```

## Reporting acceptance criteria

- all headline and row values derive from the same authoritative transaction
  and reporting services;
- company, fiscal context, currency, basis, generated time, and freshness are
  always visible;
- Debit = Credit, Assets = Liabilities + Equity, and cash reconciliation are
  explicit controls;
- a report never invents missing AR/AP/inventory data;
- linked values retain filter context on drill-down and back navigation;
- export/print/schedule remain `COMING SOON` until real generated artifacts and
  permissions exist.

