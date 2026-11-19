# AP/AR readiness audit and implementation — 19 November 2026

Status: approved implementation; verification and rollout results appear below.
Accounting acceptance with owner-approved business configuration is **not
complete**. Baseline: `030c23d`; approved design commit: `a33d4a8`.

The audit matrix and baseline failures below record the read-only inspection
before implementation. They are retained as evidence, rather than presented as
the current software status. See **Implementation results** for resolved gaps.

## Scope and evidence

Reviewed the existing financial contracts, independent API routes, canonical
party bindings, subledger repository, purchase bridge, dated report queries,
posting lifecycle, migrations, Sales/Purchasing route renderers and tests.
The live local PostgreSQL database was inspected in read-only transactions.
Tests use separate disposable PostgreSQL databases and real authenticated
API/browser sessions; their controlled test records are not live business data
and are not evidence that the owner's business configuration is complete.

At the audit baseline, API and web used the matched Phase 1 release. Finance was 42 and
Procurement is 8. Readiness checks pass, application PostgreSQL credentials
cannot bypass RLS, anonymous business access returns 401, and served web scripts
match build `cK_78vAmcGo8cz8q_eKWK`.

The populated company has two suppliers, four bank accounts, 338 chart accounts,
28 purchase documents and three posted/reversed journals. There are four
approved bills and four approved payment instructions, but **zero financial
parties, AP/AR operations, open items, subledger policies or active tax
definitions**. The second company has no corresponding business setup.
Preflight reports zero integrity blockers and zero warnings; that does not
mean the unconfigured AP/AR workflows are ready for business acceptance.

All four bank balances agree with GL. The populated company's trial balance
agrees with SQL ledger totals and balances. No business record, financial
configuration, permission, account status, opening balance or posted amount
was changed by this audit.

Private execution evidence: `tmp/ap-ar-readiness-phase2/live-audit.json`,
`tmp/stabilization-phase1/preflight.json`,
`tmp/stabilization-phase1/runtime-verification.json` and
`tmp/ap-ar-readiness-phase2/multi-currency-playwright.log`.

## Gap analysis

IMPLEMENTED means a real persisted implementation exists; it does not imply
live configuration or complete authenticated business acceptance. PARTIAL means
only part of the requested behavior is present. MISSING refers to the reviewed
scope. DEFECTIVE identifies an observed implementation mismatch; where no
failing regression exists yet, that qualification is explicit.

| Area / triggering action                                      | Existing database/API dependency and destination                                                                                                              | Status      | Gap / required correction                                                                                                                                                                                                                                                                                                                 |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Customer creation → shared identity                           | `POST /api/v1/finance/subledger/parties`; `party`, `finance_subledger_party`, immutable `finance_party_master_link`, `finance_party_directory`                | IMPLEMENTED | Scoped persistent IDs, duplicate rejection and reload are tested. No live financial customers exist. Use this workflow; do not copy sample customers.                                                                                                                                                                                     |
| Supplier creation/adoption → shared identity                  | Same financial endpoint, bounded `/supplier-masters`, `procurement_supplier`                                                                                  | IMPLEMENTED | Adopt the existing two suppliers explicitly. Finance-origin new suppliers create an inactive operational profile for vendor review.                                                                                                                                                                                                       |
| Customer/supplier → control account                           | Versioned `finance_subledger_policy`, existing `/policy` endpoint; central GL posting                                                                         | PARTIAL     | Architecture supports company-wide AR/AP controls, not separate arbitrary controls per party. Neither company has a policy. Existing `230201 Debtors` and `120101 Trade Creditors` posting accounts are inactive; their active headers cannot be posted. Review/reactivate eligible existing accounts rather than duplicate them.         |
| Control policy → FX/revenue/expense mappings                  | Existing policy requires eight distinct active posting accounts and correct account types                                                                     | PARTIAL     | Live mapping is absent. `420106 Currency Exchange Gains` is an active revenue account; `710707 Realised Exchange Losses` is active expense. Other inactive FX gain candidates are typed expense. Do not silently reclassify or substitute accounts. Obtain approved mappings and review account history first.                            |
| Customer → financial payment terms and credit limits          | Financial party request currently accepts only identity/default currency/source supplier                                                                      | MISSING     | Prototype Sales `customer-model.ts` contains terms/credit fields, but those records live only in the explicitly selected sample store. Persist and enforce financial settings through the existing API/master boundary.                                                                                                                   |
| Supplier → bill payment terms                                 | Persistent supplier `profile.credit_days`; bill `payment_term`, server `billPaymentSchedule` validation                                                       | PARTIAL     | Bill terms are real and date-validated, but supplier defaults do not automatically drive financial party/document setup. One supplier stores zero credit days, the other has no stored field. Missing values are not approved policy.                                                                                                     |
| Invoice → approval → GL and customer/supplier ledger          | `/operations`, `/operations/:id/actions`; `FinancePostingService`; immutable items/events/journals                                                            | IMPLEMENTED | Independent approval, active company authority, open period, current evidence and atomic balanced effects exist. Live invoices cannot be prepared until policy/parties are configured.                                                                                                                                                    |
| Receipt/payment → allocated outstanding and bank GL           | Subledger settlement, bank master nominal/currency, GL and item-event writes in one transaction                                                               | IMPLEMENTED | Existing tests cover partial/cross-currency settlement, fees, FX, overdrafts and replay. End-to-end bank reconciliation after both AR/AP settlement journeys is still missing.                                                                                                                                                            |
| Approved purchase bill/payment → financial operation          | `/purchase/:id/prepare`, source-version checks, `procurement_accounting_link`, purchase bridge                                                                | IMPLEMENTED | Real source-owned recognition/payment integration exists; it is not missing. The four existing approved bills/instructions have no financial operations. Review accounting cutover before preparing them; do not auto-post the historical queue.                                                                                          |
| Credit notes/refunds/offsets → controlled accounting effects  | Existing recognition `kind=credit_note`, original-item validation, offset/settlement, governed reversal                                                       | PARTIAL     | Reduction/refund primitives exist and AR cases are tested. There is no explicit `debit_note` document kind in the financial contract. Add AP-specific signed-direction and tax/reversal acceptance coverage before choosing whether a compatible document label is sufficient.                                                            |
| AR/AP → aging and outstanding report                          | Shared `itemBalancesSql`, PostgreSQL event-date cutoff, grouped currency balances, existing balances UI and CSV export                                        | IMPLEMENTED | Current/1–30/31–60/61–90/over-90 buckets, dated balances and full-filter totals already exist. Reports routes open these persisted balances. Do not build a second aging engine.                                                                                                                                                          |
| Installment bill → aging dates                                | Procurement supports `percent_30_now_balance_60_days`; header due date is the final installment; financial recognition copies one due date for the whole item | DEFECTIVE   | Static implementation mismatch: the initial 30% is not independently aged. No new failing regression has been added during the read-only phase. Reproduce against PostgreSQL, preserve one invoice identity, and retain exact dated installment evidence for new postings. Do not rewrite existing posted history.                        |
| Financial request → project/department/cost-centre dimensions | Central posting validates semantic dimensions; purchase expense lines propagate source dimensions                                                             | PARTIAL     | Generic recognition/settlement request schemas have no dimensions field and generated lines begin with `{}`. Permit bounded applicable dimensions and reuse central validation; exact reversal must retain original dimensions.                                                                                                           |
| Invoice/settlement → tax and FX                               | Governed tax definitions/revisions/applications, central currency authority, realized/unrealized FX and reports                                               | PARTIAL     | Real implementations and regressions exist. Live company has zero active tax definitions and no complete FX policy. An empty tax catalogue does not establish an approved exempt treatment.                                                                                                                                               |
| Repeat/stale/unauthorized action → rejection                  | Scoped idempotency, company transaction locks, independent decisions, live permission recheck, preview hash, SQL constraints and forced RLS                   | IMPLEMENTED | Preserve all controls. New configuration must invalidate stale approval where its accounting or credit evidence changes.                                                                                                                                                                                                                  |
| Reversal → exact GL/open-item/audit compensation              | Central Finance reverse command, immutable subledger audit and events, dated reports                                                                          | IMPLEMENTED | Existing tests cover exact reversal, downstream cancellation ordering and revoked permissions. Add AP/AR note/configuration-specific regressions.                                                                                                                                                                                         |
| Financial reports → control reconciliation                    | Existing statements, GL, trial balance, P&L, balance sheet and reconciliation projection                                                                      | IMPLEMENTED | Existing company totals agree with real GL, but there are no live AP/AR items to reconcile yet. Full AR/AP posting journeys must assert zero native/base control differences and report totals.                                                                                                                                           |
| Complete authenticated AR and AP → bank reconciliation        | Existing multi-currency and bank-reconciliation browser harnesses                                                                                             | PARTIAL     | Existing AR browser flow passes through final receipt and historical reports, but does not reconcile that bank movement. Existing AP integration exercises real DB source-to-bank references, but is not the requested full independently authenticated browser journey.                                                                  |
| Tax purchase-chain regression fixture                         | `tests/integration/tax-management.test.ts` parameterized scenarios share one database/company                                                                 | DEFECTIVE   | Two of three cases create the same `Governed bill vendor` identity and fail the canonical duplicate guard. Give independent scenarios distinct identities or reuse an explicitly linked existing fixture master. Preserve duplicate protection.                                                                                           |
| Standalone reconciliation browser fixture                     | `run-bank-context-e2e-api.ts` → `provision-bank-payments-uat.ts` → bank account creation                                                                      | DEFECTIVE   | Provisioning the test `XBP` bank fails `guard_bank_account_company_currency`: the transaction currency is not active for that company. The parent times out waiting for readiness; no browser case runs. Activate the currency through legitimate disposable-fixture setup before creating its bank. Preserve the company-currency guard. |

## Important route distinction

`app/features/sales/views/sales-workspace.tsx` sends normal Customers, Invoices
and Receipts routes to the persistent financial workspace. Only the explicit
`prototype:` route opens sample Sales records. The latter's terms, credit limits,
orders and deliveries are in-memory and reset on reload. Do not claim that all
Sales pages are mock, and do not use the sample workflow for accounting evidence.
Completing the commercial quotation/order/delivery subsystem is outside this
AP/AR readiness batch.

## Recommended implementation sequence

The concrete design and alternatives are in
[the Phase 2 implementation design](../superpowers/specs/2026-11-19-ap-ar-readiness-design.md).

1. Repair the two test-fixture setup regressions and reproduce green baseline
   tax and reconciliation tests without changing accounting guards.
2. Add versioned party financial configuration, explicit readiness diagnostics,
   default terms and customer credit enforcement using the existing master/API.
   Keep the company's existing control-policy architecture. Update contracts,
   client/OpenAPI, backend, existing setup UI and PostgreSQL regressions together.
3. Correct installment aging for new financial evidence, propagate applicable
   generic dimensions, and verify AP debit/credit direction, tax and reversals.
   Reuse the existing report, posting and settlement implementations.
4. Extend independently authenticated customer and supplier browser journeys
   through posting, receipt/payment and bank reconciliation. Assert journal
   balance, native/base control reconciliation, bank balances, reports, audit
   evidence, replay protection and preserved historical cutoffs.
5. Rehearse any additive migration against a restored business-data backup;
   compare existing records and balances. Review approved live mappings/terms/
   credit and tax configuration before applying live configuration or processing
   existing approved documents. Deploy matching database/API/frontend versions.
6. Re-run the agreed regression suite and both complete authenticated journeys.
   Report software verification separately from owner business acceptance.

## Baseline verification

Results below were actually executed against the unmodified `030c23d` source.
No test was added, skipped to conceal a failure, or weakened during this audit.

- `tmp/stabilization-phase1/database.ps1 -Action preflight`: PASS; Finance 42,
  Procurement 8; zero integrity blockers/warnings and duplicate posted effects.
- `tmp/stabilization-phase1/verify-runtime.ps1`: PASS; matched pinned build,
  healthy dependencies/guards, actual bank/trial-balance agreement, read-only
  actual owner authority and two anonymous login browser viewports. This is
  not authenticated owner posting acceptance.
- `node --import tsx tmp/run-accounting-regressions.mjs
tests/integration/multi-currency-subledger.test.ts
tests/integration/purchase-bank-integration.test.ts
tests/integration/accounting-integrity.test.ts
tests/integration/canonical-business-parties.test.ts
tests/integration/banking-reconciliation-authority.test.ts
tests/integration/banking-reconciliation-adjustments.test.ts --maxWorkers=1`:
  **74 passed, 0 failed, 6 files**.
- `npm.cmd run test:contract -- tests/contract/multi-currency-subledger.test.ts`:
  **3 passed, 0 failed, 1 file**.
- `npm.cmd run test:unit -- tests/unit/purchase-bill-payment-terms.test.ts
tests/unit/purchase-suppliers.test.tsx --maxWorkers=1`:
  **17 passed, 0 failed, 2 files**.
- `npm.cmd run test:e2e:multi-currency`: **2 passed, 0 failed**; actual password
  login, independent maker/checker/poster and PostgreSQL effects. Covers canonical
  identity reload/duplicates and invoice → partial receipt → valuation → final
  receipt → dated report/reload. It does not include bank reconciliation.
- `node --import tsx tmp/run-accounting-regressions.mjs
tests/integration/tax-management.test.ts
tests/integration/procurement-workflow.test.ts --maxWorkers=1`:
  **45 passed, 2 failed, 2 files**. Procurement: 31 passed. Tax: 14 passed,
  2 failed on duplicate supplier fixture creation, before their document/posting
  assertions. They are acceptance blockers, not successful tax-chain evidence.
- `npm.cmd run test:e2e:bank-reconciliation`: **FAILED at fixture startup**.
  The API fixture rejects a bank whose test currency is not company-active;
  readiness times out. Zero browser cases executed in this run. Do not count
  this as a passed or skipped reconciliation test suite.
- `npm.cmd run api:check`: PASS; generated client/OpenAPI drift check.
- `npm.cmd run typecheck`: PASS; shared packages, API, worker and web.
- `tmp/stabilization-phase1/database.ps1 -Action verify`: PASS; historical
  financial/master records and native/base balances preserved; repeat preflight
  still has zero blockers/warnings.
- `git diff --check`: PASS; no production source changes. Existing unrelated
  `.env.example` and lockfile modifications remain untouched.

Executed assertions total **141 passed, 2 failed**: 119 integration passes and
2 integration failures across 8 files, 17 unit passes, 3 contract passes and
2 authenticated browser passes. The separate reconciliation harness startup
failure is additional and is not included in those executed-assertion counts.

## Business acceptance decisions

- Approve the company and eight control/revenue/expense/FX mappings, including
  whether existing inactive eligible nominals may be reactivated and how the
  incorrectly typed FX gain candidates should be handled.
- Supply approved customer identities, term defaults, credit limits/currency,
  supplier defaults and tax treatments. Do not infer these from sample data or
  zero/missing legacy fields.
- Review opening balances and cutover for the four unrecognized approved bills
  and payment instructions; existing operational approval is not Finance posting
  approval and cannot be treated as proof of financial settlement.
- Execute the owner-authorized journeys with the approved real configuration.
  Isolated test success does not by itself prove acceptance of the owner's
  business settings, opening balances or cutover.

## Implementation results

The existing company accounting policy remains the single source of AR/AP
control, income/expense and realized/unrealized FX mappings. No per-party control
override, duplicate ledger or generic-voucher bypass was introduced. All posting
continues through `FinancePostingService` and the existing approval architecture.

| Audited gap | Implemented correction | Evidence |
| --- | --- | --- |
| Financial terms and credit | Append-only settings for existing financial-party IDs; company, permission, expected-version, idempotency and immutable-audit guards. Customers require reviewed finite functional-currency credit before new invoices. Explicit zero prevents new credit; reviewed null terms retain manual due dates. | New configuration API, SQL constraints, UI and real PostgreSQL tests. |
| Concurrent or stale credit approval | Exposure includes all posted currencies and future-dated receivables; existing company lock serializes posting. Changed configuration requires fresh approval. Receipts and exact reversals remain available after lowering credit. | Concurrent posting, stale review, zero/exceeded limits and lowered-limit reversal tests. |
| Supplier terms | New bills with omitted terms inherit reviewed supplier settings; explicit manual dates and existing saved/approved source terms remain authoritative. Legacy supplier credit days remain visible for review. | Authenticated purchase-chain journey and existing purchase tests. |
| Installment aging | New invoices preserve an approved, immutable dated schedule. One SQL installment authority drives aging and supplier outstanding reports; receipts apply oldest-first. Historical items retain their original evidence. | Failing regression reproduced, then installment/cutoff/partial-payment/report tests passed. |
| Dimensions | Bounded master selections and request fields reuse central semantic validation. Source purchase metadata cannot be supplied by generic clients. Reversals retain original IDs after a master becomes inactive. | PostgreSQL cross-company, invalid dimension and historical reversal checks. |
| AP notes | Supplier-issued debit notes use the existing positive invoice effect; credit notes use the controlled reducing effect, offsets, settlements and exact reversals. | AP note/payment/reversal tests with zero GL control differences. |
| Bank manual selection | Corrected PostgreSQL locking of an optional outer-joined selection. The already locked reconciliation header serializes changes; captured ledger rows and upserted selections remain locked. | Real authenticated AR journey reproduced the previous 500; both complete journeys and manual reconciliation regression now pass. |
| Baseline fixture regressions | Unique supplier identities in independent tax scenarios; company-active currency in the disposable bank fixture. Updated browser selectors and load synchronization to current approved screens. | Tax regression and all three manual/CSV/Excel browser cases. |

No customer, supplier, bank, nominal, opening balance, live financial setting or
existing transaction was configured or posted by this implementation. Existing
unrelated `.env.example` and lockfile working changes are preserved.

### Files and migration

- Finance migration `0043_party_financial_configuration.forward.sql`: one
  append-only configuration history, optional new-item schedule evidence,
  installment function, authority/audit/credit/immutability guards and scoped
  application grants. No business backfill or destructive DDL.
- Contracts: `packages/contracts/src/finance/subledger{,-openapi}.ts`, generated
  client/OpenAPI and the shared exact payment-term calculator.
- Backend: existing subledger repository/router/queries/connected reports,
  procurement defaults, reconciliation row locking and API readiness.
- UI: `multi-currency-workspace.tsx`, new `party-financial-setup.tsx` and the
  existing purchase bill/document forms. Existing routes, controls, permissions
  and historical forms remain in place; no stylesheet retired.
- Tests: `ap-ar-readiness.test.ts`, `ap-ar-acceptance.spec.ts`, financial setup
  unit tests, contract snapshot/endpoint coverage and existing financial fixtures
  and browser regressions. New `npm.cmd run test:e2e:ap-ar` uses the existing
  isolated harness; it cannot configure the local business database.

### Authenticated workflow evidence

`npm.cmd run test:e2e:ap-ar`: **2 passed, 0 failed**. Three real password-authenticated
browser contexts act as maker, checker and poster. Both flows use the independent
API and actual disposable PostgreSQL; no financial response is mocked.

- AR: UI customer creation and reviewed terms/credit → invoice → independent
  approval/posting → allocated receipt → approved bank reconciliation.
- AP: supplier creation/adoption → reviewed terms → independently approved
  requisition/RFQ/order/receipt/bill → separate Finance approval/posting →
  independently approved payment instruction → Finance payment → approved bank
  reconciliation.
- Direct scoped DB and report assertions verify balanced native/base journals,
  zero AP/AR control differences, settled outstanding amounts, bank reconciliation
  balance, three audit actors, one posting effect per source and trial-balance
  totals against journal SQL. Fresh-key duplicate posting is rejected.
- Evidence: `tmp/ap-ar-readiness-phase2/evidence/{receivables,payables}.json` and
  `ap-ar-playwright.log`; source scenarios remain committed under `tests/e2e`.

### Regression verification

| Check actually executed | Result |
| --- | --- |
| `npm.cmd run test:unit -- --maxWorkers=1` | 1,630 passed, 0 failed; 204 files. |
| `npm.cmd run test:contract` | 27 passed, 0 failed; 6 files. Includes the new versioned endpoint and OpenAPI snapshot. |
| `node --import tsx tmp/run-accounting-regressions.mjs` with the 26 financial files below and `--maxWorkers=1` | 266 passed, 0 failed; 26 files. Actual disposable PostgreSQL migrations/transactions; no skipped cases. |
| `npm.cmd run test:e2e:ap-ar` | 2 passed, 0 failed; both required authenticated posting-to-reconciliation journeys. |
| `npm.cmd run test:e2e:multi-currency` | 2 passed, 0 failed; canonical identities, invoice/partial receipt/valuation/final receipt and historical reports. |
| `npm.cmd run test:e2e:bank-reconciliation` | 3 passed, 0 failed; manual reconciliation, CSV persistence/reload and saved Excel mapping. |
| `npm.cmd run typecheck` | Passed: shared packages, API, worker and web. |
| `npx.cmd tsc --noEmit --pretty false -p tmp/tsconfig-ap-ar-tests.json` | Passed for changed tests, including new integration/browser/UI files. Corrected request defaults and narrowed existing helper result types. |
| `npm.cmd run api:check`; `npm.cmd run catalogue:check` | Both passed; generated API/client/OpenAPI and catalogue aligned. |
| `npm.cmd run build:web` | Passed: optimized Next.js production output. |
| `node scripts/audit-ui-theme.mjs --write`, then `--check` | Both passed; zero direct view-source font/colour exceptions. |
| Targeted ESLint; `git diff --check` | Passed at source verification; repeated at final handoff. |

Financial files exercised: `accounting-integrity`, `canonical-business-parties`,
`banking-reconciliation-adjustments`, `banking-reconciliation-authority`,
`banking-reconciliations`, `banking-payments`, `banking-receipts`,
`banking-transfers`, `banking-revaluations`, `finance-posting`,
`finance-journal-staging-hardening`, `finance-nominals`, `multi-currency-subledger`,
`procurement-workflow`, `purchase-bank-integration`, `fixed-assets`,
`fixed-assets-extension`, `fixed-assets-preparation-batch`,
`fixed-assets-attachments`, `budget-controls`, `tax-payroll-posting`,
`tax-management`, `hr-payroll-journal`, `hr-payroll-journal-dimensions`,
`hr-payroll-payment`, `ap-ar-readiness` (all under `tests/integration/*.test.ts`).

Intermediate failures were investigated rather than suppressed: a new supplier
report assertion expected two decimal places instead of its established eight;
the OpenAPI path list needed the new endpoint; stale bank browser selectors and
loading synchronization were updated; the new AP journey was corrected to use
the mandatory approved source chain. The real PostgreSQL optional-row locking
defect is corrected in production code as described above.

The expanded security run initially reported 50 passed, 11 failed and 2 skipped:
missing fixture company currency, a fixture adding lines after journal posting,
and a fiscal test tied to an externally seeded database name. Corrections use
active company-currency fixture setup, draft → lines → posted staging, and a
fresh disposable fiscal calendar created through its existing repository. No
accounting validation, security assertion or production business record changed.
Final rerun: `node --import tsx tmp/run-ap-ar-security.mjs --maxWorkers=1`:
**63 passed, 0 failed, 0 skipped; 13 files**. This wrapper uses the same validated
disposable database lifecycle as the financial runner and the repository's
`vitest.security.config.ts`. It never consumes the protected business URL.

The final security fixes preserve every security assertion. The fiscal fixture
now creates its own calendar and immutable history through the existing service
with explicitly scoped test permissions, including period-read and Super Admin
authority. The nominal fixture uses a legitimate active company currency; the
reconciliation fixture stages lines before assigning a posted journal number.

### Database migration and preservation

- Fresh maintenance backup:
  `tmp/backups/ap-ar-readiness-1795090906161.dump`;
  SHA-256 `94f9a94cf761885960ba877bbf81858bd25ff16c3eb19f2a563954cdd8500239`.
  Protected connection values remain in the existing private runtime store and
  were not copied into source or reports.
- `database.ps1 -Action backup`, then `-Action rehearse`: consistent exported
  PostgreSQL snapshot restored to a separately named, validated disposable
  database. All 363 pre-existing non-migration-metadata tables were fingerprinted
  before/after; all original party fields and all posted native/base account
  balances were preserved. Migration rerun made no changes. The temporary restore
  database was removed through its validated test-only lifecycle.
- `database.ps1 -Action migrate`: **passed** with the verified old web/API stopped.
  Immediate pre-migration fingerprints matched the rehearsed backup. Applied
  Finance **42 → 43** through the existing migration runner; Procurement remains
  **8**, with every other module version unchanged. No pending Procurement
  migration was reapplied as a new change.
- `database.ps1 -Action verify`: **passed** after startup. Live comparison confirms
  preserved historical financial/master records and every posted native/base
  balance, with zero integrity blockers/warnings. The migration additionally
  verified all 363 original table fingerprints. New configuration rows and
  historical non-null due schedules remained zero: no business defaults,
  opening balances, old invoices or payments were backfilled.
- Private evidence: `tmp/ap-ar-readiness-phase2/{backup,rehearsal,migration,live-verification}.json`.
  Finance 43 SQL hash:
  `01eaa5b9810265391567ebffff300484f1807e182a14267abb3e9d6755ef1c81`.

Rollback is a software-release operation, not a business-data reset. Retain the
additive schema and backup; never delete posted evidence or drop configuration
history. Once Phase 2 settings or installment evidence are used, prefer a forward
correction. An older binary does not understand the new defaults/reporting and
is not a general rollback plan for an active Phase 2 ledger.

### Active matched release

- API port **4000**, PID **8292**; web port **3000**, PID **27132**. Both use
  `tmp/ap-ar-readiness-phase2/release/source`; frontend build ID
  **`nXe0dnHNr_y0YWqWMezFO`**. Finance 43 / Procurement 8 match the compiled API
  readiness requirements. All readiness checks pass, including the new party
  configuration check, accounting integrity and canonical business parties.
- `verify-runtime.ps1`: **passed**, business writes **0**. Original owner account
  remains resolvable and has scoped financial permissions. Both companies' new
  workspace readiness projections load through the real application DB role.
  That role remains non-superuser and cannot bypass RLS; configuration permits
  SELECT/INSERT and denies UPDATE/DELETE/TRUNCATE. Unscoped business reads return
  zero rows; anonymous business API requests return 401.
- Existing supplier directory returns two real suppliers. All four real bank
  balances match their posted ledger lines; the real trial balance matches
  journal SQL and balances. No financial settings, items or transactions were
  fabricated to make readiness look complete.
- Actual desktop/mobile login smoke checks pass with zero JavaScript errors;
  every served initial script matches the pinned production build. Evidence:
  `tmp/ap-ar-readiness-phase2/runtime-verification.json` and `live-login-*.png`.
  The original owner's password was not supplied, so these live browser checks
  are login-page checks, not owner-authenticated posting acceptance. The seven
  successful authenticated financial browser cases ran separately against
  disposable PostgreSQL databases.
- Restart the current matched release from the repository with
  `tmp/latest-local-runtime/start.ps1 -Service api` and `-Service web`. It now
  delegates to the Phase 2 pinned helper. `api-preview` retains port 4011 support.
  Do not restart the old Phase 1 helper as if it were the current release.

### Recommendation and remaining work

**Software verification passed. Owner business accounting acceptance remains
pending configuration and authorized business journeys.** The real company still
has no financial policy, adopted financial parties or active tax definitions;
an empty control reconciliation does not prove configured accounting readiness.

Next, review the eight eligible account mappings (AR, AP, income, expense and
four FX mappings), existing inactive `230201`/`120101`, real customer identities,
supplier adoption/terms, finite customer credit and tax treatments. Confirm
opening balances and the four approved bills/payment instructions before any
cutover posting. Then run the two approved owner-authenticated live journeys and
review subledgers, bank reconciliation, trial balance and financial reports.
No stock, manufacturing, wider commercial Sales or other module integration was
started in this batch.
