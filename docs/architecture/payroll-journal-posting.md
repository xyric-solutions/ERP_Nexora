# Payroll journal review and Finance posting

Open HR & Payroll > Payroll > Payroll Journal. This screen accrues an independently
approved Payroll run into the existing Finance ledger. It does not transfer salaries,
confirm payment or release payslips.

1. Select the company, Payroll month and posting date. The date must be inside that
   Payroll month, no later than today, and in exactly one open Finance period.
   Preview shows every approved employee's immutable result controls, account lines,
   employer contributions, employee net payable and current direct Finance FX rate.
2. An officer with company-scoped `finance.journal.create` prepares the proposal.
   Payroll report/result read and Finance journal read are also required. The
   proposal freezes its source fingerprint, run number, posting date, currency,
   base currency, rate identity/value and balanced lines. No money lines or FX values
   can be supplied by the browser. Repeating the same request returns its original
   acknowledgement after rechecking current authority.
3. A different authorized reviewer accepts it with company-scoped
   `workflow.approval.approve`. Acceptance is recorded in the governed Payroll
   proposal and advances the Payroll period to `posting_ready`. It does not invent
   a generic Workflow approval instance. The maker, Payroll preparer/submitting
   actor and bound employee cannot self-review, including through an administrator
   override. `workflow.approval.reject` returns an unposted proposal for a new
   revision; original source lines and decisions remain intact.
4. A separate officer with company-scoped `finance.journal.post` reviews and posts.
   The poster cannot be the journal preparer, acceptor, Payroll maker/submitter,
   Payroll approver or a bound employee. The same shared Finance posting service
   used by Bank Payments validates currency/rate authority, account state, period
   openness and exact transaction/base-currency balance, allocates the entry number
   and creates the actual accounting event and journal.
5. The Finance entry, immutable approval binding, Payroll proposal/period state,
   workspace history, audit and idempotency acknowledgement commit together.
   Competing posting requests produce one accrual. The screen retains the Finance
   journal ID, entry number, accounting event, source evidence and decision history.

The accrual debits employee earnings and employer contribution expense, and credits
deductions, employer contribution liabilities and employee net payable. A consumed
`loan:<instalment ID>` deduction credits the exact funded employee-loan receivable
**asset**, through the existing result credit-account field named
`liability_account_id`. The source employee, component, due month, amount, approved
result and disbursement linkage must all match. Loan recovery is not consumed again
when posting. The accepted Payroll deduction now has a corresponding real ledger
credit; the original bank-funded principal and remaining loan balance reconcile.

Sources require matching sealed statutory execution, no calculation warnings,
one result per frozen attendance employee and exact agreement between each employee
header and result items. The normal executor rejects synthetic/test-only execution.
Acceptance tests use both the explicit in-process test repository and an artificial
production-classification pack in the isolated database; no legal rates are asserted
or deployed into normal companies.

Supported synchronous scope is 1–500 employees, 10000 result items and 2–1000 nonzero
grouped account lines. Accounts must have valid company-owned expense, liability or
loan-receivable roles. HR128 supports explicit whole-account mappings for the canonical
`cost_center` dimension, selected from active company cost centres and independently
accepted with the proposal. This assigns the whole grouped account balance, not an
employee-level split. Other dimension keys and proportional allocations remain
blocked until their governed mapping workflow is delivered; no assignment is guessed. FX base-currency rounding must balance using Finance's own arithmetic;
no balancing adjustment is invented. Loan recoveries additionally require exact
funding/recovery currency parity and representable base units. Non-parity foreign
loan carrying values require a separate governed FX allocation workflow.

Changing rate/account/period authority after preparation blocks acceptance/posting.
An independent reviewer can reject the unposted proposal so a new revision freezes
the corrected terms. Historical proposals preserve their actual original lines and
remain read-only. Posted entries and reviewed source lines cannot be appended,
rewritten or directly reversed. Payroll reversals/corrections, employee-level or other
dimension allocations and non-parity loan FX allocations remain separate delivery work.
Payslip publication and settlement-specific supplements are delivered; Banking
payment linking remains deferred. Pre-approval returns/corrections now use the
HR124 reopen/recalculate/review flow and never reverse a posted journal.

HR68–72 add the journal lifecycle, exact source/Finance reconciliation, independent
decision provenance, protected period transitions and multiset line comparison.
Database checks reject balanced duplicate lines as well as unmatched amounts.
Finance authority readers accept an optional non-locking preview mode; writes keep
locking enabled by default and follow the shared rate-authority lock order.

HR128 retains selected canonical cost-centre identities and labels in immutable source
evidence and dimensions on reviewed lines. Renamed/deactivated cost centres or changed
account requirements block acceptance/posting; reject for a successor revision.
Reviewed labels remain historical. Deferred constraints verify required mappings and
exact source/posted dimension multisets in addition to HR72 amount reconciliation.
