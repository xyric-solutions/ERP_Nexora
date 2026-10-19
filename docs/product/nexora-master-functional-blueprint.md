# Nexora ERP — Master Functional Blueprint

- Version: 0.1
- Owner: Xyric Solutions LLP
- Status: DRAFT FOR OWNER REVIEW
- Session: 1 — Part A
- Scope in this revision: Modules 01–11
- Last updated: 2026-08-18

## Document control

This blueprint defines commercial ERP behavior. It does not authorize implementation. Part A covers Dashboard through Finance; Parts B and C will add modules 12–35 in later sessions. Accounting entries outside the implemented Finance engine are proposed patterns until the accounting integration matrix is approved.

Implementation status is evidence-based:

- `IMPLEMENTED`: code plus test evidence exists.
- `PARTIAL`: useful implementation exists but the business capability is incomplete.
- `PLANNED`: defined future capability.
- `NOT STARTED`: neither implemented nor delivery-planned in sufficient detail.

## Product architecture spine

Every material capability follows this traceable chain:

Master Data → Transaction → Workflow → Approval → Operation → Accounting Event → Posting Engine → Journal → General Ledger → Reporting → Analytics → Audit

Cross-cutting requirements apply to every module:

1. Tenant and legal-company isolation at persistence, service, API, reporting, and user-interface boundaries.
2. Backend-derived permissions with least privilege, maker-checker rules, and segregation of duties.
3. Immutable posted financial history; correction by linked reversal or controlled amendment.
4. Stable identifiers, document numbering, statuses, timestamps, actor identity, source references, and audit history.
5. Configuration by company, jurisdiction, currency, fiscal calendar, approval policy, and enabled module.
6. Operational documents submit Accounting Events; they never write directly to ledger tables.
7. Reports derive from source transactions and posted accounting data, not hardcoded dashboard values.
8. Unimplemented capabilities remain visibly `PLANNED` or `NOT STARTED`.

## Part A module register

| No. | Module | Code | Status |
|---:|---|---|---|
| 01 | Dashboard / Overview | DSH | PARTIAL |
| 02 | Banking & Treasury | BNK | PARTIAL |
| 03 | Sales & Billing | SAL | PLANNED |
| 04 | Revenue Recognition | REV | PLANNED |
| 05 | Subscription & Recurring Billing | SUB | PLANNED |
| 06 | Customers / Accounts Receivable | AR | PLANNED |
| 07 | Purchases & Procurement | PUR | PARTIAL |
| 08 | Suppliers / Accounts Payable | AP | PLANNED |
| 09 | Inventory & Warehousing | INV | PARTIAL |
| 10 | Costing & Landed Cost | CST | PLANNED |
| 11 | Finance & Accounting | FIN | PARTIAL |

---

# MODULE 01 — Dashboard / Overview

## 1. Purpose & Scope

Provide role-specific operational and executive awareness without becoming a second transaction system. Dashboards expose live KPIs, exceptions, approvals, alerts, and drill-through links to source records.

## 2. Navigation Hierarchy

Dashboard → My Workspace; Executive Overview; Finance Overview; Sales Overview; Procurement Overview; Inventory Overview; Projects Overview; People Overview; Approvals & Tasks; Alerts & Exceptions.

## 3. Main Functions

| ID | Function |
|---|---|
| NEX-DSH-OVW-001 | Company and consolidated executive overview |
| NEX-DSH-KPI-001 | Role- and permission-aware KPI cards and trends |
| NEX-DSH-TSK-001 | Assigned approvals, tasks, overdue items, and exceptions |
| NEX-DSH-DRL-001 | Drill-through from KPI to report, transaction, journal, and audit evidence |
| NEX-DSH-PER-001 | User-saved layout, filters, date range, currency, and company context |

## 4. Master Data

KPI definition, dashboard profile, role, user preference, company, fiscal period, reporting currency, alert threshold, and saved filter.

## 5. Transactions

Dashboards create no business or accounting transactions. Permitted interactions are filter, refresh, export, acknowledge alert, open task, and drill-through.

## 6. Transaction Lifecycles

KPI snapshot: Requested → Calculated → Cached → Refreshed or Expired. Alert: Open → Acknowledged → Resolved or Dismissed, with actor and timestamp.

## 7. Approval Workflow

The dashboard displays approval work supplied by owning modules. Approve/reject actions must invoke the source module workflow and its permission/SoD controls.

## 8. Operational Workflow

Authenticate → select company/context → load authorized widgets → inspect exception → drill to source → perform authorized source action → refresh KPI/audit view.

## 9. Accounting Impact

None directly. Financial metrics read posted ledger/reporting data and retain source lineage.

## 10. Reports

Executive pack, KPI trend, exception register, overdue approvals, cash position, profitability, working-capital summary, and module-status summary.

## 11. Dashboard / KPIs

Revenue, gross margin, net profit, cash, AR/AP aging, inventory value/turnover, order intake, backlog, utilization, overdue tasks, forecast variance, and data freshness. Only KPIs backed by implemented modules may be live.

## 12. Settings & Configuration

Widget catalogue, role layouts, default date/company, refresh threshold, currency presentation, alert thresholds, and export policy.

## 13. Permissions

`dashboard.read`, `dashboard.configure_own`, `dashboard.configure_role`, `dashboard.export`, plus the source permission for every drill-down or action.

## 14. Segregation of Duties

Visibility never grants action rights. A user cannot approve an item merely because it appears on their dashboard, and self-approval rules remain enforced by the source workflow.

## 15. Integrations

Reporting read models, Workflow, Notifications, Audit, Finance, Sales, Procurement, Inventory, Projects, HR, and BI exports.

## 16. Service Company Applicability

Prioritize utilization, project margin, unbilled WIP, recurring revenue, receivables, SLA and support workload.

## 17. Trading Company Applicability

Prioritize sales orders, stock availability, fill rate, purchasing commitments, inventory aging, margin, receivables, and cash.

## 18. Manufacturing Company Applicability

Prioritize production plan adherence, material shortage, WIP, yield, downtime, quality, production variance, and delivery readiness.

## 19. Implementation Status

`PARTIAL`. Finance KPI and setup widgets are API-backed. Other widgets are placeholders or future-module summaries. Evidence: `web/src/app/(shell)/dashboard/page.tsx`, `app/finance/reporting.py`, and Finance reporting tests.

## 20. Open Questions

NEX-OQ-018 defines mandatory executive KPIs and role packs. NEX-OQ-019 covers freshness and refresh expectations.

## 21. Acceptance Criteria

1. Every live KPI reconciles to a report or source transaction.
2. Permissions are preserved through drill-down.
3. Data freshness and company/currency context are visible.
4. Placeholder and planned widgets are clearly labelled.
5. Dashboard actions create source-module audit evidence.

---

# MODULE 02 — Banking & Treasury

## 1. Purpose & Scope

Control bank and cash accounts, receipts, payments, transfers, statement processing, reconciliation, liquidity, foreign-currency exposure, and treasury instruments.

## 2. Navigation Hierarchy

Banking & Treasury → Account Balances; Bank Payments; Bank Receipts; Transfers; Bank Reconciliation; Import Bank Statement; Statement Matching; Revaluation; Cheques; Post-Dated Cheques; Deposit Slips; Bank Charges; Bank Interest; Cash Management; Facilities & Guarantees; Letters of Credit; Treasury Reports.

## 3. Main Functions

| ID | Function |
|---|---|
| NEX-BNK-ACC-001 | Maintain bank/cash accounts and authorized signatories |
| NEX-BNK-PAY-001 | Create, approve, execute, post, and reconcile bank payments |
| NEX-BNK-RCT-001 | Record, allocate, post, deposit, and reconcile receipts |
| NEX-BNK-TRF-001 | Transfer funds between company accounts with FX support |
| NEX-BNK-STM-001 | Import statements and normalize bank lines |
| NEX-BNK-REC-001 | Manual/automatic matching and reconciliation |
| NEX-BNK-RVL-001 | Period-end foreign-currency bank revaluation |
| NEX-BNK-CSH-001 | Cash account, petty cash, and cash-count control |
| NEX-BNK-TRS-001 | Facilities, guarantees, LC, borrowing, investment, and maturity register |

## 4. Master Data

Bank, branch, account, IBAN/account number, currency, GL mapping, payment method, cheque book, signatory matrix, statement format, matching rule, cash account, facility, counterparty, interest/charge rule, and holiday calendar.

## 5. Transactions

Payment request, bank payment, bank receipt, transfer, cheque, deposit slip, cash receipt/payment, statement import, match, reconciliation, bank charge/interest, revaluation, guarantee, LC, borrowing, placement, and maturity.

## 6. Transaction Lifecycles

Payment: Draft → Submitted → Approved → Authorized → Released → Posted → Reconciled; exceptions Returned, Rejected, Cancelled before release, Failed, or Reversed. Statement: Imported → Validated → Matched/Partially Matched → Reconciled → Closed.

## 7. Approval Workflow

Company/currency/amount-based maker-checker with treasury and signatory levels. Release credentials must be separate from preparation and accounting approval. Rejected/returned items retain comments and revision history.

## 8. Operational Workflow

Approved obligation or receipt instruction → payment/receipt proposal → authorization → bank execution/import → Accounting Event → posting → statement match → reconciliation → cash and audit reporting.

## 9. Accounting Impact

Proposed rules: payment Dr payable/expense/clearing, Cr bank; receipt Dr bank, Cr receivable/income/clearing; transfer Dr destination bank, Cr source bank plus realized FX/charges; revaluation adjusts bank and unrealized FX. Exact clearing and FX policy requires approval.

## 10. Reports

Bank book, cash book, unreconciled items, reconciliation statement, daily cash position, liquidity forecast, payment register, receipt register, cheque register, bank charges, interest, FX exposure, facilities, guarantees, and LC exposure.

## 11. Dashboard / KPIs

Available cash, restricted cash, unreconciled amount/count, overdue reconciliation, forecast deficit, upcoming maturities, failed payments, and FX exposure.

## 12. Settings & Configuration

Number series, approval matrix, payment formats, statement parsers, match tolerances, clearing accounts, FX source, cut-off dates, cash limits, signatories, and positive-pay/export controls.

## 13. Permissions

Separate account maintenance, payment create/submit/approve/release/post/reverse, receipt operations, statement import, matching, reconciliation close/reopen, treasury instruments, reporting, and export.

## 14. Segregation of Duties

Account master maintenance, beneficiary creation, payment preparation, approval, bank release, posting, and reconciliation must be independently assignable. Maker cannot approve or release their own payment above the configured threshold.

## 15. Integrations

AP, AR, Expenses, Payroll, Sales, Procurement, Finance, bank APIs/files, FX providers, Notifications, Workflow, Document Management, and Audit.

## 16. Service Company Applicability

Core for payroll, supplier/expense payments, customer collections, subscriptions, project receipts, cash forecasting, and multicurrency services.

## 17. Trading Company Applicability

Adds supplier batches, import payments, LC, customs, freight, customer deposits, and high-volume statement matching.

## 18. Manufacturing Company Applicability

Adds capex, raw-material payments, production cash forecasts, facilities, guarantees, and supplier-finance visibility.

## 19. Implementation Status

`PARTIAL`. `BankAccount` master and ledger-based cash reporting exist. Payment, receipt, statement, matching, reconciliation, treasury and bank-management APIs/UI do not.

## 20. Open Questions

NEX-OQ-007 bank connectivity/release model; NEX-OQ-020 matching tolerances; NEX-OQ-021 cheque/PDC scope; NEX-OQ-022 treasury scope.

## 21. Acceptance Criteria

1. Payment and receipt lifecycles are permissioned and auditable.
2. Posted items generate balanced Accounting Events exactly once.
3. Statement imports are idempotent and traceable to source files.
4. Reconciliation difference is zero or explicitly approved.
5. Cash reports reconcile to GL by company, account, currency, and date.

---

# MODULE 03 — Sales & Billing

## 1. Purpose & Scope

Manage commercial selling from quotation through order, fulfilment, billing, returns, tax, commission, and handoff to AR, Inventory, Projects, Revenue Recognition, and Finance.

## 2. Navigation Hierarchy

Sales & Billing → Quotations; Sales Orders; Deliveries; Invoices → New, Proforma, Batch, Recurring, Credit Note, Debit Note; Returns; Customers; Pricing & Discounts; Sales Tax; Commissions; Sales Reports.

## 3. Main Functions

| ID | Function |
|---|---|
| NEX-SAL-QUO-001 | Prepare, revise, approve, send, win, or lose quotations |
| NEX-SAL-ORD-001 | Confirm sales orders and control credit/availability |
| NEX-SAL-DEL-001 | Request and confirm goods/service delivery |
| NEX-SAL-INV-001 | Produce invoices from approved source obligations |
| NEX-SAL-CRN-001 | Issue controlled credit notes and debit notes |
| NEX-SAL-RET-001 | Authorize and process customer returns |
| NEX-SAL-PRC-001 | Maintain prices, discounts, promotions, and approvals |
| NEX-SAL-COM-001 | Calculate and approve sales commission |

## 4. Master Data

Customer reference, contact, address, tax registration, channel, territory, salesperson, item/service, unit, price list, discount policy, tax category, payment/delivery terms, commission plan, warehouse, project, and revenue rule.

## 5. Transactions

Quotation, order, delivery, service acceptance, proforma, invoice, batch invoice, credit/debit note, return authorization, return receipt, refund request, and commission statement.

## 6. Transaction Lifecycles

Order: Draft → Submitted → Approved → Confirmed → Allocated → Partially/Fully Delivered → Partially/Fully Invoiced → Closed. Invoice: Draft → Validated → Approved → Posted → Partially/Fully Paid; exceptions On Hold, Disputed, Credited, Cancelled before posting, or Reversed.

## 7. Approval Workflow

Discount, margin, credit-limit, payment-term, tax override, free-of-charge, return, and credit-note approvals use configurable thresholds. Amendment after approval triggers re-approval when material fields change.

## 8. Operational Workflow

Quotation → order → credit/stock/resource check → approval → delivery/service confirmation → invoice → Accounting Event → AR/GL → collection → reconciliation. Service billing may originate from milestone, timesheet, retainer, usage, or subscription evidence.

## 9. Accounting Impact

Quotation/order have no GL impact. Invoice proposes Dr AR, Cr revenue, Cr output tax. Goods delivery proposes Dr COGS, Cr inventory according to valuation policy. Credit/return creates linked reversing or corrective events. Rules remain subject to the approved accounting matrix.

## 10. Reports

Quotation conversion, order book, backlog, deliveries, invoice register, returns, credit notes, sales by customer/item/service/channel/salesperson, margin, discount leakage, tax, and commission.

## 11. Dashboard / KPIs

Pipeline-to-order conversion, order intake, backlog, on-time delivery, revenue, gross margin, average selling price, discount rate, returns, unbilled delivery, and overdue receivables.

## 12. Settings & Configuration

Document numbering, price hierarchy, tax determination, credit checks, fulfilment policy, partial delivery/invoice, tolerance, invoice grouping, revenue trigger, and amendment rules.

## 13. Permissions

Separate quotation, pricing override, order approval, delivery confirmation, invoicing, credit note, return, commission, export, and reporting permissions.

## 14. Segregation of Duties

Salesperson cannot unilaterally override price/credit/tax, confirm their own exceptional order, approve their own commission, or post unrestricted credit notes.

## 15. Integrations

CRM, AR, Inventory, Projects, Subscription Billing, Revenue Recognition, Tax, Banking, Workflow, Documents, Notifications, Portals, Finance, and Audit.

## 16. Service Company Applicability

Supports proposals, contracts, retainers, milestones, T&M/service acceptance, project billing, subscription billing, and unbilled WIP.

## 17. Trading Company Applicability

Supports quotation, order allocation, pick/pack/delivery, invoice, return, pricing, promotion, commission, tax, COGS, and inventory availability.

## 18. Manufacturing Company Applicability

Supports demand, make-to-order/make-to-stock fulfilment, availability-to-promise, production linkage, staged delivery, warranty, and invoice.

## 19. Implementation Status

`PLANNED`. No operational Sales models, APIs, workflows, UI, or tests exist. Demo journal labels must not be treated as Sales functionality.

## 20. Open Questions

NEX-OQ-009 credit policy; NEX-OQ-023 pricing priority; NEX-OQ-024 invoice/delivery recognition trigger; NEX-OQ-025 return and commission policy.

## 21. Acceptance Criteria

1. Each order and invoice traces to customer, lines, approvals, fulfilment, accounting, tax, AR, and audit.
2. Quantity and value tolerances prevent over-delivery/over-invoicing unless approved.
3. Invoice and credit-note postings are balanced and idempotent.
4. Service and goods flows use appropriate evidence.
5. Sales reports reconcile to posted invoices and returns.

---

# MODULE 04 — Revenue Recognition

## 1. Purpose & Scope

Recognize contract revenue over time or at a point in time using approved accounting policies, separating billing, cash collection, performance obligations, contract assets/liabilities, and recognized revenue.

## 2. Navigation Hierarchy

Revenue Recognition → Contracts; Performance Obligations; Allocation; Recognition Schedules; Milestones; Usage Evidence; Recognition Runs; Adjustments; Contract Assets/Liabilities; Disclosures; Reports.

## 3. Main Functions

| ID | Function |
|---|---|
| NEX-REV-CTR-001 | Register revenue contracts and modifications |
| NEX-REV-POB-001 | Define performance obligations and satisfaction methods |
| NEX-REV-ALC-001 | Allocate transaction price using approved policy |
| NEX-REV-SCH-001 | Build and maintain recognition schedules |
| NEX-REV-RUN-001 | Calculate, approve, post, and reverse recognition runs |
| NEX-REV-ADJ-001 | Process estimates, catch-ups, modifications, and corrections |
| NEX-REV-DSC-001 | Produce contract-asset/liability and disclosure support |

## 4. Master Data

Revenue policy, performance-obligation type, satisfaction method, standalone selling price, allocation rule, contract class, milestone/evidence type, recognition calendar, GL mapping, materiality threshold, and modification policy.

## 5. Transactions

Contract, modification, obligation allocation, recognition schedule, evidence record, recognition run, catch-up adjustment, impairment/allowance input, reversal, and disclosure snapshot.

## 6. Transaction Lifecycles

Contract: Draft → Reviewed → Approved → Active → Modified/Completed/Terminated. Run: Prepared → Validated → Approved → Posted → Reversed. Schedule changes preserve prior versions and require effective dates.

## 7. Approval Workflow

Accounting policy owner approves templates. Finance approves nonstandard allocation, estimates, modifications, manual evidence, material catch-up entries, and reversals.

## 8. Operational Workflow

Approved contract → identify obligations → allocate price → collect delivery/evidence → calculate recognition → approve run → Accounting Event → GL → contract balances → reporting/disclosures.

## 9. Accounting Impact

Proposed patterns include Dr contract asset/unbilled receivable or contract liability, Cr revenue; billing moves contract balances to AR; deferral separates billed amounts from recognized revenue. Exact IFRS/local-GAAP policy requires owner/accounting approval.

## 10. Reports

Recognition schedule, recognized/deferred/unbilled revenue, contract assets/liabilities, waterfall, roll-forward, modifications, forecast, exception report, and disclosure support.

## 11. Dashboard / KPIs

Recognized revenue, deferred revenue, unbilled revenue, remaining performance obligations, upcoming recognition, manual-adjustment ratio, and overdue evidence.

## 12. Settings & Configuration

Policy version, allocation method, calendars, rounding, materiality, evidence requirements, close lock, GL mappings, and retrospective/prospective modification rules.

## 13. Permissions

Separate contract review, policy administration, evidence entry, run prepare/approve/post/reverse, adjustment, disclosure, and reporting permissions.

## 14. Segregation of Duties

Contract commercial owner cannot approve accounting allocation or post material manual revenue. Run preparer and approver must be distinct above threshold.

## 15. Integrations

Sales, Subscription Billing, Projects, Timesheets, Service Acceptance, AR, Finance, Tax, Documents, Workflow, Audit, and BI.

## 16. Service Company Applicability

High: fixed-price, milestone, T&M, retainer, AMC, unbilled WIP, and project-progress recognition.

## 17. Trading Company Applicability

Usually point-in-time delivery recognition; applies to bundles, warranties, rebates, consignment, and complex contracts.

## 18. Manufacturing Company Applicability

Supports long-term contracts, customer-specific production, staged acceptance, warranties, and over-time criteria where approved.

## 19. Implementation Status

`PLANNED`. Current Finance can post journals but has no revenue-contract, obligation, allocation, evidence, or schedule subledger.

## 20. Open Questions

NEX-OQ-008 accounting framework/policy owner; NEX-OQ-026 allocation and evidence rules; NEX-OQ-027 contract modification treatment.

## 21. Acceptance Criteria

1. Recognition is distinct from billing and collection.
2. Every amount traces to contract, obligation, evidence, rule version, journal, and report.
3. Schedules are versioned and closed periods protected.
4. Runs are repeatable, balanced, idempotent, and reversible.
5. Contract balance roll-forwards reconcile to GL.

---

# MODULE 05 — Subscription & Recurring Billing

## 1. Purpose & Scope

Manage recurring commercial agreements, plans, entitlements, usage, amendments, renewals, billing schedules, proration, invoices, collections handoff, and subscription analytics.

## 2. Navigation Hierarchy

Subscription Billing → Plans & Price Books; Subscriptions; Contracts; Entitlements; Usage; Billing Schedules; Billing Runs; Amendments; Renewals; Cancellations; Credits; Collections Handoff; Reports.

## 3. Main Functions

| ID | Function |
|---|---|
| NEX-SUB-PLN-001 | Maintain plans, tiers, addons, usage and pricing versions |
| NEX-SUB-CTR-001 | Create and approve subscription contracts |
| NEX-SUB-USG-001 | Import, validate, rate, and retain usage evidence |
| NEX-SUB-BIL-001 | Generate repeatable billing schedules and invoices |
| NEX-SUB-AMD-001 | Amend, upgrade, downgrade, pause, resume, or cancel |
| NEX-SUB-REN-001 | Manage renewal, notice, repricing, and churn |
| NEX-SUB-MET-001 | Calculate MRR, ARR, churn, expansion, contraction, and cohort metrics |

## 4. Master Data

Plan, product/service, price book, tier, billing frequency, usage meter, unit, tax category, contract template, renewal rule, proration rule, collection terms, entitlement, and revenue policy.

## 5. Transactions

Subscription quote/order, activation, usage batch, billing schedule, billing run, invoice request, amendment, suspension, resumption, renewal, cancellation, credit, and write-off request.

## 6. Transaction Lifecycles

Subscription: Draft → Submitted → Approved → Active → Suspended/Amended/Renewed → Cancelled/Expired. Billing run: Prepared → Validated → Approved → Invoices Generated → Completed or Reversed.

## 7. Approval Workflow

Nonstandard price, free period, backdating, credit, cancellation, refund, contract term, and manual usage adjustments require threshold-based approval and re-approval after material amendment.

## 8. Operational Workflow

Offer → contract → activation → entitlement/usage → schedule → billing run → Sales invoice → Accounting Event → AR/Tax/GL → receipt/collection → renewal/churn analytics.

## 9. Accounting Impact

Subscription activation has no direct GL impact. Billing follows Sales/AR rules. Revenue Recognition determines recognized versus deferred/unbilled revenue. Credits/refunds use linked corrective events.

## 10. Reports

Subscription register, billing forecast, billing run, failed billing, usage variance, renewal pipeline, churn, MRR/ARR bridge, cohort, contract liability, and revenue waterfall.

## 11. Dashboard / KPIs

MRR, ARR, new/expansion/contraction/churn MRR, net/gross retention, renewal rate, active subscribers, average revenue per account, failed billing, and deferred revenue.

## 12. Settings & Configuration

Billing calendars, cut-offs, proration, usage late-arrival, rounding, minimum charge, invoice grouping, renewal notices, dunning handoff, tax, FX, and backdating limits.

## 13. Permissions

Plan administration, subscription create/amend/approve, usage import/adjust, billing run prepare/approve, cancellation, credit, metric/report, and export permissions.

## 14. Segregation of Duties

Sales cannot approve their own exceptional pricing or credits. Usage administrator cannot approve manual usage adjustments. Billing-run preparer and approver are separable.

## 15. Integrations

CRM, Sales, AR, Revenue Recognition, Tax, Payment Gateway/Banking, Product/Entitlements, Projects/Support, Notifications, Documents, Finance, and Audit.

## 16. Service Company Applicability

High for SaaS, retainers, AMC, managed services, support contracts, and recurring professional services.

## 17. Trading Company Applicability

Applies to replenishment subscriptions, memberships, maintenance plans, rental/lease-like offers, and recurring delivery.

## 18. Manufacturing Company Applicability

Applies to equipment service plans, warranties, consumable replenishment, maintenance, connected-device usage, and product-as-a-service.

## 19. Implementation Status

`PLANNED`. Current recurring journals are accounting templates, not customer subscription or recurring-billing functionality.

## 20. Open Questions

NEX-OQ-028 pricing/proration policy; NEX-OQ-029 payment-gateway scope; NEX-OQ-030 metric definitions and revenue-policy relationship.

## 21. Acceptance Criteria

1. Billing schedules are deterministic and duplicate-safe.
2. Usage retains source and correction lineage.
3. Amendments calculate transparent effective-date/proration results.
4. Generated invoices use the Sales/AR accounting chain.
5. Subscription metrics reconcile to contract and billing populations.

---

# MODULE 06 — Customers / Accounts Receivable

## 1. Purpose & Scope

Maintain customer credit and receivable subledgers; control invoice obligations, receipts, allocations, adjustments, disputes, dunning, statements, aging, and reconciliation to the GL control account.

## 2. Navigation Hierarchy

Accounts Receivable → Customers; Customer Accounts; Open Items; Receipts; Allocations; Credit Notes; Refunds; Adjustments; Disputes; Credit Control; Dunning; Statements; Aging; Reconciliation; Reports.

## 3. Main Functions

| ID | Function |
|---|---|
| NEX-AR-CUS-001 | Maintain customer financial profile and credit controls |
| NEX-AR-LED-001 | Maintain immutable customer open-item subledger |
| NEX-AR-RCT-001 | Record and post customer receipts |
| NEX-AR-ALC-001 | Allocate/unallocate receipts and credits to open items |
| NEX-AR-CRD-001 | Control credits, refunds, write-offs, and adjustments |
| NEX-AR-DSP-001 | Record disputes, holds, promises, and collection actions |
| NEX-AR-DUN-001 | Execute configurable reminders and dunning |
| NEX-AR-REC-001 | Reconcile AR subledger to the GL control account |

## 4. Master Data

Customer, billing account, parent/group, addresses, contacts, tax registration, currency, payment terms, credit limit, risk class, collector, dunning profile, bank instruction, withholding profile, and AR control account.

## 5. Transactions

Receivable item, receipt, allocation, unallocation, credit/debit adjustment, refund, write-off, dispute, promise to pay, collection note, statement, and balance confirmation.

## 6. Transaction Lifecycles

Open item: Open → Partially Settled → Settled; exceptions Disputed, On Hold, Written Off, Credited, or Reversed. Receipt: Draft → Confirmed → Posted → Partially/Fully Allocated → Reconciled; may become Unidentified or Refunded.

## 7. Approval Workflow

Credit-limit override, term override, refund, write-off, manual adjustment, allocation reversal, and dispute settlement use configurable amount/risk approvals.

## 8. Operational Workflow

Posted invoice/adjustment → customer open item → collection/dunning → receipt → bank deposit/import → allocation → settlement → bank reconciliation → AR-to-GL reconciliation.

## 9. Accounting Impact

Invoice Dr AR control, Cr revenue/tax through Sales. Receipt Dr bank/undeposited funds, Cr AR control. Write-off Dr approved expense/allowance, Cr AR. Refund reverses settlement through controlled events. Subledger and GL must remain in balance.

## 10. Reports

Customer ledger, open items, aging, overdue, collections, unapplied receipts, credit exposure, disputes, dunning, write-offs, statements, balance confirmations, and AR-to-GL reconciliation.

## 11. Dashboard / KPIs

Total/open/overdue AR, DSO, aging buckets, collection effectiveness, unapplied cash, disputes, credit-limit breaches, top overdue customers, and expected collections.

## 12. Settings & Configuration

Aging buckets, credit scoring, dunning cadence/templates, allocation priority, tolerance/write-off limits, control accounts, receipt clearing, statement cycle, and balance-confirmation rules.

## 13. Permissions

Customer financial maintenance, receipt create/post, allocate/unallocate, credit approval, refund, write-off, dispute, dunning, reconciliation, sensitive-data read, export, and reporting.

## 14. Segregation of Duties

Customer bank/credit maintenance, sales order override, receipt entry, allocation, refund, write-off, and reconciliation must be independently assignable.

## 15. Integrations

Sales, Subscription Billing, Projects, Banking, Tax, Revenue Recognition, CRM, Portals, Notifications, Workflow, Documents, Finance, and Audit.

## 16. Service Company Applicability

Critical for milestone/T&M invoices, retainers, subscriptions, unbilled-to-billed conversion, customer disputes, and project collections.

## 17. Trading Company Applicability

Critical for order credit checks, distributor/customer accounts, high-volume allocation, returns, rebates, and collection routes.

## 18. Manufacturing Company Applicability

Critical for customer exposure, staged deliveries, retention, claims, dealer accounts, warranty credits, and long-cycle collections.

## 19. Implementation Status

`PLANNED`. The Finance model has a generic `Party` and AR GL account but no customer subledger, invoice open items, allocations, aging, dunning, or AR reconciliation.

## 20. Open Questions

NEX-OQ-009 credit policy; NEX-OQ-031 aging basis; NEX-OQ-032 allocation priority; NEX-OQ-033 expected-credit-loss scope.

## 21. Acceptance Criteria

1. Every AR item traces to source document and journal.
2. Customer balance equals open-item composition.
3. AR control account reconciles to subledger by company/currency/date.
4. Allocations and reversals retain immutable lineage.
5. Aging and statements reproduce from transaction data.

---

# MODULE 07 — Purchases & Procurement

## 1. Purpose & Scope

Control demand-to-contract and procure-to-receipt/bill processes: requisition, sourcing, supplier selection, order, receipt, inspection, bill matching, returns, and handoff to AP, Inventory, Costing, Projects, Tax, and Finance.

## 2. Navigation Hierarchy

Purchases & Procurement → Purchase Requisitions; Approvals; RFQs; Supplier Quotations; Bid Comparison; Supplier Evaluation; Purchase Orders; Goods Receipts; Gate Inward; Quality Inspection; Service Entry; Purchase Bills; 2/3-Way Match; Returns; Contracts; Procurement Reports.

## 3. Main Functions

| ID | Function |
|---|---|
| NEX-PUR-PR-001 | Capture, approve, budget-check, and source requisitions |
| NEX-PUR-RFQ-001 | Issue RFQs and collect comparable supplier quotations |
| NEX-PUR-EVL-001 | Evaluate bids and suppliers with recorded rationale |
| NEX-PUR-PO-001 | Create, approve, amend, and close purchase orders |
| NEX-PUR-GRN-001 | Record gate entry and goods receipt against PO |
| NEX-PUR-QIN-001 | Inspect, accept, reject, quarantine, or rework receipts |
| NEX-PUR-SRV-001 | Confirm service entry and acceptance |
| NEX-PUR-BIL-001 | Capture supplier bills and execute 2/3-way matching |
| NEX-PUR-RTN-001 | Authorize supplier returns and debit recovery |

## 4. Master Data

Supplier reference, item/service, category, unit, warehouse/location, tax, delivery/payment terms, buyer, requester, department, cost centre, project, budget, quality plan, tolerance, procurement method, and contract.

## 5. Transactions

Requisition, approval, RFQ, quotation, bid comparison, award, PO, amendment, gate pass, GRN, service entry, inspection, rejection, supplier bill, match exception, return, and close/cancel.

## 6. Transaction Lifecycles

PR: Draft → Submitted → Approved → Sourcing → Converted/Closed. PO: Draft → Submitted → Approved → Confirmed → Partially/Fully Received → Partially/Fully Billed → Closed. Bill: Draft → Validated → Matched/Exception → Approved → Posted → Paid/Credited.

## 7. Approval Workflow

Department, budget owner, Procurement, Finance, and authorized signatory levels vary by amount/category/company. Single-source, emergency, over-budget, price/tax/tolerance exception, amendment, and cancellation require explicit approval.

## 8. Operational Workflow

Demand → requisition → budget/approval → RFQ/bids → evaluation/award → PO → gate/receipt/service entry → quality → bill → match → Accounting Event → AP/Inventory/Expense/Tax/GL → payment/reconciliation.

## 9. Accounting Impact

PR/RFQ/PO ordinarily create commitments, not GL. Accepted inventory receipt may Dr inventory/GRNI and Cr receipt accrual. Service/expense bill proposes Dr expense/project/WIP/input tax, Cr AP. Inventory bill clears GRNI and posts variances/landed cost per policy.

## 10. Reports

PR status, approval aging, RFQ/bid comparison, PO commitment, open PO, overdue delivery, receipt, quality rejection, unbilled receipts, invoice match exception, supplier performance, purchase analysis, savings, and spend by category/company/project.

## 11. Dashboard / KPIs

Open commitments, approval cycle time, sourcing cycle, savings, on-time delivery, receipt-to-bill lag, match exception rate, supplier quality, emergency/single-source spend, and overdue POs.

## 12. Settings & Configuration

Numbering, procurement methods, approval thresholds, budget checks, match type/tolerances, partial receipt/billing, over-delivery, quality requirement, amendment rules, close policy, and emergency procurement.

## 13. Permissions

Requester, approver, buyer, evaluator, PO approver, gate clerk, receiver, inspector, bill entry, matcher, exception approver, return, contract, report, and export permissions.

## 14. Segregation of Duties

Requester, approver, supplier maintainer, buyer, receiver, inspector, bill processor, exception approver, and payment releaser must be separable. Bid confidentiality and conflict-of-interest declarations are required.

## 15. Integrations

Supplier/AP, Inventory, Costing, Quality, Projects, Budgets, Tax, Banking, Documents, Workflow, Notifications, Portals, Finance, and Audit.

## 16. Service Company Applicability

Supports contractor, cloud/software, travel, facilities, professional service, project purchase, service entry, and budget control.

## 17. Trading Company Applicability

Core for merchandise replenishment, imports, warehouse receipt, quality, landed cost, supplier performance, and stock valuation.

## 18. Manufacturing Company Applicability

Core for MRP-driven materials, subcontracting, tooling, services, quality, batch/serial receipt, production commitment, and capex.

## 19. Implementation Status

`PARTIAL`. Requisition, purchase-order approval, receipt, tolerance match,
Accounting Event/GL integration, API, live read UI, audit, and Demo v2 are
implemented. RFQ/bids, quality, supplier bill/AP, returns, service entry,
amendment/close, and procurement-to-payment remain planned.

## 20. Open Questions

NEX-OQ-010 matching tolerances; NEX-OQ-034 commitment/budget behavior; NEX-OQ-035 supplier onboarding; NEX-OQ-036 quality/gate-inward scope.

## 21. Acceptance Criteria

1. PR-to-payment lineage is complete and immutable.
2. Ordered, received, accepted, billed, returned, and paid quantities/values reconcile.
3. Match exceptions cannot post without authorized resolution.
4. Accounting Events are balanced, idempotent, and source-linked.
5. Procurement reports derive from actual workflow and transaction data.

---

# MODULE 08 — Suppliers / Accounts Payable

## 1. Purpose & Scope

Maintain supplier financial profiles and payable open-item subledgers; control bills, credits, advances, allocations, payment proposals, withholding, disputes, statements, aging, and AP-to-GL reconciliation.

## 2. Navigation Hierarchy

Accounts Payable → Suppliers; Supplier Accounts; Purchase Bills; Open Items; Advances; Credit Notes; Payment Requests; Payment Proposals; Allocations; Withholding Tax; Disputes; Statements; Aging; Reconciliation; Reports.

## 3. Main Functions

| ID | Function |
|---|---|
| NEX-AP-SUP-001 | Maintain supplier financial, tax, bank, and risk profile |
| NEX-AP-LED-001 | Maintain immutable supplier open-item subledger |
| NEX-AP-BIL-001 | Record validated/matched payable obligations |
| NEX-AP-PAY-001 | Select due items and create approved payment proposals |
| NEX-AP-ALC-001 | Allocate advances, payments, and credits |
| NEX-AP-WHT-001 | Calculate and evidence withholding obligations |
| NEX-AP-DSP-001 | Hold/dispute invoices and resolve supplier queries |
| NEX-AP-REC-001 | Reconcile supplier subledger to GL control account |

## 4. Master Data

Supplier, site, contacts, tax registration, bank account, currency, payment method/terms, withholding profile, risk/sanction status, category, buyer, AP control account, advance account, and payment block.

## 5. Transactions

Supplier bill, credit note, debit recovery, advance, payment request, payment proposal, payment instruction, allocation/unallocation, withholding certificate, dispute, hold/release, statement reconciliation, and balance confirmation.

## 6. Transaction Lifecycles

Bill: Draft → Validated → Matched/Exception → Approved → Posted → Partially/Fully Settled; exceptions Held, Disputed, Credited, Reversed. Payment proposal: Prepared → Reviewed → Approved → Sent to Banking → Executed → Posted → Reconciled.

## 7. Approval Workflow

Bill exceptions, duplicate override, bank-detail change, advance, urgent payment, payment proposal, manual credit, write-off, and hold release require configured approvals.

## 8. Operational Workflow

Approved bill/credit → supplier open item → due-date/cash planning → payment proposal → authorization → Banking execution → Accounting Event → allocation → settlement → reconciliation → supplier statement/balance confirmation.

## 9. Accounting Impact

Bill Dr expense/inventory/asset/input tax, Cr AP control. Payment Dr AP control, Cr bank/clearing; withholding splits payable to supplier and tax authority. Advance Dr supplier advance, Cr bank, then allocation clears advance. Exact tax and FX policy requires approval.

## 10. Reports

Supplier ledger, open items, aging, due/overdue, payment forecast, payment proposal, advances, unapplied credits, holds/disputes, withholding, duplicate risk, statements, balance confirmations, and AP-to-GL reconciliation.

## 11. Dashboard / KPIs

Total/due/overdue AP, DPO, upcoming cash requirement, blocked invoices, match exceptions, advances, discounts available/lost, top suppliers, and payment cycle time.

## 12. Settings & Configuration

Aging buckets, payment calendars, selection priority, discount policy, duplicate detection, control/advance/withholding accounts, payment blocks, tolerances, statement cycle, and balance-confirmation rules.

## 13. Permissions

Supplier financial/bank maintenance, bill entry/approve/post, hold/release, proposal prepare/approve, advance, allocation, withholding, reconciliation, sensitive-data read, report, and export permissions.

## 14. Segregation of Duties

Supplier creation, supplier-bank change, purchasing, receipt, bill entry, exception approval, payment proposal, bank release, and reconciliation must be separable. Bank changes require independent verification.

## 15. Integrations

Procurement, Inventory, Projects, Expenses, Fixed Assets, Tax, Banking, Workflow, Documents/OCR, Supplier Portal, Notifications, Finance, and Audit.

## 16. Service Company Applicability

Supports contractors, consultants, cloud/software suppliers, employee-related payables, project costs, overheads, and withholding.

## 17. Trading Company Applicability

Supports merchandise/import bills, freight/customs, advances, landed cost, high-volume payment proposals, and supplier statements.

## 18. Manufacturing Company Applicability

Supports raw material, subcontracting, utilities, maintenance, capex, quality claims, supplier financing, and production commitments.

## 19. Implementation Status

`PLANNED`. A generic `Party`, AP GL account, and manual journals exist; no AP open-item subledger, bills, proposals, allocations, aging, or reconciliation exists.

## 20. Open Questions

NEX-OQ-014 Pakistan/UAE withholding scope; NEX-OQ-035 supplier onboarding; NEX-OQ-037 duplicate detection; NEX-OQ-038 payment selection and discount policy.

## 21. Acceptance Criteria

1. Supplier balances reconcile to open items and AP control account.
2. Duplicate and unauthorized invoices are blocked or approved as exceptions.
3. Payments cannot bypass supplier-bank verification or approval.
4. Withholding retains jurisdiction, rule, base, rate, certificate, and posting evidence.
5. Allocations and reversals preserve source lineage.

---

# MODULE 09 — Inventory & Warehousing

## 1. Purpose & Scope

Control item stock by company, warehouse, location, ownership, batch/serial, status, and valuation layer across receipt, storage, reservation, movement, issue, picking, delivery, return, count, adjustment, and revaluation.

## 2. Navigation Hierarchy

Inventory & Warehousing → Items; Warehouses; Locations/Bins; Stock Overview; Receipts; Put-away; Reservations; Pick Lists; Issues; Transfers; Deliveries; Returns; Adjustments; Counts; Batch/Serial; Expiry; Replenishment; Valuation; Reports.

## 3. Main Functions

| ID | Function |
|---|---|
| NEX-INV-ITM-001 | Maintain stocked/non-stock/service item behavior |
| NEX-INV-WHS-001 | Maintain warehouse, location, bin, and status controls |
| NEX-INV-MOV-001 | Record immutable stock movements and source lineage |
| NEX-INV-RES-001 | Reserve, allocate, release, pick, pack, and deliver stock |
| NEX-INV-TRF-001 | Transfer stock with in-transit control |
| NEX-INV-CNT-001 | Plan, count, approve, and post stock differences |
| NEX-INV-TRC-001 | Trace batches, serials, expiry, ownership, and recalls |
| NEX-INV-VAL-001 | Maintain valuation layers and reconcile inventory to GL |

## 4. Master Data

Item, category, unit/conversion, barcode, warehouse, location/bin, stock status, batch/serial rule, expiry/shelf-life rule, costing method, valuation account, COGS account, adjustment account, owner/consignment, replenishment policy, and quality status.

## 5. Transactions

Receipt, put-away, reservation, release, pick, pack, issue, delivery, return, transfer, in-transit receipt, adjustment, cycle count, stocktake, status change, batch/serial split/merge, quarantine/release, and revaluation.

## 6. Transaction Lifecycles

Movement: Draft → Submitted → Approved where required → Confirmed → Costed → Accounting Event Posted → Completed; correction by linked reversal/counter-movement. Count: Planned → Frozen/Snapshot → Counted → Recounted → Approved → Difference Posted → Closed.

## 7. Approval Workflow

Negative stock override, manual adjustment, count variance, status override, backdate, ownership change, scrap, write-off, revaluation, and transfer exception use thresholds and warehouse/company authority.

## 8. Operational Workflow

Source demand/supply → warehouse task → physical execution/scan → quantity validation → immutable stock movement → valuation → Accounting Event → GL → stock/valuation reporting and audit.

## 9. Accounting Impact

Receipt, issue, delivery, return, adjustment, transfer variance, scrap, and revaluation produce approved Accounting Events. Typical sale delivery Dr COGS, Cr inventory; purchase receipt Dr inventory, Cr GRNI. Non-valued transfers have no P&L impact. Exact method awaits the accounting matrix.

## 10. Reports

Stock on hand/available, movement ledger, valuation, aging, slow/non-moving, negative stock, reorder, shortage, reservation, batch/serial trace, expiry, stock count variance, warehouse utilization, consignment, and inventory-to-GL reconciliation.

## 11. Dashboard / KPIs

Inventory value, stock turns, days on hand, fill rate, shortage, negative stock, expiring stock, count accuracy, pick accuracy, on-time dispatch, dead stock, and warehouse throughput.

## 12. Settings & Configuration

Costing method, negative-stock policy, backdating, reservation strategy, pick method, put-away/replenishment rules, count frequency, variance limits, status transitions, batch/serial/expiry requirements, and period close.

## 13. Permissions

Item/warehouse master, receipt, put-away, reserve, pick, issue, transfer, count, adjustment, batch/serial correction, valuation, close/reopen, report, and export permissions.

## 14. Segregation of Duties

Item/valuation master maintenance, receipt, inspection, count, variance approval, adjustment, and financial reconciliation must be separable. Users cannot approve their own material stock adjustment.

## 15. Integrations

Procurement, Sales, Manufacturing, Quality, Costing, Projects, Fixed Assets, Tax, Barcode/WMS, Portals, Workflow, Documents, Finance, and Audit.

## 16. Service Company Applicability

Optional/lightweight for consumables, spare parts, customer-owned assets, field-service stock, devices, and project materials.

## 17. Trading Company Applicability

Core: multi-warehouse distribution, high-volume receipt/dispatch, batch/serial, expiry, returns, consignment, replenishment, and valuation.

## 18. Manufacturing Company Applicability

Core: raw materials, WIP, finished goods, quarantine, material issue/return, production receipt, scrap, traceability, and MRP availability.

## 19. Implementation Status

`PARTIAL`. Item/tracking/valuation-policy masters, warehouse bins, receipt
validation, immutable stock movements, derived receipt value, Inventory/GRNI
posting, API, live read UI, tests, and Demo v2 exist. Reservations, transfers,
issues, counts/adjustments, outbound cost layers, scanning, and full warehouse
execution remain planned.

## 20. Open Questions

NEX-OQ-011 valuation method; NEX-OQ-012 negative-stock/backdating policy; NEX-OQ-039 batch/serial scope; NEX-OQ-040 warehouse execution depth.

## 21. Acceptance Criteria

1. On-hand equals immutable movement history by all stock dimensions.
2. Physical and financial quantities/values reconcile.
3. No duplicate source transaction creates duplicate movement/posting.
4. Batch/serial/expiry lineage supports recall and audit.
5. Closed-period and backdating policies are enforced.

---

# MODULE 10 — Costing & Landed Cost

## 1. Purpose & Scope

Determine, allocate, explain, and reconcile inventory/service/production cost, including landed costs, valuation layers, standard costs, actual costs, variances, and cost-of-sales release.

## 2. Navigation Hierarchy

Costing → Cost Policies; Cost Components; Landed Cost Documents; Allocation Runs; Standard Costs; Actual Costs; Cost Roll-up; Variances; Revaluation; COGS; Cost Reconciliation; Reports.

## 3. Main Functions

| ID | Function |
|---|---|
| NEX-CST-POL-001 | Version valuation and costing policies by company/item class |
| NEX-CST-LND-001 | Capture freight, duty, insurance, handling, and other landed cost |
| NEX-CST-ALC-001 | Allocate costs using approved bases and preserve calculation detail |
| NEX-CST-VAL-001 | Maintain valuation layers and release cost on issue/delivery |
| NEX-CST-STD-001 | Propose, approve, activate, and roll standard costs |
| NEX-CST-VAR-001 | Calculate purchase, usage, rate, yield, and production variances |
| NEX-CST-REC-001 | Reconcile inventory/subledgers to GL and explain differences |

## 4. Master Data

Cost component, valuation method, allocation basis, freight/duty rule, item/category, route/shipment, supplier, warehouse, cost centre, standard-cost version, variance account, inventory/COGS accounts, and rounding rule.

## 5. Transactions

Landed-cost document, charge accrual, allocation run, cost adjustment, standard-cost proposal/activation, cost roll-up, revaluation, variance settlement, and reconciliation.

## 6. Transaction Lifecycles

Landed cost: Draft → Charges Collected → Allocated → Reviewed → Approved → Posted → Closed/Reversed. Standard cost: Draft → Calculated → Reviewed → Approved → Effective → Superseded.

## 7. Approval Workflow

Allocation override, estimated charge, late cost, standard-cost activation, material revaluation, manual cost adjustment, and variance settlement require Finance/Costing approval.

## 8. Operational Workflow

Receipt/shipment/production population → collect actual/estimated charges → select allocation basis → calculate → review exceptions → approve → update valuation → Accounting Event → GL/COGS/variance → reconciliation.

## 9. Accounting Impact

Proposed rules capitalize eligible landed cost into inventory and clear accrual/payable; noncapitalizable amounts expense. Cost release posts Dr COGS/usage/WIP, Cr inventory. Revaluation and variances use designated accounts. Policy approval is mandatory.

## 10. Reports

Item cost build-up, landed-cost allocation, receipt cost, valuation layers, standard versus actual, purchase/production variance, margin bridge, cost adjustments, inventory-to-GL reconciliation, and COGS analysis.

## 11. Dashboard / KPIs

Landed cost percentage, unallocated charges, estimated-versus-actual, gross-margin impact, purchase price variance, production variance, negative-cost exceptions, and reconciliation differences.

## 12. Settings & Configuration

Valuation method, eligible components, allocation bases, estimates, tolerance, rounding, late-cost policy, standard-cost calendars, variance treatment, and closed-period handling.

## 13. Permissions

Policy administration, landed-cost create/allocate/approve/post/reverse, standard-cost calculate/approve/activate, revaluation, variance settlement, reconciliation, report, and export permissions.

## 14. Segregation of Duties

Charge entry, allocation override, approval, posting, inventory adjustment, and reconciliation must be independently assignable. Buyers cannot approve cost overrides that affect their own purchasing performance.

## 15. Integrations

Procurement, AP, Inventory, Manufacturing, Sales, Projects, Tax/Customs, Logistics, Budgeting, Finance, Workflow, Documents, and Audit.

## 16. Service Company Applicability

Supports project/service cost rates, contractor and cloud allocation, unbilled WIP, shared-cost allocation, and service margin; physical landed cost is optional.

## 17. Trading Company Applicability

Core for imports, freight, duty, insurance, customs, handling, inventory valuation, gross margin, and late supplier charges.

## 18. Manufacturing Company Applicability

Core for material, labor, overhead, subcontracting, WIP, finished-goods cost, standard/actual cost, and production variances.

## 19. Implementation Status

`PLANNED`. Finance has generic expense/inventory accounts but no inventory valuation layers, landed-cost allocation, standard-cost versions, or cost subledger.

## 20. Open Questions

NEX-OQ-011 valuation method; NEX-OQ-013 landed-cost eligibility/allocation; NEX-OQ-041 standard versus actual costing strategy.

## 21. Acceptance Criteria

1. Every cost allocation is reproducible from versioned inputs/rules.
2. Allocated amount equals source charge after controlled rounding.
3. Inventory valuation and COGS reconcile to movements and GL.
4. Late costs and reversals preserve layer/source lineage.
5. Policy changes are effective-dated and never rewrite posted history.

---

# MODULE 11 — Finance & Accounting

## 1. Purpose & Scope

Provide the controlled financial system of record: chart of accounts, periods, journals, accounting events, ledgers, currencies, tax validation, budgets, recurring journals, intercompany, consolidation, close, statements, drill-down, and audit.

## 2. Navigation Hierarchy

Finance & Accounting → Finance Overview; Chart of Accounts; Journals → Manual, Recurring, Reversals, Register; General Ledger; Period Close; Trial Balance; Balance Sheet; Profit & Loss; Cash Flow; Budgets; Budget vs Actual; Intercompany; Consolidation; Tax Configuration; Finance Audit; Report Definitions.

## 3. Main Functions

| ID | Function |
|---|---|
| NEX-FIN-COA-001 | Maintain hierarchical chart of accounts and posting controls |
| NEX-FIN-EVT-001 | Accept immutable, idempotent Accounting Events |
| NEX-FIN-JE-001 | Create, validate, approve, number, and post journals |
| NEX-FIN-REV-001 | Reverse posted journals with immutable linkage |
| NEX-FIN-PER-001 | Control open, soft-close, closed, and reopened periods |
| NEX-FIN-FX-001 | Resolve transaction/base currency and exchange rates |
| NEX-FIN-REC-001 | Define and generate recurring journal drafts |
| NEX-FIN-BUD-001 | Version, approve, revise, and report budgets without GL posting |
| NEX-FIN-IC-001 | Post atomic intercompany pairs and eliminate for consolidation |
| NEX-FIN-RPT-001 | Produce GL, TB, BS, P&L, Cash Flow, variance, and consolidated reports |
| NEX-FIN-DRL-001 | Drill from report to journal, event, source reference, and audit |
| NEX-FIN-CLS-001 | Orchestrate financial close checklist and reconciliations |

## 4. Master Data

Company, fiscal calendar/period, currency/rate, account hierarchy, account classification, posting/control flags, dimension, tax rule, bank account, party reference, journal type/number series, recurring template, budget version, consolidation group, elimination rule, report definition, and close checklist.

## 5. Transactions

Accounting Event, manual/system journal, recurring generation, reversal, period close/reopen, exchange-rate update, budget approval/revision, intercompany pair, consolidation run, report job, report-definition change, and close task/reconciliation.

## 6. Transaction Lifecycles

Accounting Event: Received → Validated/Rejected → Posting → Posted/Failed → Retried/Dead, with compensating events for corrections. Journal target lifecycle: Draft → Submitted → Approved where required → Posted → Reversed. Period: Open → Soft Closed → Closed → Reopened under authority.

## 7. Approval Workflow

Journal amount/type/company thresholds, self-post SoD, budget approval, period close/reopen, account/control configuration, exchange-rate override, intercompany, consolidation, and material report-definition changes use configurable workflows.

## 8. Operational Workflow

Source module → validated Accounting Event → posting rule resolution → draft journal → controls/approval → immutable number → posted journal/GL → financial reports → drill-down/audit. Manual journals enter at draft-journal stage with documented source and approval.

## 9. Accounting Impact

Finance is the only ledger-writing authority. Every posted journal must have total base debit equal total base credit, use valid leaf accounts/dimensions/period/rates, retain source lineage, and be corrected without deletion. Reversal, numbering, FX and classification decisions in the open-question register must be resolved before Finance is called complete.

## 10. Reports

Journal Register, General Ledger, Trial Balance, Balance Sheet, P&L, Cash Flow, Budget vs Actual, consolidated statements, account activity, period close, intercompany reconciliation, FX, tax support, and finance audit trail.

## 11. Dashboard / KPIs

Revenue, gross profit, operating profit, net profit, cash position, working capital, budget variance, period status, unposted/failed events, unreconciled balances, intercompany differences, report freshness, and close completion.

## 12. Settings & Configuration

Account structure/classification, number series, approval/SoD thresholds, period calendars, currencies/rate sources, dimensions, tax packs, journal types, close checklist, budget workflow, consolidation/elimination, report definitions, materiality, and retention.

## 13. Permissions

Separate account read/create/change, event submit/post/retry, journal read/create/submit/approve/post/reverse, period close/reopen, FX, budget, recurring, intercompany, consolidation, report read/drill/export/manage, tax, reconciliation, and audit permissions.

## 14. Segregation of Duties

Account/policy maintenance, transaction preparation, approval, posting, reconciliation, close/reopen, consolidation, report-definition administration, and audit review must be independently assignable. No user may approve their own material journal.

## 15. Integrations

Every operational module through Accounting Events; Banking; Tax; Workflow; Documents; Notifications; BI; external tax/bank/FX providers; identity; Audit; and migration tooling.

## 16. Service Company Applicability

Core, emphasizing project/service revenue, unbilled WIP, subscriptions, payroll/expense, cash, multicurrency, dimensions, budgets, and profitability.

## 17. Trading Company Applicability

Core, adding inventory/COGS, procurement/AP, sales/AR, landed cost, tax, bank reconciliation, credit control, and working capital.

## 18. Manufacturing Company Applicability

Core, adding material/WIP/finished goods, production variance, standard/actual cost, quality/scrap, capex, intercompany, and consolidation.

## 19. Implementation Status

`PARTIAL`. Strong implementations exist for Accounting Events, journals, controls, period management, budgets, recurring journals, intercompany, consolidation structures, reports, dashboard metrics, drill-down, audit, and demo data. AR/AP/banking/tax/close orchestration are incomplete. Static inspection also identified unresolved reversal-reporting, sequence reuse, FX-reversal, account-type immutability, company-scope, classification, and true-async gaps.

## 20. Open Questions

NEX-OQ-001 legal-company model; NEX-OQ-002 numbering; NEX-OQ-003 reversal/report treatment; NEX-OQ-004 FX reversal; NEX-OQ-005 journal lifecycle; NEX-OQ-006 classifications; NEX-OQ-008 accounting framework; NEX-OQ-014 localisation; NEX-OQ-016 fiscal calendars; NEX-OQ-017 reporting/company access.

## 21. Acceptance Criteria

1. Every posting is balanced, tenant/company scoped, authorized, auditable, idempotent where source-driven, and source-linked.
2. Reversal yields zero economic effect for original plus reversal and preserves historical reporting policy.
3. Journal numbers are unique, immutable, never reused, and follow the approved legal sequence policy.
4. FX reversal and reporting follow the approved rate/base-amount policy.
5. Trial Balance, statements, subledgers, reconciliations, and dashboard totals reconcile from transaction data.
6. Closed periods, account controls, dimensions, tax, approvals, and SoD cannot be bypassed through any posting path.
7. Production readiness is not claimed until identity, persistence, audit protection, backup/HA/DR, workers, retention, and operational controls are approved and evidenced.

## Part A review gate

Owner approval is required before Part B begins. Approval of Part A confirms product scope and terminology only; it does not open the implementation or demo-update gate.
