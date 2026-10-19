# Nexora ERP — Complete Screen Inventory and Batch Queue

- Status: `COVERAGE REFERENCE — BREADTH-FIRST EXECUTION SUPERSEDED`
- Coverage: shared entry + 35 product areas + 9 cross-module validation flows
- Batch rule: 2–6 screens, grouped by one business flow
- Screen ID rule: `NEX-WF-<AREA>-<NNN>`; IDs are permanent once approved

For readability, table entries after the first use compact IDs such as
`DSH-002`; expand every compact ID to `NEX-WF-DSH-002`. Cross-flow entries such
as `002` inherit the full prefix from the first entry in that row (for example,
`NEX-WF-XFL-P2P-002`).

## Interpretation

This inventory no longer determines build order. The owner directed a
module-maturity sequence on 2026-08-18: Accounting & Finance first, Operations
second after approval, then later modules. See `finance/README.md`.

This is a **product design inventory**, not a route list and not an
implementation claim. One screen specification may cover related modes such as
list/detail, create/edit, or desktop/mobile when those modes share one job.
Materially different user jobs receive separate IDs.

The status column reports current implementation truth at the area level:

- `IMPLEMENTED`: the relevant workflow is supported by live evidence.
- `PARTIAL`: some real behavior exists; the wireframe contains additional scope.
- `PLANNED`: design only and must appear as `Coming Soon` in the live demo.
- `MIXED`: a cross-cutting batch contains more than one status.

Modules 01–11 have Part A functional-blueprint detail. Modules 12–35 are
coverage reservations based on the owner's complete catalogue and must be
refined through later blueprint decisions; the wireframe queue does not silently
settle accounting, tax, payroll, manufacturing, or compliance policy.

## A. Shared entry and context

| Batch | Permanent screens | Current truth |
|---|---|---|
| `WF-01` | `NEX-WF-ENT-001` Sign in; `ENT-002` Company and role selection; `ENT-003` Role command centre; `ENT-004` My work and approvals; `ENT-005` Global search and command palette | MIXED |

## B. Complete 35-area queue

| Batch | Area | Permanent screens (2–6 per batch) | Current truth |
|---|---|---|---|
| `WF-02` | 01 Dashboard / Overview | `DSH-001` Executive command centre; `DSH-002` Finance manager dashboard; `DSH-003` Sales/procurement/stock dashboard switcher; `DSH-004` Project/service dashboard; `DSH-005` HR/production dashboard; `DSH-006` KPI drill-down and alert action | PARTIAL |
| `WF-03` | 02 Banking & Treasury | `BNK-001` Account balances; `BNK-002` Bank/cash account master; `BNK-003` Bank payment workbench; `BNK-004` Bank receipt workbench; `BNK-005` Account transfer | PARTIAL |
| `WF-04` | 02 Banking & Treasury | `BNK-006` Statement import; `BNK-007` Statement matching; `BNK-008` Bank reconciliation; `BNK-009` Bank charges; `BNK-010` Bank interest and FX revaluation | PLANNED |
| `WF-05` | 02 Banking & Treasury | `BNK-011` Cheques; `BNK-012` Post-dated cheques; `BNK-013` Deposit slips; `BNK-014` Bank guarantees; `BNK-015` Letters of credit; `BNK-016` Cash/treasury reports | PLANNED |
| `WF-06` | 03 Sales & Billing | `SAL-001` Quotation workspace; `SAL-002` Quotation editor; `SAL-003` Sales-order workspace; `SAL-004` Sales-order editor; `SAL-005` Pick/pack/delivery progress | PLANNED |
| `WF-07` | 03 Sales & Billing | `SAL-006` Invoice workspace; `SAL-007` Invoice editor and accounting preview; `SAL-008` Batch/recurring/proforma invoice launcher; `SAL-009` Credit/debit note; `SAL-010` Return; `SAL-011` Pricing and sales reports | PLANNED |
| `WF-08` | 04 Revenue Recognition | `REV-001` Revenue-contract workspace; `REV-002` Performance obligations; `REV-003` Transaction-price allocation; `REV-004` Evidence and fulfilment; `REV-005` Recognition schedule | PLANNED |
| `WF-09` | 04 Revenue Recognition | `REV-006` Recognition run; `REV-007` Exceptions and holds; `REV-008` Contract modification; `REV-009` Roll-forward/disclosure reports | PLANNED |
| `WF-10` | 05 Subscription & Recurring Billing | `SUB-001` Plan catalogue; `SUB-002` Versioned plan editor; `SUB-003` Subscription contract; `SUB-004` Amend/pause/cancel; `SUB-005` Usage ingestion and validation | PLANNED |
| `WF-11` | 05 Subscription & Recurring Billing | `SUB-006` Billing schedule; `SUB-007` Billing run; `SUB-008` Dunning/recovery; `SUB-009` Renewal and churn workspace; `SUB-010` MRR/ARR and cohort reports | PLANNED |
| `WF-12` | 06 Customers / Accounts Receivable | `AR-001` Customer financial profile; `AR-002` Credit-limit review; `AR-003` Open-item ledger; `AR-004` Customer receipt; `AR-005` Receipt/credit allocation | PLANNED |
| `WF-13` | 06 Customers / Accounts Receivable | `AR-006` AR ageing; `AR-007` Collections and disputes; `AR-008` Customer statement; `AR-009` Refund/write-off/allowance; `AR-010` AR-to-GL reconciliation | PLANNED |
| `WF-14` | 07 Purchases & Procurement | `PUR-001` Requisition workspace; `PUR-002` Requisition editor; `PUR-003` Requisition approval; `PUR-004` Budget/commitment check; `PUR-005` Request status and sourcing handoff | PARTIAL |
| `WF-15` | 07 Purchases & Procurement | `PUR-006` RFQ composer; `PUR-007` Supplier quotation capture; `PUR-008` Bid comparison; `PUR-009` Supplier evaluation; `PUR-010` Award recommendation | PLANNED |
| `WF-16` | 07 Purchases & Procurement | `PUR-011` Purchase-order workspace; `PUR-012` Purchase-order editor; `PUR-013` Purchase-order approval; `PUR-014` Gate inward; `PUR-015` Goods receipt; `PUR-016` Quality handoff | PARTIAL |
| `WF-17` | 07 Purchases & Procurement | `PUR-017` Service entry; `PUR-018` Purchase bill intake; `PUR-019` 2/3-way match; `PUR-020` Match exception review; `PUR-021` Supplier return; `PUR-022` Procurement reports | PARTIAL |
| `WF-18` | 08 Suppliers / Accounts Payable | `AP-001` Supplier financial profile; `AP-002` Supplier onboarding/KYC; `AP-003` Bank-detail verification; `AP-004` Payable bill; `AP-005` AP open-item ledger; `AP-006` Duplicate-bill review | PLANNED |
| `WF-19` | 08 Suppliers / Accounts Payable | `AP-007` Payment proposal; `AP-008` Payment request approval; `AP-009` Supplier advance/credit allocation; `AP-010` Holds and disputes; `AP-011` Supplier statement/ageing; `AP-012` AP-to-GL reconciliation | PLANNED |
| `WF-20` | 09 Inventory & Warehousing | `INV-001` Item master; `INV-002` Warehouse/location/bin master; `INV-003` Stock position; `INV-004` Stock ledger; `INV-005` Receipt movement trace | PARTIAL |
| `WF-21` | 09 Inventory & Warehousing | `INV-006` Reservation; `INV-007` Pick task; `INV-008` Pack/dispatch; `INV-009` Stock issue; `INV-010` Stock transfer; `INV-011` Replenishment | PLANNED |
| `WF-22` | 09 Inventory & Warehousing | `INV-012` Cycle count; `INV-013` Inventory adjustment; `INV-014` Batch/serial/expiry genealogy; `INV-015` Recall/quarantine; `INV-016` Valuation/revaluation; `INV-017` Inventory reports | PARTIAL |
| `WF-23` | 10 Costing & Landed Cost | `CST-001` Cost-policy setup; `CST-002` Landed-cost shipment; `CST-003` Charge capture; `CST-004` Allocation preview; `CST-005` Allocation approval/posting | PLANNED |
| `WF-24` | 10 Costing & Landed Cost | `CST-006` Item-cost history; `CST-007` Standard-cost version; `CST-008` Cost variance; `CST-009` Cost-to-GL reconciliation; `CST-010` Costing reports | PLANNED |
| `WF-25` | 11 Finance & Accounting | `FIN-001` Chart of Accounts; `FIN-002` Nominal-account detail; `FIN-003` Journal register; `FIN-004` Manual journal; `FIN-005` Journal approval/posting; `FIN-006` Reversal | PARTIAL |
| `WF-26` | 11 Finance & Accounting | `FIN-007` Accounting Event ledger; `FIN-008` General Ledger; `FIN-009` Fiscal periods; `FIN-010` Period-close workbench; `FIN-011` Recurring journals; `FIN-012` FX revaluation | PARTIAL |
| `WF-27` | 11 Finance & Accounting | `FIN-013` Intercompany transaction; `FIN-014` Consolidation workbench; `FIN-015` Trial Balance; `FIN-016` P&L/Balance Sheet/Cash Flow; `FIN-017` Finance drill-down; `FIN-018` Finance audit trail | PARTIAL |
| `WF-28` | 12 Taxation & Compliance | `TAX-001` Jurisdictions and registrations; `TAX-002` Tax-rule catalogue; `TAX-003` Tax-code editor; `TAX-004` Withholding setup; `TAX-005` Transaction tax preview; `TAX-006` Tax exception queue | PLANNED |
| `WF-29` | 12 Taxation & Compliance | `TAX-007` Return workbench; `TAX-008` Tax reconciliation; `TAX-009` E-invoice submission monitor; `TAX-010` Certificates and evidence; `TAX-011` Tax reports | PLANNED |
| `WF-30` | 13 Operations | `OPS-001` Daily operations board; `OPS-002` Operational work order; `OPS-003` Dispatch and assignment; `OPS-004` Checklist/execution capture | PLANNED |
| `WF-31` | 13 Operations | `OPS-005` Service completion/acceptance; `OPS-006` Exception/incident; `OPS-007` Shift/site handover; `OPS-008` Operations reports | PLANNED |
| `WF-32` | 14 Production / Manufacturing | `MFG-001` BOM catalogue; `MFG-002` Multi-level/versioned BOM editor; `MFG-003` Routing editor; `MFG-004` Work centres/machines; `MFG-005` Demand plan; `MFG-006` MRP run | PLANNED |
| `WF-33` | 14 Production / Manufacturing | `MFG-007` Material requirements; `MFG-008` Production-order workspace; `MFG-009` Production-order editor/release; `MFG-010` Material issue; `MFG-011` WIP tracking; `MFG-012` Production completion | PLANNED |
| `WF-34` | 14 Production / Manufacturing | `MFG-013` Scrap/by-product/rework; `MFG-014` Subcontracting; `MFG-015` Capacity planner; `MFG-016` Production costing/variance; `MFG-017` Production reports | PLANNED |
| `WF-35` | 15 Quality Management | `QMS-001` Quality plan/specification; `QMS-002` Inspection queue; `QMS-003` Inspection execution; `QMS-004` Quarantine/disposition; `QMS-005` Non-conformance | PLANNED |
| `WF-36` | 15 Quality Management | `QMS-006` CAPA; `QMS-007` Supplier quality; `QMS-008` Traceability/recall; `QMS-009` Quality approvals; `QMS-010` Quality reports | PLANNED |
| `WF-37` | 16 CRM | `CRM-001` Account/contact workspace; `CRM-002` Lead inbox; `CRM-003` Lead detail/qualification; `CRM-004` Opportunity pipeline; `CRM-005` Opportunity workbench | PLANNED |
| `WF-38` | 16 CRM | `CRM-006` Activity/timeline; `CRM-007` Proposal handoff; `CRM-008` Forecast; `CRM-009` CRM reports | PLANNED |
| `WF-39` | 17 Projects & Professional Services | `PRJ-001` Project portfolio; `PRJ-002` Project setup/contract; `PRJ-003` WBS and milestones; `PRJ-004` Project budget; `PRJ-005` Delivery board; `PRJ-006` Project status | PLANNED |
| `WF-40` | 17 Projects & Professional Services | `PRJ-007` Time/expense review; `PRJ-008` Milestone/T&M billing; `PRJ-009` Revenue and WIP; `PRJ-010` Project profitability; `PRJ-011` Project close; `PRJ-012` Project reports | PLANNED |
| `WF-41` | 18 Resource Management & Utilisation | `RES-001` Resource/skill profile; `RES-002` Capacity calendar; `RES-003` Allocation planner; `RES-004` Allocation request/approval | PLANNED |
| `WF-42` | 18 Resource Management & Utilisation | `RES-005` Utilisation and bench; `RES-006` Demand forecast; `RES-007` Timesheet capacity view; `RES-008` Resource reports | PLANNED |
| `WF-43` | 19 Helpdesk / Support / AMC | `HLP-001` Support dashboard; `HLP-002` Ticket queue; `HLP-003` Ticket workbench; `HLP-004` SLA/priority policy; `HLP-005` Knowledge search | PLANNED |
| `WF-44` | 19 Helpdesk / Support / AMC | `HLP-006` Support/AMC contract; `HLP-007` Entitlement consumption; `HLP-008` Renewal/escalation; `HLP-009` Support reports | PLANNED |
| `WF-45` | 20 HR & Payroll | `HRP-001` Employee directory; `HRP-002` Employee record; `HRP-003` Position/org chart; `HRP-004` Onboarding; `HRP-005` Attendance; `HRP-006` Leave request/approval | PLANNED |
| `WF-46` | 20 HR & Payroll | `HRP-007` Payroll setup; `HRP-008` Payroll input; `HRP-009` Payroll run; `HRP-010` Payroll validation/approval; `HRP-011` Payslip and payment handoff | PLANNED |
| `WF-47` | 20 HR & Payroll | `HRP-012` Loans/benefits/gratuity; `HRP-013` Statutory deductions; `HRP-014` Offboarding/final settlement; `HRP-015` Employee self-service; `HRP-016` HR/payroll reports | PLANNED |
| `WF-48` | 21 Fixed Assets & Leases | `AST-001` Asset class/policy; `AST-002` Asset register; `AST-003` Asset detail; `AST-004` Acquisition/CWIP; `AST-005` Capitalisation; `AST-006` Transfer/assignment | PLANNED |
| `WF-49` | 21 Fixed Assets & Leases | `AST-007` Depreciation run; `AST-008` Revaluation/impairment; `AST-009` Disposal; `AST-010` Lease register; `AST-011` Lease schedule/payment; `AST-012` Asset/lease reports | PLANNED |
| `WF-50` | 22 Expense Management | `EXP-001` Expense policy/category; `EXP-002` Expense inbox; `EXP-003` Claim editor; `EXP-004` Receipt capture/OCR review; `EXP-005` Mileage/per diem | PLANNED |
| `WF-51` | 22 Expense Management | `EXP-006` Expense approval; `EXP-007` Corporate-card matching; `EXP-008` Cash advance/settlement; `EXP-009` Reimbursement/accounting; `EXP-010` Expense reports | PLANNED |
| `WF-52` | 23 Document Management | `DOC-001` Document library; `DOC-002` Document detail/version; `DOC-003` Upload/classify/link; `DOC-004` Template catalogue | PLANNED |
| `WF-53` | 23 Document Management | `DOC-005` Access/share review; `DOC-006` Retention/legal hold; `DOC-007` Expiry/renewal queue; `DOC-008` Document audit/search | PLANNED |
| `WF-54` | 24 Budget & Planning | `BUD-001` Planning scenarios; `BUD-002` Budget model; `BUD-003` Dimensioned budget entry; `BUD-004` Import/spread; `BUD-005` Budget workflow | PARTIAL |
| `WF-55` | 24 Budget & Planning | `BUD-006` Forecast/reforecast; `BUD-007` Commitment control; `BUD-008` Budget availability; `BUD-009` Budget vs Actual; `BUD-010` Planning reports | PARTIAL |
| `WF-56` | 25 Reports & Analytics | `RPT-001` Report catalogue; `RPT-002` Report runner; `RPT-003` Report viewer; `RPT-004` Drill-down explorer; `RPT-005` Saved view/export | PARTIAL |
| `WF-57` | 25 Reports & Analytics | `RPT-006` Schedule/subscription; `RPT-007` Dashboard composer; `RPT-008` Metric definition/freshness; `RPT-009` Reporting administration | PARTIAL |
| `WF-58` | 26 Portals | `PRT-001` Customer portal home; `PRT-002` Customer invoices/payments; `PRT-003` Customer statement/dispute; `PRT-004` Customer support/projects | PLANNED |
| `WF-59` | 26 Portals | `PRT-005` Supplier portal home; `PRT-006` RFQ/quotation; `PRT-007` PO/receipt visibility; `PRT-008` Invoice/payment status | PLANNED |
| `WF-60` | 26 Portals | `PRT-009` Employee portal home; `PRT-010` Leave/attendance; `PRT-011` Expense/timesheet; `PRT-012` Payslip/documents | PLANNED |
| `WF-61` | 27 Administration & Multi-Tenancy | `ADM-001` Tenant directory; `ADM-002` Company/org structure; `ADM-003` User directory; `ADM-004` User detail/access; `ADM-005` Role and permission designer | PARTIAL |
| `WF-62` | 27 Administration & Multi-Tenancy | `ADM-006` Company-role assignments; `ADM-007` Access review; `ADM-008` Delegation/impersonation; `ADM-009` Security/session policy | PARTIAL |
| `WF-63` | 27 Administration & Multi-Tenancy | `ADM-010` Edition/entitlements; `ADM-011` Module visibility; `ADM-012` Demo environment/reset; `ADM-013` Administration audit | PARTIAL |
| `WF-64` | 28 System Configuration & Extensibility | `CFG-001` Configuration home; `CFG-002` Company/fiscal/currency setup; `CFG-003` Numbering sequences; `CFG-004` Dimensions; `CFG-005` Custom fields; `CFG-006` Validation/default rules | PARTIAL |
| `WF-65` | 28 System Configuration & Extensibility | `CFG-007` Module settings; `CFG-008` Localisation/language/RTL; `CFG-009` Feature flags/entitlements; `CFG-010` Form/view configuration; `CFG-011` Configuration versions; `CFG-012` Change impact/audit | PARTIAL |
| `WF-66` | 29 Workflow / Approvals / SoD | `WFL-001` My approvals; `WFL-002` Approval detail; `WFL-003` Workflow definitions; `WFL-004` Approval-matrix editor; `WFL-005` Threshold/routing simulation; `WFL-006` SoD policy | PARTIAL |
| `WF-67` | 29 Workflow / Approvals / SoD | `WFL-007` Delegation/out-of-office; `WFL-008` Escalations; `WFL-009` Workflow monitor; `WFL-010` Failed/stuck instance; `WFL-011` Workflow audit/reports | PARTIAL |
| `WF-68` | 30 Notifications | `NTF-001` Notification centre; `NTF-002` Notification detail/action; `NTF-003` User preferences; `NTF-004` Digest/inbox | PLANNED |
| `WF-69` | 30 Notifications | `NTF-005` Template editor; `NTF-006` Event/routing rules; `NTF-007` Delivery log/retry; `NTF-008` Channel/escalation setup | PLANNED |
| `WF-70` | 31 Integrations | `INT-001` Integration catalogue; `INT-002` Connection setup; `INT-003` API client/scopes; `INT-004` Webhook subscription; `INT-005` Data mapping; `INT-006` Connection test | PLANNED |
| `WF-71` | 31 Integrations | `INT-007` Integration runs; `INT-008` Message/event detail; `INT-009` Error/retry/dead-letter queue; `INT-010` Secret/credential rotation; `INT-011` Usage/rate limits; `INT-012` Integration monitoring/audit | PLANNED |
| `WF-72` | 32 AI Assistant | `AIA-001` Contextual assistant panel; `AIA-002` Suggestion review; `AIA-003` Document extraction review; `AIA-004` Explanation/forecast; `AIA-005` Human approval handoff | PLANNED |
| `WF-73` | 32 AI Assistant | `AIA-006` AI automation catalogue; `AIA-007` Model/policy configuration; `AIA-008` Source/confidence viewer; `AIA-009` AI evaluation/feedback; `AIA-010` AI audit and usage | PLANNED |
| `WF-74` | 33 Audit & Compliance | `AUD-001` Audit explorer; `AUD-002` Audit event detail; `AUD-003` Transaction history; `AUD-004` Login/session audit; `AUD-005` Permission/access audit | PARTIAL |
| `WF-75` | 33 Audit & Compliance | `AUD-006` Master-data change review; `AUD-007` Approval evidence; `AUD-008` Compliance evidence pack; `AUD-009` Retention/legal hold; `AUD-010` Control exceptions/alerts | PARTIAL |
| `WF-76` | 34 Data Migration & Cutover | `MIG-001` Migration project; `MIG-002` Object/template catalogue; `MIG-003` File upload/profile; `MIG-004` Field mapping; `MIG-005` Validation/dry run; `MIG-006` Error correction | PLANNED |
| `WF-77` | 34 Data Migration & Cutover | `MIG-007` Load monitor; `MIG-008` Reconciliation; `MIG-009` Sign-off; `MIG-010` Cutover/freeze plan; `MIG-011` Parallel run/rollback; `MIG-012` Hypercare dashboard | PLANNED |
| `WF-78` | 35 Mobile | `MOB-001` Mobile home; `MOB-002` Mobile approvals; `MOB-003` Barcode/QR scan; `MOB-004` Receive/move/count stock; `MOB-005` Expense capture; `MOB-006` Timesheet | PLANNED |
| `WF-79` | 35 Mobile | `MOB-007` Leave/attendance; `MOB-008` Field-service task; `MOB-009` Customer/supplier lookup; `MOB-010` Mobile notifications; `MOB-011` Offline queue/conflict; `MOB-012` Mobile security/settings | PLANNED |

## C. Cross-module validation batches

These batches do not invent duplicate transaction screens. They assemble the
approved module screens into end-to-end journey views and verify hand-offs,
exceptions, accounting, reporting, and audit.

| Batch | Journey | Validation screens | Current truth |
|---|---|---|---|
| `WF-80` | Purchase-to-pay | `XFL-P2P-001` Journey map; `002` Approval/match exceptions; `003` Receipt-to-bill trace; `004` AP/payment/reconciliation trace; `005` GL/report/audit proof | PARTIAL |
| `WF-81` | Order-to-cash | `XFL-O2C-001` Journey map; `002` Credit/availability exceptions; `003` Delivery-to-invoice trace; `004` AR/receipt/reconciliation trace; `005` GL/report/audit proof | PLANNED |
| `WF-82` | Service project-to-cash | `XFL-SVC-001` Lead-to-contract; `002` Project/resource delivery; `003` Time/expense/evidence; `004` Revenue/billing/receipt; `005` Profitability/audit | PLANNED |
| `WF-83` | Plan-to-produce | `XFL-MFG-001` Demand/MRP; `002` Procurement/receipt; `003` Issue/WIP/quality; `004` completion/warehouse/delivery; `005` costing/GL/report | PLANNED |
| `WF-84` | Record-to-report | `XFL-R2R-001` Source-event monitor; `002` Journal control; `003` Subledger/GL reconciliation; `004` period close; `005` statements/drill-down/audit | PARTIAL |
| `WF-85` | Hire-to-retire/pay | `XFL-HR-001` Hire/onboard; `002` time/leave; `003` payroll approval; `004` payment/accounting; `005` exit/final settlement/audit | PLANNED |
| `WF-86` | Asset and lease lifecycle | `XFL-AST-001` Acquire/CWIP; `002` capitalise/depreciate; `003` transfer/revalue; `004` lease/payment; `005` dispose/report/audit | PLANNED |
| `WF-87` | Subscription lifecycle | `XFL-SUB-001` Quote/contract; `002` usage/billing; `003` receivable/payment; `004` recognition; `005` amend/renew/churn/report | PLANNED |
| `WF-88` | Governed decision trace | `XFL-GOV-001` Budget-to-approval; `002` tax-to-filing; `003` document-to-evidence; `004` AI suggestion-to-human decision; `005` access/audit review | MIXED |

## Coverage totals

- Shared entry screens: 5
- Module screen specifications: 402
- Cross-module validation screens: 45
- Total planned specifications: **452**
- Production batches: **88** (`WF-01` through `WF-88`)

The count is a traceability device, not a product-quality target. Batches may
merge modes inside an approved screen but must not drop a user job, controlled
decision, accounting hand-off, or audit proof without an owner-approved change
to this inventory.
