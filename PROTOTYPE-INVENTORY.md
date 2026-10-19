# Nexora ERP Prototype Inventory

This is the review inventory for the isolated UI/UX prototype. The source of truth is `app/prototype-data.ts`.

- **35 modules**
- **146 menu groups**
- **792 screen entries**
- **8 reusable screen archetypes:** dashboard, list, detail, form, approval, workflow, report, settings
- **3 honest Coming Soon screens**, marked below
- **3 matured modules** - Banking & Treasury, Finance & Accounting, and Fleet Management - whose screens are domain-specific
  rather than generic archetypes. Every other module still renders the shared archetypes, which is why the
  catalogue stays complete while modules mature one at a time.

Every unmarked page is a clickable mock screen. A catalogue entry represents a purposeful screen specification rendered through the shared prototype design system; it does not imply a production route, backend, transaction engine, or separate business implementation.

## Complete module → menu group → page hierarchy

### 1. OV — Dashboard / Overview

- **Command Centres:** CEO Executive Command Centre; CFO Dashboard; Finance Manager Dashboard; Production Manager Dashboard; HR Manager Dashboard; Purchasing Manager Dashboard; Sales Manager Dashboard; Accountant Workspace; Sales Executive Workspace; Procurement Officer Workspace; Inventory Manager Dashboard; Warehouse Operations Dashboard; Project Manager Dashboard; Administrator Control Centre; CRM Manager Dashboard; Accounts Receivable Dashboard; Accounts Payable Dashboard; Tax Manager Dashboard; Auditor Assurance Dashboard; KPI Drill-down & Alerts

### 2. BK — Banking & Treasury

- **Bank:** Account Balances; Bank Payments; Bank Receipts; Transfers; Reconciliation; Import Statement; Revaluation; 1Bill
- **Transaction Entry:** Add Bank Payment; Add Bank Receipt; Add Bank Transfer; Add Bank Charge; Add Bank Interest; Issue Cheque; Receive Cheque; Add Bank Deposit; Bank Transaction Detail
- **Bank Accounts:** Bank & Cash Accounts; Bank Account Setup; Bank Account Detail; Bank Statement
- **Treasury & Instruments:** Treasury Overview; Cash Forecast; Statement Matching; Bank Charges; Bank Interest; Cheques; Post-dated Cheques; Deposit Slips; Bank Guarantees; Letters of Credit; Treasury Reports

### 3. SL — Sales & Billing

- **Quotations:** All Quotations; Add Quotation; Quotation Detail
- **Sales Orders:** All Sales Orders; Add Sales Order; Sales Order Detail; Pick, Pack & Delivery
- **Invoices:** All Invoices; Add Invoice; Invoice Detail; Credit Note; Debit Note; Batch Invoice; Proforma Invoice
- **Returns & Control:** Sales Returns; Pricing & Discounts; Sales Approvals; Sales Reports

### 4. RV — Revenue & Subscriptions

- **Revenue Contracts:** Contract Workspace; Add Revenue Contract; Performance Obligations; Transaction Price Allocation; Fulfilment Evidence
- **Recognition:** Recognition Schedules; Recognition Run; Exceptions & Holds; Contract Modifications; Revenue Roll-forward
- **Subscriptions:** Plan Catalogue; Plan Editor; Subscription Contracts; Subscription Detail; Amend, Pause or Cancel; Usage Validation
- **Recurring Billing:** Billing Schedules; Billing Run; Dunning & Recovery; Renewal & Churn Workspace; MRR, ARR & Cohorts

### 5. AR — Customers / Accounts Receivable

- **Customers:** Customer Directory; Add Customer; Customer Financial Profile; Credit Limit Review
- **Receivables:** Open-item Ledger; Customer Receipts; Add Customer Receipt; Receipt & Credit Allocation; Refunds & Write-offs
- **Collections:** AR Ageing; Collections & Disputes; Customer Statements; AR to GL Reconciliation

### 6. PR — Purchases & Procurement

- **Purchase Requisitions:** All Requisitions; Add Requisition; Requisition Detail; Requisition Approval; Budget & Commitment Check
- **Sourcing:** Requests for Quotation; Add RFQ; Supplier Quotations; Bid Comparison; Supplier Evaluation; Award Recommendation
- **Orders & Receipts:** Purchase Orders; Add Purchase Order; Purchase Order Detail; PO Approval; Gate Inward Pass; Goods Receipts; Add Goods Receipt; Quality Inspection Handoff
- **Bills & Match:** Service Entry; Purchase Bills; Add Purchase Bill; 2 / 3-way Match; Match Exceptions; Supplier Returns; Procurement Reports

### 7. AP — Suppliers / Accounts Payable

- **Suppliers:** Supplier Directory; Add Supplier; Supplier Financial Profile; Onboarding & KYC; Bank Detail Verification
- **Payables:** Payable Bills; AP Open-item Ledger; Duplicate Bill Review; Advances & Credits; Holds & Disputes
- **Payments:** Payment Proposals; Payment Request; Payment Approval; Supplier Statements; AP Ageing; AP to GL Reconciliation

### 8. IN — Inventory & Warehousing

- **Inventory Masters:** Item Master; Add Item; Item Detail; Warehouses, Locations & Bins; Warehouse Editor
- **Stock Control:** Stock Position; Stock Ledger; Reservations; Pick Tasks; Pack & Dispatch; Stock Issues; Stock Transfers; Replenishment
- **Counts & Traceability:** Cycle Counts; Inventory Adjustments; Batch, Serial & Expiry; Movement Genealogy; Quarantine & Recall
- **Valuation:** Inventory Valuation; Inventory Revaluation; Inventory Reports

### 9. CS — Costing & Landed Cost

- **Landed Cost:** Costing Overview; Cost Policies; Landed-cost Shipments; Charge Capture; Allocation Preview; Allocation Approval & Posting
- **Item Costs:** Item Cost History; Standard Cost Versions; Standard Cost Editor; Cost Variance; Cost to GL Reconciliation; Costing Reports

### 10. FN — Finance & Accounting

- **Chart of Accounts:** Chart of Accounts Overview; Nominals; Section Management; Nominal Account Detail; Add Nominal
- **Journals:** Journal Register; Manual Journal; Journal Detail; Journal Approval & Posting; Journal Reversal; Recurring Journals
- **Ledgers & Close:** Accounting Event Ledger; General Ledger; Fiscal Periods; Period-close Workbench; FX Revaluation
- **Group & Reporting:** Intercompany Transactions; Consolidation Workbench; Trial Balance; Financial Statements; Finance Drill-down; Finance Audit Trail

### 11. TX — Taxation & Compliance

- **Tax Setup:** Tax Overview; Jurisdictions & Registrations; Tax Rule Catalogue; Tax Code Editor; Withholding Setup
- **Transaction Tax:** Transaction Tax Preview; Tax Exception Queue; E-invoice Monitor
- **Returns & Evidence:** Return Workbench; Tax Reconciliation; Certificates & Evidence; Tax Reports

### 12. OP — Operations

- **Execution:** Daily Operations Board; Operational Work Orders; Add Work Order; Dispatch & Assignment; Execution Checklist; Completion & Acceptance
- **Control:** Exceptions & Incidents; Incident Detail; Shift & Site Handover; Operations Reports

### 13. MF — Production / Manufacturing

- **Product Engineering:** Production Overview; BOM Catalogue; BOM Editor; Routings; Routing Editor; Work Centres & Machines
- **Planning:** Demand Plan; MRP Run; Material Requirements; Capacity Planner
- **Production:** Production Orders; Add Production Order; Production Order Detail; Release Production Order; Material Issue; WIP Tracking; Production Completion
- **Exceptions & Cost:** Scrap, By-product & Rework; Subcontracting; Production Cost & Variance; Production Reports

### 14. QM — Quality Management

- **Quality Planning:** Quality Dashboard; Quality Plans & Specifications; Quality Plan Editor
- **Inspection:** Inspection Queue; Inspection Execution; Quarantine & Disposition; Quality Approvals
- **Improvement:** Non-conformance; Corrective & Preventive Actions; Supplier Quality; Traceability & Recall; Quality Reports

### 15. CR — CRM

- **Relationships:** CRM Dashboard; Accounts & Contacts; Account & Contact Detail
- **Pipeline:** Lead Inbox; Lead Qualification; Opportunity Pipeline; Opportunity Workbench; Activities & Timeline
- **Handoff & Forecast:** Proposal Handoff; Sales Forecast; CRM Reports

### 16. PJ — Projects & Professional Services

- **Portfolio:** Project Dashboard; Project Portfolio; Add Project; Project Detail; Project Setup & Contract
- **Planning & Delivery:** WBS & Milestones; Project Budget; Delivery Board; Project Status
- **Commercials:** Time & Expense Review; Milestone & T&M Billing; Revenue & WIP; Project Profitability; Project Close; Project Reports

### 17. RS — Resource Management & Utilisation

- **Resources:** Resource Dashboard; Resource & Skill Profiles; Resource Profile; Capacity Calendar
- **Allocation:** Allocation Planner; Allocation Requests; Allocation Approval
- **Utilisation:** Utilisation & Bench; Demand Forecast; Timesheet Capacity View; Resource Reports

### 18. HD — Helpdesk / Support / AMC

- **Service Desk:** Support Dashboard; Ticket Queue; Add Ticket; Ticket Workbench; SLA & Priority Policies; Knowledge Search
- **Contracts & Entitlements:** Support & AMC Contracts; AMC Contract Detail; Entitlement Consumption; Renewal & Escalation; Support Reports

### 19. HR — HR & Payroll

- **Organisation & Masters:** Organisation Structure; Designations; Job Grades; Cost Centres; Work Locations; Employment Types; Employee Categories
- **People:** HR Dashboard; Finance / Payroll Dashboard; Employee Directory; Add Employee; Employee Record; Positions & Organisation
- **Recruitment:** Manpower Requisitions; Job Openings; Candidate Directory; Recruitment Pipeline; Interviews & Evaluations; Offer Management; Create Employee from Offer
- **Attendance & Shifts:** Shifts & Rules; Shift Assignments; Daily Attendance; Monthly Attendance; Attendance Corrections; Overtime; Attendance Period Close; Attendance → Payroll Inputs
- **Time & Leave:** Leave Types; Leave Balances; Attendance; Leave Requests; Add Leave Request; Leave Approval
- **Payroll:** Pay Components; Salary Structures; Salary Revisions; Payroll Inputs; Payroll Runs; Payroll Review & Approval; Loans & Advances; Payroll Journal; Payment Batch; Payslips & Payment Handoff
- **Performance Management:** Performance Cycles; Goals & KPIs; Performance Reviews; Performance Outcomes
- **Learning & Development:** Training Programmes; Training Requests; Training Sessions; Completion & Certificates
- **Employee Lifecycle:** Onboarding; Probation Reviews; Transfers, Promotions & Movements; Resignations; Termination Cases; Exit Clearance; Final Settlements; Offboarding Control Centre
- **Benefits & Self-service:** Loans, Benefits & Gratuity; Statutory Deductions; Employee Self-service; HR & Payroll Report Centre
- **Reporting, Compliance & Audit:** Compliance Configuration; Report Audit Log; Secure Export Centre

### 20. FA — Fixed Assets & Leases

- **Asset Register:** Assets Dashboard; Asset Classes & Policies; Asset Register; Add Asset; Asset Detail; Acquisition & CWIP; Capitalisation; Transfer & Assignment
- **Measurement:** Depreciation Run; Revaluation & Impairment; Asset Disposal
- **Leases:** Lease Register; Lease Detail; Lease Schedule & Payments; Asset & Lease Reports

### 21. EX — Expense Management

- **Claims:** Expense Dashboard; Expense Policies & Categories; Expense Inbox; Add Expense Claim; Expense Claim Detail; Receipt Capture & OCR Review; Mileage & Per Diem; Expense Approval
- **Settlement:** Corporate Card Matching; Cash Advances & Settlement; Reimbursement & Accounting; Expense Reports

### 22. DM — Document Management

- **Document Library:** Document Dashboard; Document Library; Upload, Classify & Link; Document Detail & Versions; Template Catalogue
- **Governance:** Access & Sharing Review; Retention & Legal Holds; Expiry & Renewal Queue; Document Audit & Search

### 23. BP — Budget & Planning

- **Planning:** Planning Dashboard; Planning Scenarios; Budget Models; Dimensioned Budget Entry; Import & Spread; Budget Workflow
- **Forecast & Control:** Forecast & Reforecast; Commitment Control; Budget Availability; Budget vs Actual; Planning Reports

### 24. RA — Reports & Analytics

- **Reporting:** Analytics Dashboard; Report Catalogue; Report Runner; Report Viewer; Drill-down Explorer; Saved Views & Exports
- **Executive Reports:** Enterprise Performance Summary; Profitability by Business Unit; Cash, Exposure & Risk Summary; Executive KPI Variance
- **Banking Reports:** Bank Account Activity; Bank & Cash Balance Summary; Bank Reconciliation Status; Unmatched Statement Transactions; Daily Cash Position
- **Sales Reports:** Invoice Details Report; Sales Order Status & Fulfilment; Sales by Product & Category; Sales by Customer & Territory; Sales Margin & Discount Analysis; Sales Tax Analysis; Returns, Credit Notes & Adjustments
- **Revenue Reports:** Revenue Recognition Schedule; Deferred & Unearned Revenue; Recurring Revenue Movement; Contract Revenue & Obligations
- **Customer Reports:** Customer Statement; Customer Payments Outstanding; Receivables Ageing by Customer; Customer Advance Payments; Credit Limit & Exposure; Receipt Allocation & Unapplied Cash
- **Purchase Reports:** Purchase Requisition Status; RFQ & Supplier Quotation Comparison; Purchase Order Details; GRN & Pending Receipt Report; Purchase Bill Details; Purchase Price Variance; Three-way Match Exceptions
- **Supplier Reports:** Supplier Statement; Supplier Payments Outstanding; Payables Ageing by Supplier; Supplier Advances & Deposits; Supplier Delivery & Quality Performance
- **Inventory Reports:** Stock Balance by Item & Warehouse; Inventory Valuation; Stock Movement & Ledger; Inventory Ageing; Slow-moving & Dead Stock; Reorder, Shortage & Availability; Stock Count Variance
- **Costing Reports:** Cost Centre Performance; Job & Work Order Cost; Standard vs Actual Cost; Overhead Absorption; Material, Labour & Overhead Variance
- **Finance Reports:** General Ledger Detail; Trial Balance; Profit & Loss Statement; Balance Sheet; Cash Flow Statement; Journal Register & Posting Audit; Budget vs Actual by Account; Financial Ratios & Trends
- **Tax Reports:** Sales Tax Return Detail; Input vs Output Tax Reconciliation; Withholding Tax Register; Tax Liability & Payment Schedule; Tax Exceptions & Missing Evidence
- **Operations Reports:** Operational Throughput; SLA & Turnaround Performance; Operational Exceptions; Capacity & Workload
- **Manufacturing Reports:** Production Output & Attainment; Production Plan vs Actual; Work in Progress; Material Consumption; Machine & Labour Efficiency; Scrap, Yield & Rework; Production Cost Variance
- **Quality Reports:** Inspection Results; Non-conformance Analysis; CAPA Status & Effectiveness; Supplier Defect Analysis; Customer Return Quality Analysis
- **CRM Reports:** Opportunity Pipeline; Lead & Opportunity Conversion; Sales Activity & Follow-up; Weighted Sales Forecast; Campaign Response & ROI
- **Project Reports:** Project Profitability; Project Budget vs Actual; Project WIP & Unbilled Revenue; Milestone & Delivery Status; Project Time & Cost Detail; Revenue Leakage & Write-offs
- **Resource Reports:** Resource Utilisation; Capacity & Demand; Billable vs Non-billable Time; Bench & Availability; Skill Coverage & Gaps
- **Support Reports:** Ticket Volume & Backlog; Support SLA Performance; Resolution Time & First-contact Rate; Customer Satisfaction
- **HR Reports:** Employee List; Employee Directory; Department-wise Employees; Branch-wise Employees; Designation-wise Employees; Employee Status Report; New Joiners; Exits; Employee Turnover; Employee History; Document Expiry
- **Attendance Reports:** Daily Attendance; Monthly Attendance; Absence; Late; Early Departure; Overtime; Missing Punch; Department Attendance; Employee Attendance Summary
- **Leave Reports:** Leave Balance; Leave Taken; Leave Pending; Leave by Department; Leave by Type; Leave Trend
- **Payroll Reports:** Payroll Register; Salary Sheet; Department Payroll; Branch Payroll; Earnings Summary; Deduction Summary; Tax Summary; Overtime Payroll; Bonus Report; Loan Recovery; Advance Recovery; Payroll Variance; Net Salary Report
- **Payroll Accounting Reports:** General Ledger; Salary Payable; Tax Payable; Employee Receivables; Employer Contributions; Cost Center Expenses
- **Asset Reports:** Fixed Asset Register; Depreciation Schedule; Asset Movement & Custody; Asset Disposal & Gain/Loss; Asset Maintenance & Downtime
- **Expense Reports:** Expense Claim Details; Expenses by Category & Department; Policy Exceptions & Duplicate Claims; Reimbursement Status
- **Document Reports:** Document Register; Expiry & Renewal Schedule; Document Access & Sharing; Retention & Legal Hold Status
- **Budget Reports:** Consolidated Budget; Budget vs Actual; Budget Commitments & Availability; Forecast & Reforecast Comparison; Budget Variance Commentary
- **Portal Reports:** Portal Usage & Adoption; Self-service Requests & Status; Portal Access & Transaction Exceptions
- **Administration Reports:** User Access & Role Assignment; Licence & Module Utilisation; Administration Change Log; Sessions & Security Events
- **Configuration Reports:** Configuration Register; Number Series & Usage; Workflow & Approval Configuration
- **Approval Reports:** Pending Approvals by Age; Approval Turnaround Time; Delegation & Escalation; Approval Decisions & Comments
- **Notification Reports:** Notification Delivery Status; Failed & Retried Notifications; Channel & Preference Analysis
- **Integration Reports:** Integration Health & Availability; Message Volume & Throughput; Integration Errors & Retries; Integration Reconciliation
- **AI Reports:** AI Usage & Adoption; Recommendation Outcomes; AI Governance & Human Review
- **Audit Reports:** Transaction Audit Trail; Master-data Change Audit; Access & Permission Audit; Control Testing & Exceptions; Audit Evidence Completeness
- **Migration Reports:** Migration Progress & Readiness; Migration Validation Results; Migration Errors & Corrections; Legacy-to-Nexora Reconciliation
- **Mobile Reports:** Mobile Usage & Adoption; Mobile Sync & Offline Queue; Device, Version & Security Status
- **Fleet Reports:** Vehicle Whole-life Cost; Utilisation & Downtime; Fuel Efficiency; Maintenance Cost Analysis; Compliance Expiry; Driver Safety; Incident & Claim Analysis
- **Distribution:** Schedules & Subscriptions; Dashboard Composer; Metric Definitions & Freshness; Reporting Administration

### 25. PT — Portals

- **Customer Portal:** Customer Portal Home; Invoices & Payments; Statements & Disputes; Support & Projects
- **Supplier Portal:** Supplier Portal Home; RFQ & Quotation; PO & Receipt Visibility; Invoice & Payment Status
- **Employee Portal:** Employee Portal Home; Leave & Attendance; Expenses & Timesheets; Payslips & Documents

### 26. AD — Administration & Multi-Tenancy

- **Organisation:** Administration Dashboard; Tenant Directory; Companies & Organisation; Company Detail
- **Identity & Access:** User Directory; Add User; User Detail & Access; Role & Permission Designer; Company-role Assignments; Access Review; Delegation & Impersonation; Security & Session Policies
- **Entitlements:** Editions & Entitlements; Module Visibility; Prototype Environment; Administration Audit

### 27. CF — System Configuration & Extensibility

- **Core Setup:** Configuration Home; Company, Fiscal & Currency; Numbering Sequences; Dimensions; Custom Fields; Validation & Default Rules
- **Experience & Features:** Module Settings; Localisation, Language & RTL; Feature Flags & Entitlements; Form & View Configuration; Configuration Versions; Change Impact & Audit

### 28. WF — Workflow / Approvals / SoD

- **My Work:** Approval Dashboard; My Approvals; Approval Detail; Delegations & Out of Office
- **Workflow Design:** Workflow Definitions; Approval Matrix Editor; Threshold & Routing Simulation; Segregation of Duties Policies
- **Monitoring:** Escalations; Workflow Monitor; Failed & Stuck Instances; Workflow Audit & Reports

### 29. NT — Notifications

- **Inbox:** Notification Centre; Notification Detail; Digests & Inbox
- **Preferences:** User Preferences; Template Editor; Event & Routing Rules; Channel & Escalation Setup
- **Delivery:** Delivery Log & Retry; Notification Reports

### 30. IG — Integrations

- **Connections:** Integration Dashboard; Integration Catalogue; Connection Setup; API Clients & Scopes; Webhook Subscriptions; Data Mapping; Connection Test
- **Integration Operations:** Integration Runs; Message & Event Detail; Error, Retry & Dead-letter Queue; Credential Rotation; Usage & Rate Limits; Monitoring & Audit

### 31. AI — AI Assistant

- **Assistant:** Contextual Assistant; Suggestion Review; Document Extraction Review; Explanation & Forecast; Human Approval Handoff
- **AI Governance:** Automation Catalogue; Model & Policy Configuration; Source & Confidence Viewer; Evaluation & Feedback; AI Audit & Usage

### 32. AU — Audit & Compliance

- **Audit:** Audit Dashboard; Audit Explorer; Audit Event Detail; Transaction History; Login & Session Audit; Permission & Access Audit; Master-data Change Review
- **Compliance:** Approval Evidence; Compliance Evidence Packs; Retention & Legal Hold; Control Exceptions & Alerts

### 33. MG — Data Migration & Cutover

- **Migration:** Migration Dashboard; Migration Projects; Migration Project Detail; Object & Template Catalogue; File Upload & Profile; Field Mapping; Validation & Dry Run; Error Correction
- **Cutover:** Load Monitor; Migration Reconciliation; Migration Sign-off; Cutover & Freeze Plan **[Coming Soon]**; Parallel Run & Rollback **[Coming Soon]**; Hypercare Dashboard

### 34. MB — Mobile

- **Mobile Work:** Mobile Home; Mobile Approvals; Barcode & QR Scan; Receive, Move & Count Stock; Expense Capture; Timesheet; Leave & Attendance; Field-service Task; Customer & Supplier Lookup; Mobile Notifications
- **Offline & Security:** Offline Queue & Conflict **[Coming Soon]**; Mobile Security & Settings

### 35. FL — Fleet Management

- **Fleet Command Centre:** Fleet Overview; Fleet Calendar
- **Vehicles & Drivers:** Vehicle Register; Add Vehicle; Vehicle 360°; Vehicle Categories & Policies; Driver Register; Add Driver; Driver 360°
- **Assignments & Dispatch:** Vehicle Assignments; Add Vehicle Assignment; Dispatch Board; Trip Register; Add Trip; Trip Detail; Route Planning
- **Fuel & Road Costs:** Fuel Register; Add Fuel Entry; Fuel Cards; Fuel Reconciliation; Tolls, Fines & Other Costs; Add Road Cost
- **Maintenance & Components:** Maintenance Dashboard; Maintenance Plans; Add Maintenance Plan; Service Work Orders; Add Service Work Order; Service Work Order Detail; Tyres & Batteries; Spare Parts Usage; Inspection Schedule
- **Compliance & Incidents:** Registration, Insurance & Permits; Renewal Calendar; Driver Licence Compliance; Accidents & Incidents; Add Incident; Incident & Claim Detail; Insurance Claims
- **Cost, Controls & Reports:** Vehicle Whole-life Cost; Utilisation & Downtime; Fuel Efficiency; Maintenance Cost Analysis; Fleet Reports; Fleet Approvals; Fleet Settings

## Company navigation variants

- **Service:** prioritises revenue/subscriptions, CRM, projects, resources, support, HR, expenses, finance, and shared platform controls.
- **Trading:** prioritises sales, purchasing, inventory, costing, banking, receivables/payables, tax, and shared platform controls.
- **Manufacturing:** adds product engineering, MRP, production execution, quality, warehouse traceability, landed cost, and production variance experiences.

The **Company menus: Scoped/All** toggle demonstrates these differences. It does not change data, licensing, permissions, or a tenant configuration.

## Role visibility variants

The prototype provides dedicated dashboards for Chief Executive, Chief Financial Officer, Finance Manager, Accountant, Sales Manager, Purchasing Manager, Production Manager, and HR Manager, with additional Inventory Manager, Project Manager, Administrator, and Viewer perspectives. The **Role menus: Scoped/All** toggle is a visual review aid only; it is not an authentication or authorisation control.

## Review status

All catalogue screens are mock/demo only. The five Coming Soon entries deliberately show an honest placeholder instead of implying finished interaction depth. No screen in this inventory performs a real accounting or business transaction.
