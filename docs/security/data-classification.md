# HR and Payroll Data Classification

## Restricted

Access requires an explicit field permission, company/employee scope, and
audited purpose. Exports are separately authorized.

- CNIC and other government identifiers
- Bank accounts and payment destinations
- Tax identifiers, declarations, and withholding details
- Salary, benefits, loans, deductions, payroll results, and settlements
- Medical information and sensitive leave evidence
- Termination evidence and investigation material
- MFA secrets, recovery codes, password/session material
- Restricted employee, candidate, contract, and payslip documents

## Confidential

Access is limited to authorized HR/management roles and applicable company,
branch, reporting-line, or self scope.

- Personal contact and address information
- Date of birth, marital status, dependants, and emergency contacts
- Attendance, leave, performance, training, recruitment, and clearance records
- Candidate applications and interview evaluations
- Approval comments, audit details, and export history

## Internal

- Organization hierarchy, positions, designations, grades, locations, and
  policy descriptions that the company permits employees to view
- Permission-safe employee directory fields
- Aggregated metrics that satisfy minimum-group and masking rules

## Public

- Published job openings and explicitly approved public company information

## Handling rules

Restricted and confidential data must be encrypted in transit and at rest,
redacted from logs/errors/traces, excluded from unrestricted analytics, and
retained only under approved policy or legal hold. Production data must not be
copied into development or test environments without approved anonymization.
