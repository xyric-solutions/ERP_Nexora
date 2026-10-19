# FIN-WF-03 — Journal Lifecycle

- Screens: 5
- Status: `PROPOSED — OWNER REVIEW REQUIRED`
- Accounting invariant: every posted journal has two or more lines and
  `TOTAL DEBIT = TOTAL CREDIT`

## Screen 1 — Journal Register and Work Queues

Capability state: register/filter and posted/reversed data `[IMPLEMENTED]`;
draft/approval queues and detail route `[COMING SOON]`.

```text
+------------------------------------------------------------------------------------------------+
| Accounting & Finance / Journals / Journal Register                    [DEMO] As of 18 Aug 10:42|
| [All] [Draft: SOON] [Pending Approval: SOON] [Posted] [Reversed]       [+ New Journal]          |
| Company: Nexora Demo Company | Period: All v | Status: All v | Search no./ref./description...  |
+------------------------------------------------------------------------------------------------+
| Journal No.   Date       Reference     Description              Lines  Debit      Credit   Status|
| JV-2026-0017  18 Aug     EXP-0818      Office supplies             2    1,250       1,250  Posted|
| JV-2026-0016  17 Aug     REV-0015      Reverse accrual             2    5,000       5,000  Reversed|
| JV-2026-0015  16 Aug     OPEN-001      Opening balance            12  425,000     425,000  Posted|
|------------------------------------------------------------------------------------------------|
| Rows 1–17 of 17             Total Debit 431,250 | Total Credit 431,250 | [Export: COMING SOON] |
+------------------------------------------------------------------------------------------------+
| Select a journal to open details. Posted records can only be corrected by reversal.             |
+------------------------------------------------------------------------------------------------+
```

Mobile:

```text
+--------------------------------------+
| < Journal Register            [DEMO] |
| [Search journal or reference...]     |
| [All] [Posted] [Reversed] [More]     |
| [+ New Journal]                      |
+--------------------------------------+
| JV-2026-0017              Posted     |
| 18 Aug · EXP-0818                    |
| Office supplies                      |
| Dr 1,250 · Cr 1,250 · 2 lines     >  |
+--------------------------------------+
| JV-2026-0016              Reversed   |
| 17 Aug · REV-0015                    |
| Reverse accrual                      |
| Dr 5,000 · Cr 5,000 · 2 lines     >  |
+--------------------------------------+
| Draft / Approvals: COMING SOON       |
+--------------------------------------+
```

## Screen 2 — New Manual Journal

Capability state: balanced create-and-post `[IMPLEMENTED]`; Save Draft,
Submit, reference/description, nominal metadata, and dimensions
`[COMING SOON]` unless separately implemented.

```text
+------------------------------------------------------------------------------------------------+
| Accounting & Finance / Journals / New Journal                                  [DEMO]          |
+------------------------------------------------------------------------------------------------+
| Journal No.   [Assigned on save________]  Company *    [Nexora Demo Company v]                  |
| Posting Date* [18 Aug 2026_____________]  Period       [Aug 2026 · Open______v]                 |
| Reference     [EXP-0818________________]  Currency     [USD__________________v]                 |
| Description   [Office supplies paid from main bank_________________________________________]   |
+------------------------------------------------------------------------------------------------+
| # | Account *                    | Nominal              | Description       | Debit    | Credit |
| 1 | [50-01-00100 Office Exp.  v] | Office Expense       | Supplies          | 1,250.00 |   0.00 |
| 2 | [10-01-00100 Main Bank    v] | Main Operating Bank  | Payment           |     0.00 |1,250.00|
| 3 | [Select account...         v] |                      |                   |          |       |
|   | [+ Add Line] [Remove selected] [Dimensions: COMING SOON]                                 |
+------------------------------------------------------------------------------------------------+
| Validation                                                                                      |
| ✓ 2 postable accounts · ✓ Open period · ✓ Debit and credit present · ✓ Balanced                |
|                                                        TOTAL DEBIT   | 1,250.00                  |
|                                                        TOTAL CREDIT  | 1,250.00                  |
|                                                        DIFFERENCE    |     0.00  [BALANCED]      |
+------------------------------------------------------------------------------------------------+
| [Cancel]                     [Save Draft: SOON] [Submit: SOON] [Create & Post: IMPLEMENTED]     |
+------------------------------------------------------------------------------------------------+
```

Unbalanced state:

```text
+---------------------------------------------------------------+
| TOTAL DEBIT  1,250.00 | TOTAL CREDIT 1,000.00                 |
| DIFFERENCE      250.00  [NOT BALANCED]                        |
| Posting is blocked. Add or correct journal lines.             |
| [Create & Post — disabled: Total debit must equal total credit]|
+---------------------------------------------------------------+
```

Mobile line editing:

```text
+--------------------------------------+
| < New Journal                 [DEMO] |
| Date *       [18 Aug 2026]           |
| Company *    [Nexora Demo v]         |
| Period       [Aug 2026 · Open]       |
| Reference    [EXP-0818_____]         |
| Description  [Office supplies____]   |
+--------------------------------------+
| LINE 1                         [Edit]|
| 50-01-00100 · Office Expense        |
| Supplies                  Dr 1,250.00|
| LINE 2                         [Edit]|
| 10-01-00100 · Main Bank             |
| Payment                   Cr 1,250.00|
| [+ Add Line]                         |
+--------------------------------------+
| Debit  1,250.00 | Credit 1,250.00   |
| Difference 0.00        [BALANCED]    |
| [Cancel] [Create & Post: LIVE]       |
| Save Draft / Submit: COMING SOON     |
+--------------------------------------+
```

Required behavior:

- account selection uses the controlled master picker from FIN-WF-02;
- one line cannot contain both debit and credit;
- zero, negative, empty, header, inactive, cross-company, or disallowed
  accounts are rejected;
- company base currency/rate comes from authoritative company/currency data,
  not a hardcoded UI constant;
- period, permissions, approval threshold, dimensions, and segregation of
  duties are revalidated on the backend;
- retrying the request must not create duplicate postings.

## Screen 3 — Journal Detail and Accounting Trace

Capability state: reversal exists `[IMPLEMENTED]`; complete document route and
source/audit composition `[COMING SOON]`.

```text
+------------------------------------------------------------------------------------------------+
| < Journal Register / JV-2026-0017                                    [POSTED] [DEMO]            |
| Office supplies paid from main bank                [Reverse Journal] [Print: SOON]              |
+------------------------------------------------------------------------------------------------+
| Date          18 Aug 2026       Reference      EXP-0818        Company      Nexora Demo Company |
| Period        Aug 2026          Currency       USD             Source       Manual Journal      |
| Created by    demo.accountant   Posted by      demo.accountant Posted at   18 Aug 10:35         |
+------------------------------------------------------------------------------------------------+
| # | Account / Nominal                    | Description                 | Debit       | Credit    |
| 1 | 50-01-00100 Office Expense           | Supplies                    | 1,250.00    |     0.00  |
| 2 | 10-01-00100 Main Operating Bank      | Payment                     |     0.00    | 1,250.00  |
|------------------------------------------------------------------------------------------------|
|                                                     TOTAL DEBIT         1,250.00                 |
|                                                     TOTAL CREDIT        1,250.00                 |
|                                                     DIFFERENCE              0.00 [BALANCED]      |
+------------------------------------------------------------------------------------------------+
| [History] [Accounting Trace: SOON] [Attachments: SOON] [Audit: SOON]                             |
| 10:35 Posted · demo.accountant · posting control passed                                         |
| 10:34 Created · demo.accountant                                                                 |
+------------------------------------------------------------------------------------------------+
```

Source-to-report trace panel:

```text
Business source -> Accounting Event -> Journal JV-2026-0017 -> GL accounts -> P&L / Cash Flow
 [if present]       [COMING SOON UI]     [current]               [LIVE]         [LIVE]
```

## Screen 4 — Journal Approval Review

Capability state: `[COMING SOON]`. This is not a working Demo approval.

```text
+------------------------------------------------------------------------------------------------+
| Journals / Pending Approval / JV-DRAFT-0042                    [PENDING APPROVAL] [COMING SOON] |
+------------------------------------------------------------------------------------------------+
| Requester      demo.accountant      Submitted       18 Aug 09:20                                |
| Company        Nexora Demo Company  Department      Finance                                     |
| Amount         USD 25,000.00        Approval level  Level 1                                     |
| Assigned to    demo.finance.manager Policy          Amount threshold + segregation of duties   |
+------------------------------------------------------------------------------------------------+
| # | Account / Nominal                         | Description             | Debit      | Credit    |
| 1 | 50-02-00100 Professional Fees             | August advisory fee     | 25,000.00  |     0.00  |
| 2 | 20-01-00100 Accounts Payable              | Vendor liability        |      0.00  |25,000.00  |
|------------------------------------------------------------------------------------------------|
| TOTAL DEBIT 25,000.00 | TOTAL CREDIT 25,000.00 | DIFFERENCE 0.00 [BALANCED]                    |
+------------------------------------------------------------------------------------------------+
| Decision comment * [_______________________________________________________________]           |
| [Return for Correction] [Reject]                                      [Approve]                 |
+------------------------------------------------------------------------------------------------+
| Audit preview: decision records actor, role, company, level, comment, time, and prior state.    |
+------------------------------------------------------------------------------------------------+
```

Approval rules:

- requester cannot self-approve when policy prohibits it;
- Approve/Reject/Return actions require a comment according to policy;
- approval does not silently post unless the approved workflow explicitly
  defines processing and the actor has posting permission;
- all decisions are atomic and auditable;
- stale decisions fail if another approver already changed the state.

## Screen 5 — Reverse Posted Journal

Capability state: `[IMPLEMENTED]`, shown as a controlled confirmation rather
than deletion/edit.

```text
+-------------------------------------------------------------------------------+
| Reverse JV-2026-0017                                                    [X]    |
| A reversal creates a new balanced journal. The original remains unchanged.    |
|                                                                               |
| Original date       18 Aug 2026       Original amount     USD 1,250.00         |
| Reversal date *     [18 Aug 2026___]  Open period         Aug 2026             |
| Reason *            [Duplicate office-supplies entry_______________________]   |
|                                                                               |
| Result preview                                                                 |
| Dr Main Operating Bank       1,250.00                                          |
| Cr Office Expense                         1,250.00                              |
| TOTAL DEBIT = TOTAL CREDIT   [BALANCED]                                        |
|                                                                               |
| [Cancel]                                                   [Create Reversal]   |
+-------------------------------------------------------------------------------+
```

Success state links both documents:

```text
Reversal JV-2026-0018 posted successfully.
[Open reversal] [Open original] [View affected General Ledger]
```

## Journal acceptance criteria

- the complete document is understandable without database IDs;
- totals remain visible while lines scroll;
- all money uses fixed decimal alignment and currency context;
- posted records expose no edit/delete action;
- status, permission, balance, period, and workflow control failures say what
  must change without leaking sensitive internals;
- keyboard and mobile users can add, review, validate, and correct every line.

