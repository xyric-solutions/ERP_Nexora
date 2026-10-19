# SEC-PG-01 PostgreSQL Security Migration

The Security schema is PostgreSQL-only. It requires Platform PostgreSQL
migration 2 because every account and
policy is tenant-owned.

## Apply and inspect

Use the dedicated schema-owner credential only in the one-shot migration job:

```powershell
$env:NEXORA_DATABASE_MIGRATION_DSN = '<secret migration-owner DSN>'
nexora-platform-migrate apply
nexora-security-migrate apply
nexora-security-migrate status
```

The runtime application role must not own tables, bypass row-level security,
or run migrations. Grant it only the table operations required by the API.

## Controls

- normalized tenant-composite keys and constrained identity/policy values;
- PBKDF2 verifier bytes only, never plaintext passwords;
- forced tenant row-level security on every Security table;
- per-tenant advisory serialization for the immutable audit hash chain;
- update/delete trigger denial on audit evidence;
- advisory-locked, idempotent migration execution;
- populated-data rollback refusal across every tenant.

Rollback requires both the CLI confirmation flag and an empty Security schema.
After data exists, use a reviewed forward correction or restore procedure.

## Verification

```powershell
python scripts/verify_postgres_security.py
python scripts/verify.py unit integration contract security e2e migration
```

The focused test provisions separate migration/application roles and verifies
RLS, cross-tenant denial, concurrent audit sequencing, immutability, password
login, session tenant binding, PostgreSQL RBAC, and preservation-safe rollback.
