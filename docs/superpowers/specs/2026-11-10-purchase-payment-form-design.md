# Purchase payment and batch voucher form

## Requested surface

Extend the existing Purchase Payment and Multi-vendor Payment workspaces using
the user's reference screenshots. Preserve working bill allocations and the
existing permission, audit, approval, version and idempotency controls. This
document is the reviewable design; receipt/return money-direction decisions
below need the user's answers before implementation.

## Menus and navigation

- Add New: Payment (VP), Receipt (VCR), Return Payment (RVP), Return Receipt (RVCR).
- Batch: the same four voucher categories, opening their batch-entry form.
- Both menus remain reachable from the payment workspace. Opening an entry
  clearly identifies its category and whether it is a batch.
- Preserve existing document codes and routes. New voucher families need stable,
  server-reserved codes; historical PPY/MVP records must not be renumbered.

## Single-entry form

Use the current compact ERP controls and semantic theme. Search exists inside
supplier and bank selectors. The form contains:

| Group | Fields |
| --- | --- |
| Party | Supplier, mailing address populated from the supplier |
| Bank | Company bank/cash account, account currency |
| Voucher | Date, mode, reference number, amount, notes |
| Tax | WHT rate, calculated WHT, additional WHT |
| Allocation summary | Allocated amount, discounts, WHT, net bank amount, unallocated balance |
| Return context | Original eligible voucher and its remaining returnable amount |

Bank options must come from active, company-scoped accounts; show names and
masked identifiers only. Reuse the existing Banking payment-method values.
Changing supplier, bank or currency must revalidate incompatible allocations.
The submitted form must retain the chosen bank/mode/tax/address snapshots when
reopened; decorative or browser-only controls are insufficient.

## Allocations

Retain existing bill selection, allocation amounts, outstanding-balance checks
and partial allocation. Extend the table with date, bill ID/code, due date,
original amount, open balance, discount, payment and total, with a totals footer.
Amounts must have explicit gross/net labels once the calculation basis is agreed.
Use decimal arithmetic on the server; never trust totals submitted by the client.

Customer receipts cannot be applied to supplier bills. Supplier refunds and
returns also need eligible original vouchers or credit/refund sources; they must
not reuse outgoing bill allocation rules merely because the forms look alike.

## Batch form

Use one voucher category per batch, with shared company/bank/currency/date
defaults. Each supplier row exposes its mode, reference, amount, WHT rate,
additional WHT and expandable allocations. Show row and batch totals and retain
individual row errors. Save/approval behavior must have a documented atomicity
and retry boundary; avoid silently creating only part of a requested batch.
Legacy multi-vendor payment records remain readable and retain their allocations.

## Existing implementation findings

- Purchase currently stores payment instructions with bill allocations. Approval
  reserves amounts; it does not execute a bank payment or post stock/AP/GL.
- Banking has live company bank accounts, method contracts, governed posting
  and full voucher reversals. Its generic nominal-entry forms are a separate
  domain and must not bypass supplier control-account restrictions.
- The old Banking batch entry is explicitly a presentation-only prototype and
  must not become a persisted source of payment data.
- No live Purchase WHT-rate directory was found. Add governed company rate
  configuration or confirm transaction-entered rates; do not invent statutory
  rates or treat prototype tax fixtures as production configuration.
- The current Purchase payment total equals its bill allocations. A separately
  entered voucher amount, discounts, tax and unallocated balance require
  compatible persisted fields and server-side calculation/validation.

## Required business decisions

1. Receipt (VCR): money received back from suppliers, or receipts from customers?
2. Returns: the user confirmed both partial and full linked returns.

The receipt-party question remains pending: the user's “Yes” did not distinguish
supplier refunds from customer receipts. A concise follow-up was sent. It determines eligible parties, source
documents, money direction and allocation effects. Do not implement dependent
receipt/return balance changes before the answers arrive.

## Proposed calculation for review

Label the entered Amount as Gross payment amount to avoid confusing it with
actual bank movement. For an outgoing payment instruction:

- G = entered gross amount; A = sum of gross payment allocations; D = discounts.
- Each bill's settled/reserved amount is its payment allocation plus discount,
  capped at that bill's current available balance.
- Unallocated gross amount = G - A, which must not be negative.
- The shared outgoing-payment form uses a transaction-entered WHT percentage of
  gross, with half-up cent rounding. No statutory rates are prepopulated.
  Additional WHT is a separate entered amount. Do not double-count WHT as an
  extra bill settlement when it is already part of the gross allocation.
- Net bank amount = G - calculated WHT - additional WHT, which cannot be negative.
- Batch totals sum these values by supplier and currency. Preserve the selected
  tax settings and calculated amounts as immutable approval snapshots.

This is a voucher calculation, not a statutory rate or tax ruling. No rates are
populated from memory or prototype fixtures. Receipt/return calculations still
depend on the user's money-direction answer.
Returns retain the original voucher's tax snapshots and must not silently apply
the current rate to historical transactions.

## Delivery and verification

Follow the existing client -> API -> repository boundary. Add compatible
contracts/generated client/OpenAPI and additive migrations for persistent
payment details and any voucher/return relationships. Preserve historical
snapshots, company/tenant isolation and append-only audit evidence.

Verify bank/currency/party eligibility, decimal calculations, WHT configuration,
allocation/return caps, concurrent approval, idempotent retries, legacy reads,
menus, single/batch entry, reopening and exports. Run the appropriate unit,
integration, contract and browser checks, including light/dark and narrow screens,
then build and verify the local runtime and its assets before calling it live.

## Current status

The user explicitly requested removal of payment approval reasons. Payment and
Multi-vendor Payment approval now reuse the existing no-entered-reason Purchase
path. The server retains its standard audit description and records system origin
on Super Admin override evidence. Rejection/cancellation reveal their reason and
confirmation only when selected. Approver, live permissions, maker/checker,
impersonation, version/idempotency, bill reservation and posting boundaries stay
unchanged. This correction requires no database migration.

Shared outgoing Payment/Multi-vendor Payment fields are implemented using optional
`payment_details`: a company bank snapshot and per-supplier amount/mode/reference,
address and WHT snapshots. Migration 4 is additive. Server calculation validates
gross allocation caps, net bank amounts and bill settlement including discounts.
Existing instructions/codes, legacy clients omitting the new fields, exact
permissions and the instruction-only boundary remain compatible. Multi-vendor
entries save/approve atomically as one document and retain the current two-supplier
minimum. CSV exports include payment detail rows and allocation discounts.
Verified with 59 unit, 34 Purchase/migration integration, 6 contract and 13 browser
tests, type checking, production build, lint/format, API generation and theme
checks. Migration 4 and the verified shared-field build are active on the local
ERP; readiness and 22 static assets were checked. No business voucher was created
or approved in the live local database during this work.

Receipt/return categories, their menus, original-voucher links and partial/full
return balance handling remain pending the receipt-party answer. They are not
represented as finished or backed by placeholder posting actions.
