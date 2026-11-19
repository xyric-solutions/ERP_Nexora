# Historical accounting cutover assessment — 19 November 2026

**Conclusion: cutover is not approved and must not be executed yet.** This is a
read-only assessment of preserved PostgreSQL records at the inspection cutoff
2026-11-19, not an approved migration date. See the
[configuration register](owner-accounting-configuration-register.md) and
[captured evidence](../evidence/2026-11-19-accounting-readiness-phase3.json).

R06-UAT's legal/business status requires CFG-01 confirmation. R06-UAT-2 has no
chart, fiscal calendar or accounting transactions and is not configured for
acceptance. No record is classified as disposable solely from its R06/UAT name.

## Opening balances and existing General Ledger

All three GL journals are posted and have matching posted manual-journal source
events. Each is balanced in native/base USD; none has a reversal link.

| Manual journal / GL entry            | Posting date | Recorded reference | Debit 230907, USD | Credit 310111, USD | Owner disposition                  |
| ------------------------------------ | ------------ | ------------------ | ----------------- | ------------------ | ---------------------------------- |
| MJ-2026-000001 / JE-2026-04-00000001 | 2026-10-30   | Opening Capital    | 100,000.00        | 100,000.00         | PENDING                            |
| MJ-2026-000002 / JE-2026-05-00000001 | 2026-11-17   | Opening Capital    | 10,000.00         | 10,000.00          | PENDING                            |
| MJ-2026-000003 / JE-2026-05-00000002 | 2026-11-17   | Opening Capital    | 1,000,000.00      | 1,000,000.00       | PENDING                            |
| Total                                |              |                    | **1,110,000.00**  | **1,110,000.00**   | Not a signed opening trial balance |

Current trial balance: 230907 “Js Bank (USD)” debit **1,110,000.00** and 310111
“Capital Mr. A” credit **1,110,000.00**. P&L has no revenue/expense activity.
The application trial balance, fiscal-period GL, balance sheet and P&L were
compared with independent journal SQL. These results establish arithmetic and
projection consistency for recorded capital only. They do not prove actual bank
funding, completeness of liabilities, genuine equity ownership or business
opening balances.

The three journals share a reference but differ in amount/date/source identity.
No exact duplicate posted source was found. Obtain funding/deposit evidence and
an owner-signed opening trial balance before deciding whether all three belong
to retained business history. Do not delete, reverse or consolidate them based
on repeated wording alone. Recorded self-approval is historical workflow evidence,
not independent owner acceptance of cutover.

## Historical purchase queue

There are 28 purchase documents: 5 approved requests, 6 approved RFQs, 4 approved
orders plus 1 submitted order, 4 approved receipts, 4 approved bills and 4 approved
payment instructions. All eight financial candidates below are version **3**.
Source records and bill allocations resolve within the company/currency.

| Bill     | Supplier | Document / bill date               | External reference | Recorded due date / term | Gross USD    | Linked approved instruction | Financial recognition / settlement |
| -------- | -------- | ---------------------------------- | ------------------ | ------------------------ | ------------ | --------------------------- | ---------------------------------- |
| BILL-001 | SUP-001  | 2026-11-10 / legacy bill_date null | 01001              | 2026-11-10 / manual null | 1.00         | PAY-001, USD 1.00           | None / none                        |
| BILL-002 | SUP-001  | 2026-11-11 / legacy bill_date null | 0102               | 2026-11-27 / manual null | 5,000.00     | PAY-002, USD 5,000.00       | None / none                        |
| BILL-003 | SUP-001  | 2026-11-17 / 2026-11-17            | 010                | 2026-11-17 / immediate   | 10.00        | PAY-003, USD 10.00          | None / none                        |
| BILL-004 | SUP-002  | 2026-11-18 / 2026-11-18            | 0101               | 2026-12-03 / 15 days     | 10.00        | PAY-004, USD 10.00          | None / none                        |
| Total    |          |                                    |                    |                          | **5,021.00** | **5,021.00 gross**          | No resulting AP, GL or bank effect |

All four instructions fully allocate their linked bill amounts. PAY-001,
PAY-002 and PAY-004 record 0% WHT; PAY-003 records **10% WHT**. There are no
governed tax codes/mappings or posted applications to substantiate that rate.
Do not silently change it to zero, adopt it as a general rate, or process it
through an ungoverned tax account. Its exact source version and approved tax
treatment require owner/tax review.

The USD 5,021 is a commercial document total, **not an established unpaid supplier
liability or proof of payment**. Obtain supplier statements, invoices, credit/debit
notes and bank/payment evidence to determine genuine balances. A fully allocated
approved instruction is a reservation/intent, not a posted settlement.

The submitted purchase order must receive its own retain/complete/exclude decision;
do not include it as an invoice or an opening liability merely because it has
an amount. Preserve legacy bill dates and terms; new supplier defaults must not
rewrite this history.

### Duplicate and outstanding checks

- **0 duplicate-reference groups** among noncancelled/nonrejected bills, using
  supplier + normalized nonblank reference + currency.
- **0 duplicate fingerprint groups** using supplier + document date + currency +
  gross amount + normalized commercial line fields. This is a candidate screen,
  not proof against duplicate external invoices or missing source documents.
- **0 duplicate posted journal source groups**, broken chart parents, broken
  purchase source links, invalid bill allocations, broken journal/account links,
  unbalanced posted journals or future-dated journals in either inspected company.
- **0 posted AP/AR items and 0 financial operations**. There are consequently no
  recorded posted customer receipts, supplier advances, offsets, credit balances
  or AR/AP aging balances. Missing customer/supplier external statements remain
  an evidence gap; these zeros do not establish approved zero opening AR/AP.
- Four bill due dates exist in the operational queue, but no financial aging may
  be certified from them until genuine open balances and cutover treatment are
  approved. Do not simultaneously post the old invoices and an opening balance
  representing those same invoices.

## Bank instructions and reconciliation

| Item              | Persisted state                                | Recorded amount, USD                               | GL effect                         | Required decision                                                                                                                                |
| ----------------- | ---------------------------------------------- | -------------------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| BR-2026-00000001  | Approved bank receipt, 2026-11-18              | 5,000.00                                           | No original/reversal journal      | Confirm actual payer, source receipt and bank evidence; determine whether it overlaps any opening amount or requires an authorized live receipt. |
| BP-2026-00000001  | Approved bank payment, 2026-11-18              | 100.00                                             | No original/reversal journal      | Confirm payee, purpose, external settlement and any relationship to the purchase queue.                                                          |
| MANUAL-2026-11-18 | In-progress manual reconciliation, no approver | Statement 1,000,000.00; book/adjusted 1,110,000.00 | Stored difference **−110,000.00** | Obtain bank statement/funding evidence and explain the difference before reviewed reconciliation.                                                |

Receipt/payment approvals have explicit stored override event IDs. Their maker
and approver are the same existing owner account; this is not evidence of the
independent authenticated acceptance journeys required for go-live. No claim of
unauthorized historical action is made from matching actor IDs alone.

The reconciliation is for the USD nominal 230907. The difference's magnitude
equals the first two capital entries combined, but that coincidence does not
identify which balance or entry is wrong. **Do not create an adjustment to make
the reconciliation balance without supporting evidence.** Zero unmatched-row
counts do not overcome a nonzero difference or missing approval.

No statement imports or statement lines exist, so zero unreconciled imported
lines is an empty-dataset observation, not external bank reconciliation. The
approved USD 5,000 receipt is unposted; it must not be reported as an unapplied
posted AR receipt. The other three bank capabilities have recorded zero book
balances, but lack signed bank confirmations in the reviewed evidence.

## Cutover decision and execution controls

No approach below is selected or approved:

1. **Retained detailed history:** retain existing posted entries; process only
   genuine, unrecognized approved documents through normal governed preparation,
   approval and posting after configuration. Record source-to-operation links.
2. **Opening-only external migration:** use an owner-signed cutoff and detailed
   party/currency schedules through supported controlled accounting workflows.
   Preserve old operational rows with a documented exclusion/disposition so the
   same amounts cannot later be recognized again.
3. **Reviewed mixed cutover:** explicitly identify the population represented in
   opening schedules versus detailed history. Each external invoice/receipt and
   source ID must have exactly one accounting representation.

If the current company is confirmed acceptance-only, retain it and scope business
acceptance to the explicitly approved company. This audit does not authorize a
new company, deletion/reset or conversion of test records into business history.

For each candidate record, approve company/source ID and version, external
document, genuine gross/tax/settled/outstanding native amounts, original FX/base
carrying value, due/installment schedule, target representation, linked opening
line or financial operation, and named owner/reviewer. All disposition fields
are currently **PENDING**; no import payload or financial transaction has been
created. Record exact source IDs in the accompanying evidence JSON.

Before execution: freeze a signed cutoff population; reconcile signed customer,
supplier and bank schedules with the opening GL; resolve duplicates and the
USD 110,000 difference; approve mappings/tax/periods and named actors; obtain a
verified backup; rehearse the approved dataset in an isolated restored database.
Then obtain explicit authorization for the exact live batch. After execution,
verify one posting per source, native/base subledger-to-GL control reconciliation,
bank evidence, aging, TB/BS/P&L and immutable audit IDs, with independent signoff.

Corrections must use supported reversals/credits after necessary downstream
unwinding. No destructive rollback, SQL balance edits, generic control-account
vouchers, retrospective changes to posted rates/dimensions, or forced bank
matches are permitted.
