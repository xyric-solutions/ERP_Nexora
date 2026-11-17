# Purchase payments, Bank posting and connected reports

Status: Owner-approved design implemented and verified on 18 November 2026.
The local business database and port 3000/4000 services remain on the prior
release pending the renewed release-scope clarification. Existing payments have
not been posted. Finance permissions and explicit supplier links remain setup
prerequisites; this work does not grant roles or create supplier master records.

## Confirmed incident

Read-only authenticated checks in the main company found PAY-004, dated
18 November, approved for USD 10 against BILL-004 and selecting Js Bank (USD).
Its evidence contains created, submit and approve only. Procurement options
explicitly return `execution_mode: instruction_only`; Purchase approval reserves
bill allocations without calling Finance posting. The Bank payment directory is
empty. The other three approved Purchase payment instructions have the same
commercial lifecycle. No record was posted or altered during this audit.

The Finance AP workspace, General Ledger and Trial Balance APIs return 403 for
this account. That does not establish that no AP operations exist: their state
cannot be inspected with the current financial permissions. The seven Purchase
report routes and five Banking report routes fall through to prototype report
rows. Supplier Statement/Ageing and company GL/TB/P&L/Balance Sheet already route
to live Finance APIs; other supplier reports still use prototype rows.

Private evidence: `tmp/purchase-bank-integration/audit.json`. Preserve the existing
login, FY 1 July 2026-30 June 2027 and the owner's prior decision to open all
twelve months.

## Approach and alternatives

Use a source-linked bridge into the existing Finance AP/posting services and
read-only projections for reports. This preserves one financial source of truth
and retains the current draft/submit/independent-approval/post controls.

A separate generic Bank voucher is insufficient: it can move cash without
settling supplier open items and can duplicate a later AP settlement. Replacing
all posting modules would introduce unnecessary migration and regression risk.
Neither alternative is the proposed implementation.

## Posting connection

1. An approved Purchase Bill prepares one linked AP recognition draft. Reuse a
   posted AP item already linked by the exact company/source-document identity;
   never recognize the same bill twice. Resolve the real supplier financial party,
   currency, due date, discounted line amounts, charges, taxes and explicit
   nominal mappings through existing services. Missing setup is a visible blocker.
2. An approved single- or multi-supplier Purchase Payment prepares a linked
   settlement group containing its supplier allocations. Bill recognition must
   be posted first. Preparation is non-posting and returns the existing group on
   a safe retry; it does not silently create unapproved invoice accounting.
3. Show the linked financial draft, approval status, posting blocker and journal
   in the existing Purchase form/detail and flow. One contextual accounting action
   opens the existing Finance review steps. Avoid a duplicate payment-entry form.
4. Retain independent Finance approval. A Purchase self-approval permission does
   not satisfy the AP database's maker/checker constraint. Posting requires the
   actual Finance approval/post permissions and current company authority, even
   when initiated from Purchases. Missing permissions remain explicit blockers.
5. Posting writes the AP item events, one balanced Finance journal, durable source
   links and audit evidence in one database transaction. The selected Bank nominal
   is credited in its native currency. Bank balances read that posted journal;
   the application never writes a displayed balance directly.
6. Draft, submitted or merely Purchase-approved instructions do not reduce cash
   or mark a bill paid. Expose commercial approval, reserved amount, actual
   settlement, outstanding amount and financial posting state separately.
7. Reversal creates a linked compensating operation through existing Finance
   authority, restores the appropriate outstanding/advance amounts and preserves
   dated history. Use the posted journal's native-currency amount for cash effects.

Posting records an ERP accounting movement. It does not initiate an external
bank transfer. Imported bank statements remain separate external evidence and
are reconciled through the existing matching workflow.

## Amounts, batches and concurrency

- Reuse integer/decimal helpers and server-side calculations. Per supplier let G
  be gross entered payment, A gross bill allocations, D settlement discounts and W
  calculated withholding plus additional withholding. Cash paid is G-W, subject
  to the existing precision and nonnegative constraints. AP cleared is A+D;
  any G-A is an explicitly classified supplier advance, not an unexplained offset.
- Governed accounts are required for AP control, settlement discounts, advances,
  withholding, bank fees and FX/rounding where relevant. Do not guess accounts or
  statutory tax rates. Validate transaction-entered withholding snapshots against
  the configured accounting/tax treatment and prevent withholding twice on an
  invoice already taxed at recognition. Block incompatible legacy instructions
  with a precise setup/review message instead of silently changing their amounts.
- Reuse historical-rate and settlement FX calculations from Finance. Currency
  conversion needs real rate/deal evidence. Fees entered through the existing
  settlement controls affect the actual Bank credit and governed expense account;
  no fee is inferred from a Purchase instruction that does not record one.
- A multi-supplier instruction has one immutable group identity, supplier-level
  financial previews and an aggregate balanced posting. Extend shared settlement
  preparation to support grouped posting rather than posting suppliers in separate
  HTTP transactions. Prepare/approve/post/reverse the group atomically; a failed
  supplier leaves every supplier and cash unchanged.
- Group snapshots include source versions, bill/item balances, Bank identity,
  mappings, currency/rate/tax evidence and the complete supplier calculation.
  Approval/posting revalidate these snapshots. Stale evidence requires refreshed
  review, not silent recalculation after approval.
- Add additive, tenant/company-scoped source/group/allocation links and database
  uniqueness constraints. Lock source instructions and affected open items in a
  consistent order. Retain version preconditions, idempotency fingerprints and
  outbox/audit transaction boundaries; another key must not bypass source uniqueness.
- Bill availability must account for actual posted settlements and other active
  instruction reservations without counting the same posted instruction twice.
  Rejections, cancellations and reversals release/reinstate the correct amounts.

## Banking visibility and reports

Expose source-owned Purchase payments in a read-only outgoing-movement projection
alongside native Bank vouchers. Include source type/id, Bank, supplier, gross/net,
currency, state and posted journal references. Native Bank actions remain attached
to native vouchers; Purchase entries open their owner workflow. Never insert a
second generic Bank voucher to make the same cash movement visible.

Reconciliation already reads posted Bank journal lines. Preserve that source,
carry usable Purchase references into the posting evidence and verify matching
and reversal behaviour. Do not fabricate imported statement lines or auto-confirm
matches. Book activity and imported statements must remain distinguishable.

Implement real, authorized adapters for all current Banking, Purchase and Supplier
report routes, retaining their existing navigation:

| Routes | Persistent source and required behaviour |
| --- | --- |
| Bank Account Activity; Bank & Cash Balance Summary; Daily Cash Position | Posted ledger lines with dated opening/movement/closing balances, Bank/native-currency grouping, source/journal drill-down and separately identified reversals. |
| Bank Reconciliation Status; Unmatched Statement Transactions | Existing reconciliation, finalized imports and actual match/disposition records; external statement balances are not generated from the ERP ledger. |
| Purchase Requisition Status; RFQ & Supplier Quotation Comparison; Purchase Order Details | Real requisition/RFQ/order records, lines, suppliers, lifecycle and persisted response/pricing evidence. Unrecorded quotations are shown as unrecorded. |
| GRN & Pending Receipt Report | Approved order quantities and actual operational receipt consumption; do not label an operational receipt as stock-ledger posting. |
| Purchase Bill Details | Real Bill totals, tax/discount/charge breakdown, sources, AP recognition status, settled/reserved/outstanding values and linked payment/journal references. |
| Purchase Price Variance; Three-way Match Exceptions | Source-linked order/receipt/bill quantities, UOM conversion snapshots and comparable net pricing; show missing source/receipt or insufficient comparable evidence explicitly. |
| Supplier Statement; Supplier Payments Outstanding; Payables Ageing by Supplier; Supplier Advances & Deposits | Existing dated AP item/event aggregates and financial-party links. Use posted activity for financial amounts; show approved but unrecognized Bills/instructions separately. Preserve the existing live statement/ageing routes. |
| Supplier Delivery & Quality Performance | Persisted promised/receipt dates and recorded quantity evidence. Quality scores/inspection outcomes remain unavailable where no real quality records exist; no sample score or inferred pass rate. |

The existing General Ledger, Trial Balance, Profit & Loss and Balance Sheet must
reflect the same posted entries through their shared Finance queries. They do
not need independent balance-writing logic. Withholding reports use recorded
governed tax applications, not the Purchase UI's ad-hoc percentage alone.

Every report uses authenticated company scope, server-side bounded filtering and
aggregation before pagination, real fiscal dates, explicit as-of/from/to filters,
consistent currency precision and governed presentation conversion. Preserve
opening balances and reversal history in dated reports. Do not sum different
currencies without an explicit translation basis. CSV/print and source drill-down
must use the same filters and totals, with safe CSV text escaping.

Remove fixture rows/KPIs for the affected reports. Empty, denied, missing-setup
and missing-evidence states must be accurate. A successful post refreshes affected
Purchase/Bank data; returning to a report reads fresh data without a new Refresh
button or a separate workflow. Keep the existing compact ERP controls and theme.

## Permissions, setup and existing records

- Reuse the existing company-scoped Finance read/manage/approve/post/report
  permissions and appropriate Purchase/Bank read authority. Report-only reads
  must not require financial posting authority. Document the exact permission
  requirements on the existing administration/setup surface.
- The current 403 responses are not fixed by disabling authorization or silently
  granting a global role. A company administrator assigns the required financial
  roles and an independent approver through the normal administration workflow.
  Account policy/tax/advance mappings are explicitly configured and validated;
  implementation does not select ledger accounts from names or numeric guesses.
- Surface these setup prerequisites inside Purchases so an instruction cannot
  appear paid while its financial preparation or posting is unavailable.
- Deployment does not post PAY-001 through PAY-004, recognize historical Bills,
  replay instructions, change fiscal periods or rewrite existing journals. Each
  existing record gets a source-link/status reconciliation check and an explicit
  normal review/post action. Never infer prior settlement from a reference alone.

## Delivery and live activation

Deliver in two coherent batches under this design: (1) source-linked recognition,
settlement and Bank visibility with financial report reconciliation; (2) the full
Banking/Purchase/Supplier report adapters and exports. Both batches are required;
do not describe the whole request as complete after only the first.

Use `packages/contracts`, generated clients/OpenAPI and the independent API,
with additive migrations in `packages/db`. Reuse the shared Finance posting
boundary and existing report/Bank projections; do not create Next API duplicates.
Keep new report queries and grouping helpers within their owning features.

The recovered live service retains Procurement 5 and Fixed Assets 2; current
tracked AP recognition also has approved Purchase-adjustment/asset-registration
dependencies. Test and enumerate the exact required migration chain, including
Procurement 6 and Fixed Assets 3-7 where that tracked dependency is activated,
before replacing the compatible API. No startup auto-migrations or accidental
latest-API launch against the older schema are allowed.

Proposed live rollout authorization includes a private local database
backup under this repository's ignored `tmp/backups`, restore verification in a
disposable local database, the verified required migrations and controlled API/web
activation. It does not authorize external transfer of the backup or financial
posting of the owner's existing records. Preserve the established protected local
configuration, unchanged credentials and a tested code/database recovery plan;
retain additive business evidence when rolling back code.

## Acceptance and verification

- Disposable end-to-end cases: approved Purchase Bill -> one AP item -> approved
  financial settlement -> exactly one Bank credit and AP reduction -> matching
  statements/GL/TB and source drill-down. Repeat with a source-linked existing AP
  Bill, partial payment, discounts, withholding, advance, fees and multiple suppliers.
- Verify USD 10 without withholding reduces cash by 10; USD 10 with approved 10%
  withholding reduces cash by 9 and records withholding of 1. These are synthetic
  test cases, not authority to post PAY-003/PAY-004 or adopt a statutory rate.
- Test concurrent allocations, duplicate keys/new-key duplicate attempts, uncertain
  responses, snapshot changes, grouped partial-failure rollback, reversal and
  as-of opening/closing balances. Include USD/PKR separation, FX, July/June and
  local calendar dates under UTC and Asia/Karachi.
- Test denied/expired role authority, maker/checker, company/tenant isolation,
  closed periods, inactive Banks, missing policy/tax mappings and forbidden
  attempts to use a generic voucher to settle the same source.
- Cover all seventeen report routes with real disposable data, pagination,
  aggregates, CSV/print, missing evidence and zero fixture fallback. Bank ledger
  activity, source-owned payment visibility and reconciliation candidates must
  agree without creating an imported statement transaction.
- Run contracts, appropriate unit/API/integration/security tests, typecheck,
  touched-file lint, production builds, theme audit write/check and responsive
  light/dark accessibility checks. Update existing architecture/startup docs and
  push verified changes to `shoaib_nexora`.
- Before calling it live, verify the actual migration versions, unchanged owner
  records/credentials/fiscal periods, authorized setup readiness and all relevant
  report APIs. Report missing administrator configuration honestly; do not claim
  a payment is posted until its persisted journal and ledger effect are verified.
