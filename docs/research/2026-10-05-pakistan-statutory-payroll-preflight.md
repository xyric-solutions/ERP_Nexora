# Pakistan statutory payroll preflight (Tax Year 2027)

## Decision

Implementation may proceed for a controlled Pakistan Tax Year 2027 pack, effective
2026-07-01 through 2027-06-30, using the existing Nexora localization publisher,
resolver, deterministic executor and immutable Payroll statutory snapshots.

Live schema/code/tests win implementation ties. Enacted Pakistan law and current
official FBR publications win legal-rule ties. No rule is inferred from currency,
address, employee name or UI defaults.

## Authoritative sources

1. Federal Board of Revenue, *Income Tax Ordinance, 2001 amended up to
   30 June 2026*:
   https://download1.fbr.gov.pk/Docs/2026724177725705IncomeTaxOrdinanace2001.pdf
   - section 12 defines salary and expressly includes overtime, bonuses,
     commissions and allowances except amounts solely spent in performing duties;
   - section 74 defines the normal tax year as the twelve months ending 30 June;
   - section 149 requires salary withholding at the average rate on estimated
     annual salary, permits documented credits/adjustments, and defines average
     rate as annual tax divided by estimated annual salary;
   - Division I, Part I of the First Schedule contains the enacted TY2027 salary
     bands.
2. Federal Board of Revenue, *Withholding Income Tax Rate Card, updated to
   30 June 2026 under Finance Act 2026*:
   https://download1.fbr.gov.pk/Docs/202681113864992WithholdingTaxRatesCard2027.pdf
   - corroborates the TY2027 section 149 salary bands and references the enacted
     schedule. The Ordinance prevails if the card conflicts.
3. Pakistan Code, *Employees' Old-Age Benefits Act, 1976*, sections 9 and 9B:
   https://pakistancode.gov.pk/pdffiles/administratorf3be1ec8d21dfebb9c5d1733f43cffe6.pdf
4. Government of Pakistan, *Pakistan Economic Survey 2025-26, Social
   Protection*:
   https://finance.gov.pk/survey/chapter_26/16_Social_Protection.pdf
   - confirms the current EOBI framework: covered industrial/commercial
     establishments with at least five employees, employer contribution 5% and
     employee contribution 1% of the applicable minimum wage.

## Tax-year 2027 salary rates

| Annual taxable salary (PKR) | Tax |
|---|---|
| up to 600,000 | 0 |
| 600,000.01 to 1,200,000 | 1% of excess over 600,000 |
| 1,200,000.01 to 2,200,000 | 6,000 + 11% of excess over 1,200,000 |
| 2,200,000.01 to 3,200,000 | 116,000 + 20% of excess over 2,200,000 |
| 3,200,000.01 to 4,100,000 | 316,000 + 25% of excess over 3,200,000 |
| 4,100,000.01 to 5,600,000 | 541,000 + 29% of excess over 4,100,000 |
| 5,600,000.01 to 7,000,000 | 976,000 + 32% of excess over 5,600,000 |
| over 7,000,000 | 1,424,000 + 35% of excess over 7,000,000 |

The section 4AB salary surcharge is not applicable for the amended 2026 text.

## Controlled inputs

- Existing `hr_pay_component.taxable` classifies calculated Payroll earnings as
  taxable or exempt for this first pack. No component is reclassified by name.
- Each employee requires an approved, effective tax-year declaration containing
  estimated annual salary, documented prior taxable salary, prior tax withheld,
  section 61/63 credit amounts where applicable, and EOBI applicability.
- EOBI calculation additionally requires an approved company statutory parameter
  containing the applicable minimum-wage contribution base and official evidence
  reference. The system never guesses a provincial minimum wage.
- Provincial social-security schemes are not treated as universal Pakistan
  deductions. They require a separately sourced subnational pack/registration;
  activation must state `not_applicable` or provide an approved applicable scheme.

## Calculation policy

For salary income tax, the pack computes annual tax from the approved estimated
annual salary. It applies documented credits, derives the section 149 average rate,
computes the cumulative target on taxable salary paid through the current run, and
subtracts authoritative prior/YTD withholding. The current deduction cannot be
negative; excess withholding remains explicit evidence for later adjustment.

EOBI employee and employer contributions use the approved company contribution
base multiplied by the enacted 1% and 5% rates. Applicability and base are explicit.

Section 219 provides the whole-rupee fraction treatment used by the pack, so
salary withholding rounds half-up at scale zero rather than inheriting a UI or
currency default. All calculations use `Decimal`/PostgreSQL `numeric`, pack-specified rounding and
immutable input/output evidence. Missing/overlapping declarations, missing company
parameters, currency mismatch, missing Payroll component mapping, unresolved
jurisdiction or inactive packs fail closed.

## Existing architecture reused

- Platform country/jurisdiction/legal-profile/registration/payroll configuration
  and company localization activation.
- HR work-location and employee-jurisdiction resolver.
- Controlled localization bundle validator/importer and publisher boundary.
- Statutory rule/version/vector catalogs.
- Existing Payroll result items, state machine, Finance posting, payslip and reports.
- Sealed `hr_payroll_statutory_snapshot` evidence and historical reproduction.

No second Payroll, tax, contribution, GL mapping or evidence engine is introduced.

## Scope boundary

This pack covers ordinary employee salary withholding under section 149 and EOBI
where explicitly applicable. Pension withholding, director fees, special tax years,
tax paid by the employer/gross-up, termination averaging elections, foreign-currency
salary and subnational social-security packs remain fail-closed unless separately
configured by an approved pack. They are not silently treated as ordinary salary.
