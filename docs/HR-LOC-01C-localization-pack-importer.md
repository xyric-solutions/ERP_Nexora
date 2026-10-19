# Controlled localization-pack validator/importer

HR-LOC-01C provides Nexora's offline publication boundary for versioned,
effective-dated HR/payroll localization packs. It does not expose an HTTP API,
activate a company, resolve employee jurisdiction, or execute statutory rules.
No real-country pack ships with this release. The committed `XX` fixtures are
synthetic and the importer permits them only when `NEXORA_ENVIRONMENT=test`.

## Artifact contract

Each pack version is a directory:

```text
<pack-key>/<version>/
|- manifest.json
|- sources.json
|- rules/<rule-key>.json
`- test-vectors/<rule-key>.json
```

The parser accepts UTF-8 JSON only, rejects duplicate keys, symbolic links,
unexpected files, floating-point literals, excessive size/nesting, executable
hooks, unknown fields, and unsupported schema versions. Numeric statutory
values use decimal strings. `safe_formula` is an allow-listed arithmetic AST;
function calls, imports, attributes, indexing, and undeclared variables are
forbidden.

The manifest records a system-scoped pack, target country/jurisdiction,
effective range, exact parent-version dependencies, `approved` lifecycle
intent, reviewer/approver separation, and canonical SHA-256 hashes. Sources
require authority, publication/retrieval dates, an official reference, and a
document hash. Every executable rule requires positive, boundary, and
non-applicable reviewed vectors.

Hashes are computed over canonical JSON (UTF-8, sorted keys, compact separators):

- each rule/vector carries its own content hash;
- `source_manifest_hash` covers `sources.json`;
- `content_hash` covers the ordered rule and vector documents;
- `files` covers every canonical artifact document except `manifest.json`;
- `artifact_hash` covers the manifest with only `artifact_hash` omitted.

## PostgreSQL publisher boundary

Apply Platform migration 3 and HR migrations through version 7 first. Create a
dedicated login outside Nexora's application runtime. It must not be a
superuser, database owner, RLS bypass role, object creator, or member of another
role. Do not reuse the application or migration credential.

```sql
CREATE ROLE nexora_localization_publisher
LOGIN PASSWORD '<secret-from-approved-secret-store>'
NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
```

Register it with the one-shot migration credential:

```powershell
$env:NEXORA_DATABASE_MIGRATION_DSN = '<migration-owner-postgresql-dsn>'
nexora-localization-pack register-publisher --role nexora_localization_publisher
```

Registration fails if the role already has any privilege outside the approved
global catalogs. It grants global reference/pack/rule reads and insert-only
access to pack, version, dependency, rule, vector, and immutable release
evidence. It grants no tenant HR/payroll access and no update/delete privilege.
The normal API runtime never receives `NEXORA_LOCALIZATION_PUBLISHER_DSN`.

## Validate, dry-run, and import

Offline validation needs no credential:

```powershell
nexora-localization-pack validate <bundle-directory> --report <new-report.json>
```

Database-aware dry-run and import use only the publisher credential:

```powershell
$env:NEXORA_ENVIRONMENT = 'test' # synthetic fixtures only
$env:NEXORA_LOCALIZATION_PUBLISHER_DSN = '<publisher-postgresql-dsn>'
nexora-localization-pack dry-run <bundle-directory> --report <new-dry-run-report.json>
nexora-localization-pack import <bundle-directory> --report <new-import-report.json>
```

The report path must not already exist. Dry-run verifies controlled references,
pack identity, exact approved dependencies, ancestry, effective coverage,
cycles, overlaps/supersession, and identifier collisions without writing.
Import repeats validation under a serializable advisory-locked transaction,
writes the approved version and immutable release evidence atomically, and is
idempotent by artifact hash.

`NEXORA_LOCALIZATION_PRODUCTION_IMPORT_ENABLED` defaults to false. Enabling it
is a deployment control, not legal approval. Q-007 must still be closed with
approved legal ownership, sources, and vectors before any real statutory pack;
Q-010 must be closed before reference-driven company setup or activation. The
01C importer never writes country/jurisdiction reference rows and never creates
`company_localization_activation` records.

To revoke the credential:

```powershell
nexora-localization-pack revoke-publisher --role nexora_localization_publisher
```

Clean migration rollback requires an empty publisher registry and no release
evidence. Once a pack is published, rollback intentionally refuses evidence
deletion; use a reviewed forward correction/supersession instead.
