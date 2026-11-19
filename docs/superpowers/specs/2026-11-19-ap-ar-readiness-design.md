# AP/AR configuration and acceptance readiness design

Date: 19 November 2026. Baseline: `030c23d`.
Status: approved by the user; implementation and verification recorded in the
[Phase 2 handoff](../../architecture/ap-ar-readiness-phase2.md). Live configuration
values remain subject to the business decisions below.

## Objective and boundaries

Complete the existing persistent financial customer/supplier workflows without
duplicating Sales, Purchasing, Banking, GL or aging modules. Preserve existing
records, routes, approved UI patterns, accounting guards and permissions. The
[read-only audit](../../architecture/ap-ar-readiness-phase2.md) identifies the
implemented behavior and exact gaps.

Accounting acceptance requires both independently authenticated journeys:

1. Persistent customer → invoice → independent approval → central posting →
   allocated receipt → posted bank movement → reviewed bank reconciliation.
2. Persistent supplier/adoption → approved purchase bill → independent Finance
   approval → central posting → supplier payment → posted bank movement →
   reviewed bank reconciliation.

Assert balanced journals, zero native/base control differences, correct aging,
customer/supplier and bank balances, trial balance/financial reports, immutable
audit evidence, replay behavior and exact controlled reversal effects.

## Approaches considered

1. **Recommended: extend the existing financial engine and canonical references.**
   Add the missing party configuration and bounded request fields, correct the
   installment evidence, and extend current tests. This keeps one posting and
   reporting authority and limits migration risk.
2. Configure only the existing policy/UI. This is the smallest operational
   change, but leaves credit-limit enforcement, master defaults, generic
   dimensions, installment aging and complete browser acceptance unresolved.
3. Persist the whole commercial Sales prototype first. This would expand into
   quotations, orders and delivery and create a substantially larger dependency
   chain. It is unnecessary for the existing financial invoice journey and is
   outside this batch.

## Increment 1: financial party configuration

Before this increment, repair the baseline tax fixture's repeated supplier
identity and standalone reconciliation fixture's missing company-currency
activation. Rerun their actual PostgreSQL/browser checks. These are test-setup
corrections; retain the duplicate-master and company-currency validations.

Retain `party` and its immutable financial binding as the sole identity.
Continue using company-wide versioned `finance_subledger_policy` for control
accounts; do not allow arbitrary per-party control overrides or generic vouchers.

Financial parties are currently immutable and have no financial settings editor.
Use one narrowly scoped append-only configuration history linked by tenant,
company and existing financial-party ID, rather than making posted identities
mutable or copying them to another master. Store version, approved payment term,
customer credit limit and its functional currency, actor, timestamp and reason.
Every change must produce existing financial audit evidence. No historical
financial operation or party row is rewritten. No synthetic setting is backfilled
as if it were approved business policy.

Use the existing bill payment-term vocabulary and calculation for supported
terms. An explicitly reviewed null term retains manually entered due dates.
Missing customer configuration rejects new invoices; each configured customer
requires a finite functional-currency credit limit. Suppliers use null credit.
Legacy supplier `profile.credit_days` is a migration/configuration input,
not an independently competing financial policy: adoption must explicitly review
and reconcile it. Preserve its stored value until that reviewed update. Document
and display which setting governs a newly prepared financial document.

Expose compatible configuration reads/writes through `/api/v1/finance/subledger`,
reuse current Finance management authority, company scoping, origin/CSRF controls,
idempotency, If-Match/version checks, transaction locks, RLS and immutable audit.
Update shared contracts, generated client and OpenAPI together. Extend the
existing financial setup view using current primitives; retain its layout and
all normal financial versus explicit sample routes.

Measure customer credit in the company's functional currency using exact
arithmetic across persisted open receivables. Explicit zero means no credit;
missing configuration remains visibly unconfigured rather than an invented
unlimited approval. Check new invoice exposure at preparation/submission,
approval and posting under the existing serialization boundary. Re-evaluate
current balances, rates, configuration version and live authority; stale evidence
requires fresh approval. Never block a valid receipt or exact historical reversal
because a later credit setting changed. Do not add a bypass permission.

Expose readiness deficiencies in the existing workspace so an empty ledger cannot
be confused with a configured, accepted workflow. Final business credit policy
and live account/term values require owner confirmation.

## Increment 2: terms, notes and applicable dimensions

For newly prepared invoices, retain immutable due-schedule evidence using the
existing financial item and event model. Keep one invoice identity and final due
date for compatible readers; derive aging from its dated installments and exact
allocated residuals. Apply partial settlement deterministically to the oldest due
installments. Prove the current 30%-now/70%-in-60-days mismatch with a failing
PostgreSQL regression before correcting it. Preserve existing posted history and
single-date legacy documents.

Add bounded optional applicable dimensions to generic financial requests. Reuse
central semantic validation for tenant/company/project/department/cost-centre
and other recognized dimensions. Preserve source-owned purchase-line dimensions
and original reversal evidence; no client may replace authoritative source IDs.

Use the existing recognition, credit, settlement, offset and reversal commands.
First verify AP note direction and source/tax requirements in tests. Add a
compatible debit-note document distinction only where required; do not create a
second journal/ledger or use a negative amount to evade validation. A supplier-
issued debit note increases AP; a supplier credit note reduces it. Any different
issuer convention must be explicit in the approved business workflow.

Governed tax and FX remain authoritative. Correct live chart mappings through
normal reviewed master operations; do not relax account-type checks or activate
an inappropriate FX gain expense account merely to save policy configuration.

## Increment 3: verification and controlled rollout

Add focused contract, backend/PostgreSQL, frontend and browser regressions for
configuration versions, defaults, zero/exceeded/cross-currency credit limits,
concurrent postings, inactive masters, unauthorized/wrong-company requests,
stale approval, installment boundaries, note/refund direction and exact reversal.
Retain the existing guard, canonical identity, source purchase, tax, FX and bank
reconciliation regressions.

Extend the existing isolated browser harness; use real password authentication
and independent maker/checker/poster sessions, real API responses and PostgreSQL
transactions. No mocked financial API, sample Sales route or forced UI state may
stand in for a posting journey. Include both AR and AP through reconciliation,
persist/reload checks and direct scoped DB/report assertions. Never direct the
fixture harness at the owner's business database.

Any new migration must be additive, use the repository migration runner, respect
fresh-database module ordering, receive narrowly scoped grants/readiness checks,
and be rehearsed on a restored copy of real records. Compare pre/post existing
table values, all posted native/base balances and rerun idempotency before live
application. Preserve the pinned Phase 1 runtime while the candidate is built.
Activate only a matched database/API/frontend release after verification.

## Required business decisions

Live setup needs approved eight-account mappings; review existing inactive
`230201`/`120101` before considering any new nominal. Review FX gain account
classification and supply separate eligible mappings required by existing policy.
Obtain customer identities, terms and credit limits, supplier financial defaults,
tax treatments and a cutover decision for the existing four approved bills and
four payment instructions. Never infer these from prototype samples, reactivate
accounts silently, reset opening balances or post the existing queue automatically.

The audit/design and existing isolated regressions are reviewable independently
of those business values. Implementation success and owner accounting acceptance
must be reported separately; neither is asserted by this proposed design.
