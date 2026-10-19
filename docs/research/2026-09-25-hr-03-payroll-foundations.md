# HR-03 Payroll Foundations — Research Note

Date: 2026-09-25

## Decision summary

Nexora's payroll engine is jurisdiction-neutral infrastructure, not a hardcoded tax pack. Statutory rates,
thresholds, and deductions change and therefore belong in approved, effective configuration maintained by a
future jurisdiction pack. Payroll results are immutable evidence snapshots, and corrections after approval use
controlled adjustments or reversals rather than rewriting history.

## Primary-source findings

- IAS 19 requires an entity to recognize liabilities and expenses for employee benefits as employees provide
  service. This supports a controlled accounting hand-off from an approved payroll result rather than UI-derived
  balances: https://www.ifrs.org/issued-standards/list-of-standards/ias-19-employee-benefits/
- The US IRS publishes a new employer tax guide for 2026 and explicitly describes current withholding,
  depositing, reporting, and correction duties. This is evidence that tax logic is time- and jurisdiction-bound,
  not a safe application constant: https://www.irs.gov/publications/p15
- UK payroll record guidance requires employers to retain records of employee pay, deductions, leave, tax codes,
  and payments, generally for three years. Nexora therefore stores inputs/results/payment references as durable
  evidence: https://www.gov.uk/running-payroll/keeping-records
- UK payslip guidance identifies gross pay, deductions, net pay, and variable-time information as core output.
  Nexora's result snapshot stores gross, component deductions, net, and the locked attendance source:
  https://www.gov.uk/payslips
- UK deduction guidance also shows that deductions depend on employee classifications and changing obligations.
  Nexora keeps these as configured components/formulas instead of inventing universal rates:
  https://www.gov.uk/understanding-your-pay/deductions-from-your-pay
- OWASP recommends least privilege, deny by default, and authorization checks on every request; it specifically
  uses sensitive payroll information as an access-control example. Payroll routes therefore use server-side,
  company-scoped permissions and no-store responses:
  https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html
- OWASP transaction authorization guidance requires server-side enforcement and fail-closed transaction state.
  Payroll posting and payment confirmation are separate, controlled actions:
  https://cheatsheetseries.owasp.org/cheatsheets/Transaction_Authorization_Cheat_Sheet.html
- The NIST Privacy Framework supports managing privacy risk as part of enterprise risk. Salary/self-service output
  remains blocked until Nexora has a trustworthy user-to-employee identity binding:
  https://www.nist.gov/privacy-framework

## Scope boundary

The cited US and UK sources are control evidence, not Nexora tax implementations. HR-03 does not claim statutory
compliance for any country. A jurisdiction pack requires separate legal/product approval, effective-dated rules,
test vectors, and change governance.
