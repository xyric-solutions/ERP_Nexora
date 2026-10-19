# WF-PG-01 PostgreSQL Workflow Migration

The production Workflow schema depends on Platform migration 2 and Security
migration 1. Apply it after both foundations and before HR so configured HR
approval matrices can share the same PostgreSQL transaction and audit store.

## Apply and inspect

Use only the dedicated schema-owner credential in the one-shot migration job:

```powershell
$env:NEXORA_DATABASE_MIGRATION_DSN = '<secret migration-owner DSN>'
nexora-platform-migrate apply
nexora-security-migrate apply
nexora-workflow-migrate apply
nexora-workflow-migrate status
```

The runtime application role must not own tables, bypass row-level security,
or run migrations. Grant only the table operations required by the API.

## Controls

- tenant-composite keys and references across definitions, instances, and actions;
- one active definition per tenant/module/trigger/version set;
- one pending approval per source record;
- forced tenant row-level security on every Workflow table;
- row locking for decision serialization;
- append-only, ordered approval actions with mandatory rejection reasons;
- transaction sharing with Platform, Security audit, and configured HR actions;
- advisory-locked idempotent migration execution;
- populated-data rollback refusal.

Rollback requires both the CLI confirmation flag and an empty Workflow schema.
After approval evidence exists, use a reviewed forward correction or restore.

## Verification

```powershell
python scripts/verify_postgres_workflow.py
python scripts/verify.py unit integration contract security e2e migration
```

The focused gate provisions separate schema-owner and application roles and
verifies forced RLS, cross-tenant denial, concurrent decision safety,
append-only action history, setup activation rollback, configured multi-level
HR approval, and audit-failure rollback.
