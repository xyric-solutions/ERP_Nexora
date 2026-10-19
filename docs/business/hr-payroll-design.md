# Nexora — Payroll Design (Phase 3)

Status: proposed
Depends on: Phase 1 (employee, organisation, approval, audit) and Phase 2
(attendance, leave, overtime, payroll inputs).
Scope: periods, pay components, salary structures, revisions, the calculation
engine, snapshots, adjustments, loans and advances, review, approval,
accounting hand-off, payment and payslips.

---

## 1. The three ideas everything else follows from

**A payroll result is a snapshot, not a view.** Once a period is calculated,
each employee's result stores the component amounts themselves — not a pointer
to the salary structure that produced them. A salary revision next month, or a
corrected structure, cannot alter what September paid. This is the opposite of
Phase 2, where the daily attendance is deliberately *derived* every time: there
the source is evidence that can legitimately be corrected; here the result is a
payment that has already been made.

**Payroll reads its inputs and never writes them.** Attendance, leave,
overtime, loans and adjustments are consumed through their own approved
records. Payroll has no path that edits a punch, a leave balance or an
attendance period — so a payroll rerun cannot quietly change what the
attendance module says happened.

**Money is never calculated twice in two places.** One engine produces the
result; the review screen, the payslip, the accounting journal and the payment
batch all read that one snapshot. If they could each compute, they could each
disagree, and the payslip and the ledger would drift.

---

## 2. State machines

### Payroll period

```
OPEN ─► PROCESSING ─► CALCULATED ─► UNDER REVIEW ─► APPROVED ─► POSTED ─► PAID ─► CLOSED
  ▲           │             │              │
  └───────────┴─────────────┴──────────────┘
         recalculate (only before APPROVED)
```

The forbidden moves are enforced as data, not as screen logic:

| Never allowed | Why |
|---|---|
| `PAID → DRAFT/OPEN` | The money has left the bank |
| `CLOSED → edit` | The period is history |
| `POSTED → delete` | A journal exists in the ledger |

After `APPROVED`, nothing recalculates. A change becomes an **adjustment in the
next open period** or a **reversal** that writes an equal and opposite snapshot
— never an edit of the original.

### Salary revision

```
Draft ─► Submitted ─► Pending approval ─► Approved ─► Effective (on its date)
                            │
                            └─► Rejected
```

A revision carries the old and the new structure. Approving it does not
overwrite the assignment; it closes the current one (`effective_to = new
effective_from − 1 day`) and opens the next — the same effective-dated pattern
Phase 1 uses for assignments and Phase 2 for shifts.

### Loan

```
Requested ─► Approved ─► Disbursed ─► Repaying ─► Settled
                │                         │
                └─► Rejected              └─► Early settlement
```

Each instalment is a row with its own due period, so a deduction is traceable
to a schedule rather than recomputed each month.

---

## 3. Entities

```
payroll_period ──┬─► payroll_run ──► payroll_employee ──► payroll_item
                 │                        │                    │
                 │                        │                    └─ component, amount, basis
                 │                        └─ gross, deductions, net (snapshot totals)
                 ├─► payroll_adjustment (bonus, arrears, recovery …)
                 ├─► payroll_journal (debit/credit lines, per GL account)
                 └─► payment_batch ──► payment (employee, bank, reference)

pay_component (code, earning/deduction, fixed/formula, taxable, priority, GL)
salary_structure ──► salary_structure_item (component, amount or formula)
employee_salary_assignment (effective-dated, currency, frequency, approval)
salary_revision (old ⇄ new structure, effective date, reason, approver)
employee_loan ──► loan_instalment (due period, amount, status)
employee_advance
```

Phase 1 supplies `employee`, `organization_unit`, `approval_*`, `audit_*`;
Phase 2 supplies the payroll input (paid days, unpaid days, overtime hours,
approved and unpaid leave, adjustments) and the **period lock** that gates it.

---

## 4. The formula engine

Components are `fixed` or `formula`. A formula is a short expression over a
**whitelisted variable set**, evaluated by a small shunting-yard parser —
never by `eval`, and with no access to anything outside the variable map:

```
HOUSE_RENT   = BASIC * 0.40
MEDICAL      = BASIC * 0.10
OVERTIME     = HOURLY_RATE * OT_HOURS_REGULAR * OT_RATE_REGULAR
UNPAID_LEAVE = DAILY_RATE * UNPAID_DAYS
TAX          = max(0, (GROSS_TAXABLE - 50000) * 0.05)
PF           = BASIC * 0.05
```

Variables come from three places and nowhere else: the structure's own earlier
components (`BASIC`), the Phase 2 payroll input (`PAID_DAYS`, `UNPAID_DAYS`,
`OT_HOURS_*`), and derived rates (`DAILY_RATE`, `HOURLY_RATE`).

**Priority is the evaluation order.** Components are evaluated in ascending
priority so a formula can only reference values already computed — which makes
a circular reference impossible by construction rather than by cycle detection.

Supported: `+ - * / ( )`, numbers, whitelisted identifiers, and the functions
`min`, `max`, `round`. Anything else is a configuration error raised at save
time, not a runtime surprise on payday.

---

## 5. Calculation

```
for each active employee in the period:
    assignment  = salary assignment effective on the period end date
    input       = Phase 2 payroll input for the period      (locked period only)
    variables   = { BASIC…, PAID_DAYS, UNPAID_DAYS, OT_HOURS_*, DAILY_RATE, HOURLY_RATE }
    for each component in ascending priority:
        amount  = fixed value or formula(variables)
        prorate = component.prorated ? amount × paid_days / calendar_days : amount
        variables[component.code] = prorate
    gross       = Σ earnings
    deductions  = Σ deductions + loan instalments due + approved recoveries
    net         = gross − deductions
    snapshot(employee, components, gross, deductions, net)
```

Proration is a property of the component, not a global rule: basic and
allowances prorate for a mid-month joiner; a loan instalment does not.

---

## 6. Accounting integration

Payroll never touches a balance. It produces a **balanced journal proposal**
that the Finance module posts:

| Line | Account | Dr | Cr |
|---|---|---|---|
| Salaries & wages | 60-01-00100 | gross earnings | |
| Overtime | 60-01-00100 | overtime | |
| Payroll liabilities | 20-02-00100 | | net payable |
| Tax payable | 20-03-00200 | | tax |
| Provident fund | 20-02-00100 | | PF |
| Loan recovery | 10-02-00200 | | instalments |

Every component carries its GL account, so the mapping is configuration. The
journal is refused unless **debits equal credits to the cent** — the same rule
the finance module already enforces, checked here before it is ever offered.

---

## 7. Payment

`APPROVED → payment batch → bank instruction → confirmation → PAID`.

A period cannot reach `PAID` without a payment reference on every employee
line. "Mark paid" with no payment record is the single easiest way for a
payroll system to lie, so the transition requires the references to exist.

---

## 8. Permissions

| Role | Configure | Run | Review | Approve | See amounts | Payslip |
|---|---|---|---|---|---|---|
| Employee | — | — | — | — | own only | own |
| Payroll Officer | components, structures | ✔ | ✔ | — | all in scope | — |
| Payroll Manager | ✔ | ✔ | ✔ | level 1 | all in scope | — |
| Finance Manager | GL mapping | — | ✔ | level 2 | totals only | — |
| Management | — | — | ✔ | level 3 | totals only | — |
| HR Manager | — | — | ✔ | — | masked | — |
| System Administrator | — | — | — | — | **none** | — |

Scope is company, branch and department, applied server-side. Salary
visibility is a field rule: a role that may see headcount is not thereby
entitled to see pay.

---

## 9. Test cases

New joiner mid-month · resignation mid-month · salary revision effective
mid-period · unpaid leave · overtime by category · bonus · loan instalment ·
advance recovery · tax threshold · zero-net safety · payroll correction by
adjustment · reversal · duplicate-run prevention · period closing · every
forbidden transition · journal balance · payment reference requirement ·
snapshot immutability after a later revision.
