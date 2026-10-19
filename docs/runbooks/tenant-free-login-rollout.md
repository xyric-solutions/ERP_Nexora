# Tenant-Free Login Rollout

This runbook applies only to the Nexora TypeScript web application. Migration 7
is additive and does not delete or rewrite accounts, credentials,
authorization, sessions, or historical audit data.

## Prerequisites

- Back up and verify the target PostgreSQL database.
- Deploy one stable, high-entropy `AUTH_LOGIN_DIRECTORY_SECRET` through the
  approved secret manager. It must differ from session and throttle secrets.
- Use the migration-owner URL for migration and backfill. Never expose either
  value to the browser or command output.
- Keep the previous API and web artifacts available for rollback.

## Ordered rollout

1. Run `npm run db:migrate:source` with `DATABASE_URL` set to the migration
   connection. Confirm the security migration ledger is at version 7.
2. Run `npm run auth:backfill-login-directory` with the migration URL and login
   directory secret.
3. Review examined, inserted, updated, unchanged, skipped, and conflict counts.
   Stop on any skipped record, conflict, secret mismatch, or unexpected count.
4. Run the backfill again. It must report zero inserted/updated rows for an
   unchanged source.
5. Verify direct directory table access is denied to the runtime application
   role and the restricted resolver function is executable.
6. Deploy the matching API and web artifacts together. Do not deploy only one
   side of the changed login contract.
7. Verify readiness, single-membership login, multi-membership selection,
   session restore, logout, and direct unauthorized API denial.

## Controlled C4 UAT provisioning

Only against the isolated non-production C4 database, set
`NEXORA_ENVIRONMENT=uat`, `NEXORA_UAT_CONFIRM=nexora-r06-uat`,
`NEXORA_UAT_PASSWORD` from an approved temporary secret source,
`AUTH_LOGIN_DIRECTORY_SECRET`, and the migration-owner `DATABASE_URL`. Then run
`npm run uat:provision-c4-auth`.

The command is idempotent, does not print the password, and does not replace an
existing credential. It provisions only the controlled synthetic R06 identities
and one restricted second membership used to exercise organization selection.

## Rollback

Roll back the API and web artifacts together. Leave migration 7 and its
directory rows in place; the earlier tenant-aware implementation does not use
them. Do not drop tables, delete directory data, rotate the directory secret,
or clean Docker volumes as part of rollback.
