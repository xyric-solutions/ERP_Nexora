# ERP integration audit — 17 November 2026

Status: Initial audit complete for the reported Journal/Bank balance incident and
the principal cross-module posting boundaries. The Journal reliability repair is
now implemented and active; the remaining integration work below is proposed.
This is not a claim that every ERP route has been verified.

## Reported incident: USD 1,000,000 missing from JS Bank

Authenticated read-only API checks on 17 November confirmed:

- The main company's base currency is USD. Bank nominal `230907`, Js Bank (USD),
  and the USD bank account reference the same persisted nominal ID.
- Journal `MJ-2026-000003`, Opening Capital, has balanced debit/credit lines of
  USD 1,000,000. Its state is `submitted` (Awaiting approval), version 2. Its
  posted ledger entry reference is null. Its events contain created/submitted,
  with no posted event. The account's bank directory and summary both return 0.
- The authenticated user has permission to approve this Journal, including
  explicit self-approval authority; no administrator override is required.
- November 2026 remains `soft_close`, version 1. Finance requires an open period
  before posting. The fiscal year is correctly July 2026 through June 2027.
- Two other Opening Capital Journals, USD 10,000 and USD 100,000, are also
  awaiting approval. Do not bulk-post them as an integration repair; the owner
  must establish which entries represent intended distinct transactions.
- The second accessible company has no Bank accounts or Journals.

The immediate zero balance is therefore consistent with the posted ledger, not
evidence of a missing Journal-to-Banking connector. A submitted Journal must not
inflate cash, and changing a balance display cannot substitute for posting.

No business records, period controls, permissions, credentials or ledger balances
were changed during this audit. Authentication and company selection used the
existing session API; the private browser session was logged out afterward.

## Confirmed date defect

The Journal directory reports 17 November while its detail reports 16 November.
PostgreSQL date-only values are parsed as local-midnight JavaScript Dates;
`dateText()` in the Journal repository applies `toISOString()`, moving the calendar
day backward in Asia/Karachi. The same conversion supplies the posting command's
date. This can affect the effective posting date and period boundary independently
of the pending-approval issue.

Disposable database reproduction:

- Existing Journal staging hardening suite: 2 tests passed.
- Expanded audit probe under UTC: 2 tests passed. Before posting, the mapped Bank
  balance was 0; after an authorized USD 25 debit, Bank directory, account detail
  and currency summary each returned 25 through the real repositories.
- The same probe under Asia/Karachi: 1 passed, 1 failed. The Bank assertions passed;
  the date assertion expected `2026-10-29` but received `2026-10-28`.

The failing audit assertion is retained in ignored private evidence. The corrected
regression now passes in both time zones; the Journal repair is active on
localhost. Existing calendar dates and posted history were not rewritten.

## Cross-module findings

| Connection | Observed implementation | Required follow-up |
| --- | --- | --- |
| Manual Journals -> GL -> Bank balances | Existing shared posting service and ledger-backed Bank projections. Synthetic posting verified above. | Repair calendar-date handling and make pending/blocked posting obvious. Preserve posting-only balances. |
| Bank payments, receipts, transfers, reconciliation adjustments and FX -> GL | Repository paths call the shared Finance posting service with audited lifecycle steps. | Extend end-to-end regression coverage across their balance effects, reversals, FX currencies, periods and isolation. Source inspection alone does not verify every path live. |
| Product/UOM/supplier/currency masters -> Purchases | Existing company-scoped directories and exact unit snapshots. Main company currently has one service product, with stock tracking off. | Retain these adapters; direct-order/editing changes remain the separate proposed flexible-cycle design. No reason to grant stock to a service product. |
| Purchase receipt -> stock/warehouse quantities | Receipt approval is operational only. Product projection returns null on-hand quantity. Warehouse transfers save unposted drafts. | Implement an append-only stock ledger, receipt posting, opening balances, availability checks, valuation and transfer posting before claiming live stock integration. |
| Purchase Bill -> supplier AP -> GL | Explicit Finance AP recognition can reference an approved Purchase Bill and validate its total. Purchase approval alone does not recognize AP. | Add a visible, idempotent source-to-AP preparation/posting link and source status so the user can complete it without duplicate recognition. Preserve separate approval/posting. |
| Purchase payment -> AP settlement -> Bank/GL | Purchase Payment approval saves/reserves an instruction. Finance subledger settlement is a separate posting workflow. | Bridge the approved instruction to one governed AP settlement, with bank, withholding, fees/discounts and allocations reconciled. Do not repay through an unrelated nominal Bank voucher. |
| Stock receipts/valuation -> Purchase AP accounting | Existing AP bill posting handles expense/assets; no operational stock posting workflow is integrated. | Design stock valuation, receipt accrual/clearing and invoice matching together, preventing both a stock debit and duplicate expense recognition. Product stock/expense accounts alone are not a posting implementation. |
| Purchase AP -> Fixed Assets | Latest source has linked draft-asset registration on AP posting, with separate asset approval/activation. | Retain the existing approved design and verify its pending migration/runtime rollout before calling it live locally. Do not make Purchase approval capitalize assets. |
| Payroll -> GL -> Bank evidence | Payroll accrual uses Finance posting; salary confirmation validates a posted Banking payment/journal and allocation evidence. | Regression-test the existing paths and avoid creating a second cash movement when confirming salary payment. |
| Sales/customer/delivery/invoice/receipt -> stock/AR/Bank | Sales remains a browser-session prototype, documented as mock. There is no dedicated Sales backend integration. | Persist source documents behind versioned authorized APIs, then integrate dispatch/returns, AR recognition and cash allocation with existing ledgers. Do not wire mock Save/Post handlers directly to money or stock. |
| Accounting reports/AR/AP setup | Live subledger workspace and Trial Balance reads returned HTTP 403 for this login in both companies. | Audit the exact scoped role assignments and required company policy before owner-authorized access changes. These balances could not be verified through this session; no permissions were widened. |

## Recommended delivery order

1. **Journal and Bank reliability:** correct date-only handling, expose posting
   eligibility/closed-period reasons, distinguish awaiting approval from posted,
   and prove a posted Journal updates Bank projections exactly once. Retain
   current company/currency/nominal mapping and July–June fiscal dates.
2. **Purchases and accounting:** source-linked AP recognition and settlement with
   truthful status and idempotent retries. Coordinate with the earlier proposed
   direct-order/amendment design and already-approved Purchase adjustment design.
3. **Inventory and purchase stock:** persistent ledger and warehouse balances,
   receipt/return/opening/transfer posting, valuation and AP matching together.
   Agree valuation method, accrual policy and historical opening cutover before
   posting stock. Goods and services require different effects.
4. **Sales and remaining posting paths:** replace Sales mock persistence before
   enabling financial/stock execution; run a cross-module regression matrix for
   Bank, AP/AR, tax/FX, assets and payroll using disposable data.

Each delivery slice needs contract/API/database tests, authorization, audit,
idempotency, concurrency/reversal checks and frontend integration. Preserve the
single Finance posting boundary. Use the existing independent API and additive
migrations; never update displayed balances or historical journals directly.

## Evidence and limits

Source inspected: Finance Journals/posting/subledger/reports; Banking account
projections and posting consumers; Procurement validation/lifecycle; Inventory
masters/transfers/UOM; asset purchase registration; payroll accrual/payment proof;
Sales store and existing architecture documentation.

Private evidence resides under `tmp/integration-audit/`: authenticated API snapshot,
read-only inspection helper, disposable posting probe and Karachi failure log.
The probe uses synthetic isolated records and an ephemeral test encryption key.
No owner business database was copied or mutated.

The running recovered API retains Procurement migration 5 and Fixed Assets 2.
Latest Purchase adjustments/asset registration source is ahead of that runtime.
The existing backup/migration/deployment authorization boundary remains documented
in `docs/runbooks/local-startup.md`; this audit did not activate that release.

## Journal repair follow-up

The owner approved the first repair slice. SQL text projections now preserve
Manual Journal, ledger-detail, recurring template/occurrence and Bank last-movement
dates. Recurring generation also preserves scheduled calendar dates. Existing
posting-period authority powers a read-only eligibility endpoint; editor/detail/
approval screens distinguish pending documents from actual posted Bank effects.
Approval refreshes eligibility, while posting still checks the period atomically.
Failed posting retains the existing submitted identity for a safe retry.

Verified: 65 focused unit tests; 7 OpenAPI contract tests; 2 expanded integration
tests under each of UTC and Asia/Karachi; 10 light/dark responsive Chromium cases;
both production builds; typecheck, lint, formatting and theme checks. Read-only
acceptance passed 12 preview and 12 live cases. Posting/replay/reversal Bank effects
were tested only on disposable records. Original owner Journals remain submitted,
November remains Soft Closed, and the Bank balance is consequently unchanged.
The Purchase/AP, stock, Sales and other integration work above remains outstanding.

## Subsequent owner-authorized period opening

After the repair, the owner explicitly requested posting access in every month
of FY 1 July 2026-30 June 2027. The existing authenticated period-status API opened
the eleven Soft Closed periods, preserving October as already Open and recording
eleven audit events. All twelve monthly Journal eligibility checks passed. Year
boundaries, Journal records and Bank balances were unchanged by this operation.
The earlier Soft Closed observations above describe the original audit state.
Private operational evidence is `tmp/journal-bank-reliability/open-fy-periods-result.json`.
