# Debug session: replace synthetic Bank dropdown nominal with approved catalogue

## Symptoms

- Expected: Bank Payment and Bank Receipt nominal selectors expose the genuine
  business Chart of Accounts supplied by the user and already reviewed in this
  repository.
- Actual: both selectors expose only
  `UAT-EXPENSE-000001 - Bank Payments and Receipts`, a synthetic local-UAT
  placeholder created during the preceding repair.
- Error: no UI or API error; the directory is faithfully returning the only
  eligible ordinary nominal in the current database.
- Timeline: introduced by the 2026-10-27 local post-merge repair.

## Authoritative source and approved boundary

- Canonical manifest:
  `packages/db/catalogs/approved-chart-20261020.json`.
- Provenance: catalogue key `nexora-standard-coa`, revision `2026-10-20-v1`,
  source file `chart-of-accounts-review.xlsx`, source SHA-256
  `f9d5a2a7772575e1e5fe98927d4da0939f949611f8596107a1206eea381ac85a`.
- The supplied review artefacts remain under
  `outputs/coa-visual-transcription-20261020/`; they contain the workbook and
  category, section, nominal, source-row and review-issue exports.
- Mechanical manifest verification: 14 categories, 78 sections and 234 nominal
  definitions. Seven definitions under section `2309` are Bank references, not
  ordinary Payment/Receipt offsets. The other 227 are ordinary definitions.
- `docs/architecture/nominal-catalog-import-review.md` records the later business
  review: 131 ordinary definitions were explicitly classified `ordinary` and
  activated; 96 account-specific ownership/applicability/label exceptions were
  intentionally left `review_required` and inactive. A mechanical comparison of
  that 96-row table with the manifest found zero missing codes and zero code/name
  mismatches; its complement is exactly the approved 131-account set.
- The same review explicitly records `711301 - Subscriptions` as selectable in
  both Bank screens. The prior result was 131 eligible, 96 pending review, four
  unrelated inactive profiles and 20 protected leaves.

## Current database evidence (read-only)

Target inspected:
`postgresql://nexora@127.0.0.1:55433/nexora_postmerge_service`, tenant
`nexora-r06-uat`, company `nexora-r06-uat-company`.

- `finance_chart_template`: zero rows for the tenant.
- `finance_chart_company_adoption`: zero rows for the company.
- `finance_chart_company_node`: zero rows for the company.
- Company `account`: 16 total rows, zero six-digit catalogue codes, one active
  manually postable ordinary leaf.
- That sole eligible leaf is
  `nominal-2c4f1b13-b894-4139-b993-032e594e9c58`, code
  `UAT-EXPENSE-000001`, name `Bank Payments and Receipts`. It is active in both
  `account` and `finance_general_nominal`, has no source catalogue mapping, and
  is not a Bank/control account.
- Placeholder dependencies: one general profile, two immutable nominal events
  and one immutable direct-CoA change; zero journal lines, zero Payment lines,
  zero Receipt lines, zero company-chart mappings, zero children and zero Bank
  mappings.
- The current governed Bank hierarchy is still the pre-Excel form:
  `r06-uat-bn-section`, code `UAT-BN-CB`, name `Cash & Bank`; its allocator is
  prefix `UAT-BN-`, width 6, next value 2, version 2. Catalogue adoption must not
  bypass the repository's explicit hierarchy alignment for section `2309`.
- The live Super Admin already has tenant/company-scoped template read/admin,
  adoption, classification, nominal read and nominal status permissions. No
  permission or identity provisioning belongs in this correction.
- Host `pg_dump`/`pg_restore` are not on `PATH`; the active database is the
  `postgres:18.1-alpine` container `nexora-test-postgres-1`, which has the
  version-matched tools needed for the required verified custom-format backup.

## Root cause

The post-merge database was freshly migrated and received only the narrow Bank
hierarchy/general-section UAT setup. The previously approved central template,
company adoption and 131 reviewed activations were business data in the older
database; schema migrations correctly did not recreate them. The preceding
repair misdiagnosed missing master data as needing one replacement nominal and
created a semantic placeholder. Payment and Receipt correctly share
`readBankNominalDirectory`, so both display that same incorrect record.

## Safe correction plan

1. Take and verify a new custom-format backup of the active post-merge database.
   Snapshot Finance/Bank/HR counts and financial-table fingerprints before any
   business-data mutation.
2. Import and publish the canonical manifest through the normal authenticated
   API using `scripts/import-chart-template.ts`. Verify exactly 14/78/234 and the
   expected catalogue key, revision and source hash. Do not restore catalogue
   tables directly from the old dump.
3. Build a reviewed hierarchy request for the newly imported template ID and the
   current exact section/policy facts (`r06-uat-bn-section`, `UAT-BN-CB`, policy
   version 2). Run the existing guarded `finance:migrate-bank-hierarchy`
   maintenance workflow after narrowly extending its local-database allow-list to
   the repository's `postmerge` convention. Preserve the section/account IDs and
   histories; align the section to code `2309`, name `Cash and Bank`, allocator
   prefix `2309`, width 2 and next value 8, reserving `230901`-`230907`.
4. Request a fresh authenticated company preview for
   `nexora-r06-uat-company`. Continue only when it is unblocked with zero
   conflicts and shows 227 ordinary drafts plus seven Bank references. Adopt via
   `POST /api/v1/finance/chart_templates/:templateId/company_adoption` with its
   current preview hash, quoted template version and idempotency key.
5. Reconstruct the already-approved 131 set as: all 227 non-`2309` manifest
   definitions minus the exact 96 exception codes in the current review document.
   Before each write, re-read and match ID/code/name/type/category/section,
   current versions and source mapping. For each selected account, use the normal
   classification endpoint with `ordinary`, an explicit review reason, quoted
   version and stable per-code idempotency key; then use the normal nominal status
   endpoint to activate its fresh version. Resume safely by re-reading state and
   skipping completed records. Do not activate the 96 review exceptions or bind
   the seven Bank references as ordinary accounts.
6. Retire the synthetic placeholder last, through the normal Super Admin nominal
   status endpoint (`deactivate`, expected version 2, reason and idempotency key).
   Do not delete it: database triggers intentionally forbid deletion of governed
   general nominal history, and it already has immutable audit events. Inactive
   state removes it from both selectors while preserving truthful correction
   evidence.
7. Verify 131 eligible genuine catalogue nominals, 96 pending review, the
   expected protected/inactive counts, and zero eligible occurrence of the
   placeholder. Search/select representative codes (including `711301`) in both
   Payment and Receipt. Confirm no Payment, Receipt, journal, balance or HR record
   was created/changed and compare the pre/post fingerprints.

## Safety notes

- Do not run the broad Payment/Receipt provisioners; they create unrelated
  identities, calendars, periods and Bank fixtures.
- Do not use `tmp/recovered-hr-work` installers or copy old active tables over the
  merged database.
- Do not classify the 96 documented exceptions merely to make them visible.
- The API directories are bounded to 100 rows; the complete 131 are available by
  server-side code/name search even though only the first 100 load initially.
- No database or application mutation was performed during this investigation.

## Resolution — 2026-10-27

Resolved against `nexora_postmerge_service` using the approved catalogue and the
previously recorded account-level review decision.

- Imported and published template
  `chart-b4d1eccd-98fc-4955-9032-26d6def6f278`: 14 categories, 78 sections and
  234 nominal definitions.
- Created and verified a PostgreSQL custom-format backup before hierarchy and
  adoption changes:
  `tmp/coa-restore-20261027/before-reviewed-catalog-restore.dump`, 2,676,524
  bytes, 3,729 TOC lines, SHA-256
  `BBF47A4F07EEDD37054616EAAE4922069E528D60903FF5BFDAC424168C010752`.
- Applied reviewed Bank hierarchy maintenance
  `chart-maintenance-26203481-95d1-4ef6-be8c-1a40a484596b`. It aligned the
  existing section/policy to `2309` while preserving identities and created no
  nominal or financial posting.
- The authenticated company preview was unblocked with zero conflicts, 227
  ordinary drafts and seven Bank references. Adoption
  `chart-adoption-9ad767b4-f293-4a53-80cb-02f643547bd3` created the 227 drafts
  and matched the two reviewed headers.
- Mechanically matched the exact 96 exception codes/names in this document to
  the approved manifest; their complement was exactly 131. All 131 were
  classified `ordinary` and activated through CSRF/origin/version/idempotency-
  protected APIs. The 96 exceptions remain `review_required` and inactive; the
  seven Bank references remain references.
- Deactivated the incorrect `UAT-EXPENSE-000001 - Bank Payments and Receipts`
  placeholder through the normal status API. It was not deleted because its
  immutable audit history is retained.
- Both authenticated Bank directories now report 131 eligible, 96 pending
  review, one inactive and three protected leaves; the default response is
  correctly bounded to 100 items. Search returns `711301 - Subscriptions` in
  both Payment and Receipt.
- Headless Chromium selected `711301 - Subscriptions` in both forms, found no
  placeholder option and observed no HTTP errors.

## Status

Resolved and verified.
