# Unified database-backed Purchases

The Purchases menu contains Purchase Request, Request for Quotation, Purchase
Order, Receive Products, Bills, Payment, Multi-vendor Payment and Suppliers, in that
order. Supplier maintenance also opens from the Purchases header. Form/detail routes
remain addressable and are excluded from the visible menu. Legacy Supplier links
resolve inside Purchases; the separate Suppliers module is removed. Purchase
records are excluded from the prototype's generated record-search fixtures.

`app/features/purchasing` owns the live registers, creation/approval form and
supplier maintenance. `packages/contracts/src/procurement` owns strict request,
response and OpenAPI schemas, plus shared decimal preview helpers. The generated
client calls the independent `/api/v1/procurement` API. The API's Purchase repository
owns server validation, company authorization, transactions and lifecycle changes.

## Storage and authorization

Procurement migration 4 adds optional bank and per-supplier payment instruction
details. New Payment/Multi-vendor forms show a searchable company bank, supplier
mailing address, mode, reference, gross amount, transaction-entered WHT percentage,
additional WHT and unallocated balance. No statutory rate catalogue is implied.
WHT rounds half up to cents on gross; net bank amount subtracts WHT and additional
WHT. Gross allocations cannot exceed the supplier's entered amount. Discounts
reserve the bill together with its gross allocation, so they cannot over-settle a
bill. Company transactions serialize concurrent approvals. All supplier entries
save and approve atomically as a single Multi-vendor document.

The API canonicalizes bank name/masked number and supplier identity/address on
save, verifies active eligible same-company/same-currency bank authority again on
submission/approval, and stores those details in the normal immutable audit
snapshots. Procurement read access exposes only this bounded masked account
directory, not bank identifiers or banking actions. Legacy payment instructions
remain readable; legacy edits omitting payment details preserve them. Explicit
null removes details only through the normal editable/versioned/audited path.
CSV payment detail rows keep supplier totals separate from individual bill rows.
Receipt/return money-voucher categories are pending party/direction clarification;
the existing `receipt` kind continues to mean receiving products.

The additive Procurement 1 source migration adds `procurement_supplier`,
`procurement_document` and append-only `procurement_change`. Suppliers also create
the existing tenant Party/vendor identity, with a company-specific Purchase
record. No prototype supplier or document fixture is copied into the live database.

Every operation requires the existing exact `procurement.document.*` or
`procurement.vendor.*` permission and current company access. The server checks
active policy, role and latest effective assignment/scopes, rather than trusting
the UI or a cached permission array alone. Writes prohibit impersonation. CSRF,
origin, quoted If-Match versions and idempotency keys follow the existing API
conventions. PostgreSQL RLS also scopes all three tables to the current tenant.

Codes are assigned transactionally: PRQ, RFQ, PO, GRN, BILL, PAY and MVP, followed
by a hyphen and at least three digits. Existing/cancelled records remain in the
sequence calculation. SUP codes are tenant-wide because Party codes are tenant
unique. Record codes and company identity remain immutable.

## Detailed supplier profiles

Procurement migration 2 adds a bounded `profile` JSONB object without changing
existing supplier identities or audit history. The editor has six tabs: Overview,
Contacts & Addresses, Tax Details, Payment Terms, Bank Accounts and Internal Notes.
It records company/individual identity, legal/trading names, registration,
category, website, primary contact, billing and alternate delivery addresses,
NTN/tax registration/status, withholding reference, credit days, preferred
currency/payment method/reference, notes and up to ten bank accounts.
Accounts require a bank name, account title, account number or checksum-valid IBAN,
unique identities and exactly one default. SWIFT/BIC is validated if supplied.
Terms are reference information and do not override existing purchase documents.

Profiles containing bank accounts are encrypted with AES-256-GCM using the existing
configured banking key/version; tenant/company/supplier identity is authenticated
as associated data. Business rows, audit snapshots and idempotency results contain
encrypted profiles. API responses decrypt after permission/company checks.
Missing/incorrect keys fail closed. Older API updates omitting `profile` preserve
it; an explicit empty profile clears it through the versioned, audited save.
No bank verification or payment execution is added.

## Workflow rules

Documents move through draft → submitted → approved/rejected. Rejected records
can be corrected and resubmitted. Draft, rejected or submitted records can be
cancelled; approved records are immutable. Submission/decisions use the existing
workflow-definition, approval-instance and append-only approval-action tables.
Procurement migration 3 adds a nullable assigned approver, preserving historical
unassigned records. Company-scoped approver search returns only active users with
live approval authority. The approver is selected on the PR draft only. RFQ,
Order, Receipt and Bill inherit it through a bounded tenant/company-scoped
ancestor lookup. Saving/submitting recheck eligibility; explicit downstream
reassignment is rejected. Historical flows without a PR assignment use the
earliest assigned ancestor as fallback. Existing submitted records enforce the
effective PR assignment on action and record it with the decision in the next
audited version. Document reads expose compatible optional `request_approver_id`
and `request_approver_name` metadata for client source copying and action gating.
Decisions are restricted to that actor. Makers (creators, editors and submitters)
require the explicitly assigned `procurement.document.self_approve` permission in
the current company. The migration adds its catalogue definition without granting
it to roles or users. Super Admin self-approval still requires live override
authority and immutable override evidence. Purchase approval, including Payment
and Multi-vendor Payment instructions, requires no
entered reason: the API records `Approved through the Purchase workflow.` when
none is supplied, with `reason_origin=system` on override metadata. Supplied API
reasons remain compatible. Stale session claims cannot replace live authority.

Save Draft retains the editor without approval. For an authorized assigned
creator, Save, Approve & Continue explicitly saves, submits and approves using
the existing versioned, idempotent API actions, then opens the next linked form.
An approval failure retains the submitted document for retry without recreating
or resubmitting it. Request-to-Bill forms show no approval-reason field and no
repeated approver selector. Rejection/cancellation disclose their own required
reason and confirmation only when selected. Payment/Multi-vendor forms follow
the same no-reason approval behavior and disclose reasons only for rejection or
cancellation. Their existing approver/access requirements remain enforced.
No permissions are granted by this change.
Save & Continue with another approver keeps the submitted document open in the
workspace. Submit for Approval remains separate and never approves.
Approve & Continue opens the next linked form through
RFQ, Order, Receipt and Bill when creation access is available. Approve & Close
and the existing independent submission path remain available. Final Approve Bill
also keeps the approved Bill open; Close and Approve & Close remain explicit exits.

Receipt actions use operational labels: Receive Products performs the existing
authorized save/submit/approval path and continues to Bill when creation access
is available; Receive & Close completes the same receipt decision and returns
to its register. Other stages keep their existing action labels. This wording
change does not introduce stock posting or alter receipt/source matching.

## Purchase workflow workspace

All Request-to-Bill forms share the Purchase workflow workspace. A five-stage
tracker shows the active form and the actual status counts for Request, RFQ,
Order, Receive Products and Bill. A separate Draft/Awaiting approval/Approved
strip describes the active document; Rejected and Cancelled remain explicit.
Lifecycle actions are at the top. Stage cards use compact
spacing and one action row; an accessible labelled plus button creates another
document when a stage already contains records. Refresh status
reloads current document/approval evidence without leaving the workspace and is
disabled when edits are unsaved.

`GET /api/v1/procurement/documents/{id}/flow` follows the selected document to its
root Request and returns company/tenant-authorized, paginated summaries plus
aggregate status counts for the entire linked tree. Output excludes supplier
banking profiles, notes, line details and audit payloads. Count summaries are not
limited to the currently loaded page. Continuation tokens bind the root, tenant,
company and page size. No migration or new write permission is needed.

Each stage can open its existing documents or prepare an eligible source-linked
form. Multiple records open a chooser; Load more handles larger flows. The guided
Create Order action requires an approved RFQ and Create Bill requires an approved
Receipt. Existing direct Order/Request and Bill/Order form sourcing remains valid.
Switching stages from the tracker is disabled while edits are unsaved. Partial
receipts and multiple bills are shown as distinct records and status counts;
having an approved receipt does not assert that all ordered products arrived.
Read-only line tables have labelled, keyboard-focusable horizontal scroll regions.

Purchase product search uses active products/services from the current company,
with a bounded, permission-checked `/procurement/products` directory. Code and
name appear together in the editor. The API resolves product identity, code, name
and unit from the catalog when saving a Request. Later stages retain the approved
source snapshot and reject changed product identity, including changed names.
Custom/service lines and older lines without product identities remain supported.

Document CSV exports and the shell Purchase export use live saved records, with
separate Product Code, Product Name and Description columns. CSV quoting handles
punctuation and neutralizes formula prefixes for spreadsheet safety. CSV files can
be opened/imported in Excel; no native XLSX writer is introduced. Register exports
are explicitly labelled as loaded rows, with Load more available before exporting.
Printing and browser PDF output also separate product code and name. There is no
inference or delimiter-based splitting of the combined screen label.

- RFQ forms reference an approved Purchase Request and select one Supplier using
  a searchable dropdown. Supplier search and bounded pagination stay inside that
  dropdown; the Purchase Request lookup has its own embedded search. New form
  selections persist the supplier and a one-element compatible invitation list.
  The Order inherits this supplier. Historical multi-supplier RFQs retain their
  saved selections during unrelated edits; explicitly selecting one Supplier
  replaces those selections. Their existing API representation remains readable.
  Orders copy source-line identities. A direct approved Request
  may also be selected as the Order source.
- Ordered quantities cannot exceed the Request across multiple RFQs/Orders.
- Receipts reference approved Orders. Multiple partial deliveries accumulate;
  approval cannot exceed the remaining ordered quantity.
- Bills reference an approved Order, use its prices/tax, require a unique supplier
  invoice reference, and can be approved only against received, unbilled quantities.
  Opening a Bill from a Receipt copies that delivery's quantities.
- Payments allocate approved Bills in one company/currency. Single payments use
  one supplier; multi-vendor payments require at least two suppliers. Approval
  serializes allocation checks, so concurrent instructions cannot over-allocate.

Money is calculated with decimal integers, fractional quantities up to four
places, line-level rounding and configured active company currencies with two
decimal places. There are at most 100 lines/allocations. The RFQ editor selects
one supplier; the compatible API retains up to 50 saved invitations for historical
multi-supplier records.
Directory search is bounded/paginated; continuation tokens bind tenant, company
and filter. Consumption and supplier validation queries are batched.

## Posting boundary

This implementation persists operational Purchase records and payment
instructions. Receipt/Bill approval does not write stock, AP or GL ledger entries.
Payment approval reserves bill allocations; it neither executes a bank payment nor
marks a Bill paid. These limits are stated on the forms. Explicit stock/Finance/
bank execution integrations require their own governed posting implementation;
ordinary Bank nominal payments are not repurposed to bypass supplier control
accounts. This change contains no financial execution endpoint.

## Verification

The 2026-11-06 detailed supplier extension passed:

- `npm.cmd run test:unit -- tests/unit/purchase-suppliers.test.tsx tests/unit/supplier-profile.test.ts tests/unit/supplier-profile-crypto.test.ts tests/unit/purchase-workflow.test.ts tests/unit/purchase-document-form.test.tsx tests/unit/prototype-shell-navigation.test.tsx` — **43 tests**.
- `npm.cmd run test:integration -- tests/integration/procurement-workflow.test.ts tests/integration/postgres-migrations.test.ts` — **27 tests** against disposable local databases, including encrypted business/audit/retry storage, idempotent replay, legacy profile preservation, version checks and unavailable-key failures.
- `npm.cmd run test:contract -- tests/contract/openapi.test.ts` — **6 tests**.
- `npm.cmd run typecheck`, targeted ESLint/Prettier, `npm.cmd run api:check`,
  `npm.cmd run catalogue:check`, theme audit `--write`/`--check` and
  `git diff --check` passed. Production `npm.cmd run build:web` passed with
  `NEXT_DIST_DIR=tmp/supplier-profile-release-build`.
- With explicit local test bootstrap and existing-web configuration,
  `npm.cmd run test:e2e -- tests/e2e/purchase-workflow.spec.ts --max-failures=1`
  passed **8 tests**: real-API persisted supplier/Purchase workflow, direct-route
  Save/Cancel and light/dark rendering at 1440/768/390px. Axe found no violations
  in the supplier form. Screenshots are in `tmp/purchase-workflow-evidence/`.

The local Procurement 2 migration preserved existing supplier identities/versions
and other module ledgers. The verified UI/API are active on ports 3000/4000 with
HTTP readiness and unauthenticated supplier requests still requiring a session.

### Original Purchase workflow verification

`npm.cmd run test:unit -- tests/unit/purchase-workflow.test.ts
tests/unit/purchase-document-form.test.tsx tests/unit/prototype-shell-navigation.test.tsx`
passed 17 tests. `npm.cmd run test:contract -- tests/contract/openapi.test.ts`
passed six tests.

`npm.cmd run test:integration -- tests/integration/procurement-workflow.test.ts
tests/integration/postgres-migrations.test.ts` passed 26 tests against disposable
local databases. Includes full migration/upgrade/idempotency checks, Party linking,
the document chain, duplicate invoices, quantities/prices, concurrent codes and
payment approvals, maker/checker, explicit override/replay, company/tenant/scoped
authority, immutable audit evidence, HTTP CSRF/If-Match and absence of bank/GL
posting. Stale existing migration-head assertions were updated to the actual
Finance 35/HR 133 source heads; this does not apply those HR migrations to the
existing local service database.

With `NEXORA_PURCHASE_E2E=true`, an explicit local test bootstrap database,
`PLAYWRIGHT_USE_EXISTING_WEB=true` and a local preview base URL,
`npm.cmd run test:e2e -- tests/e2e/purchase-workflow.spec.ts --max-failures=1`
passed seven cases: the full real-API/PostgreSQL workflow and light/dark rendering
at 1440/768/390px. Only local synthetic test sessions are simulated; policy scope,
repository, lifecycle, audit and persistence are real. The disposable database is
removed after the run. Screenshots are in `tmp/purchase-workflow-evidence/`.
