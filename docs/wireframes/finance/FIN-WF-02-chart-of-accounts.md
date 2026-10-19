# FIN-WF-02 — Chart of Accounts

- Screens: 4
- Status: `PROPOSED — OWNER REVIEW REQUIRED`
- Current live base: account tree, create, detail, and GL link

## Screen 1 — Complete Chart of Accounts

Capability state: `[IMPLEMENTED]` with proposed grouping and filters.

```text
+------------------------------------------------------------------------------------------------+
| Accounting & Finance / Accounts & Ledgers / Chart of Accounts        [DEMO]  As of 18 Aug 10:42|
| Complete Chart | Nominal Accounts | Categories & Sections [SOON] | Groups [SOON]                |
| Company: Nexora Demo Company | Status: Active v | Type: All v | Search code or name...          |
|                                                               [+ Add Account] [Export: SOON]    |
+------------------------------+-----------------------------------------------------------------+
| ACCOUNT HIERARCHY            | Code          Account                         Type       Balance  |
| v 10 Assets                  | 10            Assets                          Header          —    |
|   v 10-01 Current Assets     | 10-01         Current Assets                  Header          —    |
|     v 10-01-01 Cash & Bank   | 10-01-00100   Main Operating Bank            Asset      128,450  |
|       Main Operating Bank    | 10-01-00200   Petty Cash                     Asset        5,200  |
|     v 10-02 Receivables      | 10-02-00100   Accounts Receivable            Asset       42,800  |
| v 20 Liabilities            | 20-01-00100   Accounts Payable               Liability   31,250  |
| v 30 Equity                 | ...                                                             |
| v 40 Revenue                |                                                                 |
| v 50 Expenses               | Rows 1–25 of 52                              [<] 1 2 3 [>]      |
+------------------------------+-----------------------------------------------------------------+
| Selected: 10-01-00100 Main Operating Bank | [View Details] [Open General Ledger]                |
+------------------------------------------------------------------------------------------------+
```

Mobile:

```text
+--------------------------------------+
| < Chart of Accounts           [DEMO] |
| [Search code or name...]      [Filter]|
| [Complete] [Nominals]                |
| [+ Add Account]                      |
+--------------------------------------+
| v 10 Assets                          |
|   v 10-01 Current Assets             |
|     10-01-00100                      |
|     Main Operating Bank              |
|     Asset · Active        128,450  >  |
|     10-01-00200                      |
|     Petty Cash · Asset      5,200  >  |
| v 20 Liabilities                    |
| v 30 Equity                         |
+--------------------------------------+
| 52 accounts · 27 postable nominals   |
+--------------------------------------+
```

## Screen 2 — Account Detail

Capability state: view and GL link `[IMPLEMENTED]`; edit/status history
`[COMING SOON]`.

```text
+--------------------------------------------------------------------------------------+
| < Chart of Accounts / 10-01-00100                         [Active] [Postable] [DEMO]  |
| Main Operating Bank                              [Edit: SOON] [Open General Ledger]  |
+--------------------------------------------------------------------------------------+
| Classification                    | Controls                                             |
| Type              Asset           | Normal balance       Debit                           |
| Category          Assets          | Currency             USD                             |
| Section           Cash & Bank     | Manual posting       Allowed                         |
| Nominal           Yes             | Reconciliation       Required                        |
| Parent            10-01           | System account       No                              |
| Company           Nexora Demo Co. | Status               Active                          |
+-----------------------------------+------------------------------------------------------+
| Dimensions [COMING SOON]          | Activity                                             |
| Cost Centre      Optional         | Last posting         JV-2026-0017 · 18 Aug 2026      |
| Department       Optional         | Current balance      128,450 Debit                   |
| Project          Optional         | Created by           demo.admin                      |
+-----------------------------------+------------------------------------------------------+
| [View Journal Lines] [Audit History: SOON] [Deactivate: SOON]                            |
+--------------------------------------------------------------------------------------+
```

Mobile shows the same facts in ordered sections; actions remain at the bottom
and never cover the account code/name.

## Screen 3 — Add Account

Capability state: current create subset `[IMPLEMENTED]`; fields marked `SOON`
require approved contract/data-model work.

```text
+--------------------------------------------------------------------------------------+
| Add Account                                                        [DEMO]             |
| Create a controlled Chart of Accounts record.                                          |
+--------------------------------------------------------------------------------------+
| Identity                                                                              |
| Account code *       [10-01-00300____________]  Account name * [Savings Bank________]  |
| Type *               [Asset_________________v]  Company *      [Nexora Demo Company v] |
| Parent account       [10-01 Current Assets__v]  Header account [ ]                    |
|                                                                                       |
| Classification                                                                        |
| Category             [Assets______________v] [COMING SOON: distinct master]           |
| Section              [Cash & Bank_________v] [COMING SOON: distinct master]           |
| Nominal/postable     [Yes_________________v]  Normal balance [Debit________v] [SOON]   |
| Currency             [USD_________________v] [COMING SOON: company-derived control]   |
|                                                                                       |
| Posting controls                                                                      |
| [x] Manual posting allowed  [ ] System account  [x] Reconciliation required           |
| Status               [Active______________v] [COMING SOON: status lifecycle]          |
|                                                                                       |
| [Cancel]                                                     [Create Account] [LIVE]  |
+--------------------------------------------------------------------------------------+
| Validation: code unique in company · valid parent/type · no circular hierarchy        |
+--------------------------------------------------------------------------------------+
```

Mobile:

```text
+--------------------------------------+
| < Add Account                 [DEMO] |
| Code *        [____________]         |
| Name *        [____________]         |
| Type *        [Asset_______v]        |
| Company *     [Nexora Demo v]        |
| Parent        [Select______v]        |
| Header        [ ]                    |
| Manual posting[x]                    |
| System account[ ]                    |
| Reconciliation[x]                    |
| Category      [COMING SOON]          |
| Section       [COMING SOON]          |
| Normal balance[COMING SOON]          |
| Currency      [COMING SOON]          |
|                                      |
| [Cancel]          [Create Account]   |
+--------------------------------------+
```

## Screen 4 — Account and Nominal Picker

Capability state: searchable account picker `[IMPLEMENTED]`; richer nominal and
hierarchy metadata `[PROPOSED]`.

```text
+--------------------------------------------------------------------------------------+
| Select Account / Nominal                                                     [X]      |
| [Search code, account name, category, or section.................................]    |
| Filters: Type [All v]  Category [All v]  Section [All v]  Currency [USD v]            |
+--------------------------------------------------------------------------------------+
| Code          Name                         Category / Section     Normal   Status      |
| 10-01-00100   Main Operating Bank          Assets / Cash & Bank   Debit    Active      |
| 10-01-00200   Petty Cash                   Assets / Cash & Bank   Debit    Active      |
| 20-01-00100   Accounts Payable             Liab. / Current        Credit   Active      |
| 50-01-00100   Office Expense               Expense / Admin        Debit    Active      |
+--------------------------------------------------------------------------------------+
| Selected: 10-01-00100 — Main Operating Bank                         [Use Account]     |
+--------------------------------------------------------------------------------------+
| Only active, postable accounts for Nexora Demo Company are selectable.                |
+--------------------------------------------------------------------------------------+
```

Picker rules:

- never accept an arbitrary typed account name as the committed value;
- preserve both account ID and human-readable code/name;
- exclude header, inactive, wrong-company, and prohibited accounts;
- explain empty results and permission filtering;
- support keyboard search, row selection, and escape/cancel;
- on mobile, use a full-screen searchable sheet rather than a narrow dropdown.

