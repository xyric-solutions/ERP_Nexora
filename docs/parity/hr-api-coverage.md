# HR page API coverage

Generated from the active route renderer map. Regenerate with `npm run catalogue:generate`.

Of 88 HR catalogue routes: 77 connect to API-backed views, 0 use read-only API views, 11 are navigation hubs, and 0 are mock or unlinked views.

Pages left to connect to an API: none in the current HR catalogue. Navigation hubs link to their connected child pages and do not need their own mutation API.

Source evidence: `app/shell/prototype-content.tsx` selects the renderers below; their HR reads and mutations use `app/features/hr/api/hr-client.ts`, the generated API client and `server/api/src/modules/hr/router.ts` plus the HR feature routers. API_CONNECTED_SOURCE describes implemented wiring, not production certification or a fresh end-to-end test of every workflow. Payment Batch supports governed salary obligations and actual posted Bank Payment confirmation at exact carrying-value parity. FX allocation, external transfer transmission and corrections after confirmed settlement remain separate workflows. Unused legacy mock components and the organisation demo are not active catalogue pages.

| Section | Page | Route | Active renderer | API integration |
| --- | --- | --- | --- | --- |
| Organisation & Masters | Organisation & Masters | `/#/hr/organisation-masters` | `HrOrganisationMastersWorkspace` | NAVIGATION_ONLY |
| Organisation & Masters | Organisation Structure | `/#/hr/org-structure` | `HrOrganizationStructureSheetWorkspace` | API_CONNECTED_SOURCE |
| Organisation & Masters | Designations | `/#/hr/designations` | `HrMasterCatalogueSheetWorkspace` | API_CONNECTED_SOURCE |
| Organisation & Masters | Job Grades | `/#/hr/job-grades` | `HrJobGradesSheetWorkspace` | API_CONNECTED_SOURCE |
| Organisation & Masters | Jobs | `/#/hr/jobs` | `HrMasterCatalogueSheetWorkspace` | API_CONNECTED_SOURCE |
| Organisation & Masters | Cost Centres | `/#/hr/cost-centres` | `HrConfiguredMasterSheetWorkspace` | API_CONNECTED_SOURCE |
| Organisation & Masters | Work Locations | `/#/hr/work-locations` | `HrConfiguredMasterSheetWorkspace` | API_CONNECTED_SOURCE |
| Organisation & Masters | Employment Setup | `/#/hr/employment-setup` | `HrConfiguredMasterSheetWorkspace` | API_CONNECTED_SOURCE |
| Organisation & Masters | Employment Types | `/#/hr/employment-types` | `HrConfiguredMasterSheetWorkspace` | API_CONNECTED_SOURCE |
| Organisation & Masters | Employee Categories | `/#/hr/employee-categories` | `HrConfiguredMasterSheetWorkspace` | API_CONNECTED_SOURCE |
| Recruitment | Recruitment | `/#/hr/recruitment-workspace` | `HrRecruitmentWorkspace` | NAVIGATION_ONLY |
| Recruitment | Manpower Requisitions | `/#/hr/manpower-requisitions` | `HrManpowerRequisitionsWorkspace` | API_CONNECTED_SOURCE |
| Recruitment | Job Openings | `/#/hr/job-openings` | `HrJobOpeningsWorkspace` | API_CONNECTED_SOURCE |
| Recruitment | Candidate Directory | `/#/hr/candidates` | `HrCandidateDirectoryWorkspace` | API_CONNECTED_SOURCE |
| Recruitment | Recruitment Pipeline | `/#/hr/recruitment-pipeline` | `HrRecruitmentPipelineWorkspace` | API_CONNECTED_SOURCE |
| Recruitment | Interviews & Evaluations | `/#/hr/interviews` | `HrInterviewsWorkspace` | API_CONNECTED_SOURCE |
| Recruitment | Offer Management | `/#/hr/offers` | `HrOfferManagementWorkspace` | API_CONNECTED_SOURCE |
| Recruitment | Create Employee from Offer | `/#/hr/create-employee-from-offer` | `HrOfferEmployeeWorkspace` | API_CONNECTED_SOURCE |
| People | People | `/#/hr/people-workspace` | `HrPeopleWorkspace` | NAVIGATION_ONLY |
| People | HR Dashboard | `/#/hr/hr-dashboard` | `HrDashboardWorkspace` | API_CONNECTED_SOURCE |
| People | Finance / Payroll Dashboard | `/#/hr/finance-payroll-dashboard` | `HrFinancePayrollDashboardWorkspace` | API_CONNECTED_SOURCE |
| People | Employee Directory | `/#/hr/employees` | `HrEmployeeDirectory` | API_CONNECTED_SOURCE |
| People | Add Employee | `/#/hr/add-employee` | `HrEmployeeDraftForm` | API_CONNECTED_SOURCE |
| People | Employee Drafts | `/#/hr/employee-drafts` | `HrEmployeeDraftsWorkspace` | API_CONNECTED_SOURCE |
| People | Employee Approvals | `/#/hr/employee-approvals` | `HrEmployeeApprovalsWorkspace` | API_CONNECTED_SOURCE |
| People | Employee Contacts | `/#/hr/employee-contacts` | `HrEmployeeContactsWorkspace` | API_CONNECTED_SOURCE |
| People | Emergency Contacts | `/#/hr/employee-emergency-contacts` | `HrEmployeeEmergencyContactsWorkspace` | API_CONNECTED_SOURCE |
| People | Employee Documents | `/#/hr/employee-documents` | `HrEmployeeDocumentsWorkspace` | API_CONNECTED_SOURCE |
| People | Employment Assignments | `/#/hr/employee-assignments` | `HrEmployeeAssignmentsWorkspace` | API_CONNECTED_SOURCE |
| People | Employee History | `/#/hr/employee-status-history` | `HrEmployeeHistoryWorkspace` | API_CONNECTED_SOURCE |
| People | Employee Record | `/#/hr/employee-record` | `HrEmployeeRecordWorkspace` | API_CONNECTED_SOURCE |
| People | Positions & Organisation | `/#/hr/positions-org` | `HrPositionsOrganizationWorkspace` | API_CONNECTED_SOURCE |
| Attendance & Leave | Attendance & Leave | `/#/hr/attendance-workspace` | `HrOperationsWorkspace` | NAVIGATION_ONLY |
| Attendance & Leave | Shifts & Rules | `/#/hr/shifts` | `HrShiftsWorkspace` | API_CONNECTED_SOURCE |
| Attendance & Leave | Shift Assignments | `/#/hr/shift-assignments` | `HrShiftAssignmentsWorkspace` | API_CONNECTED_SOURCE |
| Attendance & Leave | Leave Types | `/#/hr/leave-types` | `HrTimeLeaveWorkspace` | API_CONNECTED_SOURCE |
| Attendance & Leave | Leave Balances | `/#/hr/leave-balances` | `HrTimeLeaveWorkspace` | API_CONNECTED_SOURCE |
| Attendance & Leave | Leave Request | `/#/hr/leave-requests` | `HrTimeLeaveWorkspace` | API_CONNECTED_SOURCE |
| Attendance & Leave | Leave Approval | `/#/hr/leave-approval` | `HrTimeLeaveWorkspace` | API_CONNECTED_SOURCE |
| Attendance & Leave | Daily Attendance | `/#/hr/daily-attendance` | `HrDailyAttendanceWorkspace` | API_CONNECTED_SOURCE |
| Attendance & Leave | Attendance Corrections | `/#/hr/attendance-corrections` | `HrAttendanceCorrectionsWorkspace` | API_CONNECTED_SOURCE |
| Attendance & Leave | Overtime | `/#/hr/overtime` | `HrAttendanceCompletionWorkspace` | API_CONNECTED_SOURCE |
| Attendance & Leave | Monthly Attendance | `/#/hr/monthly-attendance` | `HrMonthlyAttendanceWorkspace` | API_CONNECTED_SOURCE |
| Attendance & Leave | Attendance Period Close | `/#/hr/attendance-period` | `HrAttendanceCompletionWorkspace` | API_CONNECTED_SOURCE |
| Attendance & Leave | Attendance → Payroll Inputs | `/#/hr/attendance-payroll-inputs` | `HrAttendanceCompletionWorkspace` | API_CONNECTED_SOURCE |
| Attendance & Leave | Add Leave Request | `/#/hr/leave-request` | `HrTimeLeaveWorkspace` | API_CONNECTED_SOURCE |
| Attendance & Leave | Time & Leave | `/#/hr/time-leave-workspace` | `HrOperationsWorkspace` | NAVIGATION_ONLY |
| Attendance & Leave | Attendance | `/#/hr/attendance` | `HrDailyAttendanceWorkspace` | API_CONNECTED_SOURCE |
| Payroll | Payroll | `/#/hr/payroll-workspace` | `HrOperationsWorkspace` | NAVIGATION_ONLY |
| Payroll | Pay Components | `/#/hr/payroll-setup` | `HrPayrollWorkspace` | API_CONNECTED_SOURCE |
| Payroll | Salary Structures | `/#/hr/salary-structures` | `HrPayrollWorkspace` | API_CONNECTED_SOURCE |
| Payroll | Salary Revisions | `/#/hr/salary-revisions` | `HrPayrollWorkspace` | API_CONNECTED_SOURCE |
| Payroll | Payroll Inputs | `/#/hr/payroll-inputs` | `HrPayrollWorkspace` | API_CONNECTED_SOURCE |
| Payroll | Payroll Runs | `/#/hr/payroll-runs` | `HrPayrollRunsWorkspace` | API_CONNECTED_SOURCE |
| Payroll | Payroll Review & Approval | `/#/hr/payroll-validation` | `HrPayrollRunsWorkspace` | API_CONNECTED_SOURCE |
| Payroll | Loans & Advances | `/#/hr/employee-loans` | `HrPayrollWorkspace` | API_CONNECTED_SOURCE |
| Payroll | Payroll Journal | `/#/hr/payroll-journal` | `HrPayrollJournalWorkspace` | API_CONNECTED_SOURCE |
| Payroll | Payment Batch | `/#/hr/payment-batch` | `HrPayrollPaymentWorkspace` | API_CONNECTED_SOURCE |
| Payroll | Payslips | `/#/hr/payslips` | `HrPayslipsWorkspace` | API_CONNECTED_SOURCE |
| Performance Management | Performance Management | `/#/hr/performance-workspace` | `HrOperationsWorkspace` | NAVIGATION_ONLY |
| Performance Management | Performance Cycles | `/#/hr/performance-cycles` | `HrPerformanceWorkspace` | API_CONNECTED_SOURCE |
| Performance Management | Goals & KPIs | `/#/hr/goals-kpis` | `HrPerformanceWorkspace` | API_CONNECTED_SOURCE |
| Performance Management | Performance Reviews | `/#/hr/performance-reviews` | `HrPerformanceWorkspace` | API_CONNECTED_SOURCE |
| Performance Management | Performance Outcomes | `/#/hr/performance-outcomes` | `HrPerformanceWorkspace` | API_CONNECTED_SOURCE |
| Learning & Development | Learning & Development | `/#/hr/learning-workspace` | `HrOperationsWorkspace` | NAVIGATION_ONLY |
| Learning & Development | Training Programmes | `/#/hr/training-programs` | `HrLearningWorkspace` | API_CONNECTED_SOURCE |
| Learning & Development | Training Requests | `/#/hr/training-requests` | `HrLearningWorkspace` | API_CONNECTED_SOURCE |
| Learning & Development | Training Sessions | `/#/hr/training-sessions` | `HrLearningWorkspace` | API_CONNECTED_SOURCE |
| Learning & Development | Completion & Certificates | `/#/hr/training-completions` | `HrLearningWorkspace` | API_CONNECTED_SOURCE |
| Employee Lifecycle | Employee Lifecycle | `/#/hr/employee-lifecycle-workspace` | `HrOperationsWorkspace` | NAVIGATION_ONLY |
| Employee Lifecycle | Lifecycle Policies | `/#/hr/lifecycle-policies` | `HrLifecyclePoliciesWorkspace` | API_CONNECTED_SOURCE |
| Employee Lifecycle | Onboarding | `/#/hr/onboarding` | `HrLifecycleCasesWorkspace` | API_CONNECTED_SOURCE |
| Employee Lifecycle | Probation Reviews | `/#/hr/probation-reviews` | `HrLifecycleCasesWorkspace` | API_CONNECTED_SOURCE |
| Employee Lifecycle | Transfers, Promotions & Movements | `/#/hr/employee-movements` | `HrLifecycleMovementsWorkspace` | API_CONNECTED_SOURCE |
| Employee Lifecycle | Resignations | `/#/hr/resignations` | `HrLifecycleCasesWorkspace` | API_CONNECTED_SOURCE |
| Employee Lifecycle | Termination Cases | `/#/hr/terminations` | `HrLifecycleCasesWorkspace` | API_CONNECTED_SOURCE |
| Employee Lifecycle | Exit Clearance | `/#/hr/clearance` | `HrLifecycleCasesWorkspace` | API_CONNECTED_SOURCE |
| Employee Lifecycle | Final Settlements | `/#/hr/final-settlements` | `HrLifecycleCasesWorkspace` | API_CONNECTED_SOURCE |
| Employee Lifecycle | Offboarding Control Centre | `/#/hr/offboarding` | `HrLifecycleCasesWorkspace` | API_CONNECTED_SOURCE |
| Benefits & Self-service | Benefits & Self-service | `/#/hr/benefits-self-service-workspace` | `HrOperationsWorkspace` | NAVIGATION_ONLY |
| Benefits & Self-service | Loans, Benefits & Gratuity | `/#/hr/loans-benefits` | `HrBenefitsWorkspace` | API_CONNECTED_SOURCE |
| Benefits & Self-service | Statutory Deductions | `/#/hr/statutory-deductions` | `HrBenefitsWorkspace` | API_CONNECTED_SOURCE |
| Benefits & Self-service | Employee Self-service | `/#/hr/employee-self-service` | `HrBenefitsWorkspace` | API_CONNECTED_SOURCE |
| Benefits & Self-service | HR & Payroll Report Centre | `/#/hr/hr-report-centre` | `HrBenefitsWorkspace` | API_CONNECTED_SOURCE |
| Reporting, Compliance & Audit | Reporting, Compliance & Audit | `/#/hr/hr-compliance-workspace` | `HrOperationsWorkspace` | NAVIGATION_ONLY |
| Reporting, Compliance & Audit | Compliance Configuration | `/#/hr/hr-compliance-configuration` | `HrReportGovernanceWorkspace` | API_CONNECTED_SOURCE |
| Reporting, Compliance & Audit | Report Audit Log | `/#/hr/hr-report-audit-log` | `HrReportGovernanceWorkspace` | API_CONNECTED_SOURCE |
| Reporting, Compliance & Audit | Secure Export Centre | `/#/hr/hr-export-centre` | `HrReportGovernanceWorkspace` | API_CONNECTED_SOURCE |
