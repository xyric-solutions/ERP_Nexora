# Excel-aligned company Bank hierarchy migration

Status: written scope approved for implementation on 2026-10-20. Implemented,
isolated-tested and applied to existing local R06 UAT; see the delivery checklist
for exact execution evidence. Company nominal adoption/activation remains separate.
Supersedes the earlier suggestion to retain UAT-BN-CB as the business section
code. The supplied Excel catalog remains authoritative.

## Scope and observed baseline

- Existing test destination only: tenant nexora-r06-uat, company
  nexora-r06-uat-company (Nexora R06 UAT Company). No new business company.
- Canonical source is the reviewed workbook manifest
  packages/db/catalogs/approved-chart-20261020.json, source SHA-256
  f9d5a2a7772575e1e5fe98927d4da0939f949611f8596107a1206eea381ac85a.
  Preserve its 14 category labels, 78 section codes/names and 234 nominal codes/names.
- Read-only source SQL confirmed category r06-uat-bn-category, section
  r06-uat-bn-section, and seven managed Bank nominals UAT-BN-000001 through
  UAT-BN-000007. Six are inactive, one active; no journal lines reference these
  seven accounts at this checkpoint. This does not prove no other dependencies.
- Finance 0001 protects account codes. Finance 0009 additionally protects Bank
  identities and section policy identities. Existing migrations must not be edited,
  triggers disabled, or application-wide identity guards weakened.

## Chosen design

Use an explicit, audited maintenance operation to change the existing section's
business code to 2309 and its name to Cash and Bank, retaining its account ID,
parent/category ID and every Bank account reference. Keep the existing Current
Assets category identity; categories have no workbook business code, so its
internal identifier is not presented as an Excel-supplied category number.

Preserve existing Bank nominal IDs, names, codes, currencies and lifecycle states.
They are pre-existing test records, NOT inferred matches to workbook Bank codes
230901 through 230907. Reserve those seven source codes for their actual workbook
definitions and explicit Bank setup; never rename synthetic accounts into unrelated
business banks. A subsequent code-change request for existing nominal leaves
requires a reviewed per-account old/new mapping, not positional or name-only matching.

For future Bank creation, use the reviewed section-based six-digit format
2309 + two-digit suffix. Reserve 01 through 07 for the workbook definitions;
allocation starts at 08 or the first greater available suffix after a locked
collision check. Fail clearly on exhaustion; do not wrap or reuse numbers.
Historical UAT codes remain traceable and are not newly allocated.

Alternatives rejected: retaining the old business section code fails the user's
Excel requirement; deleting/recreating accounts risks lost references/history;
assigning the seven existing records to seven workbook banks invents identity.

## Guarded implementation boundary

Finance 0014 adds immutable maintenance evidence only. Schema
installation must not automatically mutate every company. Introduce immutable
maintenance evidence and a narrowly privileged, transactional maintenance path
for the exact reviewed before/after section and policy changes. Ordinary API/DB
clients must still be unable to change account codes or policy identities.

An arbitrary session variable, caller-supplied actor ID or boolean override is
not sufficient authority. The implementation must establish a database privilege
boundary unavailable to the runtime application role, an exact allowlist of
permitted fields/targets, and durable evidence linked to the authenticated
operator and published source revision. No broad reusable identity bypass.

The operation locks the company adoption scope, category, section, policy and
affected accounts; rechecks expected versions, source hash, tenant/company,
code uniqueness, active currency and all dependencies; captures before images;
updates section and numbering policy atomically; records immutable evidence;
and revalidates final hierarchy/Bank invariants before commit. Any mismatch
rolls back the whole transaction. Replays return prior evidence without writes.

No Bank approval, financial posting, opening balance, currency creation, fiscal
period opening, HR change or historical event rewrite is part of this operation.
Company chart adoption remains a separate governed operation after this blocker
is resolved. Control-account classification remains required before activation.

## Verification and rollback

1. Take and verify a local database backup; record the current migration ledger
   and dependency/count/hash snapshot without sensitive Bank data in reports.
2. Implement and test against the isolated chart-template database first.
3. Test wrong tenant/company, missing privilege, spoofed maintenance context,
   unexpected before images, occupied 2309/source codes, allocator exhaustion,
   concurrent creation/adoption, replay and transaction failure/rollback.
4. Verify unchanged account IDs, parent IDs, Bank mappings, statuses, transactions,
   journals and immutable history. Verify direct ordinary SQL identity updates
   remain rejected after maintenance, including another company.
5. Run migration-integrity, Finance/Bank integration/security regressions,
   contract consistency, typecheck, lint, production web build and whitespace.
6. Apply only to the explicit existing local test company after written-design
   review; verify through fresh authenticated API reads and Bank/CoA browser flows.

Before commit, rollback is transactional. After commit, no automatic down-script
or deletion of audit evidence: a compensating maintenance operation is permitted
only after a fresh dependency/version check and only if no subsequent allocations
or business changes make reversal unsafe. Otherwise retain the migrated state
and perform a separately reviewed forward correction. Whole-DB restore is a
last resort requiring explicit approval because it can discard unrelated work.

## Completion and handoff

This document prepares the requested migration; it does not complete CT-03/04.
The implementation uses transaction-local exact-before/after exceptions in the
two existing guard definitions, installed by a database super-administrator only.
The original definitions are restored byte-for-byte before commit; exceptions
are never committed. Transaction rollback also rolls back function DDL. No
trigger is disabled, no new bypass function/API is deployed, and ordinary SQL
updates remain rejected. This avoids a permanently installed maintenance bypass.
The authenticated CLI checks normal API identity/company access; the database
operation independently rechecks live permission, role, company access and source.
The database operator is privileged/trusted and recorded, not caller-selected
application authority. Production runtime must use a non-owner, non-superuser
database role; this operational command is restricted to explicit local databases.

Next: company template mappings, governed draft adoption and posting classification,
then explicit Bank setup/activation and accounting acceptance.
Do not report all company nominals usable from central template persistence alone.
