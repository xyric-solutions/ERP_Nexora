# Operational integration repair implementation plan

Approved design: [supplier payments, Sales and manufacturing](../specs/2026-11-20-operational-integration-repair-design.md).
Code baseline: `18b1b24`. Approval received 20 November 2026. Increment 1 is
verified/live; no further design approval is needed for the work below.

Use the existing repository planning convention; the referenced `writing-plans`
skill is not installed in the available skill roots. No new dependencies.
Preserve the unrelated environment/lockfile changes and pinned local runtime.
Run implementation tests only against disposable PostgreSQL on the existing
test service. Do not execute old business records or invent configuration.

## 1. Stock ledger and configuration

- [ ] Add shared bounded contracts for reviewed stock policy/product valuation,
      movement lifecycle, balances, costing evidence and source commands.
- [ ] Add additive inventory migration(s): append-only stock/configuration/audit
      evidence, company/master FKs, unique source/replay identities, lifecycle
      checks, RLS, scoped permissions and matching runtime grants.
- [ ] Implement exact FIFO and weighted-average costing using existing bigint
      helpers; preserve residual value when the last quantity is issued.
- [ ] Implement company-authorized transactions, explicit independent review,
      source/version checks, stale preview protection, central Finance posting
      and exact controlled reversals. Prevent negative or retroactively recosted
      stock; serialize competing movements within the company.
- [ ] Verify real PostgreSQL atomicity, constraints, concurrency, denial/isolation,
      journal/stock reconciliation, replay and reversal behavior before consumers.

## 2. Purchase stock and actual manufacturing

- [ ] Link approved actual receipts to posted stock with real warehouses/UOM,
      governed receipt accrual and exact source quantity consumption.
- [ ] Integrate AP recognition with receipt accrual; preserve service/asset
      workflows and prevent duplicate inventory/expense recognition.
- [ ] Expose actual manufacturing issue/completion commands against existing
      orders, explicit consumption/BOM snapshots and WIP/finished-goods costing.
      Support partial output and retain old approved orders without backfill.
- [ ] Integrate reviewed openings and existing draft transfers with the stock
      lifecycle, preserving stock/value and exact source references.
- [ ] Extend Inventory/Manufacturing UI and product on-hand projections through
      generated APIs. Retain approved layouts, semantic theme and permissions.

## 3. Persistent commercial Sales

- [ ] Add only necessary Sales document/source-line and recurring-template
      persistence, module migration order and scoped lifecycle permissions.
- [ ] Implement canonical customer/product/UOM/warehouse/project/location/tax/
      currency lookups and server-owned totals, codes, references and versions.
- [ ] Implement quotation/order/delivery/invoice/return/recurring workflows;
      enforce source quantities and exact-once delivery and invoicing.
- [ ] Connect posted delivery/return to stock/COGS; connect invoice/credit and
      receipt to existing AR/Banking without a second stock issue or journal.
- [ ] Replace normal-route sample data/session writes with persistent adapters.
      Preserve approved Sales layouts/actions; isolate any retained prototype.
- [ ] Verify reload persistence, cross-company rejection, over-delivery/invoicing,
      mixed products/services, FX, taxes, partial receipts, credits and reversals.

## 4. Acceptance and safe local release

- [ ] Extend shared contracts/OpenAPI/generated client together; check API drift,
      permission catalogue and source import boundaries.
- [ ] Run authenticated API/browser journeys for purchased components -> actual
      production -> available stock -> Sales delivery/invoice -> customer receipt
      -> reconciliation, and purchase receipt -> AP -> payment -> reconciliation.
- [ ] Assert independent SQL stock quantity/value, WIP, COGS, AP/AR controls, bank,
      trial balance, GL, aging, audit and exact-once source effects.
- [ ] Run relevant full regression/type/build/theme checks and inspect desktop,
      tablet and mobile evidence. Record actual pass/fail counts.
- [ ] Back up and rehearse additive migrations on a restored business copy;
      compare all historical table fingerprints and native/base balances; verify
      replay before applying schema-only migrations to the local business DB.
- [ ] Pin and activate matched API/web/schema only after checks pass; verify
      served assets and read-only business preservation. Retain rollback runtime.
- [ ] Update configuration readiness and acceptance handoff. Clearly distinguish
      software verification from owner-approved financial values/live acceptance.

Live account, tax, credit, valuation and cutover selections remain explicit
business decisions through governed setup. Missing values must be actionable
readiness findings, never fabricated approvals or silent defaults.
