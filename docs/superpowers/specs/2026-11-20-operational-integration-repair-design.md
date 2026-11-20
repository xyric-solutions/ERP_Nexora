# Supplier payments, Sales and manufacturing integration repair

Date: 20 November 2026. Baseline: `ae182eb`.

The owner requested repairs after PAY-005 did not change cash, Sales displayed
sample products, and approved MO-001 did not produce stock available to Sales.
The owner will create fresh records after the connections are ready. Preserve
all current records; do not post or reclassify the existing queue automatically.

## Authorization and current scope

The existing approved [AP/AR design](2026-11-19-ap-ar-readiness-design.md) and
[purchase posting design](2026-11-18-purchase-bank-reporting-integration-design.md)
authorize repairing the existing source-linked Finance path and its explicit
setup. Increment 1 below implements corrections to that path.

The owner approved this written design and increments 2 and 3 on 20 November
2026 after increment 1 was committed as `18b1b24`. These increments introduce
persistent commercial Sales and stock posting. Earlier financial tests did not
cover these missing paths. Design approval does not approve financial settings
or authorize live postings.

## Confirmed evidence

The 20 November read-only PostgreSQL review executed 85 scoped audit queries
with `transaction_read_only=on`, without business mutations. Private artifacts:
`tmp/integration-repair-20261120/`. It confirmed:

- Main company R06-UAT: 338 chart accounts, 2 procurement suppliers, 34 purchase
  documents, 4 banks and 3 posted journals. No company subledger policy, financial
  party/configuration, financial open item, or bill/payment financial operation.
- BILL-005 and PAY-005 are approved for USD 3,500. Neither has a financial
  operation or journal. Purchase approval alone is intentionally non-posting.
- The 19 November scoped manufacturing read found approved MO-001 for 45 Kg of
  PRD-002, Chicken Biryani. The product is active and enabled for Sales and
  Manufacturing. Approval does not record actual consumption or output.
- Sales quotations/orders/delivery/recurring documents remain session prototypes
  using a fixed catalogue. Normal financial customer/invoice/receipt routes use
  Finance APIs, but have no commercial product/stock linkage.
- Inventory currently stores masters and opening plans, not a posted quantity or
  valuation ledger. Do not infer stock from planned quantities or product cost.
- Purchase's operational accounting route hides the control-account policy form.
  Opening an unlinked source bill also invokes a financial-party creation command
  implicitly. Both contradict explicit, reviewable financial setup.

## Approach

Extend the existing API/domain boundaries, canonical masters, FinancePostingService,
accounting events, permissions and audit model. This is the recommended approach
because each financial effect retains one posting authority and one source.

Two alternatives were considered: configuring only the current UI cannot create
missing Sales/stock persistence; introducing independent Sales/Manufacturing
journals or treating commercial approval as payment would duplicate accounting
and break the existing approval boundary. Neither solves the reported problem.

## Increment 1: usable governed supplier accounting

Show missing company policy and the specific unlinked supplier count before an
instruction can be prepared. Check every supplier in a batch. On failed reads,
show retry and retain a disabled preparation action. Keep existing linked
operations reviewable even when today's settings have changed.

Provide a contextual route from the approved Purchase bill/payment to the
existing full Accounting setup. Reuse its supplier directory/adoption, versioned
terms and eight-account policy forms. Do not copy forms or infer account IDs.
Opening a source document must remain read-only; supplier adoption is explicit.

Retain the source-linked workflow:

1. Approved bill -> explicit Finance preparation -> submission -> independent
   approval -> posting -> AP item and balanced journal.
2. Approved payment instruction -> explicit Finance preparation -> submission ->
   independent approval -> posting -> AP settlement and selected bank credit.
3. Reversal -> compensating journal and dated AP/cash events; preserve history.

No displayed balance is changed directly. A final posting failure changes
neither cash nor AP. Preserve all server-side authorization, idempotency,
dimensions, precision, period, currency, source-version and stale-review checks.

## Increment 2: stock foundation and actual production

This implements the necessary subset of the existing
[Inventory design](../../business/procurement-inventory-design.md) and
[Manufacturing design](../../business/manufacturing-vertical-design.md).

- Retain existing product, warehouse, location, UOM, supplier, BOM, plan and order
  identities. Add only the missing persistent movement, valuation configuration,
  source/approval and costing evidence; no parallel product or journal master.
- Use an append-only quantity/value ledger scoped by tenant/company/product/
  warehouse and applicable tracking identity. Derive available quantities and
  valuation from posted events, not opening plans or approved order quantities.
- Support the documented FIFO and weighted-average choices through explicit
  reviewed configuration. Do not select a live valuation method by default.
  Store exact quantity/value arithmetic and deterministic residual allocation.
- Post actual purchase receipts through source-linked stock movements and central
  accounting events. Use reviewed inventory/accrual/clearing mappings and ensure
  the later AP bill clears receipt accrual instead of expensing inventory twice.
  Service bills retain their existing path. Unlinked legacy goods bills need an
  explicit reviewed disposition; do not silently reinterpret them.
- Require explicit reviewed opening-stock quantities, values and dates before
  they become stock. Existing opening plans remain unposted. Transfers retain
  equal source/destination quantities and value; account for warehouse/company
  boundaries explicitly.
- Retain manufacturing approval as authorization to produce. Introduce explicit
  actual issue/completion commands with actual quantities, source warehouse,
  destination warehouse, date and governed cost evidence. Snapshot the applicable
  BOM revision and UOM conversions. Incomplete/BOM-free old orders require reviewed
  actual consumption before completion; never manufacture a recipe retroactively.
- Consumption reduces component stock and moves cost into governed WIP.
  Completion relieves evidenced WIP into finished goods for the actual accepted
  output. Partial completions cannot exceed released quantities or consume the
  same material twice. No unexplained overhead, yield, scrap, tax or zero cost.
- Enforce negative-stock prevention, locks in consistent key order, independent
  approval/posting authority, exact-once source identity and atomic stock/GL/audit
  effects. Serialize competing issues. Stock reversals compensate the exact
  original quantities and values, including downstream-consumption restrictions.

No current manufacturing order becomes completed automatically. No historic
purchase receipt, opening plan or stock transfer is backfilled into the ledger.
Tracking modes required by a product must be validated server-side; unavailable
lot/serial/expiry evidence blocks its movement rather than discarding tracking.

## Increment 3: persistent commercial Sales and stock linkage

Retain the approved [Sales layout and workflow](../../architecture/sales-simplified-workflow.md),
but replace its normal-route session store with authorized versioned APIs.
Any retained demonstration route must be explicitly isolated and labelled; no
sample records, prices, banks, warehouses or tax percentages enter normal forms.

- Reuse financial/canonical customer identities, reviewed credit/terms, company
  currencies, master projects/locations, real banks and shared product/UOM data.
  Sales product search queries active sales-enabled company products. A product
  is searchable independently of stock; its availability is a separate posted-
  stock projection. Manufactured and purchased goods use the same product IDs.
- Persist quotation, order, delivery, invoice source and recurring-template
  evidence behind `server/api` and shared contracts. Persist source-line links,
  exact amounts, UOM and pricing/tax snapshots with bounded queries and stable
  server-reserved codes. Do not repurpose procurement records as Sales records.
- Preserve optional commercial quotation approval and existing order/delivery
  actions. Financial invoice approval remains independent. Enforce quantity
  consumption and prevent double delivery, invoicing, receipt or return.
- Posted delivery reduces the selected warehouse's stock and centrally records
  governed COGS/inventory effects. Invoice recognition records AR/revenue/tax once
  using its real product accounts and governed tax treatment; it must not issue
  stock a second time. Handle ordered-versus-delivered invoice policies explicitly.
- Customer receipts use existing settlements and the selected real bank. They
  settle the same posted AR items consumed by aging, statements, trial balance
  and reconciliation. Sales returns/credits link the original quantities, stock
  cost and AR recognition; a credit does not silently claim physical return.
- Recurring invoices require an explicit enabled template and idempotency by
  template/customer/period. No new automatic job runs against current business
  data merely because this release is activated.

## Configuration and release gates

Software can be verified in disposable PostgreSQL while live values remain
unapproved. Provide the existing or extended governed setup forms and a
readiness register for:

- Company identity, functional/transaction currencies, fiscal periods and rates.
- Eight eligible distinct control/revenue/expense/FX policy mappings.
- Existing supplier adoption and terms; real customer terms and finite credit.
- Product stock/income/expense accounts, real warehouses and UOM conversions.
- Inventory valuation, receipt accrual/clearing, WIP, COGS and variance mappings.
- Governed tax definitions and source recognition/settlement treatment.
- Reviewed stock opening/cutover and independent maker/checker/poster authority.

Do not activate inactive accounts, retype FX accounts, invent customer credit,
choose statutory rates, or approve opening/valuation values automatically.
Keep readiness checks distinct from business approvals. User creation of new
records after release is not authorization to post the old queue.

Use additive migrations in `packages/db`, tenant/company FKs, RLS, targeted grants,
immutable posted evidence and unique source keys. Rehearse on a restored copy,
verify migration replay and compare original table fingerprints and native/base
balances. Activate matched database/API/web versions only after verification.

## Required acceptance evidence

Implement and test increments sequentially. For each increment run focused unit,
contract, PostgreSQL, permission and frontend tests, then type/build/theme checks.
Use real authenticated APIs and disposable PostgreSQL for financial journeys;
mocked frontend responses alone cannot establish integration.

Required end-to-end scenarios:

1. Fresh supplier -> actual goods receipt -> AP bill -> independent posting ->
   payment -> selected bank decrease -> reconciliation; no duplicate stock cost.
2. Posted components -> actual production consumption -> partial/final completion
   -> available finished stock -> Sales product search -> order -> delivery ->
   invoice -> independent posting -> receipt -> bank increase -> reconciliation.
3. Service-only Sales/AP paths without stock; partial payments, discounts,
   advances, governed withholding, tax, foreign currency and exchange differences.
4. Credit/debit/physical-return distinctions; controlled reversals and preserved
   source history. Reconcile AP/AR controls, stock quantity/value, WIP, COGS, bank,
   trial balance, GL, aging and financial statements using independent SQL.
5. Reload persistence, forbidden/wrong-company requests, stale source/config,
   duplicate retries, concurrent issues/completions and immutable audit evidence.

Owner business acceptance and go-live remain pending actual approved setup and
owner-authorized authenticated business journeys, even if isolated tests pass.
