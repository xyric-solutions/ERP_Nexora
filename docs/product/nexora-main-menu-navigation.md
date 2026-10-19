# Nexora ERP Main Menu & Sub-menu Navigation Contract

- Status: historical NAV-02 contract; superseded on 2026-08-20 by
  `nexora-master-menu-responsive-sidebar.md` and the current `nav-config.ts`
- Version: 1.1 implemented
- Date: 2026-08-19
- Status: **APPROVED AND IMPLEMENTED — NAVIGATION ONLY**
- Scope: menu hierarchy, labels, status, route mapping and visibility only
- Technical baseline: current S2.1-S2.3 Finance plus evidence-backed S3.1 Procurement/Inventory read surfaces
- Approval record: product owner explicitly approved implementation on 2026-08-19
- Live correction: on 2026-08-27 the owner promoted Chart of Accounts to a
  top-level menu. The superseding master contract now has 35 top-level modules.

## 1. Current navigation assessment

The application already used the real Nexora shell and Demo Company when this
historical contract was approved. It contained the then-required 34 top-level
business modules; the live successor now contains 35 after the owner-approved
Chart of Accounts promotion. The shell supports recursive expansion, derives breadcrumbs from one navigation
configuration, filters protected descendants with backend-issued permission
strings, and labels items `Implemented`, `Prototype`, or `Coming Soon`. The
former customer-facing `Shell` terminology has been removed.

The current implementation is nevertheless smaller than the attached target:

1. Many requested business leaves are condensed into combined entries. For
   example, Sales has one Invoices branch rather than separate Invoice List,
   Add New Invoice, Credit Note, Debit Note, Batch Invoice, Recurring Invoice
   and Proforma Invoice entries.
2. Finance is grouped professionally but does not expose the complete requested
   Chart of Accounts, Journal, dimension, multi-currency and audit vocabulary.
3. The status type has three values; the requested fourth value,
   `Not Available`, is not implemented.
4. Current role visibility correctly uses permissions rather than role-name
   checks, but Nexora does not yet return company-model or edition entitlements
   in the browser session. Therefore edition/company-based hiding cannot be
   honestly implemented from current data.
5. Some `Coming Soon` modules currently link to explanatory pages such as CRM,
   HR, Projects and AI. The attached status contract is stricter: Coming Soon
   should remain visible but should not behave like working functionality.
6. The sidebar can render recursive levels, but the approved design should be
   capped at Main Menu > Sub-menu > Action/Page. No fourth business level is
   proposed.
7. The current Demo roles for Sales, Project Manager and HR have only platform
   read access because those modules have no backend permissions. Inventing
   frontend permissions for them would violate the existing RBAC architecture.

No Finance API, posting engine, ledger, journal invariant, business transaction,
database schema, Demo seed or frontend component is changed by this proposal.

## 2. Approved main-menu register

| # | Main menu | Approved status | Default visibility basis |
|---:|---|---|---|
| 1 | Dashboard | Prototype | Authenticated users; children permission-filtered |
| 2 | Banking & Treasury | Prototype | Finance report permission |
| 3 | Sales | Coming Soon | Visible product scope; disabled |
| 4 | Revenue & Subscriptions | Coming Soon | Visible product scope; disabled |
| 5 | Customers / Receivables | Coming Soon | Visible product scope; disabled |
| 6 | Purchases / Procurement | Prototype | Procurement read permission |
| 7 | Suppliers / Payables | Prototype | Implemented Supplier Register permission; AP scope remains Coming Soon |
| 8 | Inventory & Warehousing | Prototype | Inventory read permission |
| 9 | Costing & Landed Cost | Coming Soon | Visible product scope; disabled |
| 10 | Finance & Accounting | Implemented | Finance read/drill-down permission |
| 11 | Taxation & Compliance | Prototype | Finance report permission |
| 12 | Operations | Coming Soon | Visible product scope; disabled |
| 13 | Production / Manufacturing | Coming Soon | Visible product scope; disabled |
| 14 | Quality Management | Coming Soon | Visible product scope; disabled |
| 15 | CRM | Coming Soon | Visible product scope; disabled |
| 16 | Projects & Professional Services | Coming Soon | Visible product scope; disabled |
| 17 | Resource Management | Coming Soon | Visible product scope; disabled |
| 18 | Helpdesk / Support | Coming Soon | Visible product scope; disabled |
| 19 | HR & Payroll | Coming Soon | Visible product scope; disabled |
| 20 | Fixed Assets & Leases | Coming Soon | Visible product scope; disabled |
| 21 | Expenses | Coming Soon | Visible product scope; disabled |
| 22 | Documents | Coming Soon | Visible product scope; disabled |
| 23 | Budget & Planning | Prototype | Finance report or budget-create permission |
| 24 | Reports & Analytics | Prototype | Catalogue visible; report branches permission-filtered |
| 25 | Portals | Coming Soon | Visible product scope; disabled |
| 26 | Administration | Prototype | Children permission-filtered |
| 27 | Configuration | Prototype | Children permission-filtered |
| 28 | Workflow & Approvals | Prototype | Setup/workflow permission |
| 29 | Notifications | Prototype | Authenticated users |
| 30 | Integrations | Coming Soon | Visible product scope; disabled |
| 31 | AI Assistant | Coming Soon | Visible product scope; disabled |
| 32 | Audit & Compliance | Prototype | Finance audit-read permission |
| 33 | Data Migration | Coming Soon | Visible product scope; disabled |
| 34 | Mobile | Coming Soon | Visible product scope; disabled |

## 3. Status and interaction contract

| Code | Label | Meaning | Interaction |
|---|---|---|---|
| `[I]` | Implemented | Evidence-backed real functionality exists | Clickable to an existing real route; backend authorization remains authoritative |
| `[P]` | Prototype | Controlled partial/demo surface exists | Clickable only to an existing prototype; persistent Prototype label required |
| `[CS]` | Coming Soon | Approved product vocabulary without working functionality | Visible, professionally labelled, and disabled |
| `[NA]` | Not Available | Excluded for the active user, company model or licensed edition | Hidden after availability is authoritatively resolved |

Status is not authorization. An implemented route remains hidden when its exact
permission is absent. `Not Available` must not be guessed in the frontend. It
may be used only after the existing backend/session architecture supplies the
relevant role, company-module and edition entitlement facts. Until then,
unimplemented commercial scope remains visible as Coming Soon.

## 4. Current route mapping

Only these current routes may be reused after approval. A requested leaf not
listed here remains disabled and receives no invented URL.

| Business area | Existing route(s) | Approved status | Current permission basis |
|---|---|---|---|
| Dashboard | `/dashboard` | Prototype | Authenticated session |
| Banking overview | `/finance/cash-bank` | Prototype | `finance.report.read` |
| Procurement overview/document flow | `/procurement`, fragments `#document-flow`, `#vendor-register` | Implemented/Prototype by leaf | `procurement.document.read`, `procurement.vendor.read` |
| Inventory overview/master/ledger | `/inventory`, fragments `#item-master`, `#stock-ledger` | Implemented/Prototype by leaf | `inventory.item.read`, `inventory.bin.read`, `inventory.stock.read` |
| Finance overview | `/finance` | Implemented | `finance.report.read` |
| Chart of Accounts | `/finance/accounts` | Implemented | `finance.account.read` |
| Chart of Accounts - Nominals | `/finance/accounts/nominals` | Implemented | `finance.account.read` |
| Chart of Accounts - Section Management | `/finance/accounts/sections` | Implemented | `finance.account.read` |
| Journal | `/finance/journals` | Implemented | read/create/post/reverse permissions by action |
| Recurring Journals | `/finance/recurring-journals` | Implemented | `finance.journal.read`; create action requires `finance.recurring_journal.create` |
| General Ledger | `/finance/general-ledger` | Implemented | `finance.report.drilldown` |
| Trial Balance | `/finance/trial-balance` | Implemented | `finance.report.read` |
| Profit & Loss | `/finance/profit-loss` | Implemented | `finance.report.read` |
| Balance Sheet | `/finance/balance-sheet` | Implemented | `finance.report.read` |
| Cash Flow | `/finance/cash-flow` | Implemented | `finance.report.read` |
| Budgets | `/finance/budgets` | Prototype | `finance.report.read` or `finance.budget.create` by action |
| Budget vs Actual | `/finance/budget-vs-actual` | Implemented | `finance.report.read` |
| Fiscal periods/close | `/finance/period-closing` | Implemented | `finance.period.close` or `finance.period.reopen` |
| Consolidation | `/finance/consolidation` | Prototype | `finance.report.consolidate` |
| Finance report centre | `/finance/reports` | Implemented | `finance.report.read` |
| Tax configuration | `/finance/tax` | Prototype | `finance.report.read` |
| Finance future-page routes | `/finance/accounts-receivable`, `/finance/accounts-payable`, `/finance/fixed-assets` | Coming Soon | Disabled in proposed menu until a prototype/implementation is approved |
| Report catalogue | `/reports` | Prototype | Authenticated session; descendants permission-filtered |
| Setup Drafts | `/platform/setup-drafts` | Implemented | `platform.setup_draft.read` |
| Organization | `/organization` | Prototype | `platform.resources.read` |
| Identity administration | `/admin/identity` | Prototype | `platform.resources.read` |
| Workflow administration | `/admin/workflows` | Prototype | setup/workflow permission |
| Settings/preferences | `/settings`, `/preferences` | Prototype | Authenticated session; protected children filtered |
| Notifications | `/notifications` | Prototype | Authenticated session |
| Audit explorer | `/audit-log` | Prototype | `finance.report.audit_read` |
| Informational future pages | `/crm`, `/projects`, `/hr`, `/assets`, `/ai`, `/admin/integrations` | Coming Soon | Route may remain in the application, but proposed menu item is disabled |

## 5. Permission mapping and role approach

The menu must consume the permission array returned by Nexora login. It must
not inspect `demo.admin`, `demo.accountant`, or any other username/role label.

| Menu branch | Existing permission family |
|---|---|
| Finance accounts | `finance.account.read/create` |
| Accounting Events | `finance.accounting_event.read/create/post` |
| Journals | `finance.journal.read/create/post/reverse` |
| Period close | `finance.period.close/reopen` |
| Budgets | `finance.budget.create`, `finance.report.read` |
| Consolidation | `finance.consolidation.configure`, `finance.report.consolidate` |
| Reports/drill-down/audit | `finance.report.read/drilldown/consolidate/audit_read`, `finance.report_definition.manage` |
| Procurement | `procurement.vendor.*`, `procurement.document.*`, and exact requisition/order/receipt/invoice-match actions |
| Inventory | `inventory.item.*`, `inventory.bin.*`, `inventory.stock.read` |
| Setup/organization | `platform.resources.*`, `platform.setup_draft.*` |
| Workflow decisions | `workflow.approval.approve/reject` |

Role examples are outcomes of permissions, not hardcoded menu rules:

- `demo.admin` receives all current permissions and sees every protected current
  branch plus the visible Coming Soon product map.
- `demo.accountant` sees Finance, Banking, Tax, Finance Reports and permitted
  administrative reads.
- `demo.finance.manager` additionally sees close, consolidation, Procurement
  approval reads, Inventory reads and workflow decisions.
- `demo.purchase` sees Procurement and Inventory reads plus only the Finance
  actions granted for its accounting handoff; it does not receive broad Finance
  reporting visibility.
- `demo.inventory` sees Inventory and the permitted Procurement read surface.
- `demo.sales`, `demo.project.manager`, and `demo.hr` currently have no module
  permissions because those modules have no APIs. Their future modules remain
  visible as disabled Coming Soon scope, not fake working menus.
- `demo.viewer` sees Finance read-only branches and no write actions.

CEO, Sales Manager, HR Manager and similar commercial personas require approved
backend permissions before they can produce different protected menus. The
navigation must not create those grants itself.

## 6. Approved ASCII navigation tree

Legend: `[I]` Implemented, `[P]` Prototype, `[CS]` Coming Soon. `[NA]` is not
assigned statically; it is a future authoritative availability result.

```text
NEXORA ERP
|
+-- Dashboard [P]
|   +-- Overview [P]
|   +-- Financial Position [P]
|   +-- Cash Position [P]
|   +-- Bank Balances [P]
|   +-- Receivables [CS]
|   +-- Payables [CS]
|   +-- Sales [CS]
|   +-- Purchases [P]
|   +-- Inventory [P]
|   +-- Production [CS]
|   +-- Projects [CS]
|   +-- Resource Utilisation [CS]
|   +-- Revenue Backlog [CS]
|   +-- HR [CS]
|   +-- Expenses [CS]
|   +-- Budget [P]
|   +-- Approvals [P]
|   +-- Pending Tasks [CS]
|   +-- Alerts [P]
|   `-- Executive KPIs [P]
|
+-- Banking & Treasury [P]
|   +-- Account Balances [P]
|   +-- Bank Payments [CS]
|   +-- Bank Receipts [CS]
|   +-- Bank Transfers [CS]
|   +-- Bank Reconciliation [CS]
|   +-- Import Bank Statement [CS]
|   +-- Statement Matching [CS]
|   +-- Bank Revaluation [CS]
|   +-- Cheques [CS]
|   |   +-- Issued Cheques [CS]
|   |   +-- Received Cheques [CS]
|   |   +-- Post-Dated Cheques [CS]
|   |   +-- Cheque Bounce [CS]
|   |   `-- Cheque Re-presentation [CS]
|   +-- Deposit Slips [CS]
|   +-- Payment Instruments [CS]
|   +-- Bank Charges [CS]
|   +-- Bank Interest [CS]
|   +-- Bank Guarantees [CS]
|   +-- Letters of Credit [CS]
|   +-- Bank Accounts [P]
|   +-- Bank Signatories [CS]
|   +-- Cash Management [P]
|   +-- Petty Cash [CS]
|   `-- Cash Flow Forecast [CS]
|
+-- Sales [CS]
|   +-- Invoices [CS]
|   |   +-- Invoice List [CS]
|   |   +-- Add New Invoice [CS]
|   |   +-- Credit Note [CS]
|   |   +-- Debit Note [CS]
|   |   +-- Batch Invoice [CS]
|   |   +-- Recurring Invoice [CS]
|   |   `-- Proforma Invoice [CS]
|   +-- Receipts [CS]
|   |   +-- Customer Receipts [CS]
|   |   +-- Advance Receipts [CS]
|   |   +-- Receipt Allocation [CS]
|   |   `-- Refunds [CS]
|   +-- Orders [CS]
|   |   +-- Quotations [CS]
|   |   +-- Sales Orders [CS]
|   |   +-- Deliveries [CS]
|   |   +-- Returns [CS]
|   |   `-- Cancellations [CS]
|   +-- Customers [CS]
|   |   +-- Customer List [CS]
|   |   +-- Add New Customer [CS]
|   |   +-- Customer Profile [CS]
|   |   +-- Contacts [CS]
|   |   +-- Addresses [CS]
|   |   +-- Credit Limits [CS]
|   |   +-- Payment Terms [CS]
|   |   +-- Pricing [CS]
|   |   `-- Customer Statements [CS]
|   +-- Pricing & Price Lists [CS]
|   +-- Discounts [CS]
|   +-- Sales Taxes [CS]
|   +-- Sales Teams [CS]
|   +-- Salespersons [CS]
|   +-- Commissions [CS]
|   +-- Sales Contracts [CS]
|   +-- Rate Cards [CS]
|   `-- Billing Schedules [CS]
|
+-- Revenue & Subscriptions [CS]
|   +-- Revenue Recognition [CS]
|   |   +-- Revenue Policies [CS]
|   |   +-- Performance Obligations [CS]
|   |   +-- Revenue Schedules [CS]
|   |   +-- Deferred Revenue [CS]
|   |   +-- Unbilled Revenue [CS]
|   |   +-- Recognition Runs [CS]
|   |   `-- Revenue Reconciliation [CS]
|   `-- Subscriptions [CS]
|       +-- Subscription Plans [CS]
|       +-- Active Subscriptions [CS]
|       +-- Renewals [CS]
|       +-- Upgrades / Downgrades [CS]
|       +-- Usage Billing [CS]
|       +-- Credits / Refunds [CS]
|       `-- Subscription Metrics [CS]
|
+-- Customers / Receivables [CS]
|   +-- Customer Master [CS]
|   +-- Customer Groups [CS]
|   +-- Credit Management [CS]
|   +-- AR Ageing [CS]
|   +-- Customer Statements [CS]
|   +-- Dunning [CS]
|   +-- Collections [CS]
|   +-- Promise to Pay [CS]
|   +-- Bad Debt [CS]
|   +-- Write-Offs [CS]
|   +-- Advances [CS]
|   +-- Unapplied Receipts [CS]
|   `-- Customer Risk [CS]
|
+-- Purchases / Procurement [P]
|   +-- Purchase Requisitions [P]
|   |   +-- All Requisitions [P]
|   |   +-- My Requisitions [CS]
|   |   +-- Draft [CS]
|   |   +-- Pending Approval [P]
|   |   +-- Approved [P]
|   |   +-- Rejected [CS]
|   |   `-- Returned [CS]
|   +-- RFQs [CS]
|   |   +-- RFQ List [CS]
|   |   +-- New RFQ [CS]
|   |   `-- Supplier Responses [CS]
|   +-- Supplier Quotations [CS]
|   +-- Supplier Evaluation [CS]
|   +-- Purchase Orders [P]
|   |   +-- Purchase Orders [P]
|   |   +-- Pending Approval [P]
|   |   +-- Approved [P]
|   |   +-- Amendments [CS]
|   |   `-- Cancelled [CS]
|   +-- Receiving [P]
|   |   +-- Goods Receipt [P]
|   |   +-- Partial Receipt [CS]
|   |   `-- Returns [CS]
|   +-- Gate Inward Pass [P]
|   +-- Quality Inspection [CS]
|   +-- Purchase Bills [P]
|   +-- 3-Way Match [P]
|   +-- Landed Cost [CS]
|   +-- Purchase Payments [CS]
|   +-- Purchase Reports [P]
|   `-- Procurement Reports [CS]
|
+-- Suppliers / Payables [P]
|   +-- Suppliers [I]
|   +-- Add Supplier [CS]
|   +-- Supplier Groups [CS]
|   +-- AP Ageing [CS]
|   +-- Supplier Statements [CS]
|   +-- Payment Scheduling [CS]
|   +-- Payment Runs [CS]
|   +-- Supplier Advances [CS]
|   +-- Debit Notes [CS]
|   +-- Supplier Claims [CS]
|   +-- Withholding Tax [CS]
|   `-- Supplier Reconciliation [CS]
|
+-- Inventory & Warehousing [P]
|   +-- Item Master [I]
|   +-- Product Master [CS]
|   +-- Service Master [CS]
|   +-- Categories [P]
|   +-- Subcategories [CS]
|   +-- Units of Measure [CS]
|   +-- Warehouses [P]
|   +-- Locations [P]
|   +-- Bins [P]
|   +-- Stock [P]
|   |   +-- Opening Stock [CS]
|   |   +-- Stock Receipt [I]
|   |   +-- Stock Issue [CS]
|   |   +-- Stock Transfer [CS]
|   |   +-- Stock Adjustment [CS]
|   |   +-- Stock Return [CS]
|   |   +-- Stock Reservation [CS]
|   |   `-- Stock Reconciliation [CS]
|   +-- Batch Management [P]
|   +-- Serial Numbers [P]
|   +-- Expiry Management [P]
|   +-- Stock Count [CS]
|   +-- Replenishment [CS]
|   +-- Barcode / QR [CS]
|   +-- Pick / Pack / Ship [CS]
|   +-- Inventory Valuation [P]
|   +-- Stock Ledger [I]
|   +-- Inventory Ageing [CS]
|   +-- Slow Moving [CS]
|   +-- Dead Stock [CS]
|   `-- Reorder Levels [CS]
|
+-- Costing & Landed Cost [CS]
|   +-- Item Cost [CS]
|   +-- FIFO [CS]
|   +-- Weighted Average [CS]
|   +-- Standard Cost [CS]
|   +-- Specific Identification [CS]
|   +-- Cost Revaluation [CS]
|   +-- Landed Cost [CS]
|   +-- Freight [CS]
|   +-- Insurance [CS]
|   +-- Duties [CS]
|   +-- Clearing Charges [CS]
|   +-- Cost Allocation [CS]
|   +-- Cost Variance [CS]
|   +-- Material Variance [CS]
|   +-- Labour Cost [CS]
|   +-- Overhead [CS]
|   `-- Inventory-to-GL Reconciliation [CS]
|
+-- Finance & Accounting [I]
|   +-- Chart of Accounts [I]
|   |   +-- Nominals [I]
|   |   `-- Section Management [I]
|   +-- Journal [I]
|   |   +-- Journal Register [I]
|   |   +-- New Journal [I]
|   |   +-- Draft Journals [P]
|   |   +-- Pending Approval [P]
|   |   +-- Posted Journals [I]
|   |   +-- Reversed Journals [I]
|   |   `-- Journal Detail [I]
|   +-- General Ledger [I]
|   +-- Trial Balance [I]
|   +-- Profit & Loss [I]
|   +-- Balance Sheet [I]
|   +-- Cash Flow [I]
|   +-- Account Statements [P]
|   +-- Budgets [P]
|   +-- Budget vs Actual [I]
|   +-- Fiscal Periods [I]
|   +-- Period Closing [I]
|   +-- Reversals [I]
|   +-- Recurring Journals [I]
|   +-- Intercompany [P]
|   +-- Consolidation [P]
|   +-- Dimensions [CS]
|   +-- Cost Centres [CS]
|   +-- Profit Centres [CS]
|   +-- Departments [CS]
|   +-- Projects [CS]
|   +-- Multi-Currency [P]
|   +-- Exchange Rates [P]
|   +-- Revaluation [CS]
|   +-- Accounting Events [P]
|   `-- Audit Trail [P]
|
+-- Taxation & Compliance [P]
|   +-- Tax Rules [P]
|   +-- Tax Rates [P]
|   +-- Sales Tax [CS]
|   +-- Purchase Tax [CS]
|   +-- Withholding Tax [P]
|   +-- Tax Exemptions [CS]
|   +-- Tax Certificates [CS]
|   +-- Tax Jurisdictions [CS]
|   +-- Tax Periods [CS]
|   +-- Tax Returns [CS]
|   +-- Tax Reconciliation [CS]
|   +-- Tax Reports [CS]
|   +-- Reverse Charge [CS]
|   +-- Input Tax Apportionment [CS]
|   `-- E-Invoicing [CS]
|
+-- Operations [CS]
|   +-- Operations Dashboard [CS]
|   +-- Work Orders [CS]
|   +-- Job Cards [CS]
|   +-- Tasks [CS]
|   +-- Resource Allocation [CS]
|   +-- Capacity Planning [CS]
|   +-- Scheduling [CS]
|   +-- Dispatch [CS]
|   +-- Service Delivery [CS]
|   +-- Field Operations [CS]
|   +-- Operational Costs [CS]
|   `-- Operational Reports [CS]
|
+-- Production / Manufacturing [CS]
|   +-- Manufacturing Dashboard [CS]
|   +-- Products [CS]
|   +-- BOM [CS]
|   +-- BOM Versions [CS]
|   +-- Routing [CS]
|   +-- Work Centres [CS]
|   +-- Machines [CS]
|   +-- Production Planning [CS]
|   +-- MRP [CS]
|   +-- Production Orders [CS]
|   +-- Material Issue [CS]
|   +-- WIP [CS]
|   +-- Quality [CS]
|   +-- Finished Goods [CS]
|   +-- Scrap [CS]
|   +-- By-Products [CS]
|   +-- Production Costing [CS]
|   +-- Production Variance [CS]
|   +-- Capacity Planning [CS]
|   +-- Maintenance [CS]
|   `-- Production Reports [CS]
|
+-- Quality Management [CS]
|   +-- Inspection Plans [CS]
|   +-- Incoming Inspection [CS]
|   +-- In-Process Inspection [CS]
|   +-- Final Inspection [CS]
|   +-- Rejections [CS]
|   +-- Non-Conformance [CS]
|   +-- Corrective Actions [CS]
|   +-- Preventive Actions [CS]
|   +-- Supplier Quality [CS]
|   +-- Customer Complaints [CS]
|   `-- Quality Reports [CS]
|
+-- CRM [CS]
|   +-- Leads [CS]
|   +-- Lead Sources [CS]
|   +-- Opportunities [CS]
|   +-- Pipeline [CS]
|   +-- Activities [CS]
|   +-- Calls [CS]
|   +-- Meetings [CS]
|   +-- Follow-Ups [CS]
|   +-- Contacts [CS]
|   +-- Organisations [CS]
|   +-- Customer History [CS]
|   +-- Sales Forecast [CS]
|   +-- Campaigns [CS]
|   `-- CRM Reports [CS]
|
+-- Projects & Professional Services [CS]
|   +-- Project Dashboard [CS]
|   +-- Projects [CS]
|   +-- Clients [CS]
|   +-- Contracts [CS]
|   +-- Scope [CS]
|   +-- Milestones [CS]
|   +-- Tasks [CS]
|   +-- Subtasks [CS]
|   +-- Project Team [CS]
|   +-- Resource Allocation [CS]
|   +-- Timesheets [CS]
|   +-- Project Expenses [CS]
|   +-- Project Budget [CS]
|   +-- Project Cost [CS]
|   +-- Project Revenue [CS]
|   +-- Project Profitability [CS]
|   +-- Retainers [CS]
|   +-- T&M Billing [CS]
|   +-- Milestone Billing [CS]
|   +-- Fixed Price Billing [CS]
|   +-- Project Invoices [CS]
|   +-- Change Requests [CS]
|   `-- Project Reports [CS]
|
+-- Resource Management [CS]
|   +-- Employees / Resources [CS]
|   +-- Skills [CS]
|   +-- Availability [CS]
|   +-- Allocation [CS]
|   +-- Soft Booking [CS]
|   +-- Bench [CS]
|   +-- Utilisation [CS]
|   +-- Capacity Forecast [CS]
|   +-- Overallocation [CS]
|   +-- Rate Cards [CS]
|   `-- Resource Reports [CS]
|
+-- Helpdesk / Support [CS]
|   +-- Tickets [CS]
|   +-- My Tickets [CS]
|   +-- Assigned Tickets [CS]
|   +-- SLA [CS]
|   +-- Escalations [CS]
|   +-- Support Contracts [CS]
|   +-- AMC [CS]
|   +-- Contract Consumption [CS]
|   +-- Knowledge Base [CS]
|   +-- Customer Complaints [CS]
|   `-- Support Reports [CS]
|
+-- HR & Payroll [CS]
|   +-- Employees [CS]
|   +-- Departments [CS]
|   +-- Designations [CS]
|   +-- Organization Structure [CS]
|   +-- Employment Contracts [CS]
|   +-- Attendance [CS]
|   +-- Shifts [CS]
|   +-- Leave [CS]
|   +-- Holidays [CS]
|   +-- Overtime [CS]
|   +-- Payroll [CS]
|   +-- Salary Structures [CS]
|   +-- Allowances [CS]
|   +-- Deductions [CS]
|   +-- Loans [CS]
|   +-- Advances [CS]
|   +-- Bonuses [CS]
|   +-- Payslips [CS]
|   +-- Recruitment [CS]
|   +-- Onboarding [CS]
|   +-- Performance [CS]
|   +-- Training [CS]
|   +-- Offboarding [CS]
|   +-- Final Settlement [CS]
|   `-- HR Reports [CS]
|
+-- Fixed Assets & Leases [CS]
|   +-- Asset Register [CS]
|   +-- Asset Categories [CS]
|   +-- Asset Acquisition [CS]
|   +-- CWIP [CS]
|   +-- Capitalisation [CS]
|   +-- Asset Transfer [CS]
|   +-- Asset Assignment [CS]
|   +-- Depreciation [CS]
|   +-- Revaluation [CS]
|   +-- Impairment [CS]
|   +-- Disposal [CS]
|   +-- Asset Verification [CS]
|   +-- QR / Barcode [CS]
|   +-- Leases [CS]
|   `-- Asset Reports [CS]
|
+-- Expenses [CS]
|   +-- Expense Claims [CS]
|   +-- Employee Expenses [CS]
|   +-- Travel Expenses [CS]
|   +-- Petty Cash [CS]
|   +-- Corporate Cards [CS]
|   +-- Advances [CS]
|   +-- Approvals [CS]
|   +-- Reimbursements [CS]
|   `-- Expense Reports [CS]
|
+-- Documents [CS]
|   +-- Document Repository [CS]
|   +-- Categories [CS]
|   +-- Attachments [CS]
|   +-- Document Versions [CS]
|   +-- Approvals [CS]
|   +-- Digital Signatures [CS]
|   +-- Templates [CS]
|   +-- Contracts [CS]
|   `-- Expiry Alerts [CS]
|
+-- Budget & Planning [P]
|   +-- Annual Budget [P]
|   +-- Department Budget [CS]
|   +-- Project Budget [CS]
|   +-- Cost Centre Budget [CS]
|   +-- Revenue Budget [P]
|   +-- Expense Budget [P]
|   +-- Capital Budget [CS]
|   +-- Budget Approval [CS]
|   +-- Budget Revision [CS]
|   +-- Budget vs Actual [I]
|   +-- Forecast [CS]
|   `-- Variance Analysis [I]
|
+-- Reports & Analytics [P]
|   +-- Finance Reports [I]
|   |   +-- Trial Balance [I]
|   |   +-- General Ledger [I]
|   |   +-- P&L [I]
|   |   +-- Balance Sheet [I]
|   |   +-- Cash Flow [I]
|   |   +-- Journal Report [I]
|   |   +-- Budget vs Actual [I]
|   |   `-- Tax Reports [CS]
|   +-- Sales Reports [CS]
|   +-- Purchase Reports [P]
|   +-- Inventory Reports [CS]
|   +-- Production Reports [CS]
|   +-- Project Reports [CS]
|   +-- HR Reports [CS]
|   +-- Support Reports [CS]
|   `-- Executive Reports [P]
|
+-- Portals [CS]
|   +-- Customer Portal [CS]
|   +-- Supplier Portal [CS]
|   +-- Employee Portal [CS]
|   +-- Support / Project Portal [CS]
|   `-- Portal Access & Security [CS]
|
+-- Administration [P]
|   +-- Company [P]
|   +-- Setup Drafts [I]
|   +-- Branches [P]
|   +-- Departments [P]
|   +-- Users [P]
|   +-- Roles [P]
|   +-- Permissions [P]
|   +-- Approval Matrix [P]
|   +-- Fiscal Years [P]
|   +-- Fiscal Periods [P]
|   +-- Currencies [P]
|   +-- Exchange Rates [P]
|   +-- Tax Configuration [P]
|   +-- Numbering Series [CS]
|   +-- Notifications [P]
|   +-- Email Configuration [CS]
|   +-- Document Configuration [CS]
|   +-- Audit Logs [P]
|   +-- Security [P]
|   +-- Sessions [CS]
|   +-- API Keys [CS]
|   `-- Integrations [CS]
|
+-- Configuration [P]
|   +-- Custom Fields [CS]
|   +-- Report Builder [CS]
|   +-- Workflow Designer [P]
|   +-- Document Templates [CS]
|   +-- Business Rules [CS]
|   +-- Numbering [CS]
|   +-- Company Settings [P]
|   `-- System Parameters [P]
|
+-- Workflow & Approvals [P]
|   +-- Approval Inbox [P]
|   +-- My Requests [CS]
|   +-- Approval Matrix [P]
|   +-- Delegation [CS]
|   +-- Escalations [CS]
|   +-- Segregation of Duties [P]
|   +-- Maker Checker [P]
|   +-- Workflow Designer [P]
|   `-- Approval Audit [P]
|
+-- Notifications [P]
|   +-- Notification Centre [P]
|   +-- Approval Notifications [CS]
|   +-- Payment Due [CS]
|   +-- Invoice Due [CS]
|   +-- Stock Alerts [CS]
|   +-- Contract Expiry [CS]
|   +-- HR Notifications [CS]
|   +-- Workflow Alerts [CS]
|   +-- Notification Preferences [P]
|   `-- Delivery Logs [CS]
|
+-- Integrations [CS]
|   +-- Banks [CS]
|   +-- Payment Gateways [CS]
|   +-- Email [CS]
|   +-- SMS [CS]
|   +-- Tax Authorities [CS]
|   +-- Payroll [CS]
|   +-- Cloud Storage [CS]
|   +-- E-Commerce [CS]
|   +-- POS [CS]
|   +-- BI / Power BI [CS]
|   +-- API [CS]
|   +-- Webhooks [CS]
|   `-- Integration Logs [CS]
|
+-- AI Assistant [CS]
|   +-- Ask Nexora [CS]
|   +-- Finance Assistant [CS]
|   +-- Sales Assistant [CS]
|   +-- Procurement Assistant [CS]
|   +-- Inventory Assistant [CS]
|   +-- HR Assistant [CS]
|   +-- Project Assistant [CS]
|   +-- Report Assistant [CS]
|   `-- AI Activity / Audit [CS]
|
+-- Audit & Compliance [P]
|   +-- Audit Dashboard [P]
|   +-- Transaction Audit [P]
|   +-- Master Data Audit [P]
|   +-- Login Audit [P]
|   +-- Permission Audit [P]
|   +-- Approval Audit [P]
|   +-- Period Close Evidence [P]
|   +-- Compliance [CS]
|   +-- Fraud Signals [CS]
|   `-- Audit Reports [P]
|
+-- Data Migration [CS]
|   +-- Migration Projects [CS]
|   +-- Object & Template Catalogue [CS]
|   +-- Upload, Profile & Field Mapping [CS]
|   +-- Validation & Dry Run [CS]
|   +-- Error Correction [CS]
|   +-- Load Monitor & Reconciliation [CS]
|   +-- Sign-off & Cutover [CS]
|   +-- Parallel Run & Rollback [CS]
|   `-- Hypercare Dashboard [CS]
|
`-- Mobile [CS]
    +-- Mobile Home [CS]
    +-- Mobile Approvals [CS]
    +-- Barcode & QR Scanning [CS]
    +-- Receive, Move & Count Stock [CS]
    +-- Expense Capture [CS]
    +-- Timesheets [CS]
    +-- Leave & Attendance [CS]
    +-- Field-service Tasks [CS]
    +-- Customer & Supplier Lookup [CS]
    `-- Offline Queue & Security [CS]
```

## 7. Required visible business workflow

The Procurement menu order must communicate the business flow even while only
part of the core is implemented:

```text
Purchase Requisition
  -> Approval
  -> RFQ
  -> Supplier Quotations
  -> Evaluation
  -> Purchase Order
  -> Receive Product
  -> Gate Inward Pass
  -> Quality Inspection
  -> Purchase Bill
  -> 3-Way Match
  -> Payment
  -> Reconciliation
```

The visible sequence does not claim each step is functional. The status beside
each corresponding menu item remains authoritative.

## 8. Responsive navigation contract

Desktop:

- Expanded width must accommodate long business labels without obscuring the
  maturity tag.
- A main module expands its sub-menu in place.
- A grouped sub-menu expands Action/Page children only when required.
- The active route and its ancestors remain open.
- Keyboard focus, `aria-expanded`, `aria-controls` and active-state semantics
  remain required.

Collapsed desktop:

- Main-module icons remain available with business-name and status tooltips.
- Submenus are not rendered into the narrow icon rail.
- Expanding the rail restores the last user-controlled open state and the
  active-route ancestry.

Mobile:

- Reuse the current off-canvas sidebar/sheet.
- Preserve the same hierarchy, status, route and permission decisions as
  desktop; do not create a separate mobile product map.
- Selecting a real route should close the navigation sheet.
- Coming Soon items remain disabled, not converted into mobile links.

The maximum business depth is three levels:

```text
Main Menu -> Sub-menu -> Action/Page
```

## 9. Approved route behavior by status

1. `[I]` must include an existing `href` and exact backend permission mapping.
2. `[P]` must include an existing controlled prototype route. Parent grouping
   nodes may expand without owning a route.
3. `[CS]` must have no navigable `href` in the rendered menu, even if an
   informational page currently exists elsewhere in the application.
4. `[NA]` must be removed before render and must not leave an empty parent.
5. A parent remains visible when at least one authorized/available descendant
   remains, or when it represents visible Coming Soon product scope.
6. Duplicate business entry points may reuse one current route only where the
   page genuinely supports that view. A label must not imply a filter/action
   the destination does not provide.
7. Breadcrumbs use the canonical route label, not whichever duplicate menu
   entry happened to be traversed.

## 10. Approved implementation changes

The owner approved this navigation-only plan on 2026-08-19. The executable
result is `web/src/components/shell/nav-config.ts` and
`web/src/components/shell/app-sidebar.tsx`.

1. Expand `NavStatus` to include `not_available` and document its hidden-only
   behavior.
2. Separate maturity from availability in the navigation model. Recommended
   fields are `status`, `requiredPermissions`, `requiredModules`,
   `companyModels`, and `editions`; only use fields backed by authoritative
   session data.
3. Replace the condensed child arrays in `nav-config.ts` with the approved tree
   above while keeping the 34 top-level IDs/order stable.
4. Remove rendered links from every approved Coming Soon item, including
   existing informational pages, unless the owner explicitly classifies that
   page as a Prototype.
5. Add the missing Finance business labels without changing its backend:
   detailed Chart of Accounts and Journal branches, account statements,
   dimensions, centres, multi-currency, Accounting Events and Audit Trail.
6. Map every implemented/prototype Finance label to the existing route only
   after verifying the destination truly supports the implied view/action.
7. Expand Banking, Sales, Procurement and Inventory to the approved
   sub-sub-menu vocabulary while retaining the three-level maximum.
8. Keep current recursive permission filtering and backend permission strings;
   do not add checks such as `role === "accountant"`.
9. Add company/edition hiding only after the backend exposes those entitlements
   through the existing authenticated context. Until then, do not emit
   `Not Available` based on guesses.
10. Update sidebar status styling and tooltips for four statuses; keep
    Coming Soon visible/disabled and Not Available absent.
11. On mobile route selection, close the off-canvas sheet while preserving the
    same product hierarchy.
12. Update breadcrumbs and duplicate-route label precedence for the expanded
    structure.
13. Extend configuration tests to enforce:
    - exact 34-module order;
    - unique IDs;
    - maximum depth of three;
    - status on every node;
    - an existing route for every Implemented/Prototype leaf;
    - no rendered route for Coming Soon;
    - Not Available removal;
    - no empty protected parent;
    - no `Shell` terminology;
    - exact permission filtering.
14. Extend sidebar interaction and accessibility tests for nested groups,
    disabled Coming Soon entries, collapsed mode, mobile mode and status labels.
15. Re-run full frontend tests, accessibility, lint, TypeScript, production
    build, API drift, the 469-test backend baseline and Demo Company verifier.

## 11. Explicit non-changes

Approval of this navigation proposal would not authorize:

- new Sales, AR, AP, HR, CRM, Manufacturing or other business transactions;
- a new frontend or separate Demo frontend;
- Finance posting-engine, journal, ledger, report or database changes;
- fake dashboards, hardcoded KPIs or invented demo functionality;
- new frontend-only permissions or hardcoded role-name visibility;
- creation of missing pages merely so a menu item can be clicked.

The Finance journal remains a real double-entry surface. Nothing in this menu
proposal changes the invariant `TOTAL DEBIT = TOTAL CREDIT` or permits a
single-account journal design.

## 12. Approval checklist

The owner approved these decisions on 2026-08-19:

- [x] Exact 34 top-level module order
- [x] Complete labels and spelling (`Ageing` vs `Aging`, `Organisation` vs
      `Organization`, `P&L` vs `Profit & Loss`)
- [x] Detailed Finance hierarchy and status assignments
- [x] Procurement workflow ordering
- [x] Existing informational pages are disabled Coming Soon rather than
      clickable Prototype pages
- [x] Visibility of Coming Soon modules for all authenticated users
- [x] `Not Available` is supported as hidden-only; no item is assigned this
      status until authoritative company/edition entitlements exist
- [x] Maximum three-level hierarchy
- [x] Role outcomes derived only from backend permissions
- [x] Route reuse rules and duplicate-route breadcrumb precedence
- [x] Responsive/collapsed/mobile behavior

## Implementation record

The expanded hierarchy is implemented. Coming Soon items are visible and
disabled; Implemented/Prototype leaves reuse existing routes; Not Available is
filtered before rendering; mobile route selection closes the off-canvas menu.
Setup Drafts and the implemented Supplier Register were retained to satisfy the
explicit non-removal requirement, producing 587 nodes rather than deleting
working access to match a paper-only count.

No transaction, Finance backend, database, API, generated contract, existing
test file or Demo seed was changed.
