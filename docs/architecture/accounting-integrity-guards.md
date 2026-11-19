# Accounting integrity guards

Rollout follow-up, 19 November 2026: Finance 42 is now active on the local
business database with the compatible pinned API/frontend. See the
[stabilization verification](integration-stabilization-phase1.md). Execution-only
deployment limits and test counts below describe the original implementation.

Scope: Phase 2 accounting protection only. No stock ledger, commercial Sales,
Procurement, Manufacturing or canonical-master integration is enabled by this work.

The [Phase 1 audit](2026-11-17-integration-audit.md) was rechecked against the
current posting service, Finance migrations 1–41, source repositories, contracts
and integration tests. The existing central ledger writer, lifecycle and currency
authority remain the implementation foundation. Existing uncommitted navigation,
environment-example and lockfile changes were preserved.

## Changed files

- `packages/db/source-migrations/finance/0042_accounting_integrity_guards.forward.sql`
- `server/api/src/modules/finance/posting/{service,source-repository,types}.ts`
- `server/api/src/modules/finance/journals/source-repository.ts`
- `server/api/src/modules/banking/nominal-directory.ts`
- `server/api/src/modules/banking/{payments,receipts}/source-repository.ts`
- `server/api/src/server.ts`
- `tests/integration/accounting-integrity.test.ts`
- `tests/integration/{finance-posting,budget-controls,banking-payments,banking-receipts,banking-revaluations,finance-journal-staging-hardening}.test.ts`
- `tests/unit/finance-posting.test.ts`
- This handoff document.

## Posting boundary

All active application ledger writers continue to use
`FinancePostingService` and its caller-owned transaction. Both single-currency
and multi-currency posting now validate company-owned semantic dimensions and
reject AP/AR control accounts outside the governed subledger workflow. Existing
currency authority, period checks, balanced arithmetic, authorization, approval,
idempotency, audit and compensating-reversal paths remain in place.

Bank Payment/Receipt and Manual/Recurring Journal account directories exclude
configured control accounts; their server-side line validators also reject them.
The existing forms consume those directories, with no UI redesign or contract
change. Historical control accounts from retained policy versions stay protected.

## Migration

`finance/0042_accounting_integrity_guards.forward.sql` adds:

- Shared control-account and dimension reference validation functions.
- An INSERT guard for journal lines and immutable journal-line identities.
- Deferred journal checks for balance, active company, account ownership,
  period, currency precision/conversion, source event and exact reversal effects.
- Commit-time GL/open-item control reconciliation in base currency and each
  foreign currency, including required posted source-operation evidence.
- Policy-adoption checks preventing bank controls or unmatched historical GL
  balances from being adopted as AP/AR controls.
- A company-scoped shared posting/exclusive policy lock, preventing control
  adoption from racing a journal's final integrity check and commit. Postings
  share this lock; policy changes take it exclusively.
- A unique posted accounting-event source/operation index. Different external
  idempotency keys cannot create another posted effect for the same source.

Existing posted rows are not rewritten. Re-running the migration chain skips its
recorded identity. The API readiness check requires Finance migration 42 before
the new release is ready to serve financial workflows.

Apply through the normal source migration runner after the normal backup,
preflight and release review. Verification uses disposable PostgreSQL databases
on the documented test service, not the business database. This change does not
activate a new local business release or post existing instructions.

## Dimension behavior

New postings validate supplied `project`, `location`, `department`, `branch`,
`division`, `business_unit`, `warehouse`, `cost_center` and `cost_centre` values
against active masters in the transaction company. Conflicting cost-centre
aliases are rejected. Existing required-dimension rules remain enforced.
Custom dimensions/source-line metadata retain the existing bounded string shape;
this phase does not invent a new master catalogue for them.

Reversals copy the exact original account, currency, amount and dimension multiset.
They can therefore compensate a historical journal after a referenced dimension
is deactivated, without accepting a new posting against that inactive master.
An unposted legacy draft with free-text semantic dimensions must be corrected to
real master IDs before posting. No historical dimensions are automatically relabeled.

## Accounting reconciliation

The GL's base-currency effects must equal signed open-item effects for each
control account. Native foreign currencies also reconcile independently. Explicit
base-currency valuation/carrying-value adjustment lines reconcile through the
base check; they are not mistaken for new base-currency invoices.

The original item-event guard already checked effects when an item event was
inserted. The new journal guard also checks from the GL side, so omitting all
item events or merely claiming an internal subledger source cannot bypass it.

Before deployment, inspect existing differences and duplicate source effects.
These checks must run under the approved tenant/company read scope; a clean test
database does not establish that business balances reconcile.

```sql
-- Duplicate posted effects cause the unique-index migration to fail closed.
SELECT tenant_id, source_type, source_id, payload->>'operation' AS operation,
       count(*) AS effects
FROM accounting_event
WHERE tenant_id=current_setting('nexora.tenant_id',true)
  AND state='posted' AND payload->>'operation' IN ('post','reverse')
GROUP BY tenant_id,source_type,source_id,payload->>'operation'
HAVING count(*)>1;

-- Base-currency reconciliation, retaining original and compensating journals.
WITH controls AS (
 SELECT tenant_id,company_id,receivable_account_id AS account_id
 FROM finance_subledger_policy
 WHERE tenant_id=current_setting('nexora.tenant_id',true)
 UNION
 SELECT tenant_id,company_id,payable_account_id
 FROM finance_subledger_policy
 WHERE tenant_id=current_setting('nexora.tenant_id',true)
), ledger AS (
 SELECT j.tenant_id,j.company_id,l.account_id,
        sum(l.base_debit-l.base_credit) AS balance
 FROM journal_entry j JOIN journal_line l
   ON l.tenant_id=j.tenant_id AND l.journal_id=j.id
 WHERE j.tenant_id=current_setting('nexora.tenant_id',true)
   AND j.status IN ('posted','reversed')
 GROUP BY j.tenant_id,j.company_id,l.account_id
), items AS (
 SELECT i.tenant_id,i.company_id,i.control_account_id AS account_id,
        sum(e.base_delta*CASE WHEN i.side='receivable' THEN 1 ELSE -1 END) AS balance
 FROM finance_subledger_item i JOIN finance_subledger_item_event e
   ON (e.tenant_id,e.company_id,e.item_id)=(i.tenant_id,i.company_id,i.id)
 WHERE i.tenant_id=current_setting('nexora.tenant_id',true)
 GROUP BY i.tenant_id,i.company_id,i.control_account_id
)
SELECT c.*,coalesce(l.balance,0)-coalesce(i.balance,0) AS difference
FROM controls c LEFT JOIN ledger l USING(tenant_id,company_id,account_id)
LEFT JOIN items i USING(tenant_id,company_id,account_id)
WHERE coalesce(l.balance,0)<>coalesce(i.balance,0);
```

Do not delete or merge historical postings to satisfy these checks. Differences
need reviewed source-linked correction and opening/cutover evidence. Retain the
additive guards during application rollback; do not restore the bypass as a fix.

## Verification record

The new database suite reproduces the original bypasses before the fix and covers
control rejection, semantic references, native/base reconciliation, commit rollback,
line append/reassignment, replay/concurrency, policy adoption and faithful reversal.
The normal financial regressions and isolated authenticated browser acceptance
were run alongside it. Final database results: **170 tests passed in 15 suites**,
including **22 accounting integrity tests**. The tests used fresh disposable
PostgreSQL databases and real commit/rollback behavior. Migration identity,
idempotent reruns and unchanged posted-history hashes were asserted. No business
database was migrated or inspected as part of these tests.

Commands executed for final database verification:

```powershell
node --import tsx tmp/run-accounting-regressions.mjs tests/integration/accounting-integrity.test.ts tests/integration/multi-currency-subledger.test.ts tests/integration/purchase-bank-integration.test.ts tests/integration/tax-payroll-posting.test.ts tests/integration/budget-controls.test.ts tests/integration/finance-posting.test.ts tests/integration/banking-payments.test.ts tests/integration/banking-receipts.test.ts tests/integration/banking-transfers.test.ts tests/integration/hr-payroll-journal.test.ts tests/integration/hr-payroll-journal-dimensions.test.ts tests/integration/hr-payroll-payment.test.ts tests/integration/fixed-assets.test.ts
# 13 suites, 158 tests passed.
node --import tsx tmp/run-accounting-regressions.mjs tests/integration/banking-revaluations.test.ts
# 1 suite, 10 tests passed.
node --import tsx tmp/run-accounting-regressions.mjs tests/integration/finance-journal-staging-hardening.test.ts
# 1 suite, 2 tests passed.
```

The local `tmp/` wrapper creates and migrates an isolated bootstrap database,
supplies the existing Vitest integration configuration with test-only URLs, then
drops its database. The committed tests use the repository's normal disposable
database helpers. Earlier concurrent verification attempts timed out during
schema setup; the sequential runs above completed without relaxed timeouts.

The unrestricted unit run produced 1,615 passes and eight failures across five
files during concurrent verification. All five files plus the central posting
suite passed with one worker: 87 tests, six files. No unit assertions or timeouts
were relaxed. The standard type check, targeted ESLint, API contract drift check,
new database-test compilation and production web build passed.

Additional commands/results:

```powershell
npm.cmd run test:unit
# 1,615 passed, 8 failed during concurrent verification.
npm.cmd run test:unit -- --maxWorkers=1 tests/unit/finance-posting.test.ts tests/unit/finance-journals-workspace.test.tsx tests/unit/reference-masters-api.test.ts tests/unit/import-boundaries.test.ts tests/unit/purchase-document-form.test.tsx tests/unit/hr-employee-wizard.test.tsx
# 87 passed, including all previously failing files.
npm.cmd run typecheck
npx.cmd tsc --noEmit -p tmp/tsconfig-accounting-tests.json
npm.cmd run api:check
npm.cmd run build:web
git diff --check
# Each passed; targeted ESLint passed for every changed TypeScript file.
npm.cmd run test:e2e:multi-currency
# 1 authenticated Chromium scenario passed (57.6 seconds).
```

Browser acceptance exercised independently authenticated approval/posting,
invoice, partial receipt, FX valuation, final receipt, zero control difference,
historical reporting and reload. Evidence is under `tmp/multi-currency-evidence/`;
the runner used its isolated API/web/database runtime and restored generated files.

Fixture corrections preserve each original assertion: Finance and Bank tests now
use real department IDs; the budget rollback test uses a bank offset rather than
an unsupported AP bypass; Bank Revaluation records the historical FX rate matching
its existing amounts. The staging journal fixture's missing EUR adoption was
reproduced on unchanged HEAD, repaired in test setup, and its real lifecycle then
passed with the new guards.

The Bank Reconciliation governed-adjustment integration test fails at its final
submit with `RECONCILIATION_LEDGER_REFRESH_REQUIRED`
(`banking-reconciliation-adjustments.test.ts:556`). The same failure and stack
were reproduced against unchanged HEAD source and migrations through Finance 41
in a separate disposable database. Its ledger-refresh safeguard remains intact;
this phase does not claim that reconciliation defect is resolved.

Next implementation task, after approval: canonical customer/supplier identity
references and a business-data reconciliation preflight. Stock and other module
integrations remain outside this execution.
