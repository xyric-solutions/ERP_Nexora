# Payroll loan disbursement and recovery

The supported workflow is an interest-free loan with a fixed monthly schedule in
one active Finance currency. Loan approval, actual bank transfer confirmation,
Payroll deduction approval and General Ledger posting are separate business steps.

1. Create the loan in HR & Payroll > Payroll > Loans & advances. Select the
   employee, active fixed deduction component, currency, principal, first recovery
   month and number of instalments. The principal and every instalment must fit
   the currency's configured precision. Remainder minor units are assigned to the
   earliest instalments; the exact schedule always totals the principal.
2. The maker submits and an authorized independent reviewer approves. Approval
   creates the schedule; it does not transfer money or activate recovery.
3. Complete the existing governed Bank Payments create, submit, approve and post
   workflow. The relevant payment line must use the loan reference as its external
   reference, the immutable employee ID as its document reference, and an active
   postable employee-loan receivable asset account. Its exact amount and payment
   currency must match the principal and loan currency. The payment may have other
   lines, but this line can fund only one loan. Retain the actual transfer evidence.
4. An officer with `hr.payroll.loan.approve`, `banking.payment.read` and company
   access opens the approved loan, chooses its matching posted payment and records
   the actual bank confirmation reference and date. Matching options use the same
   company-scoped Banking permission evaluator as Bank Payments and are bounded
   to 25; a verified line ID may also be entered. The maker and employee cannot
   confirm their own disbursement, including through an administrator override.
   The confirmation date must follow posting, be no later than today and precede
   the end of the first recovery month. Funding cannot change calculated Payroll.
5. Calculate Payroll after Attendance Period Close. Only verified active loans'
   current scheduled instalments become deductions. Each immutable result retains
   the instalment, loan version, disbursement fingerprint, component and receivable
   account. Recalculation creates a new result without consuming the schedule.
6. Independent final Payroll approval compares retained and current inputs, then
   consumes each instalment in the same database transaction. The final instalment
   settles the Payroll schedule. The loan view shows approved Payroll recoveries
   and the remaining scheduled balance. These are Payroll commitments; they do
   not assert that the General Ledger recovery journal has been posted.

The existing `liability_account_id` field on a deduction result line represents its
credit account. For `loan:<instalment ID>` sources this is deliberately the verified
receivable **asset**, not the generic component liability. The upcoming Payroll
journal implementation must preserve that source-specific mapping and reconcile
it with the bank-funded principal; no loan recovery journal is posted by this phase.

HR65 adds immutable company-scoped disbursement evidence and exact consumption
guards. HR66 requires activation/evidence and recovery/current final approval to
commit atomically. HR67 preserves the shared trigger's polymorphic behavior for
components, structures, salaries and adjustments. Bank Payment reversal returns
a controlled conflict for linked disbursements; a database guard also closes races.
Request replay rechecks current Banking and Payroll authority before returning a
stored financial acknowledgement.

Overdue instalments, legacy active loans without verified funding, inactive
accounts/components, absent attendance employees, currency mismatch, fractional
currency units and insufficient net pay block execution. No silent catch-up,
partial recovery, waiver, manual settlement, refinance, interest, multi-currency
conversion, reversal or schedule correction is implemented. Those require separate
reviewed workflows; linked funding cannot be reversed while its recovery history
remains unresolved. Approved unfunded loans produce no deduction.

Acceptance uses actual governed Bank Payments and Finance posting, synthetic
statutory rules through the explicit in-process test repository, and real HTTP
disbursement/final approval. No production legal rates or normal-company business
transactions are installed by acceptance tests.
