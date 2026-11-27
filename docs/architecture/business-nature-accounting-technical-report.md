# Business-nature accounting: technical implementation report

Date: 27 November 2026.

**Status: implemented and verified locally; production rollout and production
root-cause confirmation remain blocked by Railway access.** No production
database was migrated, reseeded, restarted or posted to during this work.

## 1. Missing master data: findings and evidence

The read-only audit found concrete initialization gaps in this checkout:

- First-login organisation setup writes browser storage, not company accounting
  records. Public `/register` validates a form but does not create an organisation.
- The Administration repository interface has no production implementation wired
  into `server.ts`. Its original Companies view only read the HR directory.
- Central chart import, publication and company adoption already existed, but
  adoption was a separate manual step. It was not linked to business nature or
  company creation. Ordinary template nominals started as review-required drafts.
- Legal organisation type did not represent industry/business nature. An IT
  company could select a legal form, but no IT accounting template was selected.
- API persistence uses `DATABASE_URL`. Source migrations run at startup only
  when `DATABASE_AUTO_MIGRATE=true`; the default is false. Docker startup does
  not copy local business records into a deployed PostgreSQL database.
- Migration 0034 had replaced the company-chart mapping guard and lost the
  earlier explicit bank-definition binding branch. This prevented the existing
  audited bank-definition workflow from completing. Migration 0044 restores it
  while retaining the later nominal-edit safeguards.

These defects explain why company setup could leave a deployed company without
accounting masters. **They do not prove that Railway deleted existing records,
or establish which database the deployed API currently uses.** A different
database, incomplete migration state, inactive records and company filtering
still require authenticated production inspection.

The supplied public web address returned HTTP 200; its API health endpoint also
returned 200, and an unauthenticated session request correctly returned 401.
On follow-up, the public `/api/v1/finance/business_setup/natures` endpoint
returned HTTP 404 with `NOT_FOUND` while health still returned 200. The deployed
API therefore does not expose the implemented company-setup feature. This
confirms rollout is incomplete; it does not establish production data loss.
Railway CLI returned `invalid_grant` / `Unauthorized`, and no project was linked.
Only a public web URL was supplied, not an authenticated project/dashboard URL.

## 2. Database migration and preservation

New migration: `packages/db/source-migrations/finance/0044_business_nature_setup.forward.sql`.

- Adds a database business-nature catalogue with eight initial natures.
- Extends the existing `finance_chart_template` with optional nature and role
  mappings; legacy template imports remain supported.
- Adds one immutable `finance_company_business_setup` record per company.
- Uses tenant/company/type foreign keys, an exact template/nature foreign key,
  adoption and currency foreign keys, uniqueness and company-scoped forced RLS.
- Requires the initiating actor's live global Super Admin authority and immutable
  adoption evidence before setup can be recorded.
- Adds a template-driven bank-section lookup with the historical `2309` fallback.
  This permits compatible templates using existing codes such as `2002`.
- Changes no existing account, party, journal, balance, company code or bank row.
  It performs no company reseed or financial posting.

Applied only to fresh local disposable PostgreSQL databases. Fresh-schema and
idempotent migration tests passed. Source migration snapshots were updated to
include the current complete migration chain; older tests also needed their
obsolete currency fixtures corrected to respect company currency ownership.

## 3. Templates and company initialization

Baseline manifests live centrally in
`packages/db/catalogs/business-natures-v1.json`. Natures: IT/software, non-profit,
corporate, retail/wholesale, manufacturing, professional services, government,
and other business. They provide shared classifications plus nature-specific
income, capital/fund and expense accounts.

An authorized setup command imports/publishes a missing baseline into the
**existing database template tables once**. Later companies use the latest
published database revision for that nature. Published definitions and adopted
company identities retain their existing immutable history. The seed definition
hashes identify canonical per-nature definitions, not mutable frontend lists.

An additional nature can be added through a controlled catalogue migration and
an existing chart-template import/publication carrying its nature and role
mappings. Frontend components do not contain Sections, Categories or Nominals.

Setup is one transaction: company identity/access when creating a company,
currency configuration, chart adoption, nominal classification/activation,
AP/AR policy, approved Transfer/FX defaults and setup evidence. Errors roll back the entire command. Scoped
locks and idempotency prevent duplicate initialization. A second request for an
already initialized company returns its original configuration; changing its
nature does not replace its chart.

The Administration Companies screen now supports authenticated company creation
and existing-company accounting setup using this API. This creates real HR
company identities and PostgreSQL accounting records within an existing tenant.
Public creation of a brand-new tenant through `/register` remains the existing
prototype and has not been represented as live registration.

## 4. Accounting hierarchy and manual accounts

The repository and supplied screenshot use **Category → Section → Nominal**.
That established hierarchy is retained, with business nature selecting its
template. Reversing historical account parents was deliberately avoided.

Existing exact, active root categories are reused with their original codes and
IDs. Ambiguous/inactive/name-conflicting roots and differently numbered Sections
fail for review rather than being duplicated or renumbered. A compatible imported
template can preserve an existing `2002` Cash & Bank section.

General nominal numbering policies are initialized from adopted Sections.
The existing Finance form, category/section filtering, code allocation,
permissions and status controls continue to handle manually added accounts.

Baseline setup produces five Categories, nine Sections and fourteen ordinary
nominals, including distinct bank-charge and rounding accounts. Three Cash & Bank
definitions are persisted in the adopted template and remain unbound until the
explicit Bank/Accounting creation workflow supplies the actual bank identity.
Setup creates **no bank facilities or opening balances**.

## 5. Supplier AP and customer AR integration

The existing `finance_subledger_policy` remains the company control-account
authority. Template roles initialize its AP, AR, revenue, expense and FX mappings.
Suppliers/customers inherit those company controls; no separate control nominal
is created for each party.

Purchasing supplier creation/activation now creates its exact canonical financial
party reference automatically when company accounting is configured. It checks
both explicit supplier references and existing canonical links, so activating a
Finance-origin supplier does not create a second financial identity. The link is
recorded in immutable financial audit evidence within the supplier transaction.
Inactive or blocked onboarding and companies awaiting accounting configuration
retain their existing controlled workflows.

Customer creation already creates the canonical customer and subsidiary identity;
it now inherits the initialized AR policy. Customer credit/payment-term review
remains mandatory where the existing invoice workflow requires it.

Invoices, receipts and supplier payments continue through the existing draft,
submission, independent approval and posting paths. Existing database constraints
reconcile open-item effects with GL control-account entries. Statements, ageing,
trial balance, balance sheet and profit/loss use those same records.

## 6. Bank integration

Banking and Finance continue to share `account` identities. The existing explicit
bank-nominal creation path is used from both modules. Bank definitions can bind
once through immutable evidence, and the existing uniqueness constraints prevent
multiple bank identities for one nominal. Additional bank codes reserve the
template definitions' code range rather than consuming their codes.

Bank-section discovery, definition filtering, adoption and binding validation now
read template roles instead of assuming every template uses Section `2309`.
Tests also cover a `2002` section and the next additional code `200204`.

Payments/receipts, transfers and reconciliation retain their existing journal and
approval engines. The new setup does not invent or post bank transactions.

**Transfer/FX defaults were explicitly approved on 27 November 2026 and are now
implemented.** Setup creates the existing company policy only when absent,
mapping realized gain `400201`, realized loss `500201`, rounding `500302` and
bank charges `500301`, with rounding tolerance `0`. All four identities come
from the adopted database template. The existing policy-management permission,
account eligibility constraints, immutable policy event and platform audit chain
apply. Existing policies, tolerances and posted transfers are preserved exactly.
Older custom templates without the two optional treasury roles retain manual
Finance policy configuration. No additional migration or posting bypass is used.
See `docs/finance/business-nature-treasury-policy-proposal.md` for the approved scope.

## 7. APIs and integration boundaries

New documented endpoints:

- `GET /api/v1/finance/business_setup/natures`
- `GET /api/v1/finance/business_setup?company_id=...`
- `POST /api/v1/finance/business_setup`

Mutations require session authentication, CSRF, allowed origin, idempotency,
live Super Admin authority and the existing company/chart/nominal permissions.
Tenant identity comes from the session. Missing migration support returns a
feature-specific 503; no API-wide deployment readiness failure was introduced.

Contracts, OpenAPI and the generated frontend client changed together. No new
dependency, parallel accounting database, Next.js business API, or frontend
accounting list was introduced.

Relevant existing modules retained their shared records: Chart of Accounts,
Purchases/Suppliers, Sales/Customers, AP/AR posting and settlements, Banking,
transfers, reconciliation, GL and connected financial reports. This work does
not claim that every unrelated ERP prototype page is now live.

## 8. Verification results

| Check | Verified result |
| --- | --- |
| `npm.cmd run typecheck` | Passed |
| `npm.cmd run build:web` | Passed; production web build |
| `npm.cmd run api:check` | Passed; no generated API drift |
| `npm.cmd run test:unit -- --maxWorkers=4 --reporter=dot` | 212 files, 1,675 tests passed |
| `npm.cmd run test:contract` | 7 files, 29 tests passed |
| New PostgreSQL integration suite | 14 tests passed, including approved treasury defaults and preservation |
| Existing Bank Transfer regression rerun after treasury approval | 6 tests passed |
| Existing accounting integration regressions | 137 distinct tests passed across the initial run and focused corrected reruns |
| PostgreSQL nominal/bank security suites | 3 files, 21 tests passed with database tests enabled |
| Default `npm.cmd run test:security` | 5 passed, 58 skipped; not reported as full database security coverage |
| Chromium company setup | 6 passed: 390/834/1440 widths, light/dark, plus dialog accessibility scan |
| Changed-file ESLint | Passed after correcting four test-only unused bindings |
| Changed-source/template Prettier | Passed after formatting the new catalogue |
| Theme audit `--write` / `--check` | Passed; no new font/palette exceptions |
| `git diff --check` | Passed |
| Two independent read-only audit processes | Identical account, posted-line and balance fingerprints |

Release preparation requested by the user: `npm.cmd run build` passed again
(workspace typecheck/API and worker compilation plus the production Next.js
build). `npm.cmd run api:check` passed again, and the focused setup API unit
suite passed 4/4. Logs: `tmp/business-setup-release-build.log`,
`tmp/business-setup-release-api-check.log`, `tmp/business-setup-release-unit.log`.
The pre-existing `.env.example` edit is excluded from the release commit.

The new PostgreSQL suite verifies IT, NGO and corporate defaults; request replay;
nature replacement refusal; manual nominals; wrong-company relationship refusal;
explicit bank binding and duplicate prevention; atomic rollback; authority and
impersonation checks; automatic supplier linking; independently approved customer
and supplier invoices/settlements; GL reconciliation; posted-history preservation;
concurrent initialization; configurable bank Sections; non-bypass-role RLS; and
HTTP-to-database setup with the same Finance chart reads. The approved treasury
extension additionally verifies exact role mappings and one immutable creation
event, rollback without policy-management authority, preservation of a separately
reviewed policy on replay, preservation of a pre-existing policy during first
initialization, and an actual independently approved and posted bank transfer.

In the settlement scenario: AR outstanding `400.00`, AP outstanding `300.00`, bank
GL `400.00`, and all control reconciliation differences `0.00`. Repeating setup
left every posted journal line unchanged. Independent audit processes found eight
posted journal lines, zero missing account parents and zero invalid bank links.
The subsequent treasury transfer test moves `100.00` between two initialized
company bank nominals: source GL `300.00`, destination GL `100.00`, and control
reconciliation differences remain `0.00`. Self-approval is rejected by the
existing workflow. Initial treasury test failure was an incorrect test expectation
of HTTP 403 rather than the existing HTTP 409 rejection; corrected suite: 14/14.
Final workspace typecheck, focused ESLint, source formatting and diff checks pass.
Evidence: `tmp/business-setup-treasury-postgres-final.log`,
`tmp/business-setup-treasury-transfer-regression.log`, and
`tmp/business-setup-treasury-typecheck-final.log`.

Initial failures were retained in `tmp/` logs and investigated: an unbounded unit
run timed out and was replaced with the complete four-worker run; the OpenAPI
path snapshot needed the new endpoints; legacy currency/migration fixtures were
stale; supplier activation exposed and fixed the canonical-link regression; and
chart preview expectations were corrected to reuse an existing Category.

Evidence: `tmp/business-setup-*.log`,
`tmp/business-setup-evidence/{light,dark}-{390,834,1440}.png`, and the two
`tmp/business-setup-evidence/audit-*.json` snapshots. Browser transport fixtures
are synthetic; database and HTTP integration tests use real local PostgreSQL.

## 9. Exact database/browser test commands

Commands used local disposable databases only:

```powershell
npx.cmd cross-env TEST_BUSINESS_SETUP_DATABASE_URL=postgresql://nexora@127.0.0.1:55433/nexora_business_setup_test_v3 npx.cmd vitest run --config vitest.integration.config.ts tests/integration/business-nature-setup.test.ts

npx.cmd cross-env TEST_SOURCE_BOOTSTRAP_DATABASE_URL=postgresql://nexora@127.0.0.1:55433/nexora_business_setup_test_v3 npx.cmd vitest run --config vitest.integration.config.ts tests/integration/banking-transfers.test.ts

npx.cmd cross-env TEST_SOURCE_BOOTSTRAP_DATABASE_URL=postgresql://nexora@127.0.0.1:55433/nexora_chart_template_ct01_business_setup_test npx.cmd vitest run --config vitest.integration.config.ts tests/integration/finance-chart-templates.test.ts tests/integration/finance-chart-company-adoption.test.ts tests/integration/canonical-business-parties.test.ts tests/integration/postgres-migrations.test.ts

npx.cmd cross-env TEST_SOURCE_BOOTSTRAP_DATABASE_URL=postgresql://nexora@127.0.0.1:55433/nexora_business_setup_test_v3 npx.cmd vitest run --config vitest.security.config.ts tests/security/finance-general-nominal-database-security.test.ts tests/security/finance-nominal-database-security.test.ts tests/security/bank-account-database-security.test.ts

npx.cmd cross-env PLAYWRIGHT_BASE_URL=http://127.0.0.1:3267 PLAYWRIGHT_USE_EXISTING_WEB=true npx.cmd playwright test tests/e2e/business-setup.spec.ts --workers=1
```

The broader regression run also executed Finance general/bank nominals,
accounting integrity, multi-currency subledger, Bank payments, receipts, transfers
and reconciliation. Final focused reruns resolved the initially failing suites;
the corrected preview assertion was rerun separately with all nine tests passing.

## 10. Production completion requirements

1. Restore Railway CLI authentication with `railway login` and identify the actual
   ERP project/environment/services with its dashboard URL.
2. Inspect API/web release identity, database variable references, migration state,
   company access and the affected company's persisted accounts. Do not display
   credentials or connection strings.
3. Run `npx.cmd tsx scripts/audit-accounting-masters.ts` using secret-managed
   `DATABASE_URL` and explicit `NEXORA_AUDIT_TENANT_ID`,
   `NEXORA_AUDIT_COMPANY_ID`, `NEXORA_AUDIT_ACTOR_ID`. The script uses a read-only
   repeatable-read transaction and bounded account/journal hashing. Verify a
   recoverable production backup through the deployment platform.
4. Apply migration 0044 through the existing migration runner and deploy the
   compatible API/web release. Initialize only the reviewed company/template.
   Existing posted-company policy conflicts must be reviewed; they are not
   overwritten by the initializer.
5. Repeat the audit, compare immutable posted-line and balance fingerprints, and
   verify deployed company isolation, selection and feature workflows.
6. Restart/redeploy the actual Railway service and repeat the read-back. This
   production persistence/redeployment scenario has **not** been executed.

Follow-up on the unchanged live screenshots: Railway still returned
`invalid_grant` / `Unauthorized`; deployment has not occurred. A browser-session
fallback could not initialize because the Windows browser automation sandbox
failed. A supported Railway browserless login was started for the user to
activate. The Bank and Finance clients already narrow company directories to
the selected session company; no additional company selector was introduced.
The read-only audit now reports setup-schema availability, stored business
nature/template, persisted/active bank counts, governed Cash & Bank sections,
and unlinked nominals in those governed sections. Its local PostgreSQL check
found two active linked banks, no unlinked bank nominals and ten posted lines
after the verified transfer. This is local evidence, not a production diagnosis.

The repository's pre-existing `.env.example` edit was preserved. No environment
secret, existing production record, posted balance or legacy stylesheet was
removed or overwritten.
