# Payslip publication

Open HR & Payroll > Payroll > Payslips. Select the authorized company and Payroll
month. A current governed Payroll run must already have an actual posted Finance
accrual. Banking confirmation is independent and is deferred to the Banking owner.

1. Review the employee results. Search by employee name/number, filter publication
   state and use Previous/Next for bounded pages. Preview shows the retained
   earnings, employee deductions, net salary and employer contributions. Employer
   contributions appear separately and do not reduce employee net pay.
2. Select eligible employees on the page and choose Release selected. Review the
   exact employees/month and enter the publication reason. The server rechecks
   the posted source, current scope, independent actor and current fingerprint.
3. Confirm release. The immutable publication freezes names/company labels,
   result lines/totals, calculation hash and original accrual reference. Repeating
   the same command with its original key returns the stored acknowledgement;
   a changed/stale command requires another review. Partial writes never commit.
4. Open the released payslip. Download saves a self-contained escaped HTML document;
   Print opens the browser's print dialog, including Save as PDF. Preview documents
   cannot be printed/downloaded as released payslips. Published releases cannot
   be overwritten or deleted; correction needs a governed Payroll correction.

Read authority: current company-scoped hr.payroll.payslip.read and
hr.payroll.result.read. Publication additionally needs hr.payroll.payslip.release.
The Payroll preparer/submitter and bound employees cannot self-publish, including
through administrator overrides. Impersonated mutation sessions are rejected.

Payslip publication is not evidence of payment and leaves Payroll payment state
unchanged. Bank identifiers, sensitive HR identifiers, posting-account internals
and executable statutory rules are excluded from the public document. Current
screens support HR staff access; employee self-service delivery, email and signed
PDF services are separate phases. Legacy releases lacking a frozen snapshot show
current labels explicitly; their retained monetary results remain immutable.

Banking remains owned by another developer. Payment Batch stays read-only, new
payment-link API actions are disabled, and HR76 drops the experimental Bank Payment
triggers. Preserve the migration history and coordinate the bank/payment handoff
before enabling the parked integration or its tests.
