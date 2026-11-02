# HR and Banking completion — 2 November 2026

Payment Batch now opens the governed salary-payment workspace and its working
`/api/v1/hr/payroll_payments` read/action endpoints. The previous UI projection
and explicit HTTP deferral have been replaced with the existing feature services,
shared contracts, generated client and normal authentication/CSRF/idempotency flow.

| HR surface | Dependency and delivered behavior | Remaining boundary |
| --- | --- | --- |
| Payment Batch | Posted Payroll accrual → prepare exact employee obligations → independent batch approval → independently approved/posted Bank Payment → successful-transfer confirmation | Exact carrying-value parity; 1–500 employees; no external transfer transmission |
| Loans & Advances | Existing posted Bank Payment funding and independent disbursement confirmation remain active; the drawer links to Bank Payments | Interest, refinance, FX allocation and reversal of consumed funding require separate workflows |
| Payroll Journal | Existing independent Finance acceptance/posting remains active; Salary payments opens the matching company/month | Existing accounting dimension and posted-correction limits remain |
| Payslips and self-service | Existing controlled publication and private documents remain unchanged | A payslip is not proof of a successful bank transfer |
| Settlement benefits/encashment → Payroll | Existing independently approved Payroll-input handoff remains unchanged | No duplicate direct bank payment or settlement posting path is introduced |

HR132 restores the three salary-consumption/evidence triggers deliberately removed
by HR76 during Banking delivery. Banking posting reserves each exact approved
obligation once; an unconfirmed Bank Payment reversal releases that reservation,
while consumed salary evidence prevents payment/journal reversal. HR133 also
requires three distinct Banking actors, posted accrual provenance, valid posting
dates and exact carrying-value parity before reservation. These are additive
migrations; existing amounts, journals, historical codes and approvals are retained.

The API checks that migration 133 and all four current integration guards are
present and enabled before exposing salary actions. Incomplete installations
return a controlled setup-required problem. Apply HR132–133 through the normal
database migration workflow before deploying this batch to another environment.
Only the isolated local UAT database has been migrated by this work.

The salary review uses the shared right-side `HrRecordDrawer`, including native
validation, frozen company/month, feedback inside the drawer, save guards and
responsive scrolling. Posted evidence links open the actual Banking transaction.
Journal-to-payment navigation retains the selected company and month.

Unsupported dependencies remain blocked: non-parity FX/carrying-value allocation,
zero-net-only batch closure, external bank-file generation/transmission, interest
or refinancing, and general corrections after confirmed settlement. None is
represented as completed merely because Banking's core payment module is ready.

Verification includes current Banking, salary settlement and loan integration
tests; strict HTTP/session/CSRF/input tests; and actual browser preparation,
independent approval, Banking posting and confirmation in light/dark themes.
The browser passed 48 checks at 1440/820/390/320px, including required reasons,
conflict recovery, maker self-approval restrictions, exact zero outstanding and
links to posted Banking evidence. Evidence: `tmp/hr-banking-evidence/results.json`
and screenshots. These financial examples use artificial reviewed statutory
fixtures in isolated test companies, not legal rates or real bank transfers.

The main HR demonstration dataset is documented in
[HR fictional UAT data](hr-demo-data.md). The generated route inventory is
[HR API coverage](../parity/hr-api-coverage.md).

The final route sweep passed 192 checks across all 87 HR routes at desktop and
mobile widths, with no browser runtime errors or horizontal document overflow
(`tmp/hr-banking-route-sweep/results.json`). The new hires exposed a directory
projection bug: retained profile-draft assignments appeared alongside active hire
assignments. The API now selects operational active/legacy assignments, while
the draft and history screens retain their existing records. A regression test
verifies draft assignments are excluded; current directory records remain covered.

Final automated verification passed: 72 Banking/payroll/loan/journal/payslip
integration cases, 24 HR foundation/offer-handoff integration cases, 83 focused
unit/API cases, and two catalogue regressions. Full workspace typecheck,
production `build:web`, focused lint, standalone seed-script typecheck,
`api:check`, `catalogue:check`, theme audit write/check and `git diff --check`
passed. The theme audit retains its 12 existing feature colour exceptions and
zero font exceptions; this is a source-file audit, not a screen completion ratio.
An expanded lint check also inspected the existing monolithic HR repository and
offer-handoff test: it reports 31 pre-existing unused-variable/prefer-const
findings. Those unrelated sections were preserved; this batch does not claim a
clean repository-wide lint run. The changed foundation regression and dedicated
Banking readiness/router files pass lint. Local web and API readiness both return
HTTP 200.
