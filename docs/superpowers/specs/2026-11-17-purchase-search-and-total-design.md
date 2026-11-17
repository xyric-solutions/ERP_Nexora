# Purchase form search and total amount

Status: Proposed; awaiting owner review before implementation.

## Requested outcome

Improve the existing Purchase Document Form. Product/service browsing and search
must share one selection control. Display a live, clearly labelled Total Purchase
Amount breakdown using real company data and the same arithmetic and persisted
values used by the API and accounting. Preserve the existing purchase lifecycle,
source matching, permissions, validation, and accounting approval/posting steps.

## Findings from the existing implementation

- `purchase-document-form.tsx` already uses the shared `SearchableSelect` for
  Purchase Request product selection. Search runs through `usePurchaseDirectory`
  and the real product endpoint, with debounce, pagination and stale-result
  protection. Custom code/name inputs describe custom items; they are not search
  fields. Downstream documents inherit their products from approved sources.
- The running compatible frontend also contains this shared selector. Verify the
  actual browser interaction before replacing or duplicating any control.
- `packages/contracts/src/procurement/amounts.ts` uses integer decimal arithmetic,
  rounding each quantity-times-price line to cents, then rounding its tax. The
  form currently shows only a single total near the bottom.
- Purchase lines and documents have no purchase discount or freight/charge
  fields. The existing allocation discount belongs to payment settlement.
- The API calculates and stores purchase totals and governed tax snapshots.
  Accounting checks an approved bill's gross amount, net basis and tax evidence.
  Fixed-asset registration also depends on the approved purchase line cost.
  Adding display-only discount/charge calculations would break these guarantees.

## Approaches considered

1. **Integrated change (recommended):** reuse the current selector; extend the
   existing purchase contracts, calculation, persistence and accounting matching
   to support the requested adjustments; add the live summary to this form.
   This delivers the full request and requires financial regression checks.
2. **Presentation-only change:** verify the existing selector and display the
   current subtotal/tax/total. This is smaller, but cannot honestly support
   purchase discounts and freight. It does not fulfil the complete request.

## Proposed interface

- Keep one Product/Service selection control on each independently selectable
  request line. Clicking opens the existing dropdown with its search inside.
  Search code/name using the existing company-scoped API; support keyboard
  selection, loading, empty, retry and pagination states within the dropdown.
  Keep existing custom-item entry and inherited downstream product selection.
- Add no external product search input or search button. Retain selected labels
  while searching and ensure each line keeps its own selection correctly.
- Replace the single total row for product documents with a semantic, visually
  distinct summary immediately below the line table. Show Subtotal, Total
  Discount, Total Tax, Additional Charges, and a prominent Grand Total labelled
  Total Purchase Amount, with the document currency. Do not duplicate the total
  elsewhere in the same form. Preserve payment/allocation totals separately.
- Expose optional line discounts and an expandable purchase adjustments section
  for the overall discount and charge rows. Freight is a charge type, rather than
  a second amount counted again. No duplicate form or new purchase workflow.
- Use shared shadcn controls, semantic theme tokens and the existing form layout.
  Keep the summary readable at desktop, tablet and mobile widths, and in print.
  Invalid or incomplete numeric input shows an incomplete calculation state;
  do not display a stale saved total as the current edited total.

## Calculation and persistence rules

- Retain the current supported two-decimal purchase money precision and
  four-decimal quantity precision. Use integer arithmetic throughout, including
  currency formatting; do not calculate financial amounts using floating point.
- Add optional, backward-compatible currency-amount discounts on each line and
  on the document. Omitted adjustments mean zero; old records retain their totals.
  Reject negative adjustments and discounts exceeding the eligible net basis.
- Round each quantity-times-price amount using the existing rule, subtract its
  line discount, then allocate the overall discount proportionally across the
  remaining product/service bases. Distribute residual cents deterministically
  using stable line identities. Discounts are applied before tax, once only.
- Additional charge rows have stable identities, type (freight or other),
  description, amount, and applicable existing nominal/tax selections. They are
  excluded from the product subtotal and product discount allocation. Resolve
  their taxes through the existing tax service and require valid company account
  mappings before posting. No invented tax rates or default ledger accounts.
- Summary identity: grand total = product/service subtotal - line and overall
  discounts + additional charges + total applicable tax. Tax includes charge tax.
  Preserve governed tax snapshots and existing manual-tax compatibility rules.
- Centralize the breakdown alongside the current shared purchase amount helpers.
  Use it for form preview, API validation/storage, payment schedules, approved
  bill matching, tax bases and accounting debit amounts. The server recalculates
  all financial values; a browser-provided total is never authoritative.
- Extend the existing contracts, generated API/client documentation and purchase
  persistence together. Use additive database migrations for document-level
  adjustments; keep historical documents and posted accounting immutable.
- Carry adjustments through the existing approved-source workflow. Partial
  deliveries/bills receive a deterministic proportional share, with consumed
  amounts checked transactionally so discount/charge cents cannot be duplicated.
  Receipt/bill pricing remains controlled by the approved order.
- Apply discounted purchase bases to linked asset cost validation and individual
  unit allocations. Freight/other charges use their explicit account mapping;
  do not silently capitalize them or alter existing asset approval/activation.
- Preserve tenant/company isolation, approval separation, idempotency, audit,
  closed-period rules and the existing explicit accounting preparation/posting.

## Verification and delivery

- Focused calculation tests: fractional quantities, rounding, multiple lines,
  line/overall discounts, excessive discounts, zero values, charge tax, mixed tax
  cases, deterministic cent allocation, invalid input and overflow limits.
- Form tests: one searchable selector, real directory adapter calls, selection
  retention, custom items, dynamic summary changes, save/reload and read-only
  behavior. Preserve current asset and Purchase Return actions.
- API/accounting integration tests on disposable test data: validation,
  authorization, source inheritance, partial quantities, snapshot changes,
  persistence, payment schedules, matching posted AP totals and asset costs.
- Browser checks for keyboard operation, errors/empty states, responsive widths,
  light/dark themes and accessibility. Verify the running release explicitly.
- Run relevant tests, type checking, touched-file lint, production build,
  `git diff --check`, theme audit write/check, and update migration documentation.
  Review and push completed changes to `shoaib_nexora` as already requested.
- Keep the existing login credentials unchanged. Use the established protected
  local configuration without exposing values or modifying `.env`.
- Local business-database rollout remains separate from implementation/testing.
  The existing runbook records a pending backup/restore authorization requirement;
  do not treat approval of this UI/calculation design as approval to copy business
  data or bypass the existing migration gate. Report any resulting live-release
  limitation explicitly.
