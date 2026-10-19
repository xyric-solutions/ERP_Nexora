# Nexora ERP — Wireframe Coverage Matrix

- Status: `DEFERRED COVERAGE REFERENCE — NOT THE ACTIVE REVIEW BATCH`
- Purpose: prove that the ASCII exercise covers the complete ERP rather than a
  finance-only demo or a collection of disconnected menus

## 1. Area by company model

Values are proposed navigation defaults, not final licensing decisions.

| # | Area | Service | Trading | Manufacturing | Primary review role |
|---:|---|---|---|---|---|
| 01 | Dashboard / Overview | CORE | CORE | CORE | Executive / Department manager |
| 02 | Banking & Treasury | CORE | CORE | CORE | Treasury / Finance |
| 03 | Sales & Billing | CORE | CORE | CORE | Sales / Billing |
| 04 | Revenue Recognition | CORE | OPTIONAL | OPTIONAL | Revenue accountant |
| 05 | Subscription & Recurring Billing | OPTIONAL | OPTIONAL | OPTIONAL | Commercial / Billing |
| 06 | Customers / Accounts Receivable | CORE | CORE | CORE | AR / Credit control |
| 07 | Purchases & Procurement | OPTIONAL | CORE | CORE | Procurement |
| 08 | Suppliers / Accounts Payable | CORE | CORE | CORE | AP / Treasury |
| 09 | Inventory & Warehousing | OPTIONAL | CORE | CORE | Warehouse / Inventory control |
| 10 | Costing & Landed Cost | OPTIONAL | CORE | CORE | Cost accountant |
| 11 | Finance & Accounting | CORE | CORE | CORE | Accountant / CFO |
| 12 | Taxation & Compliance | CORE | CORE | CORE | Tax / Compliance |
| 13 | Operations | CORE | CORE | CORE | Operations manager |
| 14 | Production / Manufacturing | NOT REQUIRED | NOT REQUIRED | CORE | Production manager |
| 15 | Quality Management | OPTIONAL | OPTIONAL | CORE | Quality manager |
| 16 | CRM | CORE | CORE | OPTIONAL | Sales / Account manager |
| 17 | Projects & Professional Services | CORE | OPTIONAL | OPTIONAL | Project manager |
| 18 | Resource Management & Utilisation | CORE | OPTIONAL | OPTIONAL | Delivery / Resource manager |
| 19 | Helpdesk / Support / AMC | CORE | OPTIONAL | OPTIONAL | Support manager |
| 20 | HR & Payroll | CORE | CORE | CORE | HR / Payroll |
| 21 | Fixed Assets & Leases | OPTIONAL | OPTIONAL | CORE | Asset accountant |
| 22 | Expense Management | CORE | CORE | CORE | Employee / Finance |
| 23 | Document Management | CORE | CORE | CORE | Records / All roles |
| 24 | Budget & Planning | CORE | CORE | CORE | Budget owner / Finance |
| 25 | Reports & Analytics | CORE | CORE | CORE | Executive / Analyst |
| 26 | Portals | OPTIONAL | OPTIONAL | OPTIONAL | Customer / Supplier / Employee |
| 27 | Administration & Multi-Tenancy | CORE | CORE | CORE | System administrator |
| 28 | System Configuration & Extensibility | CORE | CORE | CORE | Functional administrator |
| 29 | Workflow / Approvals / SoD | CORE | CORE | CORE | Approver / Internal control |
| 30 | Notifications | CORE | CORE | CORE | All roles |
| 31 | Integrations | OPTIONAL | OPTIONAL | OPTIONAL | Integration administrator |
| 32 | AI Assistant | OPTIONAL | OPTIONAL | OPTIONAL | All roles / AI reviewer |
| 33 | Audit & Compliance | CORE | CORE | CORE | Auditor / Compliance |
| 34 | Data Migration & Cutover | CORE | CORE | CORE | Implementation lead |
| 35 | Mobile | OPTIONAL | OPTIONAL | OPTIONAL | Approver / Field worker |

The product owner must approve or amend these CORE/OPTIONAL/NOT REQUIRED
values before they drive edition packaging or live navigation.

## 2. Required end-to-end journeys

| Journey | Start | Controlled middle | Financial finish | Evidence finish | Batch |
|---|---|---|---|---|---|
| Purchase-to-pay | Purchase requisition | Approval → RFQ → PO → receipt → inspection → match | AP → payment → bank reconciliation → GL | Report drill-down + audit | `WF-80` |
| Order-to-cash | Customer/quotation | Credit → order → pick/pack/deliver → invoice | AR → receipt → bank reconciliation → GL | Margin/AR report + audit | `WF-81` |
| Service project-to-cash | Lead/opportunity | Proposal → contract → project → allocation → time/expense → milestone | Recognition → invoice → receipt | Profitability + audit | `WF-82` |
| Plan-to-produce | Demand/sales order | Plan → MRP → purchase → issue → WIP → quality → completion | Inventory/costing events → GL | Production variance + audit | `WF-83` |
| Record-to-report | Source transaction | Accounting Event → journal approval/posting → reconciliations → close | GL → TB → P&L/BS/CF | Drill-down + close evidence | `WF-84` |
| Hire-to-retire/pay | Employee/onboarding | Attendance/leave → payroll inputs → approval | Payroll payment/accounting | Payslip/statutory/audit | `WF-85` |
| Asset/lease lifecycle | Acquisition/CWIP/lease | Capitalise → depreciate/revalue/transfer → pay/dispose | Asset/lease Accounting Events → GL | Register/reconciliation/audit | `WF-86` |
| Subscription lifecycle | Quote/contract | Usage → schedule → billing → dunning/amend/renew | AR/payment + revenue recognition | MRR/ARR/roll-forward/audit | `WF-87` |
| Governed decision trace | Budget/tax/document/AI/access request | Human approval, SoD, exception and retry | Accounting only where relevant | Immutable evidence | `WF-88` |

## 3. Role views that must be exercised

| Role | Minimum review surfaces |
|---|---|
| CEO | Executive dashboard, alerts, KPI drill-down, reports |
| CFO | Cash, working capital, close, budget, tax, consolidated reporting |
| Finance Manager | Journals, approvals, reconciliations, periods, reports, audit |
| Accountant | Chart of Accounts, journals, GL, recurring journals, drill-down |
| Treasury / AR / AP | Payments, receipts, allocations, ageing, reconciliation |
| Sales Manager | CRM, quotation/order/invoice, credit exceptions, forecast |
| Procurement Manager | Requisitions, sourcing, PO, match exceptions, supplier review |
| Inventory Manager | Stock, movements, counts, traceability, valuation |
| Production / Quality Manager | MRP, production, WIP, capacity, inspection, CAPA |
| Project / Resource Manager | Projects, milestones, allocations, utilisation, profitability |
| HR / Payroll Manager | Employee, time/leave, payroll, statutory, final settlement |
| Employee | My work, leave, time, expense, documents, notifications |
| System / Integration Admin | Tenant/company, users/roles, configuration, connections, migration |
| Auditor | Read-only transaction, approval, access, close, and evidence trails |
| External portal user | Company-scoped customer/supplier portal with no internal navigation leakage |

## 4. State coverage required in every applicable batch

| State/control | List | Detail | Transaction | Approval | Report | Mobile |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| Loading skeleton | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Actionable empty state | ✓ | ✓ | — | ✓ | ✓ | ✓ |
| Validation error with preserved draft | — | — | ✓ | ✓ | ✓ | ✓ |
| Safe server error + correlation ID | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Permission denied / redaction | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Stale/freshness indicator | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Maker-checker / SoD | — | ✓ | ✓ | ✓ | — | ✓ |
| Approval and audit history | — | ✓ | ✓ | ✓ | — | ✓ |
| Accounting preview/trace | — | ✓ | ✓ | ✓ | ✓ | — |
| Reversal/amendment instead of delete | — | ✓ | ✓ | — | — | ✓ |
| Responsive transformation | ✓ | ✓ | ✓ | ✓ | ✓ | native |
| Demo / Coming Soon honesty | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

## 5. Approval checklist for each batch

- [ ] The screen job and primary user are unambiguous.
- [ ] Navigation follows business operations, not source-code structure.
- [ ] Desktop and mobile information hierarchy is understandable.
- [ ] One primary action is visible; other actions have honest behavior.
- [ ] Transaction lifecycle includes reject/return/amend/cancel/reverse where applicable.
- [ ] Maker-checker, approval thresholds, and SoD are visible where applicable.
- [ ] Financial impact identifies Accounting Event and drill-down expectations.
- [ ] Loading, empty, error, stale, denial, and offline states are accounted for.
- [ ] Demo and planned functionality cannot be confused with production/live behavior.
- [ ] Keyboard, labels, focus, contrast, table semantics, and 44×44 touch targets are covered.
- [ ] Open business rules reference the decision register instead of being invented.
- [ ] Owner decision is recorded as approved, approved with changes, rejected, or pending.
