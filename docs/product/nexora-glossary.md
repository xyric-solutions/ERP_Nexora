# Nexora ERP — Glossary

- Last updated: 2026-08-18
- Scope: Initial vocabulary for Blueprint Part A

| Term | Canonical meaning in Nexora |
|---|---|
| Accounting Event | Immutable, tenant-scoped instruction describing the financial consequence of a source transaction before journal posting. |
| Accounts Payable (AP) | Supplier open-item subledger and settlement process; not merely the AP control account in the GL. |
| Accounts Receivable (AR) | Customer open-item subledger and collection process; not merely the AR control account in the GL. |
| Allocation | Link that applies a receipt, payment, credit, or advance to one or more open items without deleting source history. |
| Approval | Recorded authorized decision under a versioned workflow, including actor, time, comments, and outcome. |
| Base Currency | Company currency in which ledger balances and statutory financial statements are maintained. |
| Batch | Controlled group of transactions or items processed together; context must distinguish a processing batch from an inventory batch/lot. |
| Bill | Supplier obligation entered through Procurement/AP. The term is not interchangeable with a customer invoice. |
| Billing | Commercial process that determines and issues customer charges; it is separate from revenue recognition. |
| Cash Flow Classification | Operating, investing, financing, cash-equivalent, or non-cash classification used by the Cash Flow statement. |
| Company | Legal or reporting organization unit within a tenant that owns books, fiscal periods, currency, tax registrations, and document sequences. Final multi-company rules await NEX-OQ-001. |
| Control Account | GL account owned by a subledger. Direct manual posting is normally prohibited once the owning subledger exists. |
| Costing Method | Approved method used to value inventory or production, such as FIFO, weighted average, standard cost, or specific identification. |
| Credit Note | Controlled document reducing a customer receivable/revenue or supplier payable/cost, linked to the source obligation. |
| Dashboard | Permission-aware presentation of live KPIs, tasks, alerts, and drill-downs; it is not an independent transaction source. |
| Dimension | Additional accounting/reporting attribute such as department, project, cost centre, product, or location. |
| Document | Business record with a permanent ID/number, lifecycle, ownership, lines, approvals, attachments, source links, and audit history. |
| Effective Ledger | Set of journal effects included in financial reporting under the approved posting/reversal policy. |
| General Ledger (GL) | Authoritative account-level record derived from posted journals. |
| Goods Receipt Note (GRN) | Evidence that ordered goods were physically received, before or alongside quality acceptance and supplier billing. |
| GRNI | Goods Received Not Invoiced accrual/clearing balance between accepted receipt and supplier bill. |
| Idempotency | Guarantee that retrying the same source request cannot create a duplicate business or accounting effect. |
| Invoice | Customer billing document creating a receivable and relevant revenue/tax consequences when posted. |
| Item | Product, material, service, charge, asset candidate, or non-stock line type with configured operational/accounting behavior. |
| Journal Entry | Balanced set of debit and credit lines posted to the GL with source, period, company, currency, approval, numbering, and audit data. |
| Landed Cost | Eligible acquisition costs allocated to received inventory, such as freight, duty, insurance, customs, and handling. |
| Maker-Checker | Control requiring a material transaction to be approved or released by someone other than its preparer. |
| Master Data | Governed reference data reused across transactions, such as customers, suppliers, items, accounts, tax rules, and warehouses. |
| Open Item | Unsettled or partially settled customer/supplier obligation in a subledger. |
| Performance Obligation | Contractual promise whose satisfaction controls revenue recognition under the approved accounting policy. |
| Posting Engine | Sole controlled Finance service that validates an Accounting Event or journal and commits balanced ledger entries. |
| Purchase Order (PO) | Approved commercial commitment instructing a supplier to provide goods or services under defined terms. |
| Purchase Requisition (PR) | Internal request for procurement; it is not a supplier order. |
| Reconciliation | Evidence-backed comparison of two records or subledgers, with explained differences and controlled close/reopen. |
| Recurring Journal | Finance template that generates draft journals; it is not subscription billing. |
| Reporting Currency | Currency into which balances are translated for management or consolidation reporting. |
| Reversal | Linked corrective posting that negates an original posted effect without deleting either record. |
| Segregation of Duties (SoD) | Policy preventing incompatible responsibilities or the same actor from controlling a material transaction end-to-end. |
| Service Entry | Evidence that ordered services were delivered/accepted, used for supplier bill matching and project/cost recognition. |
| Source Document | Operational transaction that caused an Accounting Event, such as an invoice, receipt, payment, delivery, or inventory movement. |
| Subledger | Detailed party/asset/inventory-level accounting record reconciled to one or more GL control accounts. |
| Subscription | Customer commercial agreement for recurring or usage-based products/services; distinct from recurring Finance journals. |
| Tenant | Top-level customer/security boundary containing one or more companies, users, configuration, data, and audit history. |
| Transaction Currency | Currency in which the business document or journal line is denominated. |
| Trial Balance | Account balances whose total debits equal total credits for the selected scope and period. |
| Valuation Layer | Quantity and cost record used to explain inventory value and cost release under a costing method. |
| Workflow | Versioned set of states, decisions, assignees, thresholds, exceptions, escalation, and audit rules governing a transaction. |

