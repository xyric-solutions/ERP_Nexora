# HR & Payroll Production Parity Matrix

- Baseline date: 2026-10-06
- Prototype authority: live HR & Payroll catalogue under `prototype/app/`
- Production authority: `app/hr/`, `contracts/openapi-v1.json`, `web/` and tests
- Total approved screens: 67

`IMPLEMENTED` means the approved screen works through production authorities.
`PARTIAL` means some real authority exists but the approved screen is not fully
operational. `NOT IMPLEMENTED` means the screen remains prototype-only.

| Group | Approved screens | Current status | Production mapping / gap |
|---|---|---|---|
| Organisation & Masters (7) | Organisation Structure; Designations; Job Grades; Cost Centres; Work Locations; Employment Types; Employee Categories | PARTIAL | Production implementation is complete across all seven routes: typed APIs, PostgreSQL, company-scoped RBAC/RLS, audit, search/filter, create/edit/status/history, effective-dated organization-head assignment and controlled never-used-master deletion. Status remains PARTIAL only until owner real-data and visual acceptance completes. |
| People (6) | HR Dashboard; Finance & Payroll Dashboard; Employees; Add Employee; Employee Record; Positions & Organisation | PARTIAL | Employee directory, record overview, profiles, relationships, assignments and context exist. Dashboards, position view and exact add/record parity remain incomplete. |
| Recruitment (7) | Manpower Requisitions; Job Openings; Candidates; Recruitment Pipeline; Interviews; Offers; Create Employee from Offer | NOT IMPLEMENTED | No production recruitment schema/API/workspace. |
| Attendance & Shifts (8) | Shifts; Shift Assignments; Daily Attendance; Monthly Attendance; Attendance Corrections; Overtime; Attendance Period; Attendance Payroll Inputs | PARTIAL | PostgreSQL and backend authority exists. Current production UI consolidates workflows and does not preserve all approved screens/actions. |
| Time & Leave (6) | Leave Types; Leave Balances; Attendance; Leave Requests; Leave Request; Leave Approval | PARTIAL | Policy versions, ledger, accrual, requests, daily allocations and approvals exist. Approved page-level workflows/calendar/history parity remains incomplete. |
| Payroll (10) | Payroll Setup; Salary Structures; Salary Revisions; Payroll Inputs; Payroll Runs; Payroll Validation; Employee Loans; Payroll Journal; Payment Batch; Payslips | PARTIAL | Deterministic backend, immutable evidence, statutory execution, Finance posting, payments and reports exist. Approved ten-screen UI parity and manual browser acceptance remain incomplete. |
| Performance (4) | Performance Cycles; Goals & KPIs; Performance Reviews; Performance Outcomes | NOT IMPLEMENTED | Prototype-only data and calculations. |
| Learning (4) | Training Programs; Training Requests; Training Sessions; Training Completions | NOT IMPLEMENTED | Prototype-only data and calculations. |
| Employee Lifecycle (8) | Onboarding; Probation Reviews; Employee Movements; Resignations; Terminations; Clearance; Final Settlements; Offboarding | PARTIAL | Generic legal-employment lifecycle and assignment transitions exist. Specialized checklist, clearance and settlement authorities/screens remain incomplete. |
| Benefits & Self-service (4) | Loans & Benefits; Statutory Deductions; Employee Self Service; HR Report Centre | PARTIAL | Loans, statutory evidence, identity binding and released own payslips exist. General benefits, full ESS and report-centre parity remain incomplete. |
| Reporting, Compliance & Audit (3) | HR Compliance Configuration; HR Report & Audit Log; HR Export Centre | PARTIAL | Payroll reports and common audit exist. The approved 45-report catalogue, compliance workspace and governed HR export jobs are incomplete. |

## Active conversion

`HR-PARITY-01` closes Organisation & Masters before dependent Employee work.
Its implementation gates pass; status stays `PARTIAL` until the owner-provided
real-data workflow and visual acceptance are recorded through the actual UI.
