# Flexible Purchase cycle and order amendments

Status: Proposed for owner review. Implementation has not started.

## Outcome

Support these routes in the existing Purchase workspace:

1. Purchase Request -> RFQ -> Purchase Order -> Receive Products -> Bill.
2. Purchase Request -> Purchase Order -> Receive Products -> Bill.
3. Direct Purchase Order -> Receive Products -> Bill.

Every document retains its existing save, submit, approval, permissions and audit
requirements. Continue opens the next document with inherited values; it does
not approve or post subsequent documents automatically. Purchase Order approval
authorizes purchasing; financial posting remains the existing separate process.

## Findings

- The source directory already permits orders from requests or RFQs, but API
  validation requires a source for every non-request product document.
- Product selection, line creation and approver selection are currently oriented
  around requests. Orders cannot independently select all their own terms.
- The API requires source-line identity, product/unit matching and quantities
  within the request/RFQ limits, including aggregate orders across RFQs. This
  prevents an order quantity of 14 when its request quantity was 12.
- Both UI and API permit edits only in draft/rejected states. The database
  additionally makes submitted terms and approved documents immutable.
- The flow endpoint accepts only a request root, and the flow header requires
  an RFQ for order creation even though the order source directory allows a
  request. Receipts and bills correctly match against approved orders.
- Receipt approval records an operational receipt. This change does not add a
  stock-ledger posting service or change the existing accounting integration.

## Approaches

**Recommended: flexible order preparation plus governed amendments.** Allow
direct orders and independently editable order terms. For submitted orders,
withdraw the submission before editing. For approved orders, prepare and approve
an amendment while retaining the last approved terms until replacement approval.
This meets the requested editing scope while retaining downstream evidence.

**Alternative: draft-only flexibility.** Add direct orders and editable draft
lines, but keep submitted/approved orders read-only. This is smaller but does not
meet the request to edit orders at any stage.

## Order preparation

- Reuse the current Purchase Document Form and real product, supplier, unit,
  currency, tax and approver directories. Add no duplicate purchasing screen.
- Make an approved request/RFQ source optional for orders. A direct order starts
  with one blank line and allows the same single product/service selector as a
  request. Source selection copies values into an editable order draft.
- Permit adding/removing lines and changing products, quantities, units, prices,
  tax, discounts, charges, supplier, currency, dates, reference and notes, subject
  to the existing company directory, tax, currency and amount validation.
- A source is provenance for an order, rather than a hard quantity ceiling. For
  example, an inherited quantity of 12 can become 14 without changing the
  original request or RFQ. Approval reviews the actual order terms and total.
- Retain source-line provenance on unchanged items. Changing an inherited
  product/unit clears that line association; newly added lines have no source
  line. The document's request/RFQ link remains visible in the flow/history.
- Display order differences from the source, including added/removed items,
  supplier/currency changes, quantities and prices. Do not silently discard the
  originating document or masquerade a substituted item as its original line.
- Preserve inherited approver rules for linked orders. A direct order selects
  an eligible company approver; descendants inherit its approval assignment.
- The approved order becomes the authoritative quantity, item, pricing and tax
  source for receipts and bills. Existing over-receipt and received-before-bill
  checks remain server enforced, including concurrent partial deliveries.

## Editing submitted and approved orders

- Draft/rejected: edit in place under existing version checks and permissions.
- Submitted: expose Edit Order through an explicit withdraw-to-draft action
  with a reason. Close the pending approval instance and invalidate the previous
  review. Resubmission creates a fresh approval attempt. Reject stale decisions.
- Approved: expose Amend Order in the same form. Save proposed terms separately
  from the effective approved order, with base version, reason, actor, version,
  stable line identities and before/after evidence. One pending amendment per
  order. Allow draft amendment save, submit, reject, cancel and approval.
- Keep the approved order usable while an amendment awaits approval. Apply an
  approved amendment atomically under the same order/company lock used by
  downstream mutations. Revalidate effective order version, receipts, bills and
  pending downstream drafts before replacing effective terms. If the baseline
  changed, require refresh and renewed review rather than silently rebasing.
- Retain the order ID/code and approved revision snapshots. The database's
  approved-record guard must permit only the audited amendment transition;
  ordinary updates to final documents remain rejected.
- Preserve products, units, prices, taxes and consumed discount/charge amounts
  already represented by approved receipts or bills. Never remove a consumed
  line or reduce its quantity below received/billed commitments. Preserve
  supplier/currency once downstream obligations exist. Remaining quantities,
  new unconsumed lines and permissible future terms may be amended.
- Do not redistribute previously consumed discount/charge cents. Reconcile the
  proposed remaining allocation using persisted consumption; reject an amendment
  that cannot preserve prior evidence and exact totals. Existing downstream
  drafts must refresh/revalidate before approval after an amendment.
- Correcting goods or values already received/billed uses existing returns,
  credits or reversal workflows. Posted receipts, bills, journals, asset costs
  and their audit evidence are never rewritten by an order amendment.
- Approval retains maker/checker and existing self-approval/override authority.
  Amendment makers count as preparers; editing never grants approval rights.
  Cancelled orders remain terminal and retain their history.

## Integration boundaries

- Keep server-side orchestration in Procurement services/repositories and add
  explicit versioned withdraw/amendment API contracts under `/api/v1`. Update
  shared schemas, generated client and OpenAPI together. Do not overload an
  ordinary save to bypass the existing state guard.
- Use additive database migrations for amendment persistence, effective revision
  evidence and narrowly scoped lifecycle transitions. Preserve historical
  documents, existing RLS, foreign keys and immutable audit records.
- Generalize the flow root to request or direct order with a backward-compatible
  root-kind field. Show request/RFQ as optional or skipped where appropriate;
  do not create placeholder documents. Make request-to-order creation available
  from the existing flow header. Retain pagination and tenant/company scope.
- Receipts continue referencing the effective order and its stable line IDs;
  bills continue matching approved receipts through that order. Capture the
  effective revision used, preserving historical matching evidence.
- All writes use permission checks, optimistic versions, idempotency and audited
  transaction boundaries. Coordinate amendment approval and receipt/bill approval
  on the same order lock to prevent stale consumption checks.
- Keep integer decimal calculations, tax snapshots, unit conversions and the
  existing AP accounting integration authoritative on the server.

## Verification and delivery

- Unit/form coverage: direct order product/supplier/currency/approver selection;
  request and RFQ inheritance; editable/add/remove lines; quantity 12 -> 14;
  source differences; submit/withdraw/amendment visibility and error feedback.
- Disposable-database integration coverage: all three routes through approved
  receipt and bill; partial deliveries/bills; amended quantities; substituted
  unconsumed items; consumed-line restrictions; preserved original documents,
  prior totals and exact adjustment cents; AP matching.
- Security/reliability coverage: company/tenant isolation, permissions,
  maker/checker, stale approval, withdrawal versus decision races, receipt versus
  amendment races, duplicate retries, audit evidence, migration idempotency and
  direct database attempts to bypass final-record guards.
- Browser checks: keyboard access, errors/loading/empty states, light/dark,
  desktop/tablet/mobile and the real API adapter. Do not post owner business
  documents as verification.
- Run focused tests, contract generation/check, type checking, touched-file lint,
  production build, `git diff --check` and theme audit write/check. Update the
  existing migration log and startup runbook; push to `shoaib_nexora`.
- Preserve existing login credentials and protected configuration. Local live
  activation follows the existing pending rollout requirements in
  `docs/runbooks/local-startup.md`; implementation/design approval does not
  authorize a previously rejected business-database backup or migration path.

## Owner decision

Approve the recommended routes and amendment behavior above, or select the
draft-only alternative. The pending clarification asks whether post-approval
edits should follow the recommended amendment/reapproval rules.
