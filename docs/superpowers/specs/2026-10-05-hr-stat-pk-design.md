# HR-STAT-PK design

## Outcome

Add one production-classified Pakistan TY2027 localization pack and the minimum
generic input/evidence extensions necessary to calculate section 149 withholding
and explicitly applicable EOBI contributions through the existing Payroll engine.

## Data design

HR migration 0019 will add:

- effective-dated, maker-checker-controlled employee statutory declaration
  versions linked by immutable supersession (approved history is never updated);
- effective-dated, maker-checker-controlled company statutory parameters;
- detailed immutable input/calculation JSON evidence on statutory snapshot lines;
- constraints, overlap protection, indexes, audit references and FORCE RLS.

Platform migration 0006 will add only provenance-hashed Pakistan reference rows
needed by the existing country/jurisdiction/legal-entity authority. It will not
activate any company.

The localization bundle remains the statutory-rule authority. The employee and
company records supply documented facts; they do not contain formulas or rates.

## Runtime design

1. Resolve the existing company/employee jurisdiction for the Payroll period.
2. Resolve exactly one approved pack/rule set.
3. Build taxable/exempt current-period component evidence from existing Payroll
   lines and `hr_pay_component.taxable`.
4. Resolve the latest approved employee declaration version effective on the
   Payroll period end and authoritative prior/YTD Payroll evidence. Parallel
   supersession branches and same-date approved revisions are rejected.
5. Resolve company contribution facts only for schemes marked applicable.
6. Execute data-driven rules with Decimal-only arithmetic.
7. Add statutory deduction/employer-contribution lines to the existing Payroll
   result and existing GL component mappings.
8. Seal detailed inputs, intermediate values, rule/version references and hashes in
   the existing statutory snapshot boundary.
9. Reproduce historical runs from sealed snapshots; future pack/config changes do
   not mutate prior evidence.

## Activation control

Production activation is allowed only when the referenced pack version has a
production-classified immutable import release and readiness validation succeeds.
Synthetic activation remains test-only. Ordinary HR cannot publish packs or change
statutory rules; existing Platform localization permissions and maker-checker apply.

## Security

All new tenant data is tenant/company scoped with FORCE RLS. Compensation and tax
facts use existing Payroll permissions; setup actions use existing localization
permissions. Employee-facing surfaces expose final released payslip lines only.

## Failure behavior

Stable blockers cover missing/ambiguous declarations, missing/ambiguous company
parameters, invalid annual estimates/YTD, unresolved jurisdiction, unavailable pack,
currency mismatch and missing pay/GL components. No calculation substitutes zero for
a required unknown fact.
