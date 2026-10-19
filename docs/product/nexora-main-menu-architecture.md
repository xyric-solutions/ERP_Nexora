# Nexora ERP Main Menu Architecture

- Status: historical NAV-01 architecture; superseded for executable menu detail
  by `nexora-main-menu-navigation.md` and the current `nav-config.ts`
- Version: 1.0
- Date: 2026-08-19
- Scope: navigation architecture only
- Executable source: `web/src/components/shell/nav-config.ts`
- UI renderer: `web/src/components/shell/app-sidebar.tsx`

## Pre-change assessment

The previous sidebar grouped the product into five coarse sections and exposed
only one navigation depth. Finance appeared as 18 flat links, later modules
were mixed under a generic Operations heading, and the customer-facing badge
`shell` described an implementation detail rather than product maturity.

The current authorization model already supplies backend role permissions, but
the old sidebar could test only one permission per link. This was insufficient
for module visibility and for nested branches whose children require different
permissions.

Implementation evidence establishes the following safe baseline:

- S2.1-S2.3 Finance accounting events, posting, journals, ledger, statements,
  drill-down and audit reads are the implemented technical baseline.
- Procurement and Inventory contain real S3.1 cores but are not complete
  commercial modules, so their top-level status is `Prototype` and only
  evidence-backed leaves are marked `Implemented`.
- Setup Drafts is implemented. Organization, identity, workflow, settings,
  notifications and similar administrative pages remain prototypes.
- Future commercial modules are visible for product orientation but marked
  `Coming Soon` and have no clickable destination unless an honest explanatory
  page already exists.

No Finance API, posting rule, ledger model, business transaction, generated
contract, or database migration is changed by this architecture.

## Status contract

| Status | Meaning | Navigation behaviour |
|---|---|---|
| Implemented | Evidence-backed current functionality exists | Clickable only when an existing route and permission both exist |
| Prototype | A real partial core or structural page exists; the complete module is not delivered | Clickable only to existing honest surfaces |
| Coming Soon | Product scope only; no implementation claim | Visible but disabled unless an existing explanatory route exists |

A top-level status describes the maturity of the module as a whole. A child
may have a different status. For example, Finance is implemented, while its
Close Workbench is Coming Soon; Procurement is a prototype, while its Vendor
Register read view is implemented.

## Main-menu register

| # | Main menu | Status | Current entry route | Primary sub-menu groups |
|---:|---|---|---|---|
| 1 | Dashboard | Prototype | `/dashboard` | Dashboard Home; Executive Overview; Finance Overview; Procurement Overview; Inventory Overview; My Work & Approvals; Alerts & Exceptions |
| 2 | Banking & Treasury | Prototype | `/finance/cash-bank` | Cash & Bank Overview; Bank & Cash Accounts; Account Balances; Bank Payments; Bank Receipts; Account Transfers; Statements & Reconciliation; Cheques & Deposit Slips; Interest, Charges & Revaluation; Facilities, Guarantees & LC; Treasury Reports |
| 3 | Sales | Coming Soon | Disabled | Sales Overview; Quotations; Sales Orders; Deliveries; Invoices; Customer Returns; Pricing & Discounts; Commissions; Sales Reports |
| 4 | Revenue & Subscriptions | Coming Soon | Disabled | Revenue Overview; Contracts & Subscriptions; Usage & Milestones; Billing Schedules; Revenue Recognition; Deferred & Accrued Revenue; Renewals & Churn; Revenue Reports |
| 5 | Customers / Receivables | Coming Soon | `/finance/accounts-receivable` | Receivables Overview; Customers & Credit Control; Accounts & Open Items; Receipts & Allocations; Credits, Refunds & Write-offs; Disputes, Collections & Dunning; Statements & Aging; AR-to-GL Reconciliation |
| 6 | Purchases / Procurement | Prototype | `/procurement` | Procurement Overview; Vendor Register; Purchase Requisitions; Procurement Approvals; RFQs & Supplier Quotations; Bid Comparison; Purchase Orders; Gate Inward & Goods Receipts; Quality Inspection; Service Entry; Purchase Bills & 2/3-Way Match; Returns & Contracts; Reports |
| 7 | Suppliers / Payables | Coming Soon | `/finance/accounts-payable` | Payables Overview; Suppliers & Financial Profiles; Bills & Open Items; Advances, Credits & Allocations; Payment Requests & Proposals; Withholding Tax; Holds & Disputes; Statements & Aging; AP-to-GL Reconciliation |
| 8 | Inventory & Warehousing | Prototype | `/inventory` | Inventory Overview; Item Master; Warehouses, Locations & Bins; Stock Overview & Ledger; Receipt Movement Trace; Reservations, Pick & Pack; Issues, Transfers & Deliveries; Counts & Adjustments; Batch, Serial & Expiry Trace; Replenishment; Valuation & Revaluation; Reports |
| 9 | Costing & Landed Cost | Coming Soon | Disabled | Cost Policies & Components; Landed Cost Documents; Allocation Runs; Standard & Actual Costs; Cost Roll-up & Variances; COGS & Revaluation; Cost-to-GL Reconciliation; Reports |
| 10 | Finance & Accounting | Implemented | `/finance` | Finance Overview; Accounts & Ledgers; Journals; Planning & Close; Intercompany & Consolidation; Financial Statements; Controls & Audit |
| 11 | Taxation & Compliance | Prototype | `/finance/tax` | Tax Overview; Tax Rules & Codes; Registration & Periods; Input/Output Tax; Withholding; Returns & Filings; Reconciliation; Audit & Reports; Localisation Packs |
| 12 | Operations | Coming Soon | Disabled | Operations Overview; Work Orders; Tasks & Scheduling; Service Delivery; Dispatch & Field Work; Operational Checklists; Exceptions; Reports |
| 13 | Production / Manufacturing | Coming Soon | Disabled | Production Overview; BOMs & Routings; Work Centres; Demand & Material Planning; Production Orders; Material Issue/Return; Shop-floor Execution; Output & By-products; Variance & WIP; Subcontracting; Reports |
| 14 | Quality Management | Coming Soon | Disabled | Quality Overview; Plans & Specifications; Incoming/In-process/Final Inspection; Nonconformance; CAPA; Holds & Release; Certificates; Supplier Quality; Reports |
| 15 | CRM | Coming Soon | `/crm` | CRM Overview; Leads; Opportunities; Activities; Campaigns; Pipeline & Forecast; Customer 360; Handover to Sales/Projects; Reports |
| 16 | Projects & Professional Services | Coming Soon | `/projects` | Project Overview; Project Master; WBS & Tasks; Resources & Staffing; Timesheets; Expenses; Billing & Revenue; Costs & Profitability; Milestones & Risks; Reports |
| 17 | Resource Management | Coming Soon | Disabled | Resource Overview; Skills & Capacity; Availability; Allocations; Utilisation; Demand & Bench; Conflicts; Forecast; Reports |
| 18 | Helpdesk / Support | Coming Soon | Disabled | Support Overview; Tickets; Queues & Assignment; SLA & Escalation; Knowledge Base; Customer Communication; Service History; Billing Handoff; Reports |
| 19 | HR & Payroll | Coming Soon | `/hr` | HR Overview; Employees; Organization & Positions; Recruitment & Onboarding; Attendance; Leave; Payroll; Benefits & Loans; Performance & Learning; Separation; Reports |
| 20 | Fixed Assets & Leases | Coming Soon | `/finance/fixed-assets` | Asset Overview; Classes & Register; Acquisition/Capitalisation; Transfer & Assignment; Depreciation; Revaluation & Impairment; Disposal; Lease Register & Schedules; Reports |
| 21 | Expenses | Coming Soon | Disabled | Policies & Categories; Expense Inbox & Claims; Receipt Capture & OCR Review; Mileage & Per Diem; Approvals; Corporate Card Matching; Advances & Settlement; Reimbursement & Accounting; Reports |
| 22 | Documents | Coming Soon | Disabled | Document Library; Upload, Classify & Link; Versions & Templates; Access & Sharing; Retention & Legal Hold; Expiry & Renewal; Search & Audit |
| 23 | Budget & Planning | Prototype | `/finance/budgets` | Budget Workspace; Scenarios & Models; Dimensioned Entry; Import & Spread; Workflow; Forecast & Reforecast; Commitment & Availability; Budget vs Actual; Reports |
| 24 | Reports & Analytics | Prototype | `/reports` | Report Catalogue; Financial Reports; Procurement; Inventory; Sales; Projects; HR; Saved Views, Export & Scheduling; Dashboard & Metric Designer |
| 25 | Portals | Coming Soon | Disabled | Customer Portal; Supplier Portal; Employee Portal; Support & Project Portal; Portal Access & Security |
| 26 | Administration | Prototype | Expand only | Setup Drafts; Tenant, Company & Organization; Users, Roles & Permissions; Company Access; Access Review & Security Policy; Edition & Module Visibility; Demo Environment & Reset; My Profile |
| 27 | Configuration | Prototype | `/settings` | Configuration Home; Company, Fiscal & Currency Setup; Numbering; Dimensions; Custom Fields & Validation; Module Settings & Feature Flags; Localisation, Language & RTL; Forms & Views; My Preferences |
| 28 | Workflow & Approvals | Prototype | `/admin/workflows` | My Approvals; Workflow Definitions; Approval Matrix & Thresholds; Segregation of Duties; Delegation; Escalations; Monitor & Exceptions; Audit & Reports |
| 29 | Notifications | Prototype | `/notifications` | Notification Centre; Preferences; Digests & Inbox; Templates & Routing; Delivery Log & Retry; Channels & Escalations |
| 30 | Integrations | Coming Soon | `/admin/integrations` | Catalogue; Connections & Mapping; API Clients & Scopes; Webhooks; Runs, Messages & Retry; Credential Rotation; Usage, Monitoring & Audit |
| 31 | AI Assistant | Coming Soon | `/ai` | Contextual Assistant; Suggestion Review; Document Extraction Review; Explanations & Forecasts; Human Approval Handoff; Automation Catalogue; Model & Policy Configuration; Sources, Evaluation & Audit |
| 32 | Audit & Compliance | Prototype | `/audit-log` | Audit Explorer; Transaction History; Login & Session Audit; Permission & Access Audit; Master-data Change Review; Approval Evidence; Evidence Packs; Retention & Legal Hold; Exceptions & Alerts |
| 33 | Data Migration | Coming Soon | Disabled | Migration Projects; Object & Template Catalogue; Upload, Profile & Field Mapping; Validation & Dry Run; Error Correction; Load Monitor & Reconciliation; Sign-off & Cutover; Parallel Run & Rollback; Hypercare Dashboard |
| 34 | Mobile | Coming Soon | Disabled | Mobile Home; Approvals; Barcode & QR Scanning; Receive, Move & Count Stock; Expense Capture; Timesheets; Leave & Attendance; Field-service Tasks; Customer & Supplier Lookup; Offline Queue & Security |

## Required sub-sub-menus

- Banking > Statements & Reconciliation > Import Bank Statement; Statement
  Matching; Bank Reconciliation.
- Sales > Invoices > New Invoice; Proforma Invoices; Batch & Recurring
  Invoices; Credit Notes; Debit Notes.
- Finance > Accounts & Ledgers > Chart of Accounts; Accounting Events; General
  Ledger.
- Finance > Journals > New Manual Journal; Journal Register; Recurring
  Journals; Reversals.
- Finance > Planning & Close > Period Management; Close Workbench; Budgets;
  Budget vs Actual; FX Revaluation.
- Finance > Intercompany & Consolidation > Intercompany Transactions;
  Consolidated Statements.
- Finance > Financial Statements > Finance Reports; Trial Balance; Profit &
  Loss; Balance Sheet; Cash Flow.
- Finance > Controls & Audit > Tax Configuration; Finance Audit; Report
  Definitions.
- Reports & Analytics > Financial Reports > Finance Report Centre; Trial
  Balance; Profit & Loss; Balance Sheet; Cash Flow.

## Permission-aware visibility

1. Top-level commercial scope with no permission gate remains visible so users
   understand the product map; unavailable leaves are disabled.
2. Protected modules are visible only when the session holds at least one of
   the module's accepted read/manage permissions.
3. Descendants are filtered independently. Receiving access to Chart of
   Accounts does not expose Journal Register or General Ledger.
4. Procurement and Inventory navigation uses their backend permission strings,
   not a frontend-only role name.
5. Status does not grant access. `Implemented` identifies maturity; RBAC still
   decides visibility and the backend remains authoritative on every request.
6. The active route and its ancestors expand automatically; users may expand
   other modules without navigating away.

## Route and compatibility rules

- The same Nexora application shell, Demo Company context, banner, dashboard
  and pages are reused.
- All clickable menu items resolve to routes that existed before this change.
- Procurement and Inventory fragment links target sections on their existing
  overview pages; they do not introduce a new transaction screen.
- Breadcrumb labels are derived recursively from this hierarchy.
- A contract test enforces the 34-module order, unique IDs, route reuse and
  Finance permission boundary.
