# Complete multi-currency accounting

Date: 2026-11-12
Status: User-approved design; implemented locally. Environment activation is separate.
Repository: Nexora ERP, resolved from the root AGENTS.md.

## User-requested navigation consolidation

The user requested one currency submenu, retaining the existing Currencies &
Transfer FX design. Use `FinanceCurrencyConsole` at the existing `currencies-fx`
route, defaulting to the unchanged company currency/rate forms and transfer policy.
An internal Balances & transactions view embeds `MultiCurrencyWorkspace` with its
existing controls and state. Each embedded view suppresses only its duplicate
page heading; there is one outer title. Remove the separate finance/multi-currency
menu leaf and retain it as an alias to the accounting view. Currency accounting
in other feature/report entry points remains compatible. Backend calculations,
contracts, lifecycle, tenant/company boundaries and independent posting controls
remain unchanged. Local activation and explicit role grants are recorded in the
remaining UI migration checklist.

## Request and acceptance baseline

The user requested completion of the multi-currency workflow discussed in chat,
following the local audit in `tmp/multi-currency-audit/report.txt`. Completion means
persistent currency-separated customer balances, accurate settlement and valuation,
and live reconciled reports. A currency picker or a passing calculation test alone
does not meet that requirement.

The audit found working company currency governance and Banking/Finance FX
foundations, but browser-only Sales data, a hardcoded PKR base, no customer
settlement FX posting, no receivable/payable revaluation, sample report data,
two-decimal Sales arithmetic, and historical invoice rates copied into batch
receipts. Existing bank tests also need deterministic clocks and current sign-in
company selection.

## Approach and alternatives

Recommended: extend the existing Finance posting boundary with persistent
receivable/payable open-item subledgers and feature data adapters. Reuse company
currency authority, accounting events, journal sequencing, company authorization,
maker/checker approvals and the generated API client. This keeps one accounting
source of truth and preserves the independent API/mobile boundary.

An alternative is to add currency buckets and FX calculations only to the Sales
browser store. That is smaller but cannot provide persistent accounting, enforce
permissions or reconcile reports; it does not satisfy the request.

A replacement accounting engine would allow a fresh architecture but unnecessarily
duplicates working posting/governance behavior and increases migration risk. It
is not selected.

## Delivery boundaries

Deliver the following connected workstreams as one acceptance-gated release:

1. Exact money calculations, contracts, migrations and server-side open items.
2. Persistent customer/invoice/receipt integration and supplier bill/payment
   integration, including settlement, refunds and credit notes.
3. Governed outstanding-item FX revaluation and settlement of revalued items.
4. Live customer/vendor statements, currency-separated ageing, exposure, FX
   reports, GL, trial balance, profit and loss, and balance sheet.
5. Optional single-company presentation-currency reporting with an explicit
   translation method, followed by security, reconciliation and browser acceptance.

An intermediate batch may be merged only with its unready entry points visibly
disabled/prototype-labelled. The overall request remains incomplete until all
release acceptance criteria pass. Do not silently activate live posting through
the current mock Save/Post buttons.

Multi-company consolidation/eliminations, derivatives/hedge accounting and changing
an established functional currency are separate accounting capabilities. They are
not implied by displaying one company's reports in another currency. Manual,
governed rate maintenance remains supported; a market-rate subscription is not
required for this release.

## Currency and numeric authority

- Resolve functional currency by authenticated tenant and company through the
  existing company currency profile. Remove PKR assumptions from live Sales.
- Support multiple active transaction currencies per customer/vendor without
  duplicating the party master. A default currency only prefills new documents.
- Monetary values and rates cross APIs as bounded decimal strings. Use exact
  decimal/scaled-integer arithmetic. Never use binary floats for authoritative
  amounts, exchange conversions, allocations or journals.
- Validate each currency's governed decimal places, including JPY 0 and KWD 3.
  Round once at the applicable currency boundary; allocate proportional rounding
  residuals to the final settlement so an item closes exactly.
- Keep the existing rate convention: one foreign unit equals X functional units.
  Resolve approved effective-dated rates on/before recognition, settlement or
  valuation date. Missing/inactive/invalid rates block the action.
- Snapshot rate ID, revision/value, effective date, selected date and source with
  each posted effect. Later corrections cannot change a posted original amount,
  carrying amount or historical report.

## Persistence and service boundaries

Use additive migrations under `packages/db/source-migrations`, without modifying
applied migration identities. Put contracts/OpenAPI/generated client changes in
`packages/contracts` and business workflows in `server/api`.

Persist company-scoped party references, document lifecycle, original currency
amounts, functional amount/rate snapshots, due dates, immutable open-item events,
settlement allocations, valuation adjustments and journal links. Preserve
original amounts independently from outstanding amounts and carrying adjustments.

Use database constraints, composite foreign keys, forced row-level security and
immutable evidence to protect tenant/company boundaries and posted history.
Reserve record codes transactionally using meaningful uppercase prefixes with
at least three padded digits. Existing posted codes are never renumbered.

Repository transactions own locking, idempotency, audit and Finance posting.
Services own lifecycle, validation and accounting calculations. Browser code uses
only versioned `/api/v1` contracts and generated client methods. Do not persist
browser-proposed journals or accept client-computed carrying values as authority.

Existing quotation, order and fulfilment behavior stays intact. Migrate customer,
invoice and receipt surfaces using explicit feature data adapters. A customer
created in a live company must resolve to the same identity across document,
settlement and reporting flows. Do not auto-import invented fixture customers or
transactions into a database.

## Recognition and settlement

An issued invoice/bill creates its open item and balanced journal atomically after
the required authorization and lifecycle checks. Relevant revenue/expense, tax,
control and bank accounts must be explicitly configured and postable for that
company. Reject missing mappings instead of inventing accounts.

Receipts/payments support partial and multiple allocations, on-account amounts,
same-currency and explicit cross-currency settlement. Capture both the bank/payment
currency amount and the invoice/bill currency amount cleared. Keep bank fees,
discounts, rounding and FX separate. Validate allocation totals, available bank
amounts and item balances server-side under row locks.

On settlement:

1. Read the locked open item's remaining original amount and functional carrying
   value from immutable recognition/valuation/allocation evidence.
2. Relieve the exact proportional carrying value of the settled original amount.
3. Recognize bank/cash in its own currency using the settlement evidence.
4. Post the functional difference to the configured realized FX gain/loss account.
5. Reclassify any settled portion of previously unrealized FX where required,
   without changing total profit or loss a second time.
6. Persist allocation, journal links, rate snapshots and audit event in the same
   transaction; replays return the same financial result.

Extend the shared Finance posting boundary, if necessary, with a trusted
source-evidence-based carrying-value path. Existing spot-rate posting must remain
strict. A manual/API caller cannot override functional amounts to manufacture a
balanced journal. Validate carrying evidence against original posted journals and
the open item's valuation/allocation history.

A batch receipt must obtain independent settlement-date/bank evidence. It must
not copy the first invoice's rate. Multiple invoices at different historical rates
produce distinct carrying-value relief calculations within one balanced result.

Credit notes, refunds, returns and reversals preserve original source links,
currency precision and immutable history. Posted financial records cannot be reset
to a freely editable draft; corrections use governed compensating documents.
The browser prototype's existing reset action must remain a prototype operation
until its explicit live replacement is implemented.

On-account credit must distinguish refundable monetary deposits from nonmonetary
advances/prepayments. Do not revalue all advances merely because they contain a
foreign currency. Require an explicit accounting classification and prevent
unconfigured live posting.

## Outstanding-item revaluation

Revalue eligible open monetary receivables and payables at the reporting-date
closing rate. Exclude settled amounts and nonmonetary items.

For each item:

`target carrying amount = remaining foreign amount * closing rate`

`adjustment = target carrying amount - current functional carrying amount`

Receivable increases are gains; payable increases are losses. Test negative/credit
balances with their actual economic sign. Use exact currency rounding and explicit
gain/loss account configuration.

Use draft -> submitted -> approved -> posted with independent checker and a
separate posting action. Store balance cutoff, rate revisions, account mapping,
source fingerprint and versions. Revalidate at submission/posting; changed source
evidence requires refreshed approval. Preview writes no financial effects.

Receivable/payable remeasurement remains in the item's carrying value until a
subsequent remeasurement, settlement or governed reversal. Do not combine that
method with an automatic reversal that would remove the adjustment a second time.
Existing bank revaluation retains its independently tested next-period reversal
policy. Reports include both methods by their actual journal dates.

Backdated transactions affecting a posted valuation cutoff must be blocked until
the valuation is formally reversed/rebuilt, or must follow an explicitly tested
recalculation workflow. Historical reports cannot silently drift.

## Reports

Replace sample data on the affected report routes with scoped report APIs.
Document the following values independently:

- Original outstanding amount grouped by currency; no raw USD/EUR sum.
- Functional carrying amount including posted valuation adjustments.
- Historical recognition-rate equivalent where useful for comparison.
- Realized and unrealized FX movements separately.
- Optional management/presentation conversion labelled with reporting currency,
  rate date, rate method and translation differences.

Customer/vendor statements and ageing derive from posted open-item events as of
the requested date, not today's mutable outstanding column. Partial settlements,
credit notes, reversals and on-account credits remain traceable to their sources.

GL and trial balance aggregate posted functional journal debits/credits. Include
original journals marked reversed as well as their compensating journals at the
correct dates. Statement classifications come from the company's governed chart.
Customer/vendor subledger control totals must equal the relevant GL controls.

Financial presentation-currency translation must apply the appropriate rules per
statement component: closing-rate positions, transaction-date income/expenses
(or approved representative averages), historical equity components and explicit
translation differences. A convenience conversion using one rate is labelled a
management view and must not impersonate a translated financial statement.

Provide bounded filters, pagination and server-computed totals over the full
filtered dataset. Never derive a report total solely from the current UI page.

## UI, authorization and operations

- Reuse Tailwind, shared shadcn controls and semantic theme/font tokens.
- Show currency, original amount, carrying amount, rate/date and source references
  at the point where the user makes a financial decision.
- Preserve navigation, form fields, labels, keyboard behavior and existing
  nonfinancial Sales workflows. Live financial lifecycle changes are explicit.
- Scope permissions to the authenticated company; enforce current authority in
  transactions, including active-company session boundary and impersonation rules.
- Require CSRF/origin checks, idempotency keys and optimistic versions for writes.
- Draft/approved/posted status, validation, errors, empty states and loading states
  are visible. Missing configuration blocks posting with a useful error.
- Database migrations and authorization grant cutover require an explicit target;
  use disposable local databases for development and acceptance. Do not read/change
  `.env`, seed real financial data, run shared migrations or deploy implicitly.

## Mandatory acceptance scenarios

1. One customer simultaneously owes USD 1,000, EUR 500 and PKR 50,000; separate
   currency balances and functional totals survive API restart/browser reload.
2. PKR and a non-PKR functional company independently process the same currencies,
   using different company rates and never sharing customer balances.
3. USD 1,000 at 280; collect USD 500 at 285: remaining USD 500, functional
   carrying PKR 140,000 and realized gain PKR 2,500 before revaluation.
4. USD 1,000 at 280; revalue at 285; settle all at 287: prior unrealized gain
   PKR 5,000, incremental gain PKR 2,000, lifetime gain PKR 7,000. No double count.
5. Repeat scenario 4 with partial settlement and subsequent revaluation. Final
   settlement leaves zero original amount and zero carrying residue.
6. Equivalent supplier payable scenarios produce opposite FX signs.
7. Explicit EUR payment against a USD invoice records both currencies, settlement
   relationship, independent bank/functional rate evidence, fees and exact relief.
8. Same-currency batch allocations across invoices with different historical rates
   calculate separate carrying relief using the actual settlement evidence.
9. JPY zero-decimal and KWD three-decimal documents, allocations, returns and
   balances preserve configured precision; overprecision is rejected.
10. Missing/stale source evidence, inactive currency, closed period, invalid
    nominal mappings, over-allocation and changed approval snapshot fail closed.
11. Concurrent allocations cannot settle more than the outstanding amount;
    concurrent idempotent retries create one effect. Failed posting rolls back all
    subledger, journal and audit mutations.
12. Cross-tenant/company requests and unauthorized/self-approved actions fail at
    API and database boundaries. Posted evidence cannot be edited or deleted.
13. Historical statements/TB reproduce before and after valuation, settlement,
    correction and reversal. Subledger controls reconcile to GL exactly.
14. Customer/vendor ageing groups original currency balances correctly, and report
    totals remain correct over multiple result pages.
15. Presentation-currency reports disclose method and reconcile their translation
    difference; management-only conversions are clearly distinguished.
16. Browser create -> approve -> post -> partial settle -> revalue -> final settle
    -> reload -> statements/GL succeeds with actual API/database state.

## Verification and completion gate

Run meaningful exact-money unit tests, contract/client-generation checks,
disposable migration/integration/security tests, deterministic worker tests,
focused browser acceptance, type checks, lint/format on changed files, theme audit
write/check, `git diff --check` and `npm.cmd run build:web`. Review light/dark and
desktop/tablet/mobile states on affected routes and record evidence in
`docs/architecture/remaining-ui-migration.md`.

Fix the original bank test clock and company-selection assumptions in the real
test suite, rather than relying on audit copies for release verification.

Completion requires all scenarios above to pass with persisted journals and
auditable evidence. Report any remaining unsupported flow explicitly. Do not
claim universal or mathematical 100% defect-freedom from passing tests.

## Self-review

This design specifies accounting authority, persistence, settlement/valuation
interaction, UI cutover, security, verification and operational boundaries. It
contains no placeholder account IDs, credentials or invented environment values.
The release is decomposed into ordered workstreams while retaining one complete
acceptance gate. Written-design review is required before implementation.

## Implementation and operating limits

Finance migration 0037 and security migration 0021 add persistent customer/vendor
currency accounts, immutable open-item effects, approval operations and explicit
permissions. Existing Finance posting and company currency authority remain the
posting/rate boundaries. Amounts use exact decimal strings and integer arithmetic;
reports use a consistent read-only database snapshot.

Sales invoices/receipts/customer financial accounts, supplier currency accounts,
approved-bill accounting preparation and core report routes use the API. Original
quotation/order/customer-profile demonstrations remain accessible via explicitly
labelled sample workflows. Sample records are not imported or posted automatically.
The financial document form captures gross, tax, due date and source reference;
this does not make every legacy Sales demonstration persistent.

AR/AP valuation remains in carrying value until settlement or explicit reversal.
Banking valuation retains its existing next-period reversal policy. Settlement
releases prior unrealized gain/loss and recognizes lifetime realized FX without
counting that release as new economic income. Bank deals require an explicit
payment-units-per-invoice-unit rate and evidence reference. Fees, FX and conversion
rounding have separate evidence. Reversals check bank balance, overdraft and dates.

Posted valuations permanently protect historical cutoffs, including when later
reversed. Use current-dated compensating documents for historical mistakes;
retrospective rebuilding of already reported history is not exposed. Allocations
accept up to 40 items; valuation accepts 500 eligible items per operation within
the shared 1,000 journal-line boundary. Split larger work by party. Reports reject
source ranges above 100,000 rows/groups instead of returning incomplete totals.
Currency balances and ageing aggregate before database pagination. Lookup lists
contain the permitted company's setup data.

Party statements/FX accept party, side and original-currency filters. Company
GL/TB/P&L/balance-sheet reports cover the complete ledger; incompatible API filters
are rejected and the UI explains scope. GL running balances include opening
activity. Presentation views preserve functional books. Cash-flow, budgets,
consolidation/eliminations, hedging and functional-currency changes remain outside
this approved multicurrency scope.

See `docs/migrations/FIN-PG-01-finance-postgresql.md` for activation and verification
commands and `docs/architecture/remaining-ui-migration.md` for browser evidence.
No shared database, real role grants, environment secrets or deployment changed.
