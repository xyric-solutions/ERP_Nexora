# Governed User Management Rollout

## Scope and authority

Security migration 8 and the company-access compatibility backfill are
additive. Existing normalized role assignments and role scopes remain the
authorization authority. `security_user_company_access` must remain a shadow
boundary until a separate activation decision is approved after parity and
manual acceptance.

## Prerequisites

- Use the migration-owner PostgreSQL connection.
- Take and verify the environment's normal database backup before production
  execution.
- Apply the complete production migration chain through security version 8.
- Keep application writers available only if normal serializable retry handling
  is operational; the backfill obtains a dedicated transaction advisory lock.
- Never run this command with an application-role connection.

## Execute

Set `DATABASE_URL` through the approved secret-management mechanism, then run:

```powershell
npm.cmd run auth:backfill-user-company-access
```

The command performs the compatibility backfill and then a shadow parity read.
It returns count-only backfill statistics plus mismatch identifiers. It exits
with code `2` when any shadow mismatch exists.

## Interpretation

- `inserted`: traceable compatibility rows created in this run.
- `updated`: always zero; history is never rewritten.
- `unchanged`: existing active rows already matching the derived projection.
- `skipped`: active users for whom no safe company projection was derived.
- `ambiguousDefaults`: multi-company users without one unambiguous employee
  company; no default is guessed.
- `conflicts`: invalid company scopes, non-company-safe record scopes,
  ambiguous owner scopes, or conflicts with retained governed rows.
- `missing_normalized_access`: mapping issue; the shadow path would deny access
  currently present in the role-scope projection.
- `excess_normalized_access`: security issue; the normalized boundary contains
  access not present in the role-scope projection.

Any non-zero mismatch or conflict blocks activation. Do not repair results by
editing or deleting retained rows. Diagnose and resolve the source governance
data through an approved administration workflow.

## Safety and rollback

The backfill runs in one serializable transaction, uses deterministic IDs, and
restores forced row-level security before commit. A failure rolls the entire
run back. Re-running is safe and does not create duplicate active grants or
defaults.

Application rollback does not require destructive database rollback. Leave
the additive columns, tables, and compatibility evidence in place and keep the
existing role-scope read path authoritative.

## Activation gate

Do not enforce `security_user_company_access` on production requests until all
of the following are separately approved:

1. zero security-sensitive shadow mismatches;
2. all ambiguous and skipped identities reviewed;
3. PostgreSQL, concurrency, security, regression, and performance gates pass;
4. controlled synthetic UAT and manual acceptance pass;
5. an explicit production activation and rollback plan is approved.
