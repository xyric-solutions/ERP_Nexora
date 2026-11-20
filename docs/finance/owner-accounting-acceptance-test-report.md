# Owner accounting acceptance plan and current report — 19 November 2026

**Owner accounting acceptance: NOT COMPLETE. Authorized live posting cases
executed in Phase 3: 0.** This document contains a controlled plan and the actual
read-only results obtained so far. It is not a certificate of business approval.

20 November software integration update: the separate
[operational repair report](../architecture/operational-integration-repair.md)
records authenticated disposable-PostgreSQL stock/manufacturing, Sales, AP/AR,
banking and reconciliation journeys. Those technical tests do not execute or
approve any of the owner cases below. The baseline/build and report observations
below remain the historical 19 November snapshot; consult that repair report for
the current software release and migration verification. Business configuration,
historical record disposition and the existing bank difference remain pending.

Application baseline: `f71ffe9`; active frontend build
`nXe0dnHNr_y0YWqWMezFO`; Finance 43 / Procurement 8. The
[configuration register](owner-accounting-configuration-register.md) and
[cutover assessment](historical-accounting-cutover-assessment.md) define the
unresolved inputs. The inspection date 2026-11-19 is not an approved posting date.

## Results actually obtained in this phase

| Verification                                                          | Actual outcome                                                                                                                                 | Limit of evidence                                                                                                                                        |
| --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Read-only PostgreSQL configuration/history audit                      | **85 SELECT queries**, both companies, repeatable-read transaction with `transaction_read_only=on`; zero business writes.                      | Snapshot observation; no owner approval inferred.                                                                                                        |
| Financial application-service comparison with independent journal SQL | **44 assertions passed, 0 failed**. Connections default read-only; normal company authority and RLS retained.                                  | Uses the original active account's resolved server permissions; no password login, browser session fabrication or owner-authenticated posting journey.   |
| Current report projections                                            | **14 rendered, 2 blocked** out of 16 requested reports: six financial and two supplier reports per company.                                    | R06-UAT-2 supplier outstanding/advance reports reject `REPORT_FISCAL_YEAR_MISSING` (409). This guard is retained; no From date or calendar was invented. |
| Trial balance and GL, R06-UAT                                         | USD debit/credit **1,110,000.00 / 1,110,000.00**; TB two account rows, fiscal-period GL six lines; totals and account balances agree with SQL. | All recorded activity is opening capital, not completed sales/purchase acceptance.                                                                       |
| Balance sheet / P&L, R06-UAT                                          | BS two rows and balanced; P&L no rows, USD 0.00.                                                                                               | Does not demonstrate complete liabilities, tax, revenue recognition or correct real-world opening equity.                                                |
| Customer/supplier statements, FX, aging and supplier reports          | No posted AP/AR items or financial operations. R06-UAT supplier outstanding/advance reports render empty.                                      | Empty results do not establish approved zero external balances. No nonzero business aging/FX acceptance case executed.                                   |
| Historical consistency                                                | No duplicate invoice candidate groups by either reviewed method; zero broken links/unbalanced posted sources in the inspected population.      | Limited to existing database records; no external invoice completeness certification.                                                                    |
| Bank reconciliation                                                   | Existing MANUAL-2026-11-18 remains in progress, difference **−USD 110,000.00**.                                                                | **UNRESOLVED business acceptance blocker**; no imported bank statements or approved reconciliation.                                                      |
| Posted-data preservation                                              | Existing Phase 2 read-only preservation verifier passed: historical financial/master records and native/base balances remain unchanged.        | No mutations performed in this phase; no financial correction attempted.                                                                                 |
| Runtime/source alignment                                              | Candidate verification matched **1,147 source files**, **1,256 compiled files** and the active build ID; readiness checks pass.                | Technical deployment consistency, not go-live approval.                                                                                                  |

The first report-verification attempt stopped on the second company's missing
fiscal year. The final report records those two outcomes as **BLOCKED**, while
separately verifying the expected 409 guard. A temporary evidence-export decimal
display error was corrected and exact export-to-report equality was added before
final evidence generation. Database values and comparison arithmetic were
unaffected. Neither intermediate result is presented as a passed business case.

The separate HTTP-only runtime helper was corrected to inspect client-page
document/asset hashes rather than require client-rendered form text in raw HTML,
and to include the required `as_of` in its anonymous request (the incomplete
query correctly returned 400). Final checks passed: login document 200, all 14
served scripts match the pinned build, valid anonymous financial request 401.
No application/authentication behavior was changed and no owner login was claimed.

Phase 2 evidence remains applicable to the unchanged software: 1,630 unit, 266
financial integration, 63 security, 27 contract and 7 authenticated browser tests
passed (1,993 total). Two isolated browser cases completed AR and AP through bank
reconciliation. These are **prior isolated technical results**, not newly rerun
Phase 3 tests or owner-approved live business journeys.

## Execution gates

All applicable gates must have specific evidence before any later live case:

1. **Company/cutoff:** sign CFG-01; identify whether each retained record belongs
   to business history. Select an approved case date and open period. Do not
   silently move a historical transaction into a convenient period.
2. **Configuration:** sign the exact applicable CFG items, including the eight
   distinct eligible mappings, canonical masters, terms, finite credit, tax,
   currencies/rates, dimensions and banks. Capture resulting versions and audit
   IDs only after separately authorized configuration.
3. **Cutover:** sign opening TB and party/currency detail, dispositions of the
   capital journals, BILL/PAY queue and bank instructions; resolve the USD 110,000
   bank difference and obtain external statements. Each amount has one accounting
   representation.
4. **People/access:** identify real authorized maker, independent checker,
   poster and bank reconciler/approver; verify their actual company-scoped
   permissions. Any approved exception requires its existing controlled evidence.
   No UAT/demo identity or fabricated authenticated session substitutes for this.
5. **Exact case authorization:** identify real document IDs, amounts, tax codes,
   rate IDs/dates, expected journal lines and financial deltas, settlement bank,
   external reference, evidence and named owner. Broad approval of the software
   is not authorization for an unspecified live transaction.
6. **Recovery/rehearsal:** retain a verified backup and signed before-state;
   rehearse approved real business data in an isolated restored database. Negative
   tests and reversals without a genuine business correction belong there. No
   artificial live invoice, dummy customer or unnecessary live reversal is needed
   merely to exercise a test.

Execution order: approved configuration/opening/cutover → AR/AP recognition and
notes → receipts/payments/FX → bank reconciliation → dated aging/control reports
→ financial statements → approved correction/reversal cases → final signoff.

## Controlled case register

All cases below are **NOT RUN / BLOCKED BY OWNER INPUTS** for business acceptance.
Read-only checks above and prior isolated results must not be entered as the
owner's case pass. Amounts and identities are intentionally not invented.

| Case                                           | Controlled scenario and checks                                                                                                                                                                                                                        | Expected accounting/evidence                                                                                                                                                                                      | Required decisions                                             |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| AAT-01 Configuration authorization             | Review exact company/master/account IDs, versions, terms, credit, tax, rates, fiscal period and approved actors against signed register. Verify canonical master reuse.                                                                               | No posting simply from setup; immutable configuration evidence; no duplicate identity, wrong-company master or header/control bypass.                                                                             | CFG-01–23, CFG-25, CFG-28 as applicable                        |
| AAT-02 Customer invoice                        | Select genuine customer and approved invoice; preview date/term/schedule, currency, dimensions, tax and available credit; submit, independently approve and post once.                                                                                | AR control debit; approved revenue and applicable tax credits; balanced native/base GL; customer open item and original journal/source/audit links.                                                               | CFG-04, CFG-06, CFG-12, CFG-14, CFG-16–22, CFG-25, CFG-28      |
| AAT-03 Customer receipt                        | Use genuine bank receipt, currency/date and allocation to AAT-02; independently approve/post; verify partial and final outstanding where the approved real case supports them.                                                                        | Bank debit / AR credit plus only approved fee, tax or FX legs; one bank movement; original carrying value and customer statement agree with GL.                                                                   | CFG-04, CFG-12, CFG-17–23, CFG-27–28                           |
| AAT-04 Supplier invoice                        | Use approved genuine source chain/bill or explicitly approved cutover document; retain source dates/terms/dimensions; separately approve Finance recognition and post.                                                                                | Approved expense/asset and recoverable-tax debits as applicable; AP control credit; supplier open item; source version and one accounting binding.                                                                | CFG-05, CFG-07, CFG-13, CFG-15, CFG-17–22, CFG-25–26, CFG-28   |
| AAT-05 Supplier payment                        | Use approved real instruction, bank and invoice allocation; separately approve Finance payment; compare gross, discounts, WHT, fees, net cash and FX before posting.                                                                                  | AP debit; bank credit and governed withholding/discount/FX legs as applicable; balanced journal, correct supplier residual and bank effect. Approved instructions alone are not settlement.                       | CFG-05, CFG-13, CFG-17–23, CFG-26–28                           |
| AAT-06 Customer credit/debit correction        | Use a genuine approved original invoice and documented issuer/business meaning. Verify controlled credit limits and source reference. A debit/increasing correction must use its supported positive recognition effect.                               | Credit reduces AR through correct revenue/tax legs; no unbounded excess credit or negative-amount bypass. Original item, approvals and note direction traceable.                                                  | CFG-04, CFG-06, CFG-12, CFG-17–18, CFG-26, CFG-28              |
| AAT-07 Supplier credit/debit notes             | Confirm issuer convention: a supplier-issued debit note increases AP; supplier credit note reduces AP. Exercise approved credit/offset/refund flow as applicable.                                                                                     | Correct signed AP/expense-or-asset/tax effect, source invoice and allocation bounds; native/base control differences zero. Do not infer the direction from the label alone.                                       | CFG-05, CFG-07, CFG-13, CFG-17–18, CFG-26, CFG-28              |
| AAT-08 Tax treatment                           | Confirm genuine taxable, exempt/zero-rated and withholding cases only where applicable and signed. Review governed definition/revision, rate, region, dates, module, trigger and account. Include PAY-003's historic 10% issue in disposition review. | Tax basis/rate/rounding and GL postings match approved evidence; exemption is explicit; no silent default-zero or legacy nominal substitution.                                                                    | CFG-17–19, CFG-26, CFG-28                                      |
| AAT-09 Foreign-currency recognition/settlement | Use an approved active foreign currency and exact company rate effective for each approved date; settle at the separately approved settlement rate.                                                                                                   | Native residual and base carrying value reconcile; realized gain/loss uses correct distinct accounts; no tenant fallback, guessed inverse or modification to posted rates.                                        | CFG-08–11, CFG-20–21, applicable AR/AP and bank setup          |
| AAT-10 Revaluation and controlled reversal     | For a genuinely applicable approved close, or isolated restored rehearsal, review unsettled FX items, dated rate and close/reversal policy.                                                                                                           | Only eligible unsettled exposure revalues; original native amount retained; unrealized entries and authorized exact reversal reconcile at each cutoff.                                                            | CFG-08–11, CFG-20–21, CFG-25, CFG-28                           |
| AAT-11 Customer aging / overdue                | Use approved due dates, installments and actual partial receipts/credits; compare before/on/after due date and historical cutoff.                                                                                                                     | Current/1–30/31–60/61–90/over-90 buckets sum to signed outstanding; oldest installment allocation and event-date cutoff match customer statement and AR GL.                                                       | CFG-04, CFG-12, CFG-14, CFG-16, CFG-24, CFG-26                 |
| AAT-12 Supplier aging / advances               | Compare approved bills, credits, advances and allocated payments at the same cutoff. Check earliest unpaid installment in outstanding report.                                                                                                         | AP aging, supplier statement/advances and native/base GL controls reconcile; unrecognized bills and unposted instructions are separately disclosed.                                                               | CFG-05, CFG-13, CFG-15, CFG-24, CFG-26                         |
| AAT-13 Bank reconciliation                     | Obtain genuine statement or controlled manual evidence; load eligible posted receipt/payment movements; review exact selections/matches and reconciling items; independently approve and reload.                                                      | Statement/book/selected effects explain fully; difference zero; no stale ledger population, duplicate reuse or forced adjustment; immutable approval evidence. Existing −USD 110,000 must be resolved.            | CFG-23–24, CFG-26–28                                           |
| AAT-14 Trial balance and General Ledger        | Reconcile signed before-state plus the exact approved case journal deltas; inspect all source links and native/base control accounts at a common date.                                                                                                | Company debit=credit; one posting per source; GL-control balance equals signed subledger balance by currency and base. An empty ledger or balanced but incomplete TB is insufficient.                             | Approved recognition/settlements/cutover and CFG-25            |
| AAT-15 Financial statements                    | Review approved chart/classification and fiscal period; reconcile TB to balance sheet and P&L, opening equity and current activity. Approve presentation currency if different.                                                                       | Assets/liabilities/equity and revenue/expenses reconcile with GL and signed business schedules; FX translation differences explicit, never hidden in balancing lines.                                             | CFG-02–11, CFG-20–21, CFG-24–25; AAT-14                        |
| AAT-16 Reversals and cancellations             | Use an actual authorized correction, or approved restored rehearsal; unwind downstream settlements where required. Review original rates/dimensions and period before independent approval/posting.                                                   | Exact compensating accounting and item events; original audit/history retained; no deletion or recalculation at current FX; limits lowered or masters inactivated later do not invalidate a valid exact reversal. | Applicable mappings, CFG-25–28; exact correction authorization |
| AAT-17 Duplicate/stale protection              | In an approved restored rehearsal, repeat the same idempotency key, use a fresh key on an already posted source, and attempt stale approval after material configuration/source change.                                                               | Replay gives the same outcome; no second financial effect; terminal/stale actions reject and need current approval.                                                                                               | Approved rehearsal scope, CFG-28                               |
| AAT-18 Permissions and dimensions              | In an approved restored rehearsal, test distinct real roles, wrong company, revoked authority and invalid/inactive applicable master references. Use valid approved dimensions for the positive case.                                                 | Server rejects unauthorized/invalid effects; no journal/item/bank balance changes; genuine positive case propagates canonical IDs to GL/reports.                                                                  | CFG-22, CFG-28; approved rehearsal scope                       |
| AAT-19 Opening/cutover completeness            | Compare every signed external invoice/receipt/advance with the approved disposition and opening schedule; trace the 3 capital entries and 8 BILL/PAY candidates.                                                                                      | Exactly one representation per amount; no omitted or duplicated opening AR/AP/cash; external confirmations and GL/aging agree.                                                                                    | CFG-01, CFG-24, CFG-26–27                                      |
| AAT-20 Audit, period close and owner signoff   | Verify genuine logins, maker/checker/poster IDs, reasons, source versions, audit/journal/reconciliation IDs and approved period locks; collect named owner and finance/tax signoffs.                                                                  | Every prior applicable case passed with retained evidence; explicit approval of any legitimate not-applicable case; no unresolved material difference or unsigned configuration.                                  | All applicable cases and CFG decisions                         |

## Case evidence and signoff requirements

Before a case: record authorized environment/company, case owner, legal source
documents, existing IDs/versions, dates and currencies, exact approved amounts,
tax/rate revisions, dimensions, expected debit/credit lines, baseline bank and
party balances, and specific permission to execute. Do not put credentials or
unmasked bank identifiers into the committed report.

After a case: record actual native/base journal and item effects, bank movement,
aging/control/TB/statement reports at the same cutoff, immutable audit and
reconciliation IDs, duplicate/reversal evidence where applicable, before/after
preservation results, operator/checker names and timestamps, and owner outcome.
An expected GL table without actual journal IDs is not a pass.

Owner/Finance approver, tax reviewer where applicable, execution window,
approved live dataset and final signatures: **PENDING**. No case is waived or
marked not applicable without an explicit recorded rationale and approver.

## Exit criteria

Go-live requires all applicable CFG decisions signed and implemented through
normal governed APIs, approved cutover completed exactly once, externally
reconciled balances, both real authenticated AR/AP journeys completed, all
applicable cases passed with evidence, approved exceptions/period policy and
named final signoffs. Any unresolved material difference, undefined business
scope or missing owner approval keeps the outcome **NO-GO**.
