# FIN-WF-06 — Controls, Intercompany, Consolidation, and Audit

- Screens: 6
- Status: `PROPOSED — OWNER REVIEW REQUIRED`
- Principle: backend capability, seeded master data, and a complete user
  workflow are distinct claims.

## Screen 1 — Accounting Event Ledger

Capability state: list/submit API `[IMPLEMENTED]`; Finance UI `[COMING SOON]`.

```text
+------------------------------------------------------------------------------------------------+
| Accounting & Finance / Accounts & Ledgers / Accounting Events       [COMING SOON] [DEMO]      |
| Company: Nexora Demo Company | State: All v | Source module: All v | Search event/source ID... |
+------------------------------------------------------------------------------------------------+
| Event ID       Received       Type                  Source Ref       State       Journal          |
| AE-000002      18 Aug 10:34   MANUAL_JOURNAL        EXP-0818         Posted      JV-2026-0017 >   |
| AE-000001      17 Aug 15:12   PROCUREMENT_RECEIPT   PO-DEMO-001      Posted      JV-2026-0015 >   |
+------------------------------------------------------------------------------------------------+
| Select event for trace                                                                          |
| Business source PO-DEMO-001 -> AE-000001 -> Posting Engine -> JV-2026-0015 -> GL -> Reports     |
| [Open payload summary] [Open journal: SOON] [Open audit: SOON]                                  |
+------------------------------------------------------------------------------------------------+
| The backend list/intake is real. This page is not implemented in the current Demo frontend.     |
+------------------------------------------------------------------------------------------------+
```

Event payload display masks sensitive fields, verifies tenant/company scope,
shows idempotency identity/state, and never offers direct ledger editing.

## Screen 2 — Cash, Bank, and Tax Control Centre

Capability state: seeded BankAccount and TaxRule records exist; management,
transaction, and reconciliation workflows are `[COMING SOON]`.

```text
+------------------------------------------------------------------------------------------------+
| Accounting & Finance / Controls & Audit                         [COMING SOON] [DEMO]            |
| [Cash & Bank] [Reconciliation] [Tax Rules]                                                     |
+------------------------------------------------------------------------------------------------+
| BANK / CASH MASTERS                         | TAX RULE MASTERS                                  |
| 2 seeded bank accounts                      | 2 seeded tax rules                                |
| Main Operating Bank · USD                   | Pakistan reference rule                           |
| Petty Cash · USD                            | Demo secondary rule                               |
|                                             |                                                   |
| Management UI       Not implemented         | Management UI      Not implemented                |
| Bank transactions   Not implemented         | Tax returns/report  Not implemented                |
| Reconciliation      Not implemented         | Filing workflow     Not implemented                |
| [View capability details]                   | [View capability details]                         |
+------------------------------------------------------------------------------------------------+
| Seeded master data supports implemented Finance postings. It is not a completed bank/tax module.|
+------------------------------------------------------------------------------------------------+
```

This honest status page replaces the word `shell`. It contains no Add,
Reconcile, File, Submit, or Post control until those actions are real.

## Screen 3 — Intercompany Transaction

Capability state: atomic service logic exists; API/UI/company configuration is
`[COMING SOON]`.

```text
+------------------------------------------------------------------------------------------------+
| Intercompany Transactions                                      [COMING SOON] [DEMO]            |
| This Demo has one company. A complete intercompany transaction cannot be exercised here.        |
+------------------------------------------------------------------------------------------------+
| Planned transaction header                                                                       |
| From company * [Select company v]   To company * [Select company v]                              |
| Date *         [dd mmm yyyy]        Reference *  [____________]                                 |
| Currency       [___]                Rate         [___________]                                  |
| Description    [______________________________________________________________]                 |
|------------------------------------------------------------------------------------------------|
| Company A: balanced due-to leg       | Company B: balanced due-from leg                         |
| Account | Nominal | Debit | Credit   | Account | Nominal | Debit | Credit                       |
| TOTAL DEBIT = TOTAL CREDIT           | TOTAL DEBIT = TOTAL CREDIT                               |
|------------------------------------------------------------------------------------------------|
| Atomic result: both companies post, or neither company posts.                                    |
| No executable action is shown in the current Demo.                                               |
+------------------------------------------------------------------------------------------------+
```

## Screen 4 — Consolidation Workspace

Capability state: report-job API/UI exists, but no valid seeded group; current
Demo status is `[NOT AVAILABLE]`. Group configuration is `[COMING SOON]`.

```text
+------------------------------------------------------------------------------------------------+
| Intercompany & Consolidation / Consolidated Statements       [NOT AVAILABLE] [DEMO]            |
+------------------------------------------------------------------------------------------------+
| Consolidation requires a configured group with two or more eligible companies and               |
| approved elimination rules. Nexora Demo Company is a single-company environment.                 |
|                                                                                                  |
| Group                 Not configured                                                             |
| Reporting period      —                                                                          |
| Elimination version   —                                                                          |
|                                                                                                  |
| [Run Consolidation — unavailable]                                                                |
| Reason: no consolidation group is available to this Demo Company.                                |
| [View planned capability]                                                                        |
+------------------------------------------------------------------------------------------------+
```

Future group screen:

```text
Group -> member companies -> ownership/effective dates -> reporting currency
      -> elimination accounts/rules -> version approval -> report job -> output
      [COMING SOON]
```

No second company or consolidation result is fabricated solely for a demo.

## Screen 5 — Finance Audit Trail

Capability state: read API and immutable audit persistence `[IMPLEMENTED]`;
Finance page `[COMING SOON]`.

```text
+------------------------------------------------------------------------------------------------+
| Accounting & Finance / Controls & Audit / Finance Audit Trail       [COMING SOON] [DEMO]       |
| Date: 18 Aug v | Actor: All v | Action: All v | Entity: All v | Search ID/reference...          |
+------------------------------------------------------------------------------------------------+
| Time      Actor                  Action               Entity             Result     Reference    |
| 10:35:12  demo.accountant        JOURNAL_POSTED       JournalEntry       Success    JV-2026-0017 >|
| 10:34:58  demo.accountant        JOURNAL_CREATED      JournalEntry       Success    JV-2026-0017 >|
| 09:12:07  demo.finance.manager   JOURNAL_REVERSED     JournalEntry       Success    JV-2026-0016 >|
+------------------------------------------------------------------------------------------------+
| Selected audit event                                                                            |
| Company      Nexora Demo Company     Request / correlation ID   req-...                          |
| Before       Posted journal unchanged                                                   |
| After        Reversal journal linked                                                     |
| Integrity    Chain verified                                                              |
| [Open entity: SOON] [Copy audit reference]                                               |
+------------------------------------------------------------------------------------------------+
```

Mobile:

```text
+--------------------------------------+
| < Finance Audit Trail [COMING SOON]  |
| [Date] [Actor] [Action]              |
+--------------------------------------+
| 10:35 · JOURNAL_POSTED · Success     |
| demo.accountant · JV-2026-0017    >  |
| 09:12 · JOURNAL_REVERSED · Success   |
| demo.finance.manager              >  |
+--------------------------------------+
| Audit chain: Verified                |
+--------------------------------------+
```

Audit page rules:

- reads never mutate or reconstruct audit evidence;
- sensitive payload values are masked;
- tenant/company/role filters apply on the backend;
- failures and denied controlled actions are included where policy permits;
- CSV/export is `COMING SOON` until secure artifact generation exists.

## Screen 6 — Finance Report Catalogue

Capability state: read/manage API `[IMPLEMENTED]`; catalogue UI and scheduling
`[COMING SOON]`.

```text
+------------------------------------------------------------------------------------------------+
| Accounting & Finance / Controls & Audit / Report Catalogue          [COMING SOON] [DEMO]      |
| Search reports... | Type: All v | Status: Active v | [+ New Definition: permission + SOON]    |
+------------------------------------------------------------------------------------------------+
| Report                  Type              Source / freshness       Status       Action           |
| Trial Balance           Financial         Live ledger query        Active       [Run LIVE]       |
| Profit & Loss           Financial         Live ledger query        Active       [Run LIVE]       |
| Balance Sheet           Financial         Live ledger query        Active       [Run LIVE]       |
| Cash Flow               Financial         Live ledger query        Active       [Run LIVE]       |
| Budget vs Actual        Management        Live budget + actual     Active       [Run LIVE]       |
| Consolidated Statement  Consolidated      Requires valid group     Unavailable  [Reason]         |
+------------------------------------------------------------------------------------------------+
| Definition editing, custom columns, saved filters, distribution, and scheduling: COMING SOON.  |
+------------------------------------------------------------------------------------------------+
```

## Control acceptance criteria

- “model exists,” “API exists,” “UI exists,” and “Demo can complete it” remain
  separately evidenced;
- no placeholder uses an enabled business-action button;
- unavailable company capabilities explain the reason;
- accounting event, journal, GL, report, and audit identifiers form one
  navigable trace when their proposed UI is implemented;
- intercompany remains atomic and consolidation remains versioned;
- audit evidence is immutable and access controlled;
- Cash/Bank and Tax do not appear mature merely because seed records exist.

