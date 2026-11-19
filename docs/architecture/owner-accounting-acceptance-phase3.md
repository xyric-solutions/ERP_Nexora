# Owner accounting acceptance and configuration readiness — Phase 3

19 November 2026. Application baseline: **`f71ffe9`**. This phase performed
read-only business configuration/history review and prepared owner decisions;
it did not change application behavior, migrations, configuration, records or
runtime services. **Go-live recommendation: NO-GO pending business approval and
acceptance.** Technical completion and business approval remain separate.

## Deliverables

1. [Configuration register](../finance/owner-accounting-configuration-register.md):
   **28 items**, each with existing value, required decision, evidence-supported
   proposal or no proposal, approval status and dependencies.
2. Outstanding owner decisions are prioritized below and individually tracked
   by CFG ID in that register. No financial value or signature was invented.
3. [Historical cutover assessment](../finance/historical-accounting-cutover-assessment.md):
   opening capital, duplicates, bills/instructions, advances/unapplied balances,
   bank reconciliation and controlled cutover alternatives.
4. [Acceptance plan and current test report](../finance/owner-accounting-acceptance-test-report.md):
   actual read-only results, prior isolated technical evidence, **20 planned
   business acceptance cases**, execution gates and signoff requirements.
5. Final recommendation and exit criteria are below. Supporting
   [snapshot evidence](../evidence/2026-11-19-accounting-readiness-phase3.json)
   records scoped values, source IDs/versions and artifact hashes without bank
   account numbers or credentials.

## Findings that prevent business acceptance

| Priority / owner decision                            | Current evidence                                                                                                                                                                                                                                                               | Decision references |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------- |
| Confirm business scope and cutoff                    | Both active companies are named R06 UAT; an earlier approved design calls R06-UAT a test company. Existing owner-created records and capital are preserved. Specific legal entity, actual cutover date and business-versus-acceptance record classification were not supplied. | CFG-01, CFG-28      |
| Validate opening balances and reconcile bank         | Three posted Opening Capital journals total **USD 1,110,000**. Existing manual statement closing is USD 1,000,000; stored reconciliation difference **−USD 110,000**, in progress/unapproved. No imported bank statements.                                                     | CFG-23–24, CFG-27   |
| Approve historical dispositions                      | Four approved bills and four approved purchase payment instructions each total **USD 5,021**, with no financial operation. Approved bank receipt USD 5,000 and bank payment USD 100 also have no journals.                                                                     | CFG-19, CFG-26      |
| Complete the eight-account policy                    | No AR/AP policy in either company. Existing AR/AP candidates are inactive leaves; some gain-named candidates are typed expense. No account was selected, activated or retyped.                                                                                                 | CFG-03–11           |
| Confirm real parties, terms and credit               | No persistent financial customers, financial supplier accounts or reviewed terms/credit configurations. Two existing supplier identities must be reviewed/adopted rather than duplicated.                                                                                      | CFG-12–16           |
| Approve tax treatment                                | No governed tax definitions/mappings/configuration/applications. Stored zero tax does not prove exemption; PAY-003 records 10% WHT without governed financial tax setup.                                                                                                       | CFG-17–19           |
| Ratify currency/rates, dimensions and fiscal policy  | USD base recorded; R06-UAT active USD/PKR/AED and existing rates require owner ratification. All 12 July–June periods open. R06 dimension names require business classification. R06-UAT-2 lacks chart/calendar and an eligible PKR→USD rate.                                  | CFG-20–22, CFG-25   |
| Authorize genuine acceptance actors and transactions | Existing self-approval/override history is retained, but does not establish independent maker/checker/poster business acceptance or permission for unspecified new postings.                                                                                                   | CFG-28; AAT-01–20   |

The published chart's approved source workbook **does** match its stored hash.
That supports preserving catalogue provenance. It does not approve purpose-specific
control/FX/tax mappings, all posting classifications or a legal-company cutover.
The register makes this limited approval scope explicit.

## Verification actually performed

- **85 read-only SELECT queries** in a repeatable-read PostgreSQL transaction;
  `transaction_read_only=on`, business mutations **0**. Inspected both existing
  companies, chart provenance, masters, settings, historical records and links.
- **44 read-only application/report assertions passed, 0 failed** against the
  real application role, retained authority/RLS checks and independent journal
  SQL. Fourteen report projections rendered; **two supplier reports are BLOCKED**
  for R06-UAT-2 by `REPORT_FISCAL_YEAR_MISSING`. No period or substitute date
  was supplied to bypass that guard.
- R06-UAT TB and fiscal-period GL: **USD 1,110,000 debit and credit**. BS agrees;
  P&L zero. AR/AP and supplier reports have no posted items, so nonzero business
  trade, aging, tax and FX acceptance remains untested.
- No duplicate invoice-reference/fingerprint candidate groups, broken source or
  account links, unbalanced posted journals or duplicate posted source groups
  found in the reviewed database population. This is not external completeness
  proof or approval to treat missing balances as zero.
- Phase 2 preservation verifier rerun passed: original financial/master records
  and native/base balances remain intact. Its zero **integrity** blockers is
  distinct from the nonzero business reconciliation difference and unsigned setup.
- Runtime/source verification matched **1,147 source** and **1,256 compiled**
  files; build **`nXe0dnHNr_y0YWqWMezFO`**, Finance **43**, Procurement **8**.
  Live API readiness checks passed. No deployment or migration was needed.
- HTTP-only live smoke check passed: login document 200, **14 served scripts**
  match the pinned build, and a schema-valid anonymous financial request returns
  **401**. This does not claim an owner browser login or posting journey.
- Phase 2's **1,993 passed tests** are cited as prior isolated technical evidence,
  not rerun or reclassified as owner business acceptance. No new live posting
  journey, tax/legal recommendation or financial configuration was performed.

Commands executed from this repository:

```powershell
& ./tmp/accounting-acceptance-phase3/read.ps1
& ./tmp/accounting-acceptance-phase3/reports.ps1
node tmp/accounting-acceptance-phase3/prepare-evidence.mjs
& ./tmp/ap-ar-readiness-phase2/database.ps1 -Action verify
node tmp/ap-ar-readiness-phase2/verify-candidate.mjs
node tmp/accounting-acceptance-phase3/runtime-check.mjs
node tmp/accounting-acceptance-phase3/verify-handoff.mjs
```

The first two wrappers use the existing protected connection store without
exposing or changing `.env` values. The audit uses a read-only administrative
connection for complete cross-module inspection; financial projections use the
non-bypass application role and the original account's resolved company authority.
That service-level read is explicitly **not password-authenticated owner UAT**.
Temporary query helpers, full private snapshots and logs stay under
`tmp/accounting-acceptance-phase3/`. Only review documents and the scoped evidence
summary are committed. Existing unrelated `.env.example` and lockfile changes
remain outside this phase.

Snapshot artifact SHA-256:
`5372247f6c5a9e27b1794a6e6d60bc35e49247444d7102803ac9826b38f90aa1`.
Financial report artifact SHA-256:
`5a84ab950cdcdd1d3592a5bef90148d88fa70407208b23aa8274a111793d7db7`.
The committed evidence summary also retains the audit script hash and exact
capture time. Recheck live versions, rates and balances before future execution;
these snapshots are dated evidence, not continuously refreshed approvals.

## Final recommendation

**NO-GO for business accounting go-live at this time.** The audited application
remains technically aligned and its prior software verification is preserved.
Business configuration, external balance support, cutover and genuine authenticated
owner acceptance have not been approved/completed.

Next action: owner/finance review CFG-01 first, then the opening/bank discrepancy
and source-document dispositions, followed by exact account/master/term/credit/
tax/rate/dimension decisions and named acceptance actors. Record each approved
value and supporting evidence in the register. Only then authorize the precise
configuration changes, restored-business-data rehearsal and live case batch.

Go-live requires signed applicable configuration, completed approved cutover with
no double recognition, reconciled external bank/customer/supplier schedules,
both genuine authenticated AR/AP posting-to-reconciliation journeys, all
applicable acceptance cases passed with journal/audit/report evidence, and named
final owner/finance/tax signoffs. No material difference or missing approval is
waived by this recommendation. This phase grants no permission for live postings.
