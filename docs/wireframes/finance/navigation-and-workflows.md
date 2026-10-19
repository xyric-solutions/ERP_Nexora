# Accounting & Finance — Proposed Navigation and Workflows

- Status: `PROPOSED — OWNER REVIEW REQUIRED`
- Runtime change: none
- Rule: every destination and action carries a capability state from the Demo
  Action Matrix.

## Business navigation tree

```text
ACCOUNTING & FINANCE
|
|-- Overview
|   |-- Finance Dashboard                         [IMPLEMENTED]
|   `-- My Finance Work                           [COMING SOON]
|
|-- Accounts & Ledgers
|   |-- Chart of Accounts                         [IMPLEMENTED]
|   |   |-- Complete Chart                        [IMPLEMENTED]
|   |   |-- Categories & Sections                 [COMING SOON]
|   |   |-- Nominal Accounts                      [IMPLEMENTED as filtered view]
|   |   `-- Account Groups                        [COMING SOON]
|   |-- General Ledger                            [IMPLEMENTED]
|   `-- Accounting Events                         [COMING SOON]
|
|-- Journals
|   |-- New Journal                               [IMPLEMENTED: create + post]
|   |-- Journal Register                          [IMPLEMENTED]
|   |   |-- Draft                                 [COMING SOON]
|   |   |-- Pending Approval                      [COMING SOON]
|   |   |-- Posted                                [IMPLEMENTED]
|   |   `-- Reversed                              [IMPLEMENTED]
|   |-- Recurring Journals                        [IMPLEMENTED]
|   `-- Reversals                                 [IMPLEMENTED]
|
|-- Planning & Close
|   |-- Budgets                                   [COMING SOON]
|   |-- Budget vs Actual                          [IMPLEMENTED]
|   |-- Period Management                         [IMPLEMENTED: close/reopen]
|   `-- Close Workbench                           [COMING SOON]
|
|-- Intercompany & Consolidation
|   |-- Intercompany Transactions                 [COMING SOON]
|   |-- Consolidation Groups                      [COMING SOON]
|   `-- Consolidated Statements                   [NOT AVAILABLE: Demo setup]
|
|-- Financial Reports
|   |-- Trial Balance                             [IMPLEMENTED]
|   |-- Profit & Loss                             [IMPLEMENTED]
|   |-- Balance Sheet                             [IMPLEMENTED]
|   |-- Cash Flow                                 [IMPLEMENTED]
|   |-- Journal Report                            [COMING SOON]
|   `-- Account Statement                         [COMING SOON]
|
|-- Controls & Audit
|   |-- Cash & Bank                               [COMING SOON]
|   |-- Bank Reconciliation                       [COMING SOON]
|   |-- Tax Rules                                 [COMING SOON]
|   |-- Finance Audit Trail                       [COMING SOON]
|   `-- Report Catalogue                          [COMING SOON]
|
`-- Future Subledgers
    |-- Accounts Receivable                       [COMING SOON]
    |-- Accounts Payable                          [COMING SOON]
    `-- Fixed Assets                              [COMING SOON]
```

Navigation behavior:

- the active group and destination are announced in text, not only color;
- group counts show actionable items, never decorative totals;
- a destination requiring a permission is omitted when access is denied;
- `COMING SOON` destinations open an honest capability page with purpose,
  intended workflow, dependencies, and status—never a blank shell;
- `NOT AVAILABLE` explains the company/setup reason and offers no fake action;
- desktop groups expand inline; mobile uses a full-height drawer with the same
  order and state labels;
- Demo identity remains visible while the navigation is open or collapsed.

## Global Finance page frame

```text
+--------------------------------------------------------------------------------------+
| NEXORA | DEMO — Nexora Demo Company | Company v | Search | Help | Alerts | Sarah v   |
+----------------------+---------------------------------------------------------------+
| ACCOUNTING & FINANCE | Breadcrumb / page title                    Data as of 10:42   |
| Overview             | Context / fiscal period / currency / filters                 |
| Accounts & Ledgers   +---------------------------------------------------------------+
| Journals             | Page content                                                  |
| Planning & Close     |                                                               |
| Intercompany...      |                                                               |
| Financial Reports    |                                                               |
| Controls & Audit     |                                                               |
| Future Subledgers    |                                                               |
+----------------------+---------------------------------------------------------------+
| Demo data. Resettable. Never use for production decisions.           Status / Help   |
+--------------------------------------------------------------------------------------+
```

## Workflow 1 — manual journal

Current safe path:

```text
[IMPLEMENTED]
New Journal -> select existing accounts -> enter 2+ lines -> validate balance
            -> Create & Post -> Posting Engine -> Journal -> GL -> Statements
                                      |
                                      `-> immutable audit event
```

Target mature path:

```text
Save Draft        Submit             Approval             Process/Post
[COMING SOON]     [COMING SOON]      [COMING SOON]        [COMING SOON]
     |                 |                    |                    |
     v                 v                    v                    v
  DRAFT ----------> SUBMITTED ------> PENDING APPROVAL --> APPROVED
                                                |               |
                                                | reject/return | authorized post
                                                v               v
                                            REJECTED          POSTED
                                                                  |
                                                   reverse only   v
                                                              REVERSED

Required document lines:
Account | Nominal | Description | Debit | Credit
TOTAL DEBIT = TOTAL CREDIT
```

Controls:

- account and nominal values come from active master records;
- header includes journal number, date, company, period, reference, description,
  source, currency, and exchange-rate context;
- posting is impossible while unbalanced, outside an open period, against a
  non-postable account, or without required dimensions/approval;
- requester, approver, decision comments, timestamps, and audit identifiers are
  visible in history;
- posted journals are never edited or deleted; correction uses reversal.

## Workflow 2 — account lifecycle

```text
Browse hierarchy [IMPLEMENTED]
        |
        +-> inspect account and GL [IMPLEMENTED]
        |
        `-> create account [IMPLEMENTED]
                 |
                 `-> edit / activate / deactivate [COMING SOON]

Category -> Section -> Nominal/Postable Account -> Journal Line -> General Ledger
```

Required controlled fields:

```text
Code | Name | Type | Category | Section | Nominal | Parent | Status
Normal Balance | Currency | Company | Active/Inactive | Posting Controls
```

## Workflow 3 — recurring journal

```text
Template list -> Create template -> Generate draft
[IMPLEMENTED]    [IMPLEMENTED]      [IMPLEMENTED]
                                          |
                                          v
                                  Open generated draft
                                     [COMING SOON]
                                          |
                                          v
                                normal approval/post path
                                     [COMING SOON]
```

The generator may prepare a draft; it must never bypass balance, period,
approval, segregation-of-duties, posting, or audit controls.

## Workflow 4 — period close

```text
Period directory       Close-readiness        Decision        Closed
[COMING SOON]     ->   [COMING SOON]     ->  Close [IMPLEMENTED] -> lock posting
                              |
                              +-- unposted journals
                              +-- imbalance checks
                              +-- recurring due
                              +-- bank reconciliation
                              `-- approval/exceptions

Closed -> Reopen request/reason -> Reopen [IMPLEMENTED] -> audit -> Open
```

The existing close/reopen actions are real. The proposed workbench adds honest
readiness and exception visibility; it does not claim that missing subledgers
or reconciliation services exist.

## Workflow 5 — report to source drill-down

```text
Financial Statement [IMPLEMENTED]
        |
        v
Statement line / account [IMPLEMENTED where GL drill-down is linked]
        |
        v
General Ledger lines [IMPLEMENTED]
        |
        v
Journal document [COMING SOON]
        |
        v
Accounting Event / business source [COMING SOON]
        |
        v
Audit history [COMING SOON UI; backend read exists]
```

Every report header shows company, period/date range, basis, currency, generated
time, data freshness, and filters. Dashboard values must come from the same
reporting services; no visual receives a hardcoded financial number.

## Workflow 6 — intercompany and consolidation

```text
Intercompany request [COMING SOON]
       -> balanced company A leg + balanced company B leg
       -> atomic posting through Posting Engine
       -> due-to / due-from reconciliation
       -> consolidation group and eliminations [COMING SOON]
       -> consolidated statement [NOT AVAILABLE in current Demo setup]
```

The current Demo contains one company. It must not invent a second legal entity
merely to make consolidation appear complete.

## Workflow 7 — end-to-end accounting trace

```text
Business Transaction
   -> Accounting Event
   -> Posting Engine
   -> Balanced Journal
   -> General Ledger
   -> Financial Report
   -> Drill-down
   -> Audit Trail
```

The backend Demo verifier already proves this invariant for implemented seeded
paths. The proposed screens make that evidence visible without changing the
underlying accounting rules.

## Approval and action rules

```text
Role may view page? -------- no -------> destination/action hidden
        |
       yes
        v
Action applicable to state? - no ------> disabled + reason
        |
       yes
        v
Backend permission granted? - no ------> deny + safe error + audit
        |
       yes
        v
Business controls satisfied? - no -----> no write + field/control errors
        |
       yes
        v
Perform action atomically -> audit -> refresh authoritative state
```

## Review decisions

The owner should decide:

- whether the proposed group names match Xyric's commercial terminology;
- whether manual journals require approval for all amounts or only configured
  thresholds;
- whether accountants may post their own low-value journals;
- whether company/period/currency controls belong in the global header or the
  page context row;
- whether future destinations remain visible with `COMING SOON` or are hidden
  from non-admin Demo roles.

