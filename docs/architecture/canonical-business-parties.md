# Canonical customer and supplier references

Rollout follow-up, 19 November 2026: Procurement 8 is now active on the local
business database with the compatible pinned API/frontend. See the
[stabilization verification](integration-stabilization-phase1.md). Execution-only
deployment limits and test counts below describe the original implementation.

Implemented scope: the approved customer/supplier master-reference batch after
Accounting Integrity Guards. No new stock, sales-document, procurement posting,
employee, bank, product or warehouse integration is enabled.

## Behavior and ownership

- `party` remains the shared master, with company ownership for business records.
  Legacy employee/unclassified rows retain their existing scope.
- `finance_party_master_link` gives each immutable financial party one permanent
  company-scoped canonical reference. Foreign keys validate the company and source
  supplier. Existing IDs, codes, documents and financial snapshots are retained.
- `finance_party_directory` is an invoker-rights projection of current master
  names, status and risk. Financial workspaces, statements, purchase links and
  asset source selectors reuse it. Posted financial amounts/history are unchanged.
- New normalized name or nonempty tax-ID collisions in the same company and role
  are rejected with `PARTY_IDENTITY_EXISTS`. These are conservative duplicate
  candidates, not proof that two legal entities are identical. Company/role scoped
  locks protect concurrent checks. No fuzzy matching or historical merging occurs.
- Repeated explicit supplier linking returns the same financial identity, even
  with another request key. An arbitrary foreign-company or wrong-role source
  cannot be linked. Normal idempotency replay remains intact.
- Finance-origin supplier onboarding creates an **inactive** Purchasing profile
  for the same master, with the existing mandatory immutable Purchasing audit.
  The shared audit writer was extracted without changing its hash construction,
  protected profile handling or audit constraint. Vendor authority must complete
  and activate that profile before operational use. Finance receives no new vendor
  edit, activation or purchase permissions.
- New financial activity requires an active, unblocked canonical party. Supplier
  deactivation/renaming flows through the existing authorized vendor editor.
  Exact historical reversals remain available after master deactivation.
- Business masters and bindings enforce company access through RLS; the directory
  view preserves caller RLS. Existing tenant policies are retained.

## API and frontend

`GET /api/v1/finance/subledger/supplier-masters` requires current financial read
authority for the requested company. It supports literal name/code search,
`limit` 1–100 and bounded `offset`. It returns only IDs, codes, names, status/risk
and a count; profiles, contacts, banking details and financial balances are absent.

Party responses add optional `canonical_party_id`, `status` and `risk_status`
metadata compatibly. Contracts, OpenAPI and generated web client changed together.
The existing Accounting/Sales financial workspace now links a supplier from this
bounded directory instead of asking for a copied supplier ID. Its design, shared
controls, company remount behavior and existing posting flows are preserved.

## Migration and deployment limits

`procurement/0008_canonical_business_parties.forward.sql` follows Procurement 7,
after both Finance and Procurement foundations exist on a fresh database. Readiness
requires its exact recorded identity. Apply through the existing migration runner.

Only explicit existing source IDs establish a legacy supplier link. Legacy
financial-only parties receive canonical masters without inventing operational
profiles or rewriting financial evidence. Their Purchasing cutover still requires
reviewed, audited onboarding. Existing duplicate candidates remain separate and
must be reviewed before migration into operational workflows.

Broken explicit references, identity/code collisions or conflicting company/role
ownership fail the migration transaction; do not delete or rewrite financial rows
to make it pass. Back up and perform scoped data preflight before any release.
Deploy the compatible API/audit writer with the migration. Older application code
cannot create unaudited new supplier profiles after this migration; rollback must
retain a compatible writer or suspend that creation path, not remove audit guards.

No business database was inspected, migrated or posted in this execution.

## Read-only preflight

Run under approved tenant/company read scope; `$1` and `$2` are the tenant and
company parameters. A clean disposable database does not establish business-data
quality. These queries use predecessor-schema fields and can run before migration.

```sql
-- Broken explicit links block the migration. No matching by display name.
SELECT f.id,f.source_supplier_id
FROM finance_subledger_party f
LEFT JOIN procurement_supplier s
 ON (s.tenant_id,s.company_id,s.id)=(f.tenant_id,f.company_id,f.source_supplier_id)
LEFT JOIN party p ON (p.tenant_id,p.id)=(s.tenant_id,s.id)
WHERE f.tenant_id=$1 AND f.company_id=$2 AND f.source_supplier_id IS NOT NULL
 AND (f.kind<>'supplier' OR s.id IS NULL OR p.type IS DISTINCT FROM 'vendor');

-- Duplicate candidates are preserved and require an explicit identity decision.
WITH candidates AS (
 SELECT s.id,'vendor' AS role,s.name,s.tax_id FROM procurement_supplier s
 WHERE s.tenant_id=$1 AND s.company_id=$2
 UNION ALL
 SELECT f.id,CASE f.kind WHEN 'customer' THEN 'customer' ELSE 'vendor' END,f.name,''
 FROM finance_subledger_party f
 WHERE f.tenant_id=$1 AND f.company_id=$2 AND f.source_supplier_id IS NULL
)
SELECT role,lower(regexp_replace(btrim(name),'\s+',' ','g')) AS candidate_name,
       array_agg(id ORDER BY id) AS ids
FROM candidates GROUP BY role,lower(regexp_replace(btrim(name),'\s+',' ','g'))
HAVING count(*)>1;

SELECT f.id,f.code FROM finance_subledger_party f JOIN party p
 ON (p.tenant_id,p.id)=(f.tenant_id,f.id)
WHERE f.tenant_id=$1 AND f.company_id=$2 AND f.source_supplier_id IS NULL;

-- Legacy financial suppliers needing a separately audited operational profile.
SELECT id,code,name FROM finance_subledger_party
WHERE tenant_id=$1 AND company_id=$2 AND kind='supplier' AND source_supplier_id IS NULL;
```

Also check duplicate nonempty normalized tax IDs, expected scoped codes, inactive
or blocked sources and the GL/subledger preflight in
[Accounting Integrity Guards](accounting-integrity-guards.md). Do not auto-merge
candidate IDs or fabricate profile activation/approval history.

## Verification

- Final financial database batch: **107 passed across six suites**, including
  **13 canonical-master tests**, Accounting Integrity Guards, multi-currency
  subledger, purchase-bank, assets and budget controls.
- Existing Procurement workflow/profile encryption/audit suite: **31 passed**.
  Total database regression coverage in the final runs: **138 tests, seven suites**.
- Focused UI/unit regressions: **51 passed across four files**.
- API contracts: **26 passed across six files**; API drift check passed.
- Authenticated Chromium: **two scenarios passed** (1.2 minutes), covering master
  creation, duplicate rejection, supplier reuse, denied cross-company reads,
  directory bounds, reload and the existing invoice/receipt/FX/reporting lifecycle.
  Responsive light/dark evidence: `tmp/multi-currency-evidence/canonical-supplier-*`.
  Desktop light and mobile dark captures were visually inspected.
- Populated predecessor-schema upgrade: four legacy financial identities bound;
  posted journal, line, accounting-event, open-item-event and financial-party
  hashes unchanged. Duplicate legacy candidates remained separate. A second
  migration run made no changes. The final fixture was disposed.
- Non-owner-role tests verify both permitted access and denied company/tenant
  reads. Direct unaudited onboarding rolls back all master/financial rows.
- Type checks, focused integration-test compilation, targeted ESLint, production
  web build, whitespace checks and theme audit passed. Theme audit reports zero
  direct feature-view font/color exceptions.

Commands include `node --import tsx tmp/run-accounting-regressions.mjs` with the
six named integration files, `node --import tsx
tmp/verify-canonical-party-upgrade.mjs`, `npm.cmd run test:unit -- --maxWorkers=1`
with the four changed/dependent unit files, `npm.cmd run test:contract`,
`npm.cmd run typecheck`, `npm.cmd run api:check`, `npm.cmd run build:web`,
`npx.cmd tsc --noEmit -p tmp/tsconfig-accounting-tests.json`, and
`node scripts/audit-ui-theme.mjs --write` / `--check`.
Browser command: `npm.cmd run test:e2e:multi-currency`. The initial browser run
exposed an incorrect test expectation for validation (HTTP 400 is the established
response) and was interrupted by a simultaneous production build clearing its
temporary Next output. Both scenarios passed after fixing the assertion and
running browser acceptance after the build. No validation rule was relaxed.

The earlier existing reconciliation ledger-refresh failure remains as documented
in the accounting-guard handoff. It was not changed in this master-reference batch.

## Files

- Migration 0008 above; no existing migration edited in this batch.
- `server/api/src/modules/procurement/{source-repository,audit-writer}.ts`.
- `server/api/src/modules/finance/subledger/{source-repository,router,queries,reports,purchase-bridge,connected-reports}.ts`.
- Existing asset read projections in `fixed-assets/{lifecycle,sources,source-repository}.ts`.
- `server/api/src/server.ts` readiness.
- `packages/contracts/src/finance/{subledger,subledger-openapi}.ts`, client generator,
  `openapi-v1.json` and generated `app/lib/api/generated.ts`.
- `app/features/finance/views/multi-currency-workspace.tsx`.
- Canonical-master integration suite; adjusted-bill supplier fixture names in the
  existing multi-currency suite are now distinct rather than duplicate masters.
- Existing settlement UI/unit suite, OpenAPI route inventory and authenticated
  multi-currency browser suite.

Next: review the scoped business-data preflight and legacy supplier cutover before
release activation; then take a separate canonical employee-reference batch.
